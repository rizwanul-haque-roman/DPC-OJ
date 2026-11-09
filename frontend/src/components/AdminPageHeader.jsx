export default function AdminPageHeader({
  title,
  description,
  actions,
}) {
  return (
    <header className="rounded-3xl border border-white/10 bg-slate-900/50 p-5 shadow-2xl sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">
            Administration
          </p>

          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">
            {title}
          </h1>

          {description && (
            <p className="mt-3 text-sm leading-6 text-slate-400">
              {description}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}