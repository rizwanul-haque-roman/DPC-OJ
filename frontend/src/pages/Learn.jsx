import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";

const COURSE_COLUMNS =
  "xl:grid-cols-[minmax(0,1fr)_130px_100px_190px_180px]";

function CourseRow({ subject, onRetry }) {
  const hasLessons =
    !subject.isPlaceholder &&
    subject.lessonCount > 0 &&
    subject.startTopicId !== null &&
    !subject.lessonError;

  const isComplete =
    hasLessons &&
    subject.completedCount === subject.lessonCount;

  const hasProgress =
    hasLessons && subject.completedCount > 0;

  const progressPercent = subject.lessonCount
    ? Math.round(
        (subject.completedCount / subject.lessonCount) * 100,
      )
    : 0;

  const statusLabel = subject.lessonError
    ? "Unavailable"
    : !hasLessons
      ? "Coming soon"
      : isComplete
        ? "Completed"
        : "Ready";

  const actionLabel = isComplete
    ? "Review Lessons"
    : hasProgress
      ? "Continue Learning"
      : "Start Learning";

  const courseUrl = hasLessons
    ? `/learn/topic/${subject.startTopicId}?subject=${encodeURIComponent(
        subject.id,
      )}`
    : null;

  return (
    <article
      className={[
        "grid grid-cols-2 items-center gap-x-5 gap-y-4",
        "rounded-2xl border border-white/10 bg-slate-900/60",
        "px-5 py-4 transition",
        hasLessons
          ? "hover:border-cyan-400/30 hover:bg-slate-900/80"
          : "",
        COURSE_COLUMNS,
      ].join(" ")}
    >
      {/* Course title and description */}
      <div className="col-span-2 min-w-0 xl:col-span-1">
        <h4 className="break-words text-base font-semibold text-white">
          {courseUrl ? (
            <Link
              to={courseUrl}
              className="transition hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300"
            >
              {subject.name}
            </Link>
          ) : (
            subject.name
          )}
        </h4>

        {subject.description && (
          <p
            className="mt-1 truncate text-xs leading-5 text-slate-400"
            title={subject.description}
          >
            {subject.description}
          </p>
        )}

        {subject.lessonError && (
          <p
            role="alert"
            className="mt-2 text-xs leading-5 text-rose-300"
          >
            {subject.lessonError}
          </p>
        )}
      </div>

      {/* Availability */}
      <div className="min-w-0">
        <span className="mb-1.5 block text-xs text-slate-500 xl:hidden">
          Status
        </span>

        <span
          className={[
            "inline-flex items-center gap-1 rounded-full",
            "border px-2.5 py-1 text-xs font-medium",
            subject.lessonError
              ? "border-rose-400/20 bg-rose-400/10 text-rose-200"
              : !hasLessons
                ? "border-amber-400/20 bg-amber-400/10 text-amber-200"
                : "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
          ].join(" ")}
        >
          {isComplete && <span aria-hidden="true">✓</span>}
          {statusLabel}
        </span>
      </div>

      {/* Language */}
      <div className="min-w-0">
        <span className="mb-1.5 block text-xs text-slate-500 xl:hidden">
          Language
        </span>

        <span className="inline-flex max-w-full items-center rounded-full border border-indigo-400/20 bg-indigo-400/10 px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-indigo-200">
          {subject.language || "general"}
        </span>
      </div>

      {/* Progress */}
      <div className="col-span-2 min-w-0 sm:col-span-1 xl:col-span-1">
        <span className="mb-1.5 block text-xs text-slate-500 xl:hidden">
          Progress
        </span>

        {hasLessons ? (
          <div>
            <div className="mb-2 flex items-center justify-between gap-3 text-xs text-slate-400">
              <span>
                {subject.completedCount}/{subject.lessonCount} lessons
              </span>
              <span>{progressPercent}%</span>
            </div>

            <div
              role="progressbar"
              aria-label={`${subject.name} completion`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent}
              aria-valuetext={`${subject.completedCount} of ${subject.lessonCount} lessons completed`}
              className="h-1.5 overflow-hidden rounded-full bg-white/10"
            >
              <div
                className={[
                  "h-full rounded-full transition-all",
                  isComplete
                    ? "bg-emerald-400"
                    : "bg-gradient-to-r from-indigo-500 to-cyan-400",
                ].join(" ")}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        ) : (
          <span className="text-sm text-slate-500">—</span>
        )}
      </div>

      {/* Action */}
      <div className="col-span-2 sm:col-span-1 sm:justify-self-end xl:col-span-1">
        {subject.lessonError ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex w-full items-center justify-center rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-400/20 sm:w-auto"
          >
            Retry Lessons
          </button>
        ) : !hasLessons ? (
          <button
            type="button"
            disabled
            className="inline-flex w-full cursor-not-allowed items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold text-slate-500 sm:w-auto"
          >
            Coming Soon
          </button>
        ) : (
          <Link
            to={courseUrl}
            aria-label={`${actionLabel}: ${subject.name}`}
            className={[
              "inline-flex w-full items-center justify-center gap-2",
              "whitespace-nowrap rounded-xl border px-4 py-2",
              "text-xs font-semibold transition sm:w-auto",
              "focus-visible:outline-2 focus-visible:outline-offset-4",
              "focus-visible:outline-cyan-300",
              isComplete
                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/20"
                : "border-cyan-400/20 bg-cyan-400/10 text-cyan-200 hover:border-cyan-400/40 hover:bg-cyan-400/20",
            ].join(" ")}
          >
            {actionLabel}
            <span aria-hidden="true">→</span>
          </Link>
        )}
      </div>
    </article>
  );
}

function Learn() {
  const [subjects, setSubjects] = useState([]);
  const [subjectLoading, setSubjectLoading] = useState(true);
  const [subjectError, setSubjectError] = useState("");
  const [subjectRetry, setSubjectRetry] = useState(0);
  const [authRevision, setAuthRevision] = useState(0);

  useEffect(() => {
    const updateAuth = () => setAuthRevision((value) => value + 1);
    window.addEventListener("authChanged", updateAuth);
    window.addEventListener("storage", updateAuth);
    return () => {
      window.removeEventListener("authChanged", updateAuth);
      window.removeEventListener("storage", updateAuth);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchSubjects() {
      setSubjectLoading(true);
      setSubjectError("");
      setSubjects([]);

      try {
        const response = await api.get(
          "/learn/subjects",
          { signal: controller.signal },
        );

        if (controller.signal.aborted) return;

        if (!Array.isArray(response.data)) {
          throw new Error("Unexpected course response.");
        }

        const courses = response.data;

        const coursesWithProgress = await Promise.all(
          courses.map(async (subject) => {
            const isPlaceholder =
              Number(subject.is_placeholder) === 1;

            if (isPlaceholder) {
              return {
                ...subject,
                isPlaceholder: true,
                lessonCount: 0,
                completedCount: 0,
                startTopicId: null,
                lessonError: "",
              };
            }

            try {
              const topicResponse = await api.get(
                `/learn/subjects/${subject.id}/topics`,
                { signal: controller.signal },
              );

              if (!Array.isArray(topicResponse.data)) {
                throw new Error("Unexpected lesson response.");
              }

              const lessons = [...topicResponse.data].sort(
                (a, b) =>
                  Number(a.order_index) - Number(b.order_index) ||
                  Number(a.id) - Number(b.id),
              );

              const completedLessons = lessons.filter(
                (lesson) => Number(lesson.completed) === 1,
              );

              const startLesson =
                lessons.find(
                  (lesson) => Number(lesson.completed) !== 1,
                ) ||
                lessons[0] ||
                null;

              return {
                ...subject,
                isPlaceholder: false,
                lessonCount: lessons.length,
                completedCount: completedLessons.length,
                startTopicId: startLesson?.id ?? null,
                lessonError: "",
              };
            } catch (err) {
              if (controller.signal.aborted) throw err;

              return {
                ...subject,
                isPlaceholder: false,
                lessonCount: 0,
                completedCount: 0,
                startTopicId: null,
                lessonError:
                  err.response?.status === 401
                    ? "Your session has expired. Please log in again."
                    : err.response?.data?.error ||
                      err.message ||
                      "Unable to load lessons.",
              };
            }
          }),
        );

        if (controller.signal.aborted) return;

        setSubjects(coursesWithProgress);
      } catch (err) {
        if (controller.signal.aborted) return;

        setSubjectError(
          err.response?.data?.error ||
            err.message ||
            "Failed to load courses.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setSubjectLoading(false);
        }
      }
    }

    fetchSubjects();

    return () => controller.abort();
  }, [subjectRetry, authRevision]);

  const retrySubjects = () => setSubjectRetry((value) => value + 1);

  return (
    <div className="grid gap-6">
      {/* Courses */}
      <section className="rounded-3xl border border-white/10 bg-slate-900/50 p-6 shadow-2xl backdrop-blur-xl">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold text-white">
              Courses
            </h3>

            <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-400">
              Choose a course to start learning or continue from your
              next incomplete lesson. Unavailable courses are marked
              as coming soon.
            </p>
          </div>

          {(
            <button
              type="button"
              disabled={subjectLoading}
              onClick={retrySubjects}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {subjectLoading ? "Loading..." : "Refresh"}
            </button>
          )}
        </div>

        {subjectLoading ? (
          <div
            role="status"
            className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm text-cyan-200"
          >
            Loading courses and progress...
          </div>
        ) : subjectError ? (
          <div
            role="alert"
            className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-4 text-sm text-rose-200"
          >
            <p>{subjectError}</p>

            <button
              type="button"
              onClick={retrySubjects}
              className="mt-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
            >
              Retry
            </button>
          </div>
        ) : subjects.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-slate-400">
            No learning courses are available yet.
          </div>
        ) : (
          <>
            <div
              aria-hidden="true"
              className={[
                "mb-3 hidden items-center gap-x-5 px-5",
                "text-xs font-semibold uppercase tracking-wide",
                "text-slate-500 xl:grid",
                COURSE_COLUMNS,
              ].join(" ")}
            >
              <span>Course</span>
              <span>Status</span>
              <span>Language</span>
              <span>Progress</span>
              <span className="text-right">Action</span>
            </div>

            <div className="space-y-3">
              {subjects.map((subject) => (
                <CourseRow
                  key={subject.id}
                  subject={subject}
                  onRetry={retrySubjects}
                />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export default Learn;