import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";

function Problems() {
  const [problems, setProblems] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");

  useEffect(() => {
    const fetchProblemsAndSubjects = async () => {
      try {
        setLoading(true);
        setError("");

        const [problemsRes, subjectsRes] = await Promise.all([
          api.get("/problems"),
          api.get("/problems/meta/subjects"),
        ]);

        setProblems(problemsRes.data);
        setSubjects(subjectsRes.data);
      } catch (err) {
        setError(err.response?.data?.error || "Failed to load problems");
      } finally {
        setLoading(false);
      }
    };

    fetchProblemsAndSubjects();
  }, []);

  const filteredProblems = useMemo(() => {
    return problems.filter((problem) => {
      const title = (problem.title || "").toLowerCase();
      const difficulty = (problem.difficulty || "").toLowerCase();
      const subject = (problem.subject_name || "").toLowerCase();
      const query = search.toLowerCase().trim();

      const matchesSearch =
        !query ||
        title.includes(query) ||
        difficulty.includes(query) ||
        subject.includes(query);

      const matchesDifficulty =
        difficultyFilter === "all" || difficulty === difficultyFilter;

      const matchesSubject =
        subjectFilter === "all" || subject === subjectFilter.toLowerCase();

      return matchesSearch && matchesDifficulty && matchesSubject;
    });
  }, [problems, search, difficultyFilter, subjectFilter]);

  const totalProblems = problems.length;

  const easyCount = problems.filter(
    (problem) => (problem.difficulty || "").toLowerCase() === "easy",
  ).length;

  const mediumCount = problems.filter(
    (problem) => (problem.difficulty || "").toLowerCase() === "medium",
  ).length;

  const hardCount = problems.filter(
    (problem) => (problem.difficulty || "").toLowerCase() === "hard",
  ).length;

  const getDifficultyClass = (difficulty) => {
    const value = (difficulty || "").toLowerCase();

    if (value === "easy") {
      return "inline-flex items-center rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-200";
    }

    if (value === "medium") {
      return "inline-flex items-center rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-xs font-semibold text-amber-200";
    }

    if (value === "hard") {
      return "inline-flex items-center rounded-full border border-rose-400/20 bg-rose-400/10 px-2.5 py-1 text-xs font-semibold text-rose-200";
    }

    return "inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-300";
  };

  return (
    <div className="flex h-[calc(100dvh-180px)] min-h-0 flex-col gap-6 overflow-hidden">
      {/* Fixed summary cards */}
      <section className="shrink-0 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-white/10 bg-slate-900/50 p-5 shadow-2xl backdrop-blur-xl">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Total Problems
          </p>
          <h3 className="mt-3 text-3xl font-bold text-white">
            {totalProblems}
          </h3>
          <p className="mt-2 text-sm text-slate-400">
            All available coding challenges
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-900/50 p-5 shadow-2xl backdrop-blur-xl">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Easy
          </p>
          <h3 className="mt-3 text-3xl font-bold text-emerald-300">
            {easyCount}
          </h3>
          <p className="mt-2 text-sm text-slate-400">
            Warm-up and beginner-friendly
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-900/50 p-5 shadow-2xl backdrop-blur-xl">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Medium
          </p>
          <h3 className="mt-3 text-3xl font-bold text-amber-300">
            {mediumCount}
          </h3>
          <p className="mt-2 text-sm text-slate-400">
            Core problem-solving practice
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-900/50 p-5 shadow-2xl backdrop-blur-xl">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Hard
          </p>
          <h3 className="mt-3 text-3xl font-bold text-rose-300">{hardCount}</h3>
          <p className="mt-2 text-sm text-slate-400">Advanced challenge mode</p>
        </div>
      </section>

      {/* Remaining viewport area */}
      <section className="grid min-h-0 flex-1 gap-6 overflow-hidden xl:grid-cols-4">
        {/* RED MARKED AREA: fixed controls, scrollable table only */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-900/50 p-5 shadow-2xl backdrop-blur-xl sm:p-6 xl:col-span-3">
          {/* Fixed archive heading and search */}
          <div className="mb-5 shrink-0 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white sm:text-2xl">
                Problem Archive
              </h2>
              <p className="mt-2 text-sm leading-7 text-slate-400">
                Search, filter, and enter any challenge from the archive.
              </p>
            </div>

            <input
              type="text"
              className="w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-indigo-400/60 focus:ring-4 focus:ring-indigo-500/15 lg:max-w-sm"
              placeholder="Search by title, subject, or difficulty..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          {/* Fixed filter row */}
          <div className="mb-4 shrink-0 flex flex-wrap items-center gap-3">
            <select
              value={difficultyFilter}
              onChange={(event) => setDifficultyFilter(event.target.value)}
              className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-indigo-400/60"
            >
              <option value="all">All Difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>

            <select
              value={subjectFilter}
              onChange={(event) => setSubjectFilter(event.target.value)}
              className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-indigo-400/60"
            >
              <option value="all">All Subjects</option>

              {subjects.map((subject) => (
                <option key={subject.id} value={subject.name}>
                  {subject.name}
                </option>
              ))}
            </select>

            <p className="ml-auto text-xs text-slate-500">
              Showing {filteredProblems.length} of {totalProblems}
            </p>
          </div>

          {loading && (
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm text-cyan-200">
              Loading problems...
            </div>
          )}

          {error && !loading && (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-4 text-sm text-rose-200">
              {error}
            </div>
          )}

          {!loading && !error && filteredProblems.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-sm text-slate-300">
              No problems matched your current search and filters.
            </div>
          )}

          {/* Only this table container scrolls vertically */}
          {!loading && !error && filteredProblems.length > 0 && (
            <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-white/10 bg-white/[0.02]">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-white/10 bg-slate-900/95 text-xs uppercase tracking-wide text-slate-400 backdrop-blur-xl">
                  <tr>
                    <th className="px-4 py-3 font-medium">#</th>
                    <th className="px-4 py-3 font-medium">Title</th>
                    <th className="px-4 py-3 font-medium">Difficulty</th>
                    <th className="px-4 py-3 font-medium">Subject</th>
                    <th className="px-4 py-3 text-right font-medium">Action</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-white/10">
                  {filteredProblems.map((problem) => (
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
        </div>

        {/* Right side panel */}
        <div className="min-h-0 space-y-6 overflow-y-auto pr-1 xl:col-span-1">
          <div className="rounded-3xl border border-white/10 bg-slate-900/50 p-5 shadow-2xl backdrop-blur-xl">
            <h3 className="text-lg font-semibold text-white">Filter Summary</h3>

            <div className="mt-5 space-y-4">
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <span className="text-sm text-slate-400">Visible</span>
                <strong className="text-base text-white">
                  {filteredProblems.length}
                </strong>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <span className="text-sm text-slate-400">Difficulty</span>
                <strong className="text-sm capitalize text-white">
                  {difficultyFilter}
                </strong>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <span className="text-sm text-slate-400">Subject</span>
                <strong className="max-w-[140px] truncate text-right text-sm text-white">
                  {subjectFilter === "all" ? "All" : subjectFilter}
                </strong>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-900/50 p-5 shadow-2xl backdrop-blur-xl">
            <h3 className="text-lg font-semibold text-white">
              Difficulty Guide
            </h3>

            <ul className="mt-5 space-y-4 text-sm leading-7 text-slate-300">
              <li>
                <strong className="text-emerald-300">Easy:</strong> basic
                implementation and warm-up level.
              </li>

              <li>
                <strong className="text-amber-300">Medium:</strong> stronger
                logic, patterns, and careful handling.
              </li>

              <li>
                <strong className="text-rose-300">Hard:</strong> advanced
                reasoning and tighter constraints.
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Problems;
