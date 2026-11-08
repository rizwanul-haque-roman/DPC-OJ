import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";

const INPUT_CLASS =
  "rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-cyan-400/60";

const BUTTON_CLASS =
  "rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40";

function getDifficultyClass(difficulty) {
  const value = String(difficulty || "").trim().toLowerCase();

  const colors = {
    easy: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
    medium: "border-amber-400/20 bg-amber-400/10 text-amber-200",
    hard: "border-rose-400/20 bg-rose-400/10 text-rose-200",
  };

  return [
    "inline-flex items-center rounded-full border",
    "px-2.5 py-1 text-xs font-semibold",
    colors[value] || "border-white/10 bg-white/5 text-slate-300",
  ].join(" ");
}

function Problems() {
  const archiveRef = useRef(null);

  const [result, setResult] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [subjectError, setSubjectError] = useState("");

  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [subjectRetry, setSubjectRetry] = useState(0);
  const [authRevision, setAuthRevision] = useState(0);

  const [query, setQuery] = useState({
    page: 1,
    pageSize: 10,
    difficulty: "all",
    subjectId: "all",
    q: "",
  });

  // Request search results after typing pauses.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextSearch = search.trim();

      setQuery((previous) =>
        previous.q === nextSearch
          ? previous
          : {
              ...previous,
              q: nextSearch,
              page: 1,
            },
      );
    }, 350);

    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const updateAuth = () => {
      setResult(null);
      setAuthRevision((value) => value + 1);
    };

    window.addEventListener("authChanged", updateAuth);
    window.addEventListener("storage", updateAuth);

    return () => {
      window.removeEventListener("authChanged", updateAuth);
      window.removeEventListener("storage", updateAuth);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSubjects() {
      setSubjectError("");

      try {
        const response = await api.get("/problems/meta/subjects", {
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        if (!Array.isArray(response.data)) {
          throw new Error("Unexpected subject response.");
        }

        setSubjects(response.data);
      } catch (err) {
        if (controller.signal.aborted) return;

        setSubjectError(
          err.response?.data?.error ||
            err.message ||
            "Unable to load subjects.",
        );
      }
    }

    loadSubjects();

    return () => controller.abort();
  }, [subjectRetry]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadProblems() {
      setLoading(true);
      setError("");

      try {
        const response = await api.get("/problems", {
          signal: controller.signal,
          params: {
            paginated: 1,
            page: query.page,
            page_size: query.pageSize,
            difficulty: query.difficulty,
            ...(query.subjectId !== "all"
              ? { subject_id: query.subjectId }
              : {}),
            ...(query.q ? { q: query.q } : {}),
          },
        });

        if (controller.signal.aborted) return;

        if (
          !Array.isArray(response.data?.items) ||
          !response.data?.pagination ||
          !response.data?.summary
        ) {
          throw new Error(
            "Unexpected problem response. Check that the backend pagination update is installed.",
          );
        }

        setResult(response.data);
      } catch (err) {
        if (controller.signal.aborted) return;

        setError(
          err.response?.data?.error ||
            err.message ||
            "Failed to load problems.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadProblems();

    return () => controller.abort();
  }, [query, refreshKey, authRevision]);

  function changeFilter(field, value) {
    setQuery((previous) => ({
      ...previous,
      [field]: value,
      page: 1,
    }));
  }

  function changePage(page) {
    setQuery((previous) => ({
      ...previous,
      page,
    }));

    requestAnimationFrame(() => {
      archiveRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function clearFilters() {
    setSearch("");
    setQuery((previous) => ({
      ...previous,
      page: 1,
      difficulty: "all",
      subjectId: "all",
      q: "",
    }));
  }

  const problems = result?.items || [];
  const pagination = result?.pagination;
  const summary = result?.summary;

  const selectedSubject =
    subjects.find(
      (subject) => String(subject.id) === query.subjectId,
    )?.name || "All";

  const searchPending = search.trim() !== query.q;
  const resultsPending = loading || searchPending;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {/* Archive totals, independent of active filters */}
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4">
        {[
          {
            label: "Total Problems",
            difficulty: "all",
            value: summary?.total,
            color: "text-white",
            description: "All available coding challenges",
          },
          {
            label: "Easy",
            difficulty: "easy",
            value: summary?.easy,
            color: "text-emerald-300",
            description: "Warm-up and beginner-friendly",
          },
          {
            label: "Medium",
            difficulty: "medium",
            value: summary?.medium,
            color: "text-amber-300",
            description: "Core problem-solving practice",
          },
          {
            label: "Hard",
            difficulty: "hard",
            value: summary?.hard,
            color: "text-rose-300",
            description: "Advanced challenge mode",
          },
        ].map((stat) => (
          <button
            key={stat.label}
            type="button"
            onClick={() => changeFilter("difficulty", stat.difficulty)}
            aria-pressed={query.difficulty === stat.difficulty}
            aria-label={`Show ${stat.difficulty === "all" ? "all" : stat.label.toLowerCase()} problems`}
            className={`cursor-pointer rounded-2xl border p-4 text-left shadow-lg backdrop-blur-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:rounded-3xl sm:p-5 ${
              query.difficulty === stat.difficulty
                ? "border-cyan-400/60 bg-cyan-400/10 ring-1 ring-cyan-400/30"
                : "border-white/10 bg-slate-900/50 hover:border-white/25 hover:bg-slate-800/60"
            }`}
          >
            <span className="block text-xs font-medium uppercase tracking-wide text-slate-400">
              {stat.label}
            </span>

            <span className={`mt-3 block text-3xl font-bold ${stat.color}`}>
              {stat.value ?? "—"}
            </span>

            <span className="mt-2 hidden text-sm text-slate-400 sm:block">
              {stat.description}
            </span>
          </button>
        ))}
      </section>

      <section className="grid min-w-0 items-start gap-6 xl:grid-cols-4">
        <div
          ref={archiveRef}
          className="min-w-0 scroll-mt-4 rounded-3xl border border-white/10 bg-slate-900/50 p-4 shadow-2xl backdrop-blur-xl sm:p-6 xl:col-span-3"
        >
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white sm:text-2xl">
                Problem Archive
              </h2>

              <p className="mt-2 text-sm leading-7 text-slate-400">
                Search, filter, and enter any challenge from the archive.
              </p>
            </div>

            <input
              type="search"
              aria-label="Search problems"
              maxLength={100}
              className="w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:ring-4 focus:ring-cyan-500/10 lg:max-w-sm"
              placeholder="Search title, subject, difficulty, or ID..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <select
              aria-label="Filter by difficulty"
              value={query.difficulty}
              onChange={(event) =>
                changeFilter("difficulty", event.target.value)
              }
              className={INPUT_CLASS}
            >
              <option value="all">All Difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>

            <select
              aria-label="Filter by subject"
              value={query.subjectId}
              onChange={(event) =>
                changeFilter("subjectId", event.target.value)
              }
              className={`${INPUT_CLASS} max-w-full sm:max-w-[280px]`}
            >
              <option value="all">All Subjects</option>

              {subjects.map((subject) => (
                <option key={subject.id} value={String(subject.id)}>
                  {subject.name}
                </option>
              ))}
            </select>

            <label className="flex items-center gap-2 text-xs text-slate-400">
              Rows
              <select
                value={query.pageSize}
                onChange={(event) =>
                  changeFilter("pageSize", Number(event.target.value))
                }
                className={INPUT_CLASS}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </label>

            <button
              type="button"
              className={BUTTON_CLASS}
              onClick={clearFilters}
            >
              Reset
            </button>
          </div>

          {subjectError && (
            <div
              role="status"
              className="mb-4 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-200"
            >
              {subjectError}
              <button
                type="button"
                className="ml-2 underline"
                onClick={() => setSubjectRetry((value) => value + 1)}
              >
                Retry subjects
              </button>
            </div>
          )}

          <p
            role="status"
            className="mb-4 text-xs text-slate-400"
          >
            {resultsPending
              ? "Loading matching problems..."
              : error
                ? "Unable to load results."
                : pagination
                  ? `Showing ${pagination.from}–${pagination.to} of ${pagination.total} matching problems`
                  : "Loading problems..."}
          </p>

          {resultsPending ? (
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-5 text-sm text-cyan-200">
              Loading problems...
            </div>
          ) : error ? (
            <div
              role="alert"
              className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-4 text-sm text-rose-200"
            >
              <p>{error}</p>

              <button
                type="button"
                className={`mt-3 ${BUTTON_CLASS}`}
                onClick={() => setRefreshKey((value) => value + 1)}
              >
                Retry
              </button>
            </div>
          ) : problems.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-6 text-sm text-slate-300">
              No problems matched your current search and filters.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02]">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-white/10 bg-slate-900 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">
                      #
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Title
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Difficulty
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Subject
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-right font-medium"
                    >
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-white/10">
                  {problems.map((problem) => (
                    <tr
                      key={problem.id}
                      className="transition hover:bg-white/[0.03]"
                    >
                      <td className="px-4 py-3 font-mono text-slate-400">
                        {problem.id}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to={`/problems/${problem.id}`}
                            className="font-semibold text-white transition hover:text-cyan-300"
                          >
                            {problem.title}
                          </Link>

                          {Number(problem.is_solved) === 1 && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                              <span aria-hidden="true">✓</span>
                              Solved
                            </span>
                          )}
                        </div>

                        <p className="mt-1 text-xs text-slate-500">
                          Problem #{problem.id}
                        </p>
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={getDifficultyClass(problem.difficulty)}
                        >
                          {problem.difficulty || "Unknown"}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-slate-300">
                        {problem.subject_name || "General"}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/problems/${problem.id}`}
                          aria-label={`Solve ${problem.title}`}
                          className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
                        >
                          Solve
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pagination && !error && (
            <nav
              aria-label="Problem archive pagination"
              className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4"
            >
              <span className="text-xs text-slate-400">
                Page {pagination.page} of {pagination.total_pages}
              </span>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={BUTTON_CLASS}
                  disabled={resultsPending || pagination.page <= 1}
                  onClick={() => changePage(1)}
                >
                  First
                </button>

                <button
                  type="button"
                  className={BUTTON_CLASS}
                  disabled={resultsPending || pagination.page <= 1}
                  onClick={() => changePage(pagination.page - 1)}
                >
                  Previous
                </button>

                <button
                  type="button"
                  className={BUTTON_CLASS}
                  disabled={
                    resultsPending ||
                    pagination.page >= pagination.total_pages
                  }
                  onClick={() => changePage(pagination.page + 1)}
                >
                  Next
                </button>

                <button
                  type="button"
                  className={BUTTON_CLASS}
                  disabled={
                    resultsPending ||
                    pagination.page >= pagination.total_pages
                  }
                  onClick={() => changePage(pagination.total_pages)}
                >
                  Last
                </button>
              </div>
            </nav>
          )}
        </div>

        <aside className="min-w-0 space-y-6 xl:col-span-1">
          <div className="rounded-3xl border border-white/10 bg-slate-900/50 p-5 shadow-2xl backdrop-blur-xl">
            <h3 className="text-lg font-semibold text-white">
              Filter Summary
            </h3>

            <div className="mt-5 space-y-4">
              {[
                [
                  "Matching",
                  resultsPending || error
                    ? "—"
                    : (pagination?.total ?? 0),
                ],
                [
                  "Difficulty",
                  query.difficulty === "all" ? "All" : query.difficulty,
                ],
                ["Subject", selectedSubject],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
                >
                  <span className="text-sm text-slate-400">
                    {label}
                  </span>
                  <strong className="max-w-[180px] truncate text-right text-sm capitalize text-white">
                    {value}
                  </strong>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-900/50 p-5 shadow-2xl backdrop-blur-xl">
            <h3 className="text-lg font-semibold text-white">
              Difficulty Guide
            </h3>

            <ul className="mt-5 space-y-4 text-sm leading-7 text-slate-300">
              <li>
                <strong className="text-emerald-300">Easy:</strong>{" "}
                basic implementation and warm-up level.
              </li>
              <li>
                <strong className="text-amber-300">Medium:</strong>{" "}
                stronger logic, patterns, and careful handling.
              </li>
              <li>
                <strong className="text-rose-300">Hard:</strong>{" "}
                advanced reasoning and tighter constraints.
              </li>
            </ul>
          </div>
        </aside>
      </section>
    </div>
  );
}

export default Problems;