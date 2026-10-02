import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import {
  FiCalendar, FiBell, FiBookOpen, FiX, FiGlobe,
  FiMail, FiPhone, FiCheckCircle, FiClock, FiAlertCircle, FiPrinter,
  FiChevronDown, FiChevronUp, FiFileText, FiShield
} from "react-icons/fi";
import { MdOutlineHolidayVillage } from "react-icons/md";
import { HiOutlineAcademicCap } from "react-icons/hi";
import "./noticeDisplay.css";

const API = `http://${window.location.hostname}:5000`;

const COLLEGE_NAME = "My College";
const COLLEGE_ADDRESS = "Kathmandu, Nepal";

const MOBILE_BREAKPOINT = 680;

const ALL_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const isGradeValue = (value) => ["11", "12"].includes(String(value ?? "").trim());

const periodLabel = (value, short = false) => {
  if (isGradeValue(value)) return `Grade ${value}`;
  return `${short ? "Sem" : "Semester"} ${value}`;
};

const getCurrentUser = () => {
  const user = localStorage.getItem("user");
  return user ? JSON.parse(user) : null;
};

/* The teacher's name must match the teacher name the admin typed in the schedule.
   Adjust this if your login object uses a different field. */
const getTeacherName = (user) =>
  user ? String(user.name || user.full_name || user.teacher_name || user.username || "").trim() : "";

/* Tolerant matching between the logged-in student and a published schedule.
   "Semester 1", "1st", 1  -> "1"      |     "BCA", "bca ", "BCA-2024" -> matches "BCA" */
const normCode = (v) => String(v ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
const normPeriod = (v) => {
  const m = String(v ?? "").match(/\d+/);
  return m ? String(parseInt(m[0], 10)) : "";
};
const studentMatchesSchedule = (user, row, deptCode) => {
  const uDept = normCode(deptCode ?? user.department ?? user.department_code ?? user.dept);
  const sDept = normCode(row.department_code);
  const uPeriod = normPeriod(user.semester ?? user.year ?? user.semester_year);
  const sPeriod = normPeriod(row.semester_year);
  const deptOk = !!uDept && !!sDept && (uDept === sDept || uDept.startsWith(sDept) || sDept.startsWith(uDept));
  return deptOk && !!uPeriod && uPeriod === sPeriod;
};

/* users.department stores the department NAME ("Bachelor in Computer Application"),
   schedules store the department CODE ("BCA") -> look the code up in the departments table. */
const resolveDeptCode = (user, departments) => {
  const raw = user.department ?? user.department_code ?? user.dept ?? "";
  const n = normCode(raw);
  const d = departments.find(
    (x) =>
      normCode(x.department_code) === n ||
      normCode(x.department_name) === n ||
      (n && normCode(x.department_name).includes(n)) ||
      (n && n.includes(normCode(x.department_name)))
  );
  return d ? d.department_code : raw;
};

/* ---------- schedule helpers ---------- */
const toMin = (t) => {
  if (!t) return NaN;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

const fmtTime = (t) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

const buildGrid = (entries) => {
  const map = new Map();
  entries.forEach((e) => {
    const k = `${e.start_time}-${e.end_time}`;
    if (!map.has(k))
      map.set(k, { start: e.start_time, end: e.end_time, isBreak: e.entry_type === "Break", label: e.subject_name });
  });
  const slots = [...map.values()].sort((a, b) => toMin(a.start) - toMin(b.start));
  const days = ALL_DAYS.filter((d) => entries.some((e) => e.day_of_week === d));
  return { slots, days };
};

const findEntry = (entries, day, slot) =>
  entries.find(
    (x) => x.day_of_week === day && x.start_time === slot.start && x.end_time === slot.end && x.entry_type === "Class"
  );

function TodayStrip({ entries }) {
  const now = new Date();
  const today = ALL_DAYS[now.getDay()];
  const mins = now.getHours() * 60 + now.getMinutes();
  const todays = entries
    .filter((e) => e.day_of_week === today && e.entry_type === "Class")
    .sort((a, b) => toMin(a.start_time) - toMin(b.start_time));
  const current = todays.find((e) => toMin(e.start_time) <= mins && mins < toMin(e.end_time));
  const next = todays.find((e) => toMin(e.start_time) > mins);

  const line = (e) =>
    `${e.subject_name} · ${fmtTime(e.start_time)} - ${fmtTime(e.end_time)}` +
    (e.room ? ` · Room ${e.room}` : "") +
    (e.department_code ? ` · ${e.department_code} ${e.semester_year}` : "");

  return (
    <div className="today-strip print-hide">
      <strong>Today · {today}</strong>
      {todays.length === 0 ? (
        <p>No classes scheduled today.</p>
      ) : (
        <>
          <p><span className="nd-pill nd-pill-now">Now</span>{current ? line(current) : "No class in progress"}</p>
          <p><span className="nd-pill nd-pill-next">Next</span>{next ? line(next) : "No more classes today"}</p>
        </>
      )}
    </div>
  );
}

/* Width of the Time column and of each day column (px). The table gets a
   min-width = TIME_COL + days * DAY_COL, so columns are never squeezed and
   text never breaks in the middle of a word; on small screens the wrapper scrolls. */
const TIME_COL = 150;
const DAY_COL = 140;

function ScheduleGrid({ entries, showClass }) {
  const { slots, days } = buildGrid(entries);
  const today = ALL_DAYS[new Date().getDay()];

  if (!entries.length)
    return (
      <div className="inner-empty-notice">
        <FiAlertCircle /> No time schedule has been published yet.
      </div>
    );

  return (
    <div className="modal-table-wrap schedule-wrap">
      <table className="schedule-table" style={{ minWidth: TIME_COL + days.length * DAY_COL }}>
        <thead>
          <tr>
            <th className="nd-time-head">Time</th>
            {days.map((d) => (
              <th key={d} className={`nd-day-head${d === today ? " nd-today-head" : ""}`}>{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slots.map((s) => (
            <tr key={`${s.start}-${s.end}`}>
              <td className="nd-time">{fmtTime(s.start)} - {fmtTime(s.end)}</td>
              {s.isBreak ? (
                <td colSpan={days.length} className="nd-break">{s.label}</td>
              ) : (
                days.map((d) => {
                  const e = findEntry(entries, d, s);
                  return (
                    <td key={d} className={`nd-day${d === today ? " nd-today" : ""}`}>
                      {e ? (
                        <div className="nd-cell">
                          <strong>{e.subject_name}</strong>
                          {showClass ? (
                            <span>{e.department_code} · {periodLabel(e.semester_year, true)}</span>
                          ) : (
                            e.teacher_name && <span>{e.teacher_name}</span>
                          )}
                          {e.room && <span>Room {e.room}</span>}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  );
                })
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TileImage({ src, alt, fallbackClassName, fallbackIcon }) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [src]);

  if (!src || imgError) {
    return <div className={fallbackClassName}>{fallbackIcon}</div>;
  }

  return (
    <img
      className="tile-thumb"
      src={src}
      alt={alt}
      onError={() => setImgError(true)}
    />
  );
}

function NoticeDisplay() {
  const [eventList, setEventList] = useState([]);
  const [examList, setExamList] = useState([]);
  const [resultNoticeList, setResultNoticeList] = useState([]);
  const [scheduleList, setScheduleList] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [teacherEntries, setTeacherEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedNotice, setSelectedNotice] = useState(null);
  const [modalImgError, setModalImgError] = useState(false);
  const printRef = useRef(null);
  const user = getCurrentUser();
  const teacherName = getTeacherName(user);
  const isStudent = user?.role === "student";
  const isTeacher = user?.role === "teacher";

  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth <= MOBILE_BREAKPOINT : false
  );

  const [showAllEvents, setShowAllEvents] = useState(false);
  const [showAllExams, setShowAllExams] = useState(false);
  const [showAllResults, setShowAllResults] = useState(false);
  const [showAllSchedules, setShowAllSchedules] = useState(false);

  useEffect(() => {
    fetchNotices();
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= MOBILE_BREAKPOINT;
      setIsMobile(mobile);

      if (!mobile) {
        setShowAllEvents(false);
        setShowAllExams(false);
        setShowAllResults(false);
        setShowAllSchedules(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const fetchNotices = async () => {
    setLoading(true);
    try {
      const requests = [
        axios.get(`${API}/notice/event`),
        axios.get(`${API}/notice/exam`),
      ];

      // Result notices are for STUDENTS ONLY (and only their own roll number).
      // Teachers / admins / guests never request them.
      const fetchResults = isStudent && !!user?.roll;
      if (fetchResults) {
        requests.push(axios.get(`${API}/notice/result`, { params: { roll: user.roll } }));
      }

      const [eventsRes, examsRes, resultsRes] = await Promise.all(requests);
      setEventList(eventsRes.data);
      setExamList(examsRes.data);
      setResultNoticeList(fetchResults && resultsRes ? resultsRes.data : []);
    } catch (err) {
      console.error("Failed to fetch notices:", err);
    }

    // time schedules (kept separate so a schedule error never hides the other notices)
    try {
      if (isStudent) {
        const [res, depRes] = await Promise.all([
          axios.get(`${API}/schedule/classes`),
          axios.get(`${API}/notice/departments`),
        ]);
        setScheduleList(res.data);
        setDepartments(depRes.data);
        const code = resolveDeptCode(user, depRes.data);
        if (!res.data.some((r) => studentMatchesSchedule(user, r, code))) {
          console.warn("[Schedule] No published schedule matches this student.", {
            student: { department: user.department, resolvedCode: code, semester: user.semester, year: user.year },
            published: res.data,
          });
        }
      } else if (isTeacher && teacherName) {
        const res = await axios.get(`${API}/schedule`, { params: { teacher: teacherName } });
        setTeacherEntries(res.data);
      }
    } catch (err) {
      console.error("Failed to fetch schedules:", err);
    }

    setLoading(false);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  };

  const relevantExams = examList.filter((n) => {
    if (!user) return false;
    if (user.role !== "student") return false;
    const userDept = String(user.department || "").toUpperCase();
    const userSemYear = String(user.semester ?? user.year ?? "");
    const noticeDept = String(n.department_code || "").toUpperCase();
    return noticeDept.startsWith(userDept) && String(n.semester_year) === userSemYear;
  });

  // Result notices: students only
  const relevantResultNotices = isStudent ? resultNoticeList : [];

  // Students: only the schedule of their own department + semester/year.
  // Teachers: one tile with their own weekly teaching schedule.
  const relevantSchedules = isStudent
    ? scheduleList
        .filter((r) => studentMatchesSchedule(user, r, resolveDeptCode(user, departments)))
        .map((r) => ({ key: `schedule-${r.department_code}-${r.semester_year}`, kind: "class", row: r }))
    : isTeacher && teacherEntries.length > 0
    ? [{ key: "schedule-teacher", kind: "teacher", row: { teacher: teacherName } }]
    : [];

  const visibleEvents = isMobile && !showAllEvents ? eventList.slice(0, 2) : eventList;
  const visibleExams = isMobile && !showAllExams ? relevantExams.slice(0, 2) : relevantExams;
  const visibleResultNotices =
    isMobile && !showAllResults ? relevantResultNotices.slice(0, 2) : relevantResultNotices;
  const visibleSchedules =
    isMobile && !showAllSchedules ? relevantSchedules.slice(0, 2) : relevantSchedules;

  const openSchedule = async (item) => {
    if (item.kind === "teacher") {
      setSelectedNotice({
        type: "schedule",
        data: { mode: "teacher", teacher: teacherName, entries: teacherEntries },
      });
      return;
    }
    try {
      const res = await axios.get(`${API}/schedule`, {
        params: { department_code: item.row.department_code, semester_year: item.row.semester_year },
      });
      setSelectedNotice({
        type: "schedule",
        data: {
          mode: "class",
          department_code: item.row.department_code,
          semester_year: item.row.semester_year,
          entries: res.data,
        },
      });
    } catch {
      alert("Could not load the time schedule");
    }
  };

  useEffect(() => {
    document.body.style.overflow = selectedNotice ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [selectedNotice]);

  useEffect(() => {
    setModalImgError(false);
  }, [selectedNotice]);

  const handlePrint = (e) => {
    e.stopPropagation();
    if (!printRef.current) return;

    const isSchedule = selectedNotice?.type === "schedule";
    const printContent = printRef.current.innerHTML;
    const printWindow = window.open("", "_blank", "width=1100,height=800");
    if (!printWindow) {
      alert("Please allow pop-ups to print.");
      return;
    }

    /* Timetables print on one A4 landscape page (usable area ≈ 1047 x 715 px).
       Other notices keep the normal portrait layout. */
    const scheduleCss = isSchedule
      ? `
            @page { size: A4 landscape; margin: 10mm; }
            body { width: 1047px; margin: 0 auto; padding: 0 !important; }
            .modal-header { margin-bottom: 4px; }
            .modal-logo img { height: 44px; }
            .modal-college-name { font-size: 1.25em; margin: 4px 0 0; }
            .modal-college-address { margin-bottom: 4px; }
            .modal-divider { margin: 8px 0; }
            .modal-dept-info-chips { padding-bottom: 6px; font-size: 0.95em; }
            .notice-text { margin: 6px 0; font-size: 0.85em; }
            .modal-table-wrap { margin: 8px 0; overflow: visible; }
            .schedule-table { table-layout: fixed; min-width: 0 !important; width: 100%; }
            .schedule-table th, .schedule-table td { word-break: normal; overflow-wrap: break-word; hyphens: none; }
            .schedule-table th:first-child, .schedule-table td.nd-time { width: 120px; }
            .schedule-table tr { page-break-inside: avoid; }
            .modal-signature { margin-bottom: 6px; }
            .signature-line { margin-top: 12px; }
            .modal-contact-footer-grid { padding-top: 8px; }
          `
      : "";

    const fitScript = isSchedule
      ? `
              function fit() {
                var maxH = 700;
                document.body.style.zoom = 1;
                var h = document.body.scrollHeight;
                if (h > maxH) document.body.style.zoom = (maxH / h).toFixed(3);
              }
              fit();`
      : "";

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Notice - ${COLLEGE_NAME}</title>
          <meta charset="UTF-8" />
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
              font-family: 'Segoe UI', Arial, sans-serif;
              background: #fff;
              color: #0f172a;
              padding: 32px;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .modal-header { text-align: center; margin-bottom: 16px; }
            .modal-logo img { height: 56px; object-fit: contain; }
            .modal-college-name { font-size: 1.5em; font-weight: 800; color: #0f172a; margin: 8px 0 2px; }
            .modal-college-address { font-size: 0.85em; color: #64748b; margin-bottom: 10px; }
            .modal-divider { border: none; border-top: 1.5px solid #e2e8f0; margin: 14px 0; }
            .modal-content { margin-bottom: 20px; }
            .modal-desc {
              font-size: 0.95em; line-height: 1.75; color: #334155;
              white-space: pre-wrap; background: #f8fafc;
              padding: 14px; border-radius: 8px; margin-top: 10px;
            }
            .notice-text { text-align: justify; line-height: 1.75; font-size: 0.95em; color: #334155; margin: 12px 0; }
            .chip-val { font-weight: 700; color: #0f172a; }
            .modal-dept-info-chips { text-align: center; padding-bottom: 20px; color: #4a6cf7; font-size: 1.1em; font-weight: 700; }
            .modal-image img { max-width: 100%; max-height: 280px; border-radius: 8px; display: block; margin: 14px auto; }
            .modal-table-wrap {
              width: 100%; border-radius: 10px; overflow: hidden;
              border: 1px solid #e2e8f0; margin: 18px 0;
            }
            .modal-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            .modal-table th {
              background: #0f172a; color: #fff; font-weight: 700;
              font-size: 0.8em; text-transform: uppercase; letter-spacing: 0.5px;
              padding: 11px 10px; text-align: left;
            }
            .modal-table td { padding: 10px; font-size: 0.82em; border-bottom: 1px solid #e2e8f0; word-wrap: break-word; }
            .modal-table tr:last-child td { border-bottom: none; }
            .modal-table tr:nth-child(even) { background: #f8fafc; }
            .col-sn, .col-sn-data { width: 13%; text-align: center; }
            .col-subject { width: 47%; }
            .col-date { width: 40%; }
            .subject-cell-highlight { font-weight: 600; color: #0f172a; }
            .date-cell-highlight { color: #4a6cf7; font-weight: 600; }
            .schedule-table { width: 100%; border-collapse: collapse; font-size: 12px; }
            .schedule-table th {
              background: #0f172a; color: #fff; font-size: 11px; text-transform: uppercase;
              letter-spacing: 0.5px; padding: 9px 6px; text-align: center;
            }
            .schedule-table td {
              border: 1px solid #e2e8f0; padding: 8px 6px; text-align: center; vertical-align: middle;
            }
            .schedule-table td.nd-time { font-weight: 700; white-space: nowrap; background: #f8fafc; }
            .schedule-table td.nd-break {
              background: #f1f5f9; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;
            }
            .nd-cell { display: flex; flex-direction: column; gap: 2px; }
            .nd-cell strong { color: #0f172a; }
            .nd-cell span { font-size: 0.85em; color: #64748b; }
            .inner-empty-notice {
              color: #b45309; background: #fffbeb;
              padding: 10px 14px; border-radius: 8px; font-size: 0.88em;
            }
            .result-info-grid { display: flex; flex-wrap: wrap; gap: 10px; margin: 16px 0; }
            .result-info-chip {
              flex: 1 1 45%; background: #f8fafc; border: 1px solid #e2e8f0;
              border-radius: 8px; padding: 10px 12px;
            }
            .result-info-label {
              display: block; font-size: 0.72em; text-transform: uppercase;
              letter-spacing: 0.5px; color: #64748b; margin-bottom: 3px;
            }
            .result-info-value { font-size: 0.95em; font-weight: 700; color: #0f172a; }
            .result-status-row {
              display: flex; align-items: center; gap: 8px;
              color: #15803d; background: #f0fdf4; border: 1px solid #bbf7d0;
              padding: 10px 14px; border-radius: 8px; font-weight: 600; font-size: 0.88em;
            }
            .modal-signature { text-align: right; margin-bottom: 18px; }
            .signature-line { width: 150px; border-top: 1.5px solid #0f172a; margin-left: auto; margin-bottom: 5px; }
            .principal { font-weight: 700; font-size: 0.85em; color: #0f172a; }
            .modal-contact-footer-grid {
              display: flex; justify-content: center; gap: 20px;
              font-size: 0.78em; color: #64748b;
              border-top: 1px solid #e2e8f0; padding-top: 14px; flex-wrap: wrap;
            }
            .modal-contact-footer-grid span { display: flex; align-items: center; gap: 5px; }
            .print-hide { display: none !important; }
            @media print {
              body { padding: 20px; }
            }
            ${scheduleCss}
          </style>
        </head>
        <body>
          ${printContent}
          <script>
            window.onload = function() {
              ${fitScript}
              setTimeout(function () {
                window.print();
                window.onafterprint = function() { window.close(); };
              }, 300);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const renderModalContent = (notice) => {
    if (!notice) return null;
    const { type, data } = notice;

    return (
      <div ref={printRef}>
        <div className="modal-header">
          <div className="modal-logo">
            <img src="/logo.png" onError={(e) => { e.target.style.display = "none"; }} alt="logo" />
          </div>
          <h1 className="modal-college-name">{COLLEGE_NAME}</h1>
          <p className="modal-college-address">{COLLEGE_ADDRESS}</p>
        </div>

        <div className="modal-divider"></div>

        {type === "event" && (
          <div className="modal-content">
            {data.image && !modalImgError && (
              <div className="modal-image">
                <img
                  src={`${API}/uploads/${data.image}`}
                  alt="Notice Attachment"
                  onError={() => setModalImgError(true)}
                />
              </div>
            )}
            {data.image && modalImgError && (
              <div className="inner-empty-notice">
                <FiAlertCircle /> Attached image could not be loaded.
              </div>
            )}
            {data.description && (
              <p className="modal-desc">{data.description}</p>
            )}
          </div>
        )}

        {type === "exam" && (
          <div className="modal-content">
            <div className="modal-dept-info-chips">
              <h2>Exam Schedule</h2>
            </div>
            <p className="notice-text">
              This is to inform all students of the{" "}
              <span className="chip-val">{data.department_code}</span>{" "}
              Department that the examination schedule for{" "}
              <span className="chip-val">{periodLabel(data.semester_year)}</span>{" "}
              has been officially published. Students are requested to review the
              schedule carefully and appear for the examinations on the specified
              dates and times.
            </p>
            {data.image && !modalImgError && (
              <div className="modal-image">
                <img
                  src={`${API}/uploads/${data.image}`}
                  alt="Exam Schedule"
                  onError={() => setModalImgError(true)}
                />
              </div>
            )}
            {data.image && modalImgError && (
              <div className="inner-empty-notice">
                <FiAlertCircle /> Attached image could not be loaded.
              </div>
            )}
            {data.subjects?.length > 0 ? (
              <div className="modal-table-wrap">
                <table className="modal-table">
                  <thead>
                    <tr>
                      <th className="col-sn">SN</th>
                      <th className="col-subject">Subject Name</th>
                      <th className="col-date">Exam Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.subjects.map((s, idx) => (
                      <tr key={s.id || idx}>
                        <td className="col-sn-data">{String(idx + 1).padStart(2, "0")}</td>
                        <td className="subject-cell-highlight">{s.subject_name}</td>
                        <td className="date-cell-highlight">
                          <span>{s.exam_date ? formatDate(s.exam_date) : "—"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="inner-empty-notice">
                <FiAlertCircle /> No schedule dates have been specified yet.
              </div>
            )}
          </div>
        )}

        {type === "schedule" && (
          <div className="modal-content">
            <div className="modal-dept-info-chips">
              <h2>{data.mode === "teacher" ? "Teaching Time Schedule" : "Class Time Schedule"}</h2>
            </div>

            {data.mode === "teacher" ? (
              <p className="notice-text">
                This is the weekly teaching schedule of{" "}
                <span className="chip-val">{data.teacher}</span>. Teachers are requested to be
                present in the assigned class and room at the scheduled time.
              </p>
            ) : (
              <p className="notice-text">
                This is to inform all students of the{" "}
                <span className="chip-val">{data.department_code}</span> Department,{" "}
                <span className="chip-val">{periodLabel(data.semester_year)}</span>, that the
                class time schedule has been officially published. Students are requested to
                follow the schedule strictly and attend classes at the specified times.
              </p>
            )}

            <TodayStrip entries={data.entries} />
            <ScheduleGrid entries={data.entries} showClass={data.mode === "teacher"} />
          </div>
        )}

        {type === "result" && (
          <div className="modal-content">
            <div className="modal-dept-info-chips">
              <h2>Result Published</h2>
            </div>
            <p className="notice-text">
              This is to inform{" "}
              <span className="chip-val">{data.studentName || "the student"}</span>
              {data.roll ? ` (Roll: ${data.roll})` : ""} that the result for{" "}
              <span className="chip-val">{data.department_code}</span> Department,{" "}
              <span className="chip-val">{periodLabel(data.semester_year)}</span>
              {data.exam_term ? (
                <>
                  {" "}(<span className="chip-val">{data.exam_term}</span>)
                </>
              ) : null}{" "}
              has been officially verified and published.
            </p>

            <div className="result-info-grid">
              <div className="result-info-chip">
                <span className="result-info-label">Department</span>
                <span className="result-info-value">{data.department_code || "—"}</span>
              </div>
              <div className="result-info-chip">
                <span className="result-info-label">{isGradeValue(data.semester_year) ? "Grade" : "Semester"}</span>
                <span className="result-info-value">{data.semester_year || "—"}</span>
              </div>
              {data.exam_term && (
                <div className="result-info-chip">
                  <span className="result-info-label">Exam Term</span>
                  <span className="result-info-value">{data.exam_term}</span>
                </div>
              )}
              {data.roll && (
                <div className="result-info-chip">
                  <span className="result-info-label">Roll No.</span>
                  <span className="result-info-value">{data.roll}</span>
                </div>
              )}
            </div>

            <div className="result-status-row">
              <FiShield /> Verified &amp; officially published
            </div>
          </div>
        )}

        <div className="modal-divider mini-divider"></div>

        <div className="modal-signature">
          <div className="signature-line"></div>
          <p className="principal">Principal</p>
        </div>

        <div className="modal-contact-footer-grid">
          <span><FiGlobe /> www.test.com</span>
          <span><FiMail /> info@test.com</span>
          <span><FiPhone /> +977-98000000000</span>
        </div>
      </div>
    );
  };

  return (
    <div className="notice-display-container">
      <div className="notice-view-header">
        <h2>Notice View</h2>
      </div>

      {loading && (
        <div className="loader-container">
          <div className="loading-spinner"></div>
          <p>Fetching official updates...</p>
        </div>
      )}

      {!loading && (
        <div className="notice-section">
          <div className="section-title-wrap">
            <span className="title-decorator"></span>
            <h3>Holiday &amp; Event</h3>
            {eventList.length > 0 && <span className="section-count">{eventList.length}</span>}
          </div>

          {eventList.length === 0 ? (
            <div className="empty-state-card">
              <FiCheckCircle className="empty-icon" />
              <p>No new event or holiday notifications posted.</p>
            </div>
          ) : (
            <>
              <div className="notice-grid">
                {visibleEvents.map((n) => (
                  <div
                    className="notice-tile"
                    key={`event-${n.id}`}
                    onClick={() => setSelectedNotice({ type: "event", data: n })}
                  >
                    <div className="tile-top">
                      <TileImage
                        src={n.image ? `${API}/uploads/${n.image}` : null}
                        alt=""
                        fallbackClassName={`tile-icon-frame ${n.notice_type === "Holiday" ? "icon-holiday" : "icon-event"}`}
                        fallbackIcon={n.notice_type === "Holiday" ? <MdOutlineHolidayVillage /> : <FiBell />}
                      />
                    </div>
                    <span className={`tile-badge ${n.notice_type === "Holiday" ? "badge-holiday" : "badge-event"}`}>
                      {n.notice_type}
                    </span>
                    <div className="tile-title">
                      <span className="tile-title-text">{n.title}</span>
                    </div>
                    <div className="tile-date-wrap">
                      <FiClock />
                      <span className="tile-date">{formatDate(n.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {isMobile && eventList.length > 2 && (
                <div className="show-more-wrap">
                  <button
                    className="show-more-btn"
                    onClick={() => setShowAllEvents((prev) => !prev)}
                  >
                    {showAllEvents ? (
                      <>
                        <span>Show Less</span>
                        <FiChevronUp />
                      </>
                    ) : (
                      <>
                        <span>Show More ({eventList.length - 2} more)</span>
                        <FiChevronDown />
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {!loading && (
        <div className="notice-section">
          <div className="section-title-wrap">
            <span className="title-decorator exam-decorator"></span>
            <h3>Exam Schedules</h3>
            {relevantExams.length > 0 && <span className="section-count">{relevantExams.length}</span>}
          </div>

          {!user ? (
            <div className="empty-state-card warning-state">
              <FiAlertCircle className="empty-icon" />
              <p>Please secure student or staff access to see private exam schedules.</p>
            </div>
          ) : relevantExams.length === 0 ? (
            <div className="empty-state-card clean-state">
              <FiBookOpen className="empty-icon" />
              <p>No active exam schedules found</p>
            </div>
          ) : (
            <>
              <div className="notice-grid">
                {visibleExams.map((n) => (
                  <div
                    className="notice-tile exam-tile"
                    key={`exam-${n.id}`}
                    onClick={() => setSelectedNotice({ type: "exam", data: n })}
                  >
                    <div className="tile-top">
                      <TileImage
                        src={n.image ? `${API}/uploads/${n.image}` : null}
                        alt=""
                        fallbackClassName="tile-icon-frame icon-exam"
                        fallbackIcon={<HiOutlineAcademicCap />}
                      />
                    </div>
                    <span className="tile-badge badge-exam">{n.exam_type || "Exam"}</span>
                    <div className="tile-title">
                      <span className="tile-title-text fw-bold">
                        {n.department_code} • {periodLabel(n.semester_year, true)}
                      </span>
                    </div>
                    <div className="tile-date-wrap">
                      <FiClock />
                      <span className="tile-date">{formatDate(n.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {isMobile && relevantExams.length > 2 && (
                <div className="show-more-wrap">
                  <button
                    className="show-more-btn"
                    onClick={() => setShowAllExams((prev) => !prev)}
                  >
                    {showAllExams ? (
                      <>
                        <span>Show Less</span>
                        <FiChevronUp />
                      </>
                    ) : (
                      <>
                        <span>Show More ({relevantExams.length - 2} more)</span>
                        <FiChevronDown />
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {!loading && (
        <div className="notice-section">
          <div className="section-title-wrap">
            <span className="title-decorator schedule-decorator"></span>
            <h3>Time Schedule</h3>
            {relevantSchedules.length > 0 && <span className="section-count">{relevantSchedules.length}</span>}
          </div>

          {!user ? (
            <div className="empty-state-card warning-state">
              <FiAlertCircle className="empty-icon" />
              <p>Please log in to see your class time schedule.</p>
            </div>
          ) : !isStudent && !isTeacher ? (
            <div className="empty-state-card clean-state">
              <FiCalendar className="empty-icon" />
              <p>Time schedules are shown to students and teachers only.</p>
            </div>
          ) : relevantSchedules.length === 0 ? (
            <div className="empty-state-card clean-state">
              <FiCalendar className="empty-icon" />
              <p>
                {isTeacher
                  ? "No classes have been assigned to you in the time schedule yet."
                  : "No time schedule has been published for your class yet."}
              </p>
            </div>
          ) : (
            <>
              <div className="notice-grid">
                {visibleSchedules.map((item) => (
                  <div
                    className="notice-tile schedule-tile"
                    key={item.key}
                    onClick={() => openSchedule(item)}
                  >
                    <div className="tile-top">
                      <div className="tile-icon-frame icon-schedule">
                        <FiCalendar />
                      </div>
                    </div>
                    <span className="tile-badge badge-schedule">
                      {item.kind === "teacher" ? "My Schedule" : "Time Schedule"}
                    </span>
                    <div className="tile-title">
                      <span className="tile-title-text fw-bold">
                        {item.kind === "teacher"
                          ? "Weekly Teaching Schedule"
                          : `${item.row.department_code} • ${periodLabel(item.row.semester_year, true)}`}
                      </span>
                    </div>
                    <div className="tile-date-wrap">
                      <FiClock />
                      <span className="tile-date">
                        {item.kind === "teacher" ? "All your classes" : formatDate(item.row.published_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {isMobile && relevantSchedules.length > 2 && (
                <div className="show-more-wrap">
                  <button
                    className="show-more-btn"
                    onClick={() => setShowAllSchedules((prev) => !prev)}
                  >
                    {showAllSchedules ? (
                      <>
                        <span>Show Less</span>
                        <FiChevronUp />
                      </>
                    ) : (
                      <>
                        <span>Show More ({relevantSchedules.length - 2} more)</span>
                        <FiChevronDown />
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Result Published — visible to STUDENTS ONLY.
          Teachers, admins and guests do not see this section at all. */}
      {!loading && isStudent && (
        <div className="notice-section">
          <div className="section-title-wrap">
            <span className="title-decorator result-decorator"></span>
            <h3>Result Published</h3>
            {relevantResultNotices.length > 0 && <span className="section-count">{relevantResultNotices.length}</span>}
          </div>

          {relevantResultNotices.length === 0 ? (
            <div className="empty-state-card clean-state">
              <FiFileText className="empty-icon" />
              <p>No results published yet.</p>
            </div>
          ) : (
            <>
              <div className="notice-grid">
                {visibleResultNotices.map((n) => (
                  <div
                    className="notice-tile result-tile"
                    key={`result-${n.id}`}
                    onClick={() => setSelectedNotice({ type: "result", data: n })}
                  >
                    <div className="tile-top">
                      <div className="tile-icon-frame icon-result">
                        <FiFileText />
                      </div>
                    </div>
                    <span className="tile-badge badge-result">Result</span>
                    <div className="tile-title">
                      <span className="tile-title-text fw-bold">
                        {n.department_code} • {periodLabel(n.semester_year, true)}
                        {n.exam_term ? ` • ${n.exam_term}` : ""}
                      </span>
                    </div>
                    <div className="tile-date-wrap">
                      <FiClock />
                      <span className="tile-date">{formatDate(n.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {isMobile && relevantResultNotices.length > 2 && (
                <div className="show-more-wrap">
                  <button
                    className="show-more-btn"
                    onClick={() => setShowAllResults((prev) => !prev)}
                  >
                    {showAllResults ? (
                      <>
                        <span>Show Less</span>
                        <FiChevronUp />
                      </>
                    ) : (
                      <>
                        <span>Show More ({relevantResultNotices.length - 2} more)</span>
                        <FiChevronDown />
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {selectedNotice &&
        createPortal(
          <div className="notice-modal-overlay" onClick={() => setSelectedNotice(null)}>
            <div
              className={`notice-modal${selectedNotice.type === "schedule" ? " notice-modal-wide" : ""}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-action-bar">
                {selectedNotice.type !== "result" && (
                  <button
                    className="modal-btn-print"
                    onClick={handlePrint}
                    title="Print this notice"
                    aria-label="Print notice"
                  >
                    <FiPrinter />
                    <span>Print</span>
                  </button>
                )}
                <button
                  className="modal-close"
                  onClick={() => setSelectedNotice(null)}
                  aria-label="Close modal"
                >
                  <FiX />
                </button>
              </div>

              {renderModalContent(selectedNotice)}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export default NoticeDisplay;