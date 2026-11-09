import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import Editor from "@monaco-editor/react";
import api from "../api/axios";

const DEFAULT_CODE = {
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    // your code goes here

    return 0;
}`,
  c: `#include <stdio.h>

int main() {
    // your code goes here

    return 0;
}`,
  python: `def main():
    # your code goes here
    pass


if __name__ == "__main__":
    main()
`,
  java: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        // your code goes here
    }
}`,
};

const LANGUAGE_OPTIONS = [
  { value: "cpp", label: "C++" },
  { value: "c", label: "C" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
];

const EDITOR_LANGUAGES = {
  cpp: "cpp",
  c: "c",
  python: "python",
  java: "java",
};

function parsePositiveId(value) {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/.test(value)
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) ? parsed : null;
}

function readUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
}

function getDifficultyClass(difficulty) {
  const value = String(difficulty || "").toLowerCase();

  if (value === "easy") {
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
  }

  if (value === "medium") {
    return "border-amber-400/20 bg-amber-400/10 text-amber-300";
  }

  if (value === "hard") {
    return "border-rose-400/20 bg-rose-400/10 text-rose-300";
  }

  return "border-white/10 bg-white/5 text-slate-300";
}

function getVerdictClass(verdict) {
  if (verdict === "Accepted") return "text-emerald-300";
  if (verdict === "Pending") return "text-amber-300";

  return "text-rose-300";
}

function SampleBox({ label, value, onCopy }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/70">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </span>

        <button
          type="button"
          onClick={() => onCopy(String(value ?? ""))}
          className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-slate-400 transition hover:bg-white/10 hover:text-white"
        >
          Copy
        </button>
      </div>

      <pre className="min-h-20 whitespace-pre-wrap break-words px-3 py-3 font-mono text-xs leading-6 text-sky-100">
        {value === null || value === undefined
          ? "Not provided"
          : value === ""
            ? "(empty)"
            : String(value)}
      </pre>
    </div>
  );
}

function ProblemDetails() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [user] = useState(readUser);

  const problemId = parsePositiveId(id);
  const rawContestId = searchParams.get("contest_id");
  const isContestMode = rawContestId !== null;
  const contestId = isContestMode
    ? parsePositiveId(rawContestId)
    : null;

  const invalidUrl =
    problemId === null ||
    (isContestMode && contestId === null);

  const contextKey = `${id}:${rawContestId ?? "practice"}`;

  const [problem, setProblem] = useState(null);
  const [loadedContextKey, setLoadedContextKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [errorStatus, setErrorStatus] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("statement");
  const [language, setLanguage] = useState("cpp");
  const [code, setCode] = useState(DEFAULT_CODE.cpp);
  const [customInput, setCustomInput] = useState("");
  const [output, setOutput] = useState("");

  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [submissions, setSubmissions] = useState([]);
  const [loadingSubmissions, setLoadingSubmissions] =
    useState(false);
  const [submissionsError, setSubmissionsError] = useState("");

  const contextRef = useRef(contextKey);
  contextRef.current = contextKey;

  const actionInFlightRef = useRef(false);
  const historyRequestRef = useRef(0);

  const busy = running || submitting;
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    const controller = new AbortController();

    async function fetchProblem() {
      setLoading(true);
      setError("");
      setDeleteError("");
      setErrorStatus(null);
      setProblem(null);
      setLoadedContextKey("");

      setActiveTab("statement");
      setLanguageMenuOpen(false);
      setOutput("");
      setCustomInput("");
      setSubmissions([]);
      setSubmissionsError("");
      setLoadingSubmissions(false);

      historyRequestRef.current += 1;

      if (invalidUrl) {
        setError(
          problemId === null
            ? "Invalid problem ID."
            : "Invalid contest ID in the URL.",
        );
        setErrorStatus(400);
        setLoading(false);
        return;
      }

      try {
        const problemUrl = isContestMode
          ? `/contests/${contestId}/problems/${problemId}`
          : `/problems/${problemId}`;

        const response = await api.get(problemUrl, {
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        const data = response.data;

        if (
          !data ||
          typeof data !== "object" ||
          Array.isArray(data) ||
          Number(data.id) !== problemId
        ) {
          throw new Error(
            "The server returned an unexpected problem response.",
          );
        }

        setProblem(data);
        setLanguage("cpp");
        setCode(
          typeof data.starter_code === "string" &&
            data.starter_code.trim()
            ? data.starter_code
            : DEFAULT_CODE.cpp,
        );
        setLoadedContextKey(contextKey);
      } catch (err) {
        if (controller.signal.aborted) return;

        const status = err.response?.status;

        setErrorStatus(status || null);
        setError(
          status === 401
            ? "Please log in to access this problem. Your session may have expired."
            : err.response?.data?.error ||
                err.message ||
                "Failed to load problem details.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    fetchProblem();

    return () => controller.abort();
  }, [
    problemId,
    contestId,
    isContestMode,
    invalidUrl,
    contextKey,
    refreshKey,
  ]);

  const loadSubmissions = useCallback(async () => {
    if (problemId === null) return;

    const requestNumber = ++historyRequestRef.current;
    const requestContext = contextKey;

    const isCurrentRequest = () =>
      historyRequestRef.current === requestNumber &&
      contextRef.current === requestContext;

    setLoadingSubmissions(true);
    setSubmissionsError("");

    try {
      const response = await api.get(
        `/submissions/problem/${problemId}`,
      );

      if (!isCurrentRequest()) return;

      if (!Array.isArray(response.data)) {
        throw new Error(
          "The server returned an unexpected history response.",
        );
      }

      const rows = response.data;

      // Contest filtering requires contest_id in the history response.
      if (
        isContestMode &&
        rows.some(
          (submission) =>
            !Object.prototype.hasOwnProperty.call(
              submission,
              "contest_id",
            ),
        )
      ) {
        throw new Error(
          "The history API must return contest_id to show contest attempts.",
        );
      }

      const visibleSubmissions = isContestMode
        ? rows.filter(
            (submission) =>
              Number(submission.contest_id) === contestId,
          )
        : rows.filter(
            (submission) =>
              submission.contest_id === null ||
              submission.contest_id === undefined ||
              submission.contest_id === "",
          );

      setSubmissions(visibleSubmissions);
    } catch (err) {
      if (!isCurrentRequest()) return;

      setSubmissionsError(
        err.response?.data?.error ||
          err.message ||
          "Failed to load submission history.",
      );
    } finally {
      if (isCurrentRequest()) {
        setLoadingSubmissions(false);
      }
    }
  }, [problemId, contestId, isContestMode, contextKey]);

  const selectLanguage = (nextLanguage) => {
    if (busy) return;

    setLanguage(nextLanguage);
    setLanguageMenuOpen(false);

    if (
      !code.trim() ||
      Object.values(DEFAULT_CODE).includes(code)
    ) {
      setCode(DEFAULT_CODE[nextLanguage]);
    }
  };

  const handleResetCode = () => {
    if (busy) return;

    setCode(DEFAULT_CODE[language]);
    setOutput("");
  };

  const handleRun = async () => {
    if (
      actionInFlightRef.current ||
      loadedContextKey !== contextKey ||
      !problem
    ) {
      return;
    }

    if (!code.trim()) {
      setOutput("Run Error\n\nCode cannot be empty.");
      return;
    }

    const requestContext = contextKey;

    actionInFlightRef.current = true;
    setRunning(true);
    setOutput("");

    try {
      const response = await api.post("/submissions/run", {
        language,
        code,
        input: customInput,
      });

      if (contextRef.current !== requestContext) return;

      const result = response.data;

      setOutput(
        [
          `Execution: ${
            result.execution_status ||
            result.verdict ||
            "Unknown"
          }`,
          "Note: Custom Run does not check whether the solution is correct.",
          result.output
            ? `Output:\n${result.output}`
            : "Output:\n(no output)",
          result.error ? `Error:\n${result.error}` : "",
          `Time: ${result.time_used_ms ?? 0} ms`,
          `Memory: ${result.memory_used_kb ?? 0} KB`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      );
    } catch (err) {
      if (contextRef.current !== requestContext) return;

      setOutput(
        `Run Error\n\n${
          err.response?.data?.error ||
          "Unable to run this code."
        }`,
      );
    } finally {
      actionInFlightRef.current = false;
      setRunning(false);
    }
  };

  const handleSubmit = async () => {
    if (
      actionInFlightRef.current ||
      invalidUrl ||
      loadedContextKey !== contextKey ||
      !problem
    ) {
      return;
    }

    if (!code.trim()) {
      setOutput("Submission Error\n\nCode cannot be empty.");
      return;
    }

    const requestContext = contextKey;

    actionInFlightRef.current = true;
    setSubmitting(true);
    setOutput("");

    try {
      const response = await api.post("/submissions", {
        problem_id: problemId,
        language,
        code,
        ...(isContestMode ? { contest_id: contestId } : {}),
      });

      if (contextRef.current !== requestContext) return;

      const result = response.data;

      setOutput(
        [
          `Verdict: ${result.verdict || "Unknown"}`,
          `Tests: ${result.passed_tests ?? 0}/${result.total_tests ?? 0}`,
          `Time: ${result.time_used_ms ?? 0} ms`,
          `Memory: ${result.memory_used_kb ?? 0} KB`,
          `Score: ${result.score ?? 0}`,
          "",
          `Submission ID: ${result.submission_id}`,
          ...(isContestMode
            ? [`Contest ID: ${result.contest_id ?? contestId}`]
            : []),
          ...(result.error ? [`Error: ${result.error}`] : []),
        ].join("\n"),
      );

      setActiveTab("submissions");
      await loadSubmissions();
    } catch (err) {
      if (contextRef.current !== requestContext) return;

      const message =
        err.response?.data?.error ||
        "Unable to submit this solution.";

      setOutput(`Submission Error\n\n${message}`);

      // If eligibility changed after the page loaded, hide the
      // workspace and require a fresh protected access check.
      if (
        isContestMode &&
        [401, 403, 404].includes(err.response?.status)
      ) {
        setProblem(null);
        setErrorStatus(err.response.status);
        setError(message);
      }
    } finally {
      actionInFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const handleDeleteProblem = async () => {
    if (!isAdmin || deleting) return;

    const requestContext = contextKey;

    const confirmed = window.confirm(
      `Permanently delete problem #${problem.id}: "${problem.title}"?\n\n` +
        "Its test cases will also be deleted. Deletion is allowed only if " +
        "the problem has no submissions and has never been used in a contest.\n\n" +
        "This action cannot be undone.",
    );

    if (!confirmed) return;

    setDeleting(true);
    setDeleteError("");

    try {
      await api.delete(`/admin/problems/${problem.id}`);
      console.log(`Problem #${problem.id} deleted successfully.`);
      if (contextRef.current === requestContext) {
        navigate("/problems", { replace: true });
      }
    } catch (err) {
        if (contextRef.current === requestContext) {
          setDeleteError(
            err.response?.data?.error ||
              err.message ||
              "Unable to delete this problem.",
          );
        }
      } 
      finally {
      setDeleting(false);
    }
  };

  const copyToClipboard = async (value) => {
    try {
      await navigator.clipboard.writeText(String(value ?? ""));
    } catch {
      // Clipboard access may be unavailable.
    }
  };

  const switchTab = (tab) => {
    setActiveTab(tab);

    if (tab === "submissions") {
      loadSubmissions();
    }
  };

  const backUrl = contestId
    ? `/contests/${contestId}`
    : isContestMode
      ? "/contests"
      : "/problems";

  if (invalidUrl) {
    return (
      <section
        role="alert"
        className="rounded-3xl border border-rose-400/20 bg-rose-400/10 p-6"
      >
        <h2 className="text-lg font-bold text-white">
          Invalid problem link
        </h2>

        <p className="mt-3 text-sm text-rose-200">
          {problemId === null
            ? "The problem ID is invalid."
            : "The contest ID in the URL is invalid."}
        </p>

        <Link
          to={backUrl}
          className="mt-4 inline-block text-sm font-semibold text-cyan-300"
        >
          Go back
        </Link>
      </section>
    );
  }

  if (error) {
    return (
      <section
        role="alert"
        className="rounded-3xl border border-rose-400/20 bg-rose-400/10 p-6"
      >
        <h2 className="text-xl font-bold text-white">
          {errorStatus === 401
            ? "Login required"
            : errorStatus === 403
              ? "Access denied"
              : errorStatus === 404
                ? "Problem unavailable"
                : "Unable to open problem"}
        </h2>

        <p className="mt-3 text-sm leading-7 text-rose-200">
          {error}
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            to={backUrl}
            className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-slate-200"
          >
            {isContestMode ? "Back to contest" : "Back to problems"}
          </Link>

          {errorStatus === 401 && (
            <Link
              to="/login"
              className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-200"
            >
              Log in
            </Link>
          )}

          <button
            type="button"
            onClick={() => setRefreshKey((value) => value + 1)}
            className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-200"
          >
            Check access again
          </button>
        </div>
      </section>
    );
  }

  // Do not render a previous problem while a new URL is checked.
  if (
    loading ||
    !problem ||
    loadedContextKey !== contextKey
  ) {
    return (
      <div
        role="status"
        className="rounded-3xl border border-cyan-400/20 bg-cyan-400/10 px-5 py-4 text-sm text-cyan-200"
      >
        {isContestMode
          ? "Checking contest access and loading problem..."
          : "Loading problem details..."}
      </div>
    );
  }

  const sampleTests =
    Array.isArray(problem.sample_tests) &&
    problem.sample_tests.length > 0
      ? problem.sample_tests
      : problem.sample_input != null ||
          problem.sample_output != null
        ? [
            {
              input: problem.sample_input,
              expected_output: problem.sample_output,
            },
          ]
        : [];

  return (
    <div className="flex h-[calc(100vh-190px)] min-h-[620px] flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950/60 shadow-2xl backdrop-blur-xl">
      {/* Workspace header */}
      <div className="shrink-0 border-b border-white/10 bg-slate-900/70 px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to={backUrl}
              title={isContestMode ? "Back to contest" : "Back to problems"}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-slate-400 transition hover:bg-white/10 hover:text-white"
            >
              ←
            </Link>

            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h2 className="truncate text-base font-bold text-white">
                  {problem.serial_letter
                    ? `${problem.serial_letter}. `
                    : ""}
                  {problem.title}
                </h2>

                <span
                  className={`hidden rounded-full border px-2.5 py-1 text-[11px] font-semibold sm:inline-flex ${getDifficultyClass(
                    problem.difficulty,
                  )}`}
                >
                  {problem.difficulty || "Unknown"}
                </span>
              </div>

              <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500">
                {[
                  `#${problem.id}`,
                  `${problem.time_limit_ms ?? "—"} ms`,
                  `${problem.memory_limit_kb ?? "—"} KB`,
                  problem.subject_name || "General",
                ].map((value, index) => (
                  <span
                    key={index}
                    className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1"
                  >
                    {value}
                  </span>
                ))}

                {isContestMode && (
                  <span className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 font-semibold text-cyan-200">
                    Contest #{contestId}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isAdmin && (
              <>
                <Link
                  to={`/admin/problems?edit=${problem.id}`}
                  className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/20"
                >
                  Edit problem
                </Link>
                <button
                  type="button"
                  onClick={handleDeleteProblem}
                  disabled={deleting}
                  className="rounded-lg border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deleting ? "Deleting..." : "Delete problem"}
                </button>
              </>
            )}
            <span className="hidden text-xs text-slate-500 md:block">
              {isContestMode ? "Contest workspace" : "Problem workspace"}
            </span>
          </div>
        </div>
        {deleteError && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs text-rose-200"
          >
            {deleteError}
          </p>
        )}
      </div>

      {isContestMode && (
        <div className="shrink-0 border-b border-cyan-400/15 bg-cyan-400/[0.05] px-4 py-2 text-xs text-cyan-100">
          {problem.contest_title || `Contest #${contestId}`} —
          submissions are checked against contest eligibility.
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[52%_48%]">
        {/* Statement column */}
        <section className="flex min-h-0 min-w-0 flex-col border-b border-white/10 bg-slate-900/35 lg:border-b-0 lg:border-r">
          <div className="flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-b border-white/10 bg-slate-900/55 px-3">
            {[
              { key: "statement", label: "Statement" },
              { key: "submissions", label: "Submissions" },
              { key: "solution", label: "Solution" },
              { key: "help", label: "Help" },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => switchTab(tab.key)}
                className={`relative h-full shrink-0 px-4 text-xs font-medium transition ${
                  activeTab === tab.key
                    ? "text-white after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-cyan-400"
                    : "text-slate-500 hover:text-slate-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {activeTab === "statement" && (
              <article className="space-y-7 text-sm leading-7 text-slate-300">
                {[
                  ["Problem Statement", problem.statement],
                  ["Input Format", problem.input_format],
                  ["Output Format", problem.output_format],
                ].map(([title, content]) => (
                  <section key={title}>
                    <h3 className="mb-3 text-base font-semibold text-white">
                      {title}
                    </h3>

                    <p className="whitespace-pre-wrap break-words">
                      {content || "Not provided"}
                    </p>
                  </section>
                ))}

                <section>
                  <h3 className="mb-2 text-base font-semibold text-white">
                    Constraints
                  </h3>

                  <ul className="space-y-1 text-slate-400">
                    {String(problem.constraints || "Not provided")
                      .split("\n")
                      .filter(Boolean)
                      .map((line, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                          <span>{line}</span>
                        </li>
                      ))}
                  </ul>
                </section>

                {sampleTests.length === 0 ? (
                  <p className="text-slate-500">
                    No sample test cases available.
                  </p>
                ) : (
                  sampleTests.map((sample, index) => (
                    <section key={index}>
                      <h3 className="mb-3 text-base font-semibold text-white">
                        Sample {index + 1}
                      </h3>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <SampleBox
                          label="Input"
                          value={sample.input}
                          onCopy={copyToClipboard}
                        />

                        <SampleBox
                          label="Output"
                          value={sample.expected_output}
                          onCopy={copyToClipboard}
                        />
                      </div>
                    </section>
                  ))
                )}

                {problem.explanation && (
                  <section>
                    <h3 className="mb-2 text-base font-semibold text-white">
                      Sample Explanation
                    </h3>
                    <p className="whitespace-pre-wrap text-slate-400">
                      {problem.explanation}
                    </p>
                  </section>
                )}

                <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <h3 className="mb-4 text-sm font-semibold text-white">
                    More Info
                  </h3>

                  <div className="space-y-3 text-xs">
                    {[
                      ["Time limit", `${problem.time_limit_ms ?? "—"} ms`],
                      ["Memory limit", `${problem.memory_limit_kb ?? "—"} KB`],
                      [
                        "Visibility",
                        Number(problem.is_public) === 1 ? "Public" : "Private",
                      ],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="flex items-center justify-between"
                      >
                        <span className="text-slate-500">{label}</span>
                        <span className="text-slate-200">{value}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </article>
            )}

            {activeTab === "submissions" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      {isContestMode
                        ? "Contest Submission History"
                        : "Practice Submission History"}
                    </h3>

                    <p className="mt-1 text-xs text-slate-500">
                      {isContestMode
                        ? `Your attempts for this problem in contest #${contestId}.`
                        : "Your non-contest attempts for this problem."}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={loadSubmissions}
                    disabled={loadingSubmissions}
                    className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300 disabled:opacity-50"
                  >
                    {loadingSubmissions ? "Refreshing..." : "Refresh"}
                  </button>
                </div>

                {loadingSubmissions ? (
                  <p className="text-xs text-slate-400">
                    Loading submissions...
                  </p>
                ) : submissionsError ? (
                  <div role="alert" className="text-xs text-rose-300">
                    {submissionsError}
                  </div>
                ) : submissions.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center text-xs text-slate-500">
                    No submissions in this context yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-white/10">
                    <table className="w-full min-w-[620px] text-left text-xs">
                      <thead className="border-b border-white/10 bg-white/[0.03] text-slate-500">
                        <tr>
                          {["ID", "Language", "Verdict", "Time", "Memory", "Submitted"].map(
                            (heading) => (
                              <th
                                key={heading}
                                scope="col"
                                className="px-3 py-3 font-medium"
                              >
                                {heading}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-white/10">
                        {submissions.map((submission) => (
                          <tr key={submission.id}>
                            <td className="px-3 py-3 font-mono text-slate-300">
                              <Link
                                to={`/submissions/${submission.id}`}
                                className="hover:text-cyan-300"
                              >
                                #{submission.id}
                              </Link>
                            </td>

                            <td className="px-3 py-3 text-slate-300">
                              {LANGUAGE_OPTIONS.find(
                                (item) => item.value === submission.language,
                              )?.label || submission.language}
                            </td>

                            <td
                              className={`px-3 py-3 font-medium ${getVerdictClass(
                                submission.verdict,
                              )}`}
                            >
                              {submission.verdict || "Pending"}
                            </td>

                            <td className="px-3 py-3 text-slate-400">
                              {submission.time_used_ms ?? 0} ms
                            </td>

                            <td className="px-3 py-3 text-slate-400">
                              {submission.memory_used_kb ?? 0} KB
                            </td>

                            <td className="px-3 py-3 text-slate-500">
                              {submission.submitted_at
                                ? new Date(submission.submitted_at).toLocaleString()
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === "solution" && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">
                Editorial content is not available in this workspace yet.
              </div>
            )}

            {activeTab === "help" && (
              <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm leading-7 text-slate-300">
                <h3 className="font-semibold text-white">Judge Notes</h3>
                <p>Read the statement and constraints carefully.</p>
                <p>Use standard input and output.</p>
                <p>Run tests your code against custom input without saving a submission.</p>
                <p>Submit checks your solution against hidden test cases.</p>
                <p>Use Tab to indent and Shift+Tab to outdent in the editor.</p>
                <p>
                  Ctrl+M toggles Tab-key focus navigation if you need to
                  move out of the editor using Tab.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Editor column */}
        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#080d1d]">
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/10 bg-slate-900/75 px-3">
            <div className="relative">
              <button
                type="button"
                disabled={busy}
                aria-expanded={languageMenuOpen}
                onClick={() => setLanguageMenuOpen((value) => !value)}
                className="flex min-w-[118px] items-center justify-between gap-4 rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
              >
                <span>
                  {LANGUAGE_OPTIONS.find(
                    (item) => item.value === language,
                  )?.label || "Select language"}
                </span>
                <span aria-hidden="true">
                  {languageMenuOpen ? "▴" : "▾"}
                </span>
              </button>

              {languageMenuOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close language menu"
                    className="fixed inset-0 z-30 cursor-default"
                    onClick={() => setLanguageMenuOpen(false)}
                  />

                  <div className="absolute left-0 top-full z-40 mt-2 min-w-[160px] rounded-xl border border-white/10 bg-slate-900 p-1.5 shadow-2xl">
                    {LANGUAGE_OPTIONS.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => selectLanguage(item.value)}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs ${
                          item.value === language
                            ? "bg-indigo-500/20 text-indigo-200"
                            : "text-slate-300 hover:bg-white/10"
                        }`}
                      >
                        <span>{item.label}</span>
                        {item.value === language && <span>✓</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetCode}
                disabled={busy}
                title="Reset code"
                className="rounded-xl border border-white/10 bg-white/[0.05] p-2 text-xs text-slate-400 hover:text-white disabled:opacity-50"
              >
                ↻
              </button>

              <button
                type="button"
                onClick={() => copyToClipboard(code)}
                title="Copy code"
                className="rounded-xl border border-white/10 bg-white/[0.05] p-2 text-xs text-slate-400 hover:text-white"
              >
                ⧉
              </button>
            </div>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain">
            <div className="relative min-h-[160px] min-w-0 flex-1 overflow-hidden">
              <Editor
                height="100%"
                width="100%"
                language={EDITOR_LANGUAGES[language]}
                theme="vs-dark"
                value={code}
                onChange={(value) => setCode(value ?? "")}
                loading={
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">
                    Loading code editor...
                  </div>
                }
                options={{
                  automaticLayout: true,
                  ariaLabel: "Solution code editor",
                  fontSize: 14,
                  fontFamily: "Consolas, 'Courier New', monospace",
                  lineHeight: 24,
                  lineNumbers: "on",
                  minimap: { enabled: false },
                  tabSize: 4,
                  insertSpaces: true,
                  detectIndentation: false,
                  tabFocusMode: false,
                  autoIndent: "full",
                  autoClosingBrackets: "always",
                  autoClosingQuotes: "always",
                  matchBrackets: "always",
                  folding: true,
                  scrollBeyondLastLine: false,
                  wordWrap: "on",
                  renderWhitespace: "selection",
                  renderLineHighlight: "line",
                  padding: { top: 16, bottom: 16 },
                  scrollbar: {
                    verticalScrollbarSize: 8,
                    horizontalScrollbarSize: 8,
                  },
                  readOnly: busy,
                  formatOnPaste: false,
                  formatOnType: false,
                }}
              />
            </div>

            <div className="shrink-0 border-t border-white/10 bg-slate-900/75">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
                <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  Test against Custom Input
                </span>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setCustomInput("")}
                  className="text-[11px] text-slate-500 hover:text-slate-200 disabled:opacity-50"
                >
                  Clear
                </button>
              </div>

              <textarea
                value={customInput}
                onChange={(event) => setCustomInput(event.target.value)}
                disabled={busy}
                rows={4}
                spellCheck={false}
                placeholder="Enter custom input here..."
                aria-label="Custom input"
                className="w-full resize-none bg-transparent px-4 py-3 font-mono text-xs leading-5 text-slate-300 outline-none placeholder:text-slate-600"
              />
            </div>

            {output && (
              <div
                role="status"
                className="max-h-44 shrink-0 overflow-y-auto border-t border-white/10 bg-slate-950/80 px-4 py-3"
              >
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-indigo-300">
                  Output
                </div>

                <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-slate-200">
                  {output}
                </pre>
              </div>
            )}

          </div>

          <div className="relative z-10 flex h-14 shrink-0 items-center justify-between border-t border-white/10 bg-slate-900/80 px-4">
            <button
              type="button"
              onClick={handleRun}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-5 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>▶</span>
              {running ? "Running..." : "Run"}
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-400 px-6 py-2 text-xs font-semibold text-white shadow-lg transition hover:shadow-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>➤</span>
              {submitting
                ? "Submitting..."
                : isContestMode
                  ? "Submit to Contest"
                  : "Submit"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

export default ProblemDetails;