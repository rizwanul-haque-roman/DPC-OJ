import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";

const panelClass =
  "rounded-3xl border border-white/10 bg-slate-900/50 p-6 shadow-2xl backdrop-blur-xl";

const inputClass =
  "w-full rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:ring-4 focus:ring-cyan-500/10";

const buttonClass =
  "rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-2.5 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40";

const initialForm = {
  title: "",
  description: "",
  start_time: "",
  end_time: "",
};

function readUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "Invalid date" : date.toLocaleString();
}

// Preserve the selected wall-clock time for the current SQL-style API.
// We will standardize the project's timezone handling before timed judging.
function toSqlDateTime(value) {
  return `${value.replace("T", " ")}:00`;
}

function AdminContests() {
  const [user] = useState(readUser);

  const [contests, setContests] = useState([]);
  const [problems, setProblems] = useState([]);
  const [assignedProblems, setAssignedProblems] = useState([]);

  const [form, setForm] = useState(initialForm);
  const [selectedContestId, setSelectedContestId] = useState("");
  const [selectedProblemId, setSelectedProblemId] = useState("");
  const [displayTitle, setDisplayTitle] = useState("");

  const [loading, setLoading] = useState(true);
  const [assignedLoading, setAssignedLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [assignmentError, setAssignmentError] = useState("");
  const [success, setSuccess] = useState("");

  const [refreshKey, setRefreshKey] = useState(0);
  const [assignmentRefreshKey, setAssignmentRefreshKey] = useState(0);

  const isAdmin = user?.role === "admin";
  const problemActionBusy = useRef(false);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    async function loadData() {
      try {
        setLoading(true);
        setError("");

        const [contestResponse, problemResponse] = await Promise.all([
          api.get("/admin/contests", {
            signal: controller.signal,
          }),
          api.get("/admin/problems", {
            signal: controller.signal,
          }),
        ]);

        if (
          !Array.isArray(contestResponse.data) ||
          !Array.isArray(problemResponse.data)
        ) {
          throw new Error("Unexpected response from the server.");
        }

        if (controller.signal.aborted) return;

        setContests(contestResponse.data);
        setProblems(problemResponse.data);
      } catch (err) {
        if (controller.signal.aborted) return;

        setError(
          err.response?.data?.error ||
            err.message ||
            "Unable to load contest management.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => controller.abort();
  }, [isAdmin, refreshKey]);

  useEffect(() => {
    setAssignedProblems([]);
    setAssignmentError("");
    setSelectedProblemId("");
    setDisplayTitle("");

    if (!isAdmin || !selectedContestId) {
      setAssignedLoading(false);
      return;
    }

    const controller = new AbortController();

    async function loadAssignedProblems() {
      try {
        setAssignedLoading(true);

        const response = await api.get(
          `/admin/contests/${selectedContestId}/problems`,
          { signal: controller.signal },
        );

        if (!Array.isArray(response.data)) {
          throw new Error("Unexpected contest problem response.");
        }

        if (!controller.signal.aborted) {
          setAssignedProblems(response.data);
        }
      } catch (err) {
        if (controller.signal.aborted) return;

        setAssignmentError(
          err.response?.data?.error ||
            err.message ||
            "Unable to load assigned problems.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setAssignedLoading(false);
        }
      }
    }

    loadAssignedProblems();

    return () => controller.abort();
  }, [isAdmin, selectedContestId, assignmentRefreshKey]);

  const selectedContest = contests.find(
    (contest) => String(contest.id) === String(selectedContestId),
  );

  const availableProblems = problems.filter(
    (problem) =>
      !assignedProblems.some(
        (assigned) =>
          Number(assigned.id) === Number(problem.id) && !assigned.withdrawn_at,
      ),
  );

  const updateForm = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleCreateContest = async (event) => {
    event.preventDefault();

    if (busy) return;

    setError("");
    setSuccess("");

    const start = new Date(form.start_time).getTime();
    const end = new Date(form.end_time).getTime();

    if (!form.title.trim()) {
      setError("Enter a contest title.");
      return;
    }

    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      setError("Select a valid start and end time.");
      return;
    }

    if (end <= start) {
      setError("The end time must be after the start time.");
      return;
    }

    try {
      setBusy(true);

      const response = await api.post("/admin/contests", {
        title: form.title.trim(),
        description: form.description.trim(),
        start_time: toSqlDateTime(form.start_time),
        end_time: toSqlDateTime(form.end_time),
        problem_ids: [],
      });

      setForm(initialForm);
      setSelectedContestId(String(response.data.id));
      setRefreshKey((value) => value + 1);

      setSuccess("Contest created and published. Assign problems below.");
    } catch (err) {
      setError(err.response?.data?.error || "Unable to create the contest.");
    } finally {
      setBusy(false);
    }
  };

  const handleAddProblem = async (event) => {
    event.preventDefault();
    if (
      !selectedContestId ||
      !selectedProblemId ||
      busy ||
      problemActionBusy.current
    )
      return;
    const problem = problems.find(
      (item) => String(item.id) === selectedProblemId,
    );
    if (!problem || Number(problem.hidden_test_count) < 1) {
      setError("Choose a problem with hidden test cases.");
      return;
    }
    if (displayTitle.trim().length > 255) {
      setError("Contest problem name must be at most 255 characters.");
      return;
    }
    const contestProblemTitle = displayTitle.trim() || problem.title;
    const withdrawn = assignedProblems.find(
      (item) =>
        Number(item.id) === Number(selectedProblemId) && item.withdrawn_at,
    );
    const reason = window.prompt(
      withdrawn
        ? "Reason for restoring this problem (students will see it):"
        : "Reason for adding this problem (students will see it):",
    );
    if (reason === null) return;
    if (!reason.trim() || reason.trim().length > 1000) {
      setError("Enter a reason between 1 and 1000 characters.");
      return;
    }
    const impact = withdrawn
      ? "Its earlier eligible submissions, points, and penalties will count again. Its original letter is retained."
      : "Students will see this new problem. Solve time is measured from the original contest start.";
    if (
      !window.confirm(
        `${withdrawn ? "Restore" : "Add"} ${contestProblemTitle}?\n\n${impact}\n\nReason: ${reason.trim()}`,
      )
    )
      return;
    problemActionBusy.current = true;
    try {
      setBusy(true);
      setError("");
      setSuccess("");
      const response = await api.post(
        `/admin/contests/${selectedContestId}/problems`,
        {
          problem_id: Number(selectedProblemId),
          display_title: displayTitle.trim(),
          expected_revision: Number(selectedContest.revision),
          reason: reason.trim(),
        },
      );
      setSelectedProblemId("");
      setDisplayTitle("");
      setAssignmentRefreshKey((value) => value + 1);
      setRefreshKey((value) => value + 1);
      setSuccess(response.data.message || "Contest problem updated.");
    } catch (err) {
      setError(
        err.response?.data?.error || "Unable to update this contest problem.",
      );
      setAssignmentRefreshKey((value) => value + 1);
      setRefreshKey((value) => value + 1);
    } finally {
      problemActionBusy.current = false;
      setBusy(false);
    }
  };

  const handleRemoveProblem = async (problem) => {
    if (busy || problemActionBusy.current || problem.withdrawn_at) return;
    const reason = window.prompt(
      `Reason for withdrawing ${problem.title} (students will see it):`,
    );
    if (reason === null) return;
    if (!reason.trim() || reason.trim().length > 1000) {
      setError("Enter a reason between 1 and 1000 characters.");
      return;
    }
    if (
      !window.confirm(
        `Withdraw problem ${problem.serial_letter}: ${problem.title}?\n\nIts points, solved count, and penalty time will be excluded from everyone's standings. New submissions will be blocked. Existing submission history will be kept.\n\nReason: ${reason.trim()}`,
      )
    )
      return;
    problemActionBusy.current = true;
    try {
      setBusy(true);
      setError("");
      setSuccess("");
      const response = await api.delete(
        `/admin/contests/${selectedContestId}/problems/${problem.id}`,
        {
          data: {
            reason: reason.trim(),
            expected_revision: Number(selectedContest.revision),
          },
        },
      );
      setAssignmentRefreshKey((value) => value + 1);
      setRefreshKey((value) => value + 1);
      setSuccess(response.data.message || "Problem withdrawn.");
    } catch (err) {
      setError(err.response?.data?.error || "Unable to withdraw this problem.");
      setAssignmentRefreshKey((value) => value + 1);
      setRefreshKey((value) => value + 1);
    } finally {
      problemActionBusy.current = false;
      setBusy(false);
    }
  };

  if (!isAdmin) {
    return (
      <section className={panelClass}>
        <h2 className="text-xl font-bold text-white">
          Administrator access required
        </h2>

        <p className="mt-3 text-sm text-slate-400">
          Log in with an administrator account to manage contests.
        </p>

        <Link
          to="/login"
          className="mt-4 inline-block text-sm font-semibold text-cyan-300"
        >
          Go to login
        </Link>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className={panelClass}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
              Administration
            </p>

            <h2 className="mt-2 text-2xl font-bold text-white">
              Contest Control
            </h2>

            <p className="mt-2 text-sm leading-7 text-slate-400">
              Create contests and assign existing problems from the problem
              bank.
            </p>
          </div>
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200"
        >
          {error}
        </div>
      )}

      {success && (
        <div
          role="status"
          className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200"
        >
          {success}
        </div>
      )}

      <section className={panelClass}>
        <h3 className="text-xl font-bold text-white">Create Contest</h3>

        <p className="mt-2 text-sm text-slate-400">
          This first version publishes contests immediately. Add the problems
          after creating the contest.
        </p>

        <form onSubmit={handleCreateContest} className="mt-5">
          <fieldset disabled={busy || loading} className="space-y-4">
            <label className="block text-sm text-slate-300">
              Title
              <input
                required
                name="title"
                value={form.title}
                onChange={updateForm}
                placeholder="DPC-OJ Practice Contest"
                className={`mt-2 ${inputClass}`}
              />
            </label>

            <label className="block text-sm text-slate-300">
              Description
              <textarea
                name="description"
                value={form.description}
                onChange={updateForm}
                rows={4}
                placeholder="Describe the contest..."
                className={`mt-2 ${inputClass}`}
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm text-slate-300">
                Start time
                <input
                  required
                  type="datetime-local"
                  name="start_time"
                  value={form.start_time}
                  onChange={updateForm}
                  className={`mt-2 ${inputClass}`}
                />
              </label>

              <label className="block text-sm text-slate-300">
                End time
                <input
                  required
                  type="datetime-local"
                  name="end_time"
                  value={form.end_time}
                  onChange={updateForm}
                  className={`mt-2 ${inputClass}`}
                />
              </label>
            </div>

            <p className="text-xs leading-6 text-slate-500">
              Select local times on your Windows PC. After saving, verify that
              the public contest page shows the same times. We will standardize
              timezone handling before enforcing contest submission windows.
            </p>

            <button type="submit" className={buttonClass}>
              {busy ? "Saving..." : "Create Contest"}
            </button>
          </fieldset>
        </form>
      </section>

      <section className={panelClass}>
        <h3 className="text-xl font-bold text-white">
          Assign Contest Problems
        </h3>

        <p className="mt-2 text-sm leading-7 text-slate-400">
          Select a contest, then add existing problems. The backend assigns
          their A/B/C letters.
        </p>

        {loading ? (
          <p role="status" className="mt-5 text-sm text-cyan-200">
            Loading contests and problems...
          </p>
        ) : (
          <>
            <label className="mt-5 block text-sm text-slate-300">
              Contest
              <select
                value={selectedContestId}
                disabled={busy}
                onChange={(event) => {
                  setSelectedContestId(event.target.value);
                  setSuccess("");
                }}
                className={`mt-2 ${inputClass}`}
              >
                <option value="">Select a contest</option>

                {contests.map((contest) => (
                  <option key={contest.id} value={contest.id}>
                    #{contest.id} — {contest.title}
                  </option>
                ))}
              </select>
            </label>

            {contests.length === 0 && (
              <p className="mt-4 text-sm text-slate-400">
                No contests exist yet. Create one above.
              </p>
            )}

            {selectedContest && (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="font-semibold text-white">
                  {selectedContest.title}
                </p>

                <p className="mt-2 text-xs leading-6 text-slate-400">
                  {formatDate(selectedContest.start_time)} →{" "}
                  {formatDate(selectedContest.end_time)}
                </p>

                <Link
                  to={`/admin/contests/${selectedContest.id}`}
                  className="mt-4 mr-4 inline-flex rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-2.5 text-sm font-semibold text-cyan-200 hover:bg-cyan-400/20"
                >
                  Open control center →
                </Link>

                {Number(selectedContest.is_public) === 1 && (
                  <Link
                    to={`/contests/${selectedContest.id}`}
                    className="mt-3 inline-block text-sm font-semibold text-cyan-300"
                  >
                    Open public contest page →
                  </Link>
                )}
              </div>
            )}

            {selectedContestId && (
              <>
                {assignedLoading && (
                  <p role="status" className="mt-5 text-sm text-cyan-200">
                    Loading assigned problems...
                  </p>
                )}

                {assignmentError && (
                  <p role="alert" className="mt-5 text-sm text-rose-200">
                    {assignmentError}
                  </p>
                )}

                {!assignedLoading && !assignmentError && (
                  <>
                    <form
                      onSubmit={handleAddProblem}
                      className="mt-5 flex flex-col gap-4"
                    >
                      <label className="block w-full text-sm text-slate-300">
                        Problem bank
                        <select
                          required
                          value={selectedProblemId}
                          disabled={busy}
                          onChange={(event) => {
                            const id = event.target.value;
                            setSelectedProblemId(id);
                            const assigned = assignedProblems.find(
                              (item) => String(item.id) === id,
                            );
                            const original = problems.find(
                              (item) => String(item.id) === id,
                            );
                            setDisplayTitle(
                              assigned?.title || original?.title || "",
                            );
                          }}
                          className={`mt-2 ${inputClass}`}
                        >
                          <option value="">Select a problem</option>

                          {availableProblems.map((problem) => (
                            <option
                              key={problem.id}
                              value={problem.id}
                              disabled={Number(problem.hidden_test_count) < 1}
                            >
                              #{problem.id} — {problem.title}
                              {assignedProblems.some(
                                (item) =>
                                  Number(item.id) === Number(problem.id) &&
                                  item.withdrawn_at,
                              )
                                ? " — Restore withdrawn problem"
                                : ""}
                              {Number(problem.hidden_test_count) < 1
                                ? " — needs hidden tests"
                                : ""}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block w-full text-sm text-slate-300">
                        Contest problem name
                        <input
                          type="text"
                          value={displayTitle}
                          onChange={(event) =>
                            setDisplayTitle(event.target.value)
                          }
                          maxLength={255}
                          disabled={busy || !selectedProblemId}
                          placeholder="Leave blank to use the original name"
                          className={`mt-2 ${inputClass}`}
                        />
                        <span className="mt-1 block text-xs text-slate-500">
                          Only changes the name in this contest.
                        </span>
                      </label>

                      <button
                        type="submit"
                        disabled={
                          busy ||
                          !selectedProblemId ||
                          (assignedProblems.length >= 26 &&
                            !assignedProblems.some(
                              (item) =>
                                String(item.id) === selectedProblemId &&
                                item.withdrawn_at,
                            ))
                        }
                        className={`${buttonClass} self-start`}
                      >
                        {busy
                          ? "Saving..."
                          : assignedProblems.some(
                                (item) =>
                                  String(item.id) === selectedProblemId &&
                                  item.withdrawn_at,
                              )
                            ? "Restore Problem"
                            : "Add Problem"}
                      </button>
                    </form>

                    {problems.length === 0 && (
                      <p className="mt-3 text-sm text-amber-200">
                        The problem bank is empty. A problem must be created
                        before it can be assigned.
                      </p>
                    )}

                    <p className="mt-3 text-xs leading-6 text-slate-500">
                      Problems without hidden tests are disabled in this picker.
                      Withdrawn problems keep their submissions and letter, but
                      no longer contribute to standings.
                    </p>

                    {assignedProblems.length === 0 ? (
                      <div className="mt-5 rounded-2xl border border-white/10 p-6 text-center text-sm text-slate-400">
                        No problems assigned yet.
                      </div>
                    ) : (
                      <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10">
                        <table className="w-full min-w-[550px] text-sm">
                          <thead className="bg-white/[0.04] text-slate-400">
                            <tr>
                              <th className="px-4 py-3 text-left">Letter</th>
                              <th className="px-4 py-3 text-left">Problem</th>
                              <th className="px-4 py-3 text-left">
                                Difficulty
                              </th>
                              <th className="px-4 py-3 text-right">Action</th>
                            </tr>
                          </thead>

                          <tbody>
                            {assignedProblems.map((problem) => (
                              <tr
                                key={problem.id}
                                className="border-t border-white/5"
                              >
                                <td className="px-4 py-4 font-mono font-bold text-cyan-200">
                                  {problem.serial_letter}
                                </td>

                                <td className="px-4 py-4 text-white">
                                  {problem.title}
                                  {problem.original_title &&
                                    problem.original_title !==
                                      problem.title && (
                                      <p className="mt-1 text-xs text-slate-500">
                                        Original: {problem.original_title}
                                      </p>
                                    )}
                                  {problem.withdrawn_at && (
                                    <span className="ml-2 text-xs font-semibold text-amber-300">
                                      Withdrawn — excluded from standings
                                    </span>
                                  )}
                                  {problem.withdrawn_at && (
                                    <p className="mt-1 text-xs font-normal text-slate-500">
                                      {problem.withdrawn_reason}
                                    </p>
                                  )}
                                </td>

                                <td className="px-4 py-4 capitalize text-slate-400">
                                  {problem.difficulty || "—"}
                                </td>

                                <td className="px-4 py-4 text-right">
                                  <button
                                    type="button"
                                    disabled={
                                      busy || Boolean(problem.withdrawn_at)
                                    }
                                    onClick={() => handleRemoveProblem(problem)}
                                    className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-400/20 disabled:opacity-40"
                                  >
                                    {problem.withdrawn_at
                                      ? "Withdrawn"
                                      : "Withdraw"}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}

export default AdminContests;
