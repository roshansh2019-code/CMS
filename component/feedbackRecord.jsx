import React, { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import "./Feedback.css";

const API = `http://${window.location.hostname}:5000`;
const PAGE_SIZE = 10;

/*
  Standalone admin page for feedback entries.
  Drop into e.g. src/pages/admin/FeedbackPage.jsx (with FeedbackPage.css
  next to it) and add a route, for instance inside AdminPage.jsx's <Routes>:

    <Route path="feedback" element={<FeedbackPage />} />

  Backend endpoints used (see feedback_route.py):
    GET    /feedback                 - all entries, for this admin table
    PATCH  /feedback/:id/status      { status: "approved" | "rejected" | "pending" }
    DELETE /feedback/:id
*/

function StatusPill({ status }) {
  const s = (status || "pending").toLowerCase();
  return <span className={`fb-pill fb-pill--${s}`}>{s}</span>;
}

function Stars({ n = 0 }) {
  return (
    <span className="fb-stars" aria-label={`${n} out of 5 stars`}>
      <span className="fb-stars__filled">{"★".repeat(n)}</span>
      <span className="fb-stars__empty">{"★".repeat(Math.max(0, 5 - n))}</span>
    </span>
  );
}

// Builds a compact page list like [1, '…', 4, 5, 6, '…', 12] instead of
// rendering a button for every page when there are a lot of them.
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
    <div className="fb-pagination">
      <button
        className="fb-page-btn"
        disabled={currentPage === 1}
        onClick={() => onChange(currentPage - 1)}
      >
        Previous
      </button>

      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`ellipsis-${i}`} className="fb-page-ellipsis">…</span>
        ) : (
          <button
            key={p}
            className={`fb-page-btn fb-page-btn--num ${p === currentPage ? "is-active" : ""}`}
            onClick={() => onChange(p)}
          >
            {p}
          </button>
        )
      )}

      <button
        className="fb-page-btn"
        disabled={currentPage === totalPages}
        onClick={() => onChange(currentPage + 1)}
      >
        Next
      </button>
    </div>
  );
}

export default function FeedbackPage() {
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchFeedback = useCallback(() => {
    setLoading(true);
    axios
      .get(`${API}/feedback`)
      .then((res) => {
        setFeedback(Array.isArray(res.data) ? res.data : []);
        setError("");
      })
      .catch(() => setError("Could not load feedback."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchFeedback(); }, [fetchFeedback]);

  const setStatus = async (id, status) => {
    setBusyId(id);
    try {
      await axios.patch(`${API}/feedback/${id}/status`, { status });
      setFeedback((prev) => prev.map((f) => (f.id === id ? { ...f, status } : f)));
    } catch (err) {
      alert(err?.response?.data?.message || "Could not update status.");
    } finally {
      setBusyId(null);
    }
  };

  const deleteFeedback = async (id) => {
    if (!window.confirm("Delete this feedback entry? This can't be undone.")) return;
    setBusyId(id);
    try {
      await axios.delete(`${API}/feedback/${id}`);
      setFeedback((prev) => prev.filter((f) => f.id !== id));
    } catch (err) {
      alert(err?.response?.data?.message || "Could not delete feedback.");
    } finally {
      setBusyId(null);
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      feedback.filter((f) =>
        !q || [f.name, f.email, f.message].some((v) => (v || "").toLowerCase().includes(q))
      ),
    [feedback, q]
  );

  // Jump back to page 1 whenever the search term (or underlying data) changes,
  // so we never land on a now-empty page.
  useEffect(() => { setCurrentPage(1); }, [q, feedback.length]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="fb-page">
      <div className="fb-header">
        <div>
          <h2 className="fb-title">Feedback</h2>
          <p className="fb-subtitle">
            Review, approve for public display, or remove feedback.
          </p>
        </div>
        <input
          className="fb-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, message…"
        />
      </div>

      <div className="fb-card">
        {loading ? (
          <p className="fb-empty">Loading feedback…</p>
        ) : error ? (
          <p className="fb-error">{error}</p>
        ) : filtered.length === 0 ? (
          <p className="fb-empty">No feedback found.</p>
        ) : (
          <>
            <div className="fb-table-wrap">
              <table className="fb-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Rating</th>
                    <th>Message</th>
                    <th>Submitted</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((f) => (
                    <tr key={f.id}>
                      <td>{f.name}</td>
                      <td>{f.email}</td>
                      <td><Stars n={f.rating} /></td>
                      <td className="fb-message-cell">{f.message}</td>
                      <td>{f.created_at ? new Date(f.created_at).toLocaleString() : "—"}</td>
                      <td><StatusPill status={f.status} /></td>
                      <td>
                        <div className="fb-actions">
                          <button
                            disabled={busyId === f.id || f.status === "approved"}
                            onClick={() => setStatus(f.id, "approved")}
                            className="fb-btn fb-btn--approve"
                          >
                            Approve
                          </button>
                          <button
                            disabled={busyId === f.id || f.status === "rejected"}
                            onClick={() => setStatus(f.id, "rejected")}
                            className="fb-btn fb-btn--reject"
                          >
                            Reject
                          </button>
                          <button
                            disabled={busyId === f.id}
                            onClick={() => deleteFeedback(f.id)}
                            className="fb-btn fb-btn--delete"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="fb-footer">
              <span className="fb-count">
                Showing {(safePage - 1) * PAGE_SIZE + 1}
                –{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <Pagination
                currentPage={safePage}
                totalPages={totalPages}
                onChange={setCurrentPage}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}