import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Link2,
  Plus,
  RefreshCw,
  Search,
  Unlink,
} from "lucide-react";
import api from "../api/axios";

const PAGE_SIZE = 5;

const button =
  "inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40";

const neutral =
  `${button} border-white/10 bg-white/5 text-slate-300 hover:bg-white/10`;

const primary =
  `${button} border-cyan-400/20 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/20`;

const danger =
  `${button} border-rose-400/20 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20`;

function errorMessage(error) {
  return (
    error.response?.data?.error ||
    error.message ||
    "Unable to update practice problems."
  );
}

function Difficulty({ value }) {
  const difficulty = String(value || "").toLowerCase();

  const colors = {
    easy: "bg-emerald-400/10 text-emerald-200",
    medium: "bg-amber-400/10 text-amber-200",
    hard: "bg-rose-400/10 text-rose-200",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs capitalize ${
        colors[difficulty] || "bg-white/5 text-slate-400"
      }`}
    >
      {value || "Unspecified"}
    </span>
  );
}

function Pagination({
  page,
  total,
  onChange,
  disabled,
  label,
}) {
  if (total === 0) return null;

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <nav
      aria-label={label}
      className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4"
    >
      <p className="text-xs text-slate-500">
        {from}–{to} of {total} · Page {page} of {pageCount}
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled || page <= 1}
          onClick={() => onChange(page - 1)}
          className={neutral}
        >
          Previous
        </button>

        <button
          type="button"
          disabled={disabled || page >= pageCount}
          onClick={() => onChange(page + 1)}
          className={neutral}
        >
          Next
        </button>
      </div>
    </nav>
  );
}

export default function LessonPracticeManager({
  topicId,
  disabled = false,
  onBusyChange,
}) {
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(true);
  const [searchError, setSearchError] = useState("");

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");

  const [reload, setReload] = useState(0);
  const [searchReload, setSearchReload] = useState(0);

  const [searchPage, setSearchPage] = useState(1);
  const [attachedPage, setAttachedPage] = useState(1);

  const actionLock = useRef(false);
  const mounted = useRef(false);

  const searchPageCount = Math.max(
    1,
    Math.ceil(results.length / PAGE_SIZE),
  );

  const attachedPageCount = Math.max(
    1,
    Math.ceil(problems.length / PAGE_SIZE),
  );

  const currentSearchPage = Math.max(
    1,
    Math.min(searchPage, searchPageCount),
  );

  const currentAttachedPage = Math.max(
    1,
    Math.min(attachedPage, attachedPageCount),
  );

  const searchOffset = (currentSearchPage - 1) * PAGE_SIZE;
  const attachedOffset = (currentAttachedPage - 1) * PAGE_SIZE;

  const visibleResults = results.slice(
    searchOffset,
    searchOffset + PAGE_SIZE,
  );

  const visibleProblems = problems.slice(
    attachedOffset,
    attachedOffset + PAGE_SIZE,
  );

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAttachments() {
      setLoading(true);
      setListError("");
      setProblems([]);

      try {
        const response = await api.get(
          `/admin/learning/topics/${topicId}/practice-problems`,
          { signal: controller.signal },
        );

        if (!Array.isArray(response.data?.problems)) {
          throw new Error("Unexpected practice-list response.");
        }

        if (!controller.signal.aborted) {
          const nextProblems = response.data.problems;

          setProblems(nextProblems);
          setAttachedPage((page) =>
            Math.max(
              1,
              Math.min(
                page,
                Math.ceil(nextProblems.length / PAGE_SIZE) || 1,
              ),
            ),
          );
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setListError(errorMessage(error));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadAttachments();

    return () => controller.abort();
  }, [topicId, reload]);

  useEffect(() => {
    const controller = new AbortController();

    setSearching(true);
    setSearchError("");
    setResults([]);
    setSearchPage(1);

    const timer = window.setTimeout(async () => {
      try {
        const response = await api.get(
          "/admin/learning/practice-problems/search",
          {
            params: {
              q: query.trim(),
              topic_id: topicId,
            },
            signal: controller.signal,
          },
        );

        if (!Array.isArray(response.data?.problems)) {
          throw new Error("Unexpected problem-search response.");
        }

        if (!controller.signal.aborted) {
          setResults(response.data.problems);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setSearchError(errorMessage(error));
        }
      } finally {
        if (!controller.signal.aborted) {
          setSearching(false);
        }
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [topicId, query, searchReload]);

  const blocked =
    disabled || busy || loading || Boolean(listError);

  const attachedIds = new Set(
    problems.map((problem) => Number(problem.id)),
  );

  async function mutate(request, preferredAttachedPage = null) {
    if (actionLock.current || blocked) return;

    actionLock.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setActionError("");
    setSuccess("");

    try {
      const response = await request();

      if (!Array.isArray(response.data?.problems)) {
        throw new Error(
          "The request finished, but the returned practice list was invalid. Refresh the list.",
        );
      }

      if (mounted.current) {
        const nextProblems = response.data.problems;
        const nextPageCount = Math.max(
          1,
          Math.ceil(nextProblems.length / PAGE_SIZE),
        );

        setProblems(nextProblems);

        setAttachedPage((page) =>
          Math.max(
            1,
            Math.min(
              preferredAttachedPage ?? page,
              nextPageCount,
            ),
          ),
        );

        setSuccess(
          response.data.message || "Practice list updated.",
        );
      }
    } catch (error) {
      if (mounted.current) {
        setActionError(errorMessage(error));
      }
    } finally {
      actionLock.current = false;

      if (mounted.current) {
        setBusy(false);
        onBusyChange?.(false);
      }
    }
  }

  function attach(problem) {
    const destinationPage = Math.ceil(
      (problems.length + 1) / PAGE_SIZE,
    );

    void mutate(
      () =>
        api.post(
          `/admin/learning/topics/${topicId}/practice-problems`,
          { problem_id: Number(problem.id) },
        ),
      destinationPage,
    );
  }

  function detach(problem) {
    if (blocked || actionLock.current) return;

    if (
      !window.confirm(
        `Remove "${problem.title}" from this lesson?\n\nThe problem and its submissions will not be deleted.`,
      )
    ) {
      return;
    }

    void mutate(() =>
      api.delete(
        `/admin/learning/topics/${topicId}/practice-problems/${problem.id}`,
      ),
    );
  }

  function move(index, direction) {
    const destination = index + direction;

    if (
      blocked ||
      destination < 0 ||
      destination >= problems.length
    ) {
      return;
    }

    const ordered = [...problems];

    [ordered[index], ordered[destination]] = [
      ordered[destination],
      ordered[index],
    ];

    const destinationPage =
      Math.floor(destination / PAGE_SIZE) + 1;

    void mutate(
      () =>
        api.put(
          `/admin/learning/topics/${topicId}/practice-problem-order`,
          {
            problem_ids: ordered.map((problem) =>
              Number(problem.id),
            ),
          },
        ),
      destinationPage,
    );
  }

  function refreshLists() {
    if (disabled || actionLock.current || loading) return;

    setReload((value) => value + 1);
    setSearchReload((value) => value + 1);
    setActionError("");
    setSuccess("");
  }

  return (
    <section className="border-t border-white/10 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
            <Link2 size={19} className="text-cyan-300" />
            Practice problems
          </h3>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Attach existing public problems to this lesson.
            Students will solve them through the existing
            problem pages.
          </p>

          <p className="mt-2 text-xs leading-6 text-amber-200/80">
            Attachment changes save immediately, separately from
            lesson content. Closing the editor does not undo them.
          </p>
        </div>

        <button
          type="button"
          disabled={disabled || busy || loading}
          onClick={refreshLists}
          className={neutral}
        >
          <RefreshCw
            size={14}
            className={loading || busy ? "animate-spin" : ""}
          />
          Refresh
        </button>
      </div>

      {actionError && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-200"
        >
          {actionError}
        </p>
      )}

      {success && (
        <p
          role="status"
          className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-200"
        >
          {success}
        </p>
      )}

      <div className="mt-6 grid min-w-0 items-start gap-5 xl:grid-cols-2">
        <div className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/30 p-4">
          <h4 className="font-semibold text-slate-200">
            Find problems
          </h4>

          <label
            htmlFor={`practice-search-${topicId}`}
            className="sr-only"
          >
            Search public problems by title or ID
          </label>

          <div className="relative mt-4">
            <Search
              size={16}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            />

            <input
              id={`practice-search-${topicId}`}
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchPage(1);
              }}
              maxLength={100}
              disabled={disabled || busy}
              placeholder="Search by title or exact problem ID..."
              className="w-full rounded-xl border border-white/10 bg-slate-950/70 py-3 pl-10 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-400/50"
            />
          </div>

          <p className="mt-2 text-xs leading-6 text-slate-500">
            Five results per page, from up to 50 public matches.
            Refine your search to find other problems.
          </p>

          <div className="mt-3 space-y-2">
            {searching ? (
              <p
                role="status"
                className="py-6 text-sm text-slate-500"
              >
                Searching problems...
              </p>
            ) : searchError ? (
              <div>
                <p role="alert" className="text-sm text-rose-300">
                  {searchError}
                </p>

                <button
                  type="button"
                  disabled={disabled || busy}
                  onClick={() =>
                    setSearchReload((value) => value + 1)
                  }
                  className={`${neutral} mt-3`}
                >
                  Retry search
                </button>
              </div>
            ) : results.length === 0 ? (
              <p className="py-6 text-sm text-slate-500">
                No public problems match this search.
              </p>
            ) : (
              visibleResults.map((problem) => {
                const attached = attachedIds.has(
                  Number(problem.id),
                );

                return (
                  <div
                    key={problem.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.025] p-3"
                  >
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium text-slate-200">
                        <span className="mr-2 font-mono text-xs text-slate-500">
                          #{problem.id}
                        </span>
                        {problem.title}
                      </p>

                      <div className="mt-2">
                        <Difficulty value={problem.difficulty} />
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={
                        blocked ||
                        attached ||
                        problems.length >= 100
                      }
                      onClick={() => attach(problem)}
                      className={`${primary} shrink-0`}
                    >
                      {!attached && <Plus size={13} />}
                      {attached ? "Attached" : "Attach"}
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {!searching && !searchError && (
            <Pagination
              label="Problem search pages"
              page={currentSearchPage}
              total={results.length}
              onChange={setSearchPage}
              disabled={disabled || busy}
            />
          )}
        </div>

        <div className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/30 p-4">
          <h4 className="font-semibold text-slate-200">
            Attached to this lesson
            <span className="ml-2 text-xs font-normal text-slate-500">
              {loading ? "Loading..." : `${problems.length} / 100`}
            </span>
          </h4>

          <p className="mt-2 text-xs leading-6 text-slate-500">
            Use the arrows to change the student practice order.
            Changes apply across all pages.
          </p>

          <div className="mt-3 space-y-2">
            {loading ? (
              <p
                role="status"
                className="py-6 text-sm text-slate-500"
              >
                Loading attached problems...
              </p>
            ) : listError ? (
              <div>
                <p role="alert" className="text-sm text-rose-300">
                  {listError}
                </p>

                <button
                  type="button"
                  disabled={disabled || busy}
                  onClick={() =>
                    setReload((value) => value + 1)
                  }
                  className={`${neutral} mt-3`}
                >
                  Retry loading
                </button>
              </div>
            ) : problems.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-500">
                No practice problems attached yet.
              </p>
            ) : (
              visibleProblems.map((problem, localIndex) => {
                const index = attachedOffset + localIndex;

                return (
                  <div
                    key={problem.id}
                    className="rounded-xl border border-white/10 bg-white/[0.025] p-3"
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-1 font-mono text-xs text-cyan-300">
                        {index + 1}.
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium text-slate-200">
                          {problem.title}
                        </p>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-slate-500">
                            #{problem.id}
                          </span>

                          <Difficulty value={problem.difficulty} />
                        </div>

                        {!Number(problem.is_public) && (
                          <p className="mt-2 text-xs leading-5 text-amber-300">
                            Unpublished — hidden from student
                            practice lists.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={blocked || index === 0}
                        aria-label={`Move ${problem.title} up`}
                        onClick={() => move(index, -1)}
                        className={neutral}
                      >
                        <ArrowUp size={14} />
                      </button>

                      <button
                        type="button"
                        disabled={
                          blocked ||
                          index === problems.length - 1
                        }
                        aria-label={`Move ${problem.title} down`}
                        onClick={() => move(index, 1)}
                        className={neutral}
                      >
                        <ArrowDown size={14} />
                      </button>

                      <button
                        type="button"
                        disabled={blocked}
                        onClick={() => detach(problem)}
                        className={danger}
                      >
                        <Unlink size={13} />
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {!loading && !listError && (
            <Pagination
              label="Attached problem pages"
              page={currentAttachedPage}
              total={problems.length}
              onChange={setAttachedPage}
              disabled={disabled || busy}
            />
          )}
        </div>
      </div>
    </section>
  );
}