const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");
const crypto = require("crypto");
const { sendPasswordResetEmail } = require("../utils/mailer");


const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,30}$/;


function createToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      role: user.role,
      tokenVersion: Number(user.token_version || 0),
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d",
    },
  );
}


router.post("/register", async (req, res) => {
  const username = String(req.body.username || req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");


  if (!username || !email || !password) {
    return res.status(400).json({
      error: "Username, email, and password are required.",
    });
  }


  if (!USERNAME_PATTERN.test(username)) {
    return res.status(400).json({
      error:
        "Username must be 3-30 characters and may contain only letters, numbers, underscores, and hyphens.",
    });
  }


  if (password.length < 6) {
    return res.status(400).json({
      error: "Password must be at least 6 characters long.",
    });
  }


  try {
    const [existing] = await db.execute(
      `SELECT id, name, email
       FROM users
       WHERE LOWER(name) = LOWER(?) OR LOWER(email) = LOWER(?)
       LIMIT 1`,
      [username, email],
    );


    if (existing.length > 0) {
      const existingUser = existing[0];


      if (existingUser.name.toLowerCase() === username.toLowerCase()) {
        return res.status(409).json({
          error: "Username is already taken.",
        });
      }


      return res.status(409).json({
        error: "Email is already registered.",
      });
    }


    const passwordHash = await bcrypt.hash(password, 10);


    const [result] = await db.execute(
      `INSERT INTO users
        (name, email, password_hash, role, status)
       VALUES (?, ?, ?, 'student', 'active')`,
      [username, email, passwordHash],
    );


    const user = {
      id: result.insertId,
      name: username,
      email,
      role: "student",
      status: "active",
    };


    const token = createToken(user);


    return res.status(201).json({
      token,
      user,
    });
  } catch (err) {
    console.error("Registration error:", err);


    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        error: "Username or email is already registered.",
      });
    }


    return res.status(500).json({
      error: "Unable to create account.",
    });
  }
});


router.post("/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");


  if (!email || !password) {
    return res.status(400).json({
      error: "Email and password are required.",
    });
  }


  try {
    const [rows] = await db.execute(
      `SELECT
        id,
        name,
        email,
        password_hash,
        role,
        token_version,
        status
      FROM users
      WHERE LOWER(email) = LOWER(?)
      LIMIT 1`,
      [email],
    );


    if (rows.length === 0) {
      return res.status(401).json({
        error: "Invalid email or password.",
      });
    }


    const user = rows[0];


    const validPassword = await bcrypt.compare(password, user.password_hash);


    if (!validPassword) {
      return res.status(401).json({
        error: "Invalid email or password.",
      });
    }


    if (user.status !== "active") {
      const errorMessage =
        user.status === "suspended"
          ? "This account has been suspended. Please contact an administrator."
          : "This account is no longer available. Please contact an administrator.";


      return res.status(403).json({
        error: errorMessage,
      });
    }


    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
    };


    const token = createToken(user);


    return res.json({
      token,
      user: safeUser,
    });
  } catch (err) {
    console.error("Login error:", err);


    return res.status(500).json({
      error: "Unable to log in.",
    });
  }
});


router.post("/forgot-password", async (req, res) => {
  try {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();


    if (!email || email.length > 255) {
      return res.status(400).json({
        error: "Enter a valid email address.",
      });
    }


    const [users] = await db.execute(
      `SELECT id, email, display_name, name
       FROM users
       WHERE email = ? AND status = 'active'
       LIMIT 1`,
      [email],
    );


    const genericResponse = {
      message:
        "If an account exists for this email, a password reset link has been sent.",
    };


    if (users.length === 0) {
      return res.json(genericResponse);
    }


    const user = users[0];


    await db.execute(
      `UPDATE password_resets
       SET used_at = NOW(3)
       WHERE user_id = ? AND used_at IS NULL`,
      [user.id],
    );


    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");


    await db.execute(
      `INSERT INTO password_resets
        (user_id, token_hash, expires_at)
       VALUES (?, ?, DATE_ADD(NOW(3), INTERVAL 30 MINUTE))`,
      [user.id, tokenHash],
    );


    const resetUrl = `${process.env.APP_URL}/reset-password?token=${token}`;


    await sendPasswordResetEmail(user.email, resetUrl);


    return res.json(genericResponse);
  } catch (error) {
    console.error("Forgot password error:", error);


    return res.status(500).json({
      error: "Unable to process password reset request.",
    });
  }
});


router.post("/reset-password", async (req, res) => {
  try {
    const token = String(req.body?.token || "");
    const newPassword = String(req.body?.new_password || "");


    if (!/^[a-f0-9]{64}$/i.test(token)) {
      return res.status(400).json({
        error: "Invalid or expired password reset link.",
      });
    }


    if (
      newPassword.length < 8 ||
      Buffer.byteLength(newPassword, "utf8") > 72
    ) {
      return res.status(400).json({
        error:
          "Use a password of at least 8 characters and no more than 72 UTF-8 bytes.",
      });
    }


    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");


    const [records] = await db.execute(
      `SELECT pr.id, pr.user_id, pr.expires_at, pr.used_at
       FROM password_resets pr
       INNER JOIN users u ON u.id = pr.user_id
       WHERE pr.token_hash = ?
         AND u.status = 'active'
       LIMIT 1`,
      [tokenHash],
    );


    const record = records[0];


    if (
      !record ||
      record.used_at ||
      new Date(record.expires_at).getTime() <= Date.now()
    ) {
      return res.status(400).json({
        error: "Invalid or expired password reset link.",
      });
    }


    const hash = await bcrypt.hash(newPassword, 10);


    const [updated] = await db.execute(
      `UPDATE users
       SET password_hash = ?,
           token_version = token_version + 1
       WHERE id = ? AND status = 'active'`,
      [hash, record.user_id],
    );


    if (!updated.affectedRows) {
      return res.status(409).json({
        error: "Unable to reset password. Please request a new link.",
      });
    }


    await db.execute(
      `UPDATE password_resets
       SET used_at = NOW(3)
       WHERE id = ?`,
      [record.id],
    );


    return res.json({
      message:
        "Password reset successfully. Please sign in with your new password.",
    });
  } catch (error) {
    console.error("Reset password error:", error);


    return res.status(500).json({
      error: "Unable to reset password.",
    });
  }
});


module.exports = router;