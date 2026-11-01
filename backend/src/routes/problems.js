const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

function optionalAuth(req, res, next) {
  if (req.headers.authorization !== undefined) {
    return requireAuth(req, res, next);
  }

  return next();
}

// Public problem list, with personal solved status when authenticated.
router.get("/", optionalAuth, async (req, res) => {
  const { subject_id } = req.query;
  const userId = req.user?.userId ?? null;

  // This response can contain user-specific solved status.
  res.set("Cache-Control", "private, no-store");
  res.vary("Authorization");

  try {
    let query = `
      SELECT
        p.*,
        s.name AS subject_name,
        EXISTS (
          SELECT 1
          FROM submissions AS sub
          WHERE sub.problem_id = p.id
            AND sub.user_id = ?
            AND sub.verdict = 'Accepted'
        ) AS is_solved
      FROM problems AS p
      LEFT JOIN subjects AS s
        ON p.subject_id = s.id
      WHERE p.is_public = true
    `;

    const params = [userId];

    if (subject_id) {
      query += " AND p.subject_id = ?";
      params.push(subject_id);
    }

    query += " ORDER BY p.created_at DESC, p.id DESC";

    const [rows] = await db.execute(query, params);

    return res.json(
      rows.map((row) => ({
        ...row,
        is_solved: Number(row.is_solved) === 1,
      })),
    );
  } catch (err) {
    console.error("Problems list error:", err);

    return res.status(500).json({
      error: "Unable to load problems.",
    });
  }
});

// Must appear before "/:id".
router.get("/meta/subjects", async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT
        id,
        name,
        semester_no
      FROM subjects
      ORDER BY semester_no ASC, id ASC
    `);

    return res.json(rows);
  } catch (err) {
    console.error("Subjects list error:", err);

    return res.status(500).json({
      error: "Unable to load subjects.",
    });
  }
});

// Public problem details, including sample test cases only.
router.get("/:id", async (req, res) => {
  const problemId = Number(req.params.id);

  if (!Number.isSafeInteger(problemId) || problemId <= 0) {
    return res.status(400).json({
      error: "Invalid problem ID.",
    });
  }

  try {
    const [problemRows] = await db.execute(
      `
        SELECT
          p.*,
          s.name AS subject_name
        FROM problems AS p
        LEFT JOIN subjects AS s
          ON p.subject_id = s.id
        WHERE p.id = ?
          AND p.is_public = true
        LIMIT 1
      `,
      [problemId],
    );

    if (problemRows.length === 0) {
      return res.status(404).json({
        error: "Problem not found.",
      });
    }

    const [samples] = await db.execute(
      `
        SELECT
          id,
          input,
          expected_output
        FROM test_cases
        WHERE problem_id = ?
          AND is_sample = true
        ORDER BY id ASC
      `,
      [problemId],
    );

    const firstSample = samples[0] || {};

    return res.json({
      ...problemRows[0],
      sample_input: firstSample.input || "",
      sample_output: firstSample.expected_output || "",
      sample_tests: samples,
    });
  } catch (err) {
    console.error("Problem details error:", err);

    return res.status(500).json({
      error: "Unable to load problem details.",
    });
  }
});

module.exports = router;