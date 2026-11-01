export default function ContestNotices({ contest, warning }) {
  const notices = Array.isArray(contest?.announcements)
    ? contest.announcements
    : [];
  if (!warning && notices.length === 0) return null;
  return (
    <section className="space-y-3 rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.05] p-5">
      {warning && (
        <p role="status" className="text-sm text-amber-200">
          {warning}
        </p>
      )}
      {notices.length > 0 && (
        <>
          <h3 className="font-semibold text-cyan-200">Contest announcements</h3>
          <div className="max-h-64 space-y-3 overflow-auto">
            {notices.map((item) => (
              <article
                key={item.id}
                className="rounded-xl border border-white/10 bg-slate-950/40 p-3"
              >
                <p className="text-xs text-slate-500">
                  {new Date(item.created_at).toLocaleString()} · Revision{" "}
                  {item.contest_revision}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">
                  {item.message}
                </p>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
