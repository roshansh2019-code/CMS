import { useEffect, useState, useRef } from "react";
import axios from "axios";
import "./teacher.css";

const API = "http://127.0.0.1:5000";
const ROWS_PER_PAGE = 15;

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

function HighlightText({ text, query }) {
  if (!query) return text;
  const parts = String(text).split(new RegExp(`(${query})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="hl">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

function getPaginationSlots(current, total, siblingCount = 1) {
  const totalSlots = siblingCount * 2 + 5;
  const range = (start, end) =>
    Array.from({ length: end - start + 1 }, (_, i) => start + i);

  if (total <= totalSlots) return range(1, total);

  const leftSibling = Math.max(current - siblingCount, 1);
  const rightSibling = Math.min(current + siblingCount, total);

  const showLeftEllipsis = leftSibling > 2;
  const showRightEllipsis = rightSibling < total - 1;

  const firstPage = 1;
  const lastPage = total;

  if (!showLeftEllipsis && showRightEllipsis) {
    const leftItemCount = 3 + siblingCount * 2;
    return [...range(1, leftItemCount), "...", lastPage];
  }

  if (showLeftEllipsis && !showRightEllipsis) {
    const rightItemCount = 3 + siblingCount * 2;
    return [firstPage, "...", ...range(total - rightItemCount + 1, total)];
  }

  if (showLeftEllipsis && showRightEllipsis) {
    return [
      firstPage,
      "...",
      ...range(leftSibling, rightSibling),
      "...",
      lastPage,
    ];
  }

  return range(1, total);
}

function sortRecords(records, sortConfig) {
  if (!sortConfig.key) return records;
  const sorted = [...records].sort((a, b) => {
    const valA = String(a[sortConfig.key] ?? "");
    const valB = String(b[sortConfig.key] ?? "");
    return valA.localeCompare(valB, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
  return sortConfig.direction === "desc" ? sorted.reverse() : sorted;
}

export default function TeacherRecords() {
  const [teachers, setTeachers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [filters, setFilters] = useState({
    department: "",
  });

  const [showForm, setShowForm] = useState(false);
  const [studyMode, setStudyMode] = useState("");
  const [editId, setEditId] = useState(null);
  const [sortConfig, setSortConfig] = useState({
    key: "employeeId",
    direction: "asc",
  });
  const [resendingId, setResendingId] = useState(null);

  const [verifyingId, setVerifyingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [isSavingTeacher, setIsSavingTeacher] = useState(false);
  const [assigningKey, setAssigningKey] = useState(null);

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    phone: "",
    employeeId: "",
    department: "",
    semester: "",
    year: "",
  });

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignTeacher, setAssignTeacher] = useState(null);
  const [assignFilters, setAssignFilters] = useState({
    department_code: "",
    value: "",
  });
  const [assignSelectedDept, setAssignSelectedDept] = useState(null);
  const [assignSubjects, setAssignSubjects] = useState([]);
  const [assignAssigned, setAssignAssigned] = useState([]);
  const [assignLoading, setAssignLoading] = useState(false);

  const assignRequestIdRef = useRef(0);

  const fetchTeachers = async () => {
    try {
      const res = await axios.get(`${API}/teachers`, { params: filters });
      setTeachers(res.data || []);
    } catch {
      alert("Teacher Fetch Error");
    }
  };

  useEffect(() => {
    axios
      .get(`${API}/departments`)
      .then((res) => setDepartments(res.data || []))
      .catch(() => alert("Department Fetch Error"));
  }, []);

  useEffect(() => {
    setCurrentPage(1);
    fetchTeachers();
  }, [filters]);

  const isFilterActive = !!filters.department;

  const filteredTeachers = isFilterActive
    ? teachers.filter((t) => {
        const q = searchQuery.toLowerCase().trim();
        if (!q) return true;
        return (
          String(t.fullName || "")
            .toLowerCase()
            .includes(q) ||
          String(t.employeeId || "")
            .toLowerCase()
            .includes(q) ||
          String(t.email || "")
            .toLowerCase()
            .includes(q) ||
          String(t.phone || "")
            .toLowerCase()
            .includes(q)
        );
      })
    : [];

  const sortedTeachers = sortRecords(filteredTeachers, sortConfig);

  const totalPages = Math.max(
    1,
    Math.ceil(sortedTeachers.length / ROWS_PER_PAGE)
  );
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * ROWS_PER_PAGE;
  const pageRows = sortedTeachers.slice(pageStart, pageStart + ROWS_PER_PAGE);

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleFilter = (e) => {
    const { value } = e.target;
    setFilters({ department: value });
    setSearchQuery("");
    setCurrentPage(1);
  };

  const handleFormDepartmentChange = (e) => {
    const value = e.target.value;
    const selected = departments.find((d) => d.department_name === value);
    const previous = departments.find(
      (d) => d.department_name === form.department
    );
    const grade = getGrade(selected);

    setForm({
      ...form,
      department: value,
      year: grade ? String(grade) : getGrade(previous) ? "" : form.year,
    });
    setStudyMode(selected?.course_type || "");
  };

  const handleSearch = (e) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

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

  const selectedFormDept = departments.find(
    (d) => d.department_name === form.department
  );

  const isFormGrade = !!getGrade(selectedFormDept);
  const isAssignGrade = !!getGrade(assignSelectedDept);

  const formatPeriod = (semester, year, dept) => {
    if (semester) return `Sem ${semester}`;
    if (!year) return "—";
    return getGrade(dept) ? `Grade ${year}` : `Year ${year}`;
  };

  const saveTeacher = async () => {
    if (isSavingTeacher) return;
    if (!form.fullName || !form.email || !form.employeeId || !form.department) {
      alert("Fill All Required Fields");
      return;
    }
    setIsSavingTeacher(true);
    try {
      await axios.post(`${API}/add-teacher`, form);
      alert("Teacher Added");
      resetForm();
      await fetchTeachers();
    } catch {
      alert("Save Error");
    } finally {
      setIsSavingTeacher(false);
    }
  };

  const updateTeacher = async () => {
    if (isSavingTeacher) return;
    setIsSavingTeacher(true);
    try {
      await axios.put(`${API}/update-teacher/${editId}`, form);
      alert("Teacher Updated");
      resetForm();
      await fetchTeachers();
    } catch {
      alert("Update Error");
    } finally {
      setIsSavingTeacher(false);
    }
  };

  const handleDelete = async (id) => {
    if (deletingId || verifyingId) return;
    if (!window.confirm("Delete Teacher?")) return;
    setDeletingId(id);
    try {
      await axios.delete(`${API}/delete-teacher/${id}`);
      setTeachers((prev) => prev.filter((t) => t.id !== id));
    } catch {
      alert("Delete Error");
    } finally {
      setDeletingId(null);
    }
  };

  const handleVerify = async (id) => {
    if (verifyingId || deletingId) return;
    setVerifyingId(id);
    try {
      await axios.put(`${API}/verify-teacher/${id}`);
      setTeachers((prev) =>
        prev.map((t) => (t.id === id ? { ...t, is_verified: 1 } : t))
      );
    } catch {
      alert("Verify Error");
    } finally {
      setVerifyingId(null);
    }
  };

  const handleUnverify = async (id) => {
    if (verifyingId || deletingId) return;
    setVerifyingId(id);
    try {
      await axios.put(`${API}/unverify-teacher/${id}`);
      setTeachers((prev) =>
        prev.map((t) => (t.id === id ? { ...t, is_verified: 0 } : t))
      );
    } catch {
      alert("Unverify Error");
    } finally {
      setVerifyingId(null);
    }
  };

  const handleResendVerificationEmail = async (id) => {
    setResendingId(id);
    try {
      const res = await axios.post(`${API}/resend-teacher-verification-email`, {
        id,
      });
      alert(res.data?.message || "Email sent");
    } catch (err) {
      alert(err.response?.data?.message || "Failed to resend email");
    } finally {
      setResendingId(null);
    }
  };

  const handleEdit = (t) => {
    setForm({
      fullName: t.fullName || "",
      email: t.email || "",
      password: t.password || "",
      phone: t.phone || "",
      employeeId: t.employeeId || "",
      department: t.department || "",
      semester: t.semester || "",
      year: t.year || "",
    });
    setEditId(t.id);
    setShowForm(true);
    const selected = departments.find((d) => d.department_name === t.department);
    setStudyMode(selected?.course_type || "");
  };

  const resetForm = () => {
    setForm({
      fullName: "",
      email: "",
      password: "",
      phone: "",
      employeeId: "",
      department: "",
      semester: "",
      year: "",
    });
    setEditId(null);
    setShowForm(false);
    setStudyMode("");
  };

  const goTo = (p) => setCurrentPage(Math.max(1, Math.min(p, totalPages)));
  const paginationSlots = getPaginationSlots(safePage, totalPages, 1);

  const fetchAssignedSubjects = async (teacherId, requestId) => {
    try {
      const res = await axios.get(`${API}/teacher/${teacherId}/subjects`);

      if (requestId !== assignRequestIdRef.current) return;

      setAssignAssigned(res.data || []);
    } catch {
      if (requestId !== assignRequestIdRef.current) return;
      alert("Failed to load assigned subjects");
    } finally {
      if (requestId === assignRequestIdRef.current) {
        setAssignLoading(false);
      }
    }
  };

  const openAssignModal = (teacher) => {
    const requestId = ++assignRequestIdRef.current;

    setAssignTeacher(teacher);
    setAssignFilters({ department_code: "", value: "" });
    setAssignSelectedDept(null);
    setAssignSubjects([]);
    setAssignAssigned([]);
    setAssignLoading(true);
    setAssigningKey(null);
    setShowAssignModal(true);

    fetchAssignedSubjects(teacher.id, requestId);
  };

  const closeAssignModal = () => {
    assignRequestIdRef.current += 1;

    setShowAssignModal(false);
    setAssignTeacher(null);
    setAssignFilters({ department_code: "", value: "" });
    setAssignSelectedDept(null);
    setAssignSubjects([]);
    setAssignAssigned([]);
    setAssignLoading(false);
    setAssigningKey(null);
  };

  const assignHandleFilterChange = (e) => {
    const { name, value } = e.target;
    let updated = { ...assignFilters, [name]: value };

    if (name === "department_code") {
      const dept = departments.find((d) => d.department_code === value);
      setAssignSelectedDept(dept);
      const grade = getGrade(dept);
      updated.value = grade ? String(grade) : "";
    }

    setAssignFilters(updated);
  };

  useEffect(() => {
    const fetchSubjectsForAssign = async () => {
      if (!assignFilters.department_code || !assignFilters.value) {
        setAssignSubjects([]);
        return;
      }
      try {
        const params = { department_code: assignFilters.department_code };
        if (assignSelectedDept?.course_type === "semester") {
          params.semester = assignFilters.value;
        } else {
          params.year = assignFilters.value;
        }
        const res = await axios.get(`${API}/subjects`, { params });
        setAssignSubjects(res.data || []);
      } catch {
        alert("Failed to load subjects");
      }
    };

    if (showAssignModal) fetchSubjectsForAssign();
  }, [assignFilters, assignSelectedDept, showAssignModal]);

  const assignIsAssigned = (subjectId) =>
    assignAssigned.some((a) => a.id === subjectId);

  const getOtherAssignedTeachers = (sub) => {
    if (!sub.teacher_ids || !assignTeacher) return [];

    const ids = String(sub.teacher_ids).split(",").filter(Boolean);
    const names = String(sub.teacher_names || "")
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);

    const pairs = ids.map((id, i) => ({ id: id.trim(), name: names[i] || "" }));

    return pairs.filter((p) => String(p.id) !== String(assignTeacher.id));
  };

  const assignToggleSubject = async (subject) => {
    if (!assignTeacher) return;
    if (assigningKey === subject.id) return;

    const teacherId = assignTeacher.id;
    const requestId = assignRequestIdRef.current;

    setAssigningKey(subject.id);

    try {
      if (assignIsAssigned(subject.id)) {
        await axios.delete(`${API}/unassign-subject`, {
          data: { teacher_id: teacherId, subject_id: subject.id },
        });
      } else {
        await axios.post(`${API}/assign-subject`, {
          teacher_id: teacherId,
          subject_id: subject.id,
        });
      }

      if (requestId === assignRequestIdRef.current) {
        await fetchAssignedSubjects(teacherId, requestId);

        if (assignFilters.department_code && assignFilters.value) {
          const params = { department_code: assignFilters.department_code };
          if (assignSelectedDept?.course_type === "semester") {
            params.semester = assignFilters.value;
          } else {
            params.year = assignFilters.value;
          }
          const res = await axios.get(`${API}/subjects`, { params });
          if (requestId === assignRequestIdRef.current) {
            setAssignSubjects(res.data || []);
          }
        }
      }
    } catch (err) {
      alert(err.response?.data?.message || "Error Updating Assignment");
    } finally {
      if (requestId === assignRequestIdRef.current) {
        setAssigningKey(null);
      }
    }
  };

  const isTableBusy = verifyingId !== null || deletingId !== null;

  return (
    <div className="tc-wrap">
      <div className="tc-header">
        <div className="tc-title-block">
          <h2 className="tc-title">Teacher Records</h2>
          {isFilterActive && (
            <p className="tc-subtitle">
              {sortedTeachers.length} teacher
              {sortedTeachers.length !== 1 ? "s" : ""}
              {searchQuery ? ` matching "${searchQuery}"` : " in selection"}
            </p>
          )}
        </div>
        <button
          className="btn btn-add"
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
        >
          + Add Teacher
        </button>
      </div>

      <div className="tc-filters">
        <select
          name="department"
          value={filters.department}
          onChange={handleFilter}
          className="tc-select"
        >
          <option value="">Select Department</option>
          {departments.map((d) => (
            <option key={d.id} value={d.department_name}>
              {d.department_name} ({d.course_type})
            </option>
          ))}
        </select>

        {isFilterActive && (
          <>
            <select
              className="tc-select"
              value={sortConfig.key}
              onChange={(e) => handleSort(e.target.value)}
            >
              <option value="employeeId">Sort by Employee ID</option>
              <option value="fullName">Sort by Name</option>
            </select>
            <button
              className="btn btn-cancel"
              onClick={() => handleSort(sortConfig.key)}
              title="Toggle sort direction"
            >
              {sortConfig.direction === "asc" ? "Asc ▲" : "Desc ▼"}
            </button>

            <div className="tc-search-wrap">
              <span className="tc-search-icon">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                className="tc-search-input"
                type="text"
                placeholder="Search name, ID, email, phone…"
                value={searchQuery}
                onChange={handleSearch}
              />
              {searchQuery && (
                <button
                  className="tc-search-clear"
                  onClick={() => {
                    setSearchQuery("");
                    setCurrentPage(1);
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="tc-table-wrap">
        <table className="tc-table tc-main-table">
          <thead>
            <tr>
              <th>S.N</th>
              <th
                className="tc-sortable"
                onClick={() => handleSort("fullName")}
              >
                Name{sortIndicator("fullName")}
              </th>
              <th
                className="tc-sortable"
                onClick={() => handleSort("employeeId")}
              >
                Employee ID{sortIndicator("employeeId")}
              </th>
              <th>Email</th>
              <th>Phone</th>
              <th>Department</th>
              <th>Sem / Year / Grade</th>
              <th>Password</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {!filters.department && (
              <tr>
                <td colSpan="10" className="tc-empty">
                  Please select a Department to fetch teacher data
                </td>
              </tr>
            )}
            {isFilterActive && sortedTeachers.length === 0 && (
              <tr>
                <td colSpan="10" className="tc-empty">
                  {searchQuery
                    ? `No teachers match "${searchQuery}"`
                    : "No Teachers Found"}
                </td>
              </tr>
            )}
            {isFilterActive &&
              pageRows.map((t, idx) => {
                const isVerifyingThisRow = verifyingId === t.id;
                const isDeletingThisRow = deletingId === t.id;
                const rowBusy = isTableBusy;
                const rowDept = departments.find(
                  (d) => d.department_name === t.department
                );

                return (
                  <tr key={t.id} className="tc-row">
                    <td className="tc-num">{pageStart + idx + 1}</td>
                    <td className="tc-truncate" title={t.fullName || ""}>
                      <HighlightText text={t.fullName || ""} query={searchQuery} />
                    </td>
                    <td className="tc-truncate" title={String(t.employeeId || "")}>
                      <HighlightText
                        text={String(t.employeeId || "")}
                        query={searchQuery}
                      />
                    </td>
                    <td className="tc-truncate" title={t.email || ""}>
                      <HighlightText text={t.email || ""} query={searchQuery} />
                    </td>
                    <td className="tc-truncate" title={t.phone || ""}>
                      <HighlightText text={t.phone || ""} query={searchQuery} />
                    </td>
                    <td className="tc-truncate" title={t.department || ""}>{t.department}</td>
                    <td>{formatPeriod(t.semester, t.year, rowDept)}</td>
                    <td>
                      <span className="tc-pass">{t.password}</span>
                    </td>
                    <td>
                      {isVerifyingThisRow ? (
                        <span className="badge badge-pending">Updating…</span>
                      ) : t.is_verified ? (
                        <span className="badge badge-verified">Verified</span>
                      ) : (
                        <span className="badge badge-pending">Pending</span>
                      )}
                    </td>
                    <td className="tc-actions">
                      <button
                        className="action-btn edit"
                        onClick={() => handleEdit(t)}
                        disabled={rowBusy}
                      >
                        Edit
                      </button>
                      <button
                        className="action-btn delete"
                        onClick={() => handleDelete(t.id)}
                        disabled={rowBusy}
                      >
                        {isDeletingThisRow ? "Deleting…" : "Delete"}
                      </button>
                      <button
                        className="action-btn verify"
                        onClick={() => openAssignModal(t)}
                        disabled={rowBusy}
                      >
                        Assign Subject
                      </button>
                      {!t.is_verified ? (
                        <button
                          className="action-btn verify"
                          onClick={() => handleVerify(t.id)}
                          disabled={rowBusy}
                        >
                          {isVerifyingThisRow ? "Verifying…" : "Verify"}
                        </button>
                      ) : (
                        <button
                          className="action-btn unverify"
                          onClick={() => handleUnverify(t.id)}
                          disabled={rowBusy}
                        >
                          {isVerifyingThisRow ? "Unverifying…" : "Unverify"}
                        </button>
                      )}
                      {t.is_verified === 1 && (
                        <button
                          className="action-btn verify"
                          disabled={resendingId === t.id || rowBusy || resendingId !== null}
                          onClick={() => handleResendVerificationEmail(t.id)}
                        >
                          {resendingId === t.id ? "Sending…" : "📧 Resend Email"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {isFilterActive && sortedTeachers.length > ROWS_PER_PAGE && (
        <div className="tc-pagination">
          <span className="tc-page-info">
            Showing {pageStart + 1}–
            {Math.min(pageStart + ROWS_PER_PAGE, sortedTeachers.length)} of{" "}
            {sortedTeachers.length}
          </span>
          <div className="tc-page-btns">
            <button
              className="page-btn nav"
              onClick={() => goTo(safePage - 1)}
              disabled={safePage === 1}
            >
              &#8249;
            </button>
            {paginationSlots.map((p, i) =>
              p === "..." ? (
                <span key={`e-${i}`} className="page-ellipsis">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  className={`page-btn ${safePage === p ? "active" : ""}`}
                  onClick={() => goTo(p)}
                >
                  {p}
                </button>
              )
            )}
            <button
              className="page-btn nav"
              onClick={() => goTo(safePage + 1)}
              disabled={safePage === totalPages}
            >
              &#8250;
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="tc-overlay" onClick={isSavingTeacher ? undefined : resetForm}>
          <div className="tc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tc-modal-header">
              <h3>{editId ? "Edit Teacher" : "Add New Teacher"}</h3>
              <button className="modal-close" onClick={resetForm} disabled={isSavingTeacher}>
                ✕
              </button>
            </div>

            <div className="tc-modal-body">
              <div className="field-group full">
                <label>
                  Full Name <span className="req">*</span>
                </label>
                <input
                  name="fullName"
                  value={form.fullName}
                  onChange={handleChange}
                  placeholder="Enter full name"
                  disabled={isSavingTeacher}
                />
              </div>
              <div className="field-group">
                <label>
                  Email <span className="req">*</span>
                </label>
                <input
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="Enter email"
                  type="email"
                  disabled={isSavingTeacher}
                />
              </div>
              <div className="field-group">
                <label>Password</label>
                <input
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="Enter password"
                  disabled={isSavingTeacher}
                />
              </div>
              <div className="field-group">
                <label>Phone</label>
                <input
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="Enter phone"
                  disabled={isSavingTeacher}
                />
              </div>
              <div className="field-group">
                <label>
                  Employee ID <span className="req">*</span>
                </label>
                <input
                  name="employeeId"
                  value={form.employeeId}
                  onChange={handleChange}
                  placeholder="Enter employee ID"
                  disabled={isSavingTeacher}
                />
              </div>
              <div className="field-group full">
                <label>
                  Department <span className="req">*</span>
                </label>
                <select
                  name="department"
                  value={form.department}
                  onChange={handleFormDepartmentChange}
                  disabled={isSavingTeacher}
                >
                  <option value="">Select Department</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.department_name}>
                      {d.department_name}
                    </option>
                  ))}
                </select>
              </div>

              {studyMode === "semester" && (
                <div className="field-group">
                  <label>Semester</label>
                  <select
                    name="semester"
                    value={form.semester}
                    onChange={handleChange}
                    disabled={isSavingTeacher}
                  >
                    <option value="">Select Semester</option>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                      <option key={s} value={s}>
                        {s} Semester
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {studyMode === "year" && (
                <div className="field-group">
                  <label>{isFormGrade ? "Grade" : "Year"}</label>
                  <select
                    name="year"
                    value={form.year}
                    onChange={handleChange}
                    disabled={isSavingTeacher}
                  >
                    <option value="">{isFormGrade ? "Select Grade" : "Select Year"}</option>
                    {getYearOptions(selectedFormDept).map((y) => (
                      <option key={y} value={y}>
                        {isFormGrade ? `Grade ${y}` : `${y} Year`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="tc-modal-footer">
              <button className="btn btn-cancel" onClick={resetForm} disabled={isSavingTeacher}>
                Cancel
              </button>
              <button
                className="btn btn-save"
                onClick={editId ? updateTeacher : saveTeacher}
                disabled={isSavingTeacher}
              >
                {isSavingTeacher
                  ? (editId ? "Updating…" : "Saving…")
                  : (editId ? "Update" : "Save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAssignModal && (
        <div className="tc-overlay" onClick={closeAssignModal}>
          <div className="tc-modal tc-assign-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tc-modal-header">
              <h3>Assign Subjects to {assignTeacher?.fullName}</h3>
              <button className="modal-close" onClick={closeAssignModal}>
                ✕
              </button>
            </div>

            <div className="tc-modal-body tc-assign-body">
              <div className="tc-assign-filters">
                <div className="field-group">
                  <label>Department</label>
                  <select
                    name="department_code"
                    value={assignFilters.department_code}
                    onChange={assignHandleFilterChange}
                  >
                    <option value="">Select Department</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.department_code}>
                        {d.department_name} ({d.course_type})
                      </option>
                    ))}
                  </select>
                </div>

                {assignSelectedDept?.course_type === "semester" && (
                  <div className="field-group">
                    <label>Semester</label>
                    <select
                      name="value"
                      value={assignFilters.value}
                      onChange={assignHandleFilterChange}
                    >
                      <option value="">Select Semester</option>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                        <option key={s} value={s}>
                          {s} Semester
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {assignSelectedDept?.course_type === "year" && (
                  <div className="field-group">
                    <label>{isAssignGrade ? "Grade" : "Year"}</label>
                    <select
                      name="value"
                      value={assignFilters.value}
                      onChange={assignHandleFilterChange}
                    >
                      <option value="">{isAssignGrade ? "Select Grade" : "Select Year"}</option>
                      {getYearOptions(assignSelectedDept).map((y) => (
                        <option key={y} value={y}>
                          {isAssignGrade ? `Grade ${y}` : `${y} Year`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="tc-assign-section">
                <label className="tc-assign-section-label">Available Subjects</label>

                {assignLoading && (
                  <p className="tc-assign-hint">Loading assigned subjects…</p>
                )}
                {!assignLoading && assignSubjects.length === 0 && (
                  <p className="tc-assign-hint">
                    Select department and semester/year/grade to load subjects.
                  </p>
                )}

                {!assignLoading && assignSubjects.length > 0 && (
                  <div className="tc-assign-list">
                    {assignSubjects.map((sub) => {
                      const assigned = assignIsAssigned(sub.id);
                      const otherTeachers = getOtherAssignedTeachers(sub);
                      const takenByOther = otherTeachers.length > 0 && !assigned;
                      const isBusy = assigningKey === sub.id;

                      return (
                        <div
                          key={sub.id}
                          className={`tc-assign-item${assigned ? " is-assigned" : ""}${
                            takenByOther ? " is-taken" : ""
                          }${isBusy ? " is-busy" : ""}`}
                        >
                          <div className="tc-assign-item-row">
                            <div className="tc-assign-item-info">
                              <span className="tc-assign-item-name">
                                {sub.subject_name || sub.name}
                              </span>
                              <span className="tc-assign-item-code">
                                {sub.subject_code || sub.code}
                              </span>
                            </div>

                            {assigned ? (
                              <button
                                className="action-btn unverify"
                                onClick={() => assignToggleSubject(sub)}
                                disabled={isBusy}
                              >
                                {isBusy ? "Removing…" : "Unassign"}
                              </button>
                            ) : takenByOther ? (
                              <span className="tc-assign-taken-badge">Taken</span>
                            ) : (
                              <button
                                className="action-btn verify"
                                onClick={() => assignToggleSubject(sub)}
                                disabled={isBusy}
                              >
                                {isBusy ? "Assigning…" : "Assign"}
                              </button>
                            )}
                          </div>

                          {otherTeachers.length > 0 && (
                            <span className="tc-assign-conflict">
                              Already assigned to:{" "}
                              {otherTeachers.map((t) => t.name).filter(Boolean).join(", ")}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="tc-assign-section tc-assign-current">
                <label className="tc-assign-section-label">
                  Currently Assigned Subjects
                  <span className="tc-assign-count">{assignAssigned.length}</span>
                </label>

                <div className="tc-table-wrap tc-assign-table-wrap">
                  <table className="tc-table" style={{ minWidth: "unset" }}>
                    <thead>
                      <tr>
                        <th>Department</th>
                        <th>Sem / Year / Grade</th>
                        <th>Subject</th>
                        <th>Code</th>
                        <th>Remove</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignLoading && (
                        <tr>
                          <td colSpan="5" className="tc-empty">
                            Loading…
                          </td>
                        </tr>
                      )}
                      {!assignLoading && assignAssigned.length === 0 && (
                        <tr>
                          <td colSpan="5" className="tc-empty">
                            No Subjects Assigned Yet
                          </td>
                        </tr>
                      )}
                      {!assignLoading &&
                        assignAssigned.map((a) => {
                          const isBusy = assigningKey === a.id;
                          const assignedDept = departments.find(
                            (d) => d.department_code === a.department_code
                          );
                          return (
                            <tr key={a.id} className="tc-row">
                              <td>{a.department_code}</td>
                              <td>{formatPeriod(a.semester, a.year, assignedDept)}</td>
                              <td>{a.subject_name}</td>
                              <td>{a.subject_code}</td>
                              <td>
                                <button
                                  className="action-btn unverify"
                                  onClick={() => assignToggleSubject(a)}
                                  disabled={isBusy}
                                >
                                  {isBusy ? "Removing…" : "Unassign"}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="tc-modal-footer">
              <button className="btn btn-cancel" onClick={closeAssignModal}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}