const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

function optionalLearningAuth(req, res, next) {
  if (req.headers.authorization !== undefined) {
    return requireAuth(req, res, next);
  }

  return next();
}

async function requireUnlockedTopic(req, res, next) {
  const rawTopicId = req.params.topicId;
  const topicId = Number(rawTopicId);

  if (
    !/^[1-9]\d*$/.test(rawTopicId) ||
    !Number.isSafeInteger(topicId)
  ) {
    return res.status(400).json({
      error: "Invalid topic ID.",
    });
  }

  try {
    const [rows] = await db.execute(
      `
        SELECT
          lt.id,
          lt.subject_id,
          lt.order_index,
          lt.title,
          lt.content,
          lt.starter_code,

          ss.name AS subject_name,
          ss.language AS subject_language,
          ss.execution_mode,
          ss.default_language,
          ss.editor_enabled,
          ss.run_enabled,
          ss.editor_message

        FROM learn_topics AS lt
        INNER JOIN learning_courses AS ss
          ON ss.id = lt.subject_id

        WHERE lt.id = ?
          AND lt.status = 'published'
          AND COALESCE(ss.is_placeholder, 0) = 0
          AND ss.is_active = 1

        LIMIT 1
      `,
      [topicId],
    );

    if (!rows.length) {
      return res.status(404).json({
        error: "Lesson not found or unavailable.",
      });
    }

    const topic = rows[0];
    const userId = req.user?.userId ?? null;

    const [missingPrerequisites] = await db.execute(
      `
        SELECT
          previous.id,
          previous.title
        FROM learn_topics AS previous

        WHERE previous.subject_id = ?
          AND previous.status = 'published'
          AND (
            previous.order_index < ?
            OR (
              previous.order_index = ?
              AND previous.id < ?
            )
          )
          AND NOT EXISTS (
            SELECT 1
            FROM topic_progress AS progress
            WHERE progress.topic_id = previous.id
              AND progress.user_id = ?
          )

        ORDER BY previous.order_index ASC, previous.id ASC
        LIMIT 1
      `,
      [
        topic.subject_id,
        topic.order_index,
        topic.order_index,
        topic.id,
        userId,
      ],
    );

    if (missingPrerequisites.length) {
      const prerequisite = missingPrerequisites[0];

      return res.status(userId === null ? 401 : 403).json({
        error:
          userId === null
            ? "Please log in and complete earlier lessons first."
            : `Complete "${prerequisite.title}" before opening this lesson.`,
        code: "LESSON_LOCKED",
        prerequisite_topic_id: prerequisite.id,
      });
    }

    req.learningTopic = topic;

    return next();
  } catch (err) {
    console.error("Learning prerequisite check error:", err);

    return res.status(500).json({
      error: "Unable to check lesson access.",
    });
  }
}

// List independent courses. Placeholders remain visible as coming soon.
router.get("/subjects", async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT id, name, language, description, is_placeholder,
             execution_mode, default_language, editor_enabled,
             run_enabled, editor_message
      FROM learning_courses
      WHERE is_active = 1
      ORDER BY name ASC, id ASC
    `);
    return res.json(rows);
  } catch (error) {
    console.error("Learning course list error:", error);
    return res.status(500).json({ error: "Unable to load learning courses." });
  }
});

// Public lesson list, with personal progress for authenticated requests
router.get(
  "/subjects/:subjectId/topics",
  optionalLearningAuth,
  async (req, res) => {
    const rawSubjectId = req.params.subjectId;
    const subjectId = Number(rawSubjectId);

    if (
      !/^[1-9]\d*$/.test(rawSubjectId) ||
      !Number.isSafeInteger(subjectId)
    ) {
      return res.status(400).json({
        error: "Invalid subject ID.",
      });
    }

    const userId = req.user?.userId ?? null;

    try {
      const [rows] = await db.execute(
        `
          SELECT
            lt.id,
            lt.subject_id,
            lt.order_index,
            lt.title,
            CASE
              WHEN tp.id IS NOT NULL THEN 1
              ELSE 0
            END AS completed

          FROM learn_topics AS lt
          INNER JOIN learning_courses AS ss
            ON ss.id = lt.subject_id
          LEFT JOIN topic_progress AS tp
            ON tp.topic_id = lt.id
            AND tp.user_id = ?

          WHERE lt.subject_id = ?
            AND lt.status = 'published'
            AND COALESCE(ss.is_placeholder, 0) = 0
            AND ss.is_active = 1

          ORDER BY lt.order_index ASC, lt.id ASC
        `,
        [userId, subjectId],
      );

      return res.json(rows);
    } catch (err) {
      console.error("GET learning topics error:", err);

      return res.status(500).json({
        error: "Failed to fetch topics.",
      });
    }
  },
);

// GET a published lesson after checking prerequisites
router.get(
  "/topics/:topicId",
  optionalLearningAuth,
  requireUnlockedTopic,
  (req, res) => {
    return res.json(req.learningTopic);
  },
);

// POST mark an unlocked lesson complete only after its practice is solved.
router.post(
  "/topics/:topicId/complete",
  requireAuth,
  requireUnlockedTopic,
  async (req, res) => {
    const topicId = req.learningTopic.id;
    const userId = req.user.userId;
    let connection;

    try {
      connection = await db.getConnection();
      await connection.beginTransaction();

      // Serialize completion attempts for this lesson.
      const [topics] = await connection.execute(
        "SELECT id FROM learn_topics WHERE id = ? FOR UPDATE",
        [topicId],
      );

      if (!topics.length) {
        await connection.rollback();
        return res.status(404).json({ error: "Lesson not found." });
      }

      // Match the practice-list policy: public linked problems, and only
      // Accepted non-contest submissions by the authenticated user count.
      const [unsolvedProblems] = await connection.execute(
        `
        SELECT DISTINCT p.id, p.title
        FROM learning_topic_problems AS ltp
        INNER JOIN problems AS p ON p.id = ltp.problem_id
        WHERE ltp.topic_id = ?
          AND p.is_public = 1
          AND NOT EXISTS (
            SELECT 1
            FROM submissions AS submission
            WHERE submission.problem_id = p.id
              AND submission.user_id = ?
              AND submission.verdict = 'Accepted'
              AND submission.contest_id IS NULL
          )
        ORDER BY p.id ASC
        `,
        [topicId, userId],
      );

      if (unsolvedProblems.length > 0) {
        await connection.rollback();
        return res.status(409).json({
          error: "Solve all related practice problems with an Accepted verdict before marking this lesson complete.",
          code: "LESSON_PRACTICE_INCOMPLETE",
          topic_id: topicId,
          remaining_count: unsolvedProblems.length,
          unsolved_problems: unsolvedProblems,
        });
      }

      await connection.execute(
        `
        INSERT INTO topic_progress (user_id, topic_id)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE id = id
        `,
        [userId, topicId],
      );

      await connection.commit();
      return res.json({
        topic_id: topicId,
        completed: true,
        message: "Topic marked as complete.",
      });
    } catch (err) {
      if (connection) {
        await connection.rollback().catch(() => {});
      }
      console.error("Complete learning topic error:", err);
      return res.status(500).json({ error: "Failed to mark topic complete." });
    } finally {
      connection?.release();
    }
  },
);

// GET progress summary for a subject
router.get("/subjects/:subjectId/progress", async (req, res) => {
  try {
    const { subjectId } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.json({
        completed: 0,
        total: 0,
      });
    }

    const [[{ total }]] = await db.query(
      `
        SELECT COUNT(*) AS total
        FROM learn_topics
        WHERE subject_id = ?
      `,
      [subjectId],
    );

    const [[{ completed }]] = await db.query(
      `
        SELECT COUNT(*) AS completed
        FROM topic_progress AS tp
        INNER JOIN learn_topics AS lt
          ON tp.topic_id = lt.id
        WHERE lt.subject_id = ?
          AND tp.user_id = ?
      `,
      [subjectId, userId],
    );

    return res.json({
      completed,
      total,
    });
  } catch (err) {
    console.error("GET /subjects/:subjectId/progress error:", err);

    return res.status(500).json({
      error: "Failed to fetch progress",
    });
  }
});

// Practice problems for an accessible lesson.
// Only public problems are returned.
// Solved means an Accepted non-contest submission by the current user.
router.get(
  "/topics/:topicId/practice-problems",
  optionalLearningAuth,
  requireUnlockedTopic,
  async (req, res) => {
    try {
      const topicId = req.learningTopic.id;
      const userId = req.user?.userId ?? null;

      const [rows] = await db.execute(
        `
          SELECT
            p.id,
            p.title,
            p.difficulty,
            ltp.order_index,
            EXISTS (
              SELECT 1
              FROM submissions AS submission
              WHERE submission.problem_id = p.id
                AND submission.user_id = ?
                AND submission.verdict = 'Accepted'
                AND submission.contest_id IS NULL
            ) AS solved
          FROM learning_topic_problems AS ltp
          INNER JOIN problems AS p
            ON p.id = ltp.problem_id
          WHERE ltp.topic_id = ?
            AND p.is_public = 1
          ORDER BY ltp.order_index ASC, p.id ASC
        `,
        [userId, topicId],
      );

      const problems = rows.map((row) => ({
        ...row,
        solved:
          userId === null
            ? null
            : Boolean(Number(row.solved)),
      }));

      return res.json({
        topic_id: topicId,
        authenticated: userId !== null,
        total: problems.length,
        solved_count:
          userId === null
            ? null
            : problems.filter((problem) => problem.solved).length,
        problems,
      });
    } catch (error) {
      console.error("Student lesson practice error:", error);

      return res.status(500).json({
        error: "Unable to load lesson practice problems.",
      });
    }
  },
);

module.exports = router;