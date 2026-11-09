const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { sendRegistrationOtp, assertMailerConfigured } = require("../utils/mailer");
const { assertSecrets, makeOtp, hashOtp, otpMatches, registrationId, httpError, transaction, consumeQuota } = require("../utils/registrationSecurity");

const MAX_ATTEMPTS = 5;
const MAX_SENDS = 10;
const SELECT_REQUEST = `SELECT *,
  request_expires_at > NOW(3) AS request_valid,
  otp_expires_at > NOW(3) AS otp_valid,
  GREATEST(0, CEIL(TIMESTAMPDIFF(MICROSECOND, NOW(3), otp_expires_at) / 1000000)) AS expires_in,
  GREATEST(0, CEIL(TIMESTAMPDIFF(MICROSECOND, NOW(3), DATE_ADD(last_sent_at, INTERVAL 60 SECOND)) / 1000000)) AS retry_after
  FROM email_registration_requests`;

function responseFor(row, extra = {}) {
  return {
    verification_required: true,
    registration_id: row.id,
    email: row.email,
    expires_in: row.otp_hash ? Number(row.expires_in || 0) : 0,
    retry_after: Number(row.retry_after || 0),
    attempts_remaining: Math.max(0, MAX_ATTEMPTS - Number(row.attempts || 0)),
    ...extra,
  };
}

function requirePending(row) {
  if (!row || !Number(row.request_valid)) {
    throw httpError(400, "REGISTRATION_EXPIRED", "This verification session is invalid or expired. Please register again.");
  }
}

async function fetchRequest(id) {
  const [rows] = await db.execute(`${SELECT_REQUEST} WHERE id = ?`, [id]);
  return rows[0];
}

async function existingAccount(connection, username, email) {
  const [rows] = await connection.execute(
    "SELECT id FROM users WHERE name = ? OR email = ? LIMIT 1", [username, email],
  );
  if (rows.length) {
    throw httpError(409, "ACCOUNT_EXISTS", "Username or email is already registered. Please sign in or use different details.");
  }
}

async function beginRegistration({ username, email, password }) {
  assertSecrets();
  assertMailerConfigured();
  await existingAccount(db, username, email);
  await consumeQuota("registration-mail-email", email, 5, 3600);
  const passwordHash = await bcrypt.hash(password, 10);
  const id = crypto.randomBytes(32).toString("hex");
  const otp = makeOtp();
  const digest = hashOtp(id, otp);
  try {
    await transaction(async (connection) => {
      await connection.execute(
        "DELETE FROM email_registration_requests WHERE email = ? AND request_expires_at <= NOW(3)", [email],
      );
      await connection.execute(
        `INSERT INTO email_registration_requests
         (id, name, email, password_hash, otp_hash, otp_expires_at, request_expires_at, last_sent_at)
         VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(3), INTERVAL 10 MINUTE), DATE_ADD(NOW(3), INTERVAL 24 HOUR), NOW(3))`,
        [id, username, email, passwordHash, digest],
      );
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      throw httpError(409, "REGISTRATION_PENDING", "Verification is already pending for this email. Resume through Login using the original registration password, or retry after the pending request expires (24 hours).");
    }
    throw error;
  }

  let accepted = true;
  try {
    await sendRegistrationOtp(email, otp);
  } catch (error) {
    accepted = false;
    // Keep the challenge so the browser can retry; never activate an account.
    await db.execute(
      "UPDATE email_registration_requests SET otp_hash = NULL WHERE id = ? AND otp_hash = ?", [id, digest],
    );
    console.error("Registration email was not confirmed accepted by SMTP", { code: error.code || "MAIL_FAILED" });
  }
  const row = await fetchRequest(id);
  requirePending(row);
  return responseFor(row, {
    mail_sent: accepted,
    message: accepted
      ? "Verification email accepted by the mail server. Check your inbox and spam folder."
      : "Email delivery could not be confirmed. No account has been created. Use Resend code after the cooldown.",
  });
}

async function resumeRegistration(email, password) {
  const [rows] = await db.execute(`${SELECT_REQUEST} WHERE email = ? AND request_expires_at > NOW(3) LIMIT 1`, [email]);
  const row = rows[0];
  if (!row || !(await bcrypt.compare(password, row.password_hash))) return null;
  return responseFor(row, {
    message: "Email verification is still required. Enter your latest code or request another one. No new email was sent by signing in.",
  });
}

async function resendRegistration(rawId) {
  assertSecrets();
  assertMailerConfigured();
  const id = registrationId(rawId);
  const candidate = await fetchRequest(id);
  requirePending(candidate);
  if (Number(candidate.attempts) >= MAX_ATTEMPTS) throw httpError(429, "OTP_ATTEMPTS_EXCEEDED", "Too many incorrect codes. Start over to register again.");
  if (Number(candidate.retry_after) > 0) throw httpError(429, "RESEND_COOLDOWN", "Wait before requesting another code.", Number(candidate.retry_after));
  if (Number(candidate.send_count) >= MAX_SENDS) throw httpError(429, "OTP_SEND_LIMIT", "Email limit reached. Start over or try again later.");
  await consumeQuota("registration-mail-email", candidate.email, 5, 3600);
  const otp = makeOtp();
  const digest = hashOtp(id, otp);
  const previous = await transaction(async (connection) => {
    const [rows] = await connection.execute(`${SELECT_REQUEST} WHERE id = ? FOR UPDATE`, [id]);
    const row = rows[0];
    requirePending(row);
    if (Number(row.attempts) >= MAX_ATTEMPTS) {
      throw httpError(429, "OTP_ATTEMPTS_EXCEEDED", "Too many incorrect codes. Start over to create a new verification session.");
    }
    if (Number(row.retry_after) > 0) {
      throw httpError(429, "RESEND_COOLDOWN", "Wait before requesting another code.", Number(row.retry_after));
    }
    if (Number(row.send_count) >= MAX_SENDS) {
      throw httpError(429, "OTP_SEND_LIMIT", "This verification session reached its email limit. Start over or try again later.");
    }
    await connection.execute(
      `UPDATE email_registration_requests
       SET otp_hash = ?, otp_expires_at = DATE_ADD(NOW(3), INTERVAL 10 MINUTE),
           last_sent_at = NOW(3), send_count = send_count + 1
       WHERE id = ?`, [digest, id],
    );
    return { hash: row.otp_hash, expiry: row.otp_expires_at, email: row.email };
  });

  let accepted = true;
  try {
    await sendRegistrationOtp(previous.email, otp);
  } catch (error) {
    accepted = false;
    // Restore only the previous code/expiry if this is still the current code.
    // Cooldown/send counters remain charged even on SMTP failure.
    await db.execute(
      "UPDATE email_registration_requests SET otp_hash = ?, otp_expires_at = ? WHERE id = ? AND otp_hash = ?",
      [previous.hash, previous.expiry, id, digest],
    );
    console.error("OTP resend was not confirmed accepted by SMTP", { code: error.code || "MAIL_FAILED" });
  }
  const row = await fetchRequest(id);
  requirePending(row);
  return responseFor(row, {
    mail_sent: accepted,
    message: accepted ? "A new code was sent. Only the latest code works."
      : "Email delivery could not be confirmed. An earlier unexpired code may still work; wait before resending.",
  });
}

async function completeRegistration(rawId, otp, createToken) {
  assertSecrets();
  const id = registrationId(rawId);
  if (typeof otp !== "string" || !/^\d{6}$/.test(otp)) {
    throw httpError(400, "INVALID_OTP", "Enter the six-digit code from the email.");
  }
  const outcome = await transaction(async (connection) => {
    const [rows] = await connection.execute(`${SELECT_REQUEST} WHERE id = ? FOR UPDATE`, [id]);
    const row = rows[0];
    requirePending(row);
    if (Number(row.attempts) >= MAX_ATTEMPTS) {
      throw httpError(429, "OTP_ATTEMPTS_EXCEEDED", "Too many incorrect codes. Start over to register again.");
    }
    if (!row.otp_hash || !Number(row.otp_valid)) {
      throw httpError(400, "OTP_EXPIRED", "Your code has expired or was not sent successfully. Request a new code.");
    }
    if (!otpMatches(id, otp, row.otp_hash)) {
      await connection.execute("UPDATE email_registration_requests SET attempts = attempts + 1 WHERE id = ?", [id]);
      const remaining = Math.max(0, MAX_ATTEMPTS - Number(row.attempts) - 1);
      const error = httpError(remaining ? 400 : 429, remaining ? "INVALID_OTP" : "OTP_ATTEMPTS_EXCEEDED",
        remaining ? "Incorrect verification code." : "Too many incorrect codes. Start over to register again.");
      error.attemptsRemaining = remaining;
      return { error }; // Commit the failed-attempt counter before rejecting.
    }
    await existingAccount(connection, row.name, row.email);
    const [result] = await connection.execute(
      `INSERT INTO users (name, email, password_hash, role, status, email_verification_status, email_verified_at)
       VALUES (?, ?, ?, 'student', 'active', 'verified', NOW(3))`, [row.name, row.email, row.password_hash],
    );
    const user = { id: result.insertId, name: row.name, email: row.email, role: "student", status: "active", email_verification_status: "verified", token_version: 0 };
    const token = createToken(user); // Sign before commit so signer failure cannot leave half a response.
    await connection.execute("DELETE FROM email_registration_requests WHERE id = ?", [id]);
    delete user.token_version;
    return { token, user, message: "Email verified. Your account is ready." };
  });
  if (outcome.error) throw outcome.error;
  return outcome;
}

async function cancelRegistration(rawId) {
  const id = registrationId(rawId);
  await db.execute("DELETE FROM email_registration_requests WHERE id = ?", [id]);
  return { message: "Pending registration cleared. You can register again." };
}

module.exports = { beginRegistration, resumeRegistration, resendRegistration, completeRegistration, cancelRegistration };
