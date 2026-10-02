import React, {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";

import axios from "axios";

import "./teacherResult.css";

const API = "http://127.0.0.1:5000";
const LOOKUP_DELAY = 500;
const ROWS_PER_PAGE = 15;
const EXAM_TERMS = ["First Term", "Second Term", "Final Term"];

// ================= HELPERS =================

const normalizeCode = code =>
  (code || "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();

// Grade (11 / 12) departments are "year" type with a code ending in 11/12
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

const idleStudentInfo = {
  status: "idle",   // idle | loading | found | notfound | error
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

const markTone = n =>
  n >= 60 ? "rm-pct-good" : n >= 40 ? "rm-pct-mid" : "rm-pct-low";

// Labelled wrapper with an inline error message
const Field = ({ label, error, children }) => (
  <div className={`rm-field${error ? " rm-has-error" : ""}`}>
    {label && <label className="rm-label">{label}</label>}
    {children}
    {error && <span className="rm-error">{error}</span>}
  </div>
);


function TeacherResultInsert() {

  const storedUser =
    localStorage.getItem("user");

  const user =
    storedUser
      ? JSON.parse(storedUser)
      : null;

  const teacherId =
    user?.employee_id || "";

  const teacherName =
    user?.full_name || "";

  const role =
    user?.role || "";

  // department_code / semester / year are the VIEW filters (always visible).
  // The rest is the result-entry form.
  const makeEmptyForm = () => ({

    roll: "",

    studentName: "",

    department_code:
      user?.department_code || "",

    semester: "",

    year: "",

    subject_id: "",

    subject_name: "",

    marks: "",

    exam_term: ""
  });


  const [departments, setDepartments] =
    useState([]);

  const [subjects, setSubjects] =
    useState([]);

  const [results, setResults] =
    useState([]);

  const [editId, setEditId] =
    useState(null);

  const [form, setForm] =
    useState(makeEmptyForm());

  const [studentInfo, setStudentInfo] =
    useState(idleStudentInfo);

  // Entry helpers
  const [entryMode, setEntryMode] =
    useState("bulk");            // bulk | single

  const [bulkMarks, setBulkMarks] =
    useState({});                // { [subject_id]: marks }

  const [errors, setErrors] =
    useState({});

  const [saving, setSaving] =
    useState(false);

  // Table controls
  const [searchTerm, setSearchTerm] =
    useState("");

  const [termFilter, setTermFilter] =
    useState("all");

  const [sortBy, setSortBy] =
    useState("recent");

  const [page, setPage] =
    useState(1);

  // Toasts
  const [toasts, setToasts] =
    useState([]);

  const notify =
    useCallback((type, message) => {

      const id = Date.now() + Math.random();

      setToasts(prev => [
        ...prev,
        { id, type, message }
      ]);

      setTimeout(() => {
        setToasts(prev =>
          prev.filter(t => t.id !== id)
        );
      }, type === "error" ? 6000 : 3500);

    }, []);


  // ---------- VIEW FILTERS (drive the table) ----------
  const selectedDept =
    useMemo(() => {

      return departments.find(
        d =>
          d.department_code ===
          form.department_code
      );

    }, [
      departments,
      form.department_code
    ]);

  const periodValue =
    form.semester || form.year;

  const showTableData =
    !!form.department_code &&
    !!periodValue;

  const isSemesterDept =
    selectedDept?.course_type ===
    "semester";

  const periodName =
    isSemesterDept
      ? "Semester"
      : getGrade(selectedDept)
        ? "Grade"
        : "Year";

  // ---------- ENTRY CONTEXT (where a new result is saved) ----------
  // While editing: the result's own department / period.
  // When a student is found: the student's own department / period,
  // so browsing other periods in the filters never breaks saving.
  // Otherwise: whatever is selected in the filters.
  const studentMatched =
    !editId &&
    studentInfo.status === "found" &&
    !!studentInfo.deptCode;

  const entryDeptCode =
    studentMatched
      ? studentInfo.deptCode
      : form.department_code;

  const entryPeriod =
    studentMatched
      ? (
          studentInfo.period ||
          (
            form.department_code === studentInfo.deptCode
              ? periodValue
              : ""
          )
        )
      : periodValue;

  const entryDept =
    useMemo(() => {

      return departments.find(
        d =>
          d.department_code ===
          entryDeptCode
      );

    }, [
      departments,
      entryDeptCode
    ]);

  const isSemesterEntry =
    entryDept?.course_type ===
    "semester";

  const entryPeriodName =
    isSemesterEntry
      ? "Semester"
      : getGrade(entryDept)
        ? "Grade"
        : entryDept
          ? "Year"
          : "Semester / Year";

  const entryReady =
    !!entryDeptCode &&
    !!entryPeriod;

  const filtersDifferFromEntry =
    studentMatched &&
    entryReady &&
    (
      form.department_code !== entryDeptCode ||
      String(periodValue) !== String(entryPeriod)
    );

  // Editing is always single-subject
  const mode =
    editId
      ? "single"
      : entryMode;

  // Department + period fields only show once a roll number is typed
  const showDeptPeriod =
    form.roll.trim() !== "";

  const hasBulkMarks =
    Object.values(bulkMarks).some(
      v => v !== "" && v !== undefined
    );

  const hasEntry =
    !!(
      form.roll ||
      form.subject_id ||
      form.marks ||
      form.exam_term ||
      hasBulkMarks
    );

  // The subject-entry section (All subjects / One subject) appears only
  // after a roll number is entered AND the student has been found
  // (or while editing an existing result). Just picking a department /
  // semester / year in the filters does not show it.
  const studentReady =
    !!editId ||
    studentInfo.status === "found";

  const noSubjects =
    showDeptPeriod &&
    studentReady &&
    entryReady &&
    subjects.length === 0;


  useEffect(() => {

    if (
      !user ||
      role !== "teacher"
    ) {

      alert("Teacher login required");

      window.location.href =
        "/login";
    }

  }, []);


  // ================= DEPARTMENTS =================
  const fetchDepartments =
    async () => {

      try {

        const res =
          await axios.get(
            `${API}/departments`
          );

        setDepartments(
          res.data || []
        );

      } catch (err) {

        console.log(err);
      }
    };

  useEffect(() => {

    fetchDepartments();

  }, []);


  // ================= SUBJECTS (assigned-only) =================
  // Loaded for the ENTRY context (student's department / period,
  // or the filters when no student is selected).
  useEffect(() => {

    if (
      !entryDeptCode ||
      !entryPeriod ||
      !teacherId ||
      !departments.length
    ) {

      setSubjects([]);

      return;
    }

    let cancelled = false;

    const load = async () => {

      try {

        const params = {
          department_code:
            entryDeptCode
        };

        if (isSemesterEntry) {

          params.semester =
            entryPeriod;

        } else {

          params.year =
            entryPeriod;
        }

        const res =
          await axios.get(
            `${API}/teacher-assigned-subjects/${teacherId}`,
            { params }
          );

        if (cancelled) return;

        const data =
          res.data || [];

        setSubjects(data);

        const validIds =
          new Set(data.map(s => String(s.id)));

        // Clear the chosen subject if it isn't in the new list
        setForm(prev =>
          prev.subject_id &&
          !validIds.has(String(prev.subject_id))
            ? {
                ...prev,
                subject_id: "",
                subject_name: ""
              }
            : prev
        );

        // Drop bulk marks for subjects that are no longer listed
        setBulkMarks(prev => {

          const next = {};

          Object.keys(prev).forEach(k => {
            if (validIds.has(String(k)))
              next[k] = prev[k];
          });

          return Object.keys(next).length ===
            Object.keys(prev).length
            ? prev
            : next;
        });

      } catch (err) {

        console.log(err);

        if (!cancelled)
          setSubjects([]);
      }
    };

    load();

    return () => {
      cancelled = true;
    };

  }, [
    entryDeptCode,
    entryPeriod,
    isSemesterEntry,
    departments,
    teacherId
  ]);


  // ================= RESULTS TABLE (old details) =================
  // Shows this teacher's results for the selected
  // department + semester / year filters.
  const fetchResults =
    async () => {

      if (!showTableData) {

        setResults([]);

        return;
      }

      try {

        const params = {

          employee_id:
            teacherId,

          department_code:
            form.department_code
        };

        if (isSemesterDept) {

          params.semester =
            periodValue;

        } else {

          params.year =
            periodValue;
        }

        const res =
          await axios.get(
            `${API}/results`,
            { params }
          );

        setResults(
          Array.isArray(res.data)
            ? res.data
            : []
        );

      } catch (err) {

        console.log(err);
      }
    };

  useEffect(() => {

    fetchResults();

  }, [
    showTableData,
    form.department_code,
    form.semester,
    form.year,
    selectedDept
  ]);

  useEffect(() => {

    setSearchTerm("");

    setTermFilter("all");

    setPage(1);

  }, [
    form.department_code,
    form.semester,
    form.year
  ]);

  useEffect(() => {

    setPage(1);

  }, [
    searchTerm,
    termFilter,
    sortBy
  ]);


  // ============================================================
  // AUTO-FETCH: roll number -> student name, department, period
  // Debounced, with cancellation so stale responses are ignored.
  // Skipped while editing an existing result so old results keep
  // their original department / period.
  // ============================================================
  useEffect(() => {

    if (editId) return;

    const roll =
      form.roll.trim();

    if (!roll) {

      setStudentInfo(idleStudentInfo);

      return;
    }

    // Wait until departments are loaded so we can match them
    if (!departments.length) return;

    let cancelled = false;

    // New roll number -> forget the previous student's name / subject / marks
    setForm(prev => ({
      ...prev,
      studentName: "",
      subject_id: "",
      subject_name: ""
    }));

    setBulkMarks({});

    setStudentInfo({
      status: "loading",
      message: "Looking up student…",
      deptCode: "",
      period: ""
    });

    const timer = setTimeout(async () => {

      try {

        const res =
          await axios.get(
            `${API}/student/${encodeURIComponent(roll)}`
          );

        if (cancelled) return;

        const student =
          res.data || {};

        const dept =
          findStudentDepartment(
            departments,
            student
          );

        // Student found, but department could not be matched:
        // the teacher picks the department / period in the filters.
        if (!dept) {

          setForm(prev => ({
            ...prev,
            studentName:
              student.full_name || ""
          }));

          setStudentInfo({
            status: "found",
            message:
              `Found: ${student.full_name || roll}. ` +
              "Department could not be matched — select it above.",
            deptCode: "",
            period: ""
          });

          return;
        }

        const period =
          resolveStudentPeriod(
            dept,
            student
          );

        const isSemester =
          dept.course_type === "semester";

        // Filters follow the student, so the table shows that
        // department / period. They can still be changed afterwards.
        setForm(prev => ({
          ...prev,

          studentName:
            student.full_name || "",

          department_code:
            dept.department_code,

          semester:
            isSemester && period
              ? String(period)
              : "",

          year:
            !isSemester && period
              ? String(period)
              : ""
        }));

        setErrors(prev => ({
          ...prev,
          roll: undefined,
          period: undefined
        }));

        setStudentInfo({
          status: "found",
          message:
            `Found: ${student.full_name || roll} · ` +
            `${dept.department_name}` +
            (period
              ? ` · ${periodLabel(dept, period)}`
              : " · period not set"),
          deptCode: dept.department_code,
          period: period ? String(period) : ""
        });

      } catch (err) {

        if (cancelled) return;

        const notFound =
          err.response?.status === 404;

        setStudentInfo({
          status:
            notFound
              ? "notfound"
              : "error",
          message:
            notFound
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

  }, [
    form.roll,
    departments,
    editId
  ]);


  // ================= DERIVED DATA =================
  const ownResults =
    useMemo(() => {

      return results.filter(
        r =>
          (r.employee_id || "")
            .toLowerCase() ===
          (teacherId || "")
            .toLowerCase()
      );

    }, [
      results,
      teacherId
    ]);

  // Subjects that already have a result for this roll + term
  const existingSubjectIds =
    useMemo(() => {

      if (editId) return new Set();

      const roll = form.roll.trim();

      if (!roll || !form.exam_term)
        return new Set();

      return new Set(
        ownResults
          .filter(r =>
            String(r.roll) === roll &&
            r.exam_term === form.exam_term
          )
          .map(r => String(r.subject_id))
      );

    }, [
      ownResults,
      form.roll,
      form.exam_term,
      editId
    ]);

  const stats =
    useMemo(() => {

      const marks =
        ownResults.map(r => Number(r.marks) || 0);

      return {
        entries: ownResults.length,
        students:
          new Set(ownResults.map(r => String(r.roll))).size,
        avg:
          marks.length
            ? marks.reduce((a, b) => a + b, 0) / marks.length
            : 0,
        highest:
          marks.length
            ? Math.max(...marks)
            : 0
      };

    }, [ownResults]);

  const filteredResults =
    useMemo(() => {

      const term =
        searchTerm.trim().toLowerCase();

      let list =
        ownResults.filter(r => {

          if (
            termFilter !== "all" &&
            r.exam_term !== termFilter
          ) return false;

          if (!term) return true;

          return (
            r.roll?.toString().toLowerCase().includes(term) ||
            r.studentName?.toLowerCase().includes(term) ||
            r.subject_name?.toLowerCase().includes(term)
          );
        });

      if (sortBy === "roll") {

        list = [...list].sort((a, b) =>
          String(a.roll).localeCompare(
            String(b.roll),
            undefined,
            { numeric: true }
          )
        );

      } else if (sortBy === "marks_desc") {

        list = [...list].sort(
          (a, b) => Number(b.marks) - Number(a.marks)
        );

      } else if (sortBy === "marks_asc") {

        list = [...list].sort(
          (a, b) => Number(a.marks) - Number(b.marks)
        );
      }

      return list;

    }, [
      ownResults,
      searchTerm,
      termFilter,
      sortBy
    ]);

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        filteredResults.length /
          ROWS_PER_PAGE
      )
    );

  const safePage =
    Math.min(page, totalPages);

  const pageStart =
    (safePage - 1) * ROWS_PER_PAGE;

  const pageRows =
    filteredResults.slice(
      pageStart,
      pageStart + ROWS_PER_PAGE
    );

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

      const total =
        entered.reduce((a, b) => a + b, 0);

      return {
        count: entered.length,
        total,
        avg:
          entered.length
            ? total / entered.length
            : 0
      };

    }, [
      subjects,
      bulkMarks,
      existingSubjectIds
    ]);


  // ================= FORM CHANGE =================
  const clearError =
    name =>
      setErrors(prev =>
        prev[name]
          ? { ...prev, [name]: undefined }
          : prev
      );

  const handleChange =
    e => {

      const {
        name,
        value
      } = e.target;

      clearError(name);

      // ----- view filters -----
      if (name === "department_code") {

        const dept =
          departments.find(
            d =>
              d.department_code ===
              value
          );

        const grade =
          getGrade(dept);

        clearError("period");

        setForm(prev => ({
          ...prev,
          department_code: value,
          semester: "",
          year: grade
            ? String(grade)
            : ""
        }));

        return;
      }

      if (name === "semester") {

        clearError("period");

        setForm(prev => ({
          ...prev,
          semester: value,
          year: ""
        }));

        return;
      }

      if (name === "year") {

        clearError("period");

        setForm(prev => ({
          ...prev,
          year: value,
          semester: ""
        }));

        return;
      }

      // ----- entry form -----
      if (name === "subject_id") {

        const sub =
          subjects.find(
            s =>
              String(s.id) ===
              value
          );

        setForm(prev => ({
          ...prev,
          subject_id: value,
          subject_name:
            sub?.subject_name || ""
        }));

        return;
      }

      setForm(prev => ({
        ...prev,
        [name]: value
      }));
    };

  const handleBulkMark =
    (subjectId, value) => {

      setBulkMarks(prev => ({
        ...prev,
        [subjectId]: value
      }));

      setErrors(prev =>
        prev.bulk?.[subjectId]
          ? {
              ...prev,
              bulk: {
                ...prev.bulk,
                [subjectId]: undefined
              }
            }
          : prev
      );
    };


  // ================= VALIDATION =================
  // Returns an errors object (empty when everything is valid)
  const validate =
    () => {

      const e = {};

      if (!form.roll.trim()) {

        e.roll = "Enter a roll number";

      } else if (!editId) {

        if (studentInfo.status === "loading") {
          e.roll = "Student lookup in progress — wait a moment";
        } else if (studentInfo.status !== "found") {
          e.roll = "Student not found. Check the roll number";
        }
      }

      if (!e.roll && !form.studentName) {
        e.roll = "Student name is missing";
      }

      if (!entryReady) {
        e.period =
          "Select the department and semester / year first";
      }

      if (!form.exam_term) {
        e.exam_term = "Select an exam term";
      }

      if (mode === "single") {

        if (!form.subject_id || !form.subject_name) {

          e.subject_id = "Select a subject";

        } else if (
          !subjects.some(
            s => String(s.id) === String(form.subject_id)
          )
        ) {

          e.subject_id =
            "You are not assigned to this subject. Refresh and try again";

        } else if (
          existingSubjectIds.has(String(form.subject_id))
        ) {

          e.subject_id =
            "A result already exists for this subject and term";
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

          if (!isValidMark(v))
            bulkErrors[s.id] = "0 – 100";
        });

        if (Object.keys(bulkErrors).length) {

          e.bulk = bulkErrors;
          e.bulkSummary = "Fix the marks highlighted below";

        } else if (!entered) {

          e.bulkSummary =
            "Enter marks for at least one subject";
        }
      }

      return e;
    };

  const buildPayload =
    (subject, marks) => ({

      roll: form.roll.trim(),

      studentName:
        form.studentName,

      department_code:
        entryDeptCode,

      department_name:
        entryDept?.department_name || "",

      semester:
        isSemesterEntry
          ? Number(entryPeriod)
          : null,

      year:
        !isSemesterEntry
          ? Number(entryPeriod)
          : null,

      subject_id:
        subject.id,

      subject_name:
        subject.subject_name,

      marks:
        Number(marks),

      exam_term:
        form.exam_term,

      employee_id:
        teacherId,

      employee_name:
        teacherName
    });


  // ================= SUBMIT =================
  const handleSubmit =
    async e => {

      e.preventDefault();

      if (saving) return;

      const found = validate();

      const hasErrors =
        Object.values(found).some(
          v => v !== undefined
        );

      setErrors(found);

      if (hasErrors) {

        notify(
          "error",
          "Please fix the highlighted fields."
        );

        return;
      }

      // ---------- UPDATE an existing result ----------
      if (editId) {

        const subject =
          subjects.find(
            s =>
              String(s.id) ===
              String(form.subject_id)
          );

        setSaving(true);

        try {

          await axios.put(
            `${API}/update-result/${editId}`,
            buildPayload(subject, form.marks)
          );

          notify(
            "success",
            "Result updated. It is pending verification again."
          );

          // Editing finished: clear the entry, keep the filters
          // so the table you were viewing stays on screen.
          setEditId(null);

          setStudentInfo(idleStudentInfo);

          setErrors({});

          setForm(prev => ({
            ...prev,
            roll: "",
            studentName: "",
            subject_id: "",
            subject_name: "",
            marks: "",
            exam_term: ""
          }));

          fetchResults();

        } catch (err) {

          console.log(err);

          notify(
            "error",
            err.response?.data?.msg ||
              "Save failed."
          );

        } finally {

          setSaving(false);
        }

        return;
      }

      // ---------- ADD new result(s) ----------
      const queue =
        mode === "single"
          ? [{
              subject: subjects.find(
                s =>
                  String(s.id) ===
                  String(form.subject_id)
              ),
              marks: form.marks
            }]
          : subjects
              .filter(s =>
                !existingSubjectIds.has(String(s.id)) &&
                bulkMarks[s.id] !== "" &&
                bulkMarks[s.id] !== undefined
              )
              .map(s => ({
                subject: s,
                marks: bulkMarks[s.id]
              }));

      setSaving(true);

      const outcomes =
        await Promise.allSettled(
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
            msg:
              o.reason?.response?.data?.msg ||
              "Save failed"
          });
        }
      });

      // Move the filters to the period the result was saved to,
      // so the table shows it.
      const moveFilters = prev => ({
        ...prev,
        department_code:
          entryDeptCode,
        semester:
          isSemesterEntry
            ? String(entryPeriod)
            : "",
        year:
          !isSemesterEntry
            ? String(entryPeriod)
            : ""
      });

      if (!failed.length) {

        notify(
          "success",
          saved.length === 1
            ? `Saved ${saved[0].subject_name}.`
            : `Saved ${saved.length} subjects for ${form.studentName || form.roll}.`
        );

        setErrors({});

        if (mode === "single") {

          // Keep the roll number + student so the next subject can be
          // entered right away.
          setForm(prev => ({
            ...moveFilters(prev),
            subject_id: "",
            subject_name: "",
            marks: ""
          }));

        } else {

          // All subjects saved: ready for the next student
          // (the exam term is kept).
          setBulkMarks({});

          setStudentInfo(idleStudentInfo);

          setForm(prev => ({
            ...moveFilters(prev),
            roll: "",
            studentName: "",
            subject_id: "",
            subject_name: "",
            marks: ""
          }));
        }

        fetchResults();

        return;
      }

      if (saved.length) {

        notify(
          "success",
          `Saved ${saved.length} subject(s).`
        );

        // Keep only the marks that failed so they can be retried
        setBulkMarks(prev => {

          const next = {};

          failed.forEach(f => {
            next[f.subject.id] =
              prev[f.subject.id];
          });

          return next;
        });

        setForm(moveFilters);
      }

      failed.forEach(f =>
        notify(
          "error",
          `${f.subject.subject_name}: ${f.msg}`
        )
      );

      fetchResults();
    };


  // ================= EDIT =================
  const handleEdit =
    item => {

      setStudentInfo(idleStudentInfo);

      setBulkMarks({});

      setErrors({});

      setEditId(item.id);

      setForm({

        roll:
          item.roll || "",

        studentName:
          item.studentName ||
          "",

        department_code:
          item.department_code ||
          "",

        semester:
          item.semester
            ? String(item.semester)
            : "",

        year:
          item.year
            ? String(item.year)
            : "",

        subject_id:
          item.subject_id != null
            ? String(item.subject_id)
            : "",

        subject_name:
          item.subject_name ||
          "",

        marks:
          item.marks ?? "",

        exam_term:
          item.exam_term ||
          ""
      });

      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    };


  // ================= CANCEL =================
  // Clears the entry (roll number, student, subject, marks, term).
  // The Department + Semester/Year filters and the table stay as they
  // are, so you can keep viewing old results.
  const handleCancel =
    () => {

      if (
        !editId &&
        hasEntry &&
        !window.confirm(
          "Discard what you've entered?"
        )
      ) return;

      setEditId(null);

      setStudentInfo(idleStudentInfo);

      setBulkMarks({});

      setErrors({});

      setForm(prev => ({
        ...prev,
        roll: "",
        studentName: "",
        subject_id: "",
        subject_name: "",
        marks: "",
        exam_term: ""
      }));
    };


  // ================= DELETE =================
  const handleDelete =
    async item => {

      const confirmDelete =
        window.confirm(
          `Delete ${item.subject_name} result for ` +
          `${item.studentName || item.roll} (${item.exam_term})?`
        );

      if (!confirmDelete)
        return;

      try {

        await axios.delete(
          `${API}/delete-result/${item.id}`
        );

        notify("success", "Result deleted.");

        fetchResults();

      } catch (err) {

        console.log(err);

        notify("error", "Delete failed.");
      }
    };


  // ================= EXPORT =================
  const exportCsv =
    () => {

      if (!filteredResults.length) {

        notify("error", "Nothing to export.");

        return;
      }

      const header = [
        "Roll", "Student", "Subject",
        "Marks", "Term", "Teacher"
      ];

      const rows =
        filteredResults.map(r => [
          r.roll,
          r.studentName,
          r.subject_name,
          r.marks,
          r.exam_term,
          r.employee_name
        ]);

      const csv =
        [header, ...rows]
          .map(r => r.map(csvCell).join(","))
          .join("\n");

      const blob =
        new Blob(
          [csv],
          { type: "text/csv;charset=utf-8;" }
        );

      const url =
        URL.createObjectURL(blob);

      const a =
        document.createElement("a");

      a.href = url;

      a.download =
        `my_results_${form.department_code}_${periodValue}.csv`;

      a.click();

      URL.revokeObjectURL(url);
    };


  const termClass =
    term => {

      if (
        term ===
        "First Term"
      )
        return "termBadge termFirst";

      if (
        term ===
        "Second Term"
      )
        return "termBadge termSecond";

      if (
        term ===
        "Final Term"
      )
        return "termBadge termFinal";

      return "termBadge";
    };


  const statusColor = {
    loading: "#888",
    found: "green",
    notfound: "red",
    error: "red",
    idle: "#888"
  }[studentInfo.status];


  return (

    <div className="teacherResultContainer">

      {/* Toasts */}
      <div
        className="rm-toasts"
        aria-live="polite"
      >
        {toasts.map(t => (
          <div
            key={t.id}
            className={`rm-toast rm-toast-${t.type}`}
          >
            {t.message}
          </div>
        ))}
      </div>

      <h2>
        Teacher Result System
      </h2>

      <div className="teacherInfoBox">

        <h3>
          Logged Teacher Information
        </h3>

        <p>
          <b>ID :</b>{" "}
          {teacherId}
        </p>

        <p>
          <b>Name :</b>{" "}
          {teacherName}
        </p>

      </div>

      {/* ===== Department + Semester/Year: ALWAYS visible =====
          Select them to view old results. A roll number also fills
          them in automatically. */}
      <div className="rm-filter-box">

        <span className="rm-filter-title">
          View previous results
        </span>

        <select
          name="department_code"
          value={
            form.department_code
          }
          onChange={
            handleChange
          }
          disabled={!!editId}
          className={editId ? "rm-locked" : ""}
        >

          <option value="">
            Select Department
          </option>

          {departments.map(
            d => (

              <option
                key={d.id}
                value={
                  d.department_code
                }
              >
                {d.department_name}
              </option>
            )
          )}

        </select>

        {!selectedDept ? (

          <select
            disabled
            className="rm-locked"
            value=""
            onChange={() => {}}
          >
            <option value="">
              Select Semester / Year
            </option>
          </select>

        ) : isSemesterDept ? (

          <select
            name="semester"
            value={
              form.semester
            }
            onChange={
              handleChange
            }
            disabled={!!editId}
            className={editId ? "rm-locked" : ""}
          >

            <option value="">
              Select Semester
            </option>

            {getPeriodOptions(
              selectedDept
            ).map(s => (

              <option
                key={s}
                value={s}
              >
                {periodLabel(
                  selectedDept,
                  s
                )}
              </option>
            ))}

          </select>

        ) : (

          <select
            name="year"
            value={
              form.year
            }
            onChange={
              handleChange
            }
            disabled={!!editId}
            className={editId ? "rm-locked" : ""}
          >

            <option value="">
              Select {periodName}
            </option>

            {getPeriodOptions(
              selectedDept
            ).map(y => (

              <option
                key={y}
                value={y}
              >
                {periodLabel(
                  selectedDept,
                  y
                )}
              </option>
            ))}

          </select>
        )}

        {editId && (

          <span className="rm-filter-note">
            Locked while editing
          </span>

        )}

        {filtersDifferFromEntry && (

          <span className="rm-filter-note">
            You are viewing a different period. New results are saved
            to the student's own department / period
            {entryDept
              ? ` (${entryDept.department_name} · ${periodLabel(
                  entryDept,
                  entryPeriod
                )})`
              : ""}.
          </span>

        )}

      </div>

      {/* ===== Entry form ===== */}
      <form
        className="teacherResultForm"
        onSubmit={
          handleSubmit
        }
        noValidate
      >

        <Field
          label="Roll number"
          error={errors.roll}
        >
          <input
            type="text"
            name="roll"
            value={form.roll}
            onChange={
              handleChange
            }
            placeholder="Roll Number"
            autoComplete="off"
            readOnly={!!editId}
            className={editId ? "rm-locked" : ""}
          />
        </Field>

        <Field label="Student name">
          <input
            type="text"
            value={
              form.studentName
            }
            readOnly
            placeholder="Student Name"
          />
        </Field>

        {studentInfo.message && (

          <div
            className="rm-student-status"
            style={{ color: statusColor }}
          >
            {studentInfo.status === "loading" && (
              <span className="rm-spinner" />
            )}
            {studentInfo.message}
          </div>

        )}

        {/* Department + Semester/Year only appear after a roll number is entered */}
        {showDeptPeriod && (

          <>

            <Field label="Department">
              <input
                type="text"
                value={
                  entryDept?.department_name || ""
                }
                readOnly
                placeholder="Department"
                title="Department (auto-filled from the roll number)"
              />
            </Field>

            <Field
              label={entryPeriodName}
              error={errors.period}
            >
              <input
                type="text"
                value={
                  entryDept && entryPeriod
                    ? periodLabel(
                        entryDept,
                        entryPeriod
                      )
                    : ""
                }
                readOnly
                placeholder="Semester / Year"
                title="Semester / Year (auto-filled from the roll number)"
              />
            </Field>

          </>

        )}

        <Field
          label="Exam term"
          error={errors.exam_term}
        >
          <select
            name="exam_term"
            value={
              form.exam_term
            }
            onChange={
              handleChange
            }
          >

            <option value="">
              Select Exam
            </option>

            {EXAM_TERMS.map(t => (
              <option
                key={t}
                value={t}
              >
                {t}
              </option>
            ))}

          </select>
        </Field>

        <Field label="Teacher ID">
          <input
            type="text"
            value={teacherId}
            readOnly
            placeholder="Teacher ID"
          />
        </Field>

        <Field label="Teacher name">
          <input
            type="text"
            value={teacherName}
            readOnly
            placeholder="Teacher Name"
          />
        </Field>

        {/* Entry mode (only after a roll number; not while editing) */}
        {showDeptPeriod && studentReady && !editId && (

          <div className="rm-full rm-mode-row">

            <div
              className="rm-mode-toggle"
              role="tablist"
              aria-label="Entry mode"
            >

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
                ? "Enter marks for all your subjects and save them together."
                : "Save a single subject's marks."}
            </span>

          </div>

        )}

        {noSubjects && (

          <p className="noAssignedSubjectMsg">
            You have no subjects assigned for this
            Department / Semester-Year. Contact
            the admin to get subjects assigned.
          </p>

        )}

        {showDeptPeriod && !studentReady && (

          <p className="rm-empty-note rm-full">
            Subjects appear once the student is found.
          </p>

        )}

        {showDeptPeriod && studentReady && (

        mode === "single" ? (

          <>

            <Field
              label="Subject"
              error={errors.subject_id}
            >
              <select
                name="subject_id"
                value={
                  form.subject_id
                }
                onChange={
                  handleChange
                }
                disabled={!entryReady}
              >

                <option value="">
                  {noSubjects
                    ? "No Assigned Subjects"
                    : "Select Subject"}
                </option>

                {subjects.map(
                  s => (

                    <option
                      key={s.id}
                      value={s.id}
                    >
                      {s.subject_name}
                      {" "}
                      ({s.subject_code})
                      {existingSubjectIds.has(String(s.id))
                        ? " — already entered"
                        : ""}
                    </option>
                  )
                )}

              </select>
            </Field>

            <Field
              label="Marks (0–100)"
              error={errors.marks}
            >
              <input
                type="number"
                name="marks"
                value={
                  form.marks
                }
                onChange={
                  handleChange
                }
                placeholder="Marks"
                min="0"
                max="100"
              />
            </Field>

          </>

        ) : (

          <div className="rm-full rm-bulk">

            {!entryReady ? (

              <p className="rm-empty-note">
                Department / semester or year could not be matched —
                select them in the filters above to load your subjects.
              </p>

            ) : subjects.length === 0 ? (

              <p className="rm-empty-note">
                No assigned subjects found for this period.
              </p>

            ) : (

              <>

                <div className="rm-bulk-grid">

                  {subjects.map(s => {

                    const done =
                      existingSubjectIds.has(String(s.id));

                    const err =
                      errors.bulk?.[s.id];

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

                        {s.subject_code && (
                          <span className="rm-bulk-code">
                            {s.subject_code}
                          </span>
                        )}

                        <input
                          id={`bulk-${s.id}`}
                          type="number"
                          min="0"
                          max="100"
                          placeholder={done ? "Entered" : "0–100"}
                          disabled={done}
                          value={
                            done
                              ? ""
                              : (bulkMarks[s.id] ?? "")
                          }
                          onChange={e =>
                            handleBulkMark(
                              s.id,
                              e.target.value
                            )
                          }
                        />

                        {done && (
                          <span className="rm-bulk-tag">
                            Already entered for {form.exam_term}
                          </span>
                        )}

                        {err && (
                          <span className="rm-error">
                            {err}
                          </span>
                        )}

                      </div>
                    );
                  })}

                </div>

                {errors.bulkSummary && (
                  <span className="rm-error">
                    {errors.bulkSummary}
                  </span>
                )}

                <div className="rm-bulk-summary">

                  <span>
                    <b>{bulkSummary.count}</b> of{" "}
                    {subjects.length - existingSubjectIds.size} subjects filled
                  </span>

                  <span>
                    Total <b>{bulkSummary.total}</b>
                  </span>

                  <span className={markTone(bulkSummary.avg)}>
                    Average <b>{bulkSummary.avg.toFixed(1)}%</b>
                  </span>

                </div>

              </>

            )}

          </div>

        )

        )}

        <div className="rm-button-row">

          {showDeptPeriod && (

          <button
            type="submit"
            disabled={
              saving ||
              !studentReady ||
              studentInfo.status === "loading" ||
              noSubjects
            }
          >

            {saving
              ? "Saving…"
              : editId
                ? "Update Result"
                : mode === "bulk" && bulkSummary.count > 1
                  ? `Save ${bulkSummary.count} results`
                  : "Save Result"}

          </button>

          )}

          {(editId || hasEntry) && (

            <button
              type="button"
              className="cancelEditBtn"
              onClick={
                handleCancel
              }
              disabled={saving}
            >
              {editId
                ? "Cancel Edit"
                : "Cancel"}
            </button>

          )}

        </div>

      </form>

      {showTableData && (

        <>

          <div className="rm-table-heading">
            Showing your results for{" "}
            <b>
              {selectedDept?.department_name}
            </b>
            {" · "}
            <b>
              {periodLabel(
                selectedDept,
                periodValue
              )}
            </b>
          </div>

          {/* Stats */}
          <div className="rm-stats">

            <div className="rm-stat">
              <span className="rm-stat-num">{stats.entries}</span>
              <span className="rm-stat-label">Entries</span>
            </div>

            <div className="rm-stat">
              <span className="rm-stat-num">{stats.students}</span>
              <span className="rm-stat-label">Students</span>
            </div>

            <div className="rm-stat">
              <span className="rm-stat-num">{stats.avg.toFixed(1)}</span>
              <span className="rm-stat-label">Average marks</span>
            </div>

            <div className="rm-stat">
              <span className="rm-stat-num">{stats.highest}</span>
              <span className="rm-stat-label">Highest marks</span>
            </div>

          </div>

          {/* Toolbar */}
          <div className="rm-toolbar">

            <input
              type="text"
              className="teacherSearchInput"
              placeholder="Search by Roll No, Student or Subject"
              value={searchTerm}
              onChange={e =>
                setSearchTerm(e.target.value)
              }
            />

            <select
              value={termFilter}
              onChange={e =>
                setTermFilter(e.target.value)
              }
              aria-label="Filter by term"
            >
              <option value="all">All terms</option>
              {EXAM_TERMS.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={e =>
                setSortBy(e.target.value)
              }
              aria-label="Sort"
            >
              <option value="recent">Newest first</option>
              <option value="roll">Roll number</option>
              <option value="marks_desc">Highest marks</option>
              <option value="marks_asc">Lowest marks</option>
            </select>

            <button
              type="button"
              className="rm-export-btn"
              onClick={exportCsv}
            >
              Export CSV
            </button>

          </div>

        </>

      )}

      <div className="teacherTableWrapper">

        <table className="teacherResultTable">

          <thead>

            <tr>

              <th>Roll</th>

              <th>Student</th>

              <th>Subject</th>

              <th>Marks</th>

              <th>Term</th>

              <th>Teacher</th>

              <th>Action</th>

            </tr>

          </thead>

          <tbody>

            {!showTableData ? (

              <tr>

                <td
                  colSpan="7"
                  className="emptyMessage"
                >
                  Select Department and Semester / Year to view
                  previous results (or enter a Roll Number)
                </td>

              </tr>

            ) : filteredResults.length === 0 ? (

              <tr>

                <td
                  colSpan="7"
                  className="emptyMessage noData"
                >
                  No Result Found
                </td>

              </tr>

            ) : (

              pageRows.map(
                r => (

                  <tr key={r.id}>

                    <td
                      data-label="Roll"
                      className="rollCell"
                    >
                      {r.roll}
                    </td>

                    <td data-label="Student">
                      {r.studentName}
                    </td>

                    <td data-label="Subject">
                      {r.subject_name}
                    </td>

                    <td
                      data-label="Marks"
                      className="marksCell"
                    >
                      <span className={markTone(Number(r.marks))}>
                        {r.marks}
                      </span>
                    </td>

                    <td data-label="Term">
                      <span
                        className={
                          termClass(
                            r.exam_term
                          )
                        }
                      >
                        {r.exam_term}
                      </span>
                    </td>

                    <td data-label="Teacher">
                      {r.employee_name}
                    </td>

                    <td data-label="Action">

                      <div className="rowActions">

                        <button
                          className="editRowBtn"
                          onClick={() =>
                            handleEdit(
                              r
                            )
                          }
                        >
                          Edit
                        </button>

                        <button
                          className="deleteRowBtn"
                          onClick={() =>
                            handleDelete(
                              r
                            )
                          }
                        >
                          Delete
                        </button>

                      </div>

                    </td>

                  </tr>
                )
              )
            )}

          </tbody>

        </table>

      </div>

      {showTableData &&
        filteredResults.length > ROWS_PER_PAGE && (

        <div className="rm-pager">

          <span className="rm-pager-info">
            Showing {pageStart + 1}–
            {Math.min(
              pageStart + ROWS_PER_PAGE,
              filteredResults.length
            )} of {filteredResults.length}
          </span>

          <div className="rm-pager-btns">

            <button
              type="button"
              onClick={() =>
                setPage(Math.max(1, safePage - 1))
              }
              disabled={safePage === 1}
            >
              Previous
            </button>

            <span className="rm-pager-page">
              Page {safePage} of {totalPages}
            </span>

            <button
              type="button"
              onClick={() =>
                setPage(Math.min(totalPages, safePage + 1))
              }
              disabled={safePage === totalPages}
            >
              Next
            </button>

          </div>

        </div>

      )}

    </div>
  );
}

export default TeacherResultInsert;