import React, { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import "./application.css";

const API = `http://${window.location.hostname}:5000`;
const PAGE_SIZE = 15;

const FIELDS = [
  { key: "full_name", label: "Full name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "program", label: "Program" },
  { key: "message", label: "Message", multiline: true },
];

function StatusPill({ status }) {
  const s = (status || "pending").toLowerCase();
  return <span className={`ap-pill ap-pill--${s}`}>{s}</span>;
}

function initials(name = "") {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}

// Application numbers are just the row id, zero-padded to 6 digits
// (e.g. id 1 -> "000001"). The backend now sends this pre-formatted as
// `application_number` on every row; the padStart fallback here just
// covers older cached data / API responses that predate that field.
function formatApplicationNumber(a) {
  if (a && a.application_number) return a.application_number;
  return String(a?.id ?? "").padStart(6, "0");
}

function getPageNumbers(current, total) {
  const pages = [];
  const windowSize = 1;
  const add = (p) => pages.push(p);

  add(1);
  if (current - windowSize > 2) add("…");
  for (let p = Math.max(2, current - windowSize); p <= Math.min(total - 1, current + windowSize); p++) {
    add(p);
  }
  if (current + windowSize < total - 1) add("…");
  if (total > 1) add(total);

  return pages;
}

function Pagination({ currentPage, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  const pages = getPageNumbers(currentPage, totalPages);

  return (
    <div className="ap-pagination">
      <button className="ap-page-btn" disabled={currentPage === 1} onClick={() => onChange(currentPage - 1)}>
        Previous
      </button>

      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`ellipsis-${i}`} className="ap-page-ellipsis">…</span>
        ) : (
          <button
            key={p}
            className={`ap-page-btn ap-page-btn--num ${p === currentPage ? "is-active" : ""}`}
            onClick={() => onChange(p)}
          >
            {p}
          </button>
        )
      )}

      <button className="ap-page-btn" disabled={currentPage === totalPages} onClick={() => onChange(currentPage + 1)}>
        Next
      </button>
    </div>
  );
}

function EditModal({ record, onClose, onSaved }) {
  const [form, setForm] = useState({
    full_name: record.full_name || "",
    email: record.email || "",
    phone: record.phone || "",
    program: record.program || "",
    message: record.message || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await axios.put(`${API}/applications/${record.id}`, form);
      onSaved({ ...record, ...form });
    } catch (err) {
      setError(err?.response?.data?.message || "Could not save changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ap-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="ap-modal-card" onSubmit={handleSave}>
        <h3 className="ap-modal-title">
          Edit application <span className="ap-modal-appnum">#{formatApplicationNumber(record)}</span>
        </h3>

        {FIELDS.map((f) => (
          <div key={f.key} className="ap-field">
            <label>{f.label}</label>
            {f.multiline ? (
              <textarea name={f.key} value={form[f.key]} onChange={handleChange} rows={3} disabled={saving} />
            ) : (
              <input name={f.key} value={form[f.key]} onChange={handleChange} required={f.key !== "message"} disabled={saving} />
            )}
          </div>
        ))}

        {error && <p className="ap-form-error">{error}</p>}

        <div className="ap-modal-footer">
          <button type="button" className="ap-btn ap-btn--ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="ap-btn ap-btn--primary" disabled={saving}>
            {saving ? (
              <span className="ap-btn-loading">
                <span className="ap-spinner" />
                Saving…
              </span>
            ) : (
              "Save changes"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function ApplicationsPage() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState({ id: null, action: null });
  const [editing, setEditing] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchApplications = useCallback(() => {
    setLoading(true);
    axios
      .get(`${API}/applications`)
      .then((res) => {
        setApplications(Array.isArray(res.data) ? res.data : []);
        setError("");
      })
      .catch(() => setError("Could not load applications."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchApplications(); }, [fetchApplications]);

  const setStatus = async (id, status) => {
    setBusy({ id, action: status });
    try {
      const res = await axios.patch(`${API}/applications/${id}/status`, { status });
      setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));

      const emailResult = res?.data?.email;
      if (status === "approved" && emailResult && emailResult.success === false && !emailResult.skipped) {
        alert(
          "Application approved, but the notification email could not be sent:\n\n" +
          (emailResult.error || "Unknown error") +
          "\n\nCheck the backend console/logs for full details."
        );
      }
    } catch (err) {
      alert(err?.response?.data?.message || "Could not update status.");
    } finally {
      setBusy({ id: null, action: null });
    }
  };

  const deleteApplication = async (id) => {
    if (!window.confirm("Delete this application? This can't be undone.")) return;
    setBusy({ id, action: "delete" });
    try {
      await axios.delete(`${API}/applications/${id}`);
      setApplications((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      alert(err?.response?.data?.message || "Could not delete application.");
    } finally {
      setBusy({ id: null, action: null });
    }
  };

  const q = search.trim().toLowerCase();

  const sorted = useMemo(() => {
    const rank = (a) => ((a.status || "pending") === "pending" ? 0 : 1);
    return [...applications].sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }, [applications]);

  const filtered = useMemo(
    () =>
      sorted.filter(
        (a) =>
          !q ||
          [a.full_name, a.email, a.phone, a.program, formatApplicationNumber(a)].some((v) =>
            (v || "").toString().toLowerCase().includes(q)
          )
      ),
    [sorted, q]
  );

  useEffect(() => { setCurrentPage(1); }, [q, applications.length]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0 };
    for (const a of applications) c[(a.status || "pending")] = (c[a.status || "pending"] || 0) + 1;
    return c;
  }, [applications]);

  return (
    <div className="ap-page">
      <div className="ap-header">
        <div>
          <h2 className="ap-title">Applications</h2>
          <p className="ap-subtitle">New applications appear at the top, highlighted, until reviewed.</p>
        </div>
        <input
          className="ap-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search app #, name, email, program…"
        />
      </div>

      <div className="ap-stats">
        <div className="ap-stat ap-stat--pending">
          <span className="ap-stat-num">{counts.pending || 0}</span>
          <span className="ap-stat-label">Pending review</span>
        </div>
        <div className="ap-stat ap-stat--approved">
          <span className="ap-stat-num">{counts.approved || 0}</span>
          <span className="ap-stat-label">Approved</span>
        </div>
        <div className="ap-stat ap-stat--rejected">
          <span className="ap-stat-num">{counts.rejected || 0}</span>
          <span className="ap-stat-label">Rejected</span>
        </div>
      </div>

      <div className="ap-card">
        {loading ? (
          <p className="ap-empty">
            <span className="ap-spinner" /> Loading applications…
          </p>
        ) : error ? (
          <p className="ap-error">{error}</p>
        ) : filtered.length === 0 ? (
          <p className="ap-empty">No applications found.</p>
        ) : (
          <>
            <div className="ap-table-wrap">
              <table className="ap-table">
                <thead>
                  <tr>
                    <th>App #</th>
                    <th>Applicant</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Program</th>
                    <th>Message</th>
                    <th>Submitted</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((a) => {
                    const isPending = (a.status || "pending") === "pending";
                    const isBusy = busy.id === a.id;
                    return (
                      <tr key={a.id} className={isPending ? "ap-row--new" : ""}>
                        <td className="ap-appnum-cell">
                          <span className="ap-appnum">{formatApplicationNumber(a)}</span>
                        </td>
                        <td>
                          <div className="ap-applicant">
                            <span className="ap-avatar">{initials(a.full_name)}</span>
                            <div className="ap-applicant-text">
                              <span className="ap-applicant-name">{a.full_name}</span>
                              {isPending && <span className="ap-new-tag">New</span>}
                            </div>
                          </div>
                        </td>
                        <td>{a.email}</td>
                        <td>{a.phone}</td>
                        <td>{a.program}</td>
                        <td className="ap-message-cell">{a.message || "—"}</td>
                        <td>{a.created_at ? new Date(a.created_at).toLocaleString() : "—"}</td>
                        <td><StatusPill status={a.status} /></td>
                        <td>
                          <div className="ap-actions">
                            <button disabled={isBusy} onClick={() => setEditing(a)} className="ap-btn-sm ap-btn-sm--edit">
                              Edit
                            </button>
                            <button
                              disabled={isBusy || a.status === "approved"}
                              onClick={() => setStatus(a.id, "approved")}
                              className="ap-btn-sm ap-btn-sm--approve"
                            >
                              {isBusy && busy.action === "approved" ? (
                                <span className="ap-btn-loading">
                                  <span className="ap-spinner ap-spinner--sm" />
                                  Approving…
                                </span>
                              ) : (
                                "Approve"
                              )}
                            </button>
                            <button
                              disabled={isBusy || a.status === "rejected"}
                              onClick={() => setStatus(a.id, "rejected")}
                              className="ap-btn-sm ap-btn-sm--reject"
                            >
                              {isBusy && busy.action === "rejected" ? (
                                <span className="ap-btn-loading">
                                  <span className="ap-spinner ap-spinner--sm" />
                                  Rejecting…
                                </span>
                              ) : (
                                "Reject"
                              )}
                            </button>
                            <button disabled={isBusy} onClick={() => deleteApplication(a.id)} className="ap-btn-sm ap-btn-sm--delete">
                              {isBusy && busy.action === "delete" ? (
                                <span className="ap-btn-loading">
                                  <span className="ap-spinner ap-spinner--sm" />
                                  Deleting…
                                </span>
                              ) : (
                                "Delete"
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="ap-footer">
              <span className="ap-count">
                Showing {(safePage - 1) * PAGE_SIZE + 1}
                –{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <Pagination currentPage={safePage} totalPages={totalPages} onChange={setCurrentPage} />
            </div>
          </>
        )}
      </div>

      {editing && (
        <EditModal
          record={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setApplications((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}