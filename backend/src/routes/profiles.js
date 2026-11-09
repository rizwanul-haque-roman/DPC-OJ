const express = require("express"),
  router = express.Router();
const db = require("../db"),
  bcrypt = require("bcryptjs");
const { requireAuth } = require("../middleware/auth");
const { streaks, contestStandings } = require("../utils/profileStats");
const publicVisibility = `p.is_public=true AND (s.contest_id IS NULL OR EXISTS(SELECT 1 FROM contests vc WHERE vc.id=s.contest_id AND vc.is_public=true AND COALESCE(vc.ended_at,vc.end_time)<=NOW(3)))`;
function bad(message, status = 400) {
  const error = new Error(message);
  error.statusCode = status;
  return error;
}
function number(value, fallback, max = 1000000) {
  if (value === undefined) return fallback;
  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) > max
  )
    throw bad("Invalid page or user ID.");
  return Number(value);
}
function handle(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      const known = [400, 401, 403, 404, 409].includes(error.statusCode);
      if (!known) console.error("Profile error:", error);
      res
        .status(known ? error.statusCode : 500)
        .json({
          error: known
            ? error.message
            : "Unable to process the profile request.",
        });
    }
  };
}
async function target(req, owner) {
  const id = owner ? req.user.userId : number(req.params.id, null);
  if (!id) throw bad("Invalid user ID.");
  const [rows] = await db.execute(
    `SELECT id,name,display_name,bio,institution,department,github_url,role,created_at${owner ? ",email" : ""} FROM users WHERE id=? AND status='active' LIMIT 1`,
    [id],
  );
  if (!rows.length) throw bad("Profile not found.", 404);
  return rows[0];
}
function visible(owner) {
  return owner ? "1=1" : publicVisibility;
}
async function overview(req, res, owner) {
  const user = await target(req, owner),
    visibility = visible(owner);
  const [clock] = await db.execute(
    "SELECT DATE_FORMAT(NOW(),'%Y-%m-%d') today,YEAR(NOW()) current_year,NOW(3) server_time",
  );
  const [summary] = await db.execute(
    `SELECT COUNT(*) submissions,COUNT(DISTINCT CASE WHEN s.verdict='Accepted' THEN s.problem_id END) solved,
    COALESCE(SUM(s.verdict='Accepted'),0) accepted_submissions,COUNT(DISTINCT s.contest_id) contests
    FROM submissions s INNER JOIN problems p ON p.id=s.problem_id WHERE s.user_id=? AND ${visibility}`,
    [user.id],
  );
  const [activity] = await db.execute(
    `SELECT DATE_FORMAT(s.submitted_at,'%Y-%m-%d') day,COUNT(*) submissions,COALESCE(SUM(s.verdict='Accepted'),0) accepted
    FROM submissions s INNER JOIN problems p ON p.id=s.problem_id WHERE s.user_id=? AND s.submitted_at IS NOT NULL AND s.submitted_at<=NOW(3) AND ${visibility}
    GROUP BY DATE_FORMAT(s.submitted_at,'%Y-%m-%d') ORDER BY day`,
    [user.id],
  );
  const [difficulty] = await db.execute(
    `SELECT d.difficulty,COUNT(*) solved FROM (
    SELECT DISTINCT p.id,LOWER(p.difficulty) difficulty FROM submissions s INNER JOIN problems p ON p.id=s.problem_id
    WHERE s.user_id=? AND s.verdict='Accepted' AND ${visibility}) d GROUP BY d.difficulty`,
    [user.id],
  );
  return res.json({
    user,
    owner,
    timezone: "Asia/Dhaka",
    today: clock[0].today,
    current_year: Number(clock[0].current_year),
    server_time: clock[0].server_time,
    summary: Object.fromEntries(
      Object.entries(summary[0]).map(([key, value]) => [key, Number(value)]),
    ),
    activity: activity.map((d) => ({
      ...d,
      submissions: Number(d.submissions),
      accepted: Number(d.accepted),
    })),
    streaks: streaks(activity, clock[0].today),
    difficulty,
  });
}
async function list(req, res, owner, kind) {
  const user = await target(req, owner),
    visibility = visible(owner);
  const requested = number(req.query.page, 1),
    size = number(req.query.page_size, 10, 50);
  if (![10, 25, 50].includes(size)) throw bad("Choose 10, 25, or 50 rows.");
  const date = req.query.date;
  if (
    date !== undefined &&
    (typeof date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date + "T00:00:00Z")) ||
      new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date)
  )
    throw bad("Invalid activity date.");
  const filters = [`s.user_id=?`, visibility],
    values = [user.id];
  if (date) {
    filters.push("DATE(s.submitted_at)=?");
    values.push(date);
  }
  const where = filters.join(" AND ");
  let total, items;
  if (kind === "contests") {
    const contestFilter = owner
      ? "1=1"
      : "c.is_public=true AND COALESCE(c.ended_at,c.end_time)<=NOW(3)";
    const [count] = await db.execute(
      `SELECT COUNT(DISTINCT c.id) total FROM submissions s INNER JOIN contests c ON c.id=s.contest_id INNER JOIN problems p ON p.id=s.problem_id WHERE s.user_id=? AND ${visibility} AND ${contestFilter}`,
      [user.id],
    );
    total = Number(count[0].total);
    const pages = Math.max(1, Math.ceil(total / size)),
      page = Math.min(requested, pages);
    const [rows] = await db.execute(
      `SELECT DISTINCT c.id,c.title,c.start_time,COALESCE(c.ended_at,c.end_time) effective_end_time
      FROM submissions s INNER JOIN contests c ON c.id=s.contest_id INNER JOIN problems p ON p.id=s.problem_id
      WHERE s.user_id=? AND ${visibility} AND ${contestFilter} ORDER BY c.start_time DESC,c.id DESC LIMIT ${size} OFFSET ${(page - 1) * size}`,
      [user.id],
    );
    items = [];
    for (const contest of rows) {
      const board = await contestStandings(db, contest.id);
      const entry = board.find((row) => row.user_id === Number(user.id));
      items.push({
        ...contest,
        ...(entry || {
          rank: null,
          solved: 0,
          total_score: 0,
          total_time_minutes: 0,
        }),
      });
    }
    return res.json({
      items,
      pagination: { page, page_size: size, total, total_pages: pages },
    });
  }
  if (kind === "solved") {
    const [count] = await db.execute(
      `SELECT COUNT(DISTINCT s.problem_id) total FROM submissions s INNER JOIN problems p ON p.id=s.problem_id WHERE ${where} AND s.verdict='Accepted'`,
      values,
    );
    total = Number(count[0].total);
  } else {
    const [count] = await db.execute(
      `SELECT COUNT(*) total FROM submissions s INNER JOIN problems p ON p.id=s.problem_id WHERE ${where}`,
      values,
    );
    total = Number(count[0].total);
  }
  const pages = Math.max(1, Math.ceil(total / size)),
    page = Math.min(requested, pages),
    offset = (page - 1) * size;
  if (kind === "solved") {
    const [rows] = await db.execute(
      `SELECT p.id,p.title,p.is_public,p.difficulty,sub.name subject_name,MIN(s.submitted_at) first_solved_at
      FROM submissions s INNER JOIN problems p ON p.id=s.problem_id LEFT JOIN subjects sub ON sub.id=p.subject_id
      WHERE ${where} AND s.verdict='Accepted' GROUP BY p.id,p.title,p.is_public,p.difficulty,sub.name ORDER BY first_solved_at DESC,p.id DESC LIMIT ${size} OFFSET ${offset}`,
      values,
    );
    items = rows;
  } else {
    const [rows] = await db.execute(
      `SELECT s.id,s.problem_id,s.contest_id,p.title,p.is_public,s.language,s.verdict,s.submitted_at
      FROM submissions s INNER JOIN problems p ON p.id=s.problem_id WHERE ${where} ORDER BY s.submitted_at DESC,s.id DESC LIMIT ${size} OFFSET ${offset}`,
      values,
    );
    items = rows;
  }
  return res.json({
    items,
    pagination: { page, page_size: size, total, total_pages: pages },
  });
}
router.get(
  "/me",
  requireAuth,
  handle((req, res) => overview(req, res, true)),
);
for (const kind of ["solved", "submissions", "contests"])
  router.get(
    `/me/${kind}`,
    requireAuth,
    handle((req, res) => list(req, res, true, kind)),
  );
router.patch(
  "/me",
  requireAuth,
  handle(async (req, res) => {
    const limits = {
      display_name: 100,
      bio: 500,
      institution: 150,
      department: 100,
      github_url: 255,
    };
    if (
      !req.body ||
      typeof req.body !== "object" ||
      Array.isArray(req.body) ||
      Object.keys(req.body).some((k) => !Object.hasOwn(limits, k))
    )
      throw bad("Unsupported profile fields.");
    const fields = [],
      values = [];
    for (const [key, value] of Object.entries(req.body)) {
      if (typeof value !== "string" || Array.from(value).length > limits[key])
        throw bad(`Invalid ${key}.`);
      const trimmed = value.trim();
      if (key === "github_url" && trimmed) {
        let url;
        try {
          url = new URL(trimmed);
        } catch {
          throw bad("Enter a valid HTTPS GitHub profile URL.");
        }
        if (
          url.protocol !== "https:" ||
          url.hostname !== "github.com" ||
          url.username ||
          url.password ||
          !/^\/[A-Za-z0-9-]+\/?$/.test(url.pathname) ||
          url.search ||
          url.hash
        )
          throw bad("Use https://github.com/your-username.");
      }
      fields.push(`${key}=?`);
      values.push(trimmed || null);
    }
    if (!fields.length) throw bad("No profile changes provided.");
    await db.execute(`UPDATE users SET ${fields.join(",")} WHERE id=?`, [
      ...values,
      req.user.userId,
    ]);
    return res.json({
      message: "Profile updated.",
      user: await target(req, true),
    });
  }),
);
router.post(
  "/me/password",
  requireAuth,
  handle(async (req, res) => {
    const { current_password, new_password } = req.body || {};
    if (
      typeof current_password !== "string" ||
      typeof new_password !== "string" ||
      new_password.length < 8 ||
      Buffer.byteLength(new_password, "utf8") > 72 ||
      Buffer.byteLength(current_password, "utf8") > 72
    )
      throw bad(
        "Use a new password of at least 8 characters and no more than 72 UTF-8 bytes.",
      );
    const [rows] = await db.execute(
      "SELECT password_hash FROM users WHERE id=? AND status='active'",
      [req.user.userId],
    );
    if (
      !rows.length ||
      !(await bcrypt.compare(current_password, rows[0].password_hash))
    )
      throw bad("Current password is incorrect.", 400);
    if (current_password === new_password)
      throw bad("Choose a different new password.");
    const hash = await bcrypt.hash(new_password, 10);
    const [updated] = await db.execute(
      "UPDATE users SET password_hash=?,token_version=token_version+1 WHERE id=? AND password_hash=? AND status='active'",
      [hash, req.user.userId, rows[0].password_hash],
    );
    if (!updated.affectedRows)
      throw bad(
        "Account credentials changed. Sign in again before retrying.",
        409,
      );
    res.json({
      message:
        "Password changed. All existing sessions have been invalidated. Please sign in again.",
    });
  }),
);
router.get(
  "/:id",
  handle((req, res) => overview(req, res, false)),
);
for (const kind of ["solved", "submissions", "contests"])
  router.get(
    `/:id/${kind}`,
    handle((req, res) => list(req, res, false, kind)),
  );
module.exports = router;
