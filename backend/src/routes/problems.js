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

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function readString(query, key, fallback = "") {
  const value = query[key];

  if (value === undefined) return fallback;

  if (typeof value !== "string") {
    throw badRequest(`${key} must be a single string.`);
  }

  return value.trim();
}

function readPositiveInteger(value, label, maximum) {
  if (!/^[1-9]\d*$/.test(value)) {
    throw badRequest(`${label} must be a positive integer.`);
  }

  const number = Number(value);

  if (!Number.isSafeInteger(number) || number > maximum) {
    throw badRequest(`${label} must not exceed ${maximum}.`);
  }

  return number;
}

function escapeLike(value) {
  return value.replace(/[!%_]/g, (character) => `!${character}`);
}

// Public problem list.
// Paginated requests return { items, pagination, summary }.
// Requests without pagination parameters retain the original array response.
router.get("/", optionalAuth, async (req, res) => {
  const userId = req.user?.userId ?? null;

  res.set("Cache-Control", "private, no-store");
  res.vary("Authorization");

  try {
    const paginated =
      req.query.paginated !== undefined ||
      req.query.page !== undefined ||
      req.query.page_size !== undefined;

    const paginatedValue = readString(req.query, "paginated");

    if (
      paginatedValue &&
      paginatedValue !== "1" &&
      paginatedValue !== "true"
    ) {
      throw badRequest("paginated must be 1 or true.");
    }

    const subjectValue = readString(req.query, "subject_id");
    const difficulty = readString(
      req.query,
      "difficulty",
      "all",
    ).toLowerCase();
    const search = readString(req.query, "q");

    if (!["all", "easy", "medium", "hard"].includes(difficulty)) {
      throw badRequest("Invalid difficulty filter.");
    }

    if (search.length > 100) {
      throw badRequest("Search must not exceed 100 characters.");
    }

    const conditions = ["p.is_public = true"];
    const filterValues = [];

    if (subjectValue && subjectValue !== "all") {
      const subjectId = readPositiveInteger(
        subjectValue,
        "subject_id",
        2147483647,
      );

      conditions.push("p.subject_id = ?");
      filterValues.push(subjectId);
    }

    if (difficulty !== "all") {
      conditions.push("LOWER(TRIM(p.difficulty)) = ?");
      filterValues.push(difficulty);
    }

    if (search) {
      const pattern = `%${escapeLike(search.toLowerCase())}%`;

      conditions.push(`
        (
          LOWER(p.title) LIKE ? ESCAPE '!'
          OR LOWER(p.difficulty) LIKE ? ESCAPE '!'
          OR LOWER(COALESCE(s.name, 'General')) LIKE ? ESCAPE '!'
          OR CAST(p.id AS CHAR) LIKE ? ESCAPE '!'
        )
      `);

      filterValues.push(pattern, pattern, pattern, pattern);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    // Backward compatibility for other pages using the original list.
    if (!paginated) {
      const [rows] = await db.execute(
        `
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
            ON s.id = p.subject_id
          ${where}
          ORDER BY p.created_at DESC, p.id DESC
        `,
        [userId, ...filterValues],
      );

      return res.json(
        rows.map((row) => ({
          ...row,
          is_solved: Number(row.is_solved) === 1,
        })),
      );
    }

    const requestedPage = readPositiveInteger(
      readString(req.query, "page", "1"),
      "page",
      1000000,
    );

    const pageSize = readPositiveInteger(
      readString(req.query, "page_size", "10"),
      "page_size",
      50,
    );

    if (![10, 25, 50].includes(pageSize)) {
      throw badRequest("page_size must be 10, 25, or 50.");
    }

    const [[countRows], [summaryRows]] = await Promise.all([
      db.execute(
        `
          SELECT COUNT(*) AS total
          FROM problems AS p
          LEFT JOIN subjects AS s
            ON s.id = p.subject_id
          ${where}
        `,
        filterValues,
      ),
      db.execute(`
        SELECT
          COUNT(*) AS total,
          COALESCE(
            SUM(LOWER(TRIM(difficulty)) = 'easy'), 0
          ) AS easy,
          COALESCE(
            SUM(LOWER(TRIM(difficulty)) = 'medium'), 0
          ) AS medium,
          COALESCE(
            SUM(LOWER(TRIM(difficulty)) = 'hard'), 0
          ) AS hard
        FROM problems
        WHERE is_public = true
      `),
    ]);

    const total = Number(countRows[0].total);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const offset = (page - 1) * pageSize;

    // LIMIT/OFFSET are interpolated only after integer validation.
    const [rows] = await db.execute(
      `
        SELECT
          p.id,
          p.title,
          p.difficulty,
          p.subject_id,
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
          ON s.id = p.subject_id
        ${where}
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `,
      [userId, ...filterValues],
    );

    const summary = summaryRows[0];

    return res.json({
      items: rows.map((row) => ({
        ...row,
        is_solved: Number(row.is_solved) === 1,
      })),
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: totalPages,
        from: total ? offset + 1 : 0,
        to: Math.min(offset + rows.length, total),
      },
      summary: {
        total: Number(summary.total),
        easy: Number(summary.easy),
        medium: Number(summary.medium),
        hard: Number(summary.hard),
      },
    });
  } catch (err) {
    if (err.statusCode === 400) {
      return res.status(400).json({
        error: err.message,
      });
    }

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