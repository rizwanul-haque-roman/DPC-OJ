const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");
const crypto = require("crypto");
const { sendPasswordResetEmail } = require("../utils/mailer");
const { readCredentials, registrationId, consumeQuota, sendAuthError, httpError, assertSecrets } = require("../utils/registrationSecurity");
const { beginRegistration, resumeRegistration, resendRegistration, completeRegistration, cancelRegistration } = require("../services/registrationOtp");

function createToken(user) {
  return jwt.sign({ userId: user.id, role: user.role, tokenVersion: Number(user.token_version || 0) },
    process.env.JWT_SECRET, { expiresIn: "7d" });
}

function authRoute(handler) {
  return async (req, res) => {
    res.set("Cache-Control", "no-store");
    try { return await handler(req, res); }
    catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        error = httpError(409, "ACCOUNT_EXISTS", "Username or email is already registered. Please use different details.");
      }
      return sendAuthError(res, error, "Authentication request failed");
    }
  };
}

const ipFor = (req) => req.ip || req.socket?.remoteAddress || "unknown";

router.post("/register", authRoute(async (req, res) => {
  const credentials = readCredentials(req.body, true);
  await consumeQuota("register-ip", ipFor(req), 30, 900);
  await consumeQuota("register-email", credentials.email, 5, 3600);
  const result = await beginRegistration(credentials);
  return res.status(202).json(result);
}));

router.post("/verify-email", authRoute(async (req, res) => {
  const id = registrationId(req.body?.registration_id);
  await consumeQuota("verify-ip", ipFor(req), 60, 900);
  const result = await completeRegistration(id, req.body?.otp, createToken);
  return res.status(201).json(result);
}));

router.post("/resend-verification", authRoute(async (req, res) => {
  const id = registrationId(req.body?.registration_id);
  await consumeQuota("resend-ip", ipFor(req), 20, 900);
  return res.json(await resendRegistration(id));
}));

router.post("/cancel-registration", authRoute(async (req, res) => {
  const id = registrationId(req.body?.registration_id);
  await consumeQuota("cancel-ip", ipFor(req), 30, 900);
  return res.json(await cancelRegistration(id));
}));

router.post("/login", authRoute(async (req, res) => {
  const { email, password } = readCredentials(req.body);
  await consumeQuota("login-ip", ipFor(req), 60, 900);
  await consumeQuota("login-email", email, 20, 900);
  const [rows] = await db.execute(
    `SELECT id, name, email, password_hash, role, token_version, status, email_verification_status
     FROM users WHERE email = ? LIMIT 1`, [email],
  );
  const user = rows[0];
  if (!user) {
    const pending = await resumeRegistration(email, password);
    if (pending) return res.status(202).json(pending);
    throw httpError(401, "INVALID_LOGIN", "Invalid email or password.");
  }
  if (!(await bcrypt.compare(password, user.password_hash))) {
    throw httpError(401, "INVALID_LOGIN", "Invalid email or password.");
  }
  if (user.status !== "active") {
    throw httpError(403, "ACCOUNT_UNAVAILABLE", user.status === "suspended"
      ? "This account has been suspended. Please contact an administrator."
      : "This account is no longer available. Please contact an administrator.");
  }
  if (!["verified", "legacy_approved"].includes(user.email_verification_status)) {
    throw httpError(403, "EMAIL_NOT_VERIFIED", "This account is not approved for login. Please contact support to verify your email.");
  }
  const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status, email_verification_status: user.email_verification_status };
  return res.json({ token: createToken(user), user: safeUser });
}));



router.post("/forgot-password", async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email || email.length > 255) return res.status(400).json({ error: "Enter a valid email address." });
    await consumeQuota("forgot-ip", ipFor(req), 10, 900);
    await consumeQuota("forgot-email", email, 3, 3600);
    const [users] = await db.execute(
      `SELECT id, email, display_name, name FROM users WHERE email = ? AND status = 'active'
       AND email_verification_status IN ('verified', 'legacy_approved') LIMIT 1`, [email],
    );
    const genericResponse = { message: "If an account exists for this email, a password reset link has been sent." };
    if (!users.length) return res.json(genericResponse);
    const user = users[0];
    await db.execute("UPDATE password_resets SET used_at = NOW(3) WHERE user_id = ? AND used_at IS NULL", [user.id]);
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    await db.execute(
      `INSERT INTO password_resets (user_id, token_hash, expires_at)
       VALUES (?, ?, DATE_ADD(NOW(3), INTERVAL 30 MINUTE))`, [user.id, tokenHash],
    );
    const resetUrl = `${process.env.APP_URL}/reset-password?token=${token}`;
    await sendPasswordResetEmail(user.email, resetUrl);
    return res.json(genericResponse);
  } catch (error) {
    return sendAuthError(res, error, "Forgot password error");
  }
});

router.post("/reset-password", async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    await consumeQuota("reset-ip", ipFor(req), 30, 900);
    const token = String(req.body?.token || "");
    const newPassword = String(req.body?.new_password || "");
    if (!/^[a-f0-9]{64}$/i.test(token)) return res.status(400).json({ error: "Invalid or expired password reset link." });
    if (newPassword.length < 8 || Buffer.byteLength(newPassword, "utf8") > 72) {
      return res.status(400).json({ error: "Use a password of at least 8 characters and no more than 72 UTF-8 bytes." });
    }
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const { transaction } = require("../utils/registrationSecurity");
    const hash = await bcrypt.hash(newPassword, 10);
    const completed = await transaction(async (connection) => {
      const [records] = await connection.execute(
        `SELECT pr.id, pr.user_id FROM password_resets pr
         INNER JOIN users u ON u.id = pr.user_id
         WHERE pr.token_hash = ? AND pr.used_at IS NULL AND pr.expires_at > NOW(3)
           AND u.status = 'active' AND u.email_verification_status IN ('verified', 'legacy_approved')
         LIMIT 1 FOR UPDATE`, [tokenHash],
      );
      if (!records.length) return false;
      const record = records[0];
      const [updated] = await connection.execute(
        `UPDATE users SET password_hash = ?, token_version = token_version + 1
         WHERE id = ? AND status = 'active'`, [hash, record.user_id],
      );
      if (!updated.affectedRows) throw httpError(409, "RESET_FAILED", "Unable to reset password. Request a new link.");
      await connection.execute("UPDATE password_resets SET used_at = NOW(3) WHERE user_id = ? AND used_at IS NULL", [record.user_id]);
      return true;
    });
    if (!completed) return res.status(400).json({ error: "Invalid or expired password reset link." });
    return res.json({ message: "Password reset successfully. Please sign in with your new password." });
  } catch (error) {
    return sendAuthError(res, error, "Reset password error");
  }
});

module.exports = router;
