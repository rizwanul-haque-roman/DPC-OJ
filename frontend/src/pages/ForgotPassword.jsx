import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";


function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);


  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);


    try {
      const response = await api.post("/auth/forgot-password", {
        email: email.trim(),
      });


      setMessage(response.data.message);
      setEmail("");
    } catch (err) {
      setError(
        err.response?.data?.error ||
          "Unable to process password reset request.",
      );
    } finally {
      setSubmitting(false);
    }
  }


  return (
    <section className="mx-auto w-full max-w-md rounded-[28px] border border-white/10 bg-slate-900/70 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
      <h2 className="text-3xl font-bold text-white">Forgot password</h2>


      <p className="mt-2 text-sm text-slate-400">
        Enter your account email. If it exists, we will send a password reset
        link.
      </p>


      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <div>
          <label
            htmlFor="forgot-email"
            className="mb-2 block text-sm font-medium text-slate-200"
          >
            Email
          </label>


          <input
            id="forgot-email"
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Enter your email"
            className="w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-indigo-400/60 focus:ring-4 focus:ring-indigo-500/15"
          />
        </div>


        <button
          type="submit"
          disabled={submitting}
          className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-500 to-cyan-400 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Sending reset link..." : "Send reset link"}
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
        Remembered your password?{" "}
        <Link
          to="/login"
          className="font-semibold text-cyan-300 transition hover:text-cyan-200"
        >
          Login
        </Link>
      </p>
    </section>
  );
}


export default ForgotPassword;