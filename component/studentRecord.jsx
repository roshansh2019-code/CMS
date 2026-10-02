import { useEffect, useState } from "react";
import axios from "axios";
import "./student.css";

const API = "http://127.0.0.1:5000";
const ROWS_PER_PAGE = 15;
const PASSOUT_VALUE = "passout";
const normalizeCode = (code) =>
  (code || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

const getGrade = (dept) => {
  if (!dept || dept.course_type?.toLowerCase() !== "year") return null;

  const match = normalizeCode(dept.department_code).match(/(11|12)$/);

  return match ? Number(match[1]) : null;
};

const getYearOptions = (dept) => {
  const grade = getGrade(dept);
  return grade ? [grade] : [1, 2, 3, 4];
};

function getPaginationSlots(current, total, siblingCount = 1) {
  const totalSlots = siblingCount * 2 + 5;
  const range = (start, end) =>
    Array.from({ length: end - start + 1 }, (_, i) => start + i);

  if (total <= totalSlots) return range(1, total);

  const leftSibling  = Math.max(current - siblingCount, 1);
  const rightSibling = Math.min(current + siblingCount, total);

  const showLeftEllipsis  = leftSibling > 2;
  const showRightEllipsis = rightSibling < total - 1;

  const firstPage = 1;
  const lastPage  = total;

  if (!showLeftEllipsis && showRightEllipsis) {
    const leftItemCount = 3 + siblingCount * 2;
    return [...range(1, leftItemCount), "...", lastPage];
  }

  if (showLeftEllipsis && !showRightEllipsis) {
    const rightItemCount = 3 + siblingCount * 2;
    return [firstPage, "...", ...range(total - rightItemCount + 1, total)];
  }

  if (showLeftEllipsis && showRightEllipsis) {
    return [firstPage, "...", ...range(leftSibling, rightSibling), "...", lastPage];
  }

  return range(1, total);
}

function sortRecords(records, sortConfig) {
  if (!sortConfig.key) return records;
  const sorted = [...records].sort((a, b) => {
    const valA = String(a[sortConfig.key] ?? "");
    const valB = String(b[sortConfig.key] ?? "");
    return valA.localeCompare(valB, undefined, { numeric: true, sensitivity: "base" });
  });
  return sortConfig.direction === "desc" ? sorted.reverse() : sorted;
}

function StudentRecords() {
  const [students, setStudents]       = useState([]);
  const [departments, setDepartments] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters]         = useState({ department: "", semester: "", year: "" });
  const [showForm, setShowForm]       = useState(false);
  const [editId, setEditId]           = useState(null);
  const [sortConfig, setSortConfig]   = useState({ key: "roll", direction: "asc" });
  const [resendingId, setResendingId] = useState(null);
  const [verifyingId, setVerifyingId] = useState(null);
  const [loading, setLoading]         = useState(false);
  const [form, setForm]               = useState({
    fullName: "", email: "", password: "", phone: "",
    roll: "", department: "", semester: "", year: ""
  });

  const isPassoutView = filters.semester === PASSOUT_VALUE || filters.year === PASSOUT_VALUE;

  const fetchDepartments = async () => {
    try {
      const res = await axios.get(`${API}/departments`);
      setDepartments(res.data || []);
    } catch { alert("Department Fetch Error"); }
  };

  const fetchStudents = async () => {
    if (!filters.department || (!filters.semester && !filters.year)) {
      setStudents([]); return;
    }
    setLoading(true);
    try {
      if (filters.semester === PASSOUT_VALUE || filters.year === PASSOUT_VALUE) {
        const res = await axios.get(`${API}/passed-students`, {
          params: { department: filters.department }
        });
        setStudents(res.data || []);
      } else {
        const res = await axios.get(`${API}/students`, { params: filters });
        setStudents(res.data || []);
      }
    } catch { alert("Student Fetch Error"); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchDepartments(); }, []);
  useEffect(() => {
    setSearchQuery("");
    setCurrentPage(1);
    fetchStudents();

  }, [filters]);

  const isFilterActive = filters.department && (filters.semester || filters.year);

  const filteredStudents = isFilterActive
    ? students.filter((s) => {
        const q = searchQuery.toLowerCase().trim();
        if (!q) return true;
        return (
          String(s.fullName || "").toLowerCase().includes(q) ||
          String(s.roll     || "").toLowerCase().includes(q) ||
          String(s.email    || "").toLowerCase().includes(q) ||
          String(s.phone    || "").toLowerCase().includes(q)
        );
      })
    : [];

  const sortedStudents = sortRecords(filteredStudents, sortConfig);

  const totalPages = Math.max(1, Math.ceil(sortedStudents.length / ROWS_PER_PAGE));
  const safePage   = Math.min(currentPage, totalPages);
  const pageStart  = (safePage - 1) * ROWS_PER_PAGE;
  const pageRows   = sortedStudents.slice(pageStart, pageStart + ROWS_PER_PAGE);

  const handleChange = (e) => {
    const { name, value } = e.target;
    const updated = { ...form, [name]: value };

    if (name === "department") {
      const dept = departments.find(d => String(d.department_name) === String(value));
      const grade = getGrade(dept);
      if (grade) updated.year = String(grade);
    }

    setForm(updated);
  };

  const handleFilter = (e) => {
    const { name, value } = e.target;
    let updated = { ...filters, [name]: value };
    if (name === "department") {
      updated.semester = "";
      updated.year = "";
      const dept = departments.find(d => String(d.department_name) === String(value));
      const grade = getGrade(dept);
      if (grade) updated.year = String(grade);
    }
    setFilters(updated);
    setCurrentPage(1);
  };

  const handleSearch = (e) => { setSearchQuery(e.target.value); setCurrentPage(1); };

  const handleSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: "asc" };
    });
    setCurrentPage(1);
  };

  const sortIndicator = (key) => {
    if (sortConfig.key !== key) return "";
    return sortConfig.direction === "asc" ? " ▲" : " ▼";
  };

  const selectedFormDept = departments.find(d => String(d.department_name) === String(form.department));
  const selectedDept     = departments.find(d => String(d.department_name) === String(filters.department));

  const isFilterGrade = !!getGrade(selectedDept);
  const isFormGrade   = !!getGrade(selectedFormDept);

  const formatPeriod = (semester, year, departmentName) => {
    if (semester) return `Sem ${semester}`;

    const dept = departments.find(d => String(d.department_name) === String(departmentName));

    return getGrade(dept) ? `Grade ${year}` : `Year ${year}`;
  };

  const openAddForm = () => {
    setEditId(null);
    setForm({
      fullName: "", email: "", password: "", phone: "", roll: "",
      department: filters.department || "",
      semester:   filters.semester   || "",
      year:       filters.year       || ""
    });
    setShowForm(true);
  };

  const saveStudent = async () => {
    if (!form.fullName || !form.email || !form.roll || !form.department) {
      alert("Fill All Required Fields"); return;
    }
    try {
      if (editId) {
        await axios.put(`${API}/update-student/${editId}`, form);
        alert("Student Updated");
      } else {
        await axios.post(`${API}/add-student`, form);
        alert("Student Added");
      }
      setShowForm(false);
      setEditId(null);
      setForm({ fullName: "", email: "", password: "", phone: "", roll: "", department: "", semester: "", year: "" });
      fetchStudents();
    } catch { alert("Save Error"); }
  };

  const handleEdit = (s) => {
    setEditId(s.id);
    setForm({
      fullName: s.fullName || "", email: s.email || "", password: s.password || "",
      phone: s.phone || "", roll: s.roll || "", department: s.department || "",
      semester: s.semester || "", year: s.year || ""
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    const confirmMsg = isPassoutView ? "Remove this passed-out record?" : "Delete this student?";
    if (!window.confirm(confirmMsg)) return;
    try {
      if (isPassoutView) {
        await axios.delete(`${API}/passed-students/${id}`);
      } else {
        await axios.delete(`${API}/delete-student/${id}`);
      }
      fetchStudents();
    } catch { alert("Delete Error"); }
  };

  const handleVerify = async (id) => {
    if (verifyingId) return;
    setVerifyingId(id);
    try {
      await axios.put(`${API}/verify-student/${id}`);
      await fetchStudents();
    } catch {
      alert("Verify Error");
    } finally {
      setVerifyingId(null);
    }
  };

  const handleUnverify = async (id) => {
    if (verifyingId) return;
    setVerifyingId(id);
    try {
      await axios.put(`${API}/unverify-student/${id}`);
      await fetchStudents();
    } catch {
      alert("Unverify Error");
    } finally {
      setVerifyingId(null);
    }
  };

  const handleResendVerificationEmail = async (id) => {
    setResendingId(id);
    try {
      const res = await axios.post(`${API}/resend-student-verification-email`, { id });
      alert(res.data?.message || "Email sent");
    } catch (err) {
      alert(err.response?.data?.message || "Failed to resend email");
    } finally {
      setResendingId(null);
    }
  };

  const handleUpgrade = async () => {
    if (!filters.department || (!filters.semester && !filters.year)) {
      alert("Select Department + Semester/Year/Grade"); return;
    }
    if (!window.confirm("Upgrade all students in this group? Anyone already at the final semester/year/grade will be moved to Passed Out instead.")) return;
    try {
      const res = await axios.post(`${API}/upgrade-semester`, filters);
      alert(res.data?.message || "Upgrade complete");
      fetchStudents();
    } catch { alert("Upgrade Error"); }
  };

  const goTo = (p) => setCurrentPage(Math.max(1, Math.min(p, totalPages)));

  const paginationSlots = getPaginationSlots(safePage, totalPages, 1);

  return (
    <div className="sc-wrap">

      <div className="sc-header">
        <div className="sc-header-left">
          <div className="sc-title-block">
            <h2 className="sc-title">{isPassoutView ? "Passed-Out Students" : "Student Records"}</h2>
            {isFilterActive && (
              <p className="sc-subtitle">
                {sortedStudents.length} student{sortedStudents.length !== 1 ? "s" : ""}
                {isPassoutView ? " passed out" : ""}
                {searchQuery ? ` matching "${searchQuery}"` : isPassoutView ? "" : " in selection"}
              </p>
            )}
          </div>
        </div>
        <div className="sc-header-actions">
          {isFilterActive && !isPassoutView && (
            <button className="btn btn-upgrade" onClick={handleUpgrade}>
              ⬆ Upgrade
            </button>
          )}
          {!isPassoutView && (
            <button className="btn btn-add" onClick={openAddForm}>
              + Add Student
            </button>
          )}
        </div>
      </div>

      <div className="sc-filters">
        <select name="department" value={filters.department} onChange={handleFilter} className="sc-select">
          <option value="">Select Department</option>
          {departments.map(d => (
            <option key={d.id} value={d.department_name}>
              {d.department_name} ({d.course_type})
            </option>
          ))}
        </select>

        {selectedDept?.course_type === "semester" && (
          <select name="semester" value={filters.semester} onChange={handleFilter} className="sc-select">
            <option value="">Select Semester</option>
            {[1,2,3,4,5,6,7,8].map(s => <option key={s} value={s}>{s} Semester</option>)}
            <option value={PASSOUT_VALUE}>🎓 Passed Out</option>
          </select>
        )}

        {selectedDept?.course_type === "year" && (
          <select name="year" value={filters.year} onChange={handleFilter} className="sc-select">
            <option value="">{isFilterGrade ? "Select Grade" : "Select Year"}</option>
            {getYearOptions(selectedDept).map(y => (
              <option key={y} value={y}>
                {isFilterGrade ? `Grade ${y}` : `${y} Year`}
              </option>
            ))}
            <option value={PASSOUT_VALUE}>🎓 Passed Out</option>
          </select>
        )}

        {isFilterActive && (
          <>
            <select
              className="sc-select"
              value={sortConfig.key}
              onChange={(e) => handleSort(e.target.value)}
            >
              <option value="roll">Sort by Roll No.</option>
              <option value="fullName">Sort by Name</option>
            </select>
            <button
              className="btn btn-sort-dir"
              onClick={() => handleSort(sortConfig.key)}
              title="Toggle sort direction"
            >
              {sortConfig.direction === "asc" ? "Asc ▲" : "Desc ▼"}
            </button>

            <div className="sc-search-wrap">
              <span className="sc-search-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </span>
              <input
                className="sc-search-input"
                type="text"
                placeholder={isPassoutView ? "Search name, roll, email…" : "Search name, roll, email, phone…"}
                value={searchQuery}
                onChange={handleSearch}
              />
              {searchQuery && (
                <button className="sc-search-clear" onClick={() => { setSearchQuery(""); setCurrentPage(1); }}>
                  ✕
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="sc-table-wrap">
        <table className="sc-table">
          <thead>
            <tr>
              <th>S.N</th>
              <th className="sc-sortable" onClick={() => handleSort("fullName")}>
                Name{sortIndicator("fullName")}
              </th>
              <th className="sc-sortable" onClick={() => handleSort("roll")}>
                Roll{sortIndicator("roll")}
              </th>
              <th>Email</th>
              <th>Phone</th>
              <th>Department</th>
              <th>{isPassoutView ? "Completed" : "Sem / Year / Grade"}</th>
              <th>Password</th>
              <th>Status</th>
              <th>{isPassoutView ? "Passed Out" : "Actions"}</th>
            </tr>
          </thead>
          <tbody>
            {!filters.department && (
              <tr><td colSpan="10" className="sc-empty">Please select a Department to fetch  student data</td></tr>
            )}
            {filters.department && !filters.semester && !filters.year && (
              <tr><td colSpan="10" className="sc-empty">Select a Semester, Year or Grade to view students</td></tr>
            )}
            {isFilterActive && loading && (
              <tr><td colSpan="10" className="sc-empty">Loading…</td></tr>
            )}
            {isFilterActive && !loading && sortedStudents.length === 0 && (
              <tr><td colSpan="10" className="sc-empty">
                {searchQuery
                  ? `No students match "${searchQuery}"`
                  : isPassoutView
                    ? "No passed-out students yet for this department"
                    : "No students found"}
              </td></tr>
            )}
            {isFilterActive && !loading && pageRows.map((s, idx) => {
              const isVerifyingThisRow = verifyingId === s.id;
              const isTableBusy = verifyingId !== null;
              return (
                <tr key={s.id} className="sc-row">
                  <td className="sc-num">{pageStart + idx + 1}</td>
                  <td className="sc-truncate" title={s.fullName || ""}><HighlightText text={s.fullName || ""} query={searchQuery} /></td>
                  <td className="sc-truncate" title={String(s.roll || "")}><HighlightText text={String(s.roll || "")} query={searchQuery} /></td>
                  <td className="sc-truncate" title={s.email || ""}><HighlightText text={s.email || ""} query={searchQuery} /></td>
                  <td className="sc-truncate" title={s.phone || ""}><HighlightText text={s.phone || ""} query={searchQuery} /></td>
                  <td className="sc-truncate" title={s.department || ""}>{s.department}</td>
                  <td>
                    {isPassoutView
                      ? formatPeriod(s.final_semester, s.final_year, s.department)
                      : formatPeriod(s.semester, s.year, s.department)}
                  </td>
                  <td><span className="sc-pass">{s.password}</span></td>
                  <td>
                    {isVerifyingThisRow ? (
                      <span className="badge badge-pending">
                        <span className="sc-btn-spinner" /> Updating…
                      </span>
                    ) : s.is_verified ? (
                      <span className="badge badge-verified">Verified</span>
                    ) : (
                      <span className="badge badge-pending">Pending</span>
                    )}
                  </td>
                  <td className="sc-actions">
                    {isPassoutView ? (
                      <>
                        <span className="badge badge-verified">{s.passed_out_year}</span>
                        <button className="action-btn delete" onClick={() => handleDelete(s.id)} disabled={isTableBusy}>
                          Remove
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="action-btn edit"
                          onClick={() => handleEdit(s)}
                          disabled={isTableBusy}
                        >
                          Edit
                        </button>
                        <button
                          className="action-btn delete"
                          onClick={() => handleDelete(s.id)}
                          disabled={isTableBusy}
                        >
                          Delete
                        </button>
                        {!s.is_verified ? (
                          <button
                            className="action-btn verify"
                            onClick={() => handleVerify(s.id)}
                            disabled={isTableBusy}
                          >
                            {isVerifyingThisRow ? (
                              <>
                                <span className="sc-btn-spinner" /> Verifying…
                              </>
                            ) : (
                              "Verify"
                            )}
                          </button>
                        ) : (
                          <button
                            className="action-btn unverify"
                            onClick={() => handleUnverify(s.id)}
                            disabled={isTableBusy}
                          >
                            {isVerifyingThisRow ? (
                              <>
                                <span className="sc-btn-spinner" /> Unverifying…
                              </>
                            ) : (
                              "Unverify"
                            )}
                          </button>
                        )}
                        {s.is_verified === 1 && (
                          <button
                            className="action-btn verify"
                            disabled={resendingId === s.id || isTableBusy || resendingId !== null}
                            onClick={() => handleResendVerificationEmail(s.id)}
                          >
                            {resendingId === s.id ? (
                              <>
                                <span className="sc-btn-spinner" /> Sending…
                              </>
                            ) : (
                              "📧 Resend Email"
                            )}
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isFilterActive && sortedStudents.length > ROWS_PER_PAGE && (
        <div className="sc-pagination">
          <span className="sc-page-info">
            Showing {pageStart + 1}–{Math.min(pageStart + ROWS_PER_PAGE, sortedStudents.length)} of {sortedStudents.length}
          </span>
          <div className="sc-page-btns">
            <button className="page-btn nav" onClick={() => goTo(safePage - 1)} disabled={safePage === 1}>&#8249;</button>
            {paginationSlots.map((p, i) =>
              p === "..."
                ? <span key={`e-${i}`} className="page-ellipsis">…</span>
                : <button
                    key={p}
                    className={`page-btn ${safePage === p ? "active" : ""}`}
                    onClick={() => goTo(p)}
                  >{p}</button>
            )}
            <button className="page-btn nav" onClick={() => goTo(safePage + 1)} disabled={safePage === totalPages}>&#8250;</button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="sc-overlay" onClick={() => setShowForm(false)}>
          <div className="sc-modal" onClick={e => e.stopPropagation()}>

            <div className="sc-modal-header">
              <h3>{editId ? "Edit Student" : "Add New Student"}</h3>
              <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>

            <div className="sc-modal-body">
              <div className="field-group">
                <label>Full Name <span className="req">*</span></label>
                <input name="fullName"  value={form.fullName}  onChange={handleChange} placeholder="Enter full name" />
              </div>
              <div className="field-group">
                <label>Email <span className="req">*</span></label>
                <input name="email"     value={form.email}     onChange={handleChange} placeholder="Enter email" type="email" />
              </div>
              <div className="field-group">
                <label>Password</label>
                <input name="password"  value={form.password}  onChange={handleChange} placeholder="Enter password" />
              </div>
              <div className="field-group">
                <label>Phone</label>
                <input name="phone"     value={form.phone}     onChange={handleChange} placeholder="Enter phone" />
              </div>
              <div className="field-group">
                <label>Roll No. <span className="req">*</span></label>
                <input name="roll"      value={form.roll}      onChange={handleChange} placeholder="Enter roll number" />
              </div>
              <div className="field-group">
                <label>Department <span className="req">*</span></label>
                <select name="department" value={form.department} onChange={handleChange}>
                  <option value="">Select Department</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.department_name}>{d.department_name}</option>
                  ))}
                </select>
              </div>
              {selectedFormDept?.course_type === "semester" && (
                <div className="field-group">
                  <label>Semester</label>
                  <select name="semester" value={form.semester} onChange={handleChange}>
                    <option value="">Select Semester</option>
                    {[1,2,3,4,5,6,7,8].map(s => <option key={s} value={s}>{s} Semester</option>)}
                  </select>
                </div>
              )}
              {selectedFormDept?.course_type === "year" && (
                <div className="field-group">
                  <label>{isFormGrade ? "Grade" : "Year"}</label>
                  <select name="year" value={form.year} onChange={handleChange}>
                    <option value="">{isFormGrade ? "Select Grade" : "Select Year"}</option>
                    {getYearOptions(selectedFormDept).map(y => (
                      <option key={y} value={y}>
                        {isFormGrade ? `Grade ${y}` : `${y} Year`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="sc-modal-footer">
              <button className="btn btn-cancel" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-save"   onClick={saveStudent}>
                {editId ? "Update Student" : "Save Student"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HighlightText({ text, query }) {
  if (!query?.trim()) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase().trim());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="hl">{text.slice(idx, idx + query.trim().length)}</mark>
      {text.slice(idx + query.trim().length)}
    </>
  );
}

export default StudentRecords;