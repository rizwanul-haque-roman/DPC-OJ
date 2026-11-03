import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api/axios";
import PasswordInput from "../components/PasswordInput";


function Login() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();


  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };


  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");


    setSubmitting(true);


    try {
      const res = await api.post("/auth/login", formData);


      localStorage.setItem("token", res.data.token);
      localStorage.setItem("user", JSON.stringify(res.data.user));
      window.dispatchEvent(new Event("authChanged"));


      navigate("/problems");
    } catch (err) {
      setError(err.response?.data?.error || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
      <section className="mx-auto w-full max-w-3xl rounded-[28px] border border-white/10 bg-slate-900/70 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
        <div>
          <h2 className="text-3xl font-bold leading-tight text-white sm:text-4xl">
            Welcome back to your command center.
          </h2>


          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
            Log in to continue solving problems, checking verdicts, and managing
            your coding progress inside a modern dark interface.
          </p>
        </div>


        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <h3 className="text-lg font-semibold text-white">Secure</h3>
            <p className="mt-2 text-sm text-slate-400">Protected login flow</p>
          </div>


          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <h3 className="text-lg font-semibold text-white">Smart</h3>
            <p className="mt-2 text-sm text-slate-400">
              Built for coding workflows
            </p>
          </div>


          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <h3 className="text-lg font-semibold text-white">Focused</h3>
            <p className="mt-2 text-sm text-slate-400">
              Dark UI for long sessions
            </p>
          </div>
        </div>
      </section>


      <section className="mx-auto w-full max-w-3xl rounded-[28px] border border-white/10 bg-slate-900/70 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
        <h2 className="text-3xl font-bold text-white">Login</h2>
        <p className="mt-2 text-sm text-slate-400">
          Enter your credentials to access DPC-OJ.
        </p>


        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div>
            <label
              htmlFor="login-email"
              className="mb-2 block text-sm font-medium text-slate-200"
            >
              Email
            </label>
            <input
              id="login-email"
              className="w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-indigo-400/60 focus:ring-4 focus:ring-indigo-500/15"
              type="email"
              name="email"
              placeholder="Enter your email"
              value={formData.email}
              onChange={handleChange}
              autoComplete="username"
              required
            />
          </div>


          <PasswordInput
            id="login-password"
            label="Password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            autoComplete="current-password"
            placeholder="Enter your password"
            required
          />


          <button
            className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-500 to-cyan-400 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:translate-y-[-1px] hover:shadow-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "Signing in..." : "Login"}
          </button>
        </form>


        {error && (
          <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </p>
        )}


        <p className="mt-6 text-sm text-slate-400">
          Don’t have an account?{" "}
          <Link
            to="/register"
            className="font-semibold text-cyan-300 transition hover:text-cyan-200"
          >
            Register
          </Link>
        </p>
      </section>
    </div>
  );
}


export default Login;