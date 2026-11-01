import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import Editor from "@monaco-editor/react";
import api from "../api/axios";
import LessonMarkdown from "../components/LessonMarkdown";
import LessonPracticeProblems from "../components/LessonPracticeProblems";

const DEFAULT_CODE = {
  c: `#include <stdio.h>

int main() {
    printf("Hello, World!\\n");
    return 0;
}`,
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    cout << "Hello, World!" << endl;
    return 0;
}`,
  python: `print("Hello, World!")`,
  java: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}`,
};

const LANGUAGE_OPTIONS = [
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
];

const EDITOR_LANGUAGES = {
  c: "c",
  cpp: "cpp",
  python: "python",
  java: "java",
};


function LockIcon({ className = "h-4 w-4" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <path d="M12 14v3" />
    </svg>
  );
}

function LockedLessonPlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="select-none space-y-7 px-6 py-6 opacity-50 blur-sm"
    >
      <div className="h-7 w-2/3 rounded bg-slate-600/40" />

      <div className="space-y-3">
        <div className="h-3 w-full rounded bg-slate-600/30" />
        <div className="h-3 w-11/12 rounded bg-slate-600/30" />
        <div className="h-3 w-4/5 rounded bg-slate-600/30" />
      </div>

      <div className="h-5 w-1/2 rounded bg-slate-600/40" />

      <div className="space-y-4 rounded-xl border border-white/10 bg-[#080d1d] p-5">
        {[60, 35, 80, 70, 45, 25].map((width, index) => (
          <div
            key={index}
            className="h-3 rounded bg-cyan-300/20"
            style={{ width: `${width}%` }}
          />
        ))}
      </div>

      <div className="space-y-3">
        <div className="h-3 w-full rounded bg-slate-600/30" />
        <div className="h-3 w-5/6 rounded bg-slate-600/30" />
      </div>
    </div>
  );
}

function LockedEditorPlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="flex h-full min-h-[300px] select-none flex-col bg-[#080d1d] opacity-50 blur-sm"
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/10 px-4">
        <div className="h-6 w-24 rounded-lg bg-slate-600/30" />
        <div className="h-6 w-16 rounded-lg bg-slate-600/30" />
      </div>

      <div className="flex-1 space-y-5 p-6">
        {[55, 0, 35, 70, 60, 45, 20].map((width, index) => (
          <div
            key={index}
            className="h-3 rounded bg-sky-300/20"
            style={{
              width: `${width}%`,
              visibility: width ? "visible" : "hidden",
            }}
          />
        ))}
      </div>

      <div className="h-28 shrink-0 border-t border-white/10 bg-slate-900/70 p-4">
        <div className="h-3 w-28 rounded bg-slate-600/30" />
      </div>

      <div className="h-36 shrink-0 border-t border-white/10 bg-slate-950/90 p-4">
        <div className="h-3 w-20 rounded bg-slate-600/30" />
      </div>
    </div>
  );
}

function LearnTopic() {
  const { topicId } = useParams();
  const [searchParams] = useSearchParams();
  const subjectId = searchParams.get("subject") || "1";
  const contextKey = `${subjectId}:${topicId}`;

  const [topics, setTopics] = useState([]);
  const [topic, setTopic] = useState(null);
  const [loadedContext, setLoadedContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sidebarLoading, setSidebarLoading] = useState(true);
  const [error, setError] = useState("");
  const [sidebarError, setSidebarError] = useState("");
  const [lockedInfo, setLockedInfo] = useState(null);

  const [language, setLanguage] = useState("c");
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [code, setCode] = useState(DEFAULT_CODE.c);
  const [customInput, setCustomInput] = useState("");
  const [output, setOutput] = useState("");

  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [savingProgress, setSavingProgress] = useState(false);
  const [progressError, setProgressError] = useState("");

  const lessonScrollRef = useRef(null);
  const runInFlightRef = useRef(false);
  const progressInFlightRef = useRef(false);
  const currentContextRef = useRef(contextKey);
  const runSequenceRef = useRef(0);
  const progressSequenceRef = useRef(0);

  currentContextRef.current = contextKey;

  const isLocked = lockedInfo !== null;
  const isReady = loadedContext === contextKey && !loading;

  const editorEnabled =
    Number(topic?.editor_enabled) === 1 ||
    topic?.editor_enabled === true;

  const runEnabled =
    Number(topic?.run_enabled) === 1 ||
    topic?.run_enabled === true;

  useEffect(() => {
    const controller = new AbortController();

    async function fetchSidebarTopics() {
      setSidebarLoading(true);
      setSidebarError("");
      setTopics([]);

      try {
        const response = await api.get(
          `/learn/subjects/${subjectId}/topics`,
          { signal: controller.signal },
        );

        if (controller.signal.aborted) return;

        if (!Array.isArray(response.data)) {
          throw new Error("Unexpected topic list response.");
        }

        setTopics(response.data);
      } catch (err) {
        if (controller.signal.aborted) return;

        setSidebarError(
          err.response?.data?.error ||
            err.message ||
            "Failed to load topic list.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setSidebarLoading(false);
        }
      }
    }

    fetchSidebarTopics();

    return () => controller.abort();
  }, [subjectId, topicId]);

  useEffect(() => {
    const controller = new AbortController();

    runSequenceRef.current += 1;
    progressSequenceRef.current += 1;
    runInFlightRef.current = false;
    progressInFlightRef.current = false;

    async function fetchTopic() {
      setLoading(true);
      setError("");
      setLockedInfo(null);
      setTopic(null);
      setLoadedContext(null);
      setOutput("");
      setCustomInput("");
      setCode("");
      setRunning(false);
      setCompleted(false);
      setSavingProgress(false);
      setProgressError("");
      setLanguageMenuOpen(false);

      try {
        const response = await api.get(
          `/learn/topics/${topicId}`,
          { signal: controller.signal },
        );

        if (controller.signal.aborted) return;

        const data = response.data;

        if (
          !data ||
          typeof data !== "object" ||
          Array.isArray(data) ||
          String(data.id) !== String(topicId)
        ) {
          throw new Error("Unexpected topic response.");
        }

        if (String(data.subject_id) !== String(subjectId)) {
          throw new Error(
            "This lesson does not belong to the selected course.",
          );
        }

        const nextLanguage = DEFAULT_CODE[data.default_language]
          ? data.default_language
          : "c";

        setTopic(data);
        setLanguage(nextLanguage);
        setCode(
          typeof data.starter_code === "string" &&
            data.starter_code.trim()
            ? data.starter_code
            : DEFAULT_CODE[nextLanguage],
        );
        setLoadedContext(contextKey);
      } catch (err) {
        if (controller.signal.aborted) return;

        const responseData = err.response?.data;

        if (
          responseData?.code === "LESSON_LOCKED" &&
          [401, 403].includes(err.response?.status)
        ) {
          setLockedInfo({
            message:
              responseData.error ||
              "Complete the previous lesson first to unlock this lesson.",
            prerequisiteId:
              responseData.prerequisite_topic_id ?? null,
            needsLogin: err.response.status === 401,
          });

          setLoadedContext(contextKey);
          return;
        }

        setError(
          responseData?.error ||
            err.message ||
            "Failed to load topic details.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    fetchTopic();

    return () => {
      controller.abort();
      runSequenceRef.current += 1;
      progressSequenceRef.current += 1;
    };
  }, [topicId, subjectId, contextKey]);

  useEffect(() => {
    if (!isReady) return;

    lessonScrollRef.current?.scrollTo({
      top: 0,
      left: 0,
    });
  }, [contextKey, isReady]);

  const topicFlow = useMemo(() => {
    let earlierLessonsComplete = true;

    return topics.map((item) => {
      const isCurrent = String(item.id) === String(topicId);
      const isCompleted =
        Number(item.completed) === 1 ||
        (isCurrent && completed);

      const locked = !earlierLessonsComplete;

      earlierLessonsComplete =
        earlierLessonsComplete && isCompleted;

      return {
        ...item,
        isCompleted,
        isLocked: locked,
      };
    });
  }, [topics, topicId, completed]);

  const currentIndex = topicFlow.findIndex(
    (item) => String(item.id) === String(topicId),
  );

  const currentListTopic =
    currentIndex >= 0 ? topicFlow[currentIndex] : null;

  const previousTopic =
    currentIndex > 0 ? topicFlow[currentIndex - 1] : null;

  const nextTopic =
    currentIndex >= 0 && currentIndex < topicFlow.length - 1
      ? topicFlow[currentIndex + 1]
      : null;

  const topicTitle =
    topic?.title || currentListTopic?.title || "Locked lesson";

  const currentTopicCompleted =
    completed || Boolean(currentListTopic?.isCompleted);

  const prerequisiteTopic = topicFlow.find(
    (item) =>
      String(item.id) === String(lockedInfo?.prerequisiteId),
  );

  const topicUrl = (id) =>
    `/learn/topic/${id}?subject=${encodeURIComponent(subjectId)}`;

  const selectLanguage = (nextLanguage) => {
    if (running || isLocked || !isReady) return;

    setLanguage(nextLanguage);
    setLanguageMenuOpen(false);

    const isDefaultCode = Object.values(DEFAULT_CODE).includes(code);

    if (!code.trim() || isDefaultCode) {
      setCode(DEFAULT_CODE[nextLanguage] || "");
    }
  };

  const handleResetCode = () => {
    if (running || isLocked || !isReady) return;

    const lessonLanguage = DEFAULT_CODE[topic?.default_language]
      ? topic.default_language
      : "c";

    const hasLessonStarter =
      typeof topic?.starter_code === "string" &&
      topic.starter_code.trim();

    setCode(
      language === lessonLanguage && hasLessonStarter
        ? topic.starter_code
        : DEFAULT_CODE[language] || "",
    );

    setOutput("");
  };

  const handleRun = async () => {
    if (
      isLocked ||
      !isReady ||
      runInFlightRef.current
    ) {
      return;
    }

    if (!editorEnabled || !runEnabled) {
      setOutput(
        topic?.editor_message ||
          "Code execution is not available for this subject.",
      );
      return;
    }

    if (!code.trim()) {
      setOutput("Run Error\n\nCode cannot be empty.");
      return;
    }

    const requestContext = contextKey;
    const requestSequence = ++runSequenceRef.current;

    const isCurrentRequest = () =>
      currentContextRef.current === requestContext &&
      runSequenceRef.current === requestSequence;

    runInFlightRef.current = true;
    setRunning(true);
    setLanguageMenuOpen(false);
    setOutput("");

    try {
      const response = await api.post("/submissions/run", {
        language,
        code,
        input: customInput,
      });

      if (!isCurrentRequest()) return;

      const result = response.data;

      setOutput(
        [
          `Execution: ${
            result.execution_status || result.verdict || "Unknown"
          }`,
          "Note: Run executes your code; it does not check the lesson answer.",
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
      if (!isCurrentRequest()) return;

      setOutput(
        `Run Error\n\n${
          err.response?.data?.error ||
          "Unable to execute this code."
        }`,
      );
    } finally {
      if (isCurrentRequest()) {
        runInFlightRef.current = false;
        setRunning(false);
      }
    }
  };

  const handleMarkComplete = async () => {
    if (
      isLocked ||
      !isReady ||
      progressInFlightRef.current ||
      currentTopicCompleted
    ) {
      return;
    }

    const requestContext = contextKey;
    const requestSequence = ++progressSequenceRef.current;

    const isCurrentRequest = () =>
      currentContextRef.current === requestContext &&
      progressSequenceRef.current === requestSequence;

    progressInFlightRef.current = true;
    setSavingProgress(true);
    setProgressError("");

    try {
      const response = await api.post(
        `/learn/topics/${topicId}/complete`,
      );

      if (!isCurrentRequest()) return;

      if (response.data?.completed !== true) {
        throw new Error("The server did not confirm completion.");
      }

      setCompleted(true);

      setTopics((previous) =>
        previous.map((item) =>
          String(item.id) === String(topicId)
            ? { ...item, completed: 1 }
            : item,
        ),
      );
    } catch (err) {
      if (!isCurrentRequest()) return;

      const responseData = err.response?.data;

      if (
        responseData?.code === "LESSON_LOCKED" &&
        [401, 403].includes(err.response?.status)
      ) {
        setLockedInfo({
          message: responseData.error,
          prerequisiteId:
            responseData.prerequisite_topic_id ?? null,
          needsLogin: err.response.status === 401,
        });
        setTopic(null);
        setCode("");
        setOutput("");
      } else {
        setProgressError(
          err.response?.status === 401
            ? "Please log in to save your progress."
            : responseData?.error ||
                err.message ||
                "Failed to save progress.",
        );
      }
    } finally {
      if (isCurrentRequest()) {
        progressInFlightRef.current = false;
        setSavingProgress(false);
      }
    }
  };

  const copyCode = async () => {
    if (isLocked || !isReady) return;

    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Clipboard access may be unavailable.
    }
  };

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-4 text-sm text-rose-200"
      >
        <p>{error}</p>
        <Link
          to="/learn"
          className="mt-3 inline-block font-semibold text-cyan-300"
        >
          Back to Learn Hub
        </Link>
      </div>
    );
  }

  if (!isReady) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm text-cyan-200"
      >
        Loading topic...
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-180px)] min-h-[640px] overflow-hidden rounded-3xl border border-white/10 bg-slate-900/50 shadow-2xl backdrop-blur-xl">
      {/* Topic sidebar */}
      <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-r border-white/10">
        <div className="flex h-28 shrink-0 flex-col justify-center border-b border-white/10 p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-white">
              Topic Flow
            </h3>
            <span className="shrink-0 rounded-full border border-indigo-400/20 bg-indigo-400/10 px-2 py-1 text-[10px] font-semibold text-indigo-200">
              {topics.length} topics
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Complete lessons in order.
          </p>
        </div>

        <nav
          aria-label="Lesson topics"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"
        >
          {sidebarLoading ? (
            <p role="status" className="text-sm text-slate-400">
              Loading topics...
            </p>
          ) : sidebarError ? (
            <p role="alert" className="text-sm text-rose-300">
              {sidebarError}
            </p>
          ) : topicFlow.length === 0 ? (
            <p className="text-sm text-slate-400">
              No topics available.
            </p>
          ) : (
            <div className="grid gap-3">
              {topicFlow.map((item, index) => {
                const isActive =
                  String(item.id) === String(topicId);

                const locked =
                  item.isLocked || (isActive && isLocked);

                return (
                  <Link
                    key={item.id}
                    to={topicUrl(item.id)}
                    aria-current={isActive ? "page" : undefined}
                    title={
                      locked
                        ? "Complete earlier lessons to unlock."
                        : item.title
                    }
                    className={[
                      "flex items-start gap-3 rounded-2xl border p-3 transition",
                      isActive
                        ? "border-cyan-400/40 bg-cyan-400/10 shadow-lg shadow-cyan-500/5"
                        : locked
                          ? "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]"
                          : "border-white/10 bg-white/[0.035] hover:border-indigo-400/30 hover:bg-white/[0.06]",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                        isActive
                          ? "bg-cyan-400/20 text-cyan-200"
                          : locked
                            ? "bg-slate-700/40 text-slate-400"
                            : "bg-indigo-400/15 text-indigo-200",
                      ].join(" ")}
                    >
                      {locked ? (
                        <LockIcon className="h-4 w-4" />
                      ) : (
                        index + 1
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <strong
                        className={[
                          "block text-sm font-semibold",
                          locked ? "text-slate-400" : "text-white",
                        ].join(" ")}
                      >
                        {item.title}
                      </strong>

                      <p className="mt-1 text-xs text-slate-500">
                        {locked
                          ? "Locked"
                          : item.isCompleted
                            ? "Completed"
                            : "Available"}
                      </p>
                    </div>

                    {!locked && item.isCompleted && (
                      <span
                        aria-label="Completed"
                        className="text-sm text-emerald-300"
                      >
                        ✓
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </nav>

        <div className="flex h-[72px] shrink-0 items-center border-t border-white/10 p-3">
          <Link
            to="/learn"
            className="flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
          >
            Back to Learn Hub
          </Link>
        </div>
      </aside>

      {/* Shared lesson/editor workspace */}
      <section className="relative grid min-h-0 min-w-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
        {/* Lesson panel */}
        <article className="flex min-h-0 min-w-0 flex-col overflow-hidden border-b border-white/10 xl:border-b-0 xl:border-r">
          <div className="flex h-28 shrink-0 flex-col justify-center border-b border-white/10 bg-slate-900/70 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="truncate text-xl font-bold text-white">
                  {topicTitle}
                </h1>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Study the lesson, review the examples, and practice
                  the concept in the editor.
                </p>
              </div>

              <span className="shrink-0 rounded-full border border-indigo-400/20 bg-indigo-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-200">
                Chapter {currentIndex >= 0 ? currentIndex + 1 : "—"}
              </span>
            </div>
          </div>

          <div
            ref={lessonScrollRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          >
            {isLocked ? (
              <LockedLessonPlaceholder />
            ) : (
              <div className="px-6 py-5">
                <div className="px-6 py-5">
                  <LessonMarkdown content={topic?.content || ""} />
                  <LessonPracticeProblems
                    key={topicId}
                    topicId={topicId}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex min-h-[72px] shrink-0 flex-col justify-center border-t border-white/10 p-4">
            {progressError && (
              <p role="alert" className="mb-3 text-xs text-rose-300">
                {progressError}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-2">
                {previousTopic && (
                  <Link
                    to={topicUrl(previousTopic.id)}
                    className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/10"
                  >
                    ← Previous
                  </Link>
                )}

                {nextTopic && (
                  <Link
                    to={topicUrl(nextTopic.id)}
                    className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/10"
                  >
                    Next →
                  </Link>
                )}
              </div>

              <button
                type="button"
                onClick={handleMarkComplete}
                disabled={
                  isLocked ||
                  currentTopicCompleted ||
                  savingProgress
                }
                aria-busy={savingProgress}
                className={[
                  "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold text-white transition disabled:cursor-default",
                  currentTopicCompleted && !isLocked
                    ? "bg-emerald-500/80"
                    : "bg-gradient-to-r from-indigo-500 to-cyan-400 enabled:hover:-translate-y-0.5 disabled:opacity-50",
                ].join(" ")}
              >
                {isLocked && <LockIcon className="h-3.5 w-3.5" />}
                {isLocked
                  ? "Locked"
                  : savingProgress
                    ? "Saving..."
                    : currentTopicCompleted
                      ? "Completed ✓"
                      : "Mark Complete"}
              </button>
            </div>
          </div>
        </article>

        {/* Practice editor */}
        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <div className="flex h-28 shrink-0 flex-col justify-center border-b border-white/10 bg-slate-900/70 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Practice Editor
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {isLocked || editorEnabled
                    ? "Write code and run it beside the lesson."
                    : "This subject currently uses lesson-only mode."}
                </p>
              </div>

              <span
                className={[
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-wide",
                  !isLocked && editorEnabled && runEnabled
                    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                    : "border-amber-400/20 bg-amber-400/10 text-amber-300",
                ].join(" ")}
              >
                {isLocked && <LockIcon className="h-3 w-3" />}
                {isLocked
                  ? "Locked"
                  : editorEnabled && runEnabled
                    ? "Live Runner"
                    : "Lesson Mode"}
              </span>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
            {isLocked ? (
              <LockedEditorPlaceholder />
            ) : (
              <>
                {editorEnabled ? (
                  <>
                    {/* Editor toolbar */}
                    <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/10 bg-slate-900/80 px-4">
                      <div className="relative">
                        <button
                          type="button"
                          disabled={running}
                          aria-expanded={languageMenuOpen}
                          onClick={() =>
                            setLanguageMenuOpen((value) => !value)
                          }
                          className="flex min-w-[110px] items-center justify-between gap-4 rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-indigo-400/60 hover:bg-slate-800 disabled:opacity-50"
                        >
                          <span>
                            {
                              LANGUAGE_OPTIONS.find(
                                (item) => item.value === language,
                              )?.label
                            }
                          </span>
                          <span
                            aria-hidden="true"
                            className="text-slate-400"
                          >
                            {languageMenuOpen ? "⌃" : "⌄"}
                          </span>
                        </button>

                        {languageMenuOpen && (
                          <>
                            <button
                              type="button"
                              aria-label="Close language menu"
                              className="fixed inset-0 z-30 cursor-default"
                              onClick={() =>
                                setLanguageMenuOpen(false)
                              }
                            />
                            <div className="absolute left-0 top-full z-40 mt-2 min-w-[150px] overflow-hidden rounded-xl border border-white/10 bg-slate-900 p-1.5 shadow-2xl">
                              {LANGUAGE_OPTIONS.map((item) => {
                                const selected =
                                  item.value === language;

                                return (
                                  <button
                                    key={item.value}
                                    type="button"
                                    onClick={() =>
                                      selectLanguage(item.value)
                                    }
                                    className={[
                                      "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition",
                                      selected
                                        ? "bg-indigo-500/20 text-indigo-200"
                                        : "text-slate-300 hover:bg-white/10 hover:text-white",
                                    ].join(" ")}
                                  >
                                    <span>{item.label}</span>
                                    {selected && (
                                      <span className="text-cyan-300">
                                        ✓
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleResetCode}
                          disabled={running}
                          aria-label="Reset code"
                          title="Reset code"
                          className="rounded-xl border border-white/10 bg-white/[0.05] p-2 text-xs text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                        >
                          ↻
                        </button>
                        <button
                          type="button"
                          onClick={copyCode}
                          aria-label="Copy code"
                          title="Copy code"
                          className="rounded-xl border border-white/10 bg-white/[0.05] p-2 text-xs text-slate-400 transition hover:bg-white/10 hover:text-white"
                        >
                          ⧉
                        </button>
                      </div>
                    </div>

                    {/* Monaco editor */}
                    <div className="relative min-h-[240px] min-w-0 flex-1 overflow-hidden bg-[#080d1d]">
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
                          ariaLabel: "Practice code editor",
                          fontSize: 14,
                          fontFamily:
                            "Consolas, 'Courier New', monospace",
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
                          readOnly: running,
                          formatOnPaste: false,
                          formatOnType: false,
                        }}
                      />
                    </div>

                    {/* Custom input */}
                    <div className="shrink-0 border-t border-white/10 bg-slate-900/75">
                      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                          Custom Input
                        </span>
                        <button
                          type="button"
                          disabled={running}
                          onClick={() => setCustomInput("")}
                          className="text-[11px] text-slate-500 transition hover:text-slate-200 disabled:opacity-50"
                        >
                          Clear
                        </button>
                      </div>

                      <textarea
                        value={customInput}
                        onChange={(event) =>
                          setCustomInput(event.target.value)
                        }
                        disabled={running}
                        rows={3}
                        spellCheck="false"
                        aria-label="Custom input"
                        placeholder="Enter input for your program..."
                        className="block w-full resize-none bg-transparent px-4 py-3 font-mono text-xs leading-5 text-slate-300 outline-none placeholder:text-slate-600 disabled:opacity-60"
                      />
                    </div>

                    {/* Run button */}
                    <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 bg-slate-900/80 px-4 py-3">
                      <span className="text-xs text-slate-500">
                        {!runEnabled
                          ? "Execution is disabled for this subject."
                          : running
                            ? "Executing code..."
                            : "Ready to run"}
                      </span>

                      <button
                        type="button"
                        onClick={handleRun}
                        disabled={!runEnabled || running}
                        className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-400 px-5 py-2.5 text-xs font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span aria-hidden="true">▶</span>
                        {!runEnabled
                          ? "Run Unavailable"
                          : running
                            ? "Running..."
                            : "Run Code"}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex min-h-[240px] flex-1 items-center justify-center bg-[#080d1d] p-6">
                    <div className="max-w-md rounded-3xl border border-amber-400/20 bg-amber-400/10 p-6 text-center">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-400/15 text-amber-200">
                        <LockIcon className="h-6 w-6" />
                      </div>

                      <h3 className="mt-4 text-lg font-semibold text-amber-100">
                        Practice editor unavailable
                      </h3>

                      <p className="mt-3 text-sm leading-6 text-amber-100/70">
                        {topic?.editor_message ||
                          "This subject is currently available as a lesson and curated resources."}
                      </p>

                      <p className="mt-4 text-xs leading-5 text-slate-400">
                        Unsupported tools remain disabled rather than
                        producing unreliable execution results.
                      </p>
                    </div>
                  </div>
                )}

                {/* Output */}
                <div className="shrink-0 overflow-hidden border-t border-white/10 bg-slate-950/90">
                  <div className="border-b border-white/10 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-300">
                    Output
                  </div>
                  <pre
                    role="status"
                    aria-live="polite"
                    className="h-[150px] overflow-y-auto overscroll-contain whitespace-pre-wrap break-words px-4 py-3 font-mono text-xs leading-5 text-slate-200"
                  >
                    {running
                      ? "Executing code..."
                      : output ||
                        (editorEnabled
                          ? "Run your code to see the output here."
                          : topic?.editor_message ||
                            "No code execution is available for this subject.")}
                  </pre>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Shared locked overlay: sidebar and headers stay visible */}
        {isLocked && (
          <div className="absolute inset-x-0 bottom-[72px] top-28 z-20 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-6 backdrop-blur-sm">
            <div
              role="status"
              className="w-full max-w-md rounded-2xl border border-white/15 bg-slate-900/95 p-7 text-center shadow-2xl"
            >
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-amber-300/20 bg-amber-300/10 text-amber-200">
                <LockIcon className="h-8 w-8" />
              </div>

              <h2 className="mt-5 text-xl font-semibold text-white">
                Lesson locked
              </h2>

              <p className="mt-3 text-sm leading-6 text-slate-300">
                Complete the previous lesson first to unlock this
                lesson.
              </p>

              {prerequisiteTopic && (
                <p className="mt-2 text-xs leading-5 text-slate-400">
                  Next required lesson: {prerequisiteTopic.title}
                </p>
              )}

              {lockedInfo.needsLogin && (
                <p className="mt-2 text-xs leading-5 text-amber-200">
                  Log in to save your progress and unlock lessons.
                </p>
              )}

              <div className="mt-6 flex flex-wrap justify-center gap-3">
                {lockedInfo.prerequisiteId && (
                  <Link
                    to={topicUrl(lockedInfo.prerequisiteId)}
                    className="rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-400 px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                  >
                    Go to required lesson
                  </Link>
                )}

                {lockedInfo.needsLogin && (
                  <Link
                    to="/login"
                    className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
                  >
                    Log in
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default LearnTopic;