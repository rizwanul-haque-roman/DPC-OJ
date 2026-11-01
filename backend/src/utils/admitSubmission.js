const db = require("../db");
const { getContestClock } = require("./contestClock");
function fail(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
async function admitSubmission({
  userId,
  problemId,
  contestId,
  language,
  code,
}) {
  const connection = await db.getConnection();
  let transaction = false;
  try {
    await connection.beginTransaction();
    transaction = true;
    // Contest controls, withdrawal, and admission use the same row lock.
    let contest = null;
    if (contestId !== null) {
      const [rows] = await connection.execute(
        "SELECT id,start_time,end_time,ended_at,is_public FROM contests WHERE id=? FOR UPDATE",
        [contestId],
      );
      if (!rows.length || Number(rows[0].is_public) !== 1)
        throw fail(404, "Contest not found or is not public.");
      contest = rows[0];
    }
    const [problemRows] = await connection.execute(
      "SELECT id,is_public FROM problems WHERE id=? LIMIT 1",
      [problemId],
    );
    if (
      !problemRows.length ||
      (contestId === null && Number(problemRows[0].is_public) !== 1)
    )
      throw fail(404, "Problem not found.");
    if (contest) {
      const [registered] = await connection.execute(
        "SELECT contest_id FROM contest_registrations WHERE contest_id=? AND user_id=? LIMIT 1",
        [contestId, userId],
      );
      if (!registered.length)
        throw fail(403, "Register for this contest before submitting.");
      // Locking read observes the current withdrawal state after waiting for the contest lock.
      const [assigned] = await connection.execute(
        `SELECT contest_id FROM contest_problems
        WHERE contest_id=? AND problem_id=? AND withdrawn_at IS NULL LIMIT 1 FOR UPDATE`,
        [contestId, problemId],
      );
      if (!assigned.length)
        throw fail(
          403,
          "This problem is not assigned to this contest or has been withdrawn.",
        );
    }
    const [tests] = await connection.execute(
      "SELECT input,expected_output FROM test_cases WHERE problem_id=? AND is_sample=false ORDER BY id ASC",
      [problemId],
    );
    if (!tests.length)
      throw fail(400, "This problem has no hidden test cases yet.");
    const [clockRows] = await connection.execute(
      "SELECT NOW(3) AS admission_time",
    );
    const admissionTime = clockRows[0].admission_time;
    if (contest) {
      const clock = getContestClock(contest, admissionTime);
      if (clock.status === "invalid")
        throw fail(400, "Contest schedule is invalid.");
      if (clock.status === "upcoming")
        throw fail(403, "This contest has not started yet.");
      if (clock.status === "ended") throw fail(403, "This contest has ended.");
    }
    const [submission] = await connection.execute(
      `INSERT INTO submissions
      (user_id,problem_id,contest_id,language,code,submitted_at) VALUES (?,?,?,?,?,?)`,
      [userId, problemId, contestId, language, code, admissionTime],
    );
    await connection.commit();
    transaction = false;
    return { submissionId: submission.insertId, tests };
  } catch (error) {
    if (transaction) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Admission rollback error:", rollbackError);
      }
    }
    throw error;
  } finally {
    connection.release();
  }
}
module.exports = { admitSubmission };
