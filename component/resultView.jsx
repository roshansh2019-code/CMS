import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "./resultView.css";
import AIReportModal from "./aiReportModel"; // NEW

// const API = "http://127.0.0.1:5000";
const API = `http://${window.location.hostname}:5000`;

const EXAM_TERMS = ["First Term", "Second Term", "Third Term", "Final Term"];

function ResultViewStudent() {
  const navigate = useNavigate();

  const [user, setUser]               = useState(null);
  const [results, setResults]         = useState([]);
  const [total, setTotal]             = useState(0);
  const [maxPossible, setMaxPossible] = useState(0);
  const [percentage, setPercentage]   = useState(0);
  const [gpa, setGpa]                 = useState(0); // NEW

  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [selectedTerm, setSelectedTerm]     = useState("");

  const [searched, setSearched]           = useState(false);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState("");

  // CHANGED: no longer hardcoded — resolved from /departments by
  // matching the student's department NAME (which is what
  // users.department actually stores, per auth_route.py's register()),
  // instead of comparing against a short-code list that never matched.
  const [isSemesterBased, setIsSemesterBased] = useState(true);
  const [deptLoading, setDeptLoading]         = useState(true);

  const [showAIReport, setShowAIReport] = useState(false); // NEW

  useEffect(() => {
    const raw = localStorage.getItem("user");
    if (!raw) { navigate("/"); return; }
    const u = JSON.parse(raw);
    if (!u.roll) { navigate("/"); return; }
    setUser(u);

    // Resolve course_type from the departments list by NAME match,
    // since u.department holds the full department name, not a code.
    axios
      .get(`${API}/departments`)
      .then((res) => {
        const departments = res.data || [];
        const match = departments.find(
          (d) =>
            (d.department_name || "").trim().toLowerCase() ===
            (u.department || "").trim().toLowerCase()
        );

        const sem = match ? match.course_type === "semester" : true;

        setIsSemesterBased(sem);
        if (sem && u.semester) setSelectedPeriod(String(u.semester));
        if (!sem && u.year)    setSelectedPeriod(String(u.year));
      })
      .catch(() => {
        // Fail safe: if the departments lookup fails, fall back to
        // whichever of semester/year the user record actually has set,
        // rather than silently defaulting to Year.
        const fallbackSem = !!u.semester;
        setIsSemesterBased(fallbackSem);
        if (fallbackSem && u.semester) setSelectedPeriod(String(u.semester));
        if (!fallbackSem && u.year)    setSelectedPeriod(String(u.year));
      })
      .finally(() => setDeptLoading(false));
  }, [navigate]);

  const periodOptions = isSemesterBased
    ? Array.from({ length: 8 }, (_, i) => i + 1)
    : Array.from({ length: 4 }, (_, i) => i + 1);

  const handleSearch = () => {
    if (!selectedPeriod) {
      setError(isSemesterBased ? "Please select a semester." : "Please select a year.");
      return;
    }
    if (!selectedTerm) {
      setError("Please select an exam term.");
      return;
    }

    setError("");
    setLoading(true);
    setSearched(false);
    setResults([]);
    setTotal(0);
    setMaxPossible(0);
    setPercentage(0);
    setGpa(0);

    const params = new URLSearchParams();
    params.set("exam_term", selectedTerm);

    if (isSemesterBased) {
      params.set("semester", selectedPeriod);
    } else {
      params.set("year", selectedPeriod);
    }

    axios
      .get(`${API}/student-result/${user.roll}?${params.toString()}`)
      .then((res) => {
        const raw = res.data.results || [];

        const filtered = raw.filter((r) => {
          const termMatch =
            (r.exam_term || "").trim().toLowerCase() ===
            selectedTerm.trim().toLowerCase();
          const periodMatch = isSemesterBased
            ? String(r.semester) === String(selectedPeriod)
            : String(r.year)     === String(selectedPeriod);
          return termMatch && periodMatch;
        });

        const obtainedTotal = filtered.reduce(
          (sum, r) => sum + parseFloat(r.marks || 0),
          0
        );
        const max = filtered.length * 100;
        const pct = max > 0
          ? parseFloat(((obtainedTotal / max) * 100).toFixed(2))
          : 0;

        setResults(filtered);
        setTotal(obtainedTotal);
        setMaxPossible(max);
        setPercentage(pct);
        setGpa(res.data.gpa || 0); // NEW — grade/GPA now come from the backend
        setSearched(true);
      })
      .catch(() => setError("Failed to load results. Please try again."))
      .finally(() => setLoading(false));
  };

  const handlePrint = () => {
    const printArea = document.getElementById("printable-result-card");
    if (!printArea) return;

    const printWindow = window.open("", "_blank", "width=900,height=800");

    let stylesHtml = "";
    for (const node of document.querySelectorAll("link[rel='stylesheet'], style")) {
      stylesHtml += node.outerHTML;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Academic Result - ${user?.full_name || "Student"}</title>
          ${stylesHtml}
        </head>
        <body>
          <div class="rvs-page" style="background:transparent !important; padding:0 !important; min-height:auto !important;">
            <div class="rvs-container" style="max-width:100% !important; width:100% !important;">
              ${printArea.outerHTML}
            </div>
          </div>
          <script>
            window.addEventListener('DOMContentLoaded', () => {
              setTimeout(() => {
                window.print();
                window.close();
              }, 350);
            });
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
  };

  if (!user || deptLoading) return null;

  const allVerified = results.length > 0 &&
    results.every((r) => Number(r.verified) === 1);

  const verifiedCount = results.filter(
    (r) => Number(r.verified) === 1
  ).length;

  const isPass   = percentage >= 40;
  const examTerm = results[0]?.exam_term || selectedTerm;
  const deptName = user.department || results[0]?.department_name || "-";

  return (
    <div className="rvs-page">
      <div className="rvs-container">
        <div className="rvs-heading">
          <h1 className="rvs-heading__title">Result View System</h1>
        </div>

        <div className="rvs-filter-card">
          <h3 className="rvs-filter-card__title">Search Your Result</h3>
          <p className="rvs-filter-card__sub">
            Select your {isSemesterBased ? "semester" : "year"} and exam term to view your result.
          </p>

          <div className="rvs-filter-row">
            <div className="rvs-filter-group">
              <label className="rvs-label">
                {isSemesterBased ? "Semester" : "Year"}
              </label>
              <select
                className="rvs-select"
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
              >
                <option value="">
                  — Select {isSemesterBased ? "Semester" : "Year"} —
                </option>
                {periodOptions.map((n) => (
                  <option key={n} value={n}>
                    {isSemesterBased ? `Semester ${n}` : `Year ${n}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="rvs-filter-group">
              <label className="rvs-label">Exam Term</label>
              <select
                className="rvs-select"
                value={selectedTerm}
                onChange={(e) => setSelectedTerm(e.target.value)}
              >
                <option value="">— Select Term —</option>
                {EXAM_TERMS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="rvs-filter-group rvs-filter-group--action">
              <label className="rvs-label rvs-label--hidden">Search</label>
              <button
                className="rvs-search-btn"
                onClick={handleSearch}
                disabled={loading}
              >
                <span></span>
                {loading ? "Searching…" : "Search Result"}
              </button>
            </div>
          </div>

          {error && <p className="rvs-error"> {error}</p>}
        </div>

        {loading && (
          <div className="rvs-center-box">
            <div className="rvs-spinner" />
            <p style={{ color: "#64748b", margin: 0 }}>Loading your result…</p>
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="rvs-center-box">
            <div className="rvs-center-box__icon"></div>
            <h2 className="rvs-center-box__title">No Result Found</h2>
            <p className="rvs-center-box__body">
              No result found for the selected{" "}
              {isSemesterBased ? "semester" : "year"} and exam term.
              Please try a different selection or contact your teacher.
            </p>
          </div>
        )}

        {!loading && searched && results.length > 0 && !allVerified && (
          <div className="rvs-center-box">
            <div className="rvs-center-box__icon"></div>
            <h2 className="rvs-center-box__title">Result Pending Verification</h2>
            <p className="rvs-center-box__body">
              Your result has been submitted but not all subjects have been
              verified by the admin yet. Please check back later.
            </p>
            <span className="rvs-pending-chip">
              {verifiedCount} / {results.length} subjects verified
            </span>
          </div>
        )}

        {!loading && searched && allVerified && (
          <div className="rvs-card" id="printable-result-card">
            <div className="rvs-card-header">
              <div className="rvs-card-header__badge">logo</div>
              <div>
                <h2 className="rvs-card-header__title">College Name</h2>
                <p className="rvs-card-header__sub">Address</p>
              </div>
              <div className="rvs-card-header__actions">
                <button
                  className="rvs-ai-btn"
                  onClick={() => setShowAIReport(true)}
                >
                  🤖 Generate AI Report
                </button>
                <button className="rvs-print-btn" onClick={handlePrint}>
                  Print Result
                </button>
              </div>
            </div>

            <div className="rvs-card-body">
              <div className="rvs-info-grid">
                {[
                  ["Name",        user.full_name],
                  ["Roll Number", user.roll],
                  ["Department",  deptName],
                  [
                    isSemesterBased ? "Semester" : "Year",
                    isSemesterBased
                      ? `Semester ${selectedPeriod}`
                      : `Year ${selectedPeriod}`
                  ],
                  ["Exam Term", examTerm],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="rvs-info-label">{label}</p>
                    <p className="rvs-info-value">{value}</p>
                  </div>
                ))}
              </div>

              <div className="rvs-table-wrap">
                <table className="rvs-table">
                  <thead>
                    <tr>
                      <th>S.No.</th>
                      <th className="left">Subject</th>
                      <th>Max Marks</th>
                      <th>Pass Marks</th>
                      <th>Obtained Marks</th>
                      <th>Grade</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => {
                      const obtained = parseFloat(r.marks || 0);
                      const passed   = obtained >= 40;
                      return (
                        <tr key={r.id}>
                          <td data-label="S.No.">{i + 1}</td>
                          <td data-label="Subject" className="left">{r.subject_name}</td>
                          <td data-label="Max Marks">100</td>
                          <td data-label="Pass Marks">40</td>
                          <td data-label="Obtained" className={passed ? "rvs-marks--pass" : "rvs-marks--fail"}>
                            {obtained}
                          </td>
                          <td data-label="Grade" className="rvs-grade-cell">{r.grade || "-"}</td>
                          <td data-label="Status">
                            <span
                              className={`rvs-status-badge ${
                                passed ? "rvs-status-badge--pass" : "rvs-status-badge--fail"
                              }`}
                            >
                              {passed ? "Pass" : "Fail"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2} className="label">Total Obtained / Max</td>
                      <td data-label="Total Max">{maxPossible}</td>
                      <td data-label="Min Pass Marks">—</td>
                      <td data-label="Total Obtained">{total}</td>
                      <td data-label="GPA">GPA: {gpa}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="rvs-summary">
                <div>
                  <p className="rvs-summary__label">Percentage</p>
                  <p className="rvs-summary__value">
                    {Number(percentage).toFixed(2)}%
                  </p>
                </div>
                <div className="rvs-summary__divider" />
                <div>
                  <p className="rvs-summary__label">GPA</p>
                  <p className="rvs-summary__value">{gpa}</p>
                </div>
                <div className="rvs-summary__divider" />
                <div>
                  <p className="rvs-summary__label">Result</p>
                  <p className={`rvs-summary__value ${isPass ? "rvs-summary__value--pass" : "rvs-summary__value--fail"}`}>
                    {isPass ? "Pass" : "Fail"}
                  </p>
                </div>
                <div className="rvs-summary__divider" />
                <div>
                  <p className="rvs-summary__label">Subjects</p>
                  <p className="rvs-summary__value">{results.length}</p>
                </div>
              </div>

            </div>
          </div>
        )}
      </div>

      {showAIReport && (
        <AIReportModal
          user={user}
          roll={user.roll}
          periodKey={isSemesterBased ? "semester" : "year"}
          periodValue={selectedPeriod}
          examTerm={selectedTerm}
          onClose={() => setShowAIReport(false)}
        />
      )}
    </div>
  );
}

export default ResultViewStudent;