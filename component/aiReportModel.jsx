import { useEffect, useState } from "react";
import axios from "axios";
import "./aiReportModel.css";

const API = `http://${window.location.hostname}:5000`;

/**
 * Props:
 *   user       - the logged-in user object from localStorage (must include roll, role)
 *   roll       - roll number the report is for (normally === user.roll for students)
 *   periodKey  - "semester" | "year"
 *   periodValue- the selected semester/year value
 *   examTerm   - selected exam term
 *   onClose    - close handler
 */
function AIReportModal({ user, roll, periodKey, periodValue, examTerm, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const requestBody = {
    roll,
    requester_role: user.role,
    requester_roll: user.roll,
    exam_term: examTerm,
    ...(periodKey === "semester" ? { semester: periodValue } : { year: periodValue }),
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    axios
      .post(`${API}/ai/generate-result-report`, requestBody)
      .then((res) => {
        if (cancelled) return;
        if (!res.data || res.data.success === false || !res.data.report) {
          setError(res.data?.msg || "AI report could not be generated (unexpected response).");
          return;
        }
        setData(res.data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.response?.data?.msg || err.message || "Failed to generate AI report.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roll, periodKey, periodValue, examTerm]);

  // ---------------------------------------------------------------------
  // PDF download — hardened so a failure always shows the REAL reason
  // (e.g. "reportlab not installed", "Access Denied") instead of a blank
  // "failed to download" alert. Handles three cases:
  //   1. Success (200, content-type application/pdf) -> trigger download
  //   2. "Success" status but backend actually sent a JSON error body
  //      because reportlab isn't installed etc. -> read it and show it
  //   3. A genuine HTTP error (403/404/500) with a JSON body, returned as
  //      a Blob because responseType is "blob" -> read the blob as text
  //      and parse the message out of it
  // ---------------------------------------------------------------------
  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const res = await axios.post(`${API}/ai/download-report-pdf`, requestBody, {
        responseType: "blob",
      });

      const contentType = res.headers?.["content-type"] || "";

      if (!contentType.includes("application/pdf")) {
        const text = await res.data.text();
        let msg = "Failed to generate PDF.";
        try {
          msg = JSON.parse(text).msg || msg;
        } catch (_) {
          /* not JSON, keep default msg */
        }
        alert(msg);
        return;
      }

      const url = window.URL.createObjectURL(
        new Blob([res.data], { type: "application/pdf" })
      );
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `AI_Result_Report_${roll}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      let message = "Failed to download PDF report.";
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const parsed = JSON.parse(text);
          message = parsed.msg || message;
        } catch (_) {
          /* blob wasn't JSON either, keep default msg */
        }
      } else if (err.response?.data?.msg) {
        message = err.response.data.msg;
      } else if (err.message) {
        message = err.message;
      }
      console.error("AI Report PDF download error:", err);
      alert(message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="air-overlay" onClick={onClose}>
      <div className="air-modal" onClick={(e) => e.stopPropagation()}>
        <div className="air-modal__header">
          <h2>🤖 AI Result Report</h2>
          <button className="air-close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {loading && (
          <div className="air-center-box">
            <div className="air-spinner" />
            <p>Generating your AI report…</p>
          </div>
        )}

        {!loading && error && (
          <div className="air-center-box">
            <p className="air-error">{error}</p>
          </div>
        )}

        {!loading && !error && data && (
          <div className="air-content">
            <div className="air-info-grid">
              <div>
                <p className="air-label">Name</p>
                <p className="air-value">{data.student.full_name}</p>
              </div>
              <div>
                <p className="air-label">Roll</p>
                <p className="air-value">{data.student.roll}</p>
              </div>
              <div>
                <p className="air-label">Department</p>
                <p className="air-value">{data.student.department}</p>
              </div>
              <div>
                <p className="air-label">Period</p>
                <p className="air-value">
                  {data.report.period_value}
                  {data.report.exam_term ? ` — ${data.report.exam_term}` : ""}
                </p>
              </div>
            </div>

            <div className="air-table-wrap">
              <table className="air-table">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Marks</th>
                    <th>Grade</th>
                    <th>Grade Pt</th>
                    <th>Credits</th>
                    <th>Status</th>
                    <th>Remark</th>
                  </tr>
                </thead>
                <tbody>
                  {data.report.subjects.map((s, i) => (
                    <tr key={i}>
                      <td>{s.subject_name}</td>
                      <td>{s.marks}</td>
                      <td>{s.grade}</td>
                      <td>{s.grade_point}</td>
                      <td>{s.credit_hours}</td>
                      <td className={s.status === "Fail" ? "air-fail" : "air-pass"}>
                        {s.status}
                      </td>
                      <td className="air-remark">{s.remark}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="air-summary">
              <div>
                <p className="air-summary__label">Total</p>
                <p className="air-summary__value">
                  {data.report.total_marks}/{data.report.max_marks}
                </p>
              </div>
              <div>
                <p className="air-summary__label">Percentage</p>
                <p className="air-summary__value">{data.report.percentage}%</p>
              </div>
              <div>
                <p className="air-summary__label">GPA</p>
                <p className="air-summary__value">{data.report.gpa}</p>
              </div>
              <div>
                <p className="air-summary__label">CGPA</p>
                <p className="air-summary__value">{data.cgpa}</p>
              </div>
              <div>
                <p className="air-summary__label">Performance</p>
                <p
                  className={`air-summary__value air-perf-${(data.performance || "")
                    .replace(/\s+/g, "-")
                    .toLowerCase()}`}
                >
                  {data.performance || "-"}
                </p>
              </div>
              {/*
                Class Rank now renders whenever the student belongs to a
                real class (total_students > 0), even if THIS student
                doesn't have a rank position yet (e.g. their own results
                for this period aren't verified yet, but classmates
                exist). Previously this was gated on `data.rank` alone,
                which hid the whole class-size context whenever rank was
                falsy/None — even when total_students was accurate and
                > 1. See compute_class_rank() in ai_report_route.py for
                why rank can legitimately be None while total_students
                is still meaningful.
              */}
              {data.total_students > 0 && (
                <div>
                  <p className="air-summary__label">Class Rank</p>
                  <p className="air-summary__value">
                    {data.rank
                      ? `${data.rank}/${data.total_students}`
                      : `Not yet ranked / ${data.total_students}`}
                  </p>
                </div>
              )}
              {data.attendance?.percentage != null && (
                <div>
                  <p className="air-summary__label">Attendance</p>
                  <p className="air-summary__value">{data.attendance?.percentage}%</p>
                </div>
              )}
            </div>

            <div className="air-section air-assessment">
              <h3>🧠 AI Assessment</h3>
              <p>{data.ai_assessment}</p>
            </div>

            <div className="air-section">
              <h3>GPA Trend</h3>
              <p>{data.trend}</p>
              {data.semester_gpas.length > 0 && (
                <div className="air-trend-row">
                  {data.semester_gpas.map((g, i) => (
                    <span key={i} className="air-trend-chip">
                      {data.period_key === "semester" ? "Sem" : "Yr"} {g.period}: {g.gpa}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="air-columns">
              <div className="air-col">
                <h3>💪 Strong Subjects</h3>
                {data.report.strong_subjects.length ? (
                  <ul>
                    {data.report.strong_subjects.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="air-muted">None identified</p>
                )}
              </div>
              <div className="air-col">
                <h3>⚠️ Weak Subjects</h3>
                {data.report.weak_subjects.length ? (
                  <ul>
                    {data.report.weak_subjects.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="air-muted">None</p>
                )}
              </div>
              <div className="air-col">
                <h3>❌ Failed Subjects</h3>
                {data.report.failed_subjects.length ? (
                  <ul>
                    {data.report.failed_subjects.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="air-muted">None</p>
                )}
              </div>
            </div>

            <div className="air-highlight-row">
              {data.report.highest_subject && (
                <span className="air-highlight-chip air-highlight-chip--best">
                  🏆 Best: {data.report.highest_subject} ({data.report.highest_marks})
                </span>
              )}
              {data.report.lowest_subject && (
                <span className="air-highlight-chip air-highlight-chip--worst">
                  📉 Lowest: {data.report.lowest_subject} ({data.report.lowest_marks})
                </span>
              )}
            </div>

            <div className="air-section">
              <h3>🧭 AI Recommendations</h3>
              <ul className="air-recommendations">
                {data.recommendations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>

            <div className="air-actions">
              <button
                className="air-download-btn"
                onClick={handleDownloadPdf}
                disabled={downloading}
              >
                {downloading ? "Preparing PDF…" : "📄 Download AI Report PDF"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AIReportModal;