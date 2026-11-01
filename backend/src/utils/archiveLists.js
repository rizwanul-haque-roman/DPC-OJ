const db = require("../db");
const { getContestClock } = require("./contestClock");

function inputError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}
function text(query, key, fallback = "") {
  if (query[key] === undefined) return fallback;
  if (typeof query[key] !== "string") throw inputError(`Invalid ${key}.`);
  return query[key].trim();
}
function positive(query, key, fallback) {
  const value = text(query, key, String(fallback));
  const number = Number(value);
  if (
    !/^[1-9]\d*$/.test(value) ||
    !Number.isSafeInteger(number) ||
    number > 1000000
  )
    throw inputError(`Invalid ${key}.`);
  return number;
}
function pattern(value) {
  return `%${value.replace(/[!%_]/g, (char) => `!${char}`)}%`;
}
function archiveHandler(kind) {
  return async (req, res) => {
    let connection;
    let transaction = false;
    try {
      const requestedPage = positive(req.query, "page", 1);
      const pageSize = positive(req.query, "page_size", 10);
      if (![10, 25, 50].includes(pageSize))
        throw inputError("page_size must be 10, 25, or 50.");
      const q = text(req.query, "q");
      if (q.length > 100)
        throw inputError("Search must not exceed 100 characters.");
      const sort = text(req.query, "sort", "newest");
      if (!["newest", "oldest"].includes(sort))
        throw inputError("Invalid sort.");
      const status = text(req.query, "status", "all");
      const difficulty = text(req.query, "difficulty", "all");
      const subject = text(req.query, "subject_id", "all");
      if (
        kind === "contests" &&
        !["all", "live", "upcoming", "ended", "invalid"].includes(status)
      )
        throw inputError("Invalid status.");
      if (
        kind === "problems" &&
        !["all", "easy", "medium", "hard"].includes(difficulty)
      )
        throw inputError("Invalid difficulty.");
      if (
        kind === "problems" &&
        subject !== "all" &&
        (!/^[1-9]\d*$/.test(subject) || !Number.isSafeInteger(Number(subject)))
      )
        throw inputError("Invalid subject_id.");
      connection = await db.getConnection();
      await connection.beginTransaction();
      transaction = true;
      const [clockRows] = await connection.execute(
        "SELECT NOW(3) AS server_now",
      );
      const now = clockRows[0].server_now;
      let base, baseParams, summarySql;
      if (kind === "contests") {
        base = `SELECT c.id, c.title, c.description, c.start_time, c.end_time, c.ended_at, c.revision,
          COALESCE(c.ended_at, c.end_time) AS effective_end_time,
          CASE
            WHEN c.end_time <= c.start_time OR (c.ended_at IS NOT NULL AND (c.ended_at <= c.start_time OR c.ended_at > c.end_time)) THEN 'invalid'
            WHEN c.start_time > ? THEN 'upcoming'
            WHEN COALESCE(c.ended_at, c.end_time) <= ? THEN 'ended'
            ELSE 'live' END AS status
          FROM contests c WHERE c.is_public = true`;
        baseParams = [now, now];
        summarySql = `SELECT COUNT(*) AS total, COALESCE(SUM(a.status='live'),0) AS live,
          COALESCE(SUM(a.status='upcoming'),0) AS upcoming, COALESCE(SUM(a.status='ended'),0) AS ended,
          COALESCE(SUM(a.status='invalid'),0) AS invalid FROM (${base}) a`;
      } else {
        base = `SELECT p.id, p.title, p.difficulty, p.subject_id, p.created_at, s.name AS subject_name
          FROM problems p LEFT JOIN subjects s ON s.id=p.subject_id WHERE p.is_public=true`;
        baseParams = [];
        summarySql = `SELECT COUNT(*) AS total, COALESCE(SUM(LOWER(a.difficulty)='easy'),0) AS easy,
          COALESCE(SUM(LOWER(a.difficulty)='medium'),0) AS medium, COALESCE(SUM(LOWER(a.difficulty)='hard'),0) AS hard FROM (${base}) a`;
      }
      const conditions = [];
      const filterParams = [];
      if (q) {
        const columns =
          kind === "contests"
            ? ["a.title", "a.description", "CAST(a.id AS CHAR)"]
            : [
                "a.title",
                "a.subject_name",
                "a.difficulty",
                "CAST(a.id AS CHAR)",
              ];
        conditions.push(
          `(${columns.map((column) => `${column} LIKE ? ESCAPE '!'`).join(" OR ")})`,
        );
        filterParams.push(...columns.map(() => pattern(q)));
      }
      if (kind === "contests" && status !== "all") {
        conditions.push("a.status = ?");
        filterParams.push(status);
      }
      if (kind === "problems" && difficulty !== "all") {
        conditions.push("LOWER(a.difficulty) = ?");
        filterParams.push(difficulty);
      }
      if (kind === "problems" && subject !== "all") {
        conditions.push("a.subject_id = ?");
        filterParams.push(Number(subject));
      }
      const where = conditions.length
        ? ` WHERE ${conditions.join(" AND ")}`
        : "";
      const [summaryRows] = await connection.execute(summarySql, baseParams);
      const [countRows] = await connection.execute(
        `SELECT COUNT(*) AS total FROM (${base}) a${where}`,
        [...baseParams, ...filterParams],
      );
      const total = Number(countRows[0].total);
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(requestedPage, totalPages);
      const offset = (page - 1) * pageSize;
      const direction = sort === "newest" ? "DESC" : "ASC";
      const order =
        kind === "contests"
          ? `a.start_time ${direction}, a.id ${direction}`
          : `a.created_at ${direction}, a.id ${direction}`;
      const [rows] = await connection.execute(
        `SELECT a.* FROM (${base}) a${where} ORDER BY ${order} LIMIT ${pageSize} OFFSET ${offset}`,
        [...baseParams, ...filterParams],
      );
      await connection.commit();
      transaction = false;
      return res.json({
        items:
          kind === "contests"
            ? rows.map((row) => ({ ...row, ...getContestClock(row, now) }))
            : rows,
        pagination: {
          page,
          page_size: pageSize,
          total,
          total_pages: totalPages,
          from: total ? offset + 1 : 0,
          to: Math.min(offset + pageSize, total),
        },
        summary: Object.fromEntries(
          Object.entries(summaryRows[0]).map(([key, value]) => [
            key,
            Number(value),
          ]),
        ),
        server_time: now.toISOString(),
      });
    } catch (error) {
      if (transaction && connection) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          console.error("Archive rollback error:", rollbackError);
        }
      }
      if (error.statusCode !== 400) console.error("Archive list error:", error);
      return res
        .status(error.statusCode === 400 ? 400 : 500)
        .json({
          error:
            error.statusCode === 400
              ? error.message
              : "Unable to load the archive.",
        });
    } finally {
      if (connection) connection.release();
    }
  };
}
module.exports = { archiveHandler };
