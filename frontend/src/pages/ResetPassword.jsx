import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import PasswordInput from "../components/PasswordInput";


const RULES = [
  { label: "At least 8 characters", test: (value) => value.length >= 8 },
  { label: "One uppercase letter", test: (value) => /[A-Z]/.test(value) },
  { label: "One lowercase letter", test: (value) => /[a-z]/.test(value) },
  { label: "One number", test: (value) => /[0-9]/.test(value) },
  {
    label: "One special character",
    test: (value) => /[^A-Za-z0-9]/.test(value),
  },
];


function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();


  const token = searchParams.get("token") || "";


  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);


  const allRulesPassed = RULES.every((rule) => rule.test(password));
  const passwordsMatch =
    password.length > 0 && password === confirmPassword;


  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");


    if (!token) {
      setError("Invalid or missing password reset token.");
      return;
    }


    if (!allRulesPassed) {
      setError("Your new password does not meet all requirements.");
      return;
    }


    if (!passwordsMatch) {
      setError("New password and confirmation do not match.");
      return;
    }


    setSubmitting(true);


    try {
      const response = await api.post("/auth/reset-password", {
        token,
        new_password: password,
      });


      setMessage(response.data.message);
      setPassword("");
      setConfirmPassword("");


      setTimeout(() => {
        navigate("/login", { replace: true });
      }, 2500);
    } catch (err) {
      setError(
        err.response?.data?.error || "Unable to reset password.",
      );
    } finally {
      setSubmitting(false);
    }
  }


  if (!token) {
    return (
      <section className="mx-auto w-full max-w-md rounded-[28px] border border-white/10 bg-slate-900/70 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
        <h2 className="text-2xl font-bold text-white">
          Invalid reset link
        </h2>


        <p className="mt-3 text-sm text-slate-400">
          This password reset link is invalid or incomplete.
        </p>


        <Link
          to="/forgot-password"
          className="mt-5 inline-block rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-400/20"
        >
          Request a new link
        </Link>
      </section>
    );
  }


  return (
    <section className="mx-auto w-full max-w-md rounded-[28px] border border-white/10 bg-slate-900/70 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
      <h2 className="text-3xl font-bold text-white">Reset password</h2>


      <p className="mt-2 text-sm text-slate-400">
        Choose a new password for your DPC-OJ account.
      </p>


      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <PasswordInput
          id="reset-password"
          label="New password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          placeholder="Create a new password"
          required
        />


        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {RULES.map((rule) => {
            const passed = rule.test(password);


            return (
              <li
                key={rule.label}
                className={[
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
                  passed
                    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                    : "border-white/10 bg-white/[0.03] text-slate-400",
                ].join(" ")}
              >
                <span aria-hidden="true">{passed ? "✓" : "○"}</span>
                {rule.label}
              </li>
            );
          })}
        </ul>


        <PasswordInput
          id="reset-confirm-password"
          label="Confirm new password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          autoComplete="new-password"
          placeholder="Confirm your new password"
          error={
            confirmPassword && !passwordsMatch
              ? "Passwords do not match."
              : ""
          }
          required
        />


        <button
          type="submit"
          disabled={submitting || !allRulesPassed || !passwordsMatch}
          className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-500 to-cyan-400 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Resetting password..." : "Reset password"}
        </button>
      </form>


      {message && (
        <p className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
          {message}
        </p>
      )}


      {error && (
        <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      )}


      <p className="mt-6 text-sm text-slate-400">
        <Link
          to="/login"
          className="font-semibold text-cyan-300 transition hover:text-cyan-200"
        >
          Back to login
        </Link>
      </p>
    </section>
  );
}


export default ResetPassword;