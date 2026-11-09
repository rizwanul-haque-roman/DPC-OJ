const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === "true",
  requireTLS: process.env.SMTP_SECURE !== "true",
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendPasswordResetEmail(to, resetUrl) {
  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject: "Reset your DPC-OJ password",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#111827">
        <h2 style="color:#0f172a;margin:0 0 16px">Reset your password</h2>

        <p>Hello,</p>

        <p>
          We received a request to reset the password for your DPC-OJ account.
          Click the button below to choose a new password.
        </p>

        <p style="margin:24px 0">
          <a
            href="${resetUrl}"
            style="
              display:inline-block;
              padding:12px 22px;
              background:#1d4ed8;
              color:#ffffff;
              text-decoration:none;
              border-radius:8px;
              font-weight:bold;
            "
          >
            Reset password
          </a>
        </p>

        <p>
          This link expires in 30 minutes and can be used only once.
        </p>

        <p>
          If you did not request a password reset, you can safely ignore this
          email. Your current password will remain unchanged.
        </p>

        <p style="margin-top:28px;color:#64748b;font-size:12px">
          DPC-OJ Support
        </p>
      </div>
    `,
  });
}

function assertMailerConfigured() {
  for (const name of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"]) {
    if (!process.env[name]) throw new Error(`${name} is required.`);
  }
}

async function sendRegistrationOtp(to, otp) {
  assertMailerConfigured();
  if (!/^\d{6}$/.test(otp)) throw new Error("Invalid OTP email payload.");
  const result = await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject: "Verify your DPC-OJ email address",
    text: `Your DPC-OJ verification code is ${otp}. It expires in 10 minutes. Do not share this code. If you did not register, ignore this email. No account is activated until verification succeeds.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0f172a">
      <h2>Verify your DPC-OJ email</h2>
      <p>Enter this code in the DPC-OJ registration page:</p>
      <p style="font-size:32px;font-weight:bold;letter-spacing:8px">${otp}</p>
      <p>This code expires in 10 minutes. Do not share it with anyone.</p>
      <p>If you did not register, ignore this email. No account is activated until verification succeeds.</p>
    </div>`,
  });
  if (!Array.isArray(result.accepted) || result.accepted.length === 0) {
    throw new Error("SMTP server did not accept the verification email.");
  }
}

async function verifyMailer() {
  assertMailerConfigured();
  return transporter.verify();
}

module.exports = { sendPasswordResetEmail, sendRegistrationOtp, assertMailerConfigured, verifyMailer };