const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { getContestClock } = require("../utils/contestClock");

function parsePositiveId(value) {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/.test(value)
  ) {
    return null;
  }

  const id = Number(value);

  return Number.isSafeInteger(id) ? id : null;
}

function getContestStatus(contest) {
  return getContestClock(contest).status;
}

async function findPublicContest(contestId) {
  const [rows] = await db.execute(
    `
      SELECT *
      FROM contests
      WHERE id = ? AND is_public = true
      LIMIT 1
    `,
    [contestId],
  );

  return rows[0] || null;
}

async function isRegistered(contestId, userId) {
  const [rows] = await db.execute(
    `
      SELECT contest_id
      FROM contest_registrations
      WHERE contest_id = ? AND user_id = ?
      LIMIT 1
    `,
    [contestId, userId],
  );

  return rows.length > 0;
}

// Public contest list.
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.execute(
      `
        SELECT *
        FROM contests
        WHERE is_public = true
        ORDER BY start_time ASC, id ASC
      `,
    );

    return res.json(rows);
  } catch (err) {
    console.error("Contest list error:", err);

    return res.status(500).json({
      error: "Unable to load contests.",
    });
  }
});

// Registration state for the authenticated user.
router.get("/:id/registration", requireAuth, async (req, res) => {
  const contestId = parsePositiveId(req.params.id);

  if (contestId === null) {
    return res.status(400).json({
      error: "Invalid contest ID.",
    });
  }

  try {
    const contest = await findPublicContest(contestId);

    if (!contest) {
      return res.status(404).json({
        error: "Contest not found.",
      });
    }

    const registered = await isRegistered(
      contestId,
      req.user.userId,
    );

    return res.json({ registered });
  } catch (err) {
    console.error("Contest registration-status error:", err);

    return res.status(500).json({
      error: "Unable to check contest registration status.",
    });
  }
});

// Protected problem statement for a live contest.
router.get(
  "/:contestId/problems/:problemId",
  requireAuth,
  async (req, res) => {
    const contestId = parsePositiveId(req.params.contestId);
    const problemId = parsePositiveId(req.params.problemId);

    if (contestId === null) {
      return res.status(400).json({
        error: "Invalid contest ID.",
      });
    }

    if (problemId === null) {
      return res.status(400).json({
        error: "Invalid problem ID.",
      });
    }

    try {
      const contest = await findPublicContest(contestId);

      if (!contest) {
        return res.status(404).json({
          error: "Contest not found or is not public.",
        });
      }

      const status = getContestStatus(contest);

      if (status === "invalid") {
        return res.status(400).json({
          error: "Contest schedule is invalid.",
        });
      }

      if (status === "upcoming") {
        return res.status(403).json({
          error: "This contest has not started yet.",
        });
      }

      if (status === "ended") {
        return res.status(403).json({
          error: "This contest has ended.",
        });
      }

      const registered = await isRegistered(
        contestId,
        req.user.userId,
      );

      if (!registered) {
        return res.status(403).json({
          error:
            "Register for this contest before opening its problems.",
        });
      }

      const [problemRows] = await db.execute(
        `
          SELECT
            p.id,
            p.title,
            p.statement,
            p.input_format,
            p.output_format,
            p.constraints,
            p.difficulty,
            p.time_limit_ms,
            p.memory_limit_kb,
            p.subject_id,
            p.is_public,
            cp.serial_letter
          FROM contest_problems AS cp
          INNER JOIN problems AS p
            ON p.id = cp.problem_id
          WHERE cp.contest_id = ?
            AND cp.problem_id = ?
            AND cp.withdrawn_at IS NULL
          LIMIT 1
        `,
        [contestId, problemId],
      );

      if (problemRows.length === 0) {
        return res.status(403).json({
          error:
            "This problem is not assigned to this contest or has been withdrawn.",
        });
      }

      // Only sample test cases may be returned to the student.
      const [sampleTests] = await db.execute(
        `
          SELECT input, expected_output
          FROM test_cases
          WHERE problem_id = ? AND is_sample = true
          ORDER BY id ASC
        `,
        [problemId],
      );

      return res.json({
        ...problemRows[0],
        contest_id: contestId,
        contest_title: contest.title,
        sample_tests: sampleTests,
        sample_input: sampleTests[0]?.input ?? "",
        sample_output: sampleTests[0]?.expected_output ?? "",
      });
    } catch (err) {
      console.error("Contest problem access error:", err);

      return res.status(500).json({
        error: "Unable to load contest problem.",
      });
    }
  },
);

// Register the authenticated user.
// Current policy: registration is allowed before and during the contest,
// but not after it ends.
router.post("/:id/register", requireAuth, async (req, res) => {
  const contestId = parsePositiveId(req.params.id);

  if (contestId === null) {
    return res.status(400).json({
      error: "Invalid contest ID.",
    });
  }

  try {
    const contest = await findPublicContest(contestId);

    if (!contest) {
      return res.status(404).json({
        error: "Contest not found or is not public.",
      });
    }

    const registered = await isRegistered(
      contestId,
      req.user.userId,
    );

    if (registered) {
      return res.json({
        registered: true,
        message: "You are already registered for this contest.",
      });
    }

    const status = getContestStatus(contest);

    if (status === "invalid") {
      return res.status(400).json({
        error: "Contest schedule is invalid.",
      });
    }

    if (status === "ended") {
      return res.status(403).json({
        error: "Registration is closed. This contest has ended.",
      });
    }

    await db.execute(
      `
        INSERT IGNORE INTO contest_registrations
          (contest_id, user_id)
        VALUES (?, ?)
      `,
      [contestId, req.user.userId],
    );

    // Confirm that registration actually exists after the insert.
    const saved = await isRegistered(
      contestId,
      req.user.userId,
    );

    if (!saved) {
      return res.status(500).json({
        error: "Unable to save contest registration.",
      });
    }

    return res.json({
      registered: true,
      message: "Registered successfully.",
    });
  } catch (err) {
    console.error("Contest registration error:", err);

    return res.status(500).json({
      error: "Unable to register for this contest.",
    });
  }
});

// Contest leaderboard:
// - 100 points per uniquely solved problem.
// - 20 minutes per penalized attempt before the first Accepted.
// - Only solved problems contribute to total penalty time.
router.get("/:id/leaderboard", async (req, res) => {
  const contestId = parsePositiveId(req.params.id);

  if (contestId === null) {
    return res.status(400).json({
      error: "Invalid contest ID.",
    });
  }

  const WRONG_ATTEMPT_PENALTY_MINUTES = 20;

  const PENALIZED_VERDICTS = new Set([
    "Wrong Answer",
    "Time Limit Exceeded",
    "Runtime Error",
  ]);

  try {
    const contest = await findPublicContest(contestId);

    if (!contest) {
      return res.status(404).json({
        error: "Contest not found.",
      });
    }

    if (getContestStatus(contest) === "invalid") {
      return res.status(400).json({
        error: "Contest schedule is invalid.",
      });
    }

    const [problemRows] = await db.execute(
      `
      SELECT
        p.id AS problem_id,
        p.title,
        cp.serial_letter
      FROM contest_problems AS cp
      INNER JOIN problems AS p
        ON p.id = cp.problem_id
      WHERE cp.contest_id = ? AND cp.withdrawn_at IS NULL
      ORDER BY cp.serial_letter ASC, p.id ASC
      `,
      [contestId],
    );

    const [studentRows] = await db.execute(
      `
      SELECT DISTINCT
        u.id AS user_id,
        u.name
      FROM contest_registrations AS cr
      INNER JOIN users AS u
        ON u.id = cr.user_id
      WHERE cr.contest_id = ?
      ORDER BY u.id ASC
      `,
      [contestId],
    );

    const [submissionRows] = await db.execute(
      `
      SELECT
        s.id,
        s.user_id,
        s.problem_id,
        s.verdict,
        s.submitted_at,
        TIMESTAMPDIFF(
          SECOND,
          c.start_time,
          s.submitted_at
        ) AS elapsed_seconds
      FROM submissions AS s
      INNER JOIN contests AS c
        ON c.id = s.contest_id
      WHERE s.contest_id = ?
        AND s.submitted_at >= c.start_time
        AND s.submitted_at < COALESCE(c.ended_at, c.end_time)
        AND EXISTS (
          SELECT 1
          FROM contest_registrations AS cr
          WHERE cr.contest_id = s.contest_id
            AND cr.user_id = s.user_id
        )
        AND EXISTS (
          SELECT 1
          FROM contest_problems AS cp
          WHERE cp.contest_id = s.contest_id
            AND cp.problem_id = s.problem_id
            AND cp.withdrawn_at IS NULL
        )
      ORDER BY s.submitted_at ASC, s.id ASC
      `,
      [contestId],
    );

    const students = new Map();

    for (const student of studentRows) {
      const userId = Number(student.user_id);

      const problems = problemRows.map((problem) => ({
        problem_id: Number(problem.problem_id),
        serial_letter: problem.serial_letter,
        title: problem.title,
        solved: false,
        wrong_attempts: 0,
        first_ac_time: null,
        elapsed_minutes: null,
        penalty_minutes: 0,
        total_minutes: 0,
      }));

      students.set(userId, {
        user_id: userId,
        name: student.name,
        solved: 0,
        total_score: 0,
        total_elapsed_minutes: 0,
        total_penalty_minutes: 0,
        total_time_minutes: 0,
        last_ac_time: null,
        last_solve_seconds: null,
        problems,
        problemMap: new Map(
          problems.map((problem) => [
            problem.problem_id,
            problem,
          ]),
        ),
      });
    }

    for (const submission of submissionRows) {
      const student = students.get(Number(submission.user_id));

      if (!student) continue;

      const problem = student.problemMap.get(
        Number(submission.problem_id),
      );

      // Once solved, later attempts never affect this problem.
      if (!problem || problem.solved) continue;

      if (submission.verdict === "Accepted") {
        const elapsedSeconds = Number(
          submission.elapsed_seconds,
        );

        const elapsedMinutes = Math.floor(
          elapsedSeconds / 60,
        );

        const penaltyMinutes =
          problem.wrong_attempts *
          WRONG_ATTEMPT_PENALTY_MINUTES;

        problem.solved = true;
        problem.first_ac_time = submission.submitted_at;
        problem.elapsed_minutes = elapsedMinutes;
        problem.penalty_minutes = penaltyMinutes;
        problem.total_minutes =
          elapsedMinutes + penaltyMinutes;

        student.solved += 1;
        student.total_score += 100;
        student.total_elapsed_minutes += elapsedMinutes;
        student.total_penalty_minutes += penaltyMinutes;
        student.total_time_minutes += problem.total_minutes;

        // Submissions are processed in chronological order.
        student.last_ac_time = submission.submitted_at;
        student.last_solve_seconds = elapsedSeconds;
      } else if (
        PENALIZED_VERDICTS.has(submission.verdict)
      ) {
        problem.wrong_attempts += 1;
      }
    }

    const leaderboard = Array.from(students.values());

    leaderboard.sort((a, b) => {
      if (a.total_score !== b.total_score) {
        return b.total_score - a.total_score;
      }

      if (a.total_time_minutes !== b.total_time_minutes) {
        return a.total_time_minutes - b.total_time_minutes;
      }

      const aLast =
        a.last_solve_seconds ?? Number.POSITIVE_INFINITY;

      const bLast =
        b.last_solve_seconds ?? Number.POSITIVE_INFINITY;

      if (aLast !== bLast) {
        return aLast < bLast ? -1 : 1;
      }

      return a.user_id - b.user_id;
    });

    let previous = null;
    let currentRank = 0;

    const result = leaderboard.map((student, index) => {
      const tied =
        previous !== null &&
        student.total_score === previous.total_score &&
        student.total_time_minutes ===
          previous.total_time_minutes &&
        student.last_solve_seconds ===
          previous.last_solve_seconds;

      if (!tied) {
        currentRank = index + 1;
      }

      previous = student;

      // Internal lookup map is not part of the API response.
      const { problemMap, ...publicStudent } = student;

      return {
        rank: currentRank,
        ...publicStudent,
      };
    });

    return res.json(result);
  } catch (err) {
    console.error("Contest leaderboard error:", err);

    return res.status(500).json({
      error: "Unable to load contest leaderboard.",
    });
  }
});

// Personal progress is private and scoped to the authenticated participant.
router.get("/:id/my-progress", requireAuth, async (req, res) => {
  const contestId = parsePositiveId(req.params.id);
  if (contestId === null) {
    return res.status(400).json({ error: "Invalid contest ID." });
  }
  res.set("Cache-Control", "private, no-store");
  try {
    const contest = await findPublicContest(contestId);
    if (!contest) {
      return res.status(404).json({ error: "Contest not found." });
    }
    if (!(await isRegistered(contestId, req.user.userId))) {
      return res.status(403).json({ error: "Register to view your contest progress." });
    }
    const [rows] = await db.execute(
      `SELECT
         cp.problem_id,
         MAX(CASE WHEN s.verdict = 'Accepted' THEN 1 ELSE 0 END) AS solved,
         MAX(CASE WHEN s.verdict IN (
           'Wrong Answer', 'Time Limit Exceeded', 'Runtime Error',
           'Compilation Error', 'Memory Limit Exceeded', 'Output Limit Exceeded'
         ) THEN 1 ELSE 0 END) AS failed,
         SUBSTRING_INDEX(
           GROUP_CONCAT(
             CASE WHEN s.verdict IN (
               'Wrong Answer', 'Time Limit Exceeded', 'Runtime Error',
               'Compilation Error', 'Memory Limit Exceeded', 'Output Limit Exceeded'
             ) THEN s.verdict ELSE NULL END
             ORDER BY s.submitted_at DESC, s.id DESC SEPARATOR '|'
           ), '|', 1
         ) AS latest_failed_verdict
       FROM contest_problems AS cp
       INNER JOIN contests AS c ON c.id = cp.contest_id
       LEFT JOIN submissions AS s
         ON s.contest_id = cp.contest_id
         AND s.problem_id = cp.problem_id
         AND s.user_id = ?
         AND s.submitted_at >= c.start_time
         AND s.submitted_at < COALESCE(c.ended_at, c.end_time)
       WHERE cp.contest_id = ? AND cp.withdrawn_at IS NULL
       GROUP BY cp.problem_id`,
      [req.user.userId, contestId],
    );
    return res.json({
      contest_id: contestId,
      problems: rows.map((row) => {
        const solved = Number(row.solved) === 1;
        const failed = Number(row.failed) === 1;
        return {
          problem_id: Number(row.problem_id),
          status: solved ? "solved" : failed ? "failed" : "unattempted",
          verdict: solved ? "Accepted" : failed ? row.latest_failed_verdict : null,
        };
      }),
    });
  } catch (err) {
    console.error("Contest personal progress error:", err);
    return res.status(500).json({ error: "Unable to load your contest progress." });
  }
});

// Public contest information and assigned-problem metadata.
// Does not return problem statements or hidden test cases.
router.get("/:id", async (req, res) => {
  const contestId = parsePositiveId(req.params.id);

  if (contestId === null) {
    return res.status(400).json({
      error: "Invalid contest ID.",
    });
  }

  try {
    const contest = await findPublicContest(contestId);

    if (!contest) {
      return res.status(404).json({
        error: "Contest not found.",
      });
    }

    const [problems] = await db.execute(
      `
        SELECT
          cp.serial_letter,
          p.id,
          p.title,
          p.difficulty
        FROM contest_problems AS cp
        INNER JOIN problems AS p
          ON cp.problem_id = p.id
        WHERE cp.contest_id = ? AND cp.withdrawn_at IS NULL
        ORDER BY cp.serial_letter ASC
      `,
      [contestId],
    );

    const [clockRows] = await db.execute(
      "SELECT NOW(3) AS server_now",
    );

    const clock = getContestClock(
      contest,
      clockRows[0].server_now,
    );

    const [announcements] = await db.execute(
      `
      SELECT
        id,
        contest_revision,
        event_type,
        message,
        created_at
      FROM contest_announcements
      WHERE contest_id = ?
      ORDER BY id DESC
      LIMIT 20
      `,
      [contestId],
    );

    return res.json({
      ...contest,
      ...clock,
      timezone: "Asia/Dhaka",
      problems,
      announcements,
    });
  } catch (err) {
    console.error("Contest details error:", err);

    return res.status(500).json({
      error: "Unable to load contest details.",
    });
  }
});

module.exports = router;