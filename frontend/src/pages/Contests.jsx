import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";

const ROW_COLUMNS = "xl:grid-cols-[minmax(0,1fr)_150px_180px_130px_120px]";

function getStatus(contest, now) {
  const start = new Date(contest.start_time).getTime();
  const end = new Date(contest.end_time).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return "invalid";
  }

  if (now < start) return "upcoming";
  if (now < end) return "live";
  return "ended";
}

function formatDateParts(value) {
  if (!value) {
    return { date: "Not scheduled", time: "" };
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return { date: "Invalid date", time: "" };
  }

  return {
    date: parsed.toLocaleDateString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
    }),
    time: parsed.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

function formatDuration(startValue, endValue) {
  const start = new Date(startValue).getTime();
  const end = new Date(endValue).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return "Not available";
  }

  const totalMinutes = Math.ceil((end - start) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}

function StatusBadge({ status }) {
  const styles = {
    live: {
      label: "Live",
      className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    },
    upcoming: {
      label: "Upcoming",
      className: "border-cyan-400/20 bg-cyan-400/10 text-cyan-200",
    },
    ended: {
      label: "Finished",
      className: "border-rose-400/20 bg-rose-400/10 text-rose-300",
    },
    invalid: {
      label: "Schedule unavailable",
      className: "border-amber-400/20 bg-amber-400/10 text-amber-200",
    },
  };

  const badge = styles[status] || styles.invalid;

  return (
    <span
      className={`inline-flex max-w-full items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${badge.className}`}
    >
      {status === "live" && (
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-300"
        />
      )}
      {badge.label}
    </span>
  );
}

function ContestRow({ contest, now }) {
  const status = getStatus(contest, now);
  const start = formatDateParts(contest.start_time);
  const title = contest.title || "Untitled contest";
  const description = contest.description?.trim();

  const duration = formatDuration(contest.start_time, contest.end_time);

  const metadata = [
    `#${contest.id}`,
    ...(contest.problem_count !== undefined && contest.problem_count !== null
      ? [`${Number(contest.problem_count)} problems`]
      : []),
    ...(contest.participant_count !== undefined &&
    contest.participant_count !== null
      ? [`${Number(contest.participant_count)} registered`]
      : []),
  ];

  return (
    <article
      className={[
        "grid grid-cols-[minmax(0,1fr)_auto]",
        "items-center gap-x-3 gap-y-2",
        "rounded-2xl border border-white/10",
        "bg-slate-900/60 px-4 py-3",
        "transition hover:border-cyan-400/30",
        "hover:bg-slate-900/80",
        "xl:gap-4 xl:px-5 xl:py-4",
        ROW_COLUMNS,
      ].join(" ")}
    >
      {/* Title: first line on mobile */}
      <div className="min-w-0">
        <h3 className="break-words text-sm font-bold text-white xl:text-base">
          <Link
            to={`/contests/${contest.id}`}
            className="transition hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300"
          >
            {title}
          </Link>
        </h3>

        <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-slate-500">
          <span className="hidden shrink-0 xl:inline">
            {metadata.join(" · ")}
          </span>

          {description && (
            <>
              <span className="hidden xl:inline" aria-hidden="true">
                ·
              </span>

              <span className="hidden truncate xl:inline" title={description}>
                {description}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Status: beside title on mobile */}
      <div className="justify-self-end xl:justify-self-start">
        <StatusBadge status={status} />
      </div>

      {/* Compact mobile metadata: second line */}
      <div className="min-w-0 text-xs leading-5 text-slate-400 xl:hidden">
        <span className="mr-2 font-mono text-slate-500">#{contest.id}</span>

        <span>{start.date}</span>

        {start.time && <span className="ml-1">{start.time}</span>}

        <span className="mx-2 text-slate-600" aria-hidden="true">
          ·
        </span>

        <span>{duration}</span>
      </div>

      {/* Desktop start date column */}
      <div className="hidden xl:block">
        <p className="text-sm font-medium text-slate-200">{start.date}</p>

        {start.time && (
          <p className="mt-1 text-xs text-slate-500">{start.time}</p>
        )}
      </div>

      {/* Desktop duration column */}
      <div className="hidden xl:block">
        <p className="text-sm text-slate-300">{duration}</p>
      </div>

      {/* Action: beside metadata on mobile */}
      <div className="justify-self-end">
        <Link
          to={`/contests/${contest.id}`}
          aria-label={`View contest: ${title}`}
          className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/20 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300 xl:rounded-xl xl:px-4 xl:py-2 xl:text-sm"
        >
          View
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}

export default function Contests() {
  const [contests, setContests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [now, setNow] = useState(() => Date.now());
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadContests() {
      try {
        setLoading(true);
        setError("");

        const response = await api.get("/contests", {
          signal: controller.signal,
        });

        if (!Array.isArray(response.data)) {
          throw new Error(
            "The server returned an unexpected contest response.",
          );
        }

        if (!controller.signal.aborted) {
          setContests(response.data);
          setNow(Date.now());
        }
      } catch (err) {
        if (controller.signal.aborted) return;

        setError(
          err.response?.data?.error ||
            err.message ||
            "Unable to load contests. Please try again.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadContests();
    return () => controller.abort();
  }, [refreshKey]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const counts = useMemo(() => {
    const result = {
      all: contests.length,
      live: 0,
      upcoming: 0,
      ended: 0,
    };

    for (const contest of contests) {
      const status = getStatus(contest, now);
      if (status !== "invalid") result[status] += 1;
    }

    return result;
  }, [contests, now]);

  const filteredContests = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return contests.filter((contest) => {
      const matchesStatus =
        statusFilter === "all" || getStatus(contest, now) === statusFilter;

      const matchesSearch =
        !normalizedSearch ||
        [contest.id, contest.title, contest.description]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

      return matchesStatus && matchesSearch;
    });
  }, [contests, search, statusFilter, now]);

  function refreshContests() {
    setRefreshKey((value) => value + 1);
  }

  function clearFilters() {
    setSearch("");
    setStatusFilter("all");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-slate-900/50 p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
              DPC-OJ Competitions
            </p>
            <h2 className="mt-2 text-2xl font-bold text-white">Contests</h2>
            <p className="mt-2 text-sm leading-7 text-slate-400">
              Explore upcoming competitions, live contests, and completed
              events.
            </p>
          </div>

          <button
            type="button"
            onClick={refreshContests}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {!loading && !error && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                filter: "all",
                label: "Total Contests",
                value: counts.all,
                color: "text-white",
              },
              {
                filter: "live",
                label: "Live Now",
                value: counts.live,
                color: "text-emerald-300",
              },
              {
                filter: "upcoming",
                label: "Upcoming",
                value: counts.upcoming,
                color: "text-cyan-300",
              },
              {
                filter: "ended",
                label: "Finished",
                value: counts.ended,
                color: "text-rose-300",
              },
            ].map((stat) => (
              <button
                key={stat.label}
                type="button"
                onClick={() => setStatusFilter(stat.filter)}
                aria-pressed={statusFilter === stat.filter}
                className={`rounded-2xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 ${
                  statusFilter === stat.filter
                    ? "border-cyan-400/40 bg-cyan-400/10"
                    : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {stat.label}
                </p>
                <p className={`mt-2 text-3xl font-bold ${stat.color}`}>
                  {stat.value}
                </p>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-white/10 bg-slate-900/50 p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {!loading && !error && contests.length > 0 && (
            <p className="text-sm text-slate-400">
              Showing {filteredContests.length} of {contests.length} contest
              {contests.length === 1 ? "" : "s"}.
            </p>
          )}
          <input
            type="search"
            aria-label="Search contests"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search contests..."
            className="w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:ring-4 focus:ring-cyan-500/10 xl:max-w-sm"
          />
        </div>

        {loading && (
          <div
            role="status"
            className="mt-6 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-6 text-sm text-cyan-100"
          >
            Loading contests from the database...
          </div>
        )}

        {!loading && error && (
          <div
            role="alert"
            className="mt-6 rounded-2xl border border-rose-400/20 bg-rose-400/10 p-5"
          >
            <p className="text-sm text-rose-200">{error}</p>
            <button
              type="button"
              onClick={refreshContests}
              className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-400/20"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && contests.length === 0 && (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-12 text-center">
            <h3 className="text-lg font-semibold text-white">
              No contests available
            </h3>
            <p className="mt-2 text-sm text-slate-400">
              Public contests will appear here once they are created and
              published.
            </p>
          </div>
        )}

        {!loading &&
          !error &&
          contests.length > 0 &&
          filteredContests.length === 0 && (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-12 text-center">
              <h3 className="text-lg font-semibold text-white">
                No matching contests
              </h3>
              <p className="mt-2 text-sm text-slate-400">
                Try a different search or select another status card.
              </p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-4 text-sm font-semibold text-cyan-300 transition hover:text-cyan-200"
              >
                Clear filters
              </button>
            </div>
          )}

        {!loading && !error && filteredContests.length > 0 && (
          <>
            <div
              aria-hidden="true"
              className={`mt-5 hidden items-center gap-4 px-5 text-xs font-semibold uppercase tracking-wide text-slate-500 xl:grid ${ROW_COLUMNS}`}
            >
              <span>Contest</span>
              <span>Status</span>
              <span>Starts</span>
              <span>Duration</span>
              <span className="text-right">Action</span>
            </div>

            <div className="mt-3 space-y-3">
              {filteredContests.map((contest) => (
                <ContestRow key={contest.id} contest={contest} now={now} />
              ))}
            </div>

            <p className="mt-5 text-xs text-slate-500">
              Dates and times are displayed in your browser’s local timezone.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
