import { useEffect, useRef, useState } from "react";
import { Eye, FileText, RefreshCw, Save, X } from "lucide-react";
import api from "../api/axios";
import LessonMarkdown from "./LessonMarkdown";
import LessonPracticeManager from "./LessonPracticeManager";

const inputClass =
  "w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400/50 focus:ring-4 focus:ring-cyan-400/10";

const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40";

const emptyForm = {
  title: "",
  content: "",
  starter_code: "",
};

const bytes = (value) => new TextEncoder().encode(value).length;

export default function LessonEditor({
  subject,
  topicId = null,
  onSaved,
  onCancel,
}) {
  const editing = topicId !== null;

  const [form, setForm] = useState(emptyForm);
  const [baseline, setBaseline] = useState(emptyForm);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [practiceBusy, setPracticeBusy] = useState(false);
  const [loaded, setLoaded] = useState(!editing);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("write");
  const [reloadKey, setReloadKey] = useState(0);

  const savingLock = useRef(false);
  const practiceBusyRef = useRef(false);

  const dirty =
    form.title !== baseline.title ||
    form.content !== baseline.content ||
    form.starter_code !== baseline.starter_code;

  const contentBytes = bytes(form.content);
  const starterBytes = bytes(form.starter_code);
  const editorBusy = saving || practiceBusy;

  useEffect(() => {
    const controller = new AbortController();

    setForm(emptyForm);
    setBaseline(emptyForm);
    setError("");
    setLoaded(!editing);
    setLoading(editing);

    if (!editing) {
      return () => controller.abort();
    }

    async function loadLesson() {
      try {
        const response = await api.get(
          `/admin/learning/topics/${topicId}`,
          { signal: controller.signal },
        );

        if (controller.signal.aborted) return;

        const topic = response.data;

        if (Number(topic.subject_id) !== Number(subject.id)) {
          throw new Error("This lesson belongs to another course.");
        }

        const nextForm = {
          title: topic.title || "",
          content: topic.content || "",
          starter_code: topic.starter_code || "",
        };

        setForm(nextForm);
        setBaseline(nextForm);
        setLoaded(true);
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(
            requestError.response?.data?.error ||
              requestError.message ||
              "Unable to load the lesson.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadLesson();

    return () => controller.abort();
  }, [editing, topicId, subject.id, reloadKey]);

  useEffect(() => {
    if (!dirty && !editorBusy) return;

    function warnBeforeUnload(event) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", warnBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
    };
  }, [dirty, editorBusy]);

  function updateField(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function handlePracticeBusyChange(value) {
    practiceBusyRef.current = value;
    setPracticeBusy(value);
  }

  function cancel() {
    if (savingLock.current || practiceBusyRef.current) return;

    if (
      dirty &&
      !window.confirm(
        "Discard your unsaved lesson content changes?\n\nPractice-problem changes that were already saved will remain.",
      )
    ) {
      return;
    }

    onCancel();
  }

  async function saveLesson(event) {
    event.preventDefault();

    if (
      savingLock.current ||
      practiceBusyRef.current ||
      !loaded
    ) {
      return;
    }

    setError("");

    if (
      !form.title.trim() ||
      Array.from(form.title.trim()).length > 255
    ) {
      setError("Enter a title between 1 and 255 characters.");
      return;
    }

    if (contentBytes > 32 * 1024) {
      setError("Lesson content must not exceed 32 KB.");
      return;
    }

    if (starterBytes > 16 * 1024) {
      setError("Starter code must not exceed 16 KB.");
      return;
    }

    savingLock.current = true;
    setSaving(true);

    let savedTopic;

    try {
      const payload = {
        title: form.title.trim(),
        content: form.content,
        starter_code: form.starter_code,
      };

      const response = editing
        ? await api.patch(
            `/admin/learning/topics/${topicId}`,
            payload,
          )
        : await api.post(
            `/admin/learning/subjects/${subject.id}/topics`,
            payload,
          );

      savedTopic = response.data.topic;

      const savedForm = {
        title: savedTopic.title || "",
        content: savedTopic.content || "",
        starter_code: savedTopic.starter_code || "",
      };

      setForm(savedForm);
      setBaseline(savedForm);
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          "Unable to save the lesson.",
      );
      return;
    } finally {
      savingLock.current = false;
      setSaving(false);
    }

    onSaved(savedTopic);
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/60 shadow-2xl">
      <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5 sm:p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
            {subject.name}
          </p>

          <h2 className="mt-2 text-xl font-bold text-white">
            {editing ? "Edit lesson" : "Add lesson"}
          </h2>

          <p className="mt-2 text-sm text-slate-400">
            Write Markdown on the left and review the student
            preview on the right.
          </p>
        </div>

        <button
          type="button"
          onClick={cancel}
          disabled={editorBusy}
          aria-label="Close lesson editor"
          className="rounded-xl p-2 text-slate-400 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
        >
          <X size={20} />
        </button>
      </div>

      {loading ? (
        <div
          role="status"
          className="flex items-center justify-center gap-3 p-16 text-sm text-slate-400"
        >
          <RefreshCw size={18} className="animate-spin" />
          Loading lesson...
        </div>
      ) : !loaded ? (
        <div className="p-6">
          <p role="alert" className="text-sm text-rose-300">
            {error}
          </p>

          <button
            type="button"
            onClick={() => setReloadKey((value) => value + 1)}
            className={`${buttonClass} mt-4 border-white/10 bg-white/5 text-slate-200 hover:bg-white/10`}
          >
            Retry
          </button>
        </div>
      ) : (
        <form onSubmit={saveLesson}>
          <fieldset disabled={editorBusy} className="min-w-0">
            <div className="p-5 sm:p-6">
              <label
                htmlFor="lesson-title"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Lesson title
              </label>

              <input
                id="lesson-title"
                name="title"
                value={form.title}
                onChange={updateField}
                required
                placeholder="For example: Variables and Data Types"
                className={inputClass}
              />
            </div>

            <div className="flex gap-2 border-y border-white/10 bg-slate-950/30 px-5 py-3 lg:hidden">
              {[
                ["write", "Write", FileText],
                ["preview", "Preview", Eye],
              ].map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={tab === value}
                  onClick={() => setTab(value)}
                  className={`${buttonClass} ${
                    tab === value
                      ? "border-cyan-400/20 bg-cyan-400/10 text-cyan-200"
                      : "border-transparent text-slate-400 hover:bg-white/5"
                  }`}
                >
                  <Icon size={15} />
                  {label}
                </button>
              ))}
            </div>

            <div className="grid min-w-0 lg:grid-cols-2">
              <div
                className={`min-w-0 lg:block lg:border-r lg:border-white/10 ${
                  tab === "write" ? "block" : "hidden"
                }`}
              >
                <div className="flex items-center justify-between border-y border-white/10 bg-slate-950/30 px-5 py-3">
                  <label
                    htmlFor="lesson-content"
                    className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400"
                  >
                    <FileText size={15} />
                    Markdown
                  </label>

                  <span
                    className={`text-xs ${
                      contentBytes > 32768
                        ? "text-rose-300"
                        : "text-slate-500"
                    }`}
                  >
                    {(contentBytes / 1024).toFixed(1)} / 32 KB
                  </span>
                </div>

                <textarea
                  id="lesson-content"
                  name="content"
                  value={form.content}
                  onChange={updateField}
                  spellCheck={false}
                  placeholder={
                    "## Introduction\n\nWrite your lesson here.\n\n```c\nint age = 20;\n```"
                  }
                  className="block h-[520px] w-full resize-y bg-slate-950/70 p-5 font-mono text-sm leading-7 text-sky-100 outline-none placeholder:text-slate-600 focus:ring-2 focus:ring-inset focus:ring-cyan-400/30"
                />
              </div>

              <div
                className={`min-w-0 lg:block ${
                  tab === "preview" ? "block" : "hidden"
                }`}
              >
                <div className="flex items-center gap-2 border-y border-white/10 bg-slate-950/30 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <Eye size={15} />
                  Student preview
                </div>

                <div className="h-[520px] overflow-y-auto bg-slate-900/30 p-6">
                  <h1 className="mb-6 break-words text-2xl font-bold text-white">
                    {form.title.trim() || "Untitled lesson"}
                  </h1>

                  <LessonMarkdown content={form.content} />
                </div>
              </div>
            </div>

            <div className="border-t border-white/10 p-5 sm:p-6">
              <div className="mb-2 flex items-center justify-between gap-4">
                <label
                  htmlFor="lesson-starter-code"
                  className="text-sm font-medium text-slate-300"
                >
                  Starter code
                </label>

                <span
                  className={`text-xs ${
                    starterBytes > 16384
                      ? "text-rose-300"
                      : "text-slate-500"
                  }`}
                >
                  {(starterBytes / 1024).toFixed(1)} / 16 KB
                </span>
              </div>

              <p className="mb-3 text-xs leading-6 text-slate-500">
                Optional initial code for the practice editor.
                This is separate from code examples in the lesson.
              </p>

              <textarea
                id="lesson-starter-code"
                name="starter_code"
                value={form.starter_code}
                onChange={updateField}
                spellCheck={false}
                rows={7}
                placeholder="Enter starter code for this lesson..."
                className={`${inputClass} resize-y font-mono leading-7`}
              />

              {error && (
                <p
                  role="alert"
                  className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200"
                >
                  {error}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 bg-slate-950/20 p-5 sm:px-6">
              <p className="text-xs text-slate-500">
                {saving
                  ? "Saving lesson..."
                  : practiceBusy
                    ? "Updating practice problems..."
                    : dirty
                      ? "You have unsaved lesson content changes."
                      : editing
                        ? "Editing does not change publication status."
                        : "New lessons are saved as drafts."}
              </p>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={cancel}
                  disabled={editorBusy}
                  className={`${buttonClass} border-white/10 bg-white/5 text-slate-300 hover:bg-white/10`}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={editorBusy || (editing && !dirty)}
                  className={`${buttonClass} border-cyan-400/20 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/20`}
                >
                  {saving ? (
                    <RefreshCw size={16} className="animate-spin" />
                  ) : (
                    <Save size={16} />
                  )}

                  {saving
                    ? "Saving..."
                    : editing
                      ? "Save changes"
                      : "Create draft"}
                </button>
              </div>
            </div>
          </fieldset>
        </form>
      )}

      {!loading &&
        loaded &&
        (editing ? (
          <LessonPracticeManager
            key={topicId}
            topicId={topicId}
            disabled={saving}
            onBusyChange={handlePracticeBusyChange}
          />
        ) : (
          <div className="border-t border-white/10 px-5 py-5 sm:px-6">
            <h3 className="text-base font-semibold text-white">
              Practice problems
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-400">
              Create this draft first, then reopen it using Edit to
              attach practice problems.
            </p>
          </div>
        ))}
    </section>
  );
}