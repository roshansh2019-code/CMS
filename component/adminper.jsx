import React, { useEffect, useState } from "react";
import "./PerformancePrediction.css";

/**
 * Admin Dashboard panel: shows every student's XGBoost performance
 * prediction, sorted so the lowest predicted percentage / "Needs
 * Improvement" students appear first. Includes a filter for
 * at-risk-only and a manual "Retrain model" action.
 *
 * Drop this into your existing Admin Dashboard, e.g.:
 *   <AdminPerformanceInsights />
 */
export default function AdminPerformanceInsights({ apiBase = "" }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [students, setStudents] = useState([]);
  const [atRiskOnly, setAtRiskOnly] = useState(false);
  const [retraining, setRetraining] = useState(false);
  const [retrainMessage, setRetrainMessage] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const query = atRiskOnly ? "?at_risk=true" : "";
      const res = await fetch(`${apiBase}/admin/performance-predictions${query}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Could not load predictions");
      }
      setStudents(json.students || []);
    } catch (e) {
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atRiskOnly]);

  async function handleRetrain() {
    setRetraining(true);
    setRetrainMessage(null);
    try {
      const res = await fetch(`${apiBase}/admin/performance-predictions/retrain`, {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json();
      setRetrainMessage(
        json.success
          ? `Model retrained on ${json.trained_on_rows} records.`
          : json.reason || "Not enough data to retrain yet."
      );
      if (json.success) load();
    } catch (e) {
      setRetrainMessage("Retrain failed — check server logs.");
    } finally {
      setRetraining(false);
    }
  }

  return (
    <div className="perf-admin-panel">
      <div className="perf-admin-panel__header">
        <h3>Student Performance Predictions</h3>
        <div className="perf-admin-panel__controls">
          <label className="perf-toggle">
            <input
              type="checkbox"
              checked={atRiskOnly}
              onChange={(e) => setAtRiskOnly(e.target.checked)}
            />
            Show only students needing attention
          </label>
          <button className="perf-btn" onClick={handleRetrain} disabled={retraining}>
            {retraining ? "Retraining…" : "Retrain model"}
          </button>
        </div>
      </div>

      {retrainMessage && <p className="perf-retrain-message">{retrainMessage}</p>}

      {loading && <p>Loading predictions…</p>}
      {error && <p className="perf-card--error">{error}</p>}

      {!loading && !error && students.length === 0 && (
        <p>No students match this view yet.</p>
      )}

      {!loading && !error && students.length > 0 && (
        <table className="perf-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Roll</th>
              <th>Department</th>
              <th>Predicted %</th>
              <th>Level</th>
              <th>Trend</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const p = s.prediction;
              const ok = p?.status === "ok";
              return (
                <tr key={s.roll} className={ok && p.performance_level === "Needs Improvement" ? "perf-row--attention" : ""}>
                  <td>{s.name}</td>
                  <td>{s.roll}</td>
                  <td>{s.department || "-"}</td>
                  <td>{ok ? `${p.predicted_percentage}%` : "—"}</td>
                  <td>{ok ? p.performance_level : "Not enough data"}</td>
                  <td>{ok ? p.trend : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}