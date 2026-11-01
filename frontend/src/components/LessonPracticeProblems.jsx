import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  Circle,
  Code2,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import api from "../api/axios";

const PAGE_SIZE = 5;

const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40";

function difficultyClass(value) {
  const difficulty = String(value || "").toLowerCase();

  if (difficulty === "easy") {
    return "bg-emerald-400/10 text-emerald-200";
  }

  if (difficulty === "medium") {
    return "bg-amber-400/10 text-amber-200";
  }

  if (difficulty === "hard") {
    return "bg-rose-400/10 text-rose-200";
  }

  return "bg-white/5 text-slate-400";
}

export default function LessonPracticeProblems({ topicId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const controller = new AbortController();

    async function loadPracticeProblems() {
      setLoading(true);
      setError("");
      setData(null);

      try {
        const response = await api.get(
          `/learn/topics/${topicId}/practice-problems`,
          { signal: controller.signal },
        );

        if (
          !Array.isArray(response.data?.problems) ||
          typeof response.data.authenticated !== "boolean"
        ) {
          throw new Error("Unexpected practice-problem response.");
        }

        if (controller.signal.aborted) return;

        const nextData = response.data;

        setData(nextData);
        setPage((current) =>
          Math.max(
            1,
            Math.min(
              current,
              Math.ceil(nextData.problems.length / PAGE_SIZE) || 1,
            ),
          ),
        );
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(
            requestError.response?.data?.error ||
              requestError.message ||
              "Unable to load practice problems.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadPracticeProblems();

    return () => controller.abort();
  }, [topicId, refresh]);

  const problems = data?.problems || [];
  const authenticated = data?.authenticated === true;

  const solvedCount = problems.filter(
    (problem) => problem.solved === true,
  ).length;

  const pageCount = Math.max(
    1,
    Math.ceil(problems.length / PAGE_SIZE),
  );

  const currentPage = Math.min(page, pageCount);

  const visibleProblems = problems.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  return (
    <section className="mt-8 border-t border-white/10 pt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <Code2 size={19} className="text-cyan-300" />
            Practice this topic
          </h2>

          <p className="mt-2 text-xs leading-6 text-slate-400">
            Apply this lesson by solving related problems.
          </p>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={() => setRefresh((value) => value + 1)}
          className={buttonClass}
        >
          <RefreshCw
            size={13}
            className={loading ? "animate-spin" : ""}
          />
          Refresh
        </button>
      </div>

      {loading ? (
        <p
          role="status"
          className="py-6 text-sm text-slate-500"
        >
          Loading practice problems...
        </p>
      ) : error ? (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200"
        >
          <p>{error}</p>

          <button
            type="button"
            onClick={() => setRefresh((value) => value + 1)}
            className={`${buttonClass} mt-3`}
          >
            Retry
          </button>
        </div>
      ) : problems.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-white/10 p-5 text-sm leading-6 text-slate-500">
          No practice problems are available for this lesson yet.
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-slate-500">
              {problems.length} practice{" "}
              {problems.length === 1 ? "problem" : "problems"}
            </span>

            {authenticated ? (
              <span className="font-medium text-emerald-300">
                {solvedCount} of {problems.length} solved
              </span>
            ) : (
              <Link
                to="/login"
                className="text-cyan-300 hover:text-cyan-200"
              >
                Log in to track solved problems
              </Link>
            )}
          </div>

          <div className="mt-3 space-y-3">
            {visibleProblems.map((problem) => {
              const solved = problem.solved === true;

              return (
                <article
                  key={problem.id}
                  className="rounded-2xl border border-white/10 bg-slate-950/40 p-4"
                >
                  <div className="flex items-start gap-3">
                    {solved ? (
                      <CheckCircle2
                        size={19}
                        aria-label="Solved"
                        className="mt-1 shrink-0 text-emerald-300"
                      />
                    ) : (
                      <Circle
                        size={19}
                        aria-label={
                          authenticated
                            ? "Not solved"
                            : "Log in to view solve status"
                        }
                        className="mt-1 shrink-0 text-slate-600"
                      />
                    )}

                    <div className="min-w-0 flex-1">
                      <h3 className="break-words text-sm font-semibold text-slate-100">
                        {problem.title}
                      </h3>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-slate-500">
                          #{problem.id}
                        </span>

                        <span
                          className={`rounded-full px-2.5 py-1 text-xs capitalize ${difficultyClass(
                            problem.difficulty,
                          )}`}
                        >
                          {problem.difficulty || "Unspecified"}
                        </span>

                        {solved && (
                          <span className="text-xs text-emerald-300">
                            Solved
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex justify-end">
                    <Link
                      to={`/problems/${problem.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${
                        solved ? "Review" : "Solve"
                      } ${problem.title} in a new tab`}
                      className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/20"
                    >
                      {solved ? "Review problem" : "Solve problem"}
                      <ExternalLink size={13} />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>

          {pageCount > 1 && (
            <nav
              aria-label="Lesson practice problem pages"
              className="mt-4 flex items-center justify-between gap-3"
            >
              <p className="text-xs text-slate-500">
                Page {currentPage} of {pageCount}
              </p>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setPage(currentPage - 1)}
                  className={buttonClass}
                >
                  Previous
                </button>

                <button
                  type="button"
                  disabled={currentPage === pageCount}
                  onClick={() => setPage(currentPage + 1)}
                  className={buttonClass}
                >
                  Next
                </button>
              </div>
            </nav>
          )}

          <p className="mt-4 text-xs leading-6 text-slate-500">
            Problems open in a new tab so your lesson workspace
            stays open. After your submission receives an Accepted
            verdict, return here and click Refresh. Only accepted
            practice submissions count; contest submissions do not.
          </p>
        </>
      )}
    </section>
  );
}