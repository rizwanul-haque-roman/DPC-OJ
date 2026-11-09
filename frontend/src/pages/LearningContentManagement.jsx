import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  ChevronRight,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import api from "../api/axios";
import LessonEditor from "../components/LessonEditor";

const panel =
  "rounded-3xl border border-white/10 bg-slate-900/50 p-5 shadow-2xl sm:p-6";

const input =
  "w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-400/50";

const button =
  "inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40";

const neutral =
  `${button} border-white/10 bg-white/5 text-slate-300 hover:bg-white/10`;

const primary =
  `${button} border-cyan-400/20 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/20`;

const danger =
  `${button} border-rose-400/20 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20`;

const badges = {
  published:
    "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
  draft: "border-amber-400/20 bg-amber-400/10 text-amber-200",
  archived: "border-slate-400/20 bg-slate-400/10 text-slate-300",
};

const emptyCourse = {
  name: "",
  description: "",
  language: "",
  is_placeholder: false,
  is_active: true,
  execution_mode: "disabled",
  default_language: "",
  editor_enabled: false,
  run_enabled: false,
  editor_message: "",
};

function message(error) {
  return (
    error.response?.data?.error ||
    error.message ||
    "Unable to complete the request."
  );
}

function flag(value) {
  return value === true || Number(value) === 1;
}

function filterCourses(courses, filters) {
  const search = filters.search.trim().toLocaleLowerCase();
  return courses.filter((course) => {
    const matchesName = String(course.name || "").toLocaleLowerCase().includes(search) ||
      String(course.id).includes(search);
    return matchesName &&
      (filters.visibility === "all" || flag(course.is_active) === (filters.visibility === "visible")) &&
      (
        filters.content === "all" ||
        (filters.content === "regular" && !flag(course.is_placeholder)) ||
        (filters.content === "placeholder" && flag(course.is_placeholder)) ||
        (filters.content === "published" &&
          Number(course.published_count || 0) > 0) ||
        (filters.content === "unpublished" &&
          Number(course.published_count || 0) === 0)
      );
  }).sort((a, b) => {
    const nameOrder = String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base", numeric: true }) || Number(a.id) - Number(b.id);
    if (filters.sort === "name-desc") return -nameOrder;
    if (filters.sort === "lessons-desc") return Number(b.lesson_count || 0) - Number(a.lesson_count || 0) || nameOrder;
    if (filters.sort === "lessons-asc") return Number(a.lesson_count || 0) - Number(b.lesson_count || 0) || nameOrder;
    return nameOrder;
  });
}

function filterLessons(lessons, filters) {
  const search = filters.search.trim().toLocaleLowerCase();
  return lessons.map((topic, index) => ({ topic, index })).filter(({ topic }) =>
    (String(topic.title || "").toLocaleLowerCase().includes(search) || String(topic.id).includes(search)) &&
    (filters.status === "all" || topic.status === filters.status),
  ).sort((a, b) => {
    if (filters.sort === "order") return a.index - b.index;
    const compared = String(a.topic.title || "").localeCompare(String(b.topic.title || ""), undefined, { sensitivity: "base", numeric: true }) || Number(a.topic.id) - Number(b.topic.id);
    return filters.sort === "name-desc" ? -compared : compared;
  });
}

function paginate(items, page, pageSize) {
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.max(1, Math.min(page, pages));
  const offset = (current - 1) * pageSize;
  return { pages, current, from: items.length ? offset + 1 : 0,
    to: Math.min(offset + pageSize, items.length), items: items.slice(offset, offset + pageSize) };
}

function ListPagination({ label, data, total, pageSize, onPage, onPageSize, disabled }) {
  return (
    <nav aria-label={`${label} pagination`} className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
      <p role="status" className="text-xs text-slate-400">
        Showing {data.from}–{data.to} of {total} matching {label.toLowerCase()}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-slate-400">
          {label} per page
          <select value={pageSize} disabled={disabled} onChange={(event) => onPageSize(Number(event.target.value))} className="rounded-lg border border-white/10 bg-slate-950 px-2 py-2 text-slate-200">
            {[5, 10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
        <span className="px-2 text-xs text-slate-500">Page {data.current} of {data.pages}</span>
        <button type="button" className={neutral} disabled={disabled || data.current === 1} onClick={() => onPage(data.current - 1)}>Previous</button>
        <button type="button" className={neutral} disabled={disabled || data.current === data.pages} onClick={() => onPage(data.current + 1)}>Next</button>
      </div>
    </nav>
  );
}

export default function LearningContentManagement() {
  const [courses, setCourses] = useState([]);
  const [lessons, setLessons] = useState([]);

  const [courseId, setCourseId] = useState("");

  const [loading, setLoading] = useState(true);
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [error, setError] = useState("");
  const [lessonError, setLessonError] = useState("");
  const [success, setSuccess] = useState("");

  const [refresh, setRefresh] = useState(0);
  const [lessonRefresh, setLessonRefresh] = useState(0);

  const [courseForm, setCourseForm] = useState(null);
  const [courseFormError, setCourseFormError] = useState("");
  const [lessonEditor, setLessonEditor] = useState(null);

  const [courseFilters, setCourseFilters] = useState({ search: "", visibility: "all", content: "all", sort: "name-asc" });
  const [lessonFilters, setLessonFilters] = useState({ search: "", status: "all", sort: "order" });
  const [coursePage, setCoursePage] = useState(1);
  const [coursePageSize, setCoursePageSize] = useState(10);
  const [lessonPage, setLessonPage] = useState(1);
  const [lessonPageSize, setLessonPageSize] = useState(10);

  const actionLock = useRef(false);
  const selectedCourseSectionRef = useRef(null);

  const selectedCourse = courses.find((item) => String(item.id) === courseId);
  const filteredCourses = useMemo(() => filterCourses(courses, courseFilters), [courses, courseFilters]);
  const filteredLessons = useMemo(() => filterLessons(lessons, lessonFilters), [lessons, lessonFilters]);
  const coursePagination = paginate(filteredCourses, coursePage, coursePageSize);
  const lessonPagination = paginate(filteredLessons, lessonPage, lessonPageSize);
  const visibleCourses = coursePagination.items;
  const visibleLessons = lessonPagination.items;
  const reorderAllowed = !lessonFilters.search.trim() && lessonFilters.status === "all" && lessonFilters.sort === "order";

  function updateCourseFilter(field, value) {
    setCourseFilters((current) => ({ ...current, [field]: value }));
    setCoursePage(1);
  }
  function updateLessonFilter(field, value) {
    setLessonFilters((current) => ({ ...current, [field]: value }));
    setLessonPage(1);
  }
  function resetCourseFilters() {
    setCourseFilters({ search: "", visibility: "all", content: "all", sort: "name-asc" });
    setCoursePage(1);
  }
  function resetLessonFilters() {
    setLessonFilters({ search: "", status: "all", sort: "order" });
    setLessonPage(1);
  }

  useEffect(() => {
    setLessonFilters({ search: "", status: "all", sort: "order" });
    setLessonPage(1);
  }, [courseId]);

  useEffect(() => {
    if (courseId) {
      selectedCourseSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [courseId]);


  useEffect(() => {
    const controller = new AbortController();

    async function loadStructure() {
      setLoading(true);
      setError("");

      try {
        const courseResponse = await api.get("/admin/learning/subjects", {
          signal: controller.signal,
        });
        const nextCourses = courseResponse.data;
        if (!Array.isArray(nextCourses)) {
          throw new Error("Unexpected course response.");
        }
        if (controller.signal.aborted) return;
        setCourses(nextCourses);

        setCourseId((current) =>
          nextCourses.some((item) => String(item.id) === current)
            ? current
            : "",
        );
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(message(requestError));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadStructure();

    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    const controller = new AbortController();

    setLessons([]);
    setLessonError("");

    if (!courseId) {
      setLessonsLoading(false);
      return () => controller.abort();
    }

    async function loadLessons() {
      setLessonsLoading(true);

      try {
        const response = await api.get(
          `/admin/learning/subjects/${courseId}/topics`,
          { signal: controller.signal },
        );

        if (!Array.isArray(response.data)) {
          throw new Error("Unexpected lesson-list response.");
        }

        if (!controller.signal.aborted) {
          setLessons(response.data);
        }
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setLessonError(message(requestError));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLessonsLoading(false);
        }
      }
    }

    void loadLessons();

    return () => controller.abort();
  }, [courseId, lessonRefresh]);

  function refreshWorkspace() {
    setRefresh((value) => value + 1);
    setLessonRefresh((value) => value + 1);
  }

  async function runAction(callback) {
    if (actionLock.current) return;

    actionLock.current = true;
    setBusy(true);
    setError("");
    setSuccess("");

    try {
      await callback();
    } catch (requestError) {
      setError(message(requestError));
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }

  function openCourseForm(course = null) {
    setCourseFormError("");

    setCourseForm({
      id: course?.id || null,
      values: course
        ? {
            name: course.name || "",
            description: course.description || "",
            language: course.language || "",
            is_placeholder: Boolean(course.is_placeholder),
            is_active: course.is_active === true || Number(course.is_active) === 1,
            execution_mode: course.execution_mode || "disabled",
            default_language: course.default_language || "",
            editor_enabled: Boolean(course.editor_enabled),
            run_enabled: Boolean(course.run_enabled),
            editor_message: course.editor_message || "",
          }
        : { ...emptyCourse },
    });
  }

  function updateCourseField(event) {
    const { name, value, type, checked } = event.target;

    setCourseForm((current) => {
      const values = {
        ...current.values,
        [name]: type === "checkbox" ? checked : value,
      };

      if (
        (name === "editor_enabled" && !checked) ||
        (name === "execution_mode" && value === "disabled")
      ) {
        values.run_enabled = false;
      }

      return { ...current, values };
    });
  }

  async function saveCourse(event) {
    event.preventDefault();

    if (actionLock.current) return;

    actionLock.current = true;
    setBusy(true);
    setCourseFormError("");

    try {
      const values = courseForm.values;

      const payload = {
        ...values,
        name: values.name.trim(),
        language: values.language.trim() || null,
        default_language: values.default_language.trim() || null,
        editor_message: values.editor_message.trim() || null,
      };

      const response = courseForm.id
        ? await api.patch(
            `/admin/learning/subjects/${courseForm.id}`,
            payload,
          )
        : await api.post("/admin/learning/subjects", payload);

      setCourseForm(null);
      setSuccess(response.data.message);
      refreshWorkspace();
    } catch (requestError) {
      setCourseFormError(message(requestError));
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }

  function deleteCourse(course) {
    if (
      !window.confirm(
        `Delete course "${course.name}"?\n\nOnly empty courses can be deleted. Archived lessons also prevent deletion.`,
      )
    ) {
      return;
    }

    void runAction(async () => {
      const response = await api.delete(
        `/admin/learning/subjects/${course.id}`,
        { data: { confirm: true } },
      );

      if (String(course.id) === courseId) {
        setCourseId("");
      }

      setSuccess(response.data.message);
      refreshWorkspace();
    });
  }

  function changeStatus(topic, status) {
    if (
      status === "archived" &&
      !window.confirm(
        `Archive "${topic.title}"?\n\nIts content and student progress will be retained.`,
      )
    ) {
      return;
    }

    void runAction(async () => {
      const response = await api.patch(
        `/admin/learning/topics/${topic.id}/status`,
        { status },
      );

      setSuccess(response.data.message);
      refreshWorkspace();
    });
  }

  function deleteLesson(topic) {
    const reason = window.prompt(
      `Permanently delete "${topic.title}"?\n\nThis removes the lesson and all its student progress. This cannot be undone through the app.\n\nEnter a reason, or leave it empty. Press Cancel to stop.`,
    );

    if (reason === null) return;

    if (
      !window.confirm(
        `Final confirmation: permanently delete "${topic.title}" and its student progress?`,
      )
    ) {
      return;
    }

    void runAction(async () => {
      const response = await api.delete(
        `/admin/learning/topics/${topic.id}`,
        {
          data: {
            confirm: true,
            reason: reason.trim() || undefined,
          },
        },
      );

      setSuccess(response.data.message);
      refreshWorkspace();
    });
  }

  function moveLesson(index, direction) {
    if (!reorderAllowed || lessonsLoading || actionLock.current) return;
    const nextIndex = index + direction;

    if (nextIndex < 0 || nextIndex >= lessons.length) return;

    const reordered = [...lessons];

    [reordered[index], reordered[nextIndex]] = [
      reordered[nextIndex],
      reordered[index],
    ];

    void runAction(async () => {
      const response = await api.put(
        `/admin/learning/subjects/${courseId}/topic-order`,
        { topic_ids: reordered.map((item) => Number(item.id)) },
      );

      setSuccess(response.data.message);
      setLessonRefresh((value) => value + 1);
    });
  }

  // While the lesson editor is open, hide parent selection controls.
  // Its Cancel button handles confirmation of unsaved changes.
  if (lessonEditor) {
    return (
      <LessonEditor
        key={`${lessonEditor.subject.id}:${lessonEditor.topicId || "new"}`}
        subject={lessonEditor.subject}
        topicId={lessonEditor.topicId}
        onCancel={() => setLessonEditor(null)}
        onSaved={() => {
          setLessonEditor(null);
          setSuccess(
            lessonEditor.topicId
              ? "Lesson changes saved."
              : "Draft lesson created.",
          );
          refreshWorkspace();
        }}
      />
    );
  }

  const disabled = busy || loading || courseForm !== null;

  return (
    <div className="space-y-6">
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

      <section className={panel}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white">
              Learning workspace
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Manage courses directly, then create and edit lessons
              inside each course.
            </p>
          </div>

          <button
            type="button"
            disabled={disabled}
            onClick={refreshWorkspace}
            className={neutral}
          >
            <RefreshCw
              size={15}
              className={loading ? "animate-spin" : ""}
            />
            Refresh
          </button>
        </div>

      </section>

      {courseForm && (
        <section className={panel}>
          <h2 className="text-xl font-bold text-white">
            {courseForm.id ? "Edit course" : "Add course"}
          </h2>


          <form onSubmit={saveCourse} className="mt-5">
            <fieldset disabled={busy} className="space-y-4">
              <label className="block text-sm text-slate-300">
                Course name
                <input
                  required
                  name="name"
                  value={courseForm.values.name}
                  onChange={updateCourseField}
                  className={`${input} mt-2`}
                />
              </label>

              <label className="block text-sm text-slate-300">
                Description
                <textarea
                  name="description"
                  value={courseForm.values.description}
                  onChange={updateCourseField}
                  rows={3}
                  className={`${input} mt-2`}
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm text-slate-300">
                  Course language label
                  <input
                    name="language"
                    value={courseForm.values.language}
                    onChange={updateCourseField}
                    placeholder="For example: C"
                    className={`${input} mt-2`}
                  />
                </label>

                <label className="block text-sm text-slate-300">
                  Execution mode
                  <select
                    name="execution_mode"
                    value={courseForm.values.execution_mode}
                    onChange={updateCourseField}
                    className={`${input} mt-2`}
                  >
                    <option value="disabled">Disabled</option>
                    <option value="code">Code</option>
                    <option value="sql">SQL</option>
                    <option value="external">External</option>
                  </select>
                </label>

                <label className="block text-sm text-slate-300">
                  Default editor language
                  <input
                    name="default_language"
                    value={courseForm.values.default_language}
                    onChange={updateCourseField}
                    placeholder="c, cpp, python, or java"
                    className={`${input} mt-2`}
                  />
                </label>

                <label className="block text-sm text-slate-300">
                  Editor message
                  <input
                    name="editor_message"
                    value={courseForm.values.editor_message}
                    onChange={updateCourseField}
                    className={`${input} mt-2`}
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-5 rounded-xl border border-white/10 bg-slate-950/30 p-4">
                {[
                  ["is_active", "Course visible to students"],
                  ["is_placeholder", "Placeholder course"],
                  ["editor_enabled", "Enable practice editor"],
                  ["run_enabled", "Enable Run"],
                ].map(([name, label]) => (
                  <label
                    key={name}
                    className="flex items-center gap-2 text-sm text-slate-300"
                  >
                    <input
                      type="checkbox"
                      name={name}
                      checked={courseForm.values[name]}
                      onChange={updateCourseField}
                      disabled={
                        busy ||
                        (name === "run_enabled" &&
                          (!courseForm.values.editor_enabled ||
                            courseForm.values.execution_mode ===
                              "disabled"))
                      }
                      className="accent-cyan-400"
                    />
                    {label}
                  </label>
                ))}
              </div>

              <p className="text-xs leading-6 text-slate-500">
                Execution settings configure the course; they do not
                add support for a new runner. Keep Run disabled for
                tools your backend does not support.
              </p>

              {courseFormError && (
                <p role="alert" className="text-sm text-rose-300">
                  {courseFormError}
                </p>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Close the course form and discard unsaved changes?",
                      )
                    ) {
                      setCourseForm(null);
                    }
                  }}
                  className={neutral}
                >
                  Cancel
                </button>

                <button type="submit" className={primary}>
                  {busy ? "Saving..." : "Save course"}
                </button>
              </div>
            </fieldset>
          </form>
        </section>
      )}

      {(
        <section className={panel}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-white">
                Courses
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                {filteredCourses.length} matching courses · {courses.length} total
              </p>
            </div>

            <button
              type="button"
              disabled={disabled}
              onClick={() => openCourseForm()}
              className={primary}
            >
              <Plus size={15} />
              Add course
            </button>
          </div>

          <div className="mt-5 grid gap-3 border-y border-white/10 py-4 sm:grid-cols-2 xl:grid-cols-4">
            <label className="text-xs text-slate-400">Search courses
              <input type="search" maxLength={100} value={courseFilters.search} onChange={(event) => updateCourseFilter("search", event.target.value)} disabled={disabled} placeholder="Course name or ID..." className={`${input} mt-2`} />
            </label>
            <label className="text-xs text-slate-400">Visibility
              <select value={courseFilters.visibility} onChange={(event) => updateCourseFilter("visibility", event.target.value)} disabled={disabled} className={`${input} mt-2`}>
                <option value="all">All visibility</option><option value="visible">Visible to students</option><option value="hidden">Hidden from students</option>
              </select>
            </label>
            <label className="text-xs text-slate-400">Course type
              <select value={courseFilters.content} onChange={(event) => updateCourseFilter("content", event.target.value)} disabled={disabled} className={`${input} mt-2`}>
                <option value="all">All types</option>
                <option value="regular">Non-placeholder</option>
                <option value="placeholder">Placeholder</option>
                <option value="published">Published — has published lessons</option>
                <option value="unpublished">Not published — no published lessons</option>
              </select>
            </label>
            <label className="text-xs text-slate-400">Sort courses
              <select value={courseFilters.sort} onChange={(event) => updateCourseFilter("sort", event.target.value)} disabled={disabled} className={`${input} mt-2`}>
                <option value="name-asc">Name: A–Z</option><option value="name-desc">Name: Z–A</option><option value="lessons-desc">Most lessons</option><option value="lessons-asc">Fewest lessons</option>
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">Filtering courses does not close the selected course’s lesson workspace.</p>
            <button type="button" disabled={disabled} onClick={resetCourseFilters} className={neutral}>Reset course filters</button>
          </div>

          {loading ? (
            <p role="status" className="py-8 text-sm text-slate-400">
              Loading courses...
            </p>
          ) : visibleCourses.length === 0 ? (
            <p className="mt-5 rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">
              {courses.length === 0 ? "No courses yet. Add the first course." : "No courses match your search and filters. Reset the course filters to see all courses."}
            </p>
          ) : (
            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {visibleCourses.map((course) => {
                const active = String(course.id) === courseId;

                return (
                  <article
                    key={course.id}
                    className={`rounded-2xl border p-5 ${
                      active
                        ? "border-cyan-400/40 bg-cyan-400/5"
                        : "border-white/10 bg-slate-950/30"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <BookOpen
                        size={20}
                        className="mt-1 shrink-0 text-cyan-300"
                      />

                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-white">
                          {course.name}
                        </h3>

                        {course.description && (
                          <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-400">
                            {course.description}
                          </p>
                        )}

                        <p className="mt-3 text-xs leading-6 text-slate-500">
                          {course.lesson_count} lessons ·{" "}
                          {course.published_count} published ·{" "}
                          {course.draft_count} drafts ·{" "}
                          {course.archived_count || 0} archived
                        </p>

                        {!course.is_active && (
                          <p className="mt-1 text-xs text-rose-300">Hidden from students</p>
                        )}
                        {course.is_placeholder && (
                          <p className="mt-1 text-xs text-amber-300">
                            Placeholder course
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          setCourseId(String(course.id));
                          setSuccess("");
                        }}
                        className={primary}
                      >
                        {active ? "Selected" : "Manage lessons"}
                        <ChevronRight size={14} />
                      </button>

                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => openCourseForm(course)}
                        className={neutral}
                      >
                        <Pencil size={14} />
                        Edit
                      </button>

                      <button
                        type="button"
                        disabled={
                          disabled || Number(course.lesson_count) > 0
                        }
                        title={
                          Number(course.lesson_count) > 0
                            ? "Remove all lessons before deleting this course."
                            : "Delete empty course"
                        }
                        onClick={() => deleteCourse(course)}
                        className={danger}
                      >
                        <Trash2 size={14} />
                        Remove
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {!loading && (
            <ListPagination label="Courses" data={coursePagination} total={filteredCourses.length} pageSize={coursePageSize}
              onPage={setCoursePage} onPageSize={(size) => { if ([5, 10, 25, 50].includes(size)) { setCoursePageSize(size); setCoursePage(1); } }} disabled={disabled} />
          )}
        </section>
      )}

      {selectedCourse && (
        <section ref={selectedCourseSectionRef} className={panel}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
                Selected course
              </p>

              <h2 className="mt-2 text-xl font-bold text-white">
                {selectedCourse.name}
              </h2>

              <p className="mt-2 text-sm text-slate-400">
                Add lessons, edit their content, and manage the
                learning order.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      "Close the selected course workspace?",
                    )
                  ) {
                    setCourseId("");
                  }
                }}
                className={neutral}
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={disabled || lessonsLoading}
                onClick={() =>
                  setLessonEditor({
                    subject: selectedCourse,
                    topicId: null,
                  })
                }
                className={primary}
              >
                <Plus size={15} />
                Add lesson
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 border-y border-white/10 py-4 sm:grid-cols-3">
            <label className="text-xs text-slate-400">Search lessons
              <input type="search" maxLength={100} value={lessonFilters.search} onChange={(event) => updateLessonFilter("search", event.target.value)} disabled={disabled || lessonsLoading} placeholder="Lesson title or ID..." className={`${input} mt-2`} />
            </label>
            <label className="text-xs text-slate-400">Lesson status
              <select value={lessonFilters.status} onChange={(event) => updateLessonFilter("status", event.target.value)} disabled={disabled || lessonsLoading} className={`${input} mt-2`}>
                <option value="all">All statuses</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option>
              </select>
            </label>
            <label className="text-xs text-slate-400">Sort lessons
              <select value={lessonFilters.sort} onChange={(event) => updateLessonFilter("sort", event.target.value)} disabled={disabled || lessonsLoading} className={`${input} mt-2`}>
                <option value="order">Learning order</option><option value="name-asc">Title: A–Z</option><option value="name-desc">Title: Z–A</option>
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">{filteredLessons.length} matching lessons · {lessons.length} total</p>
            <button type="button" disabled={disabled || lessonsLoading} onClick={resetLessonFilters} className={neutral}>Reset lesson filters</button>
          </div>

          {lessonError && (
            <p
              role="alert"
              className="mt-5 text-sm text-rose-300"
            >
              {lessonError}
            </p>
          )}

          {lessonsLoading ? (
            <p role="status" className="py-8 text-sm text-slate-400">
              Loading lessons...
            </p>
          ) : lessonError ? (
            <button
              type="button"
              onClick={() =>
                setLessonRefresh((value) => value + 1)
              }
              className={`${neutral} mt-4`}
            >
              Retry loading lessons
            </button>
          ) : lessons.length === 0 ? (
            <p className="mt-5 rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">
              This course has no lessons yet. Add its first lesson.
            </p>
          ) : filteredLessons.length === 0 ? (
            <p className="mt-5 rounded-2xl border border-dashed border-white/10 p-6 text-sm text-slate-400">No lessons match your search and status filter.</p>
          ) : (
            <div className="mt-6 overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-slate-950/50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th scope="col" className="px-5 py-4">
                      Order
                    </th>
                    <th scope="col" className="px-5 py-4">
                      Lesson
                    </th>
                    <th scope="col" className="px-5 py-4">
                      Status
                    </th>
                    <th
                      scope="col"
                      className="px-5 py-4 text-right"
                    >
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {visibleLessons.map(({ topic, index }) => (
                    <tr
                      key={topic.id}
                      className="border-t border-white/5 hover:bg-white/[0.025]"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1">
                          <span className="mr-2 min-w-5 font-mono text-slate-500">
                            {index + 1}
                          </span>

                          <button
                            type="button"
                            disabled={disabled || !reorderAllowed || index === 0}
                            aria-label={`Move ${topic.title} up`}
                            onClick={() => moveLesson(index, -1)}
                            className={`${neutral} p-2`}
                          >
                            <ArrowUp size={13} />
                          </button>

                          <button
                            type="button"
                            disabled={
                              disabled ||
                              !reorderAllowed ||
                              index === lessons.length - 1
                            }
                            aria-label={`Move ${topic.title} down`}
                            onClick={() => moveLesson(index, 1)}
                            className={`${neutral} p-2`}
                          >
                            <ArrowDown size={13} />
                          </button>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <p className="font-semibold text-white">
                          {topic.title}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Lesson #{topic.id}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs capitalize ${
                            badges[topic.status] || badges.draft
                          }`}
                        >
                          {topic.status}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() =>
                              setLessonEditor({
                                subject: selectedCourse,
                                topicId: topic.id,
                              })
                            }
                            className={primary}
                          >
                            <Pencil size={13} />
                            Edit
                          </button>

                          {topic.status === "archived" ? (
                            <>
                              <button
                                type="button"
                                disabled={disabled}
                                onClick={() =>
                                  changeStatus(topic, "draft")
                                }
                                className={neutral}
                              >
                                Restore
                              </button>

                              <button
                                type="button"
                                disabled={disabled}
                                onClick={() => deleteLesson(topic)}
                                className={danger}
                              >
                                Delete
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={disabled}
                                onClick={() =>
                                  changeStatus(
                                    topic,
                                    topic.status === "published"
                                      ? "draft"
                                      : "published",
                                  )
                                }
                                className={neutral}
                              >
                                {topic.status === "published"
                                  ? "Unpublish"
                                  : "Publish"}
                              </button>

                              <button
                                type="button"
                                disabled={disabled}
                                onClick={() =>
                                  changeStatus(topic, "archived")
                                }
                                className={neutral}
                              >
                                Archive
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!lessonsLoading && !lessonError && (
            <ListPagination label="Lessons" data={lessonPagination} total={filteredLessons.length} pageSize={lessonPageSize}
              onPage={setLessonPage} onPageSize={(size) => { if ([5, 10, 25, 50].includes(size)) { setLessonPageSize(size); setLessonPage(1); } }} disabled={disabled} />
          )}
          {!reorderAllowed && (
            <p role="status" className="mt-3 text-xs text-amber-200">To reorder lessons, clear the lesson search, select All statuses, and sort by Learning order.</p>
          )}

          <p className="mt-4 text-xs leading-6 text-slate-500">
            Reordering changes the learning sequence. Archived
            lessons remain listed for administration. Restore an
            archived lesson to draft before publishing it again.
          </p>
        </section>
      )}
    </div>
  );
}