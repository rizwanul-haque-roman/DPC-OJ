const crypto = require("crypto");
const db = require("../db");

function httpError(status, code, message, retryAfter) {
  const error = new Error(message);
  Object.assign(error, { status, code, retryAfter });
  return error;
}

function assertSecrets() {
  for (const name of ["JWT_SECRET", "EMAIL_OTP_SECRET"]) {
    if (typeof process.env[name] !== "string" || process.env[name].length < 32) {
      throw new Error(`${name} must be configured with at least 32 characters.`);
    }
  }
}

function makeOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function hashOtp(registrationId, otp) {
  assertSecrets();
  return crypto.createHmac("sha256", process.env.EMAIL_OTP_SECRET)
    .update(`${registrationId}:${otp}`).digest("hex");
}

function otpMatches(registrationId, otp, storedHash) {
  if (!/^[a-f0-9]{64}$/.test(storedHash || "")) return false;
  return crypto.timingSafeEqual(Buffer.from(hashOtp(registrationId, otp), "hex"), Buffer.from(storedHash, "hex"));
}

function registrationId(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw httpError(400, "INVALID_REGISTRATION", "Invalid verification session. Please register again.");
  }
  return value;
}

function readCredentials(body, signingUp = false) {
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password) {
    throw httpError(400, "INVALID_CREDENTIALS", "Enter a valid email address and password.");
  }
  if (!signingUp) return { email, password };
  const rawName = body?.username ?? body?.name;
  const username = typeof rawName === "string" ? rawName.trim() : "";
  if (!/^[A-Za-z0-9_-]{3,30}$/.test(username)) {
    throw httpError(400, "INVALID_USERNAME", "Username must be 3–30 letters, numbers, underscores, or hyphens.");
  }
  if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
    throw httpError(400, "INVALID_PASSWORD", "Use at least 8 characters and at most 72 UTF-8 bytes for the password.");
  }
  return { username, email, password };
}

async function transaction(work) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

async function consumeQuota(scope, identifier, limit, seconds) {
  const key = crypto.createHash("sha256").update(`${scope}:${identifier}`).digest("hex");
  const row = await transaction(async (connection) => {
    await connection.execute(
      `INSERT INTO auth_rate_limits (rate_key, hits, expires_at)
       VALUES (?, 1, DATE_ADD(NOW(3), INTERVAL ? SECOND))
       ON DUPLICATE KEY UPDATE
         hits = IF(expires_at <= NOW(3), 1, hits + 1),
         expires_at = IF(expires_at <= NOW(3), DATE_ADD(NOW(3), INTERVAL ? SECOND), expires_at)`,
      [key, seconds, seconds],
    );
    const [rows] = await connection.execute(
      `SELECT hits, GREATEST(1, CEIL(TIMESTAMPDIFF(MICROSECOND, NOW(3), expires_at) / 1000000)) AS retry_after
       FROM auth_rate_limits WHERE rate_key = ? FOR UPDATE`, [key],
    );
    return rows[0];
  });
  // Commit counters even when denying the request.
  if (Number(row.hits) > limit) {
    throw httpError(429, "RATE_LIMITED", "Too many attempts. Please try again later.", Number(row.retry_after));
  }
}

function sendAuthError(res, error, label) {
  const expected = Number.isInteger(error.status) && error.status >= 400 && error.status < 500;
  if (!expected) console.error(label, { code: error.code, message: error.message });
  if (error.retryAfter) res.set("Retry-After", String(error.retryAfter));
  return res.status(expected ? error.status : 500).json({
    error: expected ? error.message : "Unable to process authentication. Please try again later.",
    ...(expected && error.code ? { code: error.code } : {}),
    ...(error.retryAfter ? { retry_after: error.retryAfter } : {}),
    ...(Number.isInteger(error.attemptsRemaining) ? { attempts_remaining: error.attemptsRemaining } : {}),
  });
}

module.exports = { httpError, assertSecrets, makeOtp, hashOtp, otpMatches, registrationId, readCredentials, transaction, consumeQuota, sendAuthError };
