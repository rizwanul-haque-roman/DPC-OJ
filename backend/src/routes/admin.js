const express = require("express");
const router = express.Router();
const db = require("../db");
const { changeContestProblem } = require("../utils/liveContestProblems");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { writeAuditLog, diffChanges } = require("../utils/auditLog");


router.use(requireAuth, requireAdmin);
router.use(require("./adminLearning"));
router.use(require("./adminContestControls"));

const VALID_ROLES = ["student", "admin"];
const VALID_STATUSES = ["active", "suspended", "deleted"];


async function countActiveAdmins() {
  const [rows] = await db.execute(
    `SELECT COUNT(*) AS total
     FROM users
     WHERE role = 'admin' AND status = 'active'`,
  );

  return Number(rows[0]?.total || 0);
}


const PROBLEM_DIFFICULTIES = ["easy", "medium", "hard"];


const PROBLEM_MAX_CASES = 200;
const PROBLEM_MAX_CASE_BYTES = 64 * 1024;
const PROBLEM_MAX_TOTAL_CASE_BYTES = 1024 * 1024;


function problemHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}


function readProblemId(value) {
  const id = Number(value);

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw problemHttpError(400, "Invalid problem ID.");
  }

  return id;
}


function validateProblemCases(cases) {
  if (!Array.isArray(cases)) {
    throw problemHttpError(400, "test_cases must be an array.");
  }

  if (cases.length > PROBLEM_MAX_CASES) {
    throw problemHttpError(
      400,
      `A problem can contain at most ${PROBLEM_MAX_CASES} test cases.`,
    );
  }

  let totalBytes = 0;

  const normalized = cases.map((tc, index) => {
    if (
      !tc ||
      typeof tc !== "object" ||
      typeof tc.input !== "string" ||
      typeof tc.expected_output !== "string"
    ) {
      throw problemHttpError(
        400,
        `Test case ${index + 1} must contain string input and expected_output.`,
      );
    }

    if (tc.is_sample !== undefined && typeof tc.is_sample !== "boolean") {
      throw problemHttpError(
        400,
        `Test case ${index + 1}: is_sample must be a boolean.`,
      );
    }

    const inputBytes = Buffer.byteLength(tc.input, "utf8");
    const outputBytes = Buffer.byteLength(tc.expected_output, "utf8");

    if (
      inputBytes > PROBLEM_MAX_CASE_BYTES ||
      outputBytes > PROBLEM_MAX_CASE_BYTES
    ) {
      throw problemHttpError(
        400,
        `Test case ${index + 1}: input and expected output must each be at most 64 KB.`,
      );
    }

    totalBytes += inputBytes + outputBytes;

    return {
      // Preserve whitespace exactly.
      input: tc.input,
      expected_output: tc.expected_output,
      is_sample: tc.is_sample ?? false,
    };
  });

  if (totalBytes > PROBLEM_MAX_TOTAL_CASE_BYTES) {
    throw problemHttpError(
      400,
      "Combined test-case content must not exceed 1 MB.",
    );
  }

  return normalized;
}


function validateProblemBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw problemHttpError(400, "A JSON object is required.");
  }

  if (
    typeof body.title !== "string" ||
    !body.title.trim() ||
    body.title.trim().length > 200
  ) {
    throw problemHttpError(
      400,
      "Title is required and must be at most 200 characters.",
    );
  }

  if (typeof body.statement !== "string" || !body.statement.trim()) {
    throw problemHttpError(400, "Problem statement is required.");
  }

  const optionalText = {};

  for (const field of ["input_format", "output_format", "constraints"]) {
    const value = body[field] ?? "";

    if (typeof value !== "string") {
      throw problemHttpError(400, `${field} must be a string.`);
    }

    optionalText[field] = value;
  }

  const difficulty =
    typeof body.difficulty === "string"
      ? body.difficulty.trim().toLowerCase()
      : "";

  if (!PROBLEM_DIFFICULTIES.includes(difficulty)) {
    throw problemHttpError(
      400,
      "Difficulty must be easy, medium, or hard.",
    );
  }

  if (
    !Number.isSafeInteger(body.time_limit_ms) ||
    body.time_limit_ms < 1 ||
    body.time_limit_ms > 60000
  ) {
    throw problemHttpError(
      400,
      "Time limit must be an integer from 1 to 60000 ms.",
    );
  }

  if (
    !Number.isSafeInteger(body.memory_limit_kb) ||
    body.memory_limit_kb < 1 ||
    body.memory_limit_kb > 1048576
  ) {
    throw problemHttpError(
      400,
      "Memory limit must be an integer from 1 to 1048576 KB.",
    );
  }

  const subjectId = body.subject_id ?? null;

  if (
    subjectId !== null &&
    (!Number.isSafeInteger(subjectId) || subjectId <= 0)
  ) {
    throw problemHttpError(
      400,
      "subject_id must be a positive integer or null.",
    );
  }

  const isPublic = body.is_public ?? false;

  if (typeof isPublic !== "boolean") {
    throw problemHttpError(400, "is_public must be a boolean.");
  }

  // POST can omit cases when creating an empty draft.
  const testCases = validateProblemCases(body.test_cases ?? []);

  if (isPublic) {
    const hasSample = testCases.some((tc) => tc.is_sample);
    const hasHidden = testCases.some((tc) => !tc.is_sample);

    if (!hasSample || !hasHidden) {
      throw problemHttpError(
        400,
        "Publishing requires at least one sample and one hidden test case.",
      );
    }
  }

  return {
    title: body.title.trim(),
    statement: body.statement,
    ...optionalText,
    difficulty,
    time_limit_ms: body.time_limit_ms,
    memory_limit_kb: body.memory_limit_kb,
    subject_id: subjectId,
    is_public: isPublic,
    test_cases: testCases,
  };
}


async function insertProblemCases(connection, problemId, cases) {
  for (const tc of cases) {
    await connection.execute(
      `INSERT INTO test_cases
        (problem_id, input, expected_output, is_sample)
       VALUES (?, ?, ?, ?)`,
      [problemId, tc.input, tc.expected_output, tc.is_sample],
    );
  }
}


function sendProblemError(res, error, label) {
  const expected =
    Number.isInteger(error.statusCode) &&
    error.statusCode >= 400 &&
    error.statusCode < 500;

  if (!expected) {
    console.error(label, error);
  }

  return res.status(expected ? error.statusCode : 500).json({
    error: expected
      ? error.message
      : "Unable to complete the problem-management request.",
  });
}


router.get("/problems", async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT
        p.id,
        p.title,
        p.difficulty,
        p.is_public,
        p.subject_id,
        p.time_limit_ms,
        p.memory_limit_kb,
        s.name AS subject_name,
        (
          SELECT COUNT(*)
          FROM test_cases tc
          WHERE tc.problem_id = p.id
        ) AS test_case_count,
        (
          SELECT COUNT(*)
          FROM test_cases tc
          WHERE tc.problem_id = p.id
            AND tc.is_sample = false
        ) AS hidden_test_count
      FROM problems p
      LEFT JOIN subjects s ON s.id = p.subject_id
      ORDER BY p.id DESC
    `);

    res.json(
      rows.map((row) => ({
        ...row,
        is_public: Boolean(row.is_public),
      })),
    );
  } catch (error) {
    sendProblemError(res, error, "Admin problem list error:");
  }
});


router.get("/problems/:id", async (req, res) => {
  try {
    const id = readProblemId(req.params.id);

    const [rows] = await db.execute("SELECT * FROM problems WHERE id = ?", [
      id,
    ]);

    if (!rows.length) {
      throw problemHttpError(404, "Problem not found.");
    }

    const [cases] = await db.execute(
      `SELECT id, input, expected_output, is_sample
       FROM test_cases
       WHERE problem_id = ?
       ORDER BY id ASC`,
      [id],
    );

    res.json({
      ...rows[0],
      is_public: Boolean(rows[0].is_public),
      test_cases: cases.map((tc) => ({
        ...tc,
        is_sample: Boolean(tc.is_sample),
      })),
    });
  } catch (error) {
    sendProblemError(res, error, "Admin problem details error:");
  }
});


async function saveAdminProblem(req, res) {
  let connection;

  try {
    const editing = req.method === "PUT";
    const requestedId = editing ? readProblemId(req.params.id) : null;

    // Require explicit cases on edits to avoid accidental deletion
    // caused by a client forgetting to include the case list.
    if (
      editing &&
      !Object.prototype.hasOwnProperty.call(req.body ?? {}, "test_cases")
    ) {
      throw problemHttpError(
        400,
        "Editing requires the complete test_cases array.",
      );
    }

    const problem = validateProblemBody(req.body);

    connection = await db.getConnection();
    await connection.beginTransaction();

    let before = null;

    if (editing) {
      const [existing] = await connection.execute(
        `SELECT id, title, difficulty, subject_id, time_limit_ms,
                memory_limit_kb, is_public
         FROM problems
         WHERE id = ?
         FOR UPDATE`,
        [requestedId],
      );

      if (!existing.length) {
        throw problemHttpError(404, "Problem not found.");
      }

      before = existing[0];
    }

    if (problem.subject_id !== null) {
      const [subjects] = await connection.execute(
        "SELECT id FROM subjects WHERE id = ?",
        [problem.subject_id],
      );

      if (!subjects.length) {
        throw problemHttpError(400, "The selected subject does not exist.");
      }
    }

    const values = [
      problem.title,
      problem.statement,
      problem.input_format,
      problem.output_format,
      problem.constraints,
      problem.difficulty,
      problem.time_limit_ms,
      problem.memory_limit_kb,
      problem.subject_id,
      problem.is_public,
    ];

    let savedId = requestedId;

    if (editing) {
      await connection.execute(
        `UPDATE problems SET
          title = ?,
          statement = ?,
          input_format = ?,
          output_format = ?,
          \`constraints\` = ?,
          difficulty = ?,
          time_limit_ms = ?,
          memory_limit_kb = ?,
          subject_id = ?,
          is_public = ?
         WHERE id = ?`,
        [...values, savedId],
      );

      await connection.execute("DELETE FROM test_cases WHERE problem_id = ?", [
        savedId,
      ]);
    } else {
      const [result] = await connection.execute(
        `INSERT INTO problems (
          title,
          statement,
          input_format,
          output_format,
          \`constraints\`,
          difficulty,
          time_limit_ms,
          memory_limit_kb,
          subject_id,
          is_public
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values,
      );

      savedId = result.insertId;
    }

    await insertProblemCases(connection, savedId, problem.test_cases);

    if (editing) {
      const changes = diffChanges(before, problem, [
        "title",
        "difficulty",
        "subject_id",
        "time_limit_ms",
        "memory_limit_kb",
        "is_public",
      ]);

      const publicationChanged =
        changes !== null &&
        Object.prototype.hasOwnProperty.call(changes, "is_public");

      await writeAuditLog(connection, {
        req,
        action: publicationChanged
          ? problem.is_public
            ? "problem_published"
            : "problem_unpublished"
          : "problem_updated",
        category: "problem_management",
        targetType: "problem",
        targetId: savedId,
        description: `Updated problem "${problem.title}".`,
        details: {
          title: problem.title,
          test_case_count: problem.test_cases.length,
          sample_case_count: problem.test_cases.filter((tc) => tc.is_sample)
            .length,
          hidden_case_count: problem.test_cases.filter((tc) => !tc.is_sample)
            .length,
        },
        changes,
      });
    } else {
      await writeAuditLog(connection, {
        req,
        action: problem.is_public ? "problem_published" : "problem_created",
        category: "problem_management",
        targetType: "problem",
        targetId: savedId,
        description: problem.is_public
          ? `Created and published problem "${problem.title}".`
          : `Created draft problem "${problem.title}".`,
        details: {
          title: problem.title,
          difficulty: problem.difficulty,
          subject_id: problem.subject_id,
          is_public: problem.is_public,
          test_case_count: problem.test_cases.length,
          sample_case_count: problem.test_cases.filter((tc) => tc.is_sample)
            .length,
          hidden_case_count: problem.test_cases.filter((tc) => !tc.is_sample)
            .length,
        },
      });
    }

    await connection.commit();

    res.status(editing ? 200 : 201).json({
      id: savedId,
      is_public: problem.is_public,
      test_case_count: problem.test_cases.length,
      message: problem.is_public
        ? "Problem saved and published."
        : "Problem saved as a draft.",
    });
  } catch (error) {
    if (connection) {
      await connection.rollback().catch(() => {});
    }

    sendProblemError(res, error, "Save admin problem error:");
  } finally {
    connection?.release();
  }
}


router.post("/problems", saveAdminProblem);
router.put("/problems/:id", saveAdminProblem);


router.post("/problems/:id/testcases", async (req, res) => {
  let connection;

  try {
    const id = readProblemId(req.params.id);
    const cases = validateProblemCases(req.body?.test_cases);

    if (!cases.length) {
      throw problemHttpError(400, "test_cases must be a non-empty array.");
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    const [problems] = await connection.execute(
      "SELECT id FROM problems WHERE id = ? FOR UPDATE",
      [id],
    );

    if (!problems.length) {
      throw problemHttpError(404, "Problem not found.");
    }

    const [existing] = await connection.execute(
      `SELECT input, expected_output, is_sample
       FROM test_cases
       WHERE problem_id = ?`,
      [id],
    );

    validateProblemCases([
      ...existing.map((tc) => ({
        ...tc,
        is_sample: Boolean(tc.is_sample),
      })),
      ...cases,
    ]);

    await insertProblemCases(connection, id, cases);

    await writeAuditLog(connection, {
      req,
      action: "test_cases_added",
      category: "test_case_management",
      targetType: "problem",
      targetId: id,
      description: `Added ${cases.length} test case(s) to problem #${id}.`,
      details: {
        added_count: cases.length,
        total_count: existing.length + cases.length,
        sample_count: cases.filter((tc) => tc.is_sample).length,
        hidden_count: cases.filter((tc) => !tc.is_sample).length,
      },
    });

    await connection.commit();

    res.status(201).json({
      id,
      added_count: cases.length,
      test_case_count: existing.length + cases.length,
      message: "Test cases added. Publication status is unchanged.",
    });
  } catch (error) {
    if (connection) {
      await connection.rollback().catch(() => {});
    }

    sendProblemError(res, error, "Add problem test cases error:");
  } finally {
    connection?.release();
  }
});


router.delete("/problems/:id", async (req, res) => {
  const problemId = Number(req.params.id);

  if (!Number.isSafeInteger(problemId) || problemId <= 0) {
    return res.status(400).json({
      error: "Invalid problem ID.",
    });
  }

  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Lock the parent first.
    const [problemRows] = await connection.execute(
      `SELECT id, title
       FROM problems
       WHERE id = ?
       FOR UPDATE`,
      [problemId],
    );

    if (problemRows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        error: "Problem not found.",
      });
    }

    const [submissionRows] = await connection.execute(
      `SELECT id
       FROM submissions
       WHERE problem_id = ?
       LIMIT 1
       FOR UPDATE`,
      [problemId],
    );

    const [contestRows] = await connection.execute(
      `SELECT problem_id
       FROM contest_problems
       WHERE problem_id = ?
       LIMIT 1
       FOR UPDATE`,
      [problemId],
    );

    const [learningRows] = await connection.execute(
    `
      SELECT topic_id
      FROM learning_topic_problems
      WHERE problem_id = ?
      LIMIT 1
      FOR UPDATE
    `,
    [problemId],
  );

  const hasSubmissions = submissionRows.length > 0;
  const hasContestHistory = contestRows.length > 0;
  const hasLearningLinks = learningRows.length > 0;

  if (hasSubmissions || hasContestHistory || hasLearningLinks) {
    await connection.rollback();

    const reasons = [];

    if (hasSubmissions) {
      reasons.push("it has submissions");
    }

    if (hasContestHistory) {
      reasons.push("it has contest history");
    }

    if (hasLearningLinks) {
      reasons.push("it is attached to learning lessons");
    }

    const reasonText =
      reasons.length <= 2
        ? reasons.join(" and ")
        : `${reasons.slice(0, -1).join(", ")}, and ${reasons[reasons.length - 1]}`;

    const guidance = hasLearningLinks
      ? " Detach it from all lessons first. Existing submissions or contest history will still prevent deletion."
      : "";

    return res.status(409).json({
      error: `Cannot delete this problem because ${reasonText}.${guidance}`,
      has_submissions: hasSubmissions,
      has_contest_history: hasContestHistory,
      has_learning_links: hasLearningLinks,
    });
  }

    const problem = problemRows[0];

    await connection.execute("DELETE FROM test_cases WHERE problem_id = ?", [
      problemId,
    ]);

    await connection.execute("DELETE FROM problems WHERE id = ?", [problemId]);

    await writeAuditLog(connection, {
      req,
      action: "problem_deleted",
      category: "problem_management",
      targetType: "problem",
      targetId: problemId,
      description: `Deleted problem "${problem.title}".`,
      details: {
        title: problem.title,
        submission_count: 0,
        contest_history_count: 0,
      },
    });

    await connection.commit();

    return res.json({
      id: problemId,
      message: `Problem "${problem.title}" deleted successfully.`,
    });
  } catch (error) {
    if (connection) {
      await connection.rollback().catch(() => {});
    }

    if (error.code === "ER_ROW_IS_REFERENCED_2" || error.errno === 1451) {
      return res.status(409).json({
        error:
          "This problem has related records and cannot be deleted. Refresh the page and try again.",
      });
    }

    if (
      error.code === "ER_LOCK_DEADLOCK" ||
      error.code === "ER_LOCK_WAIT_TIMEOUT"
    ) {
      return res.status(409).json({
        error: "The problem is currently being modified. Please try again.",
      });
    }

    console.error("Delete problem error:", error);

    return res.status(500).json({
      error: "Unable to delete the problem.",
    });
  } finally {
    connection?.release();
  }
});


router.post("/contests", async (req, res) => {
  const { title, description, start_time, end_time, problem_ids = [] } =
    req.body;

  if (!title || !start_time || !end_time) {
    return res.status(400).json({
      error: "title, start_time, and end_time are required.",
    });
  }

  if (!Array.isArray(problem_ids)) {
    return res.status(400).json({
      error: "problem_ids must be an array.",
    });
  }

  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [contest] = await connection.execute(
      `INSERT INTO contests
        (title, description, start_time, end_time, created_by, is_public)
       VALUES (?, ?, ?, ?, ?, true)`,
      [title, description || null, start_time, end_time, req.user.userId],
    );

    const contestId = contest.insertId;
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    for (let i = 0; i < problem_ids.length; i += 1) {
      if (i >= letters.length) {
        throw problemHttpError(
          400,
          "A contest can contain at most 26 problems.",
        );
      }

      await connection.execute(
        `INSERT INTO contest_problems
          (contest_id, problem_id, serial_letter)
         VALUES (?, ?, ?)`,
        [contestId, problem_ids[i], letters[i]],
      );
    }

    await writeAuditLog(connection, {
      req,
      action: "contest_created",
      category: "contest_management",
      targetType: "contest",
      targetId: contestId,
      description: `Created contest "${title}".`,
      details: {
        title,
        start_time: start_time,
        end_time: end_time,
        is_public: true,
        problem_ids,
      },
    });

    await connection.commit();

    const [rows] = await connection.execute(
      "SELECT * FROM contests WHERE id = ?",
      [contestId],
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    if (connection) {
      await connection.rollback().catch(() => {});
    }

    const expected =
      Number.isInteger(err.statusCode) &&
      err.statusCode >= 400 &&
      err.statusCode < 500;

    if (!expected) {
      console.error("Create contest error:", err);
    }

    res.status(expected ? err.statusCode : 500).json({
      error: expected ? err.message : "Unable to create contest.",
    });
  } finally {
    connection?.release();
  }
});


router.get("/contests", async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT c.*,
        (
          SELECT COUNT(*)
          FROM contest_problems cp
          WHERE cp.contest_id = c.id
            AND cp.withdrawn_at IS NULL
        ) AS problem_count
      FROM contests c
      ORDER BY c.start_time DESC, c.id DESC
    `);

    return res.json(rows);
  } catch (error) {
    console.error("Admin contest list error:", error);

    return res.status(500).json({
      error: "Unable to load contests.",
    });
  }
});


router.get("/contests/:contestId/problems", async (req, res) => {
  const contestId = Number(req.params.contestId);

  if (!Number.isInteger(contestId) || contestId <= 0) {
    return res.status(400).json({ error: "Invalid contest ID." });
  }

  try {
    const [contestRows] = await db.execute(
      "SELECT id FROM contests WHERE id = ?",
      [contestId],
    );

    if (contestRows.length === 0) {
      return res.status(404).json({ error: "Contest not found." });
    }

    const [rows] = await db.execute(
      `SELECT
        p.id,
        COALESCE(NULLIF(TRIM(cp.display_title), ''), p.title) AS title,
        p.title AS original_title,
        cp.display_title,
        p.difficulty,
        p.time_limit_ms,
        p.memory_limit_kb,
        cp.serial_letter,
        cp.withdrawn_at,
        cp.withdrawn_reason
      FROM contest_problems AS cp
      INNER JOIN problems AS p
        ON p.id = cp.problem_id
      WHERE cp.contest_id = ?
      ORDER BY cp.serial_letter ASC, p.id ASC`,
      [contestId],
    );

    res.json(rows);
  } catch (err) {
    console.error("Get contest problems error:", err);
    res.status(500).json({ error: "Unable to load contest problems." });
  }
});


async function handleLiveProblem(req, res, action) {
  try {
    const result = await changeContestProblem({
      req,
      contestId: req.params.contestId,
      problemId:
        action === "add" ? req.body?.problem_id : req.params.problemId,
      adminId: req.user.userId,
      action,
      reason: req.body?.reason,
      expectedRevision: req.body?.expected_revision,
      displayTitle: action === "add" ? req.body?.display_title : undefined,
    });

    return res.status(action === "add" ? 201 : 200).json(result);
  } catch (error) {
    const expected =
      Number.isInteger(error.statusCode) &&
      error.statusCode >= 400 &&
      error.statusCode < 500;

    if (!expected) {
      console.error("Live contest problem error:", error);
    }

    return res.status(expected ? error.statusCode : 500).json({
      error: expected ? error.message : "Unable to change contest problems.",
    });
  }
}


router.post("/contests/:contestId/problems", (req, res) =>
  handleLiveProblem(req, res, "add"),
);

router.delete("/contests/:contestId/problems/:problemId", (req, res) =>
  handleLiveProblem(req, res, "withdraw"),
);


router.get("/submissions", async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT
        s.id,
        s.user_id,
        u.name AS user_name,
        u.email AS user_email,
        s.problem_id,
        p.title AS problem_title,
        s.language,
        s.verdict,
        s.score,
        s.time_used_ms,
        s.memory_used_kb,
        s.submitted_at
      FROM submissions AS s
      INNER JOIN users AS u
        ON u.id = s.user_id
      INNER JOIN problems AS p
        ON p.id = s.problem_id
      ORDER BY s.submitted_at DESC, s.id DESC
      LIMIT 100`,
    );

    res.json(rows);
  } catch (err) {
    console.error("Admin submissions error:", err);
    res.status(500).json({ error: "Unable to load submissions." });
  }
});


router.get("/users", async (req, res) => {
  const search = String(req.query.search || "").trim();

  try {
    const searchPattern = `%${search}%`;

    const [rows] = await db.execute(
      `SELECT
        u.id,
        u.name,
        u.email,
        u.role,
        u.status,
        u.created_at,
        u.suspended_at,
        u.suspended_reason,
        COUNT(s.id) AS submission_count,
        SUM(CASE WHEN s.verdict = 'Accepted' THEN 1 ELSE 0 END) AS accepted_count
      FROM users AS u
      LEFT JOIN submissions AS s
        ON s.user_id = u.id
      WHERE (? = '' OR u.name LIKE ? OR u.email LIKE ?)
      GROUP BY
        u.id,
        u.name,
        u.email,
        u.role,
        u.status,
        u.created_at,
        u.suspended_at,
        u.suspended_reason
      ORDER BY u.created_at DESC, u.id DESC`,
      [search, searchPattern, searchPattern],
    );

    res.json(rows);
  } catch (err) {
    console.error("Admin users list error:", err);
    res.status(500).json({ error: "Unable to load users." });
  }
});


router.get("/users/:userId", async (req, res) => {
  const userId = Number(req.params.userId);

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: "Invalid user ID." });
  }

  try {
    const [rows] = await db.execute(
      `SELECT
        u.id,
        u.name,
        u.email,
        u.role,
        u.status,
        u.created_at,
        u.suspended_at,
        u.suspended_reason,
        COUNT(s.id) AS submission_count,
        SUM(CASE WHEN s.verdict = 'Accepted' THEN 1 ELSE 0 END) AS accepted_count
      FROM users AS u
      LEFT JOIN submissions AS s
        ON s.user_id = u.id
      WHERE u.id = ?
      GROUP BY
        u.id,
        u.name,
        u.email,
        u.role,
        u.status,
        u.created_at,
        u.suspended_at,
        u.suspended_reason`,
      [userId],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("Admin user details error:", err);
    res.status(500).json({ error: "Unable to load user details." });
  }
});


router.patch("/users/:userId/role", async (req, res) => {
  const userId = Number(req.params.userId);
  const newRole = String(req.body.role || "").toLowerCase();

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: "Invalid user ID." });
  }

  if (!VALID_ROLES.includes(newRole)) {
    return res.status(400).json({
      error: "Role must be either 'student' or 'admin'.",
    });
  }

  if (userId === Number(req.user.userId)) {
    return res.status(400).json({
      error: "You cannot change your own role.",
    });
  }

  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [userRows] = await connection.execute(
      `SELECT
        id,
        name,
        email,
        role,
        status,
        suspended_at,
        suspended_reason
      FROM users
      WHERE id = ?
      LIMIT 1
      FOR UPDATE`,
      [userId],
    );

    if (userRows.length === 0) {
      await connection.rollback();

      return res.status(404).json({ error: "User not found." });
    }

    const targetUser = userRows[0];

    if (targetUser.role === newRole) {
      await connection.rollback();

      return res.json({
        message: "User already has this role.",
        user: targetUser,
      });
    }

    if (
      targetUser.role === "admin" &&
      targetUser.status === "active" &&
      newRole !== "admin"
    ) {
      const activeAdminCount = await countActiveAdmins();

      if (activeAdminCount <= 1) {
        await connection.rollback();

        return res.status(400).json({
          error: "The last active administrator cannot be demoted.",
        });
      }
    }

    await connection.execute("UPDATE users SET role = ? WHERE id = ?", [
      newRole,
      userId,
    ]);

    await writeAuditLog(connection, {
      req,
      action: "role_changed",
      category: "user_management",
      targetType: "user",
      targetId: userId,
      description: `Changed role for ${targetUser.name} from ${targetUser.role} to ${newRole}.`,
      details: {
        target_name: targetUser.name,
        target_email: targetUser.email,
      },
      changes: diffChanges(targetUser, { role: newRole }, ["role"]),
    });

    await connection.commit();

    const [updatedRows] = await db.execute(
      `SELECT
        id,
        name,
        email,
        role,
        status,
        created_at,
        suspended_at,
        suspended_reason
      FROM users
      WHERE id = ?`,
      [userId],
    );

    res.json({
      message: "User role updated successfully.",
      user: updatedRows[0],
    });
  } catch (err) {
    if (connection) {
      await connection.rollback().catch(() => {});
    }

    console.error("Update user role error:", err);
    res.status(500).json({ error: "Unable to update user role." });
  } finally {
    connection?.release();
  }
});


router.patch("/users/:userId/status", async (req, res) => {
  const userId = Number(req.params.userId);
  const newStatus = String(req.body.status || "").toLowerCase();
  const reason = String(req.body.reason || "").trim();

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: "Invalid user ID." });
  }

  if (!VALID_STATUSES.includes(newStatus)) {
    return res.status(400).json({
      error: "Status must be 'active', 'suspended', or 'deleted'.",
    });
  }

  if (userId === Number(req.user.userId)) {
    return res.status(400).json({
      error: "You cannot change your own account status.",
    });
  }

  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [userRows] = await connection.execute(
      `SELECT
        id,
        name,
        email,
        role,
        status,
        suspended_at,
        suspended_reason
      FROM users
      WHERE id = ?
      LIMIT 1
      FOR UPDATE`,
      [userId],
    );

    if (userRows.length === 0) {
      await connection.rollback();

      return res.status(404).json({ error: "User not found." });
    }

    const targetUser = userRows[0];

    if (targetUser.status === newStatus) {
      await connection.rollback();

      return res.json({
        message: "User already has this status.",
        user: targetUser,
      });
    }

    const removesActiveAdmin =
      targetUser.role === "admin" &&
      targetUser.status === "active" &&
      newStatus !== "active";

    if (removesActiveAdmin) {
      const activeAdminCount = await countActiveAdmins();

      if (activeAdminCount <= 1) {
        await connection.rollback();

        return res.status(400).json({
          error: "The last active administrator cannot be suspended or deleted.",
        });
      }
    }

    const suspendedAt = newStatus === "suspended" ? new Date() : null;
    const suspendedReason = newStatus === "suspended" ? reason || null : null;

    await connection.execute(
      `UPDATE users
       SET status = ?, suspended_at = ?, suspended_reason = ?
       WHERE id = ?`,
      [newStatus, suspendedAt, suspendedReason, userId],
    );

    const actionMap = {
      active: "user_restored",
      suspended: "user_suspended",
      deleted: "user_soft_deleted",
    };

    await writeAuditLog(connection, {
      req,
      action: actionMap[newStatus],
      category: "user_management",
      targetType: "user",
      targetId: userId,
      description: `Changed status for ${targetUser.name} from ${targetUser.status} to ${newStatus}.`,
      details: {
        target_name: targetUser.name,
        target_email: targetUser.email,
      },
      changes: diffChanges(
        targetUser,
        {
          status: newStatus,
          suspended_at: suspendedAt,
          suspended_reason: suspendedReason,
        },
        ["status", "suspended_at", "suspended_reason"],
      ),
      reason: newStatus === "suspended" ? reason || null : null,
    });

    await connection.commit();

    const [updatedRows] = await db.execute(
      `SELECT
        id,
        name,
        email,
        role,
        status,
        created_at,
        suspended_at,
        suspended_reason
      FROM users
      WHERE id = ?`,
      [userId],
    );

    res.json({
      message: "User status updated successfully.",
      user: updatedRows[0],
    });
  } catch (err) {
    if (connection) {
      await connection.rollback().catch(() => {});
    }

    console.error("Update user status error:", err);
    res.status(500).json({ error: "Unable to update user status." });
  } finally {
    connection?.release();
  }
});


function auditQueryError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}


function auditQueryString(query, key, maxLength = 100) {
  const value = query[key];

  if (value === undefined) return "";

  if (typeof value !== "string") {
    throw auditQueryError(`${key} must be a single string.`);
  }

  const normalized = value.trim();

  if (normalized.length > maxLength) {
    throw auditQueryError(
      `${key} must not exceed ${maxLength} characters.`,
    );
  }

  return normalized;
}


function auditPositiveInteger(value, label, fallback, maximum) {
  if (value === "") return fallback;

  if (!/^[1-9]\d*$/.test(value)) {
    throw auditQueryError(`${label} must be a positive integer.`);
  }

  const number = Number(value);

  if (!Number.isSafeInteger(number) || number > maximum) {
    throw auditQueryError(
      `${label} must not exceed ${maximum}.`,
    );
  }

  return number;
}


function auditDate(value, label) {
  if (!value) return null;

  // Require explicit UTC to avoid browser/server timezone ambiguity.
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    throw auditQueryError(
      `${label} must be a UTC ISO timestamp, for example 2026-10-28T00:00:00.000Z.`,
    );
  }

  const date = new Date(value);

  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString() !== value
  ) {
    throw auditQueryError(`${label} is not a valid timestamp.`);
  }

  return date;
}


function auditSearchPattern(value) {
  // Treat LIKE wildcard characters as literal search text.
  return `%${value.replace(/[!%_]/g, (character) => `!${character}`)}%`;
}


function parseAuditJson(value) {
  if (value === null || value === undefined) return null;

  // mysql2 may already return parsed JSON.
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return {
      unavailable: true,
      note: "Stored metadata could not be decoded.",
    };
  }
}


// List audit events. Authentication and admin authorization are
// inherited from router.use(requireAuth, requireAdmin).
router.get("/audit-logs", async (req, res) => {
  try {
    const allowedParameters = new Set([
      "page",
      "page_size",
      "search",
      "action",
      "category",
      "admin_id",
      "target_type",
      "target_id",
      "outcome",
      "from",
      "to",
      "sort",
    ]);

    for (const key of Object.keys(req.query)) {
      if (!allowedParameters.has(key)) {
        throw auditQueryError(
          `Unsupported query parameter: ${key}.`,
        );
      }
    }

    const requestedPage = auditPositiveInteger(
      auditQueryString(req.query, "page", 10),
      "page",
      1,
      1000000,
    );

    const pageSize = auditPositiveInteger(
      auditQueryString(req.query, "page_size", 3),
      "page_size",
      25,
      100,
    );

    const search = auditQueryString(req.query, "search", 150);
    const action = auditQueryString(req.query, "action", 100);
    const category = auditQueryString(req.query, "category", 50);
    const adminIdValue = auditQueryString(req.query, "admin_id", 10);
    const targetType = auditQueryString(req.query, "target_type", 50);
    const targetId = auditQueryString(req.query, "target_id", 64);
    const outcome = auditQueryString(req.query, "outcome", 20);
    const sort =
      auditQueryString(req.query, "sort", 10) || "newest";

    const from = auditDate(
      auditQueryString(req.query, "from", 24),
      "from",
    );

    const to = auditDate(
      auditQueryString(req.query, "to", 24),
      "to",
    );

    if (!["newest", "oldest"].includes(sort)) {
      throw auditQueryError("sort must be newest or oldest.");
    }

    if (
      outcome &&
      !["success", "failure", "denied"].includes(outcome)
    ) {
      throw auditQueryError(
        "outcome must be success, failure, or denied.",
      );
    }

    if (from && to && from.getTime() > to.getTime()) {
      throw auditQueryError(
        "from must be earlier than or equal to to.",
      );
    }

    const adminId = adminIdValue
      ? auditPositiveInteger(
          adminIdValue,
          "admin_id",
          null,
          2147483647,
        )
      : null;

    const conditions = [];
    const values = [];

    if (action) {
      conditions.push("a.action = ?");
      values.push(action);
    }

    if (category) {
      conditions.push("a.category = ?");
      values.push(category);
    }

    if (adminId !== null) {
      conditions.push("a.admin_id = ?");
      values.push(adminId);
    }

    if (targetType) {
      conditions.push("a.target_type = ?");
      values.push(targetType);
    }

    if (targetId) {
      conditions.push("a.target_id = ?");
      values.push(targetId);
    }

    if (outcome) {
      conditions.push("a.outcome = ?");
      values.push(outcome);
    }

    if (from) {
      conditions.push("a.created_at >= ?");
      values.push(from);
    }

    if (to) {
      conditions.push("a.created_at <= ?");
      values.push(to);
    }

    if (search) {
      const pattern = auditSearchPattern(search);

      conditions.push(`
        (
          a.description LIKE ? ESCAPE '!'
          OR a.action LIKE ? ESCAPE '!'
          OR a.target_type LIKE ? ESCAPE '!'
          OR a.target_id LIKE ? ESCAPE '!'
          OR CAST(a.id AS CHAR) LIKE ? ESCAPE '!'
          OR CAST(a.admin_id AS CHAR) LIKE ? ESCAPE '!'
          OR COALESCE(NULLIF(a.admin_name, ''), u.name, '')
            LIKE ? ESCAPE '!'
          OR COALESCE(NULLIF(a.admin_email, ''), u.email, '')
            LIKE ? ESCAPE '!'
        )
      `);

      values.push(
        pattern,
        pattern,
        pattern,
        pattern,
        pattern,
        pattern,
        pattern,
        pattern,
      );
    }

    const where = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const [countRows] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM admin_audit_logs AS a
       LEFT JOIN users AS u ON u.id = a.admin_id
       ${where}`,
      values,
    );

    const total = Number(countRows[0].total);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const offset = (page - 1) * pageSize;

    const direction = sort === "oldest" ? "ASC" : "DESC";

    // pageSize and offset are validated server-generated integers.
    const [rows] = await db.execute(
      `SELECT
        a.id,
        a.admin_id,
        COALESCE(
          NULLIF(a.admin_name, ''),
          u.name,
          CONCAT('Administrator #', a.admin_id),
          'Unknown administrator'
        ) AS admin_name,
        COALESCE(
          NULLIF(a.admin_email, ''),
          u.email
        ) AS admin_email,
        a.action,
        a.category,
        a.target_type,
        a.target_id,
        a.description,
        a.outcome,
        a.created_at
      FROM admin_audit_logs AS a
      LEFT JOIN users AS u ON u.id = a.admin_id
      ${where}
      ORDER BY a.created_at ${direction}, a.id ${direction}
      LIMIT ${pageSize} OFFSET ${offset}`,
      values,
    );

    return res.json({
      items: rows,
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: totalPages,
        from: total ? offset + 1 : 0,
        to: Math.min(offset + pageSize, total),
      },
      sort,
    });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({
        error: error.message,
      });
    }

    console.error("Admin audit log list error:", error);

    return res.status(500).json({
      error: "Unable to load audit logs.",
    });
  }
});


// Read one event, including safe metadata and before/after changes.
router.get("/audit-logs/:id", async (req, res) => {
  const id = req.params.id;

  // Keep BIGINT event IDs as strings to avoid JS precision loss.
  if (
    !/^[1-9]\d{0,19}$/.test(id) ||
    BigInt(id) > 18446744073709551615n
  ) {
    return res.status(400).json({
      error: "Invalid audit event ID.",
    });
  }

  try {
    const [rows] = await db.execute(
      `SELECT
        a.id,
        a.admin_id,
        COALESCE(
          NULLIF(a.admin_name, ''),
          u.name,
          CONCAT('Administrator #', a.admin_id),
          'Unknown administrator'
        ) AS admin_name,
        COALESCE(
          NULLIF(a.admin_email, ''),
          u.email
        ) AS admin_email,
        a.action,
        a.category,
        a.target_type,
        a.target_id,
        a.description,
        a.details,
        a.changes,
        a.reason,
        a.outcome,
        a.ip_address,
        a.user_agent,
        a.request_id,
        a.created_at
      FROM admin_audit_logs AS a
      LEFT JOIN users AS u ON u.id = a.admin_id
      WHERE a.id = ?
      LIMIT 1`,
      [id],
    );

    if (!rows.length) {
      return res.status(404).json({
        error: "Audit event not found.",
      });
    }

    return res.json({
      ...rows[0],
      details: parseAuditJson(rows[0].details),
      changes: parseAuditJson(rows[0].changes),
    });
  } catch (error) {
    console.error("Admin audit log detail error:", error);

    return res.status(500).json({
      error: "Unable to load audit event.",
    });
  }
});


// POST create a draft lesson at the end of a course.
router.post("/learning/topics", async (req, res) => {
  const body = req.body;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({
      error: "A JSON object is required.",
    });
  }

  const allowedFields = new Set([
    "subject_id",
    "title",
    "content",
    "starter_code",
  ]);

  if (Object.keys(body).some((key) => !allowedFields.has(key))) {
    return res.status(400).json({
      error: "Unsupported lesson fields.",
    });
  }

  const subjectId = body.subject_id;

  if (
    !Number.isSafeInteger(subjectId) ||
    subjectId <= 0 ||
    subjectId > 2147483647
  ) {
    return res.status(400).json({
      error: "subject_id must be a positive integer.",
    });
  }

  if (
    typeof body.title !== "string" ||
    !body.title.trim() ||
    Array.from(body.title.trim()).length > 255
  ) {
    return res.status(400).json({
      error: "Title must contain between 1 and 255 characters.",
    });
  }

  const title = body.title.trim();
  const content = body.content ?? "";
  const starterCode = body.starter_code ?? "";

  if (
    typeof content !== "string" ||
    Buffer.byteLength(content, "utf8") > 32 * 1024
  ) {
    return res.status(400).json({
      error: "Lesson content must be text of at most 32 KB.",
    });
  }

  if (
    typeof starterCode !== "string" ||
    Buffer.byteLength(starterCode, "utf8") > 16 * 1024
  ) {
    return res.status(400).json({
      error: "Starter code must be text of at most 16 KB.",
    });
  }

  let connection;
  let transactionStarted = false;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    // Serialize lesson creation within this course.
    const [subjects] = await connection.execute(
      `
        SELECT id, name
        FROM semester_subjects
        WHERE id = ?
        FOR UPDATE
      `,
      [subjectId],
    );

    if (!subjects.length) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(404).json({
        error: "Course not found.",
      });
    }

    const [positions] = await connection.execute(
      `
        SELECT COALESCE(MAX(order_index), -1) AS last_position
        FROM learn_topics
        WHERE subject_id = ?
      `,
      [subjectId],
    );

    const orderIndex = Number(positions[0].last_position) + 1;

    if (!Number.isSafeInteger(orderIndex) || orderIndex > 2147483647) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(409).json({
        error: "Lesson ordering needs adjustment before adding a lesson.",
      });
    }

    const [result] = await connection.execute(
      `
        INSERT INTO learn_topics (
          subject_id,
          order_index,
          title,
          content,
          starter_code,
          status
        )
        VALUES (?, ?, ?, ?, ?, 'draft')
      `,
      [subjectId, orderIndex, title, content, starterCode],
    );

    await writeAuditLog(connection, {
      req,
      action: "learning_topic_created",
      category: "learning_management",
      targetType: "learning_topic",
      targetId: result.insertId,
      description: `Created draft lesson "${title}".`,
      details: {
        subject_id: subjectId,
        subject_name: subjects[0].name,
        content_bytes: Buffer.byteLength(content, "utf8"),
        starter_code_bytes: Buffer.byteLength(starterCode, "utf8"),
      },
      changes: {
        title: { before: null, after: title },
        subject_id: { before: null, after: subjectId },
        order_index: { before: null, after: orderIndex },
        status: { before: null, after: "draft" },
      },
    });

    const [rows] = await connection.execute(
      `
        SELECT
          id,
          subject_id,
          order_index,
          title,
          content,
          starter_code,
          status,
          created_at,
          updated_at
        FROM learn_topics
        WHERE id = ?
        LIMIT 1
      `,
      [result.insertId],
    );

    await connection.commit();
    transactionStarted = false;

    return res.status(201).json(rows[0]);
  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Create lesson rollback error:", rollbackError);
      }
    }

    console.error("Create learning topic error:", error);

    return res.status(500).json({
      error: "Unable to create the draft lesson.",
    });
  } finally {
    connection?.release();
  }
});

module.exports = router;