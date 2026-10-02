import React, { useEffect, useState } from "react";
import "./PerformancePrediction.css";

/**
 * Student Dashboard card: XGBoost Student Performance Prediction.
 *
 * Props:
 *   roll     - the logged-in student's roll number (string/number)
 *   apiBase  - optional, defaults to "" (same-origin). Pass your API
 *              base URL if the frontend and Flask backend are on
 *              different origins/ports.
 *
 * Drop this into your existing Student Dashboard, e.g.:
 *   <StudentPerformancePrediction roll={student.roll} />
 */
export default function StudentPerformancePrediction({ roll, apiBase = "" }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!roll) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${apiBase}/predict-performance/${roll}`, {
          credentials: "include",
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.message || "Could not load prediction");
        }
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e.message || "Something went wrong");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [roll, apiBase]);

  if (loading) {
    return (
      <div className="perf-card perf-card--loading">
        <p>Loading your performance prediction…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="perf-card perf-card--error">
        <h3>Performance Prediction</h3>
        <p>{error}</p>
      </div>
    );
  }

  const prediction = data?.prediction;

  if (!prediction || prediction.status !== "ok") {
    return (
      <div className="perf-card perf-card--empty">
        <h3>Performance Prediction</h3>
        <p>
          {prediction?.message ||
            "A prediction isn't available yet — check back once more verified results are on file."}
        </p>
      </div>
    );
  }

  const levelClass = {
    Excellent: "perf-level--excellent",
    Good: "perf-level--good",
    Average: "perf-level--average",
    "Needs Improvement": "perf-level--attention",
  }[prediction.performance_level] || "";

  const trendLabel = {
    Improving: "↑ Improving",
    Declining: "↓ Declining",
    Stable: "→ Stable",
    Unknown: "Not enough history to compare",
  }[prediction.trend] || prediction.trend;

  return (
    <div className="perf-card">
      <div className="perf-card__header">
        <h3>Performance Prediction</h3>
        <span className={`perf-badge ${levelClass}`}>{prediction.performance_level}</span>
      </div>

      <div className="perf-card__body">
        <div className="perf-stat">
          <span className="perf-stat__value">{prediction.predicted_percentage}%</span>
          <span className="perf-stat__label">Predicted next-term percentage</span>
        </div>

        <div className="perf-trend">{trendLabel}</div>

        <p className="perf-explanation">{prediction.explanation}</p>

        <p className="perf-disclaimer">{prediction.disclaimer}</p>
      </div>
    </div>
  );
}