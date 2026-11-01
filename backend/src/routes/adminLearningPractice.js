const express = require("express");
const db = require("../db");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { writeAuditLog } = require("../utils/auditLog");

const router = express.Router();
const MAX_PROBLEMS = 100;

router.use(requireAuth, requireAdmin);

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function routeId(value, label) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw fail(400, `Invalid ${label}.`);
  }

  const id = Number(value);

  if (!Number.isSafeInteger(id) || id > 2147483647) {
    throw fail(400, `Invalid ${label}.`);
  }

  return id;
}

function bodyFields(body, fields) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((field) => !fields.includes(field))
  ) {
    throw fail(400, `Provide only: ${fields.join(", ")}.`);
  }
}

function positiveId(value) {
  return (
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= 2147483647
  );
}

function sendError(res, error) {
  if (error.status >= 400 && error.status < 500) {
    return res.status(error.status).json({ error: error.message });
  }

  if (
    error.code === "ER_LOCK_DEADLOCK" ||
    error.code === "ER_LOCK_WAIT_TIMEOUT"
  ) {
    return res.status(409).json({
      error: "The practice list is being changed. Refresh and retry.",
    });
  }

  if (error.code === "ER_DUP_ENTRY") {
    return res.status(409).json({
      error: "This problem is already attached to the lesson.",
    });
  }

  console.error("Learning practice management error:", error);

  return res.status(500).json({
    error: "Unable to complete the practice-problem request.",
  });
}

async function withTopic(topicId, callback) {
  const connection = await db.getConnection();
  let started = false;

  try {
    await connection.beginTransaction();
    started = true;

    const [topics] = await connection.execute(
      `
        SELECT id, title, subject_id
        FROM learn_topics
        WHERE id = ?
        FOR UPDATE
      `,
      [topicId],
    );

    if (!topics.length) {
      throw fail(404, "Lesson not found.");
    }

    const result = await callback(connection, topics[0]);

    await connection.commit();
    started = false;

    return result;
  } catch (error) {
    if (started) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Practice rollback error:", rollbackError);
      }
    }

    throw error;
  } finally {
    connection.release();
  }
}

async function practiceRows(executor, topicId) {
  const [rows] = await executor.execute(
    `
      SELECT
        p.id,
        p.title,
        p.difficulty,
        p.is_public,
        ltp.order_index
      FROM learning_topic_problems AS ltp
      INNER JOIN problems AS p
        ON p.id = ltp.problem_id
      WHERE ltp.topic_id = ?
      ORDER BY ltp.order_index ASC, p.id ASC
    `,
    [topicId],
  );

  return rows.map((row) => ({
    ...row,
    is_public: Boolean(Number(row.is_public)),
  }));
}

async function auditPractice(connection, req, topic, action, description, data) {
  await writeAuditLog(connection, {
    req,
    action,
    category: "learning_management",
    targetType: "learning_topic",
    targetId: topic.id,
    description,
    details: {
      lesson_title: topic.title,
      subject_id: topic.subject_id,
      ...data,
    },
  });
}

// Search public problems by title or exact numeric ID.
// Returns at most 50 results. Supply topic_id to mark attached results.
router.get("/learning/practice-problems/search", async (req, res) => {
  try {
    if (req.query.q !== undefined && typeof req.query.q !== "string") {
      throw fail(400, "Search must be text.");
    }

    const query = (req.query.q || "").trim();

    if (Array.from(query).length > 100) {
      throw fail(400, "Search must not exceed 100 characters.");
    }

    const topicId =
      req.query.topic_id === undefined
        ? null
        : routeId(req.query.topic_id, "lesson ID");

    if (topicId !== null) {
      const [topics] = await db.execute(
        "SELECT id FROM learn_topics WHERE id = ?",
        [topicId],
      );

      if (!topics.length) throw fail(404, "Lesson not found.");
    }

    const exactId =
      /^[1-9]\d*$/.test(query) && positiveId(Number(query))
        ? Number(query)
        : 0;

    const [rows] = await db.execute(
      `
        SELECT
          p.id,
          p.title,
          p.difficulty,
          EXISTS (
            SELECT 1
            FROM learning_topic_problems AS ltp
            WHERE ltp.problem_id = p.id
              AND ltp.topic_id = ?
          ) AS attached
        FROM problems AS p
        WHERE p.is_public = 1
          AND (
            ? = ''
            OR LOCATE(LOWER(?), LOWER(p.title)) > 0
            OR p.id = ?
          )
        ORDER BY
          CASE WHEN p.id = ? THEN 0 ELSE 1 END,
          p.id DESC
        LIMIT 50
      `,
      [topicId, query, query, exactId, exactId],
    );

    return res.json({
      problems: rows.map((row) => ({
        ...row,
        attached: Boolean(Number(row.attached)),
      })),
    });
  } catch (error) {
    return sendError(res, error);
  }
});

// Admin list includes unpublished problems so they can still be detached.
router.get(
  "/learning/topics/:topicId/practice-problems",
  async (req, res) => {
    try {
      const topicId = routeId(req.params.topicId, "lesson ID");

      const [topics] = await db.execute(
        "SELECT id FROM learn_topics WHERE id = ?",
        [topicId],
      );

      if (!topics.length) throw fail(404, "Lesson not found.");

      return res.json({
        problems: await practiceRows(db, topicId),
      });
    } catch (error) {
      return sendError(res, error);
    }
  },
);

// Attach an existing public problem to a saved lesson.
router.post(
  "/learning/topics/:topicId/practice-problems",
  async (req, res) => {
    try {
      const topicId = routeId(req.params.topicId, "lesson ID");
      bodyFields(req.body, ["problem_id"]);

      const problemId = req.body.problem_id;

      if (!positiveId(problemId)) {
        throw fail(400, "problem_id must be a positive integer.");
      }

      const result = await withTopic(topicId, async (connection, topic) => {
        const [problems] = await connection.execute(
          `
            SELECT id, title, is_public
            FROM problems
            WHERE id = ?
            FOR UPDATE
          `,
          [problemId],
        );

        if (!problems.length) throw fail(404, "Problem not found.");

        if (!Number(problems[0].is_public)) {
          throw fail(409, "Publish the problem before attaching it.");
        }

        const [links] = await connection.execute(
          `
            SELECT problem_id, order_index
            FROM learning_topic_problems
            WHERE topic_id = ?
            ORDER BY order_index ASC, problem_id ASC
            FOR UPDATE
          `,
          [topicId],
        );

        if (links.some((link) => Number(link.problem_id) === problemId)) {
          throw fail(409, "This problem is already attached.");
        }

        if (links.length >= MAX_PROBLEMS) {
          throw fail(400, `A lesson can have at most ${MAX_PROBLEMS} practice problems.`);
        }

        const orderIndex = links.length
          ? Number(links[links.length - 1].order_index) + 1
          : 1;

        if (orderIndex > 2147483647) {
          throw fail(409, "Reorder the practice list before attaching another problem.");
        }

        await connection.execute(
          `
            INSERT INTO learning_topic_problems
              (topic_id, problem_id, order_index)
            VALUES (?, ?, ?)
          `,
          [topicId, problemId, orderIndex],
        );

        await auditPractice(
          connection,
          req,
          topic,
          "learning_practice_problem_attached",
          `Attached problem "${problems[0].title}" to lesson "${topic.title}".`,
          {
            problem_id: problemId,
            problem_title: problems[0].title,
            order_index: orderIndex,
          },
        );

        return {
          message: "Practice problem attached.",
          problems: await practiceRows(connection, topicId),
        };
      });

      return res.status(201).json(result);
    } catch (error) {
      return sendError(res, error);
    }
  },
);

// Detach only the link. Never delete the problem or submissions.
router.delete(
  "/learning/topics/:topicId/practice-problems/:problemId",
  async (req, res) => {
    try {
      const topicId = routeId(req.params.topicId, "lesson ID");
      const problemId = routeId(req.params.problemId, "problem ID");

      const result = await withTopic(topicId, async (connection, topic) => {
        const [links] = await connection.execute(
          `
            SELECT problem_id, order_index
            FROM learning_topic_problems
            WHERE topic_id = ? AND problem_id = ?
            FOR UPDATE
          `,
          [topicId, problemId],
        );

        if (!links.length) {
          throw fail(404, "This problem is not attached to the lesson.");
        }

        await connection.execute(
          `
            DELETE FROM learning_topic_problems
            WHERE topic_id = ? AND problem_id = ?
          `,
          [topicId, problemId],
        );

        await auditPractice(
          connection,
          req,
          topic,
          "learning_practice_problem_detached",
          `Detached problem #${problemId} from lesson "${topic.title}".`,
          {
            problem_id: problemId,
            previous_order_index: Number(links[0].order_index),
          },
        );

        return {
          message: "Practice problem detached. The problem itself was not deleted.",
          problems: await practiceRows(connection, topicId),
        };
      });

      return res.json(result);
    } catch (error) {
      return sendError(res, error);
    }
  },
);

// Save the complete attachment order, including unpublished problems.
router.put(
  "/learning/topics/:topicId/practice-problem-order",
  async (req, res) => {
    try {
      const topicId = routeId(req.params.topicId, "lesson ID");
      bodyFields(req.body, ["problem_ids"]);

      const ids = req.body.problem_ids;

      if (
        !Array.isArray(ids) ||
        ids.length > MAX_PROBLEMS ||
        ids.some((id) => !positiveId(id)) ||
        new Set(ids).size !== ids.length
      ) {
        throw fail(
          400,
          "problem_ids must contain unique positive integer IDs, with at most 100 entries.",
        );
      }

      const result = await withTopic(topicId, async (connection, topic) => {
        const [links] = await connection.execute(
          `
            SELECT problem_id, order_index
            FROM learning_topic_problems
            WHERE topic_id = ?
            ORDER BY order_index ASC, problem_id ASC
            FOR UPDATE
          `,
          [topicId],
        );

        const existingIds = new Set(
          links.map((link) => Number(link.problem_id)),
        );

        if (
          ids.length !== links.length ||
          ids.some((id) => !existingIds.has(id))
        ) {
          throw fail(
            409,
            "The practice list changed. Reload it before reordering.",
          );
        }

        const before = links.map((link) => ({
          problem_id: Number(link.problem_id),
          order_index: Number(link.order_index),
        }));

        const after = ids.map((id, index) => ({
          problem_id: id,
          order_index: index + 1,
        }));

        if (JSON.stringify(before) === JSON.stringify(after)) {
          return {
            message: "Practice order is already up to date.",
            problems: await practiceRows(connection, topicId),
          };
        }

        for (const item of after) {
          await connection.execute(
            `
              UPDATE learning_topic_problems
              SET order_index = ?
              WHERE topic_id = ? AND problem_id = ?
            `,
            [item.order_index, topicId, item.problem_id],
          );
        }

        await auditPractice(
          connection,
          req,
          topic,
          "learning_practice_problems_reordered",
          `Reordered practice problems for lesson "${topic.title}".`,
          { before, after },
        );

        return {
          message: "Practice problem order saved.",
          problems: await practiceRows(connection, topicId),
        };
      });

      return res.json(result);
    } catch (error) {
      return sendError(res, error);
    }
  },
);

module.exports = router;