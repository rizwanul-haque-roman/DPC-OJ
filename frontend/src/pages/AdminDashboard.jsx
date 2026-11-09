import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import api from "../api/axios";
import AdminPageHeader from "../components/AdminPageHeader";
import "../components/ProfileDashboard.css";

function dayOffset(day, delta) {
  return new Date(Date.parse(day + "T00:00:00Z") + delta * 86400000)
    .toISOString()
    .slice(0, 10);
}

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [days, setDays] = useState(7);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let timer;

    setLoading(true);

    async function load() {
      try {
        const response = await api.get("/admin/dashboard", {
          signal: controller.signal,
          params: { days },
        });

        if (!controller.signal.aborted) {
          setData(response.data);
          setError("");
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(
            e.response?.data?.error || "Unable to load dashboard.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          timer = setTimeout(load, 30000);
        }
      }
    }

    load();

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [days, refresh]);

  const pageHeader = (
    <AdminPageHeader
      title="Admin Dashboard"
      description="Monitor platform activity, review submissions, manage contests, and identify items that need attention."
      actions={
        <button
          type="button"
          disabled={loading}
          onClick={() => setRefresh((value) => value + 1)}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RefreshCw
            size={15}
            className={loading ? "animate-spin" : ""}
            aria-hidden="true"
          />
          {loading ? "Loading…" : "Refresh"}
        </button>
      }
    />
  );

  if (!data) {
    return (
      <div className="space-y-6">
        {pageHeader}

        <section className="pd-panel">
          {error ? (
            <>
              <p role="alert" className="pd-error">
                {error}
              </p>

              <Link className="pd-link" to="/login">
                Sign in as administrator
              </Link>

              <div style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="pd-button"
                  disabled={loading}
                  onClick={() => setRefresh((value) => value + 1)}
                >
                  {loading ? "Loading…" : "Retry"}
                </button>
              </div>
            </>
          ) : (
            <p role="status" className="pd-note">
              Loading dashboard…
            </p>
          )}
        </section>
      </div>
    );
  }

  const trendMap = new Map(
    data.trend.map((item) => [item.day, item]),
  );

  const trend = Array.from({ length: data.days }, (_, index) => {
    const day = dayOffset(data.today, index - data.days + 1);

    return {
      day,
      count: Number(trendMap.get(day)?.submissions || 0),
    };
  });

  const max = Math.max(1, ...trend.map((item) => item.count));

  const alerts = [
    [
      data.submissions.pending_over_five_minutes,
      "Submissions pending over 5 minutes",
      "/admin/submissions",
    ],
    [
      data.submissions.internal_errors_today,
      "Internal Errors today",
      "/admin/submissions",
    ],
    [
      data.attention.missing_hidden_tests,
      "Problems without hidden tests",
      null,
    ],
    [
      data.attention.empty_upcoming,
      "Upcoming contests without active problems",
      "/admin/contests",
    ],
    [
      data.attention.invalid_schedules,
      "Invalid contest schedules",
      "/admin/contests",
    ],
    [
      data.attention.withdrawals_last_seven_days,
      "Problems withdrawn in the last 7 days",
      "/admin/contests",
    ],
  ];

  return (
    <div className="space-y-6">
      {pageHeader}

      {error && (
        <p role="alert" className="pd-error">
          {error} Showing last loaded data.
        </p>
      )}

      <section className="pd-panel">
        <div className="pd-stats">
          {[
            [data.accounts.active_students, "Active students"],
            [data.problems.public_problems, "Public problems"],
            [data.contest_counts.live, "Live contests"],
            [data.submissions.today, "Submissions today"],
            [data.submissions.pending, "Pending now"],
            [data.accounts.new_today, "New accounts today"],
          ].map(([value, label]) => (
            <div className="pd-stat" key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>

        <div className="pd-row" style={{ marginTop: 12 }}>
          {[
            ["/admin/problems", "Manage Problems"],
            ["/admin/contests", "Contest control"],
            ["/admin/submissions", "Submission review"],
            ["/admin/users", "User management"],
          ].map(([to, label]) => (
            <Link key={to} className="pd-button" to={to}>
              {label} →
            </Link>
          ))}
        </div>
      </section>

      <div className="pd-grid">
        <section className="pd-panel">
          <h2 className="pd-title">Needs attention</h2>

          <div style={{ marginTop: 14 }}>
            {alerts.map(([count, label, to]) => (
              <div
                className="pd-row"
                key={label}
                style={{
                  borderBottom: "1px solid #ffffff0a",
                  padding: "12px 0",
                }}
              >
                {to ? (
                  <Link className="pd-link" to={to}>
                    {label}
                  </Link>
                ) : (
                  <span className="pd-note">{label}</span>
                )}

                <strong
                  style={{ color: count ? "#fcd34d" : "#64748b" }}
                >
                  {count}
                </strong>
              </div>
            ))}
          </div>

          <p className="pd-note" style={{ marginTop: 14 }}>
            These are database indicators, not CPU, memory, or
            compiler-service health checks.
          </p>
        </section>

        <section className="pd-panel">
          <div className="pd-row">
            <h2 className="pd-title">Submission activity</h2>

            <select
              className="pd-input"
              style={{ width: 110 }}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              aria-label="Submission activity period"
            >
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
            </select>
          </div>

          <div
            className="pd-chart"
            role="img"
            aria-label={`Daily saved submissions over ${data.days} days`}
          >
            {trend.map((item) => (
              <div
                className="pd-chart-column"
                key={item.day}
                title={`${item.day}: ${item.count} submissions`}
              >
                <div
                  className="pd-chart-bar"
                  style={{
                    height: `${(item.count / max) * 100}%`,
                  }}
                />
              </div>
            ))}
          </div>

          <p className="pd-note">
            {trend[0]?.day} → {data.today} ·{" "}
            {trend.reduce((sum, item) => sum + item.count, 0)} saved
            submissions
          </p>

          <div style={{ marginTop: 18 }}>
            {data.verdicts.map((item) => (
              <div
                className="pd-row"
                key={item.verdict}
                style={{ padding: "4px 0", fontSize: 12 }}
              >
                <span className="pd-muted">
                  {item.verdict || "Unknown"}
                </span>
                <span>{item.total}</span>
              </div>
            ))}
          </div>

          <details className="pd-note">
            <summary>Daily submission counts</summary>

            {trend.map((item) => (
              <p key={item.day}>
                {item.day}: {item.count}
              </p>
            ))}
          </details>
        </section>
      </div>

      <section className="pd-panel">
        <div className="pd-row">
          <h2 className="pd-title">Live & upcoming contests</h2>

          <Link className="pd-link" to="/admin/contests">
            All contests →
          </Link>
        </div>

        <div className="pd-table-wrap">
          <table className="pd-table">
            <thead>
              <tr>
                {[
                  "Contest",
                  "Status",
                  "Starts / ends",
                  "Registered",
                  "Active problems",
                  "Action",
                ].map((heading) => (
                  <th key={heading} scope="col">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {data.contests.length ? (
                data.contests.map((contest) => (
                  <tr key={contest.id}>
                    <td>{contest.title}</td>
                    <td>{contest.status}</td>

                    <td>
                      {new Date(contest.start_time).toLocaleString()}
                      <br />
                      {new Date(
                        contest.effective_end_time,
                      ).toLocaleString()}
                    </td>

                    <td>{contest.registered}</td>
                    <td>{contest.active_problems}</td>

                    <td>
                      <Link to={`/admin/contests/${contest.id}`}>
                        Manage
                      </Link>{" "}
                      ·{" "}
                      <Link
                        to={`/contests/${contest.id}/leaderboard`}
                      >
                        Standings
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>
                    No live or upcoming contests.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="pd-panel">
        <div className="pd-row">
          <h2 className="pd-title">Recent submissions</h2>

          <Link className="pd-link" to="/admin/submissions">
            Review all →
          </Link>
        </div>

        <div className="pd-table-wrap">
          <table className="pd-table">
            <thead>
              <tr>
                {[
                  "Student",
                  "Problem",
                  "Context",
                  "Language",
                  "Verdict",
                  "Submitted",
                ].map((heading) => (
                  <th key={heading} scope="col">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {data.recent_submissions.length ? (
                data.recent_submissions.map((submission) => (
                  <tr key={submission.id}>
                    <td>
                      <Link to={`/users/${submission.user_id}`}>
                        {submission.user_name}
                      </Link>
                    </td>

                    <td>
                      <Link to={`/submissions/${submission.id}`}>
                        {submission.problem_title}
                      </Link>
                    </td>

                    <td>
                      {submission.contest_id
                        ? `Contest #${submission.contest_id}`
                        : "Practice"}
                    </td>

                    <td>{submission.language}</td>
                    <td>{submission.verdict}</td>

                    <td>
                      {new Date(
                        submission.submitted_at,
                      ).toLocaleString()}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>No submissions yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}