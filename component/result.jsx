import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import axios from "axios";

import "./result.css";

const API = "http://127.0.0.1:5000";
const ROWS_PER_PAGE = 15;
const LOOKUP_DELAY = 500;
const EXAM_TERMS = ["First Term", "Second Term", "Final Term"];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const normalizeCode = code =>
  (code || "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();

const getGrade = dept => {

  if (!dept || dept.course_type !== "year")
    return null;

  const match =
    normalizeCode(dept.department_code)
      .match(/(11|12)$/);

  return match
    ? Number(match[1])
    : null;
};

const getPeriodOptions = dept => {

  if (dept?.course_type === "semester")
    return [1, 2, 3, 4, 5, 6, 7, 8];

  const grade = getGrade(dept);

  return grade
    ? [grade]
    : [1, 2, 3, 4];
};

const periodLabel = (dept, value) => {

  if (dept?.course_type === "semester")
    return `Semester ${value}`;

  return getGrade(dept)
    ? `Grade ${value}`
    : `Year ${value}`;
};

// Match the student's department (code or name) to the departments list
const findStudentDepartment = (departments, student) => {

  const candidates = [
    student.department_code,
    student.department_name,
    student.department
  ]
    .map(normalizeCode)
    .filter(Boolean);

  if (!candidates.length) return null;

  return (
    departments.find(d =>
      candidates.includes(normalizeCode(d.department_code)) ||
      candidates.includes(normalizeCode(d.department_name))
    ) || null
  );
};

// Decide which semester / year / grade value belongs to the student
const resolveStudentPeriod = (dept, student) => {

  const options = getPeriodOptions(dept).map(Number);

  const raw =
    dept.course_type === "semester"
      ? (student.semester || student.year)
      : (student.year || student.semester);

  const num = Number(raw);

  if (num && options.includes(num)) return num;

  const grade = getGrade(dept);

  return grade || null;
};

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
    return [firstPage, "...", ...range(leftSibling, rightSibling), "...", lastPage];
  }

  return range(1, total);
}

const emptyForm = (isTeacher, user) => ({
  roll: "",
  studentName: "",
  department_name: "",
  subject_id: "",
  subject_name: "",
  marks: "",
  employee_id: isTeacher ? user.employee_id : "",
  employee_name: isTeacher ? user.full_name : "",
  exam_term: "",
  verified: 0
});

const idleStudentInfo = {
  status: "idle",
  message: "",
  deptCode: "",
  period: ""
};

const isValidMark = v => {
  if (v === "" || v === null || v === undefined) return false;
  const n = Number(v);
  return !isNaN(n) && n >= 0 && n <= 100;
};

const csvCell = v =>
  `"${String(v ?? "").replace(/"/g, '""')}"`;

// Small labelled wrapper with an inline error message
const Field = ({ label, error, full, children }) => (
  <div className={`rm-field${full ? " rm-full" : ""}${error ? " rm-has-error" : ""}`}>
    {label && <label className="rm-label">{label}</label>}
    {children}
    {error && <span className="rm-error">{error}</span>}
  </div>
);

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

function Result() {

  const user =
    JSON.parse(
      localStorage.getItem("user")
    ) || {};

  const role =
    user.role || "";

  const isTeacher =
    role === "teacher";

  const [departments, setDepartments] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [results, setResults] = useState([]);

  const [filters, setFilters] = useState({
    department_code: "",
    value: ""
  });

  // Table controls
  const [searchTerm, setSearchTerm] = useState("");
  const [termFilter, setTermFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("recent");
  const [currentPage, setCurrentPage] = useState(1);

  // Entry form
  const [form, setForm] = useState(emptyForm(isTeacher, user));
  const [entryMode, setEntryMode] = useState("bulk"); // bulk | single
  const [bulkMarks, setBulkMarks] = useState({});      // { [subject_id]: marks }
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // status: idle | loading | found | notfound | error
  const [studentInfo, setStudentInfo] = useState(idleStudentInfo);

  // Row actions
  const [editingRow, setEditingRow] = useState(null);
  const [editMarks, setEditMarks] = useState({});
  const [resendingKey, setResendingKey] = useState(null);
  const [verifyingKey, setVerifyingKey] = useState(null);

  // Toasts
  const [toasts, setToasts] = useState([]);

  const notify = useCallback((type, message) => {

    const id = Date.now() + Math.random();

    setToasts(prev => [...prev, { id, type, message }]);

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, type === "error" ? 6000 : 3500);

  }, []);

  // Keeps the latest filters available inside async callbacks
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  const showTableData =
    filters.department_code &&
    filters.value;

  const selectedDept =
    useMemo(() => {

      return departments.find(
        d =>
          d.department_code ===
          filters.department_code
      );

    }, [
      departments,
      filters.department_code
    ]);

  const isGradeDept =
    !!getGrade(selectedDept);

  const autoFilled =
    studentInfo.status === "found";

  // Department + period fields only appear once a roll number is typed
  const showDeptPeriod =
    form.roll.trim() !== "";

  // The subject-entry section (All subjects / One subject) appears only
  // after a roll number is entered and the student has been found.
  // Picking a department / period in the top filters does not show it.
  const subjectsReady =
    showDeptPeriod &&
    studentInfo.status === "found";

  const hasBulkMarks =
    Object.values(bulkMarks).some(v => v !== "" && v !== undefined);

  // Cancel shows only when the user has entered something
  const hasFormData =
    form.roll.trim() !== "" ||
    form.subject_id !== "" ||
    form.exam_term !== "" ||
    form.marks !== "" ||
    hasBulkMarks ||
    (!isTeacher && form.employee_id.trim() !== "");

  /* ---------------------------- data loading ---------------------------- */

  const getData = async (
    url,
    params = {}
  ) => {

    try {

      const res =
        await axios.get(
          `${API}${url}`,
          { params }
        );

      return res.data;

    } catch (err) {

      console.log(err);

      return [];
    }
  };

  const fetchDepartments =
    async () => {

      const data =
        await getData(
          "/departments"
        );

      setDepartments(data);
    };

  const periodParams = () => {

    const params = {
      department_code:
        filters.department_code
    };

    if (selectedDept?.course_type === "semester") {
      params.semester = filters.value;
    } else {
      params.year = filters.value;
    }

    return params;
  };

  const fetchSubjects =
    async () => {

      if (!showTableData) {

        setSubjects([]);

        return;
      }

      const endpoint =
        isTeacher && user.employee_id
          ? `/teacher-assigned-subjects/${user.employee_id}`
          : "/subjects";

      const data =
        await getData(
          endpoint,
          periodParams()
        );

      setSubjects(Array.isArray(data) ? data : []);
    };

  const fetchResults =
    async () => {

      if (!showTableData) {

        setResults([]);

        return;
      }

      const params = periodParams();

      if (isTeacher) {

        params.employee_id =
          user.employee_id;
      }

      const data =
        await getData(
          "/results",
          params
        );

      setResults(Array.isArray(data) ? data : []);
    };

  useEffect(() => {

    fetchDepartments();

  }, []);

  useEffect(() => {

    fetchSubjects();

    fetchResults();

  }, [
    filters,
    selectedDept
  ]);

  useEffect(() => {

    setSearchTerm("");
    setTermFilter("all");
    setStatusFilter("all");
    setCurrentPage(1);

  }, [
    filters.department_code,
    filters.value
  ]);

  useEffect(() => {

    setCurrentPage(1);

  }, [termFilter, statusFilter, sortBy]);

  // If the subject list changes, drop selections that are no longer valid
  useEffect(() => {

    const validIds = new Set(subjects.map(s => String(s.id)));

    setForm(prev =>
      prev.subject_id && !validIds.has(String(prev.subject_id))
        ? { ...prev, subject_id: "", subject_name: "" }
        : prev
    );

    setBulkMarks(prev => {
      const next = {};
      Object.keys(prev).forEach(k => {
        if (validIds.has(String(k))) next[k] = prev[k];
      });
      return Object.keys(next).length === Object.keys(prev).length
        ? prev
        : next;
    });

  }, [subjects]);

  /* -------------------- roll number -> student lookup -------------------- */

  useEffect(() => {

    const roll = form.roll.trim();

    if (!roll) {

      setStudentInfo(idleStudentInfo);

      setForm(prev =>
        prev.studentName ? { ...prev, studentName: "" } : prev
      );

      return;
    }

    // Wait until departments are loaded so we can match them
    if (!departments.length) return;

    let cancelled = false;

    setStudentInfo(prev => ({
      ...prev,
      status: "loading",
      message: "Looking up student…"
    }));

    const timer = setTimeout(async () => {

      try {

        const res = await axios.get(
          `${API}/student/${encodeURIComponent(roll)}`
        );

        if (cancelled) return;

        const student = res.data || {};

        const dept =
          findStudentDepartment(departments, student);

        // Student found, but department could not be matched
        if (!dept) {

          setForm(prev => ({
            ...prev,
            studentName: student.full_name || ""
          }));

          setStudentInfo({
            status: "found",
            message:
              `Found: ${student.full_name || roll}. ` +
              "Department could not be matched — select it manually.",
            deptCode: "",
            period: ""
          });

          return;
        }

        const period =
          resolveStudentPeriod(dept, student);

        const prevFilters = filtersRef.current;

        const changed =
          prevFilters.department_code !== dept.department_code ||
          String(prevFilters.value) !== String(period || "");

        setFilters({
          department_code: dept.department_code,
          value: period ? String(period) : ""
        });

        setForm(prev => ({
          ...prev,
          studentName: student.full_name || "",
          department_name: dept.department_name,
          subject_id: changed ? "" : prev.subject_id,
          subject_name: changed ? "" : prev.subject_name
        }));

        if (changed) setBulkMarks({});

        setErrors(prev => ({ ...prev, roll: undefined, period: undefined }));

        setStudentInfo({
          status: "found",
          message:
            `Found: ${student.full_name || roll} · ` +
            `${dept.department_name}` +
            (period ? ` · ${periodLabel(dept, period)}` : " · period not set"),
          deptCode: dept.department_code,
          period: period ? String(period) : ""
        });

      } catch (err) {

        if (cancelled) return;

        const notFound = err.response?.status === 404;

        setForm(prev => ({
          ...prev,
          studentName: ""
        }));

        setStudentInfo({
          status: notFound ? "notfound" : "error",
          message: notFound
            ? "Student not found for this roll number"
            : "Could not look up student. Try again.",
          deptCode: "",
          period: ""
        });
      }

    }, LOOKUP_DELAY);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };

  }, [form.roll, departments]);

  // Admin typing a teacher ID -> fetch teacher name (debounced)
  useEffect(() => {

    if (isTeacher) return;

    const id = (form.employee_id || "").trim();

    if (!id) {
      setForm(prev =>
        prev.employee_name ? { ...prev, employee_name: "" } : prev
      );
      return;
    }

    let cancelled = false;

    const timer = setTimeout(async () => {

      try {

        const res = await axios.get(
          `${API}/teacher/${encodeURIComponent(id)}`
        );

        if (cancelled) return;

        setForm(prev => ({
          ...prev,
          employee_name: res.data?.full_name || ""
        }));

      } catch {

        if (cancelled) return;

        setForm(prev => ({ ...prev, employee_name: "" }));
      }

    }, LOOKUP_DELAY);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };

  }, [form.employee_id]);

  /* ------------------------------ handlers ------------------------------ */

  const clearError = name =>
    setErrors(prev =>
      prev[name] ? { ...prev, [name]: undefined } : prev
    );

  const handleFilter =
    e => {

      const {
        name,
        value
      } = e.target;

      setFilters(prev => {

        const updated = {
          ...prev,
          [name]: value
        };

        if (name === "department_code") {

          const dept =
            departments.find(
              d =>
                d.department_code ===
                value
            );

          const grade =
            getGrade(dept);

          updated.value = grade
            ? String(grade)
            : "";
        }

        return updated;
      });

      // Keep the form's department in sync with the filter
      if (name === "department_code") {

        const dept =
          departments.find(
            d => d.department_code === value
          );

        setForm(prev => ({
          ...prev,
          department_name: dept?.department_name || "",
          subject_id: "",
          subject_name: ""
        }));

        setBulkMarks({});
      }
    };

  const handleSearchChange =
    e => {

      setSearchTerm(
        e.target.value
      );

      setCurrentPage(1);
    };

  const handleChange = e => {

    const {
      name,
      value
    } = e.target;

    clearError(name);

    // Manual department pick (only possible when not auto-filled)
    if (name === "department_name") {

      const dept =
        departments.find(
          d => d.department_name === value
        );

      const grade = getGrade(dept);

      setFilters({
        department_code: dept?.department_code || "",
        value: grade ? String(grade) : ""
      });

      setForm(prev => ({
        ...prev,
        department_name: value,
        subject_id: "",
        subject_name: ""
      }));

      setBulkMarks({});

      return;
    }

    if (name === "subject_id") {

      const sub =
        subjects.find(
          s => String(s.id) === value
        );

      setForm(prev => ({
        ...prev,
        subject_id: value,
        subject_name: sub?.subject_name || ""
      }));

      return;
    }

    setForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleBulkMark = (subjectId, value) => {

    setBulkMarks(prev => ({
      ...prev,
      [subjectId]: value
    }));

    setErrors(prev =>
      prev.bulk?.[subjectId]
        ? { ...prev, bulk: { ...prev.bulk, [subjectId]: undefined } }
        : prev
    );
  };

  const resetEntry = ({ clearFilters = false } = {}) => {

    if (clearFilters) {
      setFilters({
        department_code: "",
        value: ""
      });
    }

    setForm(prev => ({
      ...emptyForm(isTeacher, user),
      department_name: clearFilters ? "" : prev.department_name
    }));

    setBulkMarks({});
    setErrors({});
    setStudentInfo(idleStudentInfo);
  };

  // Cancel entering a result: clear the form and hide dept / period again
  const handleCancelForm = () => {

    if (
      hasFormData &&
      !window.confirm("Discard what you've entered?")
    ) return;

    // A filter that was auto-set from the student's record is cleared too.
    // A manually chosen filter is left alone.
    resetEntry({ clearFilters: !!studentInfo.deptCode });
  };

  const triggerPredictionRetrain = () => {

    axios
      .post(`${API}/admin/performance-predictions/retrain`)
      .catch(err => {
        console.log(
          "Background prediction retrain skipped/failed:",
          err?.response?.data || err.message
        );
      });
  };

  /* ----------------------------- saving marks ----------------------------- */

  // Subjects that already have a result for this roll + term
  const existingSubjectIds =
    useMemo(() => {

      const roll = form.roll.trim();

      if (!roll || !form.exam_term) return new Set();

      return new Set(
        results
          .filter(r =>
            String(r.roll) === roll &&
            r.exam_term === form.exam_term
          )
          .map(r => String(r.subject_id))
      );

    }, [results, form.roll, form.exam_term]);

  const buildPayload = (subject, marks) => {

    const dept =
      departments.find(
        d => d.department_code === filters.department_code
      );

    const payload = {
      roll: form.roll.trim(),
      studentName: form.studentName,
      department_name: dept?.department_name || form.department_name,
      department_code: dept?.department_code,
      subject_id: subject.id,
      subject_name: subject.subject_name,
      marks: Number(marks),
      employee_id: form.employee_id,
      employee_name: form.employee_name,
      exam_term: form.exam_term,
      verified: 0
    };

    if (dept?.course_type === "semester") {
      payload.semester = Number(filters.value);
    } else {
      payload.year = Number(filters.value);
    }

    return payload;
  };

  // Returns an errors object (empty when everything is valid)
  const validate = () => {

    const e = {};

    if (!form.roll.trim()) {
      e.roll = "Enter a roll number";
    } else if (studentInfo.status === "loading") {
      e.roll = "Student lookup in progress — wait a moment";
    } else if (studentInfo.status !== "found") {
      e.roll = "Student not found. Check the roll number";
    }

    if (!filters.department_code || !filters.value) {

      e.period = "Department and Semester / Year / Grade are required";

    } else if (
      studentInfo.deptCode &&
      (studentInfo.deptCode !== filters.department_code ||
        studentInfo.period !== String(filters.value))
    ) {

      e.period =
        "This doesn't match the student's record. Re-enter the roll number to reset it";
    }

    if (!form.exam_term) e.exam_term = "Select an exam term";

    if (!isTeacher) {
      if (!form.employee_id.trim()) {
        e.employee_id = "Enter a teacher ID";
      } else if (!form.employee_name) {
        e.employee_id = "Teacher not found";
      }
    }

    if (entryMode === "single") {

      if (!form.subject_id) {
        e.subject_id = "Select a subject";
      } else if (existingSubjectIds.has(String(form.subject_id))) {
        e.subject_id = "A result already exists for this subject and term";
      }

      if (!isValidMark(form.marks)) {
        e.marks = "Marks must be between 0 and 100";
      }

    } else {

      const bulkErrors = {};
      let entered = 0;

      subjects.forEach(s => {

        if (existingSubjectIds.has(String(s.id))) return;

        const v = bulkMarks[s.id];

        if (v === "" || v === undefined) return;

        entered += 1;

        if (!isValidMark(v)) bulkErrors[s.id] = "0 – 100";
      });

      if (Object.keys(bulkErrors).length) {
        e.bulk = bulkErrors;
        e.bulkSummary = "Fix the marks highlighted below";
      } else if (!entered) {
        e.bulkSummary = "Enter marks for at least one subject";
      }
    }

    return e;
  };

  const handleSubmit =
    async e => {

      e.preventDefault();

      if (saving) return;

      const found = validate();

      const hasErrors =
        Object.values(found).some(v => v !== undefined);

      setErrors(found);

      if (hasErrors) {
        notify("error", "Please fix the highlighted fields.");
        return;
      }

      // Build the list of subjects to save
      const queue =
        entryMode === "single"
          ? [{
              subject: subjects.find(
                s => String(s.id) === String(form.subject_id)
              ),
              marks: form.marks
            }]
          : subjects
              .filter(s =>
                !existingSubjectIds.has(String(s.id)) &&
                bulkMarks[s.id] !== "" &&
                bulkMarks[s.id] !== undefined
              )
              .map(s => ({ subject: s, marks: bulkMarks[s.id] }));

      if (queue.some(q => !q.subject)) {
        notify("error", "You are not assigned to this subject. Refresh and try again.");
        return;
      }

      setSaving(true);

      const outcomes = await Promise.allSettled(
        queue.map(q =>
          axios.post(
            `${API}/add-result`,
            buildPayload(q.subject, q.marks)
          )
        )
      );

      setSaving(false);

      const saved = [];
      const failed = [];

      outcomes.forEach((o, i) => {

        if (o.status === "fulfilled") {
          saved.push(queue[i].subject);
        } else {
          failed.push({
            subject: queue[i].subject,
            msg: o.reason?.response?.data?.msg || "Save failed"
          });
        }
      });

      await fetchResults();

      if (!failed.length) {

        notify(
          "success",
          saved.length === 1
            ? `Saved ${saved[0].subject_name}.`
            : `Saved ${saved.length} subjects for ${form.studentName || form.roll}.`
        );

        // Keep the department / period filters so the table stays visible
        resetEntry();

        return;
      }

      if (saved.length) {

        notify("success", `Saved ${saved.length} subject(s).`);

        // Keep only the marks that failed so they can be retried
        setBulkMarks(prev => {
          const next = {};
          failed.forEach(f => {
            next[f.subject.id] = prev[f.subject.id];
          });
          return next;
        });
      }

      failed.forEach(f =>
        notify("error", `${f.subject.subject_name}: ${f.msg}`)
      );
    };

  /* ------------------------------ row actions ------------------------------ */

  const handleDelete =
    async g => {

      const count = g.ids.length;

      if (
        !window.confirm(
          `Delete ${g.studentName || g.roll}'s ${g.exam_term} result` +
          ` (${count} subject${count > 1 ? "s" : ""})?`
        )
      )
        return;

      try {

        await Promise.all(
          g.ids.map(id =>
            axios.delete(`${API}/delete-result/${id}`)
          )
        );

        notify("success", "Result deleted.");

        fetchResults();

        triggerPredictionRetrain();

      } catch (err) {

        console.log(err);

        notify("error", "Delete failed.");

        fetchResults();
      }
    };

  const updateVerify =
    async (
      ids,
      verified,
      rowKey
    ) => {

      if (verifyingKey) return;

      setVerifyingKey(rowKey);

      try {

        await axios.put(
          `${API}/verify-results-bulk`,
          {
            ids: ids,
            verified: verified ? 1 : 0
          }
        );

        await fetchResults();

        notify("success", verified ? "Result verified." : "Result unverified.");

        triggerPredictionRetrain();

      } catch (err) {

        console.log(err);

        notify("error", "Action failed.");

      } finally {

        setVerifyingKey(null);
      }
    };

  const resendResultEmail =
    async g => {

      const rowKey =
        g.roll + "_" + g.exam_term;

      const period_value =
        g.semester ?? g.year;

      setResendingKey(rowKey);

      try {

        const res = await axios.post(
          `${API}/resend-result-email`,
          {
            roll: g.roll,
            exam_term: g.exam_term,
            semester_year: period_value
          }
        );

        notify("success", res.data?.msg || "Email sent.");

      } catch (err) {

        console.log(err);

        notify(
          "error",
          err.response?.data?.msg || "Failed to resend email."
        );

      } finally {

        setResendingKey(null);
      }
    };

  /* ------------------------------ table data ------------------------------ */

  const grouped =
    useMemo(() => {

      const map = {};

      results.forEach(r => {

        const key =
          r.roll +
          "_" +
          r.exam_term;

        if (!map[key]) {

          map[key] = {

            id: r.id,

            ids: [],

            roll: r.roll,

            studentName:
              r.studentName,

            exam_term:
              r.exam_term,

            verified:
              Number(r.verified),

            teachers: [],

            subjects: {},

            total: 0,

            semester: r.semester,
            year: r.year
          };
        }

        map[key].ids.push(r.id);

        map[key].subjects[
          r.subject_name
        ] = {

          marks: r.marks,

          id: r.id
        };

        map[key].total +=
          Number(r.marks);

        if (
          r.employee_name &&
          !map[key].teachers.includes(
            r.employee_name
          )
        ) {

          map[key].teachers.push(
            r.employee_name
          );
        }
      });

      return Object.values(map);

    }, [results]);

  const pctNum =
    g => {

      const count = isGradeDept
        ? Object.keys(g.subjects).length
        : subjects.length;

      if (!count)
        return 0;

      return (g.total / (count * 100)) * 100;
    };

  const stats =
    useMemo(() => {

      const verified = grouped.filter(g => Number(g.verified) === 1).length;

      const avg =
        grouped.length
          ? grouped.reduce((sum, g) => sum + pctNum(g), 0) / grouped.length
          : 0;

      return {
        total: grouped.length,
        verified,
        pending: grouped.length - verified,
        avg
      };

    }, [grouped, subjects, isGradeDept]);

  const filteredGrouped =
    useMemo(() => {

      const term =
        searchTerm.trim().toLowerCase();

      let list = grouped.filter(g => {

        if (termFilter !== "all" && g.exam_term !== termFilter)
          return false;

        if (statusFilter === "verified" && Number(g.verified) !== 1)
          return false;

        if (statusFilter === "pending" && Number(g.verified) === 1)
          return false;

        if (!term) return true;

        return (
          g.roll?.toString().toLowerCase().includes(term) ||
          g.studentName?.toLowerCase().includes(term)
        );
      });

      if (sortBy === "roll") {
        list = [...list].sort((a, b) =>
          String(a.roll).localeCompare(String(b.roll), undefined, { numeric: true })
        );
      } else if (sortBy === "pct_desc") {
        list = [...list].sort((a, b) => pctNum(b) - pctNum(a));
      } else if (sortBy === "pct_asc") {
        list = [...list].sort((a, b) => pctNum(a) - pctNum(b));
      }

      return list;

    }, [
      grouped,
      searchTerm,
      termFilter,
      statusFilter,
      sortBy,
      subjects,
      isGradeDept
    ]);

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        filteredGrouped.length /
          ROWS_PER_PAGE
      )
    );

  const safePage =
    Math.min(
      currentPage,
      totalPages
    );

  const pageStart =
    (safePage - 1) *
    ROWS_PER_PAGE;

  const pageRows =
    filteredGrouped.slice(
      pageStart,
      pageStart + ROWS_PER_PAGE
    );

  const goTo = p =>
    setCurrentPage(
      Math.max(
        1,
        Math.min(p, totalPages)
      )
    );

  const paginationSlots =
    getPaginationSlots(
      safePage,
      totalPages,
      1
    );

  const subjectList =
    subjects.map(
      s => s.subject_name
    );

  const exportCsv = () => {

    if (!filteredGrouped.length) {
      notify("error", "Nothing to export.");
      return;
    }

    const header = [
      "Roll", "Student", "Teacher", "Term",
      ...subjectList, "Total", "Percentage", "Status"
    ];

    const rows = filteredGrouped.map(g => [
      g.roll,
      g.studentName,
      g.teachers.join(", "),
      g.exam_term,
      ...subjectList.map(s => g.subjects[s]?.marks ?? ""),
      g.total,
      pctNum(g).toFixed(2),
      Number(g.verified) === 1 ? "Verified" : "Pending"
    ]);

    const csv =
      [header, ...rows]
        .map(r => r.map(csvCell).join(","))
        .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download =
      `results_${filters.department_code}_${filters.value}.csv`;
    a.click();

    URL.revokeObjectURL(url);
  };

  /* ------------------------------ row editing ------------------------------ */

  const handleRowEdit = row => {

    const key =
      row.roll +
      "_" +
      row.exam_term;

    setEditingRow(key);

    const data = {};

    results.forEach(r => {

      if (
        r.roll === row.roll &&
        r.exam_term ===
          row.exam_term
      ) {

        data[r.id] = {

          id: r.id,

          roll: r.roll,

          studentName:
            r.studentName,

          department_name:
            r.department_name,

          department_code:
            r.department_code,

          subject_id:
            r.subject_id,

          subject_name:
            r.subject_name,

          marks: r.marks,

          employee_id:
            r.employee_id,

          employee_name:
            r.employee_name,

          exam_term:
            r.exam_term,

          semester:
            r.semester,

          year: r.year,

          verified:
            r.verified
        };
      }
    });

    setEditMarks(data);
  };

  const handleMarkChange = (
    id,
    value
  ) => {

    setEditMarks(prev => ({
      ...prev,

      [id]: {
        ...prev[id],

        marks: value
      }
    }));
  };

  const cancelRowEdit = () => {

    setEditingRow(null);

    setEditMarks({});

    notify("info", "Edit cancelled.");
  };

  const saveUpdatedMarks =
    async () => {

      const items = Object.values(editMarks);

      if (items.some(item => !isValidMark(item.marks))) {
        notify("error", "Every mark must be a number between 0 and 100.");
        return;
      }

      try {

        const promises =
          items.map(item => {

            const payload = {

              roll: item.roll,

              studentName:
                item.studentName,

              department_name:
                item.department_name,

              department_code:
                item.department_code,

              subject_id:
                item.subject_id,

              subject_name:
                item.subject_name,

              marks: Number(
                item.marks
              ),

              employee_id:
                item.employee_id,

              employee_name:
                item.employee_name,

              exam_term:
                item.exam_term,

              semester:
                item.semester,

              year:
                item.year,

              verified:
                item.verified
            };

            return axios.put(
              `${API}/update-result/${item.id}`,
              payload
            );
          });

        await Promise.all(
          promises
        );

        notify("success", "Marks updated. The result is pending verification again.");

        setEditingRow(null);

        setEditMarks({});

        fetchResults();

        triggerPredictionRetrain();

      } catch (err) {

        console.log(err);

        notify(
          "error",
          err.response?.data?.msg || "Update failed."
        );
      }
    };

  /* ------------------------------ derived UI ------------------------------ */

  const periodInputValue =
    selectedDept && filters.value
      ? periodLabel(selectedDept, filters.value)
      : "";

  const periodPlaceholder =
    selectedDept?.course_type === "semester"
      ? "Semester"
      : isGradeDept
        ? "Grade"
        : "Semester / Year / Grade";

  const statusClass = {
    loading: "rm-tone-muted",
    found: "rm-tone-ok",
    notfound: "rm-tone-bad",
    error: "rm-tone-bad",
    idle: "rm-tone-muted"
  }[studentInfo.status];

  const noAssigned =
    isTeacher &&
    showTableData &&
    subjects.length === 0;

  // Live summary for the bulk grid
  const bulkSummary =
    useMemo(() => {

      const entered =
        subjects
          .filter(s =>
            !existingSubjectIds.has(String(s.id)) &&
            isValidMark(bulkMarks[s.id])
          )
          .map(s => Number(bulkMarks[s.id]));

      const total = entered.reduce((a, b) => a + b, 0);

      return {
        count: entered.length,
        total,
        pct: entered.length ? total / entered.length : 0
      };

    }, [subjects, bulkMarks, existingSubjectIds]);

  const pctTone = p =>
    p >= 60 ? "rm-pct-good" : p >= 40 ? "rm-pct-mid" : "rm-pct-low";

  /* --------------------------------- UI --------------------------------- */

  return (

    <div className="result-container">

      {/* Toasts */}
      <div className="rm-toasts" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`rm-toast rm-toast-${t.type}`}>
            {t.message}
          </div>
        ))}
      </div>

      <h2>
        Result Management System
      </h2>

      {/* ---------- Filters ---------- */}
      <div className="result-filter-box">

        <select
          name="department_code"
          value={
            filters.department_code
          }
          onChange={handleFilter}
        >

          <option value="">
            Select Department
          </option>

          {departments.map(d => (

            <option
              key={d.id}
              value={d.department_code}
            >
              {d.department_name}
            </option>

          ))}

        </select>

        {selectedDept && (

          <select
            name="value"
            value={filters.value}
            onChange={handleFilter}
          >

            <option value="">
              Select {
                selectedDept.course_type ===
                "semester"
                  ? "Semester"
                  : isGradeDept
                    ? "Grade"
                    : "Year"
              }
            </option>

            {getPeriodOptions(
              selectedDept
            ).map(v => (

              <option
                key={v}
                value={v}
              >
                {periodLabel(
                  selectedDept,
                  v
                )}
              </option>

            ))}

          </select>

        )}

      </div>

      {/* ---------- Entry form ---------- */}
      <form
        className="result-form"
        onSubmit={handleSubmit}
        noValidate
      >

        <Field label="Roll number" error={errors.roll}>
          <input
            type="text"
            name="roll"
            value={form.roll}
            onChange={handleChange}
            placeholder="Roll Number"
            autoComplete="off"
          />
        </Field>

        <Field label="Student name">
          <input
            type="text"
            value={form.studentName}
            readOnly
            placeholder="Student Name"
          />
        </Field>

        {studentInfo.message && (

          <div className={`rm-student-status ${statusClass}`}>
            {studentInfo.status === "loading" && (
              <span className="rm-spinner" />
            )}
            {studentInfo.message}
          </div>

        )}

        {/* Department + period only appear after a roll number is entered */}
        {showDeptPeriod && (

          <>

            <Field label="Department">
              <select
                name="department_name"
                value={form.department_name}
                onChange={handleChange}
                disabled={autoFilled && !!studentInfo.deptCode}
                className={autoFilled && studentInfo.deptCode ? "rm-locked" : ""}
                title={
                  autoFilled && studentInfo.deptCode
                    ? "Auto-filled from the student's record"
                    : ""
                }
              >

                <option value="">
                  Department
                </option>

                {departments.map(d => (

                  <option
                    key={d.id}
                    value={d.department_name}
                  >
                    {d.department_name}
                  </option>

                ))}

              </select>
            </Field>

            <Field
              label={periodPlaceholder}
              error={errors.period}
            >
              <input
                type="text"
                value={periodInputValue}
                readOnly
                className={periodInputValue ? "rm-locked" : ""}
                placeholder={periodPlaceholder}
                title="Auto-filled from the student's record, or from the filter above"
              />
            </Field>

          </>

        )}

        <Field label="Exam term" error={errors.exam_term}>
          <select
            name="exam_term"
            value={form.exam_term}
            onChange={handleChange}
          >

            <option value="">
              Exam Term
            </option>

            {EXAM_TERMS.map(t => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}

          </select>
        </Field>

        <Field label="Teacher ID" error={errors.employee_id}>
          <input
            type="text"
            name="employee_id"
            value={form.employee_id}
            onChange={handleChange}
            readOnly={isTeacher}
            className={isTeacher ? "rm-locked" : ""}
            placeholder="Teacher ID"
          />
        </Field>

        <Field label="Teacher name">
          <input
            type="text"
            value={form.employee_name}
            readOnly
            placeholder="Teacher Name"
          />
        </Field>

        {/* Subject entry: only after a roll number is entered and found */}
        {subjectsReady && (
        <>

        <div className="rm-full rm-mode-row">

          <div className="rm-mode-toggle" role="tablist" aria-label="Entry mode">

            <button
              type="button"
              role="tab"
              aria-selected={entryMode === "bulk"}
              className={`rm-mode-btn ${entryMode === "bulk" ? "active" : ""}`}
              onClick={() => setEntryMode("bulk")}
            >
              All subjects
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={entryMode === "single"}
              className={`rm-mode-btn ${entryMode === "single" ? "active" : ""}`}
              onClick={() => setEntryMode("single")}
            >
              One subject
            </button>

          </div>

          <span className="rm-mode-hint">
            {entryMode === "bulk"
              ? "Enter marks for several subjects and save them together."
              : "Save a single subject's marks."}
          </span>

        </div>

        {noAssigned && (

          <p className="noAssignedSubjectMsg rm-full">
            You have no subjects assigned for this
            Department / Semester-Year-Grade. Contact
            the admin to get subjects assigned.
          </p>

        )}

        {entryMode === "single" ? (

          <>

            <Field label="Subject" error={errors.subject_id}>
              <select
                name="subject_id"
                value={form.subject_id}
                onChange={handleChange}
              >

                <option value="">
                  {noAssigned
                    ? "No Assigned Subjects"
                    : "Select Subject"}
                </option>

                {subjects.map(s => (

                  <option
                    key={s.id}
                    value={s.id}
                  >
                    {s.subject_name}
                    {existingSubjectIds.has(String(s.id)) ? " (already entered)" : ""}
                  </option>

                ))}

              </select>
            </Field>

            <Field label="Marks (0–100)" error={errors.marks}>
              <input
                type="number"
                name="marks"
                value={form.marks}
                onChange={handleChange}
                placeholder="Marks"
                min="0"
                max="100"
              />
            </Field>

          </>

        ) : (

          <div className="rm-full rm-bulk">

            {!showTableData ? (

              <p className="rm-empty-note">
                Department / period could not be matched — select them
                in the filters above to load the subjects.
              </p>

            ) : subjects.length === 0 ? (

              <p className="rm-empty-note">
                No subjects found for this department and period.
              </p>

            ) : (

              <>

                <div className="rm-bulk-grid">

                  {subjects.map(s => {

                    const done = existingSubjectIds.has(String(s.id));
                    const err = errors.bulk?.[s.id];

                    return (

                      <div
                        key={s.id}
                        className={
                          `rm-bulk-item${done ? " rm-done" : ""}${err ? " rm-has-error" : ""}`
                        }
                      >

                        <label
                          className="rm-bulk-name"
                          htmlFor={`bulk-${s.id}`}
                          title={s.subject_name}
                        >
                          {s.subject_name}
                        </label>

                        <input
                          id={`bulk-${s.id}`}
                          type="number"
                          min="0"
                          max="100"
                          placeholder={done ? "Entered" : "0–100"}
                          disabled={done}
                          value={done ? "" : (bulkMarks[s.id] ?? "")}
                          onChange={e => handleBulkMark(s.id, e.target.value)}
                        />

                        {done && (
                          <span className="rm-bulk-tag">
                            Already entered for {form.exam_term}
                          </span>
                        )}

                        {err && <span className="rm-error">{err}</span>}

                      </div>
                    );
                  })}

                </div>

                {errors.bulkSummary && (
                  <span className="rm-error">{errors.bulkSummary}</span>
                )}

                <div className="rm-bulk-summary">

                  <span>
                    <b>{bulkSummary.count}</b> of{" "}
                    {subjects.length - existingSubjectIds.size} subjects filled
                  </span>

                  <span>
                    Total <b>{bulkSummary.total}</b>
                  </span>

                  <span className={pctTone(bulkSummary.pct)}>
                    Average <b>{bulkSummary.pct.toFixed(1)}%</b>
                  </span>

                </div>

              </>

            )}

          </div>

        )}

        </>
        )}

        <div className="button-group">

          {showDeptPeriod && (

          <button
            type="submit"
            disabled={
              saving ||
              studentInfo.status === "loading" ||
              noAssigned
            }
          >
            {saving
              ? "Saving…"
              : entryMode === "bulk" && bulkSummary.count > 1
                ? `Save ${bulkSummary.count} results`
                : "Save result"}
          </button>

          )}

          {hasFormData && (

            <button
              type="button"
              className="result-cancel-btn"
              onClick={handleCancelForm}
              disabled={saving}
            >
              Cancel
            </button>

          )}

        </div>

      </form>

      {/* ---------- Stats ---------- */}
      {showTableData && (

        <div className="rm-stats">

          <div className="rm-stat">
            <span className="rm-stat-num">{stats.total}</span>
            <span className="rm-stat-label">Result sheets</span>
          </div>

          <div className="rm-stat">
            <span className="rm-stat-num rm-tone-ok">{stats.verified}</span>
            <span className="rm-stat-label">Verified</span>
          </div>

          <div className="rm-stat">
            <span className="rm-stat-num rm-tone-bad">{stats.pending}</span>
            <span className="rm-stat-label">Pending</span>
          </div>

          <div className="rm-stat">
            <span className="rm-stat-num">{stats.avg.toFixed(1)}%</span>
            <span className="rm-stat-label">Average</span>
          </div>

        </div>

      )}

      {/* ---------- Toolbar ---------- */}
      {showTableData && (

        <div className="rm-toolbar">

          <input
            type="text"
            className="result-search-input"
            placeholder="Search by Roll No or Student Name"
            value={searchTerm}
            onChange={handleSearchChange}
          />

          <select
            value={termFilter}
            onChange={e => setTermFilter(e.target.value)}
            aria-label="Filter by term"
          >
            <option value="all">All terms</option>
            {EXAM_TERMS.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            <option value="verified">Verified</option>
            <option value="pending">Pending</option>
          </select>

          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            aria-label="Sort"
          >
            <option value="recent">Newest first</option>
            <option value="roll">Roll number</option>
            <option value="pct_desc">Highest %</option>
            <option value="pct_asc">Lowest %</option>
          </select>

          <button
            type="button"
            className="rm-export-btn"
            onClick={exportCsv}
          >
            Export CSV
          </button>

        </div>

      )}

      {/* ---------- Table ---------- */}
      <div className="table-wrapper">

        <table>

          <thead>

            <tr>

              <th>Roll</th>

              <th>Student</th>

              <th>Teacher</th>

              <th>Term</th>

              {subjectList.map(
                (s, i) => (
                  <th key={i}>
                    {s}
                  </th>
                )
              )}

              <th>Total</th>

              <th>%</th>

              <th>Status</th>

              <th>Action</th>

            </tr>

          </thead>

          <tbody>

            {!showTableData ? (

              <tr>

                <td
                  colSpan={
                    subjectList.length + 8
                  }
                >
                  Please Select Department
                  and Semester / Year / Grade
                  (or enter a Roll Number above)
                </td>

              </tr>

            ) : filteredGrouped.length === 0 ? (

              <tr>

                <td
                  colSpan={
                    subjectList.length + 8
                  }
                >
                  No Result Found
                </td>

              </tr>

            ) : (

              pageRows.map((g, i) => {

                const rowKey =
                  g.roll +
                  "_" +
                  g.exam_term;

                const isEditing =
                  editingRow ===
                  rowKey;

                const isResending =
                  resendingKey ===
                  rowKey;

                const isVerifying =
                  verifyingKey ===
                  rowKey;

                const pct = pctNum(g);

                return (

                  <tr key={rowKey}>

                    <td>{g.roll}</td>

                    <td>
                      {g.studentName}
                    </td>

                    <td>
                      {g.teachers.join(", ")}
                    </td>

                    <td>
                      {g.exam_term}
                    </td>

                    {subjectList.map(
                      (s, idx) => {

                        const subjectData =
                          g.subjects[s];

                        return (

                          <td key={idx}>

                            {isEditing &&
                            subjectData ? (

                              <input
                                type="number"
                                min="0"
                                max="100"
                                className="table-input"
                                value={
                                  editMarks[
                                    subjectData.id
                                  ]?.marks ?? ""
                                }
                                onChange={e =>
                                  handleMarkChange(
                                    subjectData.id,
                                    e.target.value
                                  )
                                }
                              />

                            ) : (

                              subjectData?.marks ?? "-"
                            )}

                          </td>
                        );
                      }
                    )}

                    <td>{g.total}</td>

                    <td>
                      <span className={pctTone(pct)}>
                        {pct.toFixed(2)}%
                      </span>
                    </td>

                    <td>

                      {isVerifying ? (

                        <span className="rm-status-loading">
                          <span className="rm-spinner" />
                          {Number(g.verified) === 1
                            ? "Unverifying…"
                            : "Verifying…"}
                        </span>

                      ) : (

                        <b
                          className={
                            Number(g.verified) === 1
                              ? "rm-tone-ok"
                              : "rm-tone-bad"
                          }
                        >

                          {Number(
                            g.verified
                          ) === 1
                            ? "Verified"
                            : "Pending"}

                        </b>

                      )}

                    </td>

                    <td>

                      <div className="action-buttons">

                        {!isEditing ? (

                          <button
                            className="edit-btn"
                            disabled={isVerifying}
                            onClick={() =>
                              handleRowEdit(g)
                            }
                          >
                            Edit
                          </button>

                        ) : (

                          <>

                            <button
                              className="Teacher-save-btn"
                              onClick={
                                saveUpdatedMarks
                              }
                            >
                              Save
                            </button>

                            <button
                              className="Teacher-cancel-btn"
                              onClick={
                                cancelRowEdit
                              }
                            >
                              Cancel
                            </button>

                          </>

                        )}

                        {role ===
                          "admin" && (

                          <button
                            className="verify-btn"
                            disabled={isVerifying}
                            onClick={() =>
                              updateVerify(
                                g.ids,
                                !Number(
                                  g.verified
                                ),
                                rowKey
                              )
                            }
                          >

                            {isVerifying && (
                              <span className="rm-spinner" />
                            )}

                            {isVerifying
                              ? (Number(g.verified) === 1
                                  ? "Unverifying…"
                                  : "Verifying…")
                              : (Number(g.verified) === 1
                                  ? "Unverify"
                                  : "Verify")}

                          </button>

                        )}

                        {role === "admin" &&
                          Number(g.verified) === 1 && (

                          <button
                            className="verify-btn"
                            disabled={isResending || isVerifying}
                            onClick={() =>
                              resendResultEmail(g)
                            }
                          >
                            {isResending
                              ? "Sending…"
                              : "📧 Resend Email"}
                          </button>

                        )}

                        <button
                          className="delete-btn"
                          disabled={isVerifying}
                          onClick={() =>
                            handleDelete(g)
                          }
                        >
                          Delete
                        </button>

                      </div>

                    </td>

                  </tr>
                );
              })
            )}

          </tbody>

        </table>

      </div>

      {showTableData &&
        filteredGrouped.length > ROWS_PER_PAGE && (

        <div className="result-pagination">

          <span className="result-page-info">
            Showing {pageStart + 1}–
            {Math.min(
              pageStart + ROWS_PER_PAGE,
              filteredGrouped.length
            )} of {filteredGrouped.length}
          </span>

          <div className="result-page-btns">

            <button
              className="result-page-btn nav"
              onClick={() => goTo(safePage - 1)}
              disabled={safePage === 1}
            >
              &#8249;
            </button>

            {paginationSlots.map((p, i) =>
              p === "..." ? (
                <span
                  key={`e-${i}`}
                  className="result-page-ellipsis"
                >
                  …
                </span>
              ) : (
                <button
                  key={p}
                  className={`result-page-btn ${
                    safePage === p ? "active" : ""
                  }`}
                  onClick={() => goTo(p)}
                >
                  {p}
                </button>
              )
            )}

            <button
              className="result-page-btn nav"
              onClick={() => goTo(safePage + 1)}
              disabled={safePage === totalPages}
            >
              &#8250;
            </button>

          </div>

        </div>

      )}

    </div>
  );
}

export default Result;