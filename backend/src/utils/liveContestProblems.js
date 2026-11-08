const db = require("../db");
const { writeAuditLog } = require("../utils/auditLog");


function fail(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}


function positive(value, label) {
  const n = Number(value);

  if (
    !(
      (typeof value === "number" && Number.isSafeInteger(value)) ||
      (typeof value === "string" && /^[1-9]\d*$/.test(value))
    ) ||
    !Number.isSafeInteger(n) ||
    n <= 0
  ) {
    throw fail(400, `Invalid ${label}.`);
  }

  return n;
}


async function changeContestProblem({
  req,
  contestId: rawContestId,
  problemId: rawProblemId,
  adminId,
  action,
  reason,
  expectedRevision,
  displayTitle,
}) {
  const contestId = positive(rawContestId, "contest ID");
  const problemId = positive(rawProblemId, "problem ID");

  if (
    typeof reason !== "string" ||
    !reason.trim() ||
    reason.trim().length > 1000
  ) {
    throw fail(
      400,
      "Enter a reason between 1 and 1000 characters. Students will see it.",
    );
  }

  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    throw fail(400, "Reload the contest before changing its problems.");
  }

  if (!["add", "withdraw"].includes(action)) {
    throw new Error("Unsupported action.");
  }

  let normalizedTitle;
  if (action === "add" && displayTitle !== undefined) {
    if (typeof displayTitle !== "string" || displayTitle.trim().length > 255) {
      throw fail(400, "Contest problem name must be a string of at most 255 characters.");
    }
    normalizedTitle = displayTitle.trim() || null;
  }

  const connection = await db.getConnection();
  let transaction = false;

  try {
    await connection.beginTransaction();
    transaction = true;

    const [contestRows] = await connection.execute(
      "SELECT * FROM contests WHERE id = ? FOR UPDATE",
      [contestId],
    );

    if (!contestRows.length) {
      throw fail(404, "Contest not found.");
    }

    const contest = contestRows[0];

    if (Number(contest.revision) !== expectedRevision) {
      throw fail(
        409,
        "This contest changed. Refresh the page, review it, and try again.",
      );
    }

    const [assigned] = await connection.execute(
      `SELECT problem_id, serial_letter, display_title, withdrawn_at
       FROM contest_problems
       WHERE contest_id = ?
       ORDER BY serial_letter ASC
       FOR UPDATE`,
      [contestId],
    );

    const existing = assigned.find(
      (row) => Number(row.problem_id) === problemId,
    );

    const [problemRows] = await connection.execute(
      "SELECT id, title FROM problems WHERE id = ? LIMIT 1",
      [problemId],
    );

    if (!problemRows.length) {
      throw fail(404, "Problem not found.");
    }

    const originalTitle = problemRows[0].title;
    const savedTitle = action === "add"
      ? normalizedTitle === undefined
        ? existing?.display_title ?? null
        : normalizedTitle
      : existing?.display_title ?? null;
    const title = savedTitle?.trim() || originalTitle;

    const [clockRows] = await connection.execute(
      "SELECT NOW(3) AS changed_at",
    );
    const changedAt = clockRows[0].changed_at;

    let letter;
    let event;
    let before = null;
    let after = null;

    if (action === "withdraw") {
      if (!existing) {
        throw fail(404, "This problem is not assigned to the contest.");
      }

      if (existing.withdrawn_at) {
        throw fail(409, "This problem is already withdrawn.");
      }

      letter = existing.serial_letter;
      event = "contest_problem_withdrawn";

      before = {
        display_title: existing.display_title,
        withdrawn_at: existing.withdrawn_at,
        withdrawn_reason: null,
        withdrawn_by: null,
      };

      after = {
        withdrawn_at: changedAt,
        withdrawn_reason: reason.trim(),
        withdrawn_by: adminId,
      };

      await connection.execute(
        `UPDATE contest_problems
         SET withdrawn_at = ?, withdrawn_reason = ?, withdrawn_by = ?
         WHERE contest_id = ? AND problem_id = ?`,
        [changedAt, reason.trim(), adminId, contestId, problemId],
      );
    } else {
      if (existing && !existing.withdrawn_at) {
        throw fail(409, "This problem is already active in the contest.");
      }

      const [tests] = await connection.execute(
        `SELECT id
         FROM test_cases
         WHERE problem_id = ? AND is_sample = false
         LIMIT 1`,
        [problemId],
      );

      if (!tests.length) {
        throw fail(
          400,
          "This problem needs at least one hidden test case.",
        );
      }

      if (existing) {
        letter = existing.serial_letter;
        event = "contest_problem_restored";

        before = {
          display_title: existing.display_title,
          withdrawn_at: existing.withdrawn_at,
          withdrawn_reason: null,
          withdrawn_by: null,
        };

        after = {
          display_title: savedTitle,
          withdrawn_at: null,
          withdrawn_reason: null,
          withdrawn_by: null,
        };

        await connection.execute(
          `UPDATE contest_problems
           SET withdrawn_at = NULL, withdrawn_reason = NULL, withdrawn_by = NULL, display_title = ?
           WHERE contest_id = ? AND problem_id = ?`,
          [savedTitle, contestId, problemId],
        );
      } else {
        const used = new Set(assigned.map((row) => row.serial_letter));

        letter = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].find(
          (value) => !used.has(value),
        );

        if (!letter || assigned.length >= 26) {
          throw fail(
            400,
            "All 26 problem letters are reserved. You can restore a withdrawn problem; existing letters will not be reused.",
          );
        }

        event = "contest_problem_added";

        before = {
          assigned: false,
          serial_letter: null,
        };

        after = {
          display_title: savedTitle,
          assigned: true,
          serial_letter: letter,
        };

        await connection.execute(
          `INSERT INTO contest_problems
            (contest_id, problem_id, serial_letter, display_title)
           VALUES (?, ?, ?, ?)`,
          [contestId, problemId, letter, savedTitle],
        );
      }
    }

    const revision = Number(contest.revision) + 1;

    await connection.execute(
      "UPDATE contests SET revision = ? WHERE id = ?",
      [revision, contestId],
    );

    const impact =
      event === "contest_problem_withdrawn"
        ? "New submissions are blocked. Its solves and penalty time no longer count in the standings. Existing submission history is retained."
        : event === "contest_problem_restored"
          ? "The problem is active again. Its earlier eligible submissions count in the standings again."
          : "The problem is now available. Solve time is still measured from contest start.";

    const verb =
      event === "contest_problem_withdrawn"
        ? "withdrawn"
        : event === "contest_problem_restored"
          ? "restored"
          : "added";

    await writeAuditLog(connection, {
      req,
      adminId,
      action: event,
      category: "contest_management",
      targetType: "contest",
      targetId: contestId,
      description: `Problem ${letter}: ${title} was ${verb}.`,
      details: {
        problem_id: problemId,
        problem_title: title,
        original_problem_title: originalTitle,
        display_title: savedTitle,
        serial_letter: letter,
        revision,
        changed_at: changedAt,
        impact,
      },
      changes: {
        contest_problem: {
          before,
          after,
        },
      },
      reason: reason.trim(),
    });

    await connection.execute(
      `INSERT INTO contest_announcements
        (contest_id, admin_id, contest_revision, event_type, message)
       VALUES (?, ?, ?, ?, ?)`,
      [
        contestId,
        adminId,
        revision,
        event,
        `Problem ${letter}: ${title} was ${verb}. ${impact} Reason: ${reason.trim()}`,
      ],
    );

    await connection.commit();
    transaction = false;

    return {
      message: `Problem ${letter} ${verb} successfully.`,
      contest_id: contestId,
      problem_id: problemId,
      serial_letter: letter,
      title,
      display_title: savedTitle,
      revision,
    };
  } catch (error) {
    if (transaction) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Live problem rollback error:", rollbackError);
      }
    }

    throw error;
  } finally {
    connection.release();
  }
}


module.exports = { changeContestProblem };