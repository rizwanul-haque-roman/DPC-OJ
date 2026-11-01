import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import "../components/ProfileDashboard.css";

const BASE = "/admin/problems";

function blankProblem() {
  return {
    title: "",
    statement: "",
    input_format: "",
    output_format: "",
    constraints: "",
    difficulty: "easy",
    time_limit_ms: 1000,
    memory_limit_kb: 262144,
    subject_id: "",
    is_public: false,
    test_cases: [],
  };
}

function blankCase() {
  return {
    input: "",
    expected_output: "",
    is_sample: false,
  };
}

function errorMessage(error) {
  return error.response?.data?.error || error.message || "Request failed.";
}

export default function AdminProblems() {
  const [searchParams, setSearchParams] = useSearchParams();

  const pageRef = useRef(null);
  const pageTopRef = useRef(null);
  const scrollOwnerRef = useRef(null);
  const problemListRef = useRef(null);

  const [problems, setProblems] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [form, setForm] = useState(blankProblem);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  const [formOpen, setFormOpen] = useState(false);
  const [hasEditor, setHasEditor] = useState(false);
  const [problemPage, setProblemPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useLayoutEffect(() => {
    const page = pageRef.current;
    if (!page) return;

    let owner = page.parentElement;

    while (
      owner &&
      owner !== document.body &&
      owner !== document.documentElement
    ) {
      if (/^(auto|scroll|overlay)$/.test(getComputedStyle(owner).overflowY)) {
        break;
      }
      owner = owner.parentElement;
    }

    if (
      !owner ||
      owner === document.body ||
      owner === document.documentElement
    ) {
      owner = page;
    }

    scrollOwnerRef.current = owner;

    const originals = new Map();

    function setStyle(element, property, value) {
      if (!originals.has(element)) originals.set(element, new Map());

      const properties = originals.get(element);

      if (!properties.has(property)) {
        properties.set(property, [
          element.style.getPropertyValue(property),
          element.style.getPropertyPriority(property),
        ]);
      }

      element.style.setProperty(property, value);
    }

    for (
      let ancestor = owner.parentElement;
      ancestor;
      ancestor = ancestor.parentElement
    ) {
      ancestor.scrollTop = 0;
      setStyle(ancestor, "overflow-y", "hidden");
    }

    setStyle(owner, "overflow-y", "auto");
    setStyle(owner, "min-height", "0px");
    setStyle(owner, "box-sizing", "border-box");

    function fitScrollOwner() {
      const top = Math.max(0, owner.getBoundingClientRect().top);
      const viewportHeight = document.documentElement.clientHeight;

      setStyle(owner, "height", `${Math.max(0, viewportHeight - top)}px`);
    }

    fitScrollOwner();
    window.addEventListener("resize", fitScrollOwner);

    const observer = new ResizeObserver(fitScrollOwner);

    if (owner.parentElement) observer.observe(owner.parentElement);

    return () => {
      window.removeEventListener("resize", fitScrollOwner);
      observer.disconnect();

      for (const [element, properties] of originals) {
        for (const [property, [value, priority]] of properties) {
          if (value) {
            element.style.setProperty(property, value, priority);
          } else {
            element.style.removeProperty(property);
          }
        }
      }

      scrollOwnerRef.current = null;
    };
  }, []);

  function scrollToPageTop() {
    requestAnimationFrame(() => {
      pageTopRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
        inline: "nearest",
      });
    });
  }

  async function refreshProblems() {
    const { data } = await api.get(BASE);

    if (!Array.isArray(data)) {
      throw new Error("Unexpected problem list response.");
    }

    setProblems(data);
  }

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [problemResponse, subjectResponse] = await Promise.all([
          api.get(BASE),
          api.get("/problems/meta/subjects"),
        ]);

        if (!active) return;

        if (
          !Array.isArray(problemResponse.data) ||
          !Array.isArray(subjectResponse.data)
        ) {
          throw new Error("Unexpected problem or subject list response.");
        }

        setProblems(problemResponse.data);
        setSubjects(subjectResponse.data);
      } catch (err) {
        if (active) setError(errorMessage(err));
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  function updateField(event) {
    const { name, value, type, checked } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function updateCase(index, field, value) {
    setForm((previous) => ({
      ...previous,
      test_cases: previous.test_cases.map((tc, position) =>
        position === index ? { ...tc, [field]: value } : tc,
      ),
    }));
  }

  function addCase() {
    setForm((previous) => {
      if (previous.test_cases.length >= 200) return previous;

      return {
        ...previous,
        test_cases: [...previous.test_cases, blankCase()],
      };
    });
  }

  function removeCase(index) {
    setForm((previous) => ({
      ...previous,
      test_cases: previous.test_cases.filter(
        (_, position) => position !== index,
      ),
    }));
  }

  function startNew() {
    if (busy || loading) return;

    if (
      hasEditor &&
      !window.confirm("Discard the current form and start a new problem?")
    ) {
      return;
    }

    setEditingId(null);
    setForm(blankProblem());
    setFormOpen(true);
    setHasEditor(true);
    setError("");
    setMessage("");
    scrollToPageTop();
  }

  function closeEditor() {
    if (busy) return;
    setFormOpen(false);
  }

  function resumeEditor() {
    if (busy || loading) return;
    setFormOpen(true);
    scrollToPageTop();
  }

  function changeProblemPage(nextPage) {
    setProblemPage(nextPage);

    requestAnimationFrame(() => {
      problemListRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
        inline: "nearest",
      });
    });
  }

  async function deleteProblem(problem) {
    if (busy || deletingId !== null) return;

    const confirmed = window.confirm(
      `Permanently delete problem #${problem.id}: "${problem.title}"?\n\n` +
        "Its test cases will also be deleted.\n\n" +
        "Deletion is allowed only if the problem:\n" +
        "• Has no submissions.\n" +
        "• Has never been used in a contest.\n" +
        "• Is not attached to any learning lesson.\n\n" +
        "This action cannot be undone.",
    );

    if (!confirmed) return;

    setDeletingId(problem.id);
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const { data } = await api.delete(`${BASE}/${problem.id}`);

      setProblems((previous) =>
        previous.filter(
          (item) => Number(item.id) !== Number(problem.id),
        ),
      );

      if (Number(editingId) === Number(problem.id)) {
        setEditingId(null);
        setForm(blankProblem());
        setFormOpen(false);
        setHasEditor(false);
      }

      setMessage(data.message || "Problem deleted.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDeletingId(null);
      setBusy(false);
      scrollToPageTop();
    }
  }

  const editProblem = useCallback(async (id, confirmLoad = true) => {
    if (
      confirmLoad &&
      !window.confirm("Load this problem? Unsaved form changes will be lost.")
    ) {
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const { data } = await api.get(`${BASE}/${id}`);

      setEditingId(data.id);
      setFormOpen(true);
      setHasEditor(true);

      setForm({
        title: data.title ?? "",
        statement: data.statement ?? "",
        input_format: data.input_format ?? "",
        output_format: data.output_format ?? "",
        constraints: data.constraints ?? "",
        difficulty: String(data.difficulty ?? "easy")
          .trim()
          .toLowerCase(),
        time_limit_ms: data.time_limit_ms,
        memory_limit_kb: data.memory_limit_kb,
        subject_id: data.subject_id ?? "",
        is_public: Number(data.is_public) === 1,
        test_cases: (data.test_cases || []).map((tc) => ({
          input: tc.input,
          expected_output: tc.expected_output,
          is_sample: Number(tc.is_sample) === 1,
        })),
      });

      requestAnimationFrame(() => {
        scrollOwnerRef.current?.scrollTo({
          top: 0,
          behavior: "smooth",
        });
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const requestedId = searchParams.get("edit");
    if (requestedId === null || loading) return;

    const problemId = /^[1-9]\d*$/.test(requestedId)
      ? Number(requestedId)
      : null;

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("edit");

    setSearchParams(nextParams, { replace: true });

    if (Number.isSafeInteger(problemId)) {
      async function loadRequestedProblem() {
        await Promise.resolve();
        await editProblem(problemId, false);
      }

      void loadRequestedProblem();
    }
  }, [editProblem, loading, searchParams, setSearchParams]);

  async function importCases(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError("");
    setMessage("");

    try {
      if (!file.name.toLowerCase().endsWith(".json")) {
        throw new Error("Choose a .json file.");
      }

      if (file.size > 2 * 1024 * 1024) {
        throw new Error("The JSON file must be at most 2 MB.");
      }

      const parsed = JSON.parse(await file.text());
      const cases = Array.isArray(parsed) ? parsed : parsed?.test_cases;

      if (!Array.isArray(cases) || cases.length === 0) {
        throw new Error("The file must contain a non-empty test-case array.");
      }

      if (cases.length + form.test_cases.length > 200) {
        throw new Error("A problem can contain at most 200 test cases.");
      }

      const normalized = cases.map((tc, index) => {
        if (
          !tc ||
          typeof tc.input !== "string" ||
          typeof tc.expected_output !== "string" ||
          (tc.is_sample !== undefined && typeof tc.is_sample !== "boolean")
        ) {
          throw new Error(`Invalid test case at position ${index + 1}.`);
        }

        return {
          input: tc.input,
          expected_output: tc.expected_output,
          is_sample: tc.is_sample ?? false,
        };
      });

      setForm((previous) => ({
        ...previous,
        test_cases: [...previous.test_cases, ...normalized],
      }));

      setMessage(
        `${normalized.length} test cases imported. Save the problem to store them.`,
      );
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function saveProblem(event) {
    event.preventDefault();
    if (busy || loading) return;

    setError("");
    setMessage("");

    const payload = {
      ...form,
      subject_id: form.subject_id === "" ? null : Number(form.subject_id),
      time_limit_ms: Number(form.time_limit_ms),
      memory_limit_kb: Number(form.memory_limit_kb),
    };

    if (payload.is_public) {
      const hasSample = payload.test_cases.some((tc) => tc.is_sample);
      const hasHidden = payload.test_cases.some((tc) => !tc.is_sample);

      if (!hasSample || !hasHidden) {
        setError(
          "Publishing requires at least one sample and one hidden test case.",
        );
        scrollToPageTop();
        return;
      }
    }

    setBusy(true);

    try {
      const response = editingId
        ? await api.put(`${BASE}/${editingId}`, payload)
        : await api.post(BASE, payload);

      setEditingId(response.data.id);
      setMessage(response.data.message || "Problem saved.");

      try {
        await refreshProblems();
      } catch {
        setError(
          "The problem was saved, but the problem list could not refresh. Reload the page.",
        );
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      scrollToPageTop();
    }
  }

  const sampleCount = form.test_cases.filter((tc) => tc.is_sample).length;
  const hiddenCount = form.test_cases.length - sampleCount;

  const totalProblems = problems.length;
  const totalPages = Math.max(1, Math.ceil(totalProblems / pageSize));
  const currentProblemPage = Math.min(
    Math.max(1, problemPage),
    totalPages,
  );
  const firstProblemIndex = (currentProblemPage - 1) * pageSize;
  const paginatedProblems = problems.slice(
    firstProblemIndex,
    firstProblemIndex + pageSize,
  );

  return (
    <div ref={pageRef} className="pd-stack">
      <div className="pd-row" ref={pageTopRef}>
        <div>
          <h1 className="pd-title" style={{ fontSize: "1.5rem" }}>
            Problem Management
          </h1>
          <p className="pd-note">
            Create problems, manage tests, and control publication.
          </p>
        </div>

        <div className="pd-row" style={{ gap: 10 }}>
          {!formOpen && hasEditor && (
            <button
              type="button"
              onClick={resumeEditor}
              disabled={busy || loading}
              className="pd-button"
              aria-controls="problem-editor"
              aria-expanded={formOpen}
            >
              {editingId
                ? `Resume editing #${editingId}`
                : "Resume form"}
            </button>
          )}

          {formOpen && (
            <button
              type="button"
              onClick={closeEditor}
              disabled={busy || loading}
              className="pd-button"
              aria-controls="problem-editor"
              aria-expanded={formOpen}
            >
              Hide form ↑
            </button>
          )}

          <button
            type="button"
            onClick={startNew}
            disabled={busy || loading}
            className="pd-button"
            aria-controls="problem-editor"
            aria-expanded={formOpen}
          >
            Add new problem ↓
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="pd-error">
          {error}
        </p>
      )}

      {message && (
        <p
          role="status"
          className="pd-note"
          style={{
            color: "#34d399",
            padding: 12,
            border: "1px solid #05966933",
            backgroundColor: "#064e3b1a",
            borderRadius: 6,
          }}
        >
          {message}
        </p>
      )}

      <form
        id="problem-editor"
        onSubmit={saveProblem}
        className="pd-panel"
        hidden={!formOpen}
        style={{ display: formOpen ? "block" : "none" }}
      >
        <fieldset
          disabled={busy || loading}
          style={{
            border: "none",
            padding: 0,
            margin: 0,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <h2 className="pd-title">
            {editingId ? `Edit problem #${editingId}` : "Create a problem"}
          </h2>

          <label style={{ display: "block" }}>
            <div className="pd-note" style={{ marginBottom: 6 }}>
              Title
            </div>
            <input
              name="title"
              value={form.title}
              onChange={updateField}
              maxLength={200}
              required
              className="pd-input"
            />
          </label>

          <div
            className="pd-row"
            style={{ alignItems: "flex-start", gap: 16 }}
          >
            <label style={{ flex: "1 1 200px" }}>
              <div className="pd-note" style={{ marginBottom: 6 }}>
                Subject
              </div>
              <select
                name="subject_id"
                value={form.subject_id}
                onChange={updateField}
                className="pd-input"
              >
                <option value="">No subject</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    Semester {subject.semester_no} — {subject.name}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ flex: "1 1 200px" }}>
              <div className="pd-note" style={{ marginBottom: 6 }}>
                Difficulty
              </div>
              <select
                name="difficulty"
                value={form.difficulty}
                onChange={updateField}
                className="pd-input"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </label>

            <label style={{ flex: "1 1 200px" }}>
              <div className="pd-note" style={{ marginBottom: 6 }}>
                Time limit (milliseconds)
              </div>
              <input
                type="number"
                name="time_limit_ms"
                value={form.time_limit_ms}
                onChange={updateField}
                min="1"
                max="60000"
                step="1"
                required
                className="pd-input"
              />
            </label>

            <label style={{ flex: "1 1 200px" }}>
              <div className="pd-note" style={{ marginBottom: 6 }}>
                Memory limit (KB)
              </div>
              <input
                type="number"
                name="memory_limit_kb"
                value={form.memory_limit_kb}
                onChange={updateField}
                min="1"
                max="1048576"
                step="1"
                required
                className="pd-input"
              />
            </label>
          </div>

          {[
            ["statement", "Problem statement", 8],
            ["input_format", "Input format", 4],
            ["output_format", "Output format", 4],
            ["constraints", "Constraints", 4],
          ].map(([name, label, rows]) => (
            <label key={name} style={{ display: "block", marginTop: 8 }}>
              <div className="pd-note" style={{ marginBottom: 6 }}>
                {label}
              </div>
              <textarea
                name={name}
                value={form[name]}
                onChange={updateField}
                rows={rows}
                required={name === "statement"}
                className="pd-input"
                style={{ fontFamily: "inherit" }}
              />
            </label>
          ))}

          <div
            style={{
              marginTop: 24,
              paddingTop: 24,
              borderTop: "1px solid #ffffff0a",
            }}
          >
            <div className="pd-row">
              <div>
                <h3 className="pd-title">Test cases</h3>
                <p className="pd-note" style={{ marginTop: 4 }}>
                  {sampleCount} sample · {hiddenCount} hidden
                </p>
              </div>

              <div className="pd-row" style={{ gap: 12 }}>
                <button
                  type="button"
                  onClick={addCase}
                  disabled={form.test_cases.length >= 200}
                  className="pd-button"
                >
                  Add test case
                </button>

                <label
                  className="pd-button"
                  style={{
                    position: "relative",
                    overflow: "hidden",
                    cursor: "pointer",
                  }}
                >
                  <span>Import JSON</span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={importCases}
                    aria-label="Import test cases from a JSON file"
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "100%",
                      opacity: 0,
                      cursor: "pointer",
                    }}
                  />
                </label>
              </div>
            </div>

            <p
              className="pd-note"
              style={{ marginTop: 8, marginBottom: 16 }}
            >
              Imported cases are appended. Sample cases are visible to users;
              hidden cases must remain server-side.
            </p>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              {form.test_cases.map((tc, index) => (
                <div
                  key={index}
                  className="pd-panel"
                  style={{
                    padding: 16,
                    backgroundColor: "#ffffff05",
                    border: "1px solid #ffffff0a",
                  }}
                >
                  <div className="pd-row">
                    <h4
                      style={{
                        margin: 0,
                        fontSize: 14,
                        color: "#e2e8f0",
                      }}
                    >
                      Test case {index + 1}
                    </h4>

                    <button
                      type="button"
                      onClick={() => removeCase(index)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#f87171",
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      Remove
                    </button>
                  </div>

                  <div
                    className="pd-row"
                    style={{
                      alignItems: "flex-start",
                      marginTop: 12,
                      gap: 16,
                    }}
                  >
                    <label style={{ flex: "1 1 250px", minWidth: 0 }}>
                      <div className="pd-note" style={{ marginBottom: 6 }}>
                        Input
                      </div>
                      <textarea
                        value={tc.input}
                        onChange={(event) =>
                          updateCase(index, "input", event.target.value)
                        }
                        rows={5}
                        spellCheck={false}
                        className="pd-input"
                        style={{ fontFamily: "monospace", fontSize: 13 }}
                      />
                    </label>

                    <label style={{ flex: "1 1 250px", minWidth: 0 }}>
                      <div className="pd-note" style={{ marginBottom: 6 }}>
                        Expected output
                      </div>
                      <textarea
                        value={tc.expected_output}
                        onChange={(event) =>
                          updateCase(
                            index,
                            "expected_output",
                            event.target.value,
                          )
                        }
                        rows={5}
                        spellCheck={false}
                        className="pd-input"
                        style={{ fontFamily: "monospace", fontSize: 13 }}
                      />
                    </label>
                  </div>

                  <label
                    className="pd-row"
                    style={{
                      justifyContent: "flex-start",
                      gap: 8,
                      marginTop: 12,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={tc.is_sample}
                      onChange={(event) =>
                        updateCase(index, "is_sample", event.target.checked)
                      }
                    />
                    <span className="pd-note">Visible sample case</span>
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div
            className="pd-row"
            style={{
              marginTop: 24,
              paddingTop: 24,
              borderTop: "1px solid #ffffff0a",
            }}
          >
            <label
              className="pd-row"
              style={{
                justifyContent: "flex-start",
                gap: 8,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                name="is_public"
                checked={form.is_public}
                onChange={updateField}
              />
              <span className="pd-note">
                Published — visible in the public problem archive
              </span>
            </label>

            <div className="pd-row" style={{ gap: 10 }}>
              <button
                type="button"
                onClick={closeEditor}
                disabled={busy || loading}
                className="pd-button"
              >
                Hide form
              </button>

              <button
                type="submit"
                disabled={busy || loading}
                className="pd-button"
                style={{
                  backgroundColor: "#3b82f6",
                  color: "#fff",
                  border: "none",
                }}
              >
                {busy ? "Saving..." : "Save problem"}
              </button>
            </div>
          </div>
        </fieldset>
      </form>

      <section
        ref={problemListRef}
        className="pd-panel"
        style={{ marginTop: 24, scrollMarginTop: 16 }}
      >
        <div className="pd-row" style={{ marginBottom: 16 }}>
          <div>
            <h2 className="pd-title">Existing problems</h2>

            {!loading && (
              <p className="pd-note" style={{ marginTop: 4 }}>
                {totalProblems === 0
                  ? "No problems"
                  : `Showing ${firstProblemIndex + 1}–${Math.min(
                      firstProblemIndex + pageSize,
                      totalProblems,
                    )} of ${totalProblems} problems`}
              </p>
            )}
          </div>

          <label
            className="pd-note"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            Rows per page
            <select
              className="pd-input"
              style={{ width: 85 }}
              value={pageSize}
              disabled={loading || busy}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setProblemPage(1);
              }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </label>
        </div>

        {loading ? (
          <p role="status" className="pd-note">
            Loading problems...
          </p>
        ) : totalProblems === 0 ? (
          <p className="pd-note">No problems found.</p>
        ) : (
          <>
            <div className="pd-table-wrap">
              <table className="pd-table">
                <thead>
                  <tr>
                    <th scope="col">ID</th>
                    <th scope="col">Problem</th>
                    <th scope="col">Subject</th>
                    <th scope="col">Status</th>
                    <th scope="col">Tests</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {paginatedProblems.map((problem) => (
                    <tr key={problem.id}>
                      <td>{problem.id}</td>

                      <td>
                        <div>{problem.title}</div>
                        <div className="pd-note" style={{ marginTop: 4 }}>
                          {problem.difficulty}
                        </div>
                      </td>

                      <td>{problem.subject_name || "—"}</td>

                      <td>
                        {Number(problem.is_public) === 1
                          ? "Published"
                          : "Draft"}
                      </td>

                      <td>{problem.test_case_count}</td>

                      <td>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            whiteSpace: "nowrap",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => editProblem(problem.id)}
                            disabled={busy || loading}
                            style={{
                              background: "none",
                              border: "none",
                              color: "#60a5fa",
                              cursor: busy ? "not-allowed" : "pointer",
                            }}
                          >
                            Edit
                          </button>

                          {Number(problem.is_public) === 1 && (
                            <Link
                              to={`/problems/${problem.id}`}
                              className="pd-link"
                            >
                              View
                            </Link>
                          )}

                          <button
                            type="button"
                            onClick={() => deleteProblem(problem)}
                            disabled={
                              busy || loading || deletingId !== null
                            }
                            style={{
                              background: "none",
                              border: "none",
                              color: "#f87171",
                              cursor: busy ? "not-allowed" : "pointer",
                            }}
                          >
                            {deletingId === problem.id
                              ? "Deleting..."
                              : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <nav
              className="pd-row"
              aria-label="Problem list pagination"
              style={{
                marginTop: 18,
                paddingTop: 16,
                borderTop: "1px solid #ffffff0a",
              }}
            >
              <span className="pd-note" aria-live="polite">
                Page {currentProblemPage} of {totalPages}
              </span>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <button
                  type="button"
                  className="pd-button"
                  disabled={busy || currentProblemPage <= 1}
                  onClick={() => changeProblemPage(1)}
                >
                  First
                </button>

                <button
                  type="button"
                  className="pd-button"
                  disabled={busy || currentProblemPage <= 1}
                  onClick={() =>
                    changeProblemPage(currentProblemPage - 1)
                  }
                >
                  Previous
                </button>

                <button
                  type="button"
                  className="pd-button"
                  disabled={busy || currentProblemPage >= totalPages}
                  onClick={() =>
                    changeProblemPage(currentProblemPage + 1)
                  }
                >
                  Next
                </button>

                <button
                  type="button"
                  className="pd-button"
                  disabled={busy || currentProblemPage >= totalPages}
                  onClick={() => changeProblemPage(totalPages)}
                >
                  Last
                </button>
              </div>
            </nav>
          </>
        )}
      </section>
    </div>
  );
}