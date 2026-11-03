import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api/axios";
import PasswordInput from "../components/PasswordInput";

function Register() {
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    const username = formData.username.trim();

    if (!/^[a-zA-Z0-9_-]{3,30}$/.test(username)) {
      setError(
        "Username must be 3-30 characters and may contain only letters, numbers, underscores, and hyphens.",
      );
      return;
    }

    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    try {
      setSubmitting(true);

      const res = await api.post("/auth/register", {
        username,
        email: formData.email.trim(),
        password: formData.password,
      });

      localStorage.setItem("token", res.data.token);
      localStorage.setItem("user", JSON.stringify(res.data.user));

      window.dispatchEvent(new Event("authChanged"));

      navigate("/problems");
    } catch (err) {
      setError(err.response?.data?.error || "Registration failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
      <section className="mx-auto flex w-full max-w-3xl flex-col justify-between rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur-xl sm:p-8">
        <div>
          <h2 className="text-3xl font-bold leading-tight text-white sm:text-4xl">
            Build. Submit. Conquer the judge.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
            DPC-OJ gives you a sleek modern coding space to solve problems,
            track verdicts, and level up your competitive programming workflow.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <h3 className="text-lg font-semibold text-white">100+</h3>
            <p className="mt-2 text-sm text-slate-400">
              Problems ready to solve
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <h3 className="text-lg font-semibold text-white">Fast</h3>
            <p className="mt-2 text-sm text-slate-400">
              Instant frontend experience
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <h3 className="text-lg font-semibold text-white">24/7</h3>
            <p className="mt-2 text-sm text-slate-400">
              Your coding arena stays open
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl rounded-[28px] border border-white/10 bg-slate-900/70 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
        <h2 className="text-3xl font-bold text-white">Create account</h2>
        <p className="mt-2 text-sm text-slate-400">
          Join the platform and start your coding journey.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label
              htmlFor="username"
              className="mb-2 block text-sm font-medium text-slate-200"
            >
              Username
            </label>
            <input
              id="username"
              className="w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-indigo-400/60 focus:ring-4 focus:ring-indigo-500/15"
              type="text"
              name="username"
              placeholder="e.g. roman_01"
              value={formData.username}
              onChange={handleChange}
              minLength={3}
              maxLength={30}
              pattern="[A-Za-z0-9_-]{3,30}"
              title="Use 3-30 letters, numbers, underscores, or hyphens."
              autoComplete="username"
              required
            />
            <p className="mt-2 text-xs text-slate-500">
              Use 3-30 letters, numbers, underscores, or hyphens.
            </p>
          </div>

          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-medium text-slate-200"
            >
              Email
            </label>
            <input
              id="email"
              className="w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-indigo-400/60 focus:ring-4 focus:ring-indigo-500/15"
              type="email"
              name="email"
              placeholder="Enter your email"
              value={formData.email}
              onChange={handleChange}
              autoComplete="email"
              required
            />
          </div>

          <PasswordInput
            id="register-password"
            label="Password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            autoComplete="new-password"
            placeholder="Create a password"
            minLength={6}
            hint="Password must contain at least 6 characters."
            required
          />

          <button
            className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-500 to-cyan-400 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:translate-y-[-1px] hover:shadow-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "Creating account..." : "Register"}
          </button>
        </form>

        {error && (
          <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </p>
        )}

        <p className="mt-6 text-sm text-slate-400">
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-semibold text-cyan-300 transition hover:text-cyan-200"
          >
            Login
          </Link>
        </p>
      </section>
    </div>
  );
}

export default Register;
