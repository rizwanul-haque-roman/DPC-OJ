const express = require("express");
const crypto = require("crypto");

const router = express.Router();
const db = require("../db");

const {
  requireAuth,
  requireAdmin,
} = require("../middleware/auth");

const {
  writeAuditLog,
  diffChanges,
} = require("../utils/auditLog");

router.use(requireAuth, requireAdmin);

function parseId(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const id = Number(value);

  return Number.isSafeInteger(id) ? id : null;
}

// GET all lessons for the admin management page.
// Includes draft, published, and archived lessons.
router.get("/learning/topics", async (req, res) => {
  try {
    const [rows] = await db.execute(
      `
        SELECT
          lt.id,
          lt.subject_id,
          lt.order_index,
          lt.title,
          lt.status,
          lt.created_at,
          lt.updated_at,
          ss.name AS subject_name
        FROM learn_topics AS lt
        INNER JOIN learning_courses AS ss
          ON ss.id = lt.subject_id
        ORDER BY
          ss.id ASC,
          lt.order_index ASC,
          lt.id ASC
      `,
    );

    return res.json({
      topics: rows,
    });
  } catch (error) {
    console.error("Admin learning topics error:", error);

    return res.status(500).json({
      error: "Unable to load learning lessons.",
    });
  }
});

// GET courses with lesson counts.
// Includes placeholders and inactive courses for administration.
router.get("/learning/subjects", async (req, res) => {
  try {
    const [rows] = await db.execute(
      `
        SELECT
          ss.id,
          ss.name,
          ss.language,
          ss.description,
          ss.is_placeholder,
          ss.execution_mode,
          ss.default_language,
          ss.editor_enabled,
          ss.run_enabled,
          ss.editor_message,
          ss.is_active,
          COUNT(lt.id) AS lesson_count,
          COUNT(
            CASE WHEN lt.status = 'draft' THEN 1 END
          ) AS draft_count,
          COUNT(
            CASE WHEN lt.status = 'published' THEN 1 END
          ) AS published_count,
          COUNT(
            CASE WHEN lt.status = 'archived' THEN 1 END
          ) AS archived_count
        FROM learning_courses AS ss
        LEFT JOIN learn_topics AS lt
          ON lt.subject_id = ss.id
        GROUP BY
          ss.id,
          ss.name,
          ss.language,
          ss.description,
          ss.is_placeholder,
          ss.execution_mode,
          ss.default_language,
          ss.editor_enabled,
          ss.run_enabled,
          ss.editor_message,
          ss.is_active
        ORDER BY ss.name ASC, ss.id ASC
      `,
    );

    return res.json(
      rows.map((row) => ({
        ...row,
        is_placeholder: Boolean(Number(row.is_placeholder)),
        is_active: Boolean(Number(row.is_active)),
        editor_enabled: Boolean(Number(row.editor_enabled)),
        run_enabled: Boolean(Number(row.run_enabled)),
        lesson_count: Number(row.lesson_count),
        draft_count: Number(row.draft_count),
        published_count: Number(row.published_count),
        archived_count: Number(row.archived_count),
      })),
    );
  } catch (error) {
    console.error("Admin learning subjects error:", error);

    return res.status(500).json({
      error: "Unable to load learning courses.",
    });
  }
});

// GET all lessons for one course, including drafts and archives.
// Lesson content is fetched separately through the detail route.
router.get("/learning/subjects/:subjectId/topics", async (req, res) => {
  const subjectId = parseId(req.params.subjectId);

  if (subjectId === null) {
    return res.status(400).json({
      error: "Invalid subject ID.",
    });
  }

  try {
    const [subjects] = await db.execute(
      `
        SELECT id
        FROM learning_courses
        WHERE id = ?
        LIMIT 1
      `,
      [subjectId],
    );

    if (!subjects.length) {
      return res.status(404).json({
        error: "Course not found.",
      });
    }

    const [rows] = await db.execute(
      `
        SELECT
          id,
          subject_id,
          order_index,
          title,
          status,
          created_at,
          updated_at
        FROM learn_topics
        WHERE subject_id = ?
        ORDER BY order_index ASC, id ASC
      `,
      [subjectId],
    );

    return res.json(rows);
  } catch (error) {
    console.error("Admin learning topic list error:", error);

    return res.status(500).json({
      error: "Unable to load learning lessons.",
    });
  }
});

// GET a lesson for admin editing/preview.
// Drafts, archives, and locked lessons are accessible here.
router.get("/learning/topics/:topicId", async (req, res) => {
  const topicId = parseId(req.params.topicId);

  if (topicId === null) {
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
          lt.status,
          lt.created_at,
          lt.updated_at,
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
        LIMIT 1
      `,
      [topicId],
    );

    if (!rows.length) {
      return res.status(404).json({
        error: "Lesson not found.",
      });
    }

    return res.json({
      ...rows[0],
      editor_enabled: Boolean(Number(rows[0].editor_enabled)),
      run_enabled: Boolean(Number(rows[0].run_enabled)),
    });
  } catch (error) {
    console.error("Admin learning topic detail error:", error);

    return res.status(500).json({
      error: "Unable to load the learning lesson.",
    });
  }
});

// PATCH edit a lesson without changing its course, order, or status.
router.patch("/learning/topics/:topicId", async (req, res) => {
  const topicId = parseId(req.params.topicId);

  if (topicId === null) {
    return res.status(400).json({
      error: "Invalid topic ID.",
    });
  }

  const body = req.body;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({
      error: "A JSON object is required.",
    });
  }

  const allowedFields = new Set([
    "title",
    "content",
    "starter_code",
  ]);

  const suppliedFields = Object.keys(body);

  if (
    !suppliedFields.length ||
    suppliedFields.some((key) => !allowedFields.has(key))
  ) {
    return res.status(400).json({
      error: "Provide title, content, or starter_code only.",
    });
  }

  const has = (key) =>
    Object.prototype.hasOwnProperty.call(body, key);

  if (
    has("title") &&
    (
      typeof body.title !== "string" ||
      !body.title.trim() ||
      Array.from(body.title.trim()).length > 255
    )
  ) {
    return res.status(400).json({
      error: "Title must contain between 1 and 255 characters.",
    });
  }

  if (
    has("content") &&
    (
      typeof body.content !== "string" ||
      Buffer.byteLength(body.content, "utf8") > 32 * 1024
    )
  ) {
    return res.status(400).json({
      error: "Lesson content must be text of at most 32 KB.",
    });
  }

  if (
    has("starter_code") &&
    (
      typeof body.starter_code !== "string" ||
      Buffer.byteLength(body.starter_code, "utf8") > 16 * 1024
    )
  ) {
    return res.status(400).json({
      error: "Starter code must be text of at most 16 KB.",
    });
  }

  const hash = (value) =>
    crypto
      .createHash("sha256")
      .update(value ?? "", "utf8")
      .digest("hex");

  const auditSnapshot = (lesson) => ({
    title: lesson.title,
    content_sha256: hash(lesson.content),
    content_bytes: Buffer.byteLength(lesson.content ?? "", "utf8"),
    starter_code_sha256: hash(lesson.starter_code),
    starter_code_bytes: Buffer.byteLength(
      lesson.starter_code ?? "",
      "utf8",
    ),
  });

  let connection;
  let transactionStarted = false;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

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
        FOR UPDATE
      `,
      [topicId],
    );

    if (!rows.length) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(404).json({
        error: "Lesson not found.",
      });
    }

    const before = rows[0];

    const next = {
      ...before,
      title: has("title") ? body.title.trim() : before.title,
      content: has("content") ? body.content : before.content,
      starter_code: has("starter_code")
        ? body.starter_code
        : before.starter_code,
    };

    // Keep published lessons consistent with publication validation.
    if (
      next.status === "published" &&
      (!next.title?.trim() || !next.content?.trim())
    ) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(400).json({
        error:
          "Published lessons require a title and lesson content. Unpublish the lesson before clearing its content.",
      });
    }

    const changedFields = ["title", "content", "starter_code"].filter(
      (field) => before[field] !== next[field],
    );

    if (!changedFields.length) {
      await connection.rollback();
      transactionStarted = false;

      return res.json({
        message: "No changes were necessary.",
        topic: before,
      });
    }

    await connection.execute(
      `
        UPDATE learn_topics
        SET title = ?, content = ?, starter_code = ?
        WHERE id = ?
      `,
      [next.title, next.content, next.starter_code, topicId],
    );

    const beforeSnapshot = auditSnapshot(before);
    const afterSnapshot = auditSnapshot(next);

    await writeAuditLog(connection, {
      req,
      action: "learning_topic_updated",
      category: "learning_management",
      targetType: "learning_topic",
      targetId: topicId,
      description: `Updated lesson "${next.title}".`,
      details: {
        subject_id: before.subject_id,
        status: before.status,
        changed_fields: changedFields,
        content_recording: "SHA-256 fingerprints and byte counts",
      },
      changes: diffChanges(
        beforeSnapshot,
        afterSnapshot,
        Object.keys(beforeSnapshot),
      ),
    });

    const [updatedRows] = await connection.execute(
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
      [topicId],
    );

    await connection.commit();
    transactionStarted = false;

    return res.json({
      message: "Lesson updated.",
      topic: updatedRows[0],
    });
  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Update lesson rollback error:", rollbackError);
      }
    }

    console.error("Update learning topic error:", error);

    return res.status(500).json({
      error: "Unable to update the lesson.",
    });
  } finally {
    connection?.release();
  }
});

// PATCH publish, unpublish, archive, or restore a lesson.
router.patch(
  "/learning/topics/:topicId/status",
  async (req, res) => {
    const topicId = parseId(req.params.topicId);

    if (topicId === null) {
      return res.status(400).json({
        error: "Invalid topic ID.",
      });
    }

    const body = req.body;

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).some(
        (key) => !["status", "reason"].includes(key),
      )
    ) {
      return res.status(400).json({
        error: "Provide status and an optional reason only.",
      });
    }

    if (!["draft", "published", "archived"].includes(body.status)) {
      return res.status(400).json({
        error: "Status must be draft, published, or archived.",
      });
    }

    if (
      body.reason !== undefined &&
      (
        typeof body.reason !== "string" ||
        Array.from(body.reason.trim()).length > 1000
      )
    ) {
      return res.status(400).json({
        error: "Reason must be text of at most 1000 characters.",
      });
    }

    const nextStatus = body.status;
    const reason = body.reason?.trim() || null;

    let connection;
    let transactionStarted = false;

    try {
      connection = await db.getConnection();
      await connection.beginTransaction();
      transactionStarted = true;

      const [rows] = await connection.execute(
        `
          SELECT
            id,
            subject_id,
            title,
            content,
            status
          FROM learn_topics
          WHERE id = ?
          FOR UPDATE
        `,
        [topicId],
      );

      if (!rows.length) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(404).json({
          error: "Lesson not found.",
        });
      }

      const topic = rows[0];

      if (topic.status === nextStatus) {
        await connection.rollback();
        transactionStarted = false;

        return res.json({
          message: "Lesson already has this status.",
          topic: {
            id: topic.id,
            title: topic.title,
            status: topic.status,
          },
        });
      }

      if (
        nextStatus === "published" &&
        (!topic.title?.trim() || !topic.content?.trim())
      ) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(400).json({
          error:
            "A title and lesson content are required before publishing.",
        });
      }

      const statusActions = {
        draft: {
          action: "learning_topic_unpublished",
          verb: "Unpublished",
          message: "Lesson unpublished.",
        },
        published: {
          action: "learning_topic_published",
          verb: "Published",
          message: "Lesson published.",
        },
        archived: {
          action: "learning_topic_archived",
          verb: "Archived",
          message: "Lesson archived.",
        },
      };

      let statusAction = statusActions[nextStatus];

      if (topic.status === "archived" && nextStatus === "draft") {
        statusAction = {
          action: "learning_topic_restored",
          verb: "Restored to draft",
          message: "Lesson restored to draft.",
        };
      }

      await connection.execute(
        `
          UPDATE learn_topics
          SET status = ?
          WHERE id = ?
        `,
        [nextStatus, topicId],
      );

      await writeAuditLog(connection, {
        req,
        action: statusAction.action,
        category: "learning_management",
        targetType: "learning_topic",
        targetId: topicId,
        description: `${statusAction.verb} lesson "${topic.title}".`,
        details: {
          subject_id: topic.subject_id,
          title: topic.title,
        },
        changes: {
          status: {
            before: topic.status,
            after: nextStatus,
          },
        },
        reason,
      });

      await connection.commit();
      transactionStarted = false;

      return res.json({
        message: statusAction.message,
        topic: {
          id: topic.id,
          title: topic.title,
          status: nextStatus,
        },
      });
    } catch (error) {
      if (connection && transactionStarted) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          console.error(
            "Lesson status rollback error:",
            rollbackError,
          );
        }
      }

      console.error("Update lesson status error:", error);

      return res.status(500).json({
        error: "Unable to change lesson status.",
      });
    } finally {
      connection?.release();
    }
  },
);

// DELETE a lesson permanently.
// The lesson must be archived first.
router.delete(
  "/learning/topics/:topicId",
  async (req, res) => {
    const topicId = parseId(req.params.topicId);

    if (topicId === null) {
      return res.status(400).json({
        error: "Invalid topic ID.",
      });
    }

    const body = req.body || {};

    if (
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).some(
        (key) => !["confirm", "reason"].includes(key),
      )
    ) {
      return res.status(400).json({
        error: "Provide confirm and an optional reason only.",
      });
    }

    if (body.confirm !== true) {
      return res.status(400).json({
        error: "Permanent deletion requires confirmation.",
      });
    }

    if (
      body.reason !== undefined &&
      (
        typeof body.reason !== "string" ||
        Array.from(body.reason.trim()).length > 1000
      )
    ) {
      return res.status(400).json({
        error: "Reason must be text of at most 1000 characters.",
      });
    }

    const reason = body.reason?.trim() || null;

    let connection;
    let transactionStarted = false;

    try {
      connection = await db.getConnection();
      await connection.beginTransaction();
      transactionStarted = true;

      const [rows] = await connection.execute(
        `
          SELECT
            id,
            subject_id,
            title,
            status
          FROM learn_topics
          WHERE id = ?
          FOR UPDATE
        `,
        [topicId],
      );

      if (!rows.length) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(404).json({
          error: "Lesson not found.",
        });
      }

      const topic = rows[0];

      if (topic.status !== "archived") {
        await connection.rollback();
        transactionStarted = false;

        return res.status(409).json({
          error:
            "Archive the lesson before deleting it permanently.",
          topic: {
            id: topic.id,
            title: topic.title,
            status: topic.status,
          },
        });
      }

      const [progressResult] = await connection.execute(
        `
          DELETE FROM topic_progress
          WHERE topic_id = ?
        `,
        [topicId],
      );

      const progressCount = Number(progressResult.affectedRows);

      await connection.execute(
        `
          DELETE FROM learn_topics
          WHERE id = ?
        `,
        [topicId],
      );

      await writeAuditLog(connection, {
        req,
        action: "learning_topic_deleted",
        category: "learning_management",
        targetType: "learning_topic",
        targetId: topicId,
        description: `Permanently deleted lesson "${topic.title}".`,
        details: {
          subject_id: topic.subject_id,
          title: topic.title,
          progress_records_deleted: progressCount,
        },
        reason,
      });

      await connection.commit();
      transactionStarted = false;

      return res.json({
        message: "Lesson permanently deleted.",
        deleted: {
          id: topicId,
          title: topic.title,
          progress_records_deleted: progressCount,
        },
      });
    } catch (error) {
      if (connection && transactionStarted) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          console.error(
            "Lesson deletion rollback error:",
            rollbackError,
          );
        }
      }

      console.error("Permanent lesson deletion error:", error);

      return res.status(500).json({
        error: "Unable to delete lesson permanently.",
      });
    } finally {
      connection?.release();
    }
  },
);

// ============================================================
// Course and lesson-creation management.
// Keep the existing lesson detail/edit/status/delete routes.
// ============================================================

function learningManagementError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function validateLearningBody(body, allowedFields) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw learningManagementError(400, "A JSON object is required.");
  }

  const fields = Object.keys(body);

  if (
    fields.length === 0 ||
    fields.some((field) => !allowedFields.includes(field))
  ) {
    throw learningManagementError(
      400,
      `Provide only these fields: ${allowedFields.join(", ")}.`,
    );
  }
}

function learningRequiredText(value, label, maximum) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    Array.from(value.trim()).length > maximum
  ) {
    throw learningManagementError(
      400,
      `${label} must contain between 1 and ${maximum} characters.`,
    );
  }

  return value.trim();
}

function learningNullableText(value, label, maximum) {
  if (value === null) return null;

  if (
    typeof value !== "string" ||
    Array.from(value.trim()).length > maximum
  ) {
    throw learningManagementError(
      400,
      `${label} must be text of at most ${maximum} characters or null.`,
    );
  }

  return value.trim() || null;
}

function learningContentText(value, label, maximumBytes) {
  if (
    typeof value !== "string" ||
    Buffer.byteLength(value, "utf8") > maximumBytes
  ) {
    throw learningManagementError(
      400,
      `${label} must be text of at most ${maximumBytes / 1024} KB.`,
    );
  }

  return value;
}

function learningPositiveId(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw learningManagementError(
      400,
      `${label} must be a positive integer.`,
    );
  }

  return value;
}

function learningRouteId(value, label) {
  const id = parseId(value);

  if (id === null) {
    throw learningManagementError(400, `Invalid ${label}.`);
  }

  return id;
}

async function learningManagementTransaction(callback) {
  const connection = await db.getConnection();
  let started = false;

  try {
    await connection.beginTransaction();
    started = true;

    const result = await callback(connection);

    await connection.commit();
    started = false;

    return result;
  } catch (error) {
    if (started) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "Learning management rollback error:",
          rollbackError,
        );
      }
    }

    throw error;
  } finally {
    connection.release();
  }
}

function sendLearningManagementError(res, error, label) {
  console.error(label, error);

  if (
    Number.isInteger(error.status) &&
    error.status >= 400 &&
    error.status < 500
  ) {
    return res.status(error.status).json({
      error: error.message,
    });
  }

  if (error.code === "ER_ROW_IS_REFERENCED_2") {
    return res.status(409).json({
      error:
        "This record has related data and cannot be deleted.",
    });
  }

  if (
    error.code === "ER_LOCK_DEADLOCK" ||
    error.code === "ER_LOCK_WAIT_TIMEOUT"
  ) {
    return res.status(409).json({
      error:
        "The learning content is being changed by another request. Refresh and try again.",
    });
  }

  return res.status(500).json({
    error: "Unable to complete the learning management request.",
  });
}

const learningCourseFields = [
  "name",
  "language",
  "description",
  "is_placeholder",
  "is_active",
  "execution_mode",
  "default_language",
  "editor_enabled",
  "run_enabled",
  "editor_message",
];

function normalizeLearningCourse(body, existing = null) {
  const has = (field) =>
    Object.prototype.hasOwnProperty.call(body, field);

  const defaults = {
    name: "",
    language: null,
    description: null,
    is_placeholder: false,
    is_active: true,
    execution_mode: "disabled",
    default_language: null,
    editor_enabled: false,
    run_enabled: false,
    editor_message: null,
  };

  const next = {};

  for (const field of learningCourseFields) {
    next[field] = has(field)
      ? body[field]
      : existing
        ? existing[field]
        : defaults[field];
  }

  next.name = learningRequiredText(next.name, "Course name", 255);

  next.language = learningNullableText(
    next.language,
    "Language",
    50,
  );

  next.default_language = learningNullableText(
    next.default_language,
    "Default language",
    50,
  );

  next.editor_message = learningNullableText(
    next.editor_message,
    "Editor message",
    255,
  );

  if (next.description !== null) {
    next.description = learningContentText(
      next.description,
      "Course description",
      16 * 1024,
    );
  }

  for (const field of [
    "is_placeholder",
    "is_active",
    "editor_enabled",
    "run_enabled",
  ]) {
    if (has(field) && typeof body[field] !== "boolean") {
      throw learningManagementError(
        400,
        `${field} must be true or false.`,
      );
    }

    next[field] = Boolean(Number(next[field]));
  }

  if (
    !["code", "sql", "external", "disabled"].includes(
      next.execution_mode,
    )
  ) {
    throw learningManagementError(
      400,
      "Execution mode must be code, sql, external, or disabled.",
    );
  }

  if (next.run_enabled && !next.editor_enabled) {
    throw learningManagementError(
      400,
      "Enable the editor before enabling Run.",
    );
  }

  if (
    next.execution_mode === "disabled" &&
    next.run_enabled
  ) {
    throw learningManagementError(
      400,
      "Run cannot be enabled when execution mode is disabled.",
    );
  }

  return next;
}

// POST create an independent course.
router.post("/learning/subjects", async (req, res) => {
  try {
    validateLearningBody(req.body, learningCourseFields);

    const course = normalizeLearningCourse(req.body);

    const subject = await learningManagementTransaction(
      async (connection) => {
        const [result] = await connection.execute(
          `
            INSERT INTO learning_courses (
              name,
              language,
              description,
              is_placeholder,
              is_active,
              execution_mode,
              default_language,
              editor_enabled,
              run_enabled,
              editor_message
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            course.name,
            course.language,
            course.description,
            course.is_placeholder,
            course.is_active,
            course.execution_mode,
            course.default_language,
            course.editor_enabled,
            course.run_enabled,
            course.editor_message,
          ],
        );

        const created = {
          id: result.insertId,
          ...course,
        };

        await writeAuditLog(connection, {
          req,
          action: "learning_course_created",
          category: "learning_management",
          targetType: "learning_course",
          targetId: created.id,
          description: `Created course "${course.name}".`,
          details: created,
        });

        return created;
      },
    );

    return res.status(201).json({
      message: "Course created.",
      subject,
    });
  } catch (error) {
    return sendLearningManagementError(
      res,
      error,
      "Create learning course error:",
    );
  }
});

// PATCH course details/settings.
router.patch("/learning/subjects/:subjectId", async (req, res) => {
  try {
    const subjectId = learningRouteId(
      req.params.subjectId,
      "course ID",
    );

    validateLearningBody(req.body, learningCourseFields);

    const result = await learningManagementTransaction(
      async (connection) => {
        const [rows] = await connection.execute(
          `
            SELECT *
            FROM learning_courses
            WHERE id = ?
            FOR UPDATE
          `,
          [subjectId],
        );

        if (!rows.length) {
          throw learningManagementError(
            404,
            "Course not found.",
          );
        }

        const existing = rows[0];
        const before = normalizeLearningCourse({}, existing);
        const next = normalizeLearningCourse(req.body, existing);

        const changedFields = learningCourseFields.filter(
          (field) => before[field] !== next[field],
        );

        if (!changedFields.length) {
          return {
            message: "No changes were necessary.",
            subject: {
              id: subjectId,
              ...before,
            },
          };
        }

        await connection.execute(
          `
            UPDATE learning_courses
            SET
              name = ?,
              language = ?,
              description = ?,
              is_placeholder = ?,
              is_active = ?,
              execution_mode = ?,
              default_language = ?,
              editor_enabled = ?,
              run_enabled = ?,
              editor_message = ?
            WHERE id = ?
          `,
          [
            next.name,
            next.language,
            next.description,
            next.is_placeholder,
            next.is_active,
            next.execution_mode,
            next.default_language,
            next.editor_enabled,
            next.run_enabled,
            next.editor_message,
            subjectId,
          ],
        );

        await writeAuditLog(connection, {
          req,
          action: "learning_course_updated",
          category: "learning_management",
          targetType: "learning_course",
          targetId: subjectId,
          description: `Updated course "${next.name}".`,
          details: {
            changed_fields: changedFields,
          },
          changes: diffChanges(
            before,
            next,
            learningCourseFields,
          ),
        });

        return {
          message: "Course updated.",
          subject: {
            id: subjectId,
            ...next,
          },
        };
      },
    );

    return res.json(result);
  } catch (error) {
    return sendLearningManagementError(
      res,
      error,
      "Update learning course error:",
    );
  }
});

// DELETE an empty course.
// Draft, published, and archived lessons all block removal.
router.delete("/learning/subjects/:subjectId", async (req, res) => {
  try {
    const subjectId = learningRouteId(
      req.params.subjectId,
      "course ID",
    );

    validateLearningBody(req.body, ["confirm", "reason"]);

    if (req.body.confirm !== true) {
      throw learningManagementError(
        400,
        "Course deletion requires confirmation.",
      );
    }

    const reason =
      req.body.reason === undefined
        ? null
        : learningNullableText(
            req.body.reason,
            "Reason",
            1000,
          );

    await learningManagementTransaction(async (connection) => {
      const [rows] = await connection.execute(
        `
          SELECT id, name
          FROM learning_courses
          WHERE id = ?
          FOR UPDATE
        `,
        [subjectId],
      );

      if (!rows.length) {
        throw learningManagementError(
          404,
          "Course not found.",
        );
      }

      const course = rows[0];

      const [lessons] = await connection.execute(
        `
          SELECT id
          FROM learn_topics
          WHERE subject_id = ?
          LIMIT 1
          FOR UPDATE
        `,
        [subjectId],
      );

      if (lessons.length) {
        throw learningManagementError(
          409,
          "This course still contains lessons. Handle its lessons before deleting the course. Archived lessons also count.",
        );
      }

      await connection.execute(
        `
          DELETE FROM learning_courses
          WHERE id = ?
        `,
        [subjectId],
      );

      await writeAuditLog(connection, {
        req,
        action: "learning_course_deleted",
        category: "learning_management",
        targetType: "learning_course",
        targetId: subjectId,
        description: `Deleted empty course "${course.name}".`,
        details: {
          name: course.name,
          lesson_count: 0,
        },
        reason,
      });
    });

    return res.json({
      message: "Course deleted.",
      id: subjectId,
    });
  } catch (error) {
    return sendLearningManagementError(
      res,
      error,
      "Delete learning course error:",
    );
  }
});

// POST add a draft lesson at the end of a course.
router.post(
  "/learning/subjects/:subjectId/topics",
  async (req, res) => {
    try {
      const subjectId = learningRouteId(
        req.params.subjectId,
        "course ID",
      );

      validateLearningBody(req.body, [
        "title",
        "content",
        "starter_code",
      ]);

      const title = learningRequiredText(
        req.body.title,
        "Lesson title",
        255,
      );

      const content = learningContentText(
        req.body.content ?? "",
        "Lesson content",
        32 * 1024,
      );

      const starterCode = learningContentText(
        req.body.starter_code ?? "",
        "Starter code",
        16 * 1024,
      );

      const topic = await learningManagementTransaction(
        async (connection) => {
          const [subjects] = await connection.execute(
            `
              SELECT id
              FROM learning_courses
              WHERE id = ?
              FOR UPDATE
            `,
            [subjectId],
          );

          if (!subjects.length) {
            throw learningManagementError(
              404,
              "Course not found.",
            );
          }

          const [lastLessons] = await connection.execute(
            `
              SELECT order_index
              FROM learn_topics
              WHERE subject_id = ?
              ORDER BY order_index DESC, id DESC
              LIMIT 1
              FOR UPDATE
            `,
            [subjectId],
          );

          const orderIndex = lastLessons.length
            ? Number(lastLessons[0].order_index) + 1
            : 1;

          if (orderIndex > 2147483647) {
            throw learningManagementError(
              409,
              "Reorder this course's lessons before adding another lesson.",
            );
          }

          const [insert] = await connection.execute(
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
            [
              subjectId,
              orderIndex,
              title,
              content,
              starterCode,
            ],
          );

          await writeAuditLog(connection, {
            req,
            action: "learning_topic_created",
            category: "learning_management",
            targetType: "learning_topic",
            targetId: insert.insertId,
            description: `Created draft lesson "${title}".`,
            details: {
              subject_id: subjectId,
              title,
              order_index: orderIndex,
              status: "draft",
              content_sha256: crypto
                .createHash("sha256")
                .update(content, "utf8")
                .digest("hex"),
              content_bytes: Buffer.byteLength(content, "utf8"),
              starter_code_sha256: crypto
                .createHash("sha256")
                .update(starterCode, "utf8")
                .digest("hex"),
              starter_code_bytes: Buffer.byteLength(
                starterCode,
                "utf8",
              ),
            },
          });

          const [created] = await connection.execute(
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
            `,
            [insert.insertId],
          );

          return created[0];
        },
      );

      return res.status(201).json({
        message: "Draft lesson created.",
        topic,
      });
    } catch (error) {
      return sendLearningManagementError(
        res,
        error,
        "Create learning lesson error:",
      );
    }
  },
);

// PUT the complete lesson order for one course.
// Include every lesson ID, including archived lessons.
router.put(
  "/learning/subjects/:subjectId/topic-order",
  async (req, res) => {
    try {
      const subjectId = learningRouteId(
        req.params.subjectId,
        "course ID",
      );

      validateLearningBody(req.body, ["topic_ids"]);

      const ids = req.body.topic_ids;

      if (
        !Array.isArray(ids) ||
        ids.some(
          (id) => !Number.isSafeInteger(id) || id < 1,
        ) ||
        new Set(ids).size !== ids.length
      ) {
        throw learningManagementError(
          400,
          "topic_ids must be an array of unique positive integer lesson IDs.",
        );
      }

      const result = await learningManagementTransaction(
        async (connection) => {
          const [subjects] = await connection.execute(
            `
              SELECT id
              FROM learning_courses
              WHERE id = ?
              FOR UPDATE
            `,
            [subjectId],
          );

          if (!subjects.length) {
            throw learningManagementError(
              404,
              "Course not found.",
            );
          }

          const [lessons] = await connection.execute(
            `
              SELECT id, order_index
              FROM learn_topics
              WHERE subject_id = ?
              ORDER BY order_index ASC, id ASC
              FOR UPDATE
            `,
            [subjectId],
          );

          const existingIds = new Set(
            lessons.map((lesson) => Number(lesson.id)),
          );

          if (
            ids.length !== lessons.length ||
            ids.some((id) => !existingIds.has(id))
          ) {
            throw learningManagementError(
              409,
              "The lesson list has changed or contains lessons from another course. Reload the full course before reordering.",
            );
          }

          const before = lessons.map((lesson) => ({
            id: Number(lesson.id),
            order_index: Number(lesson.order_index),
          }));

          const after = ids.map((id, index) => ({
            id,
            order_index: index + 1,
          }));

          if (
            JSON.stringify(before) === JSON.stringify(after)
          ) {
            return {
              message: "Lesson order is already up to date.",
              order: after,
            };
          }

          for (const lesson of after) {
            await connection.execute(
              `
                UPDATE learn_topics
                SET order_index = ?
                WHERE id = ? AND subject_id = ?
              `,
              [
                lesson.order_index,
                lesson.id,
                subjectId,
              ],
            );
          }

          await writeAuditLog(connection, {
            req,
            action: "learning_topics_reordered",
            category: "learning_management",
            targetType: "learning_course",
            targetId: subjectId,
            description: "Updated course lesson order.",
            details: {
              lesson_count: ids.length,
            },
            changes: {
              order: {
                before,
                after,
              },
            },
          });

          return {
            message: "Lesson order saved.",
            order: after,
          };
        },
      );

      return res.json(result);
    } catch (error) {
      return sendLearningManagementError(
        res,
        error,
        "Reorder learning lessons error:",
      );
    }
  },
);

module.exports = router;