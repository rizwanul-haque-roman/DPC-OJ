import { useEffect, useState } from "react";
import api from "../api/axios";
import AdminPageHeader from "../components/AdminPageHeader";
import "../components/ProfileDashboard.css";

const initialFilters = {
  search: "",
  action: "",
  category: "",
  admin_id: "",
  target_type: "",
  target_id: "",
  outcome: "",
  from: "",
  to: "",
  sort: "newest",
  page_size: "10",
};

function readable(value) {
  return value ? String(value).replaceAll("_", " ") : "Not recorded";
}

function timestamp(value) {
  if (!value) return "Not recorded";

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "Invalid timestamp";
  }

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    timeZoneName: "short",
  });
}

function Outcome({ value }) {
  const color =
    {
      success: "#6ee7b7",
      failure: "#fda4af",
      denied: "#fcd34d",
    }[value] || "#94a3b8";

  return (
    <span
      style={{
        display: "inline-block",
        color,
        border: `1px solid ${color}55`,
        borderRadius: 999,
        padding: "4px 9px",
        fontSize: 11,
        textTransform: "capitalize",
        whiteSpace: "nowrap",
      }}
    >
      {value || "Not recorded"}
    </span>
  );
}

function JsonValue({ value }) {
  return (
    <pre
      style={{
        marginTop: 10,
        padding: 16,
        borderRadius: 12,
        background: "#020617aa",
        color: "#a5f3fc",
        fontSize: 12,
        lineHeight: 1.7,
        overflow: "auto",
        maxHeight: 360,
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
      }}
    >
      {value === null || value === undefined
        ? "Not recorded"
        : JSON.stringify(value, null, 2)}
    </pre>
  );
}

function FilterField({ label, children }) {
  return (
    <label className="pd-label">
      {label}
      {children}
    </label>
  );
}

export default function AdminAuditLogs() {
  const [draft, setDraft] = useState({ ...initialFilters });
  const [query, setQuery] = useState({
    page: "1",
    page_size: "10",
    sort: "newest",
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedId, setSelectedId] = useState(null);
  const [event, setEvent] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError("");
    setData(null);

    async function load() {
      try {
        const response = await api.get("/admin/audit-logs", {
          signal: controller.signal,
          params: query,
        });

        if (controller.signal.aborted) return;

        if (
          !Array.isArray(response.data?.items) ||
          !response.data?.pagination
        ) {
          throw new Error("Unexpected audit-list response.");
        }

        setData(response.data);
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(
            e.response?.data?.error ||
              e.message ||
              "Unable to load audit logs.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    load();

    return () => controller.abort();
  }, [query]);

  useEffect(() => {
    if (selectedId === null) return;

    const controller = new AbortController();

    setEvent(null);
    setDetailError("");
    setDetailLoading(true);

    async function load() {
      try {
        const response = await api.get(`/admin/audit-logs/${selectedId}`, {
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          setEvent(response.data);
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          setDetailError(
            e.response?.data?.error || "Unable to load audit event.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setDetailLoading(false);
        }
      }
    }

    load();

    return () => controller.abort();
  }, [selectedId]);

  function updateDraft(e) {
    const { name, value } = e.target;

    setDraft((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  function applyFilters(e) {
    e.preventDefault();

    try {
      const params = {
        page: "1",
        page_size: draft.page_size,
        sort: draft.sort,
      };

      for (const key of [
        "search",
        "action",
        "category",
        "admin_id",
        "target_type",
        "target_id",
        "outcome",
      ]) {
        const value = draft[key].trim();

        if (value) {
          params[key] = value;
        }
      }

      for (const key of ["from", "to"]) {
        if (!draft[key]) continue;

        const date = new Date(draft[key]);

        if (!Number.isFinite(date.getTime())) {
          throw new Error(`Select a valid ${key} date.`);
        }

        params[key] = date.toISOString();
      }

      if (
        params.from &&
        params.to &&
        Date.parse(params.from) > Date.parse(params.to)
      ) {
        throw new Error("The start date must not be later than the end date.");
      }

      setSelectedId(null);
      setError("");
      setQuery(params);
    } catch (e) {
      setError(e.message);
    }
  }

  function resetFilters() {
    setDraft({ ...initialFilters });
    setSelectedId(null);
    setQuery({
      page: "1",
      page_size: initialFilters.page_size,
      sort: initialFilters.sort,
    });
  }

  const pagination = data?.pagination;
  const rows = data?.items || [];

  const detailFields = event
    ? [
        ["Event ID", event.id],
        ["Full timestamp", timestamp(event.created_at)],
        ["Administrator ID", event.admin_id],
        ["Administrator name", event.admin_name],
        ["Administrator email", event.admin_email],
        ["Action", event.action],
        ["Category", readable(event.category)],
        ["Target type", event.target_type],
        ["Target ID", event.target_id],
        ["Outcome", event.outcome],
        ["Description", event.description],
        ["Reason", event.reason],
        ["IP address", event.ip_address],
        ["User agent", event.user_agent],
        ["Request ID", event.request_id],
      ]
    : [];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Administrative Audit Logs"
        description="Search administrative actions and inspect recorded changes. Historical events cannot be edited or deleted through this page."
      />

      <form className="pd-panel" onSubmit={applyFilters}>
        <h2 className="pd-title">Search and filters</h2>

        <div
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
          style={{ marginTop: 18 }}
        >
          <FilterField label="Search">
            <input
              className="pd-input"
              name="search"
              value={draft.search}
              onChange={updateDraft}
              maxLength={150}
              placeholder="Administrator, action, description, or ID"
            />
          </FilterField>

          <FilterField label="Action identifier">
            <input
              className="pd-input"
              name="action"
              value={draft.action}
              onChange={updateDraft}
              maxLength={100}
              placeholder="Example: contest_problem_added"
            />
          </FilterField>

          <FilterField label="Category">
            <select
              className="pd-input"
              name="category"
              value={draft.category}
              onChange={updateDraft}
            >
              <option value="">All categories</option>
              <option value="user_management">User management</option>
              <option value="problem_management">Problem management</option>
              <option value="test_case_management">Test-case management</option>
              <option value="contest_management">Contest management</option>
              <option value="security">Security</option>
              <option value="uncategorized">Uncategorized / historical</option>
            </select>
          </FilterField>

          <FilterField label="Administrator ID">
            <input
              className="pd-input"
              name="admin_id"
              value={draft.admin_id}
              onChange={updateDraft}
              inputMode="numeric"
              pattern="[1-9][0-9]*"
              placeholder="Example: 56"
            />
          </FilterField>

          <FilterField label="Target type">
            <input
              className="pd-input"
              name="target_type"
              value={draft.target_type}
              onChange={updateDraft}
              maxLength={50}
              placeholder="Example: contest, problem, user"
            />
          </FilterField>

          <FilterField label="Target ID">
            <input
              className="pd-input"
              name="target_id"
              value={draft.target_id}
              onChange={updateDraft}
              maxLength={64}
              placeholder="Exact resource ID"
            />
          </FilterField>

          <FilterField label="Outcome">
            <select
              className="pd-input"
              name="outcome"
              value={draft.outcome}
              onChange={updateDraft}
            >
              <option value="">All outcomes</option>
              <option value="success">Success</option>
              <option value="failure">Failure</option>
              <option value="denied">Denied</option>
            </select>
          </FilterField>

          <FilterField label="From — browser local time">
            <input
              className="pd-input"
              type="datetime-local"
              step="1"
              name="from"
              value={draft.from}
              onChange={updateDraft}
            />
          </FilterField>

          <FilterField label="To — browser local time">
            <input
              className="pd-input"
              type="datetime-local"
              step="1"
              name="to"
              value={draft.to}
              onChange={updateDraft}
            />
          </FilterField>

          <FilterField label="Timestamp order">
            <select
              className="pd-input"
              name="sort"
              value={draft.sort}
              onChange={updateDraft}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </FilterField>

          <FilterField label="Rows per page">
            <select
              className="pd-input"
              name="page_size"
              value={draft.page_size}
              onChange={updateDraft}
            >
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </FilterField>
        </div>

        <div
          className="pd-row"
          style={{ marginTop: 18, justifyContent: "flex-start" }}
        >
          <button type="submit" className="pd-button" disabled={loading}>
            Apply filters
          </button>

          <button
            type="button"
            className="pd-button"
            onClick={resetFilters}
            disabled={loading}
          >
            Reset
          </button>
        </div>
      </form>

      {error && (
        <p role="alert" className="pd-error">
          {error}
        </p>
      )}

      <section className="pd-panel">
        <div className="pd-row">
          <h2 className="pd-title">Audit events</h2>

          <span className="pd-note" role="status">
            {loading
              ? "Loading events…"
              : pagination
                ? `${pagination.total} matching events`
                : "Events unavailable"}
          </span>
        </div>

        <div
          className="pd-table-wrap"
          style={{ marginTop: 14 }}
          aria-busy={loading}
        >
          <table className="pd-table" style={{ minWidth: 1250 }}>
            <thead>
              <tr>
                {[
                  "Event",
                  "Timestamp",
                  "Administrator",
                  "Action / category",
                  "Target type",
                  "Target ID",
                  "Description",
                  "Outcome",
                  "Details",
                ].map((heading) => (
                  <th key={heading} scope="col">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9}>Loading audit events…</td>
                </tr>
              ) : !data ? (
                <tr>
                  <td colSpan={9}>Unable to display audit events.</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9}>No events match the active filters.</td>
                </tr>
              ) : (
                rows.map((item) => (
                  <tr key={item.id}>
                    <td>#{item.id}</td>

                    <td style={{ minWidth: 210 }}>
                      {timestamp(item.created_at)}
                    </td>

                    <td style={{ minWidth: 190 }}>
                      <div style={{ color: "#f1f5f9" }}>
                        {item.admin_name || "Not recorded"}
                      </div>

                      <div className="pd-note">
                        {item.admin_email || "Email not recorded"}
                      </div>

                      <div className="pd-note">
                        {item.admin_id == null
                          ? "Administrator ID not recorded"
                          : `Administrator #${item.admin_id}`}
                      </div>
                    </td>

                    <td style={{ minWidth: 190 }}>
                      <div style={{ color: "#a5f3fc" }}>
                        {readable(item.action)}
                      </div>

                      <div className="pd-note">{readable(item.category)}</div>
                    </td>

                    <td>{item.target_type || "Not recorded"}</td>
                    <td>{item.target_id ?? "Not recorded"}</td>

                    <td
                      style={{
                        minWidth: 220,
                        maxWidth: 350,
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {item.description || "Not recorded"}
                    </td>

                    <td>
                      <Outcome value={item.outcome} />
                    </td>

                    <td>
                      <button
                        type="button"
                        className="pd-button"
                        onClick={() => setSelectedId(item.id)}
                        aria-label={`View audit event ${item.id}`}
                      >
                        View details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination && (
          <div className="pd-row" style={{ marginTop: 18 }}>
            <p className="pd-note">
              Showing {pagination.from}–{pagination.to} of {pagination.total} ·
              Page {pagination.page} of {pagination.total_pages}
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                className="pd-button"
                disabled={loading || pagination.page <= 1}
                onClick={() =>
                  setQuery((previous) => ({
                    ...previous,
                    page: String(pagination.page - 1),
                  }))
                }
              >
                Previous
              </button>

              <button
                type="button"
                className="pd-button"
                disabled={loading || pagination.page >= pagination.total_pages}
                onClick={() =>
                  setQuery((previous) => ({
                    ...previous,
                    page: String(pagination.page + 1),
                  }))
                }
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      {selectedId !== null && (
        <section
          className="pd-panel"
          aria-labelledby="audit-event-heading"
          aria-busy={detailLoading}
        >
          <div className="pd-row">
            <h2 id="audit-event-heading" className="pd-title">
              Event #{selectedId}
            </h2>

            <button
              type="button"
              className="pd-button"
              onClick={() => setSelectedId(null)}
            >
              Close details
            </button>
          </div>

          {detailLoading && (
            <p className="pd-note" role="status">
              Loading event details…
            </p>
          )}

          {detailError && (
            <p className="pd-error" role="alert">
              {detailError}
            </p>
          )}

          {!detailLoading && event && (
            <>
              <dl
                className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
                style={{ marginTop: 18 }}
              >
                {detailFields.map(([label, value]) => (
                  <div
                    key={label}
                    style={{
                      padding: 14,
                      border: "1px solid #ffffff15",
                      borderRadius: 12,
                      background: "#02061744",
                      minWidth: 0,
                    }}
                  >
                    <dt className="pd-note">{label}</dt>

                    <dd
                      style={{
                        margin: "6px 0 0",
                        color: "#e2e8f0",
                        fontSize: 13,
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {value === null || value === undefined || value === ""
                        ? "Not recorded"
                        : String(value)}
                    </dd>
                  </div>
                ))}
              </dl>

              <div
                className="grid gap-5 md:grid-cols-2"
                style={{ marginTop: 22 }}
              >
                <div>
                  <h3 className="pd-title">Previous and new values</h3>
                  <JsonValue value={event.changes} />
                </div>

                <div>
                  <h3 className="pd-title">Additional metadata</h3>
                  <JsonValue value={event.details} />
                </div>
              </div>

              <p className="pd-note">
                Missing historical identity snapshots may fall back to the
                current account identity. Missing metadata is displayed as “Not
                recorded.”
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
