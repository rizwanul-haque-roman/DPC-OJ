import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import useArchive from "../hooks/useArchive";

function dateParts(value) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) return ["—", ""];
  return [
    date.toLocaleDateString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
    }),
    date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  ];
}
function DateCell({ value }) {
  const [date, time] = dateParts(value);
  return (
    <>
      <span className="oj-date">{date}</span>
      <span className="oj-subtext">{time}</span>
    </>
  );
}
function duration(start, end) {
  const difference = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(difference) || difference <= 0) return "—";
  const minutes = Math.ceil(difference / 60000);
  const hours = Math.floor(minutes / 60);
  return hours
    ? `${hours}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`
    : `${minutes}m`;
}
const statusLabel = {
  live: "Live",
  upcoming: "Upcoming",
  ended: "Finished",
  invalid: "Unavailable",
};
function pageNumbers(current, total) {
  const values = [...new Set([1, total, current - 1, current, current + 1])]
    .filter((value) => value >= 1 && value <= total)
    .sort((a, b) => a - b);
  const result = [];
  for (const value of values) {
    if (result.length && value - values[values.indexOf(value) - 1] > 1)
      result.push(`gap-${value}`);
    result.push(value);
  }
  return result;
}
export default function ArchiveTable({ kind }) {
  const contests = kind === "contests";
  const [url, setUrl] = useSearchParams();
  const q = (url.get("q") || "").slice(0, 100);
  const [search, setSearch] = useState(q);
  const [refresh, setRefresh] = useState(0);
  const [subjects, setSubjects] = useState([]);
  const [subjectError, setSubjectError] = useState("");
  const status = ["all", "live", "upcoming", "ended", "invalid"].includes(
    url.get("status"),
  )
    ? url.get("status")
    : "all";
  const difficulty = ["all", "easy", "medium", "hard"].includes(
    url.get("difficulty"),
  )
    ? url.get("difficulty")
    : "all";
  const rawSubject = url.get("subject_id") || "all";
  const subject = /^[1-9]\d*$/.test(rawSubject) ? rawSubject : "all";
  const size = ["10", "25", "50"].includes(url.get("page_size"))
    ? url.get("page_size")
    : "10";
  const sort = url.get("sort") === "oldest" ? "oldest" : "newest";
  const rawPage = url.get("page") || "1";
  const page =
    /^[1-9]\d*$/.test(rawPage) && Number(rawPage) <= 1000000 ? rawPage : "1";
  const params = new URLSearchParams({ page, page_size: size, q, sort });
  if (contests) params.set("status", status);
  else {
    params.set("difficulty", difficulty);
    params.set("subject_id", subject);
  }
  const { data, loading, updating, error } = useArchive(
    kind,
    params.toString(),
    refresh,
  );
  useEffect(() => setSearch(q), [q]);
  useEffect(() => {
    if (contests) return;
    const c = new AbortController();
    api
      .get("/problems/meta/subjects", { signal: c.signal })
      .then((response) => {
        if (!Array.isArray(response.data))
          throw new Error("Invalid subjects response.");
        if (!c.signal.aborted) {
          setSubjects(response.data);
          setSubjectError("");
        }
      })
      .catch(() => {
        if (!c.signal.aborted)
          setSubjectError("Subject options could not load. Refresh to retry.");
      });
    return () => c.abort();
  }, [contests, refresh]);
  function change(key, value) {
    setUrl((previous) => {
      const next = new URLSearchParams(previous);
      next.set(key, value);
      if (key !== "page") next.set("page", "1");
      return next;
    });
  }
  function searchNow(event) {
    event.preventDefault();
    change("q", search.trim());
  }
  const stats = contests
    ? [
        ["total", "Contests"],
        ["live", "Live"],
        ["upcoming", "Upcoming"],
        ["ended", "Finished"],
      ]
    : [
        ["total", "Problems"],
        ["easy", "Easy"],
        ["medium", "Medium"],
        ["hard", "Hard"],
      ];
  const pagination = data?.pagination;
  const rows = data?.items || [];
  const columns = contests ? 7 : 5;
  return (
    <section
      className="oj-archive"
      aria-label={contests ? "Contest archive" : "Problem archive"}
    >
      <div className="oj-archive-top">
        <div className="oj-stats" aria-label="All public archive totals">
          {stats.map(([key, label]) => (
            <span key={key} className={`oj-stat oj-tone-${key}`}>
              <strong>{data ? data.summary[key] : "—"}</strong>
              <span>{label}</span>
            </span>
          ))}
        </div>
        <button
          type="button"
          className="oj-button"
          disabled={updating}
          onClick={() => setRefresh((value) => value + 1)}
        >
          {updating ? "Updating…" : "Refresh"}
        </button>
      </div>
      <div className="oj-toolbar">
        {contests ? (
          <nav className="oj-tabs" aria-label="Filter contests by status">
            {[
              ["all", "All contests"],
              ["live", "Live"],
              ["upcoming", "Upcoming"],
              ["ended", "Finished"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={status === value}
                className={status === value ? "oj-tab is-active" : "oj-tab"}
                onClick={() => change("status", value)}
              >
                {label}
              </button>
            ))}
          </nav>
        ) : (
          <div className="oj-filter-group">
            <label className="oj-sr-only" htmlFor="difficulty">
              Difficulty
            </label>
            <select
              id="difficulty"
              className="oj-input"
              value={difficulty}
              onChange={(e) => change("difficulty", e.target.value)}
            >
              <option value="all">All difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
            <label className="oj-sr-only" htmlFor="subject">
              Subject
            </label>
            <select
              id="subject"
              className="oj-input oj-subject-select"
              value={subject}
              onChange={(e) => change("subject_id", e.target.value)}
            >
              <option value="all">All subjects</option>
              {subjects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <form className="oj-search" role="search" onSubmit={searchNow}>
          <label className="oj-sr-only" htmlFor="archive-search">
            Search {kind}
          </label>
          <input
            id="archive-search"
            className="oj-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={100}
            placeholder={
              contests
                ? "Search contests or ID…"
                : "Search title, subject, difficulty…"
            }
          />
          <button className="oj-button" type="submit">
            Search
          </button>
        </form>
      </div>
      <div className="oj-table-meta">
        <span>
          {pagination
            ? `${pagination.total} matching ${kind}`
            : "Loading archive…"}
          {q && <> · Search: “{q}”</>}
        </span>
        <div className="oj-filter-group">
          <label htmlFor="archive-sort">Sort</label>
          <select
            id="archive-sort"
            className="oj-input oj-small-input"
            value={sort}
            onChange={(e) => change("sort", e.target.value)}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
          <button
            className="oj-text-button"
            type="button"
            onClick={() => {
              setSearch("");
              setUrl({});
            }}
          >
            Reset
          </button>
        </div>
      </div>
      {error && (
        <div role="alert" className="oj-error">
          {error}
          {data && " Showing previously loaded results."}{" "}
          <button
            type="button"
            className="oj-text-button"
            onClick={() => setRefresh((value) => value + 1)}
          >
            Retry
          </button>
        </div>
      )}
      {subjectError && (
        <p role="status" className="oj-warning">
          {subjectError}
        </p>
      )}
      <div className="oj-table-scroll" aria-busy={loading || updating}>
        <table className="oj-table">
          <caption className="oj-sr-only">
            {contests
              ? "Public contests, with dates shown in your browser timezone"
              : "Public practice problems"}
          </caption>
          <thead>
            <tr>
              {(contests
                ? [
                    "ID",
                    "Contest",
                    "Status",
                    "Starts",
                    "Ends",
                    "Duration",
                    "Actions",
                  ]
                : ["ID", "Problem", "Difficulty", "Subject", "Action"]
              ).map((title) => (
                <th scope="col" key={title}>
                  {title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns} className="oj-empty" role="status">
                  Loading {kind}…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns} className="oj-empty">
                  {error
                    ? "The archive could not be loaded."
                    : `No ${kind} match these filters.`}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td className="oj-id">{row.id}</td>
                  <td className="oj-title-cell">
                    <Link className="oj-title-link" to={`/${kind}/${row.id}`}>
                      {row.title}
                    </Link>
                    {contests && row.description && (
                      <span className="oj-description" title={row.description}>
                        {row.description}
                      </span>
                    )}
                  </td>
                  {contests ? (
                    <>
                      <td>
                        <span className={`oj-status oj-tone-${row.status}`}>
                          <span aria-hidden="true">●</span>{" "}
                          {statusLabel[row.status] || "Unavailable"}
                        </span>
                      </td>
                      <td>
                        <DateCell value={row.start_time} />
                      </td>
                      <td>
                        <DateCell
                          value={
                            row.effective_end_time ||
                            row.ended_at ||
                            row.end_time
                          }
                        />
                        {row.ended_at && (
                          <span className="oj-subtext oj-tone-ended">
                            Ended early
                          </span>
                        )}
                      </td>
                      <td className="oj-nowrap">
                        {duration(
                          row.start_time,
                          row.effective_end_time ||
                            row.ended_at ||
                            row.end_time,
                        )}
                      </td>
                      <td>
                        <div className="oj-row-actions">
                          <Link to={`/contests/${row.id}`}>View →</Link>
                          <Link
                            to={`/contests/${row.id}/leaderboard`}
                            aria-label={`Standings for ${row.title}`}
                          >
                            Standings
                          </Link>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>
                        <span
                          className={`oj-status oj-tone-${String(row.difficulty || "").toLowerCase()}`}
                        >
                          {row.difficulty || "Unknown"}
                        </span>
                      </td>
                      <td className="oj-subject-cell">
                        {row.subject_name || "General"}
                      </td>
                      <td>
                        <Link className="oj-action" to={`/problems/${row.id}`}>
                          Solve →
                        </Link>
                      </td>
                    </>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="oj-pagination">
        <p role="status">
          {pagination
            ? `Showing ${pagination.from}–${pagination.to} of ${pagination.total}`
            : "—"}
        </p>
        <label className="oj-filter-group">
          Rows
          <select
            className="oj-input oj-small-input"
            value={size}
            onChange={(e) => change("page_size", e.target.value)}
          >
            {[10, 25, 50].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <nav className="oj-page-buttons" aria-label="Archive pagination">
          <button
            className="oj-button"
            disabled={!pagination || pagination.page <= 1 || loading}
            onClick={() => change("page", String(pagination.page - 1))}
          >
            Previous
          </button>
          {pagination &&
            pageNumbers(pagination.page, pagination.total_pages).map((n) =>
              typeof n === "string" ? (
                <span key={n} className="oj-page-gap">
                  …
                </span>
              ) : (
                <button
                  key={n}
                  className={`oj-page ${n === pagination.page ? "is-active" : ""}`}
                  aria-current={n === pagination.page ? "page" : undefined}
                  onClick={() => change("page", String(n))}
                >
                  {n}
                </button>
              ),
            )}
          <button
            className="oj-button"
            disabled={
              !pagination ||
              pagination.page >= pagination.total_pages ||
              loading
            }
            onClick={() => change("page", String(pagination.page + 1))}
          >
            Next
          </button>
        </nav>
      </div>
      <p className="oj-footnote">
        {contests
          ? "Dates use your browser timezone. Lists refresh every 30 seconds; early closures are reflected in status and end time."
          : "Only public problems appear here. Private contest problems remain available through their eligible contests."}{" "}
        Summary totals cover the full public archive.
      </p>
    </section>
  );
}
