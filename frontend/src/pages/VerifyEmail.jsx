import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import api from "../api/axios";
import { readRegistrationSession, saveRegistrationSession, storeRegistrationSession, clearRegistrationSession, finishLogin } from "../utils/registrationSession";

const inputClass = "w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-slate-100 outline-none focus:border-cyan-400/60";
const buttonClass = "rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40";

export default function VerifyEmail() {
  const location = useLocation();
  const navigate = useNavigate();
  const [registration, setRegistration] = useState(() => location.state?.registration || readRegistrationSession());
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(Date.now());
  const actionLock = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { mounted.current = false; window.clearInterval(timer); };
  }, []);

  const remaining = Math.max(0, Math.ceil(((registration?.otpExpiresAt || 0) - now) / 1000));
  const cooldown = Math.max(0, Math.ceil(((registration?.resendAt || 0) - now) / 1000));
  const locked = registration?.attempts_remaining === 0;

  function updateRegistration(next) {
    storeRegistrationSession(next);
    if (mounted.current) setRegistration(next);
  }

  async function runAction(action, work) {
    if (actionLock.current || !registration) return;
    actionLock.current = true;
    setBusy(action);
    setError("");
    setNotice("");
    try { await work(); }
    catch (requestError) {
      if (!mounted.current) return;
      const data = requestError.response?.data;
      setError(data?.error || requestError.message || "Unable to complete verification.");
      let next = { ...registration };
      if (Number.isInteger(data?.attempts_remaining)) next.attempts_remaining = data.attempts_remaining;
      if (data?.code === "OTP_ATTEMPTS_EXCEEDED") next.attempts_remaining = 0;
      if (data?.retry_after && action === "resend") next.resendAt = Date.now() + Number(data.retry_after) * 1000;
      updateRegistration(next);
    } finally {
      actionLock.current = false;
      if (mounted.current) setBusy("");
    }
  }

  function verify(event) {
    event.preventDefault();
    if (!/^\d{6}$/.test(otp)) { setError("Enter the six-digit code."); return; }
    void runAction("verify", async () => {
      const response = await api.post("/auth/verify-email", { registration_id: registration.registration_id, otp });
      if (!mounted.current) return;
      finishLogin(response.data);
      navigate("/problems", { replace: true });
    });
  }

  function resend() {
    void runAction("resend", async () => {
      const response = await api.post("/auth/resend-verification", { registration_id: registration.registration_id });
      const next = saveRegistrationSession(response.data);
      if (!mounted.current) return;
      setRegistration(next);
      setOtp("");
      setNow(Date.now());
      setNotice(next.message);
    });
  }

  function startOver() {
    if (!window.confirm("Discard this pending registration and invalidate its verification code?")) return;
    void runAction("cancel", async () => {
      await api.post("/auth/cancel-registration", { registration_id: registration.registration_id });
      clearRegistrationSession();
      if (mounted.current) navigate("/register", { replace: true });
    });
  }

  if (!registration) {
    return (
      <section className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-slate-900/70 p-6 text-slate-300">
        <h2 className="text-xl font-semibold text-white">No pending verification</h2>
        <p className="mt-3">Register first, or sign in with the email and password you used to begin registration to resume verification.</p>
        <div className="mt-5 flex gap-4"><Link to="/register" className="text-cyan-300">Register</Link><Link to="/login" className="text-cyan-300">Login</Link></div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-xl space-y-5 rounded-3xl border border-white/10 bg-slate-900/70 p-6 sm:p-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Verify your email</h2>
        <p className="mt-3 break-words text-sm leading-6 text-slate-400">Complete registration for <span className="text-slate-200">{registration.email}</span>. Your account is not created until the code is verified.</p>
      </div>
      <p role="status" className={`rounded-xl border p-3 text-sm ${registration.mail_sent === false ? "border-amber-400/20 bg-amber-400/10 text-amber-200" : "border-cyan-400/20 bg-cyan-400/10 text-cyan-200"}`}>
        {notice || registration.message}
      </p>
      <form onSubmit={verify} className="space-y-4">
        <label className="block text-sm text-slate-300">
          Six-digit verification code
          <input
            autoFocus autoComplete="one-time-code" inputMode="numeric" type="text"
            pattern="[0-9]{6}" maxLength={6} required value={otp}
            onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
            disabled={Boolean(busy) || locked}
            className={`${inputClass} mt-2 text-center text-2xl tracking-[0.4em]`} placeholder="000000"
          />
        </label>
        <p className="text-xs text-slate-400">
          {remaining > 0 ? `Code expires in ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}.` : "This code has expired or is unavailable. Request a new code."}
          {Number.isInteger(registration.attempts_remaining) && ` ${registration.attempts_remaining} incorrect attempts remaining.`}
        </p>
        <button type="submit" disabled={Boolean(busy) || locked || remaining === 0 || otp.length !== 6}
          className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-400 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
          {busy === "verify" ? "Verifying..." : "Verify and create account"}
        </button>
      </form>
      {error && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p>}
      {locked && <p className="text-sm text-amber-200">Attempt limit reached. Start over to create a new verification session. Resending does not reset incorrect attempts.</p>}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={resend} disabled={Boolean(busy) || cooldown > 0 || locked} className={buttonClass}>
          {busy === "resend" ? "Sending..." : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </button>
        <button type="button" onClick={startOver} disabled={Boolean(busy)} className={buttonClass}>{busy === "cancel" ? "Clearing..." : "Start over / change details"}</button>
      </div>
      <p className="text-xs leading-6 text-slate-500">Check your spam folder. Only the latest successfully issued code works. Never share your code. This verifies your email for registration; it is not recurring two-factor login.</p>
      <Link to="/login" className="inline-block text-sm text-cyan-300">Back to login</Link>
    </section>
  );
}
