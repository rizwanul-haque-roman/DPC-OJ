import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import ActivityHeatmap from "../components/ActivityHeatmap";
import "../components/ProfileDashboard.css";
import PasswordInput from "../components/PasswordInput";

const fields = {
  display_name: "Display name",
  bio: "Bio",
  institution: "Institution",
  department: "Department",
  github_url: "GitHub profile URL",
};

const date = (value) => (value ? new Date(value).toLocaleString() : "—");

const PASSWORD_RULES = [
  {
    id: "length",
    label: "At least 8 characters",
    test: (value) => value.length >= 8,
  },
  {
    id: "bytes",
    label: "No more than 72 UTF-8 bytes",
    test: (value) => new TextEncoder().encode(value).length <= 72,
  },
  {
    id: "uppercase",
    label: "One uppercase letter",
    test: (value) => /[A-Z]/.test(value),
  },
  {
    id: "lowercase",
    label: "One lowercase letter",
    test: (value) => /[a-z]/.test(value),
  },
  {
    id: "number",
    label: "One number",
    test: (value) => /[0-9]/.test(value),
  },
  {
    id: "symbol",
    label: "One special character",
    test: (value) => /[^A-Za-z0-9]/.test(value),
  },
];

function validateNewPassword(newPassword, confirmPassword) {
  if (!newPassword) {
    return {
      valid: false,
      message: "Enter a new password.",
    };
  }

  const failed = PASSWORD_RULES.filter((rule) => !rule.test(newPassword));

  if (failed.length > 0) {
    return {
      valid: false,
      message: `Password needs: ${failed
        .map((rule) => rule.label.toLowerCase())
        .join(", ")}.`,
    };
  }

  if (newPassword !== confirmPassword) {
    return {
      valid: false,
      message: "New password and confirmation do not match.",
    };
  }

  return {
    valid: true,
    message: "Password meets all requirements.",
  };
}

export default function Profile() {
  const { id } = useParams();
  const owner = !id;
  const base = owner ? "/profiles/me" : `/profiles/${id}`;
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("overview");
  const [refresh, setRefresh] = useState(0);
  const [year, setYear] = useState(new Date().getFullYear());

  const [day, setDay] = useState("");
  const [page, setPage] = useState(1);
  const [list, setList] = useState(null);
  const [listError, setListError] = useState("");
  const [listLoading, setListLoading] = useState(false);

  const [form, setForm] = useState({});
  const [password, setPassword] = useState({
    current_password: "",
    new_password: "",
    confirm: "",
  });

  const [passwordValidation, setPasswordValidation] = useState({
    valid: false,
    message: "",
  });

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const saving = useRef(false);

  useEffect(() => {
    const c = new AbortController();

    setData(null);
    setError("");
    setTab("overview");
    setDay("");
    setPage(1);

    api
      .get(base, { signal: c.signal })
      .then((response) => {
        if (c.signal.aborted) return;

        setData(response.data);
        setYear(response.data.current_year);
        setForm(
          Object.fromEntries(
            Object.keys(fields).map((key) => [
              key,
              response.data.user[key] || "",
            ]),
          ),
        );
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setError(e.response?.data?.error || "Unable to load profile.");
        }
      });

    return () => c.abort();
  }, [base, refresh]);

  useEffect(() => {
    if (tab === "settings" || !data) return;

    const c = new AbortController();

    setListLoading(true);
    setListError("");
    setList(null);

    const kind = tab === "overview" ? "submissions" : tab;

    api
      .get(`${base}/${kind}`, {
        signal: c.signal,
        params: {
          page: tab === "overview" ? 1 : page,
          page_size: 10,
          ...(day && tab === "submissions" ? { date: day } : {}),
        },
      })
      .then((response) => {
        if (!c.signal.aborted) setList(response.data);
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setListError(e.response?.data?.error || "Unable to load activity.");
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setListLoading(false);
      });

    return () => c.abort();
  }, [base, tab, page, day, data]);

  function selectTab(value) {
    setTab(value);
    setPage(1);
    if (value !== "submissions") setDay("");
    setNotice("");
  }

  function selectActivityDay(value) {
    selectTab("submissions");
    setDay(value);
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (saving.current) return;

    saving.current = true;
    setBusy(true);
    setNotice("");

    try {
      const response = await api.patch("/profiles/me", form);

      setData((previous) => ({
        ...previous,
        user: response.data.user,
      }));

      setNotice("Profile updated.");

      const stored = JSON.parse(localStorage.getItem("user") || "null");

      if (stored) {
        localStorage.setItem(
          "user",
          JSON.stringify({ ...stored, ...response.data.user }),
        );
        window.dispatchEvent(new Event("authChanged"));
      }
    } catch (e) {
      setNotice(e.response?.data?.error || "Unable to update profile.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  function updatePasswordField(key, value) {
    const next = {
      ...password,
      [key]: value,
    };

    setPassword(next);

    setPasswordValidation(validateNewPassword(next.new_password, next.confirm));
  }

  async function savePassword(event) {
    event.preventDefault();
    if (saving.current) return;

    if (password.new_password !== password.confirm) {
      setNotice("New passwords do not match.");
      return;
    }

    saving.current = true;
    setBusy(true);

    try {
      await api.post("/profiles/me/password", {
        current_password: password.current_password,
        new_password: password.new_password,
      });

      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.dispatchEvent(new Event("authChanged"));
      navigate("/login", { replace: true });
    } catch (e) {
      setNotice(e.response?.data?.error || "Unable to change password.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="pd-panel pd-stack">
        <p role="alert" className="pd-error">
          {error}
        </p>

        <Link className="pd-link" to="/login">
          Sign in
        </Link>

        <button
          type="button"
          className="pd-button"
          onClick={() => setRefresh((n) => n + 1)}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <p role="status" className="pd-muted">
        Loading profile…
      </p>
    );
  }

  const user = data.user;

  const selectedActivity = data.activity.filter((item) =>
    item.day.startsWith(String(year)),
  );

  const activityTotal = selectedActivity.reduce(
    (sum, item) => sum + Number(item.submissions || 0),
    0,
  );

  const joinYear = Math.min(
    Number(String(user.created_at).slice(0, 4)) || data.current_year,
    data.current_year,
  );

  const years = Array.from(
    { length: Math.max(1, data.current_year - joinYear + 1) },
    (_, i) => data.current_year - i,
  );

  const pagination = list?.pagination;

  return (
    <div className="pd-profile-page">
      <section className="pd-panel pd-profile-summary">
        <div className="pd-profile-details">
          <div className="pd-row">
            <div className="pd-profile-identity">
              <div className="pd-account-avatar">
                {(user.display_name || user.name).slice(0, 1).toUpperCase()}
              </div>

              <div className="pd-profile-name">
                <h2 className="pd-title">{user.display_name || user.name}</h2>

                <p className="pd-note">
                  @{user.name} · {user.role} · Joined{" "}
                  {new Date(user.created_at).toLocaleDateString()}
                </p>

                {user.institution && (
                  <p className="pd-note">
                    {[user.institution, user.department]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
            </div>

            {owner && (
              <div className="pd-profile-actions">
                <button
                  type="button"
                  className="pd-button"
                  onClick={() => selectTab("settings")}
                >
                  Edit profile
                </button>
              </div>
            )}
          </div>

          {user.bio && (
            <p
              className="pd-note"
              style={{ marginTop: 14, whiteSpace: "pre-wrap" }}
            >
              {user.bio}
            </p>
          )}

          {user.github_url && (
            <a
              className="pd-link"
              href={user.github_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub ↗
            </a>
          )}

          <div className="pd-stats">
            {[
              [data.summary.solved, "Unique problems solved"],
              [data.summary.submissions, "Saved submissions"],
              [data.summary.contests, "Contests submitted"],
              [data.streaks.current, "Current streak · days"],
              [data.streaks.longest, "Longest streak · days"],
            ].map(([value, label]) => (
              <div className="pd-stat" key={label}>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>

          <p className="pd-note">
            All-time statistics.{" "}
            {owner
              ? "Private owner view includes your contest activity; email and private activity are not exposed in your public profile."
              : "Public view includes public practice problems and eligible activity from ended public contests only."}{" "}
            Custom runs do not count.
          </p>
        </div>

        <div className="pd-profile-activity">
          <div className="pd-row">
            <div>
              <h3 className="pd-title">Submission activity</h3>

              <p className="pd-note">
                {activityTotal} submissions across {selectedActivity.length}{" "}
                active days in {year}
              </p>
            </div>

            <label className="pd-label pd-profile-year">
              Year
              <select
                className="pd-input"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {years.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <ActivityHeatmap
            activity={data.activity}
            year={year}
            today={data.today}
            selected={day}
            onSelect={selectActivityDay}
          />
        </div>
      </section>

      <nav className="pd-tabs" role="tablist" aria-label="Profile sections">
        {[
          "overview",
          "solved",
          "submissions",
          "contests",
          ...(owner ? ["settings"] : []),
        ].map((value) => (
          <button
            type="button"
            key={value}
            className="pd-tab"
            role="tab"
            aria-selected={tab === value}
            onClick={() => selectTab(value)}
          >
            {value === "solved"
              ? "Solved problems"
              : value[0].toUpperCase() + value.slice(1)}
          </button>
        ))}
      </nav>
      <div className="pd-profile-content pd-stack">
        {notice && (
          <p role="status" className="pd-success">
            {notice}
          </p>
        )}

        {tab === "overview" && (
          <section className="pd-panel">
            <h3 className="pd-title">Solved by difficulty</h3>

            <div className="pd-grid" style={{ marginTop: 16 }}>
              {["easy", "medium", "hard"].map((level) => {
                const count = Number(
                  data.difficulty.find((item) => item.difficulty === level)
                    ?.solved || 0,
                );

                return (
                  <div key={level}>
                    <div className="pd-row">
                      <span
                        className="pd-note"
                        style={{ textTransform: "capitalize" }}
                      >
                        {level}
                      </span>
                      <span>{count}</span>
                    </div>

                    <div className="pd-breakdown">
                      <span
                        style={{
                          width: `${
                            data.summary.solved
                              ? (count / data.summary.solved) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {tab === "settings" && owner ? (
          <div className="pd-grid">
            <form className="pd-panel pd-stack" onSubmit={saveProfile}>
              <h3 className="pd-title">Edit public profile</h3>

              <p className="pd-note">
                Your username @{user.name} stays unchanged. Email: {user.email}{" "}
                (private, read-only).
              </p>

              {Object.entries(fields).map(([key, label]) => (
                <label key={key} className="pd-label">
                  {label}

                  {key === "bio" ? (
                    <textarea
                      className="pd-input"
                      rows={3}
                      maxLength={500}
                      value={form[key] || ""}
                      onChange={(e) =>
                        setForm({ ...form, [key]: e.target.value })
                      }
                    />
                  ) : (
                    <input
                      className="pd-input"
                      type={key === "github_url" ? "url" : "text"}
                      maxLength={
                        {
                          display_name: 100,
                          institution: 150,
                          department: 100,
                          github_url: 255,
                        }[key]
                      }
                      value={form[key] || ""}
                      onChange={(e) =>
                        setForm({ ...form, [key]: e.target.value })
                      }
                    />
                  )}
                </label>
              ))}

              <button type="submit" className="pd-button" disabled={busy}>
                Save profile
              </button>
            </form>

            <form className="pd-panel pd-stack" onSubmit={savePassword}>
              <h3 className="pd-title">Change password</h3>

              <p className="pd-note">
                Changing your password signs out all existing sessions. Use at
                least 8 characters; maximum 72 UTF-8 bytes.
              </p>

              <PasswordInput
                id="current-password"
                label="Current password"
                value={password.current_password}
                onChange={(event) =>
                  updatePasswordField("current_password", event.target.value)
                }
                autoComplete="current-password"
                placeholder="Enter your current password"
                required
              />

              <div>
                <PasswordInput
                  id="new-password"
                  label="New password"
                  value={password.new_password}
                  onChange={(event) =>
                    updatePasswordField("new_password", event.target.value)
                  }
                  autoComplete="new-password"
                  placeholder="Create a new password"
                  describedBy="new-password-requirements"
                  required
                />

                <ul
                  id="new-password-requirements"
                  className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2"
                >
                  {PASSWORD_RULES.map((rule) => {
                    const passed = rule.test(password.new_password);

                    return (
                      <li
                        key={rule.id}
                        className={[
                          "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
                          passed
                            ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                            : "border-white/10 bg-white/[0.03] text-slate-400",
                        ].join(" ")}
                      >
                        <span aria-hidden="true">{passed ? "✓" : "○"}</span>
                        {rule.label}
                      </li>
                    );
                  })}
                </ul>

                {password.new_password && (
                  <p
                    className={[
                      "mt-3 text-xs font-medium",
                      passwordValidation.valid
                        ? "text-emerald-300"
                        : "text-amber-300",
                    ].join(" ")}
                  >
                    {passwordValidation.message}
                  </p>
                )}
              </div>

              <PasswordInput
                id="confirm-password"
                label="Confirm new password"
                value={password.confirm}
                onChange={(event) =>
                  updatePasswordField("confirm", event.target.value)
                }
                autoComplete="new-password"
                placeholder="Confirm your new password"
                error={
                  password.confirm && password.new_password !== password.confirm
                    ? "Passwords do not match."
                    : ""
                }
                required
              />

              <button
                type="submit"
                className="pd-button"
                disabled={
                  busy ||
                  !password.current_password ||
                  !password.new_password ||
                  !password.confirm ||
                  !passwordValidation.valid
                }
              >
                {busy ? "Changing password..." : "Change password and sign out"}
              </button>
            </form>
          </div>
        ) : (
          <section className="pd-panel">
            <div className="pd-row">
              <h3 className="pd-title">
                {tab === "overview"
                  ? "Recent submissions"
                  : tab === "solved"
                    ? "Solved problems"
                    : tab === "contests"
                      ? "Contest performance"
                      : "Submission history"}
              </h3>

              {day && tab === "submissions" && (
                <button
                  type="button"
                  className="pd-button"
                  onClick={() => {
                    setDay("");
                    setPage(1);
                  }}
                >
                  Clear date: {day}
                </button>
              )}
            </div>

            {tab === "contests" && (
              <p className="pd-note">
                Ranks reflect the latest standings, not an immutable historical
                snapshot. Withdrawn problems do not contribute.
              </p>
            )}

            {listError && (
              <p role="alert" className="pd-error">
                {listError}
              </p>
            )}

            <div className="pd-table-wrap">
              <table className="pd-table">
                <thead>
                  <tr>
                    {(tab === "solved"
                      ? ["Problem", "Difficulty", "Subject", "First solved"]
                      : tab === "contests"
                        ? ["Contest", "Rank", "Solved", "Score", "Total time"]
                        : [
                            "ID",
                            "Problem",
                            "Context",
                            "Language",
                            "Verdict",
                            "Submitted",
                          ]
                    ).map((label) => (
                      <th key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {listLoading ? (
                    <tr>
                      <td
                        colSpan={
                          tab === "solved" ? 4 : tab === "contests" ? 5 : 6
                        }
                      >
                        Loading…
                      </td>
                    </tr>
                  ) : !list?.items?.length ? (
                    <tr>
                      <td
                        colSpan={
                          tab === "solved" ? 4 : tab === "contests" ? 5 : 6
                        }
                      >
                        No activity to show yet.
                      </td>
                    </tr>
                  ) : (
                    list.items.map((item) => (
                      <tr key={item.id}>
                        {tab === "solved" ? (
                          <>
                            <td>
                              {Number(item.is_public) === 1 ? (
                                <Link to={`/problems/${item.id}`}>
                                  {item.title}
                                </Link>
                              ) : (
                                <span>{item.title} · Private</span>
                              )}
                            </td>
                            <td>{item.difficulty}</td>
                            <td>{item.subject_name || "General"}</td>
                            <td>{date(item.first_solved_at)}</td>
                          </>
                        ) : tab === "contests" ? (
                          <>
                            <td>
                              <Link to={`/contests/${item.id}/leaderboard`}>
                                {item.title}
                              </Link>
                            </td>
                            <td>{item.rank || "—"}</td>
                            <td>{item.solved}</td>
                            <td>{item.total_score}</td>
                            <td>{item.total_time_minutes} min</td>
                          </>
                        ) : (
                          <>
                            <td>
                              {owner ? (
                                <Link to={`/submissions/${item.id}`}>
                                  #{item.id}
                                </Link>
                              ) : (
                                `#${item.id}`
                              )}
                            </td>

                            <td>{item.title}</td>

                            <td>
                              {item.contest_id
                                ? `Contest #${item.contest_id}`
                                : "Practice"}
                            </td>

                            <td>{item.language}</td>

                            <td
                              style={{
                                color:
                                  item.verdict === "Accepted"
                                    ? "#6ee7b7"
                                    : undefined,
                              }}
                            >
                              {item.verdict}
                            </td>

                            <td>{date(item.submitted_at)}</td>
                          </>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {pagination && tab !== "overview" && (
              <div className="pd-row" style={{ marginTop: 18 }}>
                <span className="pd-note">
                  Page {pagination.page} of {pagination.total_pages} ·{" "}
                  {pagination.total} records
                </span>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="pd-button"
                    disabled={listLoading || pagination.page <= 1}
                    onClick={() => setPage(pagination.page - 1)}
                  >
                    Previous
                  </button>

                  <button
                    type="button"
                    className="pd-button"
                    disabled={
                      listLoading || pagination.page >= pagination.total_pages
                    }
                    onClick={() => setPage(pagination.page + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
