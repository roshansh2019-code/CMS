import { useEffect, useState } from "react";
import axios from "axios";
import {
  FiBell, FiBookOpen, FiUser, FiCheckCircle,
  FiXCircle, FiAward, FiDollarSign, FiUsers,
  FiTrendingUp, FiAlertTriangle, FiRefreshCw,
  FiChevronLeft, FiChevronRight,
} from "react-icons/fi";
import { Users, GraduationCap, BookOpen, Building2 } from "lucide-react";
import {
  ResponsiveContainer,
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis,
  Tooltip, Legend, CartesianGrid,
} from "recharts";
import "./dashbord.css";
import AIChatbot from "./AIChatbot";

const API = `http://${window.location.hostname}:5000`;

const TIP = {
  contentStyle: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    boxShadow: "0 4px 8px rgba(0,0,0,0.08)",
  },
  labelStyle: { color: "#111827", fontWeight: 600 },
  itemStyle:  { color: "#6b7280" },
};

const COLORS_STATUS = ["#22c55e", "#ef4444"];
const COLORS_DEPT   = ["#2563eb", "#14b8a6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];
const ATT_COLORS    = ["#22c55e", "#ef4444"];
const FEE_COLORS    = ["#2563eb", "#f59e0b"];
const SUBJ_COLORS   = ["#2563eb", "#14b8a6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];
const MONTH_COLORS  = ["#2563eb", "#14b8a6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#84cc16", "#ec4899", "#0ea5e9", "#f97316", "#a855f7", "#10b981"];
const FEEDBACK_COLORS = { pending: "#f59e0b", approved: "#22c55e", rejected: "#ef4444" };

const normCode = (v) => String(v ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

const normPeriod = (v) => {
  const m = String(v ?? "").match(/\d+/);
  return m ? String(parseInt(m[0], 10)) : "";
};

const resolveDeptCode = (user, departments) => {
  const raw = user?.department ?? user?.department_code ?? user?.dept ?? "";
  const n = normCode(raw);
  const d = (departments || []).find(
    (x) =>
      normCode(x.department_code) === n ||
      normCode(x.department_name) === n ||
      (n && normCode(x.department_name).includes(n)) ||
      (n && n.includes(normCode(x.department_name)))
  );
  return d ? d.department_code : raw;
};

const deptMatches = (userCode, noticeDept) => {
  const u = normCode(userCode);
  const n = normCode(noticeDept);
  return !!u && !!n && (u === n || n.startsWith(u) || u.startsWith(n));
};

const LEVEL_COLORS = {
  "Excellent":         { bg: "#dcfce7", fg: "#166534" },
  "Good":              { bg: "#dbeafe", fg: "#1e40af" },
  "Average":           { bg: "#fef9c3", fg: "#854d0e" },
  "Needs Improvement": { bg: "#fee2e2", fg: "#b91c1c" },
};

const PREDICTIONS_PAGE_SIZE = 5;

function toBool(val) {
  if (val === null || val === undefined) return false;
  if (typeof val === "boolean") return val;
  if (typeof val === "number") return val !== 0;
  if (typeof val === "string") return val === "1" || val.toLowerCase() === "true";
  return Boolean(val);
}

const PieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, value }) => {
  if (percent < 0.06 || value === 0) return null;
  const R = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.6;
  return (
    <text
      x={cx + r * Math.cos(-midAngle * R)}
      y={cy + r * Math.sin(-midAngle * R)}
      fill="#fff" textAnchor="middle" dominantBaseline="central"
      fontSize={13} fontWeight={700}
    >
      {value}
    </text>
  );
};

const DashCard = ({ icon, label, value, color }) => (
  <div className="dash_card">
    <div className="dash_card_icon" style={{ background: color }}>{icon}</div>
    <div className="dash_card_info">
      <span className="dash_card_value">{value}</span>
      <span className="dash_card_label">{label}</span>
    </div>
  </div>
);

const ChartBox = ({ title, children, full = false }) => (
  <div className={`dash_box${full ? " dash_box_full" : ""}`}>
    <p className="dash_box_title">{title}</p>
    {children}
  </div>
);

const LevelBadge = ({ level }) => {
  const c = LEVEL_COLORS[level] || { bg: "#f3f4f6", fg: "#374151" };
  return (
    <span className="dash_level_badge" style={{ background: c.bg, color: c.fg }}>
      {level}
    </span>
  );
};

const PaginationBar = ({ currentPage, totalPages, onPageChange }) => {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div className="dash_pagination">
      <button
        type="button"
        className="dash_page_btn"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
      >
        <FiChevronLeft size={14} />
      </button>

      {pages.map((p) => (
        <button
          key={p}
          type="button"
          className={`dash_page_btn${p === currentPage ? " dash_page_btn--active" : ""}`}
          onClick={() => onPageChange(p)}
        >
          {p}
        </button>
      ))}

      <button
        type="button"
        className="dash_page_btn"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
      >
        <FiChevronRight size={14} />
      </button>
    </div>
  );
};

function PerformancePredictionCard({ roll }) {
  const [loading, setLoading] = useState(true);
  const [prediction, setPrediction] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!roll) return;
    let cancelled = false;

    axios.get(`${API}/predict-performance/${roll}`)
      .then(res => {
        if (cancelled) return;
        if (res.data?.success) {
          setPrediction(res.data.prediction);
        } else {
          setErrorMsg(res.data?.message || "Could not load prediction");
        }
      })
      .catch(() => { if (!cancelled) setErrorMsg("Could not load prediction"); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [roll]);

  return (
    <div className="dash_box dash_box_full">
      <div className="dash_profile_header">
        <FiTrendingUp size={20} />
        <h2 className="dash_profile_title">Performance Prediction</h2>
      </div>

      {loading && <div className="dash_empty">Loading prediction…</div>}

      {!loading && errorMsg && <div className="dash_empty">{errorMsg}</div>}

      {!loading && !errorMsg && prediction && prediction.status !== "ok" && (
        <div className="dash_empty">
          {prediction.message || "A prediction isn't available yet."}
        </div>
      )}

      {!loading && !errorMsg && prediction && prediction.status === "ok" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 34, fontWeight: 700, color: "var(--primary-color, #2563eb)", lineHeight: 1.1 }}>
                {prediction.predicted_percentage}%
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary, #6b7280)" }}>
                Predicted next-term percentage
              </div>
            </div>
            <LevelBadge level={prediction.performance_level} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary, #6b7280)" }}>
              Trend: {prediction.trend}
            </span>
          </div>

          <p style={{ fontSize: 14, lineHeight: 1.5, color: "var(--text-secondary, #374151)", margin: 0 }}>
            {prediction.explanation}
          </p>

          <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
            {prediction.disclaimer}
          </p>
        </div>
      )}
    </div>
  );
}

function PerformancePredictionsPanel() {
  const [loading, setLoading]   = useState(true);
  const [students, setStudents] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [atRiskOnly, setAtRiskOnly] = useState(false);
  const [retraining, setRetraining] = useState(false);
  const [retrainMsg, setRetrainMsg] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const load = () => {
    setLoading(true);
    setErrorMsg("");
    const query = atRiskOnly ? "?at_risk=true" : "";
    axios.get(`${API}/admin/performance-predictions${query}`)
      .then(res => {
        if (res.data?.success) {
          setStudents(res.data.students || []);
          setCurrentPage(1);
        } else {
          setErrorMsg(res.data?.message || "Could not load predictions");
        }
      })
      .catch(() => setErrorMsg("Could not load predictions"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [atRiskOnly]);

  const handleRetrain = () => {
    setRetraining(true);
    setRetrainMsg("");
    axios.post(`${API}/admin/performance-predictions/retrain`)
      .then(res => {
        if (res.data?.success) {
          setRetrainMsg(`Model retrained on ${res.data.trained_on_rows} records.`);
          load();
        } else {
          setRetrainMsg(res.data?.reason || "Not enough data to retrain yet.");
        }
      })
      .catch(err => {
        const serverMsg = err?.response?.data?.reason || err?.response?.data?.message;
        setRetrainMsg(serverMsg || "Retrain failed — check server logs.");
      })
      .finally(() => setRetraining(false));
  };

  const totalPages = Math.max(1, Math.ceil(students.length / PREDICTIONS_PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStudents = students.slice(
    (safePage - 1) * PREDICTIONS_PAGE_SIZE,
    safePage * PREDICTIONS_PAGE_SIZE
  );

  return (
    <ChartBox title="Student Performance Predictions" full>
      <div className="dash_toolbar">
        <label className="dash_checkbox_label">
          <input
            type="checkbox"
            checked={atRiskOnly}
            onChange={(e) => setAtRiskOnly(e.target.checked)}
          />
          Show only students needing attention
        </label>

        <button
          type="button"
          className="dash_btn_primary"
          onClick={handleRetrain}
          disabled={retraining}
        >
          <FiRefreshCw size={14} />
          {retraining ? "Retraining…" : "Retrain model"}
        </button>
      </div>

      {retrainMsg && <p className="dash_note">{retrainMsg}</p>}

      {loading && <div className="dash_empty">Loading predictions…</div>}
      {!loading && errorMsg && <div className="dash_empty">{errorMsg}</div>}
      {!loading && !errorMsg && students.length === 0 && (
        <div className="dash_empty">No students match this view yet.</div>
      )}

      {!loading && !errorMsg && students.length > 0 && (
        <>
          <div className="dash_table_wrap">
            <table className="dash_table dash_table--predictions">
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
                {pageStudents.map((s) => {
                  const p = s.prediction;
                  const ok = p?.status === "ok";
                  const attention = ok && p.performance_level === "Needs Improvement";
                  return (
                    <tr key={s.roll} className={attention ? "dash_row_attention" : undefined}>
                      <td>
                        <div className="dash_cell_student">
                          {attention && <FiAlertTriangle size={14} className="dash_cell_alert" />}
                          <span title={s.name}>{s.name}</span>
                        </div>
                      </td>
                      <td>{s.roll}</td>
                      <td className="dash_cell_ellipsis" title={s.department || ""}>
                        {s.department || "-"}
                      </td>
                      <td>{ok ? `${p.predicted_percentage}%` : "—"}</td>
                      <td>
                        {ok ? <LevelBadge level={p.performance_level} /> : <span className="dash_cell_muted">Not enough data</span>}
                      </td>
                      <td>{ok ? p.trend : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="dash_table_footer">
            <span>
              Showing {(safePage - 1) * PREDICTIONS_PAGE_SIZE + 1}
              –{Math.min(safePage * PREDICTIONS_PAGE_SIZE, students.length)} of {students.length} students
            </span>
          </div>

          <PaginationBar
            currentPage={safePage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </>
      )}
    </ChartBox>
  );
}

function AdmissionOverviewPanel() {
  const [loading, setLoading] = useState(true);
  const [applications, setApplications] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    axios.get(`${API}/applications`)
      .then(res => setApplications(Array.isArray(res.data) ? res.data : []))
      .catch(() => setErrorMsg("Could not load admission records"))
      .finally(() => setLoading(false));
  }, []);

  const statusPie = [
    {
      name: "Pending",
      value: applications.filter(a => (a.status || "pending").toLowerCase() === "pending").length,
      color: "#f59e0b",
    },
    {
      name: "Approved",
      value: applications.filter(a => (a.status || "").toLowerCase() === "approved").length,
      color: "#22c55e",
    },
    {
      name: "Rejected",
      value: applications.filter(a => (a.status || "").toLowerCase() === "rejected").length,
      color: "#ef4444",
    },
  ];

  const progressPie = [
    {
      name: "Not Submitted",
      value: applications.filter(a => !toBool(a.admission_submitted)).length,
      color: "#9ca3af",
    },
    {
      name: "Awaiting Verification",
      value: applications.filter(a => toBool(a.admission_submitted) && !toBool(a.documents_verified)).length,
      color: "#f59e0b",
    },
    {
      name: "Documents Verified",
      value: applications.filter(a => toBool(a.documents_verified)).length,
      color: "#7c3aed",
    },
  ];

  const hasStatusData = statusPie.some(d => d.value > 0);
  const hasProgressData = progressPie.some(d => d.value > 0);

  return (
    <div className="dash_row">
      <ChartBox title="Application History">
        {loading && <div className="dash_empty">Loading…</div>}
        {!loading && errorMsg && <div className="dash_empty">{errorMsg}</div>}
        {!loading && !errorMsg && !hasStatusData && (
          <div className="dash_empty">No applications yet.</div>
        )}
        {!loading && !errorMsg && hasStatusData && (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={statusPie} dataKey="value" nameKey="name"
                cx="50%" cy="50%" outerRadius={80} innerRadius={35}
                paddingAngle={4} labelLine={false} label={PieLabel}>
                {statusPie.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip {...TIP} formatter={(v, n) => [v, n]} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 13, color: "var(--text-secondary)" }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </ChartBox>

      <ChartBox title="Admission Feedback">
        {loading && <div className="dash_empty">Loading…</div>}
        {!loading && errorMsg && <div className="dash_empty">{errorMsg}</div>}
        {!loading && !errorMsg && !hasProgressData && (
          <div className="dash_empty">No approved applications yet.</div>
        )}
        {!loading && !errorMsg && hasProgressData && (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={progressPie} dataKey="value" nameKey="name"
                cx="50%" cy="50%" outerRadius={80} innerRadius={35}
                paddingAngle={4} labelLine={false} label={PieLabel}>
                {progressPie.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip {...TIP} formatter={(v, n) => [v, n]} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 13, color: "var(--text-secondary)" }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </ChartBox>

      <FeedbackOverviewPanel />
    </div>
  );
}

function FeedbackOverviewPanel() {
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    axios.get(`${API}/feedback`)
      .then(res => setFeedback(Array.isArray(res.data) ? res.data : []))
      .catch(() => setErrorMsg("Could not load feedback"))
      .finally(() => setLoading(false));
  }, []);

  const statusPie = ["pending", "approved", "rejected"].map(status => ({
    name: status.charAt(0).toUpperCase() + status.slice(1),
    value: feedback.filter(f => (f.status || "pending").toLowerCase() === status).length,
    color: FEEDBACK_COLORS[status],
  }));

  const avgRating = feedback.length > 0
    ? (feedback.reduce((s, f) => s + Number(f.rating || 0), 0) / feedback.length).toFixed(1)
    : null;

  const hasData = statusPie.some(d => d.value > 0);

  return (
    <ChartBox title="Feedback Overview">
      {loading && <div className="dash_empty">Loading…</div>}
      {!loading && errorMsg && <div className="dash_empty">{errorMsg}</div>}
      {!loading && !errorMsg && !hasData && (
        <div className="dash_empty">No feedback submitted yet.</div>
      )}
      {!loading && !errorMsg && hasData && (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={statusPie} dataKey="value" nameKey="name"
                cx="50%" cy="50%" outerRadius={80} innerRadius={35}
                paddingAngle={4} labelLine={false} label={PieLabel}>
                {statusPie.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip {...TIP} formatter={(v, n) => [v, n]} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 13, color: "var(--text-secondary)" }} />
            </PieChart>
          </ResponsiveContainer>
          {avgRating && (
            <p style={{ textAlign: "center", fontSize: 13, color: "var(--text-secondary, #6b7280)", marginTop: 8 }}>
              Average rating: <strong style={{ color: "var(--text-primary, #111827)" }}>{avgRating} / 5</strong> across {feedback.length} entries
            </p>
          )}
        </>
      )}
    </ChartBox>
  );
}

function AdminDashboard() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API}/dashboard`)
      .then(res => setData(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="dash_loading">Loading Dashboard…</div>;
  if (!data)   return <div className="dash_error">Failed to load data</div>;

  const { overview, students, teachers, departments, subjects_by_dept } = data;

  const studentStatus = [
    { name: "Verified",   value: Number(students?.verified   ?? 0) },
    { name: "Unverified", value: Number(students?.unverified ?? 0) },
  ];
  const teacherStatus = [
    { name: "Verified",   value: Number(teachers?.verified   ?? 0) },
    { name: "Unverified", value: Number(teachers?.unverified ?? 0) },
  ];
  const deptPie = (departments ?? []).map(d => ({
    name: d.name, value: Number(d.student_count ?? 0),
  }));
  const subjectRecord = (subjects_by_dept ?? []).map(s => ({
    department: s.department, subject_count: Number(s.subject_count ?? 0),
  }));
  const deptRecord = (departments ?? []).map(d => {
    const match = (subjects_by_dept ?? []).find(s => s.department === d.name);
    return {
      name:          d.name,
      student_count: Number(d.student_count ?? 0),
      subject_count: Number(match?.subject_count ?? 0),
    };
  });

  const cards = [
    { icon: <Users size={22} />,         label: "Students",    value: overview.students,    color: "var(--primary-color)"   },
    { icon: <GraduationCap size={22} />, label: "Teachers",    value: overview.teachers,    color: "var(--secondary-color)" },
    { icon: <Building2 size={22} />,     label: "Departments", value: overview.departments, color: "var(--accent-color)"    },
    { icon: <BookOpen size={22} />,      label: "Subjects",    value: overview.subjects,    color: "#8b5cf6"                },
  ];

  return (
    <div className="dash_container">
      <div className="dash_cards">
        {cards.map((c, i) => <DashCard key={i} {...c} />)}
      </div>

      <div className="dash_row">
        <ChartBox title="Students">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={studentStatus} dataKey="value" nameKey="name"
                cx="50%" cy="50%" outerRadius={80} innerRadius={35}
                paddingAngle={4} labelLine={false} label={PieLabel}>
                {studentStatus.map((_, i) => <Cell key={i} fill={COLORS_STATUS[i]} />)}
              </Pie>
              <Tooltip {...TIP} formatter={(v, n) => [v, n]} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 13, color: "var(--text-secondary)" }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartBox>

        <ChartBox title="Teachers">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={teacherStatus} dataKey="value" nameKey="name"
                cx="50%" cy="50%" outerRadius={80} innerRadius={35}
                paddingAngle={4} labelLine={false} label={PieLabel}>
                {teacherStatus.map((_, i) => <Cell key={i} fill={COLORS_STATUS[i]} />)}
              </Pie>
              <Tooltip {...TIP} formatter={(v, n) => [v, n]} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 13, color: "var(--text-secondary)" }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartBox>

        <ChartBox title="Students by Department">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={deptPie} dataKey="value" nameKey="name"
                cx="50%" cy="50%" outerRadius={80} innerRadius={35}
                paddingAngle={4} labelLine={false} label={PieLabel}>
                {deptPie.map((_, i) => <Cell key={i} fill={COLORS_DEPT[i % COLORS_DEPT.length]} />)}
              </Pie>
              <Tooltip {...TIP} formatter={(v, n) => [v, n]} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 13, color: "var(--text-secondary)" }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartBox>
      </div>

      <AdmissionOverviewPanel />

      {(departments ?? []).length > 0 && (
        <ChartBox title="Students per Department" full>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={departments} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis dataKey="name" tick={{ fill: "var(--text-secondary)", fontSize: 13 }} />
              <YAxis allowDecimals={false} tick={{ fill: "var(--text-secondary)", fontSize: 13 }} />
              <Tooltip {...TIP} />
              <Bar dataKey="student_count" name="Students" radius={[6,6,0,0]} maxBarSize={55}>
                {departments.map((_, i) => <Cell key={i} fill={COLORS_DEPT[i % COLORS_DEPT.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartBox>
      )}

      {subjectRecord.length > 0 && (
        <ChartBox title="Subject With Department" full>
          <div className="subj_grid">
            {subjectRecord.map((s, i) => (
              <div className="subj_chip" key={i}>
                <span className="subj_chip_dept">{s.department}</span>
                <span className="subj_chip_count">{s.subject_count}</span>
              </div>
            ))}
          </div>
        </ChartBox>
      )}

      {deptRecord.length > 0 && (
        <ChartBox title="Department Record(Subject/student)" full>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={deptRecord} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis dataKey="name" tick={{ fill: "var(--text-secondary)", fontSize: 13 }} />
              <YAxis allowDecimals={false} tick={{ fill: "var(--text-secondary)", fontSize: 13 }} />
              <Tooltip {...TIP} />
              <Legend wrapperStyle={{ fontSize: 13, color: "var(--text-secondary)" }} />
              <Bar dataKey="student_count" name="Students" fill="#2563eb" radius={[6,6,0,0]} maxBarSize={40} />
              <Bar dataKey="subject_count" name="Subjects"  fill="#f59e0b" radius={[6,6,0,0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </ChartBox>
      )}

      <PerformancePredictionsPanel />
    </div>
  );
}

function AssignedSubjectsPanel({ teacherId }) {
  const [loading, setLoading]   = useState(true);
  const [subjects, setSubjects] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!teacherId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    axios.get(`${API}/teacher/${teacherId}/subjects`)
      .then(res => {
        if (cancelled) return;
        setSubjects(res.data || []);
      })
      .catch(() => {
        if (!cancelled) setErrorMsg("Could not load assigned subjects");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [teacherId]);

  return (
    <div className="dash_box dash_box_full">
      <div className="dash_profile_header">
        <FiBookOpen size={20} />
        <h2 className="dash_profile_title">My Assigned Subjects</h2>
      </div>

      {loading && <div className="dash_empty">Loading assigned subjects…</div>}

      {!loading && errorMsg && <div className="dash_empty">{errorMsg}</div>}

      {!loading && !errorMsg && subjects.length === 0 && (
        <div className="dash_empty">No subjects assigned yet.</div>
      )}

      {!loading && !errorMsg && subjects.length > 0 && (
        <div className="dash_table_wrap">
          <table className="dash_table dash_table--subjects">
            <thead>
              <tr>
                <th>Department</th>
                <th>Sem / Year</th>
                <th>Subject</th>
                <th>Code</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((s) => (
                <tr key={s.id}>
                  <td>
                    <span className="dash_table_dept">{s.department_code}</span>
                  </td>
                  <td>{s.semester ? `Semester ${s.semester}` : s.year ? `Year ${s.year}` : "—"}</td>
                  <td className="dash_table_subject">{s.subject_name}</td>
                  <td>
                    <span className="dash_table_code">{s.subject_code}</span>
                  </td>
                  <td>
                    <span
                      className={`dash_table_badge ${
                        s.subject_type === "regular" ? "dash_table_badge--regular" : "dash_table_badge--elective"
                      }`}
                    >
                      {s.subject_type}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TeacherDashboard({ user }) {
  const [data, setData]               = useState(null);
  const [loading, setLoading]         = useState(true);
  const [noticeCount, setNoticeCount] = useState(0);

  useEffect(() => {
    const empId = user.employee_id ?? user.roll ?? user.id;
    const teacherName = String(user.full_name || user.name || "").trim();

    (async () => {
      let eventCount = 0;
      try {
        const res = await axios.get(`${API}/notice/event`);
        eventCount = (res.data || []).length;
      } catch {}

      let scheduleCount = 0;
      if (teacherName) {
        try {
          const res = await axios.get(`${API}/schedule`, { params: { teacher: teacherName } });
          scheduleCount = (res.data || []).length > 0 ? 1 : 0;
        } catch {}
      }

      setNoticeCount(eventCount + scheduleCount);
    })();

    axios.get(`${API}/teacher-dashboard/${empId}`)
      .then(res => setData(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) return <div className="dash_loading">Loading Dashboard…</div>;

  const overview    = data?.overview    ?? { subjects_taught: 0, students_evaluated: 0, results_entered: 0 };
  const teacherInfo = data?.teacher     ?? {};
  const statusPie   = [
    { name: "Pass", value: Number(data?.results_status?.pass ?? 0) },
    { name: "Fail", value: Number(data?.results_status?.fail ?? 0) },
  ];
  const subjectBar = data?.subject_wise   ?? [];
  const termBar    = data?.exam_term_wise ?? [];

  const cards = [
    { icon: <FiBookOpen size={22} />, label: "Subjects Taught",    value: overview.subjects_taught,    color: "var(--primary-color)"   },
    { icon: <FiUsers size={22} />,    label: "Total Students in class", value: overview.students_evaluated, color: "var(--secondary-color)" },
    { icon: <FiAward size={22} />,    label: "Results Entered",    value: overview.results_entered,    color: "var(--accent-color)"    },
    { icon: <FiBell size={22} />,     label: "Total Notices",      value: noticeCount,                 color: "#8b5cf6"                },
  ];

  return (
    <div className="dash_container">
      <div className="dash_cards">
        {cards.map((c, i) => <DashCard key={i} {...c} />)}
      </div>

      <div className="dash_row">
        {statusPie.some(d => d.value > 0) && (
          <ChartBox title="Results Status">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusPie} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" outerRadius={80} innerRadius={35}
                  paddingAngle={4} label={({ value }) => value}>
                  {statusPie.map((_, i) => <Cell key={i} fill={COLORS_STATUS[i]} />)}
                </Pie>
                <Tooltip {...TIP} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 13, color: "var(--text-secondary)" }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartBox>
        )}

        {subjectBar.length > 0 && (
          <ChartBox title="Subject with result">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={subjectBar} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis dataKey="subject_name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip {...TIP} />
                <Bar dataKey="result_count" name="Results" radius={[6,6,0,0]} maxBarSize={45}>
                  {subjectBar.map((_, i) => <Cell key={i} fill={SUBJ_COLORS[i % SUBJ_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
        )}

        {subjectBar.length > 0 && (
          <ChartBox title="Average Marks">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={subjectBar} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis dataKey="subject_name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip {...TIP} />
                <Bar dataKey="avg_marks" name="Avg Marks" fill="#8b5cf6" radius={[6,6,0,0]} maxBarSize={45} />
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
        )}
      </div>

      {termBar.length > 0 && (
        <ChartBox title="Results per Exam Term" full>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={termBar} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis dataKey="exam_term" tick={{ fontSize: 13 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 13 }} />
              <Tooltip {...TIP} />
              <Bar dataKey="result_count" name="Results" fill="#14b8a6" radius={[6,6,0,0]} maxBarSize={55} />
            </BarChart>
          </ResponsiveContainer>
        </ChartBox>
      )}

      <AssignedSubjectsPanel teacherId={user.id} />

      <div className="dash_box dash_box_full">
        <div className="dash_profile_header">
          <FiUser size={20} />
          <h2 className="dash_profile_title">Teacher Information</h2>
        </div>
        <div className="dash_profile_grid">
          {[
            ["Name",        teacherInfo.full_name || user.full_name],
            ["Employee ID", user.employee_id || user.roll || "-"],
            ["Department",  teacherInfo.department || user.department],
            ["Email",       teacherInfo.email || user.email || "-"],
            ["Phone",       teacherInfo.phone || user.phone || "-"],
          ].map(([label, val], i) => (
            <div key={i} className="dash_profile_item">
              <span className="dash_profile_label">{label}</span>
              <strong className="dash_profile_value">{val}</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StudentDashboard({ user }) {
  const [noticeCount, setNoticeCount]         = useState(0);
  const [examCount, setExamCount]             = useState(0);
  const [present, setPresent]                 = useState(0);
  const [absent, setAbsent]                   = useState(0);
  const [monthlyAttendance, setMonthlyAttendance] = useState([]);
  const [results, setResults]                 = useState([]);
  const [fees, setFees]                       = useState([]);
  const [loading, setLoading]                 = useState(true);

  useEffect(() => {
    const load = async () => {
      const [noticeRes, examRes, deptRes, resultRes] = await Promise.allSettled([
        axios.get(`${API}/notice/event`),
        axios.get(`${API}/notice/exam`),
        axios.get(`${API}/notice/departments`),
        user.roll
          ? axios.get(`${API}/notice/result`, { params: { roll: user.roll } })
          : Promise.resolve({ data: [] }),
      ]);

      const departments = deptRes.status === "fulfilled" ? (deptRes.value.data || []) : [];
      const userDeptCode = resolveDeptCode(user, departments);
      const userSemYear = normPeriod(user.semester ?? user.year);

      const eventCount = noticeRes.status === "fulfilled" ? (noticeRes.value.data || []).length : 0;

      let matchedExams = [];
      if (examRes.status === "fulfilled") {
        matchedExams = (examRes.value.data || []).filter((e) =>
          deptMatches(userDeptCode, e.department_code) &&
          normPeriod(e.semester_year) === userSemYear
        );
        setExamCount(matchedExams.length);
      }

      const resultCount =
        resultRes.status === "fulfilled" ? (resultRes.value.data || []).length : 0;

      let scheduleCount = 0;
      try {
        const schRes = await axios.get(`${API}/schedule/classes`);
        scheduleCount = (schRes.data || []).some(
          (r) => deptMatches(userDeptCode, r.department_code) && normPeriod(r.semester_year) === userSemYear
        ) ? 1 : 0;
      } catch {
        scheduleCount = 0;
      }

      setNoticeCount(eventCount + matchedExams.length + resultCount + scheduleCount);

      await Promise.allSettled([
        axios.get(`${API}/student-attendance-summary/${user.roll}`)
          .then(r => { setPresent(r.data.present || 0); setAbsent(r.data.absent || 0); }),
        axios.get(`${API}/student-attendance-monthly/${user.roll}`)
          .then(r => setMonthlyAttendance(r.data || [])),
        axios.get(`${API}/student-results/${user.roll}`)
          .then(r => setResults(r.data || [])),
        axios.get(`${API}/student-fees/${user.roll}`)
          .then(r => setFees(r.data || [])),
      ]);
      setLoading(false);
    };
    load();
  }, [user]);

  if (loading) return <div className="dash_loading">Loading Dashboard…</div>;

  const totalFee  = fees.length > 0 ? parseFloat(fees[0].total_fee) : 0;
  const totalPaid = fees.reduce((s, f) => s + parseFloat(f.amount_paid || 0), 0);
  const latestDue = fees.length > 0 ? parseFloat(fees[fees.length - 1].due_amount || 0) : 0;
  const dueAmount = Math.max(latestDue, 0);

  const groupedResults = results.reduce((acc, r) => {
    const key = `${r.exam_term}||${r.semester || "N/A"}`;
    if (!acc[key]) acc[key] = { exam_term: r.exam_term, semester: r.semester || "N/A", total: 0, count: 0, failed: false };
    const marks = parseFloat(r.marks || 0);
    acc[key].total += marks;
    acc[key].count += 1;
    if (marks < 40) acc[key].failed = true;
    return acc;
  }, {});

  const attendancePie = [
    { name: "Present", value: Number(present) },
    { name: "Absent",  value: Number(absent)  },
  ];
  const feesPie = [
    { name: "Paid", value: Number(totalPaid) },
    { name: "Due",  value: dueAmount },
  ];
  const resultsBar = Object.values(groupedResults).map(g => ({
    exam_term: g.exam_term, total: g.total, failed: g.failed,
  }));

  const monthlyPresentPie = monthlyAttendance.map(m => ({
    name: m.month_label,
    value: Number(m.present),
  }));
  const monthlyAbsentPie = monthlyAttendance.map(m => ({
    name: m.month_label,
    value: Number(m.absent),
  }));

  const feePercent = totalFee > 0 ? Math.round((totalPaid / totalFee) * 100) : 0;

  return (
    <div className="dash_container">
      <div className="dash_cards">
        <DashCard icon={<FiBell size={22}/>}        label="Total Notices"  value={noticeCount} color="#8b5cf6" />
        <DashCard icon={<FiBookOpen size={22}/>}    label="Exam Schedules" value={examCount}   color="var(--primary-color)" />
        <DashCard icon={<FiCheckCircle size={22}/>} label="Total Present"  value={present}     color="#22c55e" />
        <DashCard icon={<FiXCircle size={22}/>}     label="Total Absent"   value={absent}      color="#ef4444" />
      </div>

      <div className="dash_row">
        {attendancePie.some(d => d.value > 0) && (
          <ChartBox title="Attendance Overview">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={attendancePie} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" outerRadius={80} innerRadius={35}
                  paddingAngle={4} label={({ value }) => value}>
                  {attendancePie.map((_, i) => <Cell key={i} fill={ATT_COLORS[i]} />)}
                </Pie>
                <Tooltip {...TIP} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 13, color: "var(--text-secondary)" }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartBox>
        )}

        {fees.length > 0 && (
          <ChartBox title="Fee Status">
            <div className="fee_status_wrap">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={feesPie} dataKey="value" nameKey="name"
                    cx="50%" cy="50%" outerRadius={70} innerRadius={30}
                    paddingAngle={4} label={({ value }) => `Rs.${Number(value).toLocaleString()}`}
                    labelLine={false}>
                    {feesPie.map((_, i) => <Cell key={i} fill={FEE_COLORS[i]} />)}
                  </Pie>
                  <Tooltip {...TIP} formatter={v => `Rs. ${Number(v).toLocaleString()}`} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: "var(--text-secondary)" }} />
                </PieChart>
              </ResponsiveContainer>

              <div className="fee_progress_wrap">
                <div className="fee_progress_label">
                  <span>Payment Progress</span>
                  <span className="fee_progress_pct">{feePercent}%</span>
                </div>
                <div className="fee_progress_track">
                  <div className="fee_progress_fill" style={{ width: `${feePercent}%` }} />
                </div>
              </div>

              <div className="fee_stats_row">
                <div className="fee_stat fee_stat_total">
                  <span className="fee_stat_label">Total Fee</span>
                  <strong className="fee_stat_value">Rs. {totalFee.toLocaleString()}</strong>
                </div>
                <div className="fee_stat fee_stat_paid">
                  <span className="fee_stat_label">Paid</span>
                  <strong className="fee_stat_value">Rs. {totalPaid.toLocaleString()}</strong>
                </div>
                <div className="fee_stat fee_stat_due">
                  <span className="fee_stat_label">Due</span>
                  <strong className="fee_stat_value">Rs. {dueAmount.toLocaleString()}</strong>
                </div>
              </div>
            </div>
          </ChartBox>
        )}

        {resultsBar.length > 0 && (
          <ChartBox title="Results Status">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={resultsBar} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis dataKey="exam_term" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip {...TIP} />
                <Bar dataKey="total" name="Total Marks" radius={[6,6,0,0]} maxBarSize={50}>
                  {resultsBar.map((g, i) => <Cell key={i} fill={g.failed ? "#ef4444" : "#22c55e"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
        )}
      </div>

      {monthlyPresentPie.some(d => d.value > 0) && (
        <div className="dash_row">
          <ChartBox title="Monthly Present Record">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={monthlyPresentPie} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" outerRadius={85} innerRadius={40}
                  paddingAngle={4} labelLine={false} label={PieLabel}>
                  {monthlyPresentPie.map((_, i) => <Cell key={i} fill={MONTH_COLORS[i % MONTH_COLORS.length]} />)}
                </Pie>
                <Tooltip {...TIP} formatter={(v, n) => [v, n]} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: "var(--text-secondary)" }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartBox>

          <ChartBox title="Monthly Absent Record">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={monthlyAbsentPie} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" outerRadius={85} innerRadius={40}
                  paddingAngle={4} labelLine={false} label={PieLabel}>
                  {monthlyAbsentPie.map((_, i) => <Cell key={i} fill={MONTH_COLORS[i % MONTH_COLORS.length]} />)}
                </Pie>
                <Tooltip {...TIP} formatter={(v, n) => [v, n]} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: "var(--text-secondary)" }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartBox>
        </div>
      )}

      <PerformancePredictionCard roll={user.roll} />

      <div className="dash_box dash_box_full">
        <div className="dash_profile_header">
          <FiAward size={20} />
          <h2 className="dash_profile_title">My Results</h2>
        </div>
        {Object.keys(groupedResults).length === 0 ? (
          <div className="dash_empty">No Results Available</div>
        ) : (
          <div className="dash_result_groups">
            {Object.values(groupedResults).map((g, i) => (
              <div key={i} className={`dash_result_card ${g.failed ? "dash_result_fail" : "dash_result_pass"}`}>
                <div>
                  <div className="dash_result_term">{g.exam_term}</div>
                  <div className="dash_result_sem">Semester {g.semester}</div>
                </div>
                <div className="dash_result_right">
                  <div className="dash_result_marks">Total: <strong>{g.total.toFixed(0)}</strong></div>
                  <span className={`dash_result_badge ${g.failed ? "dash_badge_fail" : "dash_badge_pass"}`}>
                    {g.failed ? "FAIL" : "PASS"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="dash_box dash_box_full">
        <div className="dash_profile_header">
          <FiUser size={20} />
          <h2 className="dash_profile_title">Student Information</h2>
        </div>
        <div className="dash_profile_grid">
          {[
            ["Name",       user.full_name],
            ["Roll",       user.roll],
            ["Department", user.department],
            ["Semester",   user.semester || user.year],
            ["Email",      user.email || "-"],
            ["Phone",      user.phone  || "-"],
          ].map(([label, val], i) => (
            <div key={i} className="dash_profile_item">
              <span className="dash_profile_label">{label}</span>
              <strong className="dash_profile_value">{val}</strong>
            </div>
          ))}
        </div>
      </div>

      <AIChatbot user={user} />
    </div>
  );
}

function Dashbord() {
  const [user, setUser]   = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) {
      try { setUser(JSON.parse(stored)); } catch {}
    }
    setReady(true);
  }, []);

  if (!ready) return null;
  if (!user)  return <div className="dash_loading">Not logged in.</div>;

  const role = String(user.role || "").toLowerCase();

  if (role === "admin")   return <AdminDashboard />;
  if (role === "teacher") return <TeacherDashboard user={user} />;
  if (role === "student") return <StudentDashboard user={user} />;

  return <div className="dash_error">Unknown role: "{user.role}"</div>;
}

export default Dashbord;