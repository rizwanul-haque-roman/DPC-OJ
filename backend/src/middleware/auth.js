const jwt = require("jsonwebtoken");
const db = require("../db");


async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";

  if (!header.startsWith("Bearer ") || !header.slice(7).trim()) {
    return res.status(401).json({
      error: "Login required. please login to access this resource.",
    });
  }

  let decoded;

  try {
    decoded = jwt.verify(
      header.slice(7).trim(),
      process.env.JWT_SECRET,
    );
  } catch {
    return res.status(401).json({
      error: "Invalid or expired token.",
    });
  }

  if (
    !Number.isSafeInteger(Number(decoded?.userId)) ||
    Number(decoded.userId) <= 0
  ) {
    return res.status(401).json({
      error: "Invalid authentication token.",
    });
  }

  try {
    const [rows] = await db.execute(
      `SELECT
        id,
        name,
        email,
        role,
        status,
        token_version,
      email_verification_status
      FROM users
      WHERE id = ?
      LIMIT 1`,
      [decoded.userId],
    );

    const user = rows[0];

    if (!user || user.status !== "active") {
      return res.status(403).json({
        error: "This account is unavailable or suspended.",
      });
    }

    if (!["verified", "legacy_approved"].includes(user.email_verification_status)) {
      return res.status(403).json({
        error: "Email verification is required before using this account.",
        code: "EMAIL_NOT_VERIFIED",
      });
    }

    if (
      Number(decoded.tokenVersion || 0) !==
      Number(user.token_version)
    ) {
      return res.status(401).json({
        error: "Your session has expired. Please log in again.",
      });
    }

    req.user = {
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    return next();
  } catch (error) {
    console.error("Authentication lookup error:", error);

    return res.status(500).json({
      error: "Unable to verify your account.",
    });
  }
}


function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({
      error: "Administrator access is required.",
    });
  }

  return next();
}


module.exports = {
  requireAuth,
  requireAdmin,
};