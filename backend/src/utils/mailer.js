const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === "true",
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

module.exports = { sendPasswordResetEmail };