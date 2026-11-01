import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";

const COURSE_COLUMNS =
  "xl:grid-cols-[minmax(0,1fr)_130px_100px_190px_180px]";

function semesterLabel(number) {
  const semester = Number(number);
  const year = Math.ceil(semester / 2);

  const yearLabels = {
    1: "1st",
    2: "2nd",
    3: "3rd",
    4: "4th",
  };

  return `${yearLabels[year] || `${year}th`} year - Semester ${semester}`;
}

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
  const [semesters, setSemesters] = useState([]);
  const [selectedSemester, setSelectedSemester] = useState(null);
  const [subjects, setSubjects] = useState([]);

  const [loading, setLoading] = useState(true);
  const [subjectLoading, setSubjectLoading] = useState(false);
  const [error, setError] = useState("");
  const [subjectError, setSubjectError] = useState("");

  const [semesterRetry, setSemesterRetry] = useState(0);
  const [subjectRetry, setSubjectRetry] = useState(0);

  const selectedSemesterId = selectedSemester?.id ?? null;

  useEffect(() => {
    const controller = new AbortController();

    async function fetchSemesters() {
      setLoading(true);
      setError("");

      try {
        const response = await api.get("/learn/semesters", {
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        if (!Array.isArray(response.data)) {
          throw new Error("Unexpected semester response.");
        }

        const availableSemesters = response.data
          .filter((semester) => Number(semester.is_active) === 1)
          .sort((a, b) => Number(a.number) - Number(b.number));

        setSemesters(availableSemesters);

        setSelectedSemester((previous) => {
          const existingSelection = availableSemesters.find(
            (semester) => String(semester.id) === String(previous?.id),
          );

          return existingSelection || availableSemesters[0] || null;
        });
      } catch (err) {
        if (controller.signal.aborted) return;

        setError(
          err.response?.data?.error ||
            err.message ||
            "Failed to load semesters.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    fetchSemesters();

    return () => controller.abort();
  }, [semesterRetry]);

  useEffect(() => {
    if (selectedSemesterId === null) {
      setSubjects([]);
      setSubjectError("");
      setSubjectLoading(false);
      return;
    }

    const controller = new AbortController();

    async function fetchSubjects() {
      setSubjectLoading(true);
      setSubjectError("");
      setSubjects([]);

      try {
        const response = await api.get(
          `/learn/semesters/${selectedSemesterId}/subjects`,
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
  }, [selectedSemesterId, subjectRetry]);

  const selectSemester = (semester) => {
    if (String(semester.id) === String(selectedSemesterId)) return;

    setSubjects([]);
    setSubjectError("");
    setSubjectLoading(true);
    setSelectedSemester(semester);
  };

  const retrySubjects = () => {
    setSubjectRetry((value) => value + 1);
  };

  if (loading) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm text-cyan-200 shadow-lg backdrop-blur-xl"
      >
        Loading learning hub...
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-4 text-sm text-rose-200 shadow-lg backdrop-blur-xl"
      >
        <p>{error}</p>

        <button
          type="button"
          onClick={() => setSemesterRetry((value) => value + 1)}
          className="mt-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {/* Semester selection */}
      <section className="rounded-3xl border border-white/10 bg-slate-900/50 p-6 shadow-2xl backdrop-blur-xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold text-white">
              Semester Tracks
            </h3>

            <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-400">
              Follow the National University CSE semester flow and
              learn programming through guided lessons and practice.
            </p>
          </div>
        </div>

        {semesters.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-slate-400">
            No learning semesters are available yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {semesters.map((semester) => {
              const isActive =
                String(selectedSemesterId) === String(semester.id);

              return (
                <button
                  key={semester.id}
                  type="button"
                  onClick={() => selectSemester(semester)}
                  aria-pressed={isActive}
                  className={[
                    "rounded-3xl border p-5 text-left transition duration-200",
                    isActive
                      ? "border-sky-400/40 bg-sky-400/10 shadow-[0_0_0_1px_rgba(87,177,255,0.15),0_16px_40px_rgba(13,22,52,0.35)]"
                      : "border-white/10 bg-white/5 hover:border-sky-400/30 hover:bg-white/[0.07]",
                  ].join(" ")}
                >
                  <span className="mb-3 inline-block rounded-full bg-indigo-400/15 px-3 py-1 text-xs font-medium text-sky-200">
                    {semesterLabel(semester.number)}
                  </span>

                  <h4 className="text-lg font-semibold text-white">
                    {Number(semester.course_count || 0)}{" "}
                    {Number(semester.course_count || 0) === 1
                      ? "course"
                      : "courses"}
                  </h4>

                  <p className="mt-2 text-sm leading-7 text-slate-400">
                    {Array.isArray(semester.course_names) &&
                    semester.course_names.length > 0
                      ? semester.course_names.join(", ")
                      : "No courses added yet."}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Courses */}
      <section className="rounded-3xl border border-white/10 bg-slate-900/50 p-6 shadow-2xl backdrop-blur-xl">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold text-white">
              {selectedSemester
                ? `${semesterLabel(selectedSemester.number)} — Courses`
                : "Courses"}
            </h3>

            <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-400">
              Choose a course to start learning or continue from your
              next incomplete lesson. Unavailable courses are marked
              as coming soon.
            </p>
          </div>

          {selectedSemester && (
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
        ) : !selectedSemester ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-slate-400">
            Select a semester to view its courses.
          </div>
        ) : subjects.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-slate-400">
            No programming learning tracks are currently included for
            this semester.
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