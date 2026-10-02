import React, { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import "./admissionRecords.css";

const API = `http://${window.location.hostname}:5000`;

const icon = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
const InfoIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" {...icon} style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v5h1" /></svg>;
const CheckIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" {...icon}><path d="M20 6L9 17l-5-5" /></svg>;
const XIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" {...icon}><path d="M18 6L6 18M6 6l12 12" /></svg>;
const RefreshIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" {...icon}><path d="M21 12a9 9 0 10-2.6 6.4M21 5v6h-6" /></svg>;
const TrashIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" {...icon}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>;
const EyeIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" {...icon}><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" /></svg>;
const FileIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" {...icon}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></svg>;
const ImageIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" {...icon}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>;
const ShieldCheckIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" {...icon}><path d="M12 2l7 4v6c0 5-3.15 8.5-7 10-3.85-1.5-7-5-7-10V6l7-4z" /><path d="M9 12l2 2 4-4" /></svg>;
const ExternalIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" {...icon}><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><path d="M15 3h6v6M10 14L21 3" /></svg>;
const ChevronLeftIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" {...icon}><path d="M15 18l-6-6 6-6" /></svg>;
const ChevronRightIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" {...icon}><path d="M9 18l6-6-6-6" /></svg>;
const SearchIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" {...icon}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" /></svg>;

function toBool(val) {
  if (val === null || val === undefined) return false;
  if (typeof val === "boolean") return val;
  if (typeof val === "number") return val !== 0;
  if (typeof val === "string") return val === "1" || val.toLowerCase() === "true";
  if (val?.type === "Buffer" && Array.isArray(val.data)) return val.data[0] === 1;
  return Boolean(val);
}

function normalizeApplication(a) {
  return {
    ...a,
    admission_submitted: toBool(a.admission_submitted),
    documents_verified: toBool(a.documents_verified),
  };
}

const PAGE_SIZE = 10;

function StatCard({ label, value, tone }) {
  return (
    <div className={"admrec_statCard" + (tone ? ` tone-${tone}` : "")}>
      <span className="admrec_statValue">{value}</span>
      <span className="admrec_statLabel">{label}</span>
    </div>
  );
}

function StatusBadge({ status }) {
  const s = (status || "pending").toLowerCase();
  const label = s[0].toUpperCase() + s.slice(1);
  return <span className={`admrec_badge tone-${s}`}>{label}</span>;
}

function describeEmailResult(email) {
  if (!email) return null;
  if (email.success && email.skipped) {
    return { type: "success", text: email.reason || "Email was already sent earlier." };
  }
  if (email.success) {
    return { type: "success", text: "Notification email sent." };
  }
  return { type: "error", text: email.error || "The notification email could not be sent." };
}

const DOC_LIST = [
  { key: "photo", label: "Photo" },
  { key: "marksheet10", label: "10th Marksheet" },
  { key: "marksheet12", label: "12th Marksheet" },
  { key: "id_proof", label: "ID Proof" },
];

function isImageUrl(url) {
  return /\.(jpe?g|png|gif|webp)$/i.test(url || "");
}

function DocumentsPanel({ docsState, onOpenViewer }) {
  if (docsState.loading) {
    return (
      <div className="admrec_docsPanel">
        <span className="admrec_docsPanelMsg">Loading documents…</span>
      </div>
    );
  }
  if (docsState.error) {
    return (
      <div className="admrec_docsPanel">
        <span className="admrec_docsPanelMsg tone-error">Could not load documents.</span>
      </div>
    );
  }
  const data = docsState.data;
  if (!data) return null;

  return (
    <div className="admrec_docsPanel">
      <span className="admrec_docsPanelLabel">Documents</span>
      <div className="admrec_docsGrid">
        {DOC_LIST.map(({ key, label }) => {
          const url = data[key];
          return (
            <button
              key={key}
              type="button"
              className={"admrec_docBtn" + (!url ? " is-missing" : "")}
              disabled={!url}
              onClick={() => url && onOpenViewer(`${API}${url}`, label)}
            >
              <span className="admrec_docBtnIcon">
                {isImageUrl(url) ? <ImageIcon /> : <FileIcon />}
              </span>
              <span className="admrec_docBtnLabel">{label}</span>
              {url ? (
                <span className="admrec_docBtnGo"><EyeIcon /></span>
              ) : (
                <span className="admrec_docMissingTag">Missing</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DocumentViewerModal({ viewer, onClose }) {
  useEffect(() => {
    if (!viewer) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewer, onClose]);

  if (!viewer) return null;
  const { url, label } = viewer;
  const isImg = isImageUrl(url);

  return (
    <div className="admrec_modalOverlay" onClick={onClose}>
      <div className="admrec_modalBox" onClick={(e) => e.stopPropagation()}>
        <div className="admrec_modalHeader">
          <span className="admrec_modalTitle">{label}</span>
          <button type="button" className="admrec_modalClose" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </div>

        <div className="admrec_modalBody">
          {isImg ? (
            <img src={url} alt={label} className="admrec_modalImg" />
          ) : (
            <iframe title={label} src={url} className="admrec_modalFrame" />
          )}
        </div>

        <div className="admrec_modalFooter">
          <a href={url} target="_blank" rel="noopener noreferrer" className="portal_btn outline">
            <ExternalIcon /> Open in new tab
          </a>
          <button type="button" className="portal_submitBtn" onClick={onClose}>
            <XIcon /> Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Pagination({ currentPage, totalPages, onPrev, onNext }) {
  if (totalPages <= 1) return null;
  return (
    <div className="admrec_pagination">
      <button
        type="button"
        className="admrec_pageBtn"
        onClick={onPrev}
        disabled={currentPage <= 1}
      >
        <ChevronLeftIcon /> Previous
      </button>

      <span className="admrec_pageInfo">
        Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
      </span>

      <button
        type="button"
        className="admrec_pageBtn"
        onClick={onNext}
        disabled={currentPage >= totalPages}
      >
        Next <ChevronRightIcon />
      </button>
    </div>
  );
}

export default function AdmissionRecords() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [busyIds, setBusyIds] = useState(() => new Set());
  const [verifyingIds, setVerifyingIds] = useState(() => new Set());
  const [unverifyingIds, setUnverifyingIds] = useState(() => new Set());
  const [rowMessages, setRowMessages] = useState({});

  const [docsByAppId, setDocsByAppId] = useState({});

  const [viewer, setViewer] = useState(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await axios.get(`${API}/applications`);
      const rows = Array.isArray(res.data) ? res.data : [];
      setApplications(rows.map(normalizeApplication));
    } catch (err) {
      setLoadError(err?.response?.data?.message || "Could not load admission records.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const summary = useMemo(() => {
    const s = { total: applications.length, pending: 0, approved: 0, rejected: 0, admission_submitted: 0, documents_verified: 0 };
    for (const a of applications) {
      const status = (a.status || "pending").toLowerCase();
      if (status === "pending") s.pending += 1;
      else if (status === "approved") s.approved += 1;
      else if (status === "rejected") s.rejected += 1;
      if (a.admission_submitted) s.admission_submitted += 1;
      if (a.documents_verified) s.documents_verified += 1;
    }
    return s;
  }, [applications]);

  const filteredApplications = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return applications;
    return applications.filter((a) => {
      const haystack = [
        a.full_name,
        a.email,
        a.phone,
        a.program,
        a.status,
        a.roll_number,
        a.admission_number,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [applications, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredApplications.length / PAGE_SIZE));

  const paginatedApplications = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredApplications.slice(start, start + PAGE_SIZE);
  }, [filteredApplications, currentPage]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const goToPrevPage = () => setCurrentPage((p) => Math.max(1, p - 1));
  const goToNextPage = () => setCurrentPage((p) => Math.min(totalPages, p + 1));

  const setBusy = (id, isBusy) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (isBusy) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const clearRowMessageLater = (id) => {
    setTimeout(() => {
      setRowMessages((prev) => {
        const { [id]: _drop, ...rest } = prev;
        return rest;
      });
    }, 6000);
  };

  const changeStatus = async (application, nextStatus) => {
    setBusy(application.id, true);
    setRowMessages((prev) => ({ ...prev, [application.id]: null }));

    try {
      const res = await axios.patch(`${API}/applications/${application.id}/status`, {
        status: nextStatus,
      });
      const { success, status, email, message } = res.data;

      if (success) {
        setApplications((prev) =>
          prev.map((a) => (a.id === application.id ? { ...a, status } : a))
        );
      }

      const emailInfo = describeEmailResult(email);
      setRowMessages((prev) => ({
        ...prev,
        [application.id]: emailInfo || (success ? null : { type: "error", text: message || "Update failed." }),
      }));
    } catch (err) {
      setRowMessages((prev) => ({
        ...prev,
        [application.id]: {
          type: "error",
          text: err?.response?.data?.message || "Could not update this application.",
        },
      }));
    } finally {
      setBusy(application.id, false);
      clearRowMessageLater(application.id);
    }
  };

  const handleDelete = async (application) => {
    if (!window.confirm(`Delete the application from ${application.full_name}? This can't be undone.`)) return;
    setBusy(application.id, true);
    try {
      await axios.delete(`${API}/applications/${application.id}`);
      setApplications((prev) => prev.filter((a) => a.id !== application.id));
    } catch (err) {
      setRowMessages((prev) => ({
        ...prev,
        [application.id]: { type: "error", text: err?.response?.data?.message || "Could not delete this application." },
      }));
      setBusy(application.id, false);
      clearRowMessageLater(application.id);
    }
  };

  const handleToggleDocs = useCallback(async (application) => {
    const id = application.id;
    const current = docsByAppId[id];

    if (current?.open) {
      setDocsByAppId((prev) => ({ ...prev, [id]: { ...prev[id], open: false } }));
      return;
    }

    if (current?.data) {
      setDocsByAppId((prev) => ({ ...prev, [id]: { ...prev[id], open: true } }));
      return;
    }

    setDocsByAppId((prev) => ({
      ...prev,
      [id]: { open: true, loading: true, error: false, data: null },
    }));

    try {
      const res = await axios.get(`${API}/admissions/${id}/documents`);
      setDocsByAppId((prev) => ({
        ...prev,
        [id]: { open: true, loading: false, error: false, data: res.data.documents },
      }));
    } catch (err) {
      setDocsByAppId((prev) => ({
        ...prev,
        [id]: { open: true, loading: false, error: true, data: null },
      }));
    }
  }, [docsByAppId]);

  const handleVerifyDocuments = async (application) => {
    const id = application.id;
    setVerifyingIds((prev) => new Set(prev).add(id));
    setRowMessages((prev) => ({ ...prev, [id]: null }));

    try {
      const res = await axios.patch(`${API}/admissions/${id}/verify-documents`);
      const { success, documents_verified, admission_number, roll_number, email, message } = res.data;

      if (success) {
        setApplications((prev) =>
          prev.map((a) =>
            a.id === id
              ? {
                  ...a,
                  documents_verified: toBool(documents_verified ?? true),
                  admission_number: admission_number || a.admission_number,
                  roll_number: roll_number || a.roll_number,
                }
              : a
          )
        );
      }

      const emailInfo = describeEmailResult(email);
      setRowMessages((prev) => ({
        ...prev,
        [id]: emailInfo || (success
          ? { type: "success", text: "Documents verified." }
          : { type: "error", text: message || "Could not verify documents." }),
      }));
    } catch (err) {
      setRowMessages((prev) => ({
        ...prev,
        [id]: { type: "error", text: err?.response?.data?.message || "Could not verify documents." },
      }));
    } finally {
      setVerifyingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      clearRowMessageLater(id);
    }
  };

  const handleUnverifyDocuments = async (application) => {
    const id = application.id;
    if (!window.confirm(`Mark documents as unverified for ${application.full_name}? They will need to be re-verified.`)) return;

    setUnverifyingIds((prev) => new Set(prev).add(id));
    setRowMessages((prev) => ({ ...prev, [id]: null }));

    try {
      const res = await axios.patch(`${API}/admissions/${id}/unverify-documents`);
      const { success, documents_verified, message } = res.data;

      if (success) {
        setApplications((prev) =>
          prev.map((a) =>
            a.id === id ? { ...a, documents_verified: toBool(documents_verified ?? false) } : a
          )
        );
        setRowMessages((prev) => ({ ...prev, [id]: { type: "success", text: "Documents marked as unverified." } }));
      } else {
        setRowMessages((prev) => ({ ...prev, [id]: { type: "error", text: message || "Could not unverify documents." } }));
      }
    } catch (err) {
      setRowMessages((prev) => ({
        ...prev,
        [id]: { type: "error", text: err?.response?.data?.message || "Could not unverify documents." },
      }));
    } finally {
      setUnverifyingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      clearRowMessageLater(id);
    }
  };

  return (
    <div className="admrec_wrap">
      <div className="admrec_header">
        <div>
          <h2>Admission Records</h2>
          <p>All submitted applications, live counts, and admission approval.</p>
        </div>
        <div className="admrec_headerActions">
          <div className="admrec_searchBox">
            <SearchIcon />
            <input
              type="text"
              className="admrec_searchInput"
              placeholder="Search name, email, phone, program, roll no..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button type="button" className="portal_btn outline" onClick={fetchApplications} disabled={loading}>
            <RefreshIcon /> Refresh
          </button>
        </div>
      </div>

      <div className="admrec_stats">
        <StatCard label="Total applied" value={summary.total} />
        <StatCard label="Pending" value={summary.pending} tone="pending" />
        <StatCard label="Approved" value={summary.approved} tone="approved" />
        <StatCard label="Rejected" value={summary.rejected} tone="rejected" />
        <StatCard label="Admission form submitted" value={summary.admission_submitted} tone="done" />
        <StatCard label="Documents verified" value={summary.documents_verified} tone="verified" />
      </div>

      {loadError && <div className="portal_formError"><InfoIcon />{loadError}</div>}

      {loading ? (
        <p className="admrec_loadingText">Loading admission records…</p>
      ) : (
        <>
          <div className="admrec_tableWrap">
            <table className="admrec_table">
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Contact</th>
                  <th>Program</th>
                  <th>Status</th>
                  <th>Admission Form</th>
                  <th>Admission Number</th>
                  <th>Roll Number</th>
                  <th>Documents</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredApplications.length === 0 && (
                  <tr>
                    <td colSpan={9} className="admrec_empty">
                      {applications.length === 0 ? "No applications yet." : "No applications match your search."}
                    </td>
                  </tr>
                )}

                {paginatedApplications.map((app) => {
                  const isBusy = busyIds.has(app.id);
                  const isVerifying = verifyingIds.has(app.id);
                  const isUnverifying = unverifyingIds.has(app.id);
                  const rowLocked = isBusy || isVerifying || isUnverifying;
                  const status = (app.status || "pending").toLowerCase();
                  const rowMsg = rowMessages[app.id];
                  const docsState = docsByAppId[app.id] || {};

                  return (
                    <tr key={app.id}>
                      <td>
                        <div className="admrec_name">{app.full_name}</div>
                        <div className="admrec_sub">Applied {app.created_at ? new Date(app.created_at).toLocaleDateString() : "-"}</div>
                      </td>
                      <td>
                        <div>{app.email}</div>
                        <div className="admrec_sub">{app.phone}</div>
                      </td>
                      <td>{app.program}</td>
                      <td>
                        <StatusBadge status={app.status} />
                        {rowMsg && <div className={`admrec_rowMsg tone-${rowMsg.type}`}>{rowMsg.text}</div>}
                      </td>
                      <td>
                        {app.admission_submitted ? (
                          <div className="admrec_admissionCell">
                            <div className="admrec_admissionBadges">
                              <span className="admrec_badge tone-approved"><CheckIcon /> Submitted</span>
                            </div>
                          </div>
                        ) : (
                          <span className="admrec_sub">Not yet</span>
                        )}
                      </td>
                      <td>
                        {app.documents_verified && app.admission_number ? (
                          <span className="admrec_name">{app.admission_number}</span>
                        ) : (
                          <span className="admrec_sub">—</span>
                        )}
                      </td>
                      <td>
                        {app.roll_number ? (
                          <span className="admrec_name">{app.roll_number}</span>
                        ) : (
                          <span className="admrec_sub">—</span>
                        )}
                      </td>
                      <td>
                        {app.admission_submitted ? (
                          <div className="admrec_documentsCell">
                            {app.documents_verified && (
                              <div className="admrec_admissionBadges">
                                <span className="admrec_badge tone-verified"><ShieldCheckIcon /> Documents Verified</span>
                              </div>
                            )}

                            <button
                              type="button"
                              className="admrec_viewDocsBtn"
                              onClick={() => handleToggleDocs(app)}
                            >
                              <EyeIcon /> {docsState.open ? "Hide documents" : "View documents"}
                            </button>

                            {docsState.open && (
                              <DocumentsPanel
                                docsState={docsState}
                                onOpenViewer={(url, label) => setViewer({ url, label })}
                              />
                            )}
                          </div>
                        ) : (
                          <span className="admrec_sub">—</span>
                        )}
                      </td>
                      <td>
                        <div className="admrec_actions">
                          <div className="admrec_actionsPrimary">
                            {status === "pending" && (
                              <>
                                <button
                                  type="button"
                                  className="admrec_actionBtn tone-verify"
                                  disabled={rowLocked}
                                  onClick={() => changeStatus(app, "approved")}
                                >
                                  {isBusy ? <span className="portal_spinner" /> : <CheckIcon />}
                                  {isBusy ? "Verifying…" : "Verify"}
                                </button>
                                <button
                                  type="button"
                                  className="admrec_actionBtn tone-reject"
                                  disabled={rowLocked}
                                  onClick={() => changeStatus(app, "rejected")}
                                >
                                  <XIcon /> Reject
                                </button>
                              </>
                            )}

                            {status === "approved" && (
                              <button
                                type="button"
                                className="admrec_actionBtn tone-reject"
                                disabled={rowLocked}
                                onClick={() => changeStatus(app, "rejected")}
                              >
                                <XIcon /> Reject
                              </button>
                            )}

                            {status === "rejected" && (
                              <button
                                type="button"
                                className="admrec_actionBtn tone-reset"
                                disabled={rowLocked}
                                onClick={() => changeStatus(app, "pending")}
                              >
                                <RefreshIcon /> Reset
                              </button>
                            )}

                            {app.admission_submitted && !app.documents_verified && (
                              <button
                                type="button"
                                className="admrec_actionBtn tone-verify-docs"
                                disabled={rowLocked}
                                onClick={() => handleVerifyDocuments(app)}
                              >
                                {isVerifying ? <span className="portal_spinner" /> : <ShieldCheckIcon />}
                                {isVerifying ? "Verifying…" : "Verify Documents"}
                              </button>
                            )}

                            {app.admission_submitted && app.documents_verified && (
                              <>
                                <span className="admrec_verifiedPill" title="Documents verified">
                                  <ShieldCheckIcon /> Verified
                                </span>
                                <button
                                  type="button"
                                  className="admrec_actionBtn tone-unverify-docs"
                                  disabled={rowLocked}
                                  onClick={() => handleUnverifyDocuments(app)}
                                >
                                  {isUnverifying ? <span className="portal_spinner" /> : <XIcon />}
                                  {isUnverifying ? "Unverifying…" : "Unverify"}
                                </button>
                              </>
                            )}
                          </div>

                          <button
                            type="button"
                            className="admrec_deleteBtn"
                            title="Delete application"
                            disabled={rowLocked}
                            onClick={() => handleDelete(app)}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPrev={goToPrevPage}
            onNext={goToNextPage}
          />
        </>
      )}

      <DocumentViewerModal viewer={viewer} onClose={() => setViewer(null)} />
    </div>
  );
}