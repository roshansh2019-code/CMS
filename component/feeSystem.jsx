import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import "./feeSystem.css";

const API = "http://127.0.0.1:5000";
const ROWS_PER_PAGE = 10;
const DEFAULT_FEE_TYPE = "practical fee";

const today = () => new Date().toISOString().split("T")[0];

const money = (n) =>
  `Rs. ${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const normalizeCode = (code) => (code || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

const getGrade = (dept) => {
  if (!dept || dept.course_type?.toLowerCase() !== "year") return null;
  const match = normalizeCode(dept.department_code).match(/(11|12)$/);
  return match ? Number(match[1]) : null;
};

const getInitials = (name) => {
  if (!name) return "?";
  const p = name.trim().split(/\s+/);
  return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : p[0][0].toUpperCase();
};

const emptyPayment = () => ({
  roll: "", student_name: "", department: "", semester_year: "",
  total_fee: "", due_remaining: "", amount_paid: "", payment_method: "Cash", payment_date: today()
});

const emptyStructure = () => ({ department: "", total_fee: "", date: today() });
const emptyAdditional = () => [{ type: DEFAULT_FEE_TYPE, amount: "" }];

const parseAdditional = (p) => {
  const arr = Array.isArray(p.additional_fees) ? p.additional_fees : [];
  const arrSum = arr.reduce((s, f) => s + num(f.amount), 0);
  if (arrSum > 0) return { fees: arr, sum: arrSum };
  if (p.remarks && p.remarks.includes(":")) {
    const fees = p.remarks
      .split(", ")
      .filter((x) => x.includes(": "))
      .map((item) => {
        const i = item.indexOf(": ");
        return { fee_type: item.slice(0, i).trim(), amount: num(item.slice(i + 2)) };
      })
      .filter((f) => f.amount > 0);
    return { fees, sum: fees.reduce((s, f) => s + f.amount, 0) };
  }
  return { fees: arr, sum: 0 };
};

const getRecordStatus = (rec) => {
  const baseFee = num(rec.total_fee);
  const paidFee = num(rec.amount_paid || rec.total_paid);
  const additionalTotal = num(rec.total_additional);
  const netDue = rec.due_amount !== undefined && rec.due_amount !== null ? num(rec.due_amount) : Math.max(0, baseFee - paidFee);
  const status = paidFee > 0 && netDue <= 0 ? "paid" : paidFee > 0 ? "partial" : "unpaid";
  return { baseFee, paidFee, additionalTotal, netDue, status };
};

const exportCsv = (filename, headers, rows) => {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const useDebounce = (value, delay = 300) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
};

const useEscape = (handler) => {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && handler();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handler]);
};

const useToast = () => {
  const [toast, setToast] = useState({ message: "", type: "success" });
  const timer = useRef(null);
  const dismiss = useCallback(() => setToast({ message: "", type: "success" }), []);
  const show = useCallback((message, type = "success") => {
    clearTimeout(timer.current);
    setToast({ message, type });
    timer.current = setTimeout(dismiss, 4500);
  }, [dismiss]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { toast, show, dismiss };
};

const useSort = (initialKey, initialDir = "desc") => {
  const [key, setKey] = useState(initialKey);
  const [dir, setDir] = useState(initialDir);
  const toggle = (k) => {
    if (k === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setKey(k); setDir("asc"); }
  };
  const apply = (rows, accessor) => {
    if (!key) return rows;
    const m = dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = accessor(a, key);
      const y = accessor(b, key);
      if (typeof x === "number" && typeof y === "number") return (x - y) * m;
      return String(x).localeCompare(String(y), undefined, { numeric: true }) * m;
    });
  };
  return { key, dir, toggle, apply };
};

const getPaginationSlots = (current, total, siblings = 1) => {
  const totalSlots = siblings * 2 + 5;
  const range = (s, e) => Array.from({ length: e - s + 1 }, (_, i) => s + i);
  if (total <= totalSlots) return range(1, total);
  const left = Math.max(current - siblings, 1);
  const right = Math.min(current + siblings, total);
  const dotsLeft = left > 2;
  const dotsRight = right < total - 1;
  const edge = 3 + siblings * 2;
  if (!dotsLeft && dotsRight) return [...range(1, edge), "...", total];
  if (dotsLeft && !dotsRight) return [1, "...", ...range(total - edge + 1, total)];
  return [1, "...", ...range(left, right), "...", total];
};

const Pagination = ({ total, page, onPageChange }) => {
  const totalPages = Math.ceil(total / ROWS_PER_PAGE);
  if (totalPages <= 1) return null;
  const slots = getPaginationSlots(page, totalPages);
  return (
    <div className="pagination-bar">
      <span className="pg-info">
        Showing {Math.min((page - 1) * ROWS_PER_PAGE + 1, total)}–{Math.min(page * ROWS_PER_PAGE, total)} of {total}
      </span>
      <div className="pg-controls">
        <button className="pg-btn" onClick={() => onPageChange(page - 1)} disabled={page === 1}>‹ Prev</button>
        {slots.map((p, i) =>
          p === "..." ? (
            <span key={`dots-${i}`} className="pg-dots">…</span>
          ) : (
            <button key={p} className={`pg-btn ${p === page ? "pg-btn-active" : ""}`} onClick={() => onPageChange(p)}>{p}</button>
          )
        )}
        <button className="pg-btn" onClick={() => onPageChange(page + 1)} disabled={page === totalPages}>Next ›</button>
      </div>
    </div>
  );
};

const Toast = ({ message, type, onClose }) => {
  if (!message) return null;
  return (
    <div className={`notification-banner ${type === "error" ? "banner-error" : "banner-success"}`} role="status" aria-live="polite">
      <span>{message}</span>
      <button className="toast-close" onClick={onClose} aria-label="Dismiss">✕</button>
    </div>
  );
};

const ConfirmModal = ({ data, onCancel }) => {
  const [busy, setBusy] = useState(false);
  useEscape(onCancel);
  if (!data) return null;
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-inner modal-inner-sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h2 className="modal-heading">{data.title}</h2>
        <p className="modal-desc">{data.message}</p>
        <div className="modal-btn-group">
          <button className="btn-modal-cancel" onClick={onCancel} disabled={busy}>Cancel</button>
          <button
            className="btn-modal-danger"
            disabled={busy}
            onClick={async () => { setBusy(true); await data.onConfirm(); setBusy(false); }}
          >
            {busy ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
};

const PRINT_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Arial,sans-serif;padding:30px;color:#111;background:#fff}
.receipt-wrapper{max-width:520px;margin:auto;border:1.5px solid #e5e7eb;border-radius:8px;overflow:hidden}
.receipt-header{background:#fff;border-bottom:2px solid #e5e7eb;color:#111;text-align:center;padding:22px 20px 18px}
.receipt-header .college-name{font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:.85;margin-bottom:6px}
.receipt-header h1{font-size:20px;font-weight:800;letter-spacing:2px;text-transform:uppercase}
.receipt-meta{display:flex;justify-content:space-between;background:#f5f7fb;padding:10px 18px;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb}
.receipt-body{padding:18px 20px}
.receipt-section{margin-bottom:14px}
.receipt-section-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#2563eb;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #e5e7eb}
.receipt-row{display:flex;justify-content:space-between;font-size:13px;padding:4px 0}
.receipt-row .label{color:#6b7280}
.receipt-row .value{font-weight:600;color:#111827}
.receipt-capitalize{text-transform:capitalize}
.receipt-summary{background:#f5f7fb;border-radius:6px;padding:14px 16px;margin-top:14px}
.summary-row{display:flex;justify-content:space-between;font-size:13px;padding:4px 0;color:#374151}
.summary-divider{border:none;border-top:1px solid #e5e7eb;margin:8px 0}
.summary-row.total-paid{font-size:15px;font-weight:800;color:#1e40af;padding:6px 0 2px}
.summary-row.due-row{font-size:13px;font-weight:700;padding:4px 0}
.due-red{color:#ef4444}
.due-green{color:#16a34a}
.receipt-footer{text-align:center;padding:14px 20px;border-top:1px solid #e5e7eb;background:#f9fafb;font-size:12px;color:#9ca3af}
.stamp{display:inline-block;background:#dcfce7;color:#15803d;border:1.5px solid #86efac;padding:4px 18px;border-radius:4px;font-weight:800;font-size:12px;letter-spacing:2px;margin-bottom:8px}
@media print{body{padding:10px}}
`;

export const ReceiptModal = ({ receipt, onClose, periodText }) => {
  const printRef = useRef(null);
  useEscape(onClose);
  if (!receipt) return null;

  const handlePrint = () => {
    const win = window.open("", "_blank", "width=680,height=800");
    if (!win) return;
    win.document.write(
      `<!DOCTYPE html><html><head><title>Payment Receipt</title><style>${PRINT_CSS}</style></head><body>${printRef.current.innerHTML}</body></html>`
    );
    win.document.close();
    win.focus();
    win.onload = () => { win.print(); win.close(); };
    setTimeout(() => { if (!win.closed) { win.print(); win.close(); } }, 500);
  };

  const paidAmount = num(receipt.amount_paid);
  const totalFee = num(receipt.total_fee);
  const { fees, sum } = parseAdditional(receipt);
  const additionalAmount = sum || num(receipt.additional_amount);
  const totalPaidToday = paidAmount + additionalAmount;
  const dueAmount = num(receipt.due_amount ?? Math.max(0, totalFee - paidAmount));
  const deptDisplay = receipt.department_name || receipt.department || receipt.department_code || "";
  const dateNow = new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-inner" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-btn-bar">
          <button onClick={handlePrint} className="btn-modal-print">Print / Save PDF</button>
          <button onClick={onClose} className="btn-modal-close">Close</button>
        </div>
        <div ref={printRef}>
          <div className="receipt-wrapper">
            <div className="receipt-header">
              <p className="college-name">College Management System</p>
              <h1>Payment Receipt</h1>
            </div>
            <div className="receipt-meta">
              <span>Receipt No: <strong>#{String(receipt.id || 0).padStart(6, "0")}</strong></span>
              <span>Date: <strong>{dateNow}</strong></span>
            </div>
            <div className="receipt-body">
              <div className="receipt-section">
                <div className="receipt-section-title">Student Information</div>
                <div className="receipt-row"><span className="label">Roll Number</span><span className="value">{receipt.roll}</span></div>
                <div className="receipt-row"><span className="label">Student Name</span><span className="value">{receipt.student_name || receipt.full_name || "—"}</span></div>
                <div className="receipt-row"><span className="label">Department</span><span className="value">{deptDisplay}</span></div>
                <div className="receipt-row"><span className="label">Semester / Year / Grade</span><span className="value">{periodText || receipt.semester_year || "—"}</span></div>
              </div>
              <div className="receipt-section">
                <div className="receipt-section-title">Payment Information</div>
                <div className="receipt-row"><span className="label">Payment Date</span><span className="value">{receipt.payment_date || "—"}</span></div>
                <div className="receipt-row"><span className="label">Payment Method</span><span className="value">{receipt.payment_method || "Cash"}</span></div>
              </div>
              <div className="receipt-summary">
                <div className="summary-row"><span>Program Fee (Total)</span><span>{money(totalFee)}</span></div>
                <div className="summary-row"><span>Program Fee Paid</span><span>{money(paidAmount)}</span></div>
                {fees.length > 0 && (
                  <>
                    <hr className="summary-divider" />
                    {fees.map((f, i) => (
                      <div className="summary-row additional" key={i}>
                        <span className="receipt-capitalize">{f.fee_type || f.type}</span>
                        <span>{money(f.amount)}</span>
                      </div>
                    ))}
                  </>
                )}
                <hr className="summary-divider" />
                <div className="summary-row total-paid"><span>Total Paid Today</span><span>{money(totalPaidToday)}</span></div>
                <div className={`summary-row due-row ${dueAmount > 0 ? "due-red" : "due-green"}`}>
                  <span>Program Fee Due</span><span>{money(dueAmount)}</span>
                </div>
              </div>
            </div>
            <div className="receipt-footer">
              {dueAmount <= 0 && <div className="stamp">PAID IN FULL</div>}
              <p>This is a computer-generated receipt. Please keep it for your records.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const EditFeeModal = ({ data, onClose, onSave }) => {
  const [newTotalFee, setNewTotalFee] = useState(String(data.total_fee || ""));
  const [reason, setReason] = useState("Scholarship");
  const [saving, setSaving] = useState(false);
  useEscape(onClose);

  const current = num(data.total_fee);
  const next = num(newTotalFee);
  const discount = Math.max(0, current - next);
  const increase = Math.max(0, next - current);
  const valid = newTotalFee !== "" && next >= 0 && next !== current;

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    await onSave({ roll: data.roll, new_total_fee: next, semester_year: data.semester_year, reason });
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-inner modal-inner-sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h2 className="modal-heading">Edit Student Fee</h2>
        <p className="modal-desc">Adjust total program fee (scholarship / discount)</p>
        <div className="modal-info-box">
          <div className="modal-info-row"><span className="modal-info-label">Student</span><strong>{data.student_name}</strong></div>
          <div className="modal-info-row"><span className="modal-info-label">Roll</span><strong>{data.roll}</strong></div>
          <div className="modal-info-row last"><span className="modal-info-label">Department / Period</span><strong>{data.department_name} / {data.period_text}</strong></div>
        </div>
        <div className="modal-field-group">
          <label className="field-label">Current Total Fee</label>
          <input readOnly value={money(current)} className="input-readonly-fee" />
        </div>
        <div className="modal-field-group">
          <label className="field-label">New Total Fee <span className="required-star">*</span></label>
          <input
            type="number" min="0" autoFocus value={newTotalFee}
            onChange={(e) => setNewTotalFee(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            className="input-new-fee" placeholder="Enter new total fee amount"
          />
          {discount > 0 && <p className="discount-text">Discount: {money(discount)} ({current ? Math.round((discount / current) * 100) : 0}%)</p>}
          {increase > 0 && <p className="increase-text">Increase: {money(increase)}</p>}
        </div>
        <div className="modal-field-group-last">
          <label className="field-label">Reason</label>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className="modal-select">
            <option>Scholarship</option><option>Fee Adjust</option><option>Special Discount</option><option>Other</option>
          </select>
        </div>
        <div className="modal-btn-group">
          <button onClick={onClose} className="btn-modal-cancel">Cancel</button>
          <button disabled={saving || !valid} onClick={submit} className="btn-modal-save">{saving ? "Saving..." : "Save Adjustment"}</button>
        </div>
      </div>
    </div>
  );
};

const StudentAvatar = ({ name, profileimg, roleColor = "#2563eb" }) => {
  const [imgError, setImgError] = useState(false);
  const avatarUrl = useMemo(() => (profileimg ? `${API}/uploads/${profileimg}?t=${Date.now()}` : null), [profileimg]);
  useEffect(() => { setImgError(false); }, [profileimg]);

  if (!imgError && avatarUrl) {
    return <img key={avatarUrl} className="fee-avatar-img" src={avatarUrl} alt={name} onError={() => setImgError(true)} />;
  }
  return <div className="fee-avatar-initials" style={{ background: roleColor }}>{getInitials(name)}</div>;
};

const StatCard = ({ label, value, sub, tone = "primary" }) => (
  <div className={`stat-card stat-${tone}`}>
    <span className="stat-card-label">{label}</span>
    <span className="stat-card-value">{value}</span>
    {sub && <span className="stat-card-sub">{sub}</span>}
  </div>
);

const SortTh = ({ label, k, sort, align = "" }) => (
  <th className={`sortable ${align}`} onClick={() => sort.toggle(k)} aria-sort={sort.key === k ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
    {label}<span className="sort-arrow">{sort.key === k ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
  </th>
);

const SkeletonRows = ({ cols, rows = 5 }) =>
  Array.from({ length: rows }, (_, r) => (
    <tr key={r} className="skeleton-row">
      {Array.from({ length: cols }, (_, c) => <td key={c}><div className="skeleton-bar" /></td>)}
    </tr>
  ));

export default function FeeSystem() {
  const { toast, show: showAlert, dismiss } = useToast();

  const [view, setView] = useState("payment");
  const [loading, setLoading] = useState(true);

  const [departments, setDepartments] = useState([]);
  const [students, setStudents] = useState([]);
  const [feeStructure, setFeeStructure] = useState([]);
  const [payments, setPayments] = useState([]);
  const [dashboardRecords, setDashboardRecords] = useState([]);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  const [editingStructureId, setEditingStructureId] = useState(null);
  const [editingPaymentId, setEditingPaymentId] = useState(null);
  const [receiptData, setReceiptData] = useState(null);
  const [editFeeModal, setEditFeeModal] = useState(null);
  const [confirmData, setConfirmData] = useState(null);
  const [expandedRows, setExpandedRows] = useState({});
  const [studentProfileImg, setStudentProfileImg] = useState(null);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [lookupState, setLookupState] = useState("idle");

  const [ledgerPage, setLedgerPage] = useState(1);
  const [structurePage, setStructurePage] = useState(1);
  const [dashboardPage, setDashboardPage] = useState(1);

  const [structure, setStructure] = useState(emptyStructure());
  const [payment, setPayment] = useState(emptyPayment());
  const [additionalFees, setAdditionalFees] = useState(emptyAdditional());

  const [filter, setFilter] = useState({ department: "", semester_year: "" });
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerMethod, setLedgerMethod] = useState("all");
  const [ledgerFrom, setLedgerFrom] = useState("");
  const [ledgerTo, setLedgerTo] = useState("");

  const ledgerSort = useSort("date", "desc");
  const dashSort = useSort("roll", "asc");

  const debouncedLedgerSearch = useDebounce(ledgerSearch);
  const debouncedSearch = useDebounce(searchQuery);
  const debouncedRoll = useDebounce(payment.roll, 350);

  const toggleExpand = (key) => setExpandedRows((prev) => ({ ...prev, [key]: !prev[key] }));

  const loadAll = useCallback(async () => {
    const [dept, stu, fee, pay] = await Promise.allSettled([
      axios.get(`${API}/departments`),
      axios.get(`${API}/students`),
      axios.get(`${API}/fee-structure`),
      axios.get(`${API}/student-fees`)
    ]);
    if (dept.status === "fulfilled") setDepartments(dept.value.data || []);
    if (stu.status === "fulfilled") setStudents((stu.value.data || []).filter((u) => (u.role || "").toLowerCase() === "student"));
    if (fee.status === "fulfilled") setFeeStructure(fee.value.data || []);
    setPayments(pay.status === "fulfilled" ? pay.value.data || [] : []);
    if ([dept, stu, fee, pay].some((r) => r.status === "rejected")) showAlert("Some data could not be loaded. Check the server connection.", "error");
    setLoading(false);
  }, [showAlert]);

  const fetchDashboardRecords = useCallback(async () => {
    setDashboardLoading(true);
    try {
      const res = await axios.get(`${API}/student-records`, {
        params: { department_code: filter.department, semester_year: filter.semester_year }
      });
      setDashboardRecords(res.data || []);
    } catch {
      setDashboardRecords([]);
      showAlert("Failed to load student records.", "error");
    } finally {
      setDashboardLoading(false);
    }
  }, [filter.department, filter.semester_year, showAlert]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (filter.department && filter.semester_year) fetchDashboardRecords();
    else setDashboardRecords([]);
  }, [filter.department, filter.semester_year, fetchDashboardRecords]);

  useEffect(() => { setLedgerPage(1); }, [debouncedLedgerSearch, ledgerMethod, ledgerFrom, ledgerTo, ledgerSort.key, ledgerSort.dir]);
  useEffect(() => { setDashboardPage(1); }, [debouncedSearch, statusFilter, filter, dashSort.key, dashSort.dir]);

  const findDepartment = (value) => {
    if (!value) return null;
    const clean = String(value).toLowerCase().trim();
    return departments.find(
      (d) =>
        String(d.department_name || "").toLowerCase().trim() === clean ||
        String(d.department_code || "").toLowerCase().trim() === clean
    );
  };

  const getCourseType = (v) => findDepartment(v)?.course_type || "semester";
  const getPeriodWord = (v) => (getCourseType(v) === "semester" ? "Semester" : getGrade(findDepartment(v)) ? "Grade" : "Year");

  const getSemYearOptions = (v) => {
    if (getCourseType(v) === "semester") return ["1", "2", "3", "4", "5", "6", "7", "8"];
    const grade = getGrade(findDepartment(v));
    return grade ? [String(grade)] : ["1", "2", "3", "4"];
  };

  const findDepartmentBaseFee = (v) => {
    if (!v) return 0;
    const clean = String(v).toLowerCase().trim();
    const match = feeStructure.find(
      (f) =>
        String(f.department || f.department_name || "").toLowerCase().trim() === clean ||
        String(f.department_code || "").toLowerCase().trim() === clean
    );
    return match ? num(match.total_fee) : 0;
  };

  const getStudentDueRemaining = (rollId, deptValue) => {
    const clean = String(rollId).toUpperCase().trim();
    const records = payments.filter((p) => String(p.roll).toUpperCase().trim() === clean);
    if (records.length > 0) {
      const latest = records.reduce((a, b) => ((b.id || 0) > (a.id || 0) ? b : a));
      return num(latest.due_amount);
    }
    return Math.max(0, findDepartmentBaseFee(deptValue));
  };

  const applyStudentCard = (stu, rollInput) => {
    const deptName = stu.department || "";
    const term = String(stu.semester !== null && stu.semester !== undefined && stu.semester !== "" ? stu.semester : stu.year || "1").trim();
    setPayment((prev) => ({
      ...emptyPayment(),
      roll: rollInput,
      student_name: stu.full_name || "",
      department: deptName,
      semester_year: term,
      total_fee: findDepartmentBaseFee(deptName),
      due_remaining: getStudentDueRemaining(String(rollInput).toUpperCase().trim(), deptName),
      payment_method: prev.payment_method,
      payment_date: prev.payment_date
    }));
    setStudentProfileImg(stu.profileimg || null);
    setLookupState("found");
  };

  useEffect(() => {
    if (editingPaymentId) return;
    const clean = String(debouncedRoll || "").trim().toUpperCase();
    if (!clean) { setLookupState("idle"); return; }

    let cancelled = false;
    const localStu = students.find((s) => String(s.roll).toUpperCase().trim() === clean);
    if (localStu) applyStudentCard(localStu, debouncedRoll);
    if (clean.length < 4) { if (!localStu) setLookupState("idle"); return; }

    setLookupState((s) => (s === "found" ? s : "searching"));
    (async () => {
      let found = null;
      try {
        const res = await axios.get(`${API}/profile/by-roll/${clean}`);
        if (res.data?.full_name) found = res.data;
      } catch {
        try {
          const res2 = await axios.get(`${API}/student-info/${clean}`);
          const s2 = res2.data?.student || res2.data;
          if (s2?.full_name) found = s2;
        } catch {}
      }
      if (cancelled) return;
      if (found) applyStudentCard(found, debouncedRoll);
      else if (!localStu) {
        setLookupState("notfound");
        setStudentProfileImg(null);
        setPayment((prev) => ({ ...prev, student_name: "", department: "", semester_year: "", total_fee: "", due_remaining: "" }));
      }
    })();
    return () => { cancelled = true; };
  }, [debouncedRoll, editingPaymentId, students.length]);

  const handleRollChange = (value) => {
    setPayment((prev) => ({ ...prev, roll: value }));
    if (!value.trim()) {
      setStudentProfileImg(null);
      setPayment((prev) => ({ ...emptyPayment(), payment_method: prev.payment_method, payment_date: prev.payment_date }));
    }
  };

  const saveStructureSetup = async () => {
    if (!structure.department || !structure.total_fee || !structure.date) {
      showAlert("Please fill out all structure fields.", "error");
      return;
    }
    if (num(structure.total_fee) <= 0) {
      showAlert("Total fee must be greater than zero.", "error");
      return;
    }
    const deptInfo = findDepartment(structure.department);
    const duplicate = feeStructure.find(
      (f) =>
        f.id !== editingStructureId &&
        String(f.department || f.department_name || "").toLowerCase() === structure.department.toLowerCase()
    );
    if (duplicate) {
      showAlert("A fee structure already exists for this department. Edit it instead.", "error");
      return;
    }
    try {
      const body = {
        department_id: deptInfo?.id || null,
        department: structure.department,
        department_code: deptInfo?.department_code || "",
        total_fee: num(structure.total_fee),
        create_date: structure.date
      };
      if (editingStructureId) {
        await axios.put(`${API}/fee-structure/${editingStructureId}`, body);
        showAlert("Fee structure updated.");
        setEditingStructureId(null);
      } else {
        await axios.post(`${API}/fee-structure`, body);
        showAlert("Fee structure saved.");
      }
      setStructure(emptyStructure());
      loadAll();
    } catch (err) {
      showAlert(err?.response?.data?.message || "Failed to save fee structure.", "error");
    }
  };

  const startEditStructure = (item) => {
    setEditingStructureId(item.id);
    setStructure({
      department: item.department || item.department_name || item.department_code || "",
      total_fee: item.total_fee,
      date: (item.create_date || item.created_at || "").split(" ")[0] || today()
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteStructure = (id) =>
    setConfirmData({
      title: "Delete fee structure?",
      message: "This removes the fee structure for the department. Existing payments are not affected.",
      onConfirm: async () => {
        try {
          await axios.delete(`${API}/fee-structure/${id}`);
          showAlert("Fee structure deleted.");
          loadAll();
        } catch {
          showAlert("Error deleting fee structure.", "error");
        }
        setConfirmData(null);
      }
    });

  const addAdditionalFeeField = () => setAdditionalFees((prev) => [...prev, { type: DEFAULT_FEE_TYPE, amount: "" }]);
  const changeAdditionalFee = (index, field, value) =>
    setAdditionalFees((prev) => prev.map((f, i) => (i === index ? { ...f, [field]: value } : f)));
  const removeAdditionalFee = (index) => setAdditionalFees((prev) => prev.filter((_, i) => i !== index));

  const resetPaymentForm = () => {
    setEditingPaymentId(null);
    setStudentProfileImg(null);
    setLookupState("idle");
    setPayment(emptyPayment());
    setAdditionalFees(emptyAdditional());
  };

  const savePaymentTransaction = async () => {
    if (submittingPayment) return;
    if (!payment.roll || !payment.department || !payment.amount_paid) {
      showAlert("Please fill in Roll Number, Department, and Amount.", "error");
      return;
    }
    if (!payment.student_name) {
      showAlert("Student not found. Check the roll number.", "error");
      return;
    }
    const paying = num(payment.amount_paid);
    if (paying <= 0) {
      showAlert("Pay amount must be greater than zero.", "error");
      return;
    }
    if (!editingPaymentId && paying > num(payment.due_remaining)) {
      showAlert(`Pay amount cannot exceed the current due (${money(payment.due_remaining)}).`, "error");
      return;
    }
    if (additionalFees.some((f) => f.amount !== "" && num(f.amount) < 0)) {
      showAlert("Additional charges cannot be negative.", "error");
      return;
    }

    const filled = additionalFees.filter((f) => f.amount !== "" && num(f.amount) > 0);
    const additionalSum = filled.reduce((s, f) => s + num(f.amount), 0);
    const deptInfo = findDepartment(payment.department);
    const totalFee = findDepartmentBaseFee(payment.department);

    setSubmittingPayment(true);
    try {
      const payload = {
        roll: payment.roll.trim().toUpperCase(),
        student_name: payment.student_name,
        department_name: deptInfo?.department_name || payment.department,
        department_code: deptInfo?.department_code || "",
        semester_year: payment.semester_year || "1",
        total_fee: totalFee,
        amount_paid: paying,
        payment_method: payment.payment_method,
        payment_date: payment.payment_date,
        additional_amount: additionalSum,
        remarks: filled.map((f) => `${f.type}: ${f.amount}`).join(", "),
        additional_fees: filled.map((f) => ({ fee_type: f.type, amount: num(f.amount) }))
      };
      if (editingPaymentId) {
        await axios.put(`${API}/student-fees/${editingPaymentId}`, payload);
        showAlert("Payment record updated.");
      } else {
        const res = await axios.post(`${API}/student-fees`, payload);
        const saved = res.data?.record || res.data;
        const dueAmount = res.data?.due_amount ?? Math.max(0, totalFee - paying);
        showAlert(`Payment saved. Remaining due: ${money(dueAmount)}`);
        if (saved?.id) setReceiptData({ ...payload, id: saved.id, due_amount: dueAmount });
      }
      resetPaymentForm();
      loadAll();
    } catch (err) {
      showAlert(err?.response?.data?.message || "Error saving payment.", "error");
    } finally {
      setSubmittingPayment(false);
    }
  };

  const startEditPayment = (p) => {
    setEditingPaymentId(p.id);
    setView("payment");
    const deptValue = p.department_name || p.department || p.department_code || "";
    setPayment({
      roll: p.roll,
      student_name: p.student_name || "",
      department: deptValue,
      semester_year: p.semester_year || "",
      total_fee: findDepartmentBaseFee(deptValue) || num(p.total_fee),
      due_remaining: num(p.due_amount),
      amount_paid: p.amount_paid,
      payment_method: p.payment_method || "Cash",
      payment_date: p.payment_date
    });
    setLookupState("found");

    const editRoll = String(p.roll).toUpperCase().trim();
    const localStu = students.find((s) => String(s.roll).toUpperCase().trim() === editRoll);
    setStudentProfileImg(localStu?.profileimg || null);
    axios
      .get(`${API}/profile/by-roll/${editRoll}`)
      .then((res) => { if (res.data?.profileimg !== undefined) setStudentProfileImg(res.data.profileimg || null); })
      .catch(() =>
        axios
          .get(`${API}/student-info/${editRoll}`)
          .then((r) => {
            const s = r.data?.student || r.data;
            if (s?.profileimg !== undefined) setStudentProfileImg(s.profileimg || null);
          })
          .catch(() => {})
      );

    const { fees } = parseAdditional(p);
    setAdditionalFees(
      fees.length > 0
        ? fees.map((f) => ({ type: f.fee_type || f.type || "other", amount: String(f.amount || "") }))
        : emptyAdditional()
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deletePayment = (id) =>
    setConfirmData({
      title: "Delete payment record?",
      message: "This permanently removes the payment and recalculates the student's due.",
      onConfirm: async () => {
        try {
          await axios.delete(`${API}/student-fees/${id}`);
          showAlert("Payment record deleted.");
          if (editingPaymentId === id) resetPaymentForm();
          loadAll();
        } catch {
          showAlert("Error deleting payment.", "error");
        }
        setConfirmData(null);
      }
    });

  const saveFeeOverride = async ({ roll, new_total_fee, semester_year, reason }) => {
    try {
      await axios.put(`${API}/student-fee-override`, { roll, new_total_fee, semester_year, reason });
      showAlert(`Fee adjusted to ${money(new_total_fee)} for ${roll} (${reason})`);
      setEditFeeModal(null);
      fetchDashboardRecords();
      loadAll();
    } catch (err) {
      showAlert(err?.response?.data?.message || "Failed to save fee adjustment.", "error");
    }
  };

  const filteredPayments = useMemo(() => {
    const q = debouncedLedgerSearch.toLowerCase().trim();
    const rows = payments.filter((p) => {
      if (ledgerMethod !== "all" && (p.payment_method || "Cash") !== ledgerMethod) return false;
      if (ledgerFrom && (p.payment_date || "") < ledgerFrom) return false;
      if (ledgerTo && (p.payment_date || "") > ledgerTo) return false;
      if (!q) return true;
      return (
        String(p.roll || "").toLowerCase().includes(q) ||
        String(p.student_name || "").toLowerCase().includes(q) ||
        String(p.department_name || p.department || "").toLowerCase().includes(q)
      );
    });
    return ledgerSort.apply(rows, (r, k) => {
      if (k === "roll") return String(r.roll || "");
      if (k === "name") return String(r.student_name || "");
      if (k === "paid") return num(r.amount_paid);
      if (k === "date") return `${r.payment_date || ""}-${String(r.id || 0).padStart(9, "0")}`;
      return "";
    });
  }, [payments, debouncedLedgerSearch, ledgerMethod, ledgerFrom, ledgerTo, ledgerSort.key, ledgerSort.dir]);

  const pagedPayments = filteredPayments.slice((ledgerPage - 1) * ROWS_PER_PAGE, ledgerPage * ROWS_PER_PAGE);
  const pagedStructure = feeStructure.slice((structurePage - 1) * ROWS_PER_PAGE, structurePage * ROWS_PER_PAGE);

  const dashboardRows = useMemo(() => dashboardRecords.map((r) => ({ rec: r, ...getRecordStatus(r) })), [dashboardRecords]);

  const dashboardCounts = useMemo(
    () => ({
      paid: dashboardRows.filter((r) => r.status === "paid").length,
      partial: dashboardRows.filter((r) => r.status === "partial").length,
      unpaid: dashboardRows.filter((r) => r.status === "unpaid").length
    }),
    [dashboardRows]
  );

  const dashboardTotals = useMemo(
    () => ({
      fee: dashboardRows.reduce((s, r) => s + r.baseFee, 0),
      paid: dashboardRows.reduce((s, r) => s + r.paidFee, 0),
      due: dashboardRows.reduce((s, r) => s + r.netDue, 0),
      additional: dashboardRows.reduce((s, r) => s + r.additionalTotal, 0)
    }),
    [dashboardRows]
  );

  const filteredDashboard = useMemo(() => {
    const q = debouncedSearch.toLowerCase().trim();
    const rows = dashboardRows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        String(r.rec.roll || "").toLowerCase().includes(q) ||
        String(r.rec.student_name || r.rec.full_name || "").toLowerCase().includes(q)
      );
    });
    return dashSort.apply(rows, (r, k) => {
      if (k === "roll") return String(r.rec.roll || "");
      if (k === "name") return String(r.rec.student_name || r.rec.full_name || "");
      if (k === "fee") return r.baseFee;
      if (k === "paid") return r.paidFee;
      if (k === "due") return r.netDue;
      return "";
    });
  }, [dashboardRows, debouncedSearch, statusFilter, dashSort.key, dashSort.dir]);

  const pagedDashboard = filteredDashboard.slice((dashboardPage - 1) * ROWS_PER_PAGE, dashboardPage * ROWS_PER_PAGE);

  const ledgerStats = useMemo(() => {
    const t = today();
    const collected = payments.reduce((s, p) => s + num(p.amount_paid), 0);
    const todays = payments.filter((p) => p.payment_date === t).reduce((s, p) => s + num(p.amount_paid), 0);
    const online = payments.filter((p) => p.payment_method === "Online").reduce((s, p) => s + num(p.amount_paid), 0);
    const cash = collected - online;
    const outstanding = feeStructure.length
      ? Object.values(
          payments.reduce((acc, p) => {
            const key = String(p.roll).toUpperCase();
            if (!acc[key] || (p.id || 0) > (acc[key].id || 0)) acc[key] = p;
            return acc;
          }, {})
        ).reduce((s, p) => s + num(p.due_amount), 0)
      : 0;
    return { collected, todays, online, cash, outstanding, count: payments.length };
  }, [payments, feeStructure.length]);

  const exportLedger = () => {
    if (!filteredPayments.length) return showAlert("Nothing to export.", "error");
    exportCsv(
      `payment-ledger-${today()}.csv`,
      ["Receipt", "Roll", "Student", "Department", "Period", "Paid", "Additional", "Method", "Date"],
      filteredPayments.map((p) => [
        p.id, p.roll, p.student_name || p.full_name, p.department_name || p.department || p.department_code,
        p.semester_year, num(p.amount_paid).toFixed(2), parseAdditional(p).sum.toFixed(2), p.payment_method || "Cash", p.payment_date
      ])
    );
  };

  const exportDashboard = () => {
    if (!filteredDashboard.length) return showAlert("Nothing to export.", "error");
    exportCsv(
      `student-records-${filter.department}-${filter.semester_year}-${today()}.csv`,
      ["Roll", "Name", "Department", "Total Fee", "Additional", "Paid", "Due", "Status"],
      filteredDashboard.map((r) => [
        r.rec.roll, r.rec.student_name || r.rec.full_name, r.rec.department_name || r.rec.department || filter.department,
        r.baseFee.toFixed(2), r.additionalTotal.toFixed(2), r.paidFee.toFixed(2), r.netDue.toFixed(2), r.status.toUpperCase()
      ])
    );
  };

  const clearLedgerFilters = () => {
    setLedgerSearch(""); setLedgerMethod("all"); setLedgerFrom(""); setLedgerTo("");
  };

  const ledgerFiltered = ledgerSearch || ledgerMethod !== "all" || ledgerFrom || ledgerTo;

  const liveTotal = num(payment.total_fee);
  const liveDue = num(payment.due_remaining);
  const livePaying = num(payment.amount_paid);
  const liveAddl = additionalFees.reduce((s, f) => s + num(f.amount), 0);
  const liveAfterPay = editingPaymentId ? liveDue : Math.max(0, liveDue - livePaying);
  const overpaying = !editingPaymentId && livePaying > liveDue && liveDue >= 0 && payment.student_name;
  const paidPercent = liveTotal > 0 ? Math.min(100, Math.round(((liveTotal - liveAfterPay) / liveTotal) * 100)) : 0;

  const paymentPeriodWord = getPeriodWord(payment.department);
  const filterPeriodWord = getPeriodWord(filter.department);
  const receiptPeriodText =
    receiptData && receiptData.semester_year
      ? `${getPeriodWord(receiptData.department_name || receiptData.department || receiptData.department_code)} ${receiptData.semester_year}`
      : "";

  const collectionRate = dashboardTotals.fee > 0 ? Math.min(100, Math.round((dashboardTotals.paid / dashboardTotals.fee) * 100)) : 0;

  return (
    <div className="fee-system-container">
      <Toast message={toast.message} type={toast.type} onClose={dismiss} />
      {receiptData && <ReceiptModal receipt={receiptData} periodText={receiptPeriodText} onClose={() => setReceiptData(null)} />}
      {editFeeModal && <EditFeeModal data={editFeeModal} onClose={() => setEditFeeModal(null)} onSave={saveFeeOverride} />}
      {confirmData && <ConfirmModal data={confirmData} onCancel={() => setConfirmData(null)} />}

      <div className="nav-bar" role="tablist">
        {[["payment", "Student Payment"], ["structure", "Fee Structure"], ["report", "Record Dashboard"]].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={view === id} onClick={() => setView(id)} className={`nav-btn ${view === id ? "active-nav" : ""}`}>
            {label}
          </button>
        ))}
      </div>

      {view === "payment" && (
        <div className="panel-layout">
          <div className="stat-grid">
            <StatCard label="Total Collected" value={money(ledgerStats.collected)} sub={`${ledgerStats.count} transaction${ledgerStats.count !== 1 ? "s" : ""}`} tone="success" />
            <StatCard label="Collected Today" value={money(ledgerStats.todays)} tone="primary" />
            <StatCard label="Cash / Online" value={`${money(ledgerStats.cash)}`} sub={`Online ${money(ledgerStats.online)}`} tone="amber" />
            <StatCard label="Outstanding Dues" value={money(ledgerStats.outstanding)} sub="Across students with payments" tone="danger" />
          </div>

          <div className="pf-wrapper">
            <div className="pf-header">
              <div className="pf-header-left">
                <h2 className="pf-title">{editingPaymentId ? "Edit Payment Record" : "Student Fee Payment"}</h2>
              </div>
              {editingPaymentId && <div className="pf-edit-badge">Editing #{editingPaymentId}</div>}
            </div>

            <div className="pf-body">
              <div className="pf-fields">
                <div className="pf-section">
                  <div className="pf-section-label">Student Information</div>
                  <div className="pf-grid-2">
                    <div className="pf-field pf-field-highlight">
                      <label className="pf-label" htmlFor="roll-input">Roll Number <span className="req">*</span></label>
                      <input
                        id="roll-input"
                        className="pf-input pf-input-mono pf-input-primary"
                        placeholder="e.g. 00000"
                        value={payment.roll}
                        onChange={(e) => handleRollChange(e.target.value)}
                        disabled={!!editingPaymentId}
                        autoComplete="off"
                        autoFocus
                      />
                      {lookupState === "searching" && <div className="pf-lookup-chip chip-searching">Searching...</div>}
                      {lookupState === "found" && payment.student_name && <div className="pf-autofill-chip">Auto-detected</div>}
                      {lookupState === "notfound" && <div className="pf-lookup-chip chip-notfound">No student found</div>}
                    </div>
                    <div className="pf-field">
                      <label className="pf-label">Full Name</label>
                      <input className="pf-input pf-input-readonly" value={payment.student_name} readOnly placeholder="Auto-filled from roll" />
                    </div>
                    <div className="pf-field">
                      <label className="pf-label">Department</label>
                      <input className="pf-input pf-input-readonly" value={payment.department} readOnly placeholder="Auto-filled from roll" />
                    </div>
                    <div className="pf-field">
                      <label className="pf-label">{paymentPeriodWord}</label>
                      <input className="pf-input pf-input-readonly" value={payment.semester_year ? `${paymentPeriodWord} ${payment.semester_year}` : ""} readOnly placeholder="Auto-filled" />
                    </div>
                  </div>
                </div>

                <div className="pf-section">
                  <div className="pf-section-label">Payment Details</div>
                  <div className="pf-grid-2">
                    <div className="pf-field">
                      <label className="pf-label">Due Remaining</label>
                      <input
                        className={`pf-input pf-input-readonly pf-input-due ${liveDue > 0 ? "due-warning" : "due-clear"}`}
                        value={payment.due_remaining !== "" && payment.due_remaining !== undefined ? money(payment.due_remaining) : ""}
                        readOnly placeholder="Rs. 0.00"
                      />
                    </div>
                    <div className="pf-field pf-field-highlight">
                      <label className="pf-label">Pay Amount <span className="req">*</span></label>
                      <div className="pf-money-wrap">
                        <input
                          className={`pf-input pf-input-money ${overpaying ? "input-invalid" : ""}`}
                          type="number" min="0" placeholder="0.00"
                          value={payment.amount_paid}
                          onChange={(e) => setPayment({ ...payment, amount_paid: e.target.value })}
                          onKeyDown={(e) => e.key === "Enter" && savePaymentTransaction()}
                        />
                        {!editingPaymentId && liveDue > 0 && (
                          <button type="button" className="pf-fill-btn" onClick={() => setPayment({ ...payment, amount_paid: String(liveDue) })}>Full due</button>
                        )}
                      </div>
                      {overpaying && <span className="field-error">Exceeds due by {money(livePaying - liveDue)}</span>}
                    </div>
                    <div className="pf-field">
                      <label className="pf-label">Payment Method</label>
                      <div className="pf-method-toggle">
                        <button type="button" className={`pf-method-btn ${payment.payment_method === "Cash" ? "method-active" : ""}`} onClick={() => setPayment({ ...payment, payment_method: "Cash" })}>Cash</button>
                        <button type="button" className={`pf-method-btn ${payment.payment_method === "Online" ? "method-active method-online" : ""}`} onClick={() => setPayment({ ...payment, payment_method: "Online" })}>Online</button>
                      </div>
                    </div>
                    <div className="pf-field">
                      <label className="pf-label">Payment Date</label>
                      <input className="pf-input" type="date" max={today()} value={payment.payment_date} onChange={(e) => setPayment({ ...payment, payment_date: e.target.value })} />
                    </div>
                  </div>
                </div>

                <div className="pf-section">
                  <div className="pf-section-header">
                    <div className="pf-section-label">Additional Charges</div>
                    <button type="button" onClick={addAdditionalFeeField} className="pf-add-fee-btn">+ Add</button>
                  </div>
                  <div className="pf-additional-list">
                    {additionalFees.map((fee, idx) => (
                      <div key={idx} className="pf-additional-row">
                        <select className="pf-input pf-select pf-additional-type" value={fee.type || DEFAULT_FEE_TYPE} onChange={(e) => changeAdditionalFee(idx, "type", e.target.value)}>
                          <option value="practical fee">Practical Fee</option>
                          <option value="exam fee">Exam Fee</option>
                          <option value="library fee">Library Fee</option>
                          <option value="sports fee">Sports Fee</option>
                          <option value="other">Other</option>
                        </select>
                        <input className="pf-input pf-input-money-sm" type="number" min="0" placeholder="0.00" value={fee.amount} onChange={(e) => changeAdditionalFee(idx, "amount", e.target.value)} />
                        <button type="button" onClick={() => removeAdditionalFee(idx)} className="pf-remove-btn" disabled={additionalFees.length === 1} title="Remove" aria-label="Remove charge">✕</button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pf-actions">
                  <button onClick={savePaymentTransaction} className="pf-submit-btn" disabled={submittingPayment}>
                    {submittingPayment ? "Saving..." : editingPaymentId ? "Update Payment" : "Submit Payment"}
                  </button>
                  {(editingPaymentId || payment.roll) && (
                    <button onClick={resetPaymentForm} className="pf-cancel-btn" disabled={submittingPayment}>
                      {editingPaymentId ? "Cancel Edit" : "Clear"}
                    </button>
                  )}
                </div>
              </div>

              <div className="pf-summary">
                <div className="pf-summary-header">Payment Summary</div>
                <div className="pf-progress-ring-wrap">
                  <svg className="pf-ring" viewBox="0 0 100 100">
                    <circle className="ring-bg" cx="50" cy="50" r="40" />
                    <circle
                      className="ring-fill" cx="50" cy="50" r="40"
                      strokeDasharray={`${paidPercent * 2.513} 251.3`}
                      style={{ stroke: paidPercent === 100 ? "var(--success-color)" : "var(--primary-color)" }}
                    />
                  </svg>
                  <div className="pf-ring-label">
                    <span className="ring-pct">{paidPercent}%</span>
                    <span className="ring-sub">paid</span>
                  </div>
                </div>

                <div className="pf-summary-rows">
                  <div className="pf-sum-row"><span className="sum-label">Program Fee</span><span className="sum-val">{money(liveTotal)}</span></div>
                  <div className="pf-sum-row"><span className="sum-label">Current Due</span><span className={`sum-val ${liveDue > 0 ? "sum-red" : "sum-green"}`}>{money(liveDue)}</span></div>
                  <div className="pf-sum-row"><span className="sum-label">Paying Now</span><span className="sum-val sum-primary">{money(livePaying)}</span></div>
                  {liveAddl > 0 && <div className="pf-sum-row"><span className="sum-label">Additional</span><span className="sum-val sum-accent">{money(liveAddl)}</span></div>}
                  <div className="pf-sum-divider" />
                  <div className="pf-sum-row pf-sum-total">
                    <span className="sum-label">Remaining Due</span>
                    <span className={`sum-val-lg ${liveAfterPay > 0 ? "sum-red" : "sum-green"}`}>{money(liveAfterPay)}</span>
                  </div>
                  {liveAfterPay === 0 && livePaying > 0 && !editingPaymentId && <div className="pf-paid-badge">Fully cleared</div>}
                </div>

                <div className="pf-sum-method">
                  <span className="method-label">Via</span>
                  <span className={`method-chip ${payment.payment_method === "Online" ? "chip-primary" : "chip-amber"}`}>{payment.payment_method}</span>
                </div>

                {payment.student_name && (
                  <div className="pf-student-card">
                    <div className="fee-avatar-wrap"><StudentAvatar name={payment.student_name} profileimg={studentProfileImg} /></div>
                    <div className="student-info">
                      <p className="student-name">{payment.student_name}</p>
                      <p className="student-meta">{payment.roll} · {payment.department}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="table-card ledger-table-card">
            <div className="ledger-header-row">
              <h3 className="table-heading">
                Payment Ledger
                <span className="record-count">({filteredPayments.length} record{filteredPayments.length !== 1 ? "s" : ""})</span>
              </h3>
              <div className="ledger-tools">
                <input type="text" className="ledger-search-input" placeholder="Search by roll, name or dept..." value={ledgerSearch} onChange={(e) => setLedgerSearch(e.target.value)} />
                <button className="btn-export" onClick={exportLedger}>Export CSV</button>
              </div>
            </div>

            <div className="ledger-filters">
              <div className="chip-group">
                {["all", "Cash", "Online"].map((m) => (
                  <button key={m} className={`chip-filter ${ledgerMethod === m ? "chip-filter-active" : ""}`} onClick={() => setLedgerMethod(m)}>
                    {m === "all" ? "All methods" : m}
                  </button>
                ))}
              </div>
              <div className="date-range">
                <label>From <input type="date" className="date-input" value={ledgerFrom} max={ledgerTo || undefined} onChange={(e) => setLedgerFrom(e.target.value)} /></label>
                <label>To <input type="date" className="date-input" value={ledgerTo} min={ledgerFrom || undefined} onChange={(e) => setLedgerTo(e.target.value)} /></label>
              </div>
              {ledgerFiltered && <button className="btn-link" onClick={clearLedgerFilters}>Clear filters</button>}
            </div>

            <div className="table-responsive-wrapper">
              <table className="data-table">
                <thead className="table-header">
                  <tr>
                    <SortTh label="Roll" k="roll" sort={ledgerSort} />
                    <SortTh label="Student Name" k="name" sort={ledgerSort} />
                    <th>Dept</th>
                    <SortTh label="Paid (Rs.)" k="paid" sort={ledgerSort} align="right-align" />
                    <th className="right-align">Add. Fees</th>
                    <SortTh label="Date" k="date" sort={ledgerSort} align="center-align" />
                    <th className="center-align">Method</th>
                    <th className="center-align">Action</th>
                  </tr>
                </thead>
                <tbody className="table-body">
                  {loading ? (
                    <SkeletonRows cols={8} />
                  ) : pagedPayments.length === 0 ? (
                    <tr><td colSpan="8" className="td-empty center-align">{ledgerFiltered ? "No records match the current filters." : "No payment records yet."}</td></tr>
                  ) : (
                    pagedPayments.map((p, idx) => {
                      const deptDisplay = p.department_name || p.department || p.department_code || "";
                      const { fees, sum } = parseAdditional(p);
                      const key = `pay_${p.id}`;
                      const isExpanded = expandedRows[key];
                      return (
                        <React.Fragment key={p.id || idx}>
                          <tr className="table-row">
                            <td className="text-bold uppercase-text">{p.roll}</td>
                            <td>{p.student_name || p.full_name}</td>
                            <td className="text-mono text-small">{deptDisplay}</td>
                            <td className="right-align color-success text-extrabold">{num(p.amount_paid).toFixed(2)}</td>
                            <td className="right-align">
                              {sum > 0 ? (
                                <button className="fee-expand-link" onClick={() => toggleExpand(key)} aria-expanded={!!isExpanded}>
                                  {money(sum)} {isExpanded ? "▲" : "▼"}
                                </button>
                              ) : <span className="text-dash">—</span>}
                            </td>
                            <td className="center-align text-mono text-small text-muted">{p.payment_date}</td>
                            <td className="center-align"><span className={`badge-method ${p.payment_method === "Online" ? "badge-primary" : "badge-amber"}`}>{p.payment_method || "Cash"}</span></td>
                            <td className="center-align">
                              <div className="handling-buttons">
                                <button onClick={() => setReceiptData(p)} className="btn-table-print">Print</button>
                                <button onClick={() => startEditPayment(p)} className="btn-table-edit">Edit</button>
                                <button onClick={() => deletePayment(p.id)} className="btn-table-delete">Del</button>
                              </div>
                            </td>
                          </tr>
                          {isExpanded && fees.length > 0 && (
                            <tr className="breakdown-row">
                              <td colSpan="8" className="breakdown-cell">
                                <div className="breakdown-content">
                                  <strong>Additional Fee Breakdown:</strong>
                                  <ul className="breakdown-list">
                                    {fees.map((f, i) => <li key={i}>{f.fee_type || f.type}: <strong>{money(f.amount)}</strong></li>)}
                                  </ul>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <Pagination total={filteredPayments.length} page={ledgerPage} onPageChange={setLedgerPage} />
          </div>
        </div>
      )}

      {view === "structure" && (
        <div className="panel-layout">
          <div className="form-card">
            <h2 className="form-heading">{editingStructureId ? "Edit Fee Structure" : "Add Fee Structure"}</h2>
            <div className="form-grid layout-three-cols">
              <div className="form-group">
                <label className="field-label">Department</label>
                <select className="form-select" value={structure.department} onChange={(e) => setStructure({ ...structure, department: e.target.value })}>
                  <option value="">Select Department</option>
                  {departments.map((d, i) => (
                    <option key={d.id || i} value={d.department_name || d.department_code || ""}>{d.department_name || d.department_code} ({d.department_code})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="field-label">Total Fee</label>
                <input className="form-input input-number" type="number" min="0" placeholder="e.g. 180000" value={structure.total_fee} onChange={(e) => setStructure({ ...structure, total_fee: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="field-label">Date</label>
                <input className="form-input" type="date" value={structure.date} onChange={(e) => setStructure({ ...structure, date: e.target.value })} />
              </div>
            </div>
            <div className="action-btn-group">
              <button onClick={saveStructureSetup} className="btn-submit">{editingStructureId ? "Update" : "Submit"}</button>
              {editingStructureId && (
                <button onClick={() => { setEditingStructureId(null); setStructure(emptyStructure()); }} className="btn-cancel">Cancel</button>
              )}
            </div>
          </div>

          <div className="table-card">
            <h3 className="table-heading">
              Program Fee Structure
              <span className="record-count">({feeStructure.length} record{feeStructure.length !== 1 ? "s" : ""})</span>
            </h3>
            <div className="table-responsive-wrapper">
              <table className="data-table">
                <thead className="table-header">
                  <tr><th>Department</th><th>Total Fee (Rs.)</th><th>Date</th><th className="center-align">Action</th></tr>
                </thead>
                <tbody className="table-body">
                  {loading ? (
                    <SkeletonRows cols={4} />
                  ) : pagedStructure.length === 0 ? (
                    <tr><td colSpan="4" className="td-empty center-align">No fee structures added yet.</td></tr>
                  ) : (
                    pagedStructure.map((f, idx) => (
                      <tr key={f.id || idx} className="table-row">
                        <td className="text-bold">{f.department || f.department_name || f.department_code}</td>
                        <td className="text-extrabold color-primary">{num(f.total_fee).toFixed(2)}</td>
                        <td className="text-mono text-small">{f.create_date || f.created_at || "N/A"}</td>
                        <td className="center-align">
                          <div className="handling-buttons">
                            <button onClick={() => startEditStructure(f)} className="btn-table-edit">Edit</button>
                            <button onClick={() => deleteStructure(f.id)} className="btn-table-delete">Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Pagination total={feeStructure.length} page={structurePage} onPageChange={setStructurePage} />
          </div>
        </div>
      )}

      {view === "report" && (
        <div className="panel-layout">
          <div className="form-card">
            <h2 className="form-heading">Student Records Dashboard</h2>
            <div className="filter-wrapper">
              <div className="filter-group">
                <label className="field-label">Department</label>
                <select
                  className="form-select"
                  value={filter.department}
                  onChange={(e) => {
                    const value = e.target.value;
                    const grade = getGrade(findDepartment(value));
                    setStatusFilter("all");
                    setSearchQuery("");
                    setFilter({ department: value, semester_year: grade ? String(grade) : "" });
                  }}
                >
                  <option value="">Select Department</option>
                  {departments.map((d, i) => <option key={d.id || i} value={d.department_code || ""}>{d.department_name || d.department_code}</option>)}
                </select>
              </div>
              <div className="filter-group">
                <label className="field-label">{filterPeriodWord}</label>
                <select className="form-select" value={filter.semester_year} onChange={(e) => setFilter({ ...filter, semester_year: e.target.value })} disabled={!filter.department}>
                  <option value="">Select {filterPeriodWord}</option>
                  {getSemYearOptions(filter.department).map((i) => <option key={i} value={i}>{`${filterPeriodWord} ${i}`}</option>)}
                </select>
              </div>
              {filter.department && filter.semester_year && (
                <div className="filter-group">
                  <label className="field-label">Search Student</label>
                  <input type="text" placeholder="Name or roll number..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="search-input" />
                </div>
              )}
              {dashboardRows.length > 0 && (
                <div className="stats-bar">
                  {[["all", "All", dashboardRows.length, "stat-all"], ["paid", "Paid", dashboardCounts.paid, "stat-paid"], ["partial", "Partial", dashboardCounts.partial, "stat-partial"], ["unpaid", "Unpaid", dashboardCounts.unpaid, "stat-unpaid"]].map(([id, label, count, cls]) => (
                    <button key={id} className={`${cls} stat-pill ${statusFilter === id ? "stat-pill-active" : ""}`} onClick={() => setStatusFilter(id)}>
                      {label}: <strong>{count}</strong>
                    </button>
                  ))}
                  <button className="btn-export" onClick={exportDashboard}>Export CSV</button>
                </div>
              )}
            </div>

            {dashboardRows.length > 0 && (
              <div className="collection-progress">
                <div className="collection-progress-head">
                  <span>Collection progress</span>
                  <strong>{collectionRate}%</strong>
                </div>
                <div className="progress-track"><div className="progress-fill" style={{ width: `${collectionRate}%` }} /></div>
              </div>
            )}

            <div className="table-responsive-wrapper">
              <table className="data-table">
                <thead className="table-header">
                  <tr>
                    <th className="center-align">SN</th>
                    <SortTh label="Roll" k="roll" sort={dashSort} />
                    <SortTh label="Full Name" k="name" sort={dashSort} />
                    <th className="center-align">Dept</th>
                    <SortTh label="Total Fee" k="fee" sort={dashSort} align="right-align" />
                    <th className="right-align">Additional</th>
                    <SortTh label="Paid" k="paid" sort={dashSort} align="right-align" />
                    <SortTh label="Due" k="due" sort={dashSort} align="right-align" />
                    <th className="center-align">Status</th>
                    <th className="center-align">Action</th>
                  </tr>
                </thead>
                <tbody className="table-body">
                  {!filter.department || !filter.semester_year ? (
                    <tr><td colSpan="10" className="td-empty center-align">Select a department and {filterPeriodWord.toLowerCase()} to view records.</td></tr>
                  ) : dashboardLoading ? (
                    <SkeletonRows cols={10} />
                  ) : pagedDashboard.length === 0 ? (
                    <tr><td colSpan="10" className="td-empty center-align">{debouncedSearch || statusFilter !== "all" ? "No students match the current filters." : "No records found."}</td></tr>
                  ) : (
                    pagedDashboard.map((row, idx) => {
                      const { rec, baseFee, paidFee, additionalTotal, netDue, status } = row;
                      const globalIdx = (dashboardPage - 1) * ROWS_PER_PAGE + idx + 1;
                      const rowKey = `dash_${rec.roll}_${rec.semester_year || filter.semester_year}`;
                      const isExpanded = expandedRows[rowKey];
                      const breakdown = Array.isArray(rec.additional_breakdown) ? rec.additional_breakdown : [];
                      return (
                        <React.Fragment key={rowKey}>
                          <tr className={`table-row row-${status}`}>
                            <td className="center-align">{globalIdx}</td>
                            <td className="text-bold">{rec.roll}</td>
                            <td>{rec.student_name || rec.full_name}</td>
                            <td className="center-align">{rec.department_name || rec.department || filter.department}</td>
                            <td className="right-align">{baseFee.toFixed(2)}</td>
                            <td className="right-align">
                              {additionalTotal > 0 ? (
                                <button className="fee-expand-link" onClick={() => toggleExpand(rowKey)} aria-expanded={!!isExpanded}>{additionalTotal.toFixed(2)} {isExpanded ? "▲" : "▼"}</button>
                              ) : <span className="text-dash">—</span>}
                            </td>
                            <td className="right-align">{paidFee.toFixed(2)}</td>
                            <td className={`right-align ${netDue > 0 ? "td-due-red" : "td-due-green"}`}>{netDue.toFixed(2)}</td>
                            <td className="center-align"><span className={`status-badge status-${status}`}>{status.toUpperCase()}</span></td>
                            <td className="center-align">
                              <button
                                className="btn-edit-fee"
                                onClick={() => setEditFeeModal({
                                  roll: rec.roll,
                                  student_name: rec.student_name || rec.full_name,
                                  total_fee: baseFee,
                                  semester_year: rec.semester_year,
                                  department_name: rec.department_name || rec.department || filter.department,
                                  period_text: `${filterPeriodWord} ${rec.semester_year || filter.semester_year}`
                                })}
                              >
                                Edit Fee
                              </button>
                            </td>
                          </tr>
                          {isExpanded && breakdown.length > 0 && (
                            <tr className="breakdown-row">
                              <td colSpan="10" className="breakdown-cell">
                                <div className="breakdown-content">
                                  <strong>Additional Breakdown:</strong>
                                  <ul className="breakdown-list">
                                    {breakdown.map((f, i) => <li key={i}>{f.fee_type}: <strong>{money(f.amount)}</strong></li>)}
                                  </ul>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <Pagination total={filteredDashboard.length} page={dashboardPage} onPageChange={setDashboardPage} />

            {dashboardRows.length > 0 && (
              <div className="totals-bar">
                <div className="total-item">Total Students: <strong>{dashboardRows.length}</strong></div>
                <div className="total-item-primary">Total Fee: <strong>{money(dashboardTotals.fee)}</strong></div>
                <div className="total-item-success">Total Collected: <strong>{money(dashboardTotals.paid)}</strong></div>
                <div className="total-item-danger">Total Due: <strong>{money(dashboardTotals.due)}</strong></div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}