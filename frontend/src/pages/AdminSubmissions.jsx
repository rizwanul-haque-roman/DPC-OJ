import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";

const PAGE_SIZE = 10;

function verdictClass(verdict) {
  if (verdict === "Accepted") {
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
  }

  if (verdict === "Pending") {
    return "border-amber-400/20 bg-amber-400/10 text-amber-200";
  }

  return "border-rose-400/20 bg-rose-400/10 text-rose-300";
}

function AdminSubmissions() {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [verdictFilter, setVerdictFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);

  const loadSubmissions = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get("/admin/submissions");

      setSubmissions(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      setError(
        err.response?.data?.error ||
          "Unable to load submissions. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubmissions();
  }, []);

  const verdicts = useMemo(() => {
    const values = submissions.map(
      (submission) => submission.verdict || "Pending",
    );

    return [...new Set(values)].sort();
  }, [submissions]);

  const filteredSubmissions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return submissions.filter((submission) => {
      const matchesVerdict =
        verdictFilter === "all" ||
        (submission.verdict || "Pending") === verdictFilter;

      if (!matchesVerdict) return false;

      if (!normalizedSearch) return true;

      const searchableText = [
        submission.id,
        submission.user_name,
        submission.user_email,
        submission.problem_title,
        submission.language,
        submission.verdict || "Pending",
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedSearch);
    });
  }, [submissions, search, verdictFilter]);

  const totalResults = filteredSubmissions.length;

  const totalPages = Math.max(1, Math.ceil(totalResults / PAGE_SIZE));

  // Keep the displayed page valid if refreshing reduces the results.
  const activePage = Math.min(currentPage, totalPages);
  const startIndex = (activePage - 1) * PAGE_SIZE;

  const paginatedSubmissions = filteredSubmissions.slice(
    startIndex,
    startIndex + PAGE_SIZE,
  );

  const firstResult = totalResults === 0 ? 0 : startIndex + 1;
  const lastResult = Math.min(startIndex + PAGE_SIZE, totalResults);

  // Display at most five numbered page buttons.
  const firstPageButton = Math.max(1, Math.min(activePage - 2, totalPages - 4));

  const pageNumbers = Array.from(
    { length: Math.min(5, totalPages) },
    (_, index) => firstPageButton + index,
  );

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const handleSearchChange = (event) => {
    setSearch(event.target.value);
    setCurrentPage(1);
  };

  const handleVerdictChange = (event) => {
    setVerdictFilter(event.target.value);
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setSearch("");
    setVerdictFilter("all");
    setCurrentPage(1);
  };

  const paginationButtonClass =
    "rounded-xl border border-white/10 bg-white/[0.05] " +
    "px-4 py-2 text-sm font-semibold text-slate-200 transition " +
    "hover:bg-white/10 focus-visible:outline " +
    "focus-visible:outline-2 focus-visible:outline-cyan-400 " +
    "disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-slate-900/50 p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
              Administration
            </p>

            <h2 className="mt-2 text-2xl font-bold text-white">
              Submission Review
            </h2>

            <p className="mt-2 text-sm leading-7 text-slate-400">
              Review all student submissions. Opening a submission displays its
              source code through the protected admin-access route.
            </p>
          </div>

          <button
            type="button"
            onClick={loadSubmissions}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {/* Search and verdict filter */}
        <div className="mt-6 grid gap-3 md:grid-cols-[1fr_220px]">
          <input
            type="search"
            aria-label="Search submissions"
            value={search}
            onChange={handleSearchChange}
            placeholder="Search by student, email, problem, ID, or language..."
            className="w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:ring-4 focus:ring-cyan-500/10"
          />

          <select
            aria-label="Filter submissions by verdict"
            value={verdictFilter}
            onChange={handleVerdictChange}
            className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/60 focus:ring-4 focus:ring-cyan-500/10"
          >
            <option value="all">All verdicts</option>

            {verdicts.map((verdict) => (
              <option key={verdict} value={verdict}>
                {verdict}
              </option>
            ))}
          </select>
        </div>

        {/* Result count */}
        {!loading && !error && (
          <p className="mt-4 text-sm text-slate-400" aria-live="polite">
            Showing {firstResult}–{lastResult} of {totalResults} submission
            {totalResults === 1 ? "" : "s"}
            {totalResults !== submissions.length
              ? ` (filtered from ${submissions.length} total)`
              : ""}
            .
          </p>
        )}

        {/* Loading */}
        {loading && (
          <div
            role="status"
            className="mt-6 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100"
          >
            Loading submissions...
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="mt-6 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200"
          >
            {error}
          </div>
        )}

        {/* No submissions in the database */}
        {!loading && !error && submissions.length === 0 && (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-8 text-center">
            <p className="text-sm font-semibold text-slate-200">
              No submissions found.
            </p>

            <p className="mt-2 text-sm text-slate-500">
              Student submissions will appear here after code is submitted.
            </p>
          </div>
        )}

        {/* Submission table */}
        {!loading && !error && totalResults > 0 && (
          <>
            <div className="mt-6 overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full min-w-[1050px] text-sm">
                <thead className="border-b border-white/10 bg-white/[0.04]">
                  <tr>
                    <th
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400"
                    >
                      ID
                    </th>

                    <th
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400"
                    >
                      Student
                    </th>

                    <th
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400"
                    >
                      Problem
                    </th>

                    <th
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400"
                    >
                      Language
                    </th>

                    <th
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400"
                    >
                      Verdict
                    </th>

                    <th
                      scope="col"
                      className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400"
                    >
                      Time
                    </th>

                    <th
                      scope="col"
                      className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400"
                    >
                      Memory
                    </th>

                    <th
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400"
                    >
                      Submitted
                    </th>

                    <th
                      scope="col"
                      className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400"
                    >
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {paginatedSubmissions.map((submission) => (
                    <tr
                      key={submission.id}
                      className="border-b border-white/5 transition hover:bg-white/[0.03]"
                    >
                      <td className="px-4 py-4 font-mono text-slate-300">
                        #{submission.id}
                      </td>

                      <td className="px-4 py-4">
                        <p className="font-semibold text-white">
                          {submission.user_name || "Unknown user"}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          {submission.user_email || "No email"}
                        </p>
                      </td>

                      <td className="px-4 py-4 text-slate-300">
                        {submission.problem_title || "Unknown problem"}
                      </td>

                      <td className="px-4 py-4 font-mono text-xs text-slate-300">
                        {submission.language || "—"}
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${verdictClass(
                            submission.verdict || "Pending",
                          )}`}
                        >
                          {submission.verdict || "Pending"}
                        </span>
                      </td>

                      <td className="px-4 py-4 text-right text-slate-300">
                        {submission.time_used_ms ?? 0} ms
                      </td>

                      <td className="px-4 py-4 text-right text-slate-300">
                        {submission.memory_used_kb ?? 0} KB
                      </td>

                      <td className="px-4 py-4 text-xs text-slate-400">
                        {submission.submitted_at
                          ? new Date(submission.submitted_at).toLocaleString()
                          : "—"}
                      </td>

                      <td className="px-4 py-4 text-right">
                        <Link
                          to={`/submissions/${submission.id}`}
                          className="inline-flex rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/20"
                        >
                          View Code
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <nav
              aria-label="Submission pagination"
              className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <p className="text-sm text-slate-400" aria-live="polite">
                Page {activePage} of {totalPages} · {PAGE_SIZE} submissions per
                page
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage(1)}
                  disabled={activePage === 1}
                  className={paginationButtonClass}
                >
                  First
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentPage(Math.max(1, activePage - 1))}
                  disabled={activePage === 1}
                  className={paginationButtonClass}
                >
                  Previous
                </button>

                {pageNumbers.map((page) => (
                  <button
                    key={page}
                    type="button"
                    onClick={() => setCurrentPage(page)}
                    aria-label={`Go to page ${page}`}
                    aria-current={activePage === page ? "page" : undefined}
                    className={`min-w-10 rounded-xl border px-3 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                      activePage === page
                        ? "border-cyan-400/40 bg-cyan-400/15 text-cyan-200"
                        : "border-white/10 bg-white/[0.05] text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    {page}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage(Math.min(totalPages, activePage + 1))
                  }
                  disabled={activePage === totalPages}
                  className={paginationButtonClass}
                >
                  Next
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={activePage === totalPages}
                  className={paginationButtonClass}
                >
                  Last
                </button>
              </div>
            </nav>
          </>
        )}

        {/* No results after filtering */}
        {!loading && !error && submissions.length > 0 && totalResults === 0 && (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-8 text-center">
            <p className="text-sm font-semibold text-slate-200">
              No submissions match the current filters.
            </p>

            <button
              type="button"
              onClick={clearFilters}
              className="mt-3 text-sm font-semibold text-cyan-300 transition hover:text-cyan-200"
            >
              Clear filters
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

export default AdminSubmissions;
