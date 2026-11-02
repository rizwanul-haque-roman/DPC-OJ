import { useState } from "react";

const EYE_OPEN = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EYE_CLOSED = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M3 3l18 18" />
    <path d="M10.6 5.7A10.9 10.9 0 0 1 12 5.5C18.5 5.5 22 12 22 12a19 19 0 0 1-3.2 4M6.5 6.7C3.8 8.5 2 12 2 12s3.5 6.5 10 6.5c1.5 0 2.9-.3 4.1-.8" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </svg>
);

export default function PasswordInput({
  id,
  label,
  value,
  onChange,
  autoComplete = "current-password",
  placeholder = "Enter your password",
  error = "",
  hint = "",
  describedBy = "",
  className = "",
  ...props
}) {
  const [visible, setVisible] = useState(false);

  const hintId = describedBy || `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label
          htmlFor={id}
          className="mb-2 block text-sm font-medium text-slate-200"
        >
          {label}
        </label>
      )}

      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          placeholder={placeholder}
          className={[
            "w-full rounded-2xl border bg-white/[0.05] px-4 py-3 pr-12",
            "text-slate-100 outline-none transition placeholder:text-slate-500",
            error
              ? "border-rose-400/50 focus:border-rose-400 focus:ring-4 focus:ring-rose-500/15"
              : "border-white/10 focus:border-indigo-400/60 focus:ring-4 focus:ring-indigo-500/15",
          ].join(" ")}
          aria-invalid={Boolean(error)}
          aria-describedby={[
            error ? errorId : "",
            hint ? hintId : "",
          ].filter(Boolean).join(" ")}
          {...props}
        />

        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white/10 hover:text-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
        >
          {visible ? EYE_CLOSED : EYE_OPEN}
        </button>
      </div>

      {error && (
        <p
          id={errorId}
          className="mt-2 text-xs font-medium text-rose-300"
        >
          {error}
        </p>
      )}

      {hint && !error && (
        <p
          id={hintId}
          className="mt-2 text-xs text-slate-500"
        >
          {hint}
        </p>
      )}
    </div>
  );
}