import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import "./notice.css";
import "./schedule.css";

const API = `http://${window.location.hostname}:5000`;

const COLLEGE_NAME = "College System";
const COLLEGE_ADDRESS = "College Address, City, State";

const ALL_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DEFAULT_DAYS = ALL_DAYS.slice(0, 6); // Sunday - Friday

const normalizeCode = (code) => (code || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
const getPlusTwoGrade = (departmentCode) => {
  const norm = normalizeCode(departmentCode);
  if (!norm) return null;
  if (norm.includes("11")) return 11;
  if (norm.includes("12")) return 12;
  return null;
};

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
const uid = () => Math.random().toString(36).slice(2, 9);
const newPeriod = () => ({ id: uid(), start: "", end: "", type: "Class", label: "Break" });
const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// One row of the "Subjects setup" table (one subject of the selected semester/year).
// Teacher + room entered here are automatically used for every period of that subject.
// auto = true when the teacher name was filled automatically from a valid Teacher ID.
const newPlanRow = (s) => ({
  id: s.id ?? uid(),
  subject_name: s.subject_name,
  ppw: 3, // periods per week (used by the auto-generator; 0 = skip this subject)
  teacherId: "",
  teacher: "",
  room: "",
  auto: false,
  idError: "",
});

const QUALITY_OPTIONS = [
  { value: "fast", label: "Fast (~4s)" },
  { value: "normal", label: "Normal (~10s)" },
  { value: "high", label: "High quality (~20s)" },
];

/* Unique time slots (rows) + days present (columns) from a flat list of entries */
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

/* ------------------------------ PRINT ------------------------------ */
const printTimetable = (title, subtitle, entries, showClass) => {
  const { slots, days } = buildGrid(entries);
  const head = days.map((d) => `<th>${d}</th>`).join("");
  const rows = slots
    .map((s) => {
      const time = `${fmtTime(s.start)} - ${fmtTime(s.end)}`;
      if (s.isBreak)
        return `<tr><td class="time">${time}</td><td colspan="${days.length}" class="brk">${esc(s.label)}</td></tr>`;
      const tds = days
        .map((d) => {
          const e = findEntry(entries, d, s);
          if (!e) return "<td></td>";
          const extra = showClass
            ? `<div>${esc(e.department_code)} · ${esc(e.semester_year)}</div>`
            : e.teacher_name
            ? `<div>${esc(e.teacher_name)}</div>`
            : "";
          return `<td><b>${esc(e.subject_name)}</b>${extra}${e.room ? `<div>Room ${esc(e.room)}</div>` : ""}</td>`;
        })
        .join("");
      return `<tr><td class="time">${time}</td>${tds}</tr>`;
    })
    .join("");

  const win = window.open("", "_blank");
  if (!win) {
    alert("Please allow pop-ups to print the schedule.");
    return;
  }

  win.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  /* A4 landscape, 10mm margins => usable area 277mm x 190mm (~1047px x 718px) */
  @page { size: A4 landscape; margin: 10mm; }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{font-family:Arial,sans-serif;color:#222;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  #sheet{width:1047px;margin:0 auto}
  .header{text-align:center;border-bottom:3px solid #000;padding:6px 0 8px}
  .logo{width:56px;height:56px;margin:0 auto}
  .logo img{width:100%;height:100%;object-fit:contain}
  .college-name{font-size:22px;font-weight:bold;margin-top:2px}
  .college-address{font-size:12px;color:#555}
  .content{padding:12px 0 0}
  h2{text-align:center;text-decoration:underline;margin:0 0 4px;font-size:18px}
  .sub{text-align:center;font-weight:bold;margin-bottom:10px;font-size:14px}
  table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:12px}
  th{background:#f0f0f0;border:1px solid #555;padding:6px 4px}
  td{border:1px solid #777;padding:6px 4px;text-align:center;vertical-align:middle;
     word-wrap:break-word;overflow-wrap:anywhere}
  th:first-child,td.time{width:115px}
  td.time{font-weight:bold;white-space:nowrap;background:#fafafa}
  td.brk{background:#eee;font-weight:bold;letter-spacing:2px;text-transform:uppercase}
  td div{font-size:10.5px;color:#555}
  tr{page-break-inside:avoid}
  .footer{margin-top:24px;border-top:2px solid #000;padding-top:10px}
  .signature{text-align:right}
  .signature-line{width:180px;border-top:1px solid #000;margin-left:auto;margin-bottom:4px}
</style></head><body>
<div id="sheet">
  <div class="header">
    <div class="logo"><img src="/logo.png" alt="" onerror="this.parentNode.style.display='none'"></div>
    <div class="college-name">${esc(COLLEGE_NAME)}</div>
    <div class="college-address">${esc(COLLEGE_ADDRESS)}</div>
  </div>
  <div class="content">
    <h2>${esc(title)}</h2>
    <div class="sub">${esc(subtitle)}</div>
    <table><thead><tr><th>Time</th>${head}</tr></thead><tbody>${rows}</tbody></table>
  </div>
  <div class="footer"><div class="signature"><div class="signature-line"></div><b>Principal</b></div></div>
</div>
<script>
  function fitToPage() {
    var sheet = document.getElementById("sheet");
    var maxH = 715; // usable page height in px (a little under 718 for safety)
    sheet.style.zoom = 1;
    var h = sheet.scrollHeight;
    if (h > maxH) sheet.style.zoom = (maxH / h).toFixed(3);
  }
  window.onload = function () {
    fitToPage();
    setTimeout(function () { window.focus(); window.print(); }, 300);
  };
</script>
</body></html>`);
  win.document.close();
};

/* --------------------------- SHARED WIDGETS --------------------------- */
function ClassPicker({ departments, department, semesterYear, onChange }) {
  const dept = departments.find((d) => d.department_code === department);
  const type = dept?.course_type || "";
  const grade = type === "year" ? getPlusTwoGrade(department) : null;
  const options = !type
    ? []
    : type === "semester"
    ? Array.from({ length: 8 }, (_, i) => i + 1)
    : grade
    ? [grade]
    : Array.from({ length: 4 }, (_, i) => i + 1);
  const label = type === "semester" ? "Semester" : grade ? "Grade" : "Year";

  return (
    <>
      <select
        value={department}
        onChange={(e) => {
          const code = e.target.value;
          const d = departments.find((x) => x.department_code === code);
          const g = d?.course_type === "year" ? getPlusTwoGrade(code) : null;
          onChange(code, g ? String(g) : "");
        }}
      >
        <option value="">Select Department</option>
        {departments.map((d) => (
          <option key={d.department_code} value={d.department_code}>
            {d.department_name} ({d.department_code})
          </option>
        ))}
      </select>

      <select value={semesterYear} onChange={(e) => onChange(department, e.target.value)} disabled={!department}>
        <option value="">{department ? `Select ${label}` : "Select Department First"}</option>
        {options.map((n) => (
          <option key={n} value={n}>{`${label} ${n}`}</option>
        ))}
      </select>
    </>
  );
}

/* Today / Ongoing / Next panel – this is what students & teachers follow */
function FollowPanel({ entries }) {
  if (!entries.length) return null;
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
    <div className="follow-panel">
      <h4>Today · {today}</h4>
      {todays.length === 0 ? (
        <p>No classes scheduled today.</p>
      ) : (
        <>
          <p><span className="pill pill-now">Now</span> {current ? line(current) : "No class in progress"}</p>
          <p><span className="pill pill-next">Next</span> {next ? line(next) : "No more classes today"}</p>
        </>
      )}
    </div>
  );
}

/* Public grid: shows teacher NAME only (never the teacher ID) */
function TimetableGrid({ entries, showClass }) {
  const { slots, days } = useMemo(() => buildGrid(entries), [entries]);
  const today = ALL_DAYS[new Date().getDay()];
  if (!entries.length) return <p className="table-empty">No time schedule published yet.</p>;

  return (
    <div className="table-scroll">
      <table className="notice-table timetable">
        <thead>
          <tr>
            <th>Time</th>
            {days.map((d) => (
              <th key={d} className={d === today ? "tt-today-head" : ""}>{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slots.map((s) => (
            <tr key={`${s.start}-${s.end}`}>
              <td className="tt-time">{fmtTime(s.start)} - {fmtTime(s.end)}</td>
              {s.isBreak ? (
                <td colSpan={days.length} className="tt-break">{s.label}</td>
              ) : (
                days.map((d) => {
                  const e = findEntry(entries, d, s);
                  return (
                    <td key={d} className={d === today ? "tt-today" : ""}>
                      {e ? (
                        <div className="tt-cell">
                          <strong>{e.subject_name}</strong>
                          {showClass ? (
                            <span>{e.department_code} · {e.semester_year}</span>
                          ) : (
                            e.teacher_name && <span>{e.teacher_name}</span>
                          )}
                          {e.room && <span>Room {e.room}</span>}
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
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

/* ------------------------------ VIEWER ------------------------------ */
/* role "student": by class (can be locked with props)
   role "teacher": by teacher name
   role "admin"  : either */
function ScheduleViewer({ role, departments, teachers, fixedDept, fixedSem, fixedTeacher }) {
  const [mode, setMode] = useState(role === "teacher" ? "teacher" : "class");
  const [department, setDepartment] = useState(fixedDept || "");
  const [semesterYear, setSemesterYear] = useState(fixedSem ? String(fixedSem) : "");
  const [teacher, setTeacher] = useState(fixedTeacher || "");
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    let params = null;
    if (mode === "class" && department && semesterYear) params = { department_code: department, semester_year: semesterYear };
    if (mode === "teacher" && teacher) params = { teacher };
    if (!params) { setEntries([]); return; }
    axios.get(`${API}/schedule`, { params }).then((res) => setEntries(res.data)).catch(() => setEntries([]));
  }, [mode, department, semesterYear, teacher]);

  const lockedClass = role === "student" && fixedDept && fixedSem;
  const lockedTeacher = role === "teacher" && fixedTeacher;

  return (
    <div className="form-box">
      <h3>{mode === "teacher" ? "Teacher Time Schedule" : "Class Time Schedule"}</h3>

      {role === "admin" && (
        <div className="notice-buttons">
          <button className={mode === "class" ? "active" : ""} onClick={() => setMode("class")}>By Class</button>
          <button className={mode === "teacher" ? "active" : ""} onClick={() => setMode("teacher")}>By Teacher</button>
        </div>
      )}

      {mode === "class" && !lockedClass && (
        <ClassPicker
          departments={departments}
          department={department}
          semesterYear={semesterYear}
          onChange={(d, s) => { setDepartment(d); setSemesterYear(s); }}
        />
      )}

      {mode === "teacher" && !lockedTeacher && (
        <select value={teacher} onChange={(e) => setTeacher(e.target.value)}>
          <option value="">Select Teacher</option>
          {teachers.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      )}

      {role !== "admin" && <FollowPanel entries={entries} />}

      <TimetableGrid entries={entries} showClass={mode === "teacher"} />

      {entries.length > 0 && (
        <div className="form-actions">
          <button
            onClick={() =>
              printTimetable(
                mode === "teacher" ? "TEACHER TIME SCHEDULE" : "CLASS TIME SCHEDULE",
                mode === "teacher" ? teacher : `Department: ${department} | Semester/Year: ${semesterYear}`,
                entries,
                mode === "teacher"
              )
            }
          >
            Print Schedule
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ BUILDER (ADMIN) ------------------------------ */
function ScheduleBuilder({ departments, teachers, initial, onSaved }) {
  const [department, setDepartment] = useState(initial?.department || "");
  const [semesterYear, setSemesterYear] = useState(initial?.semesterYear || "");
  const [days, setDays] = useState(DEFAULT_DAYS);
  const [periods, setPeriods] = useState([newPeriod()]);
  const [cells, setCells] = useState({}); // key: `${day}|${periodId}` -> subject name (string)
  const [subjects, setSubjects] = useState([]);
  const [existing, setExisting] = useState(false);
  const [existingInfo, setExistingInfo] = useState({}); // subject -> {count, teacherId, teacher, room, auto}
  const [saving, setSaving] = useState(false);

  // "Subjects setup": teacher + room (+ periods/week) per subject
  const [plan, setPlan] = useState([]);
  const [quality, setQuality] = useState("normal");
  const [generating, setGenerating] = useState(false);
  const [genInfo, setGenInfo] = useState(null);

  const deptType = departments.find((d) => d.department_code === department)?.course_type || "";

  // subjects of the selected semester / year
  useEffect(() => {
    if (!department || !semesterYear || !deptType) { setSubjects([]); return; }
    const params = { department_code: department };
    if (deptType === "semester") params.semester = semesterYear;
    else params.year = semesterYear;
    axios.get(`${API}/notice/subjects`, { params }).then((r) => setSubjects(r.data)).catch(() => setSubjects([]));
  }, [department, semesterYear, deptType]);

  // load existing schedule (edit mode) - include_id=1 so the admin sees saved Teacher IDs
  useEffect(() => {
    if (!department || !semesterYear) return;
    axios
      .get(`${API}/schedule`, { params: { department_code: department, semester_year: semesterYear, include_id: 1 } })
      .then((res) => {
        const rows = res.data;
        if (!rows.length) {
          setExisting(false);
          setPeriods([newPeriod()]);
          setCells({});
          setExistingInfo({});
          setDays(DEFAULT_DAYS);
          return;
        }
        setExisting(true);
        const map = new Map();
        rows.forEach((r) => {
          const k = `${r.start_time}-${r.end_time}`;
          if (!map.has(k))
            map.set(k, {
              id: uid(), start: r.start_time, end: r.end_time,
              type: r.entry_type, label: r.entry_type === "Break" ? r.subject_name : "Break",
            });
        });
        const ps = [...map.values()].sort((a, b) => toMin(a.start) - toMin(b.start));
        const c = {};
        const info = {};
        rows.filter((r) => r.entry_type === "Class").forEach((r) => {
          const p = ps.find((x) => x.start === r.start_time && x.end === r.end_time);
          if (p) c[`${r.day_of_week}|${p.id}`] = r.subject_name;
          // teacher / room of a subject are taken from its saved rows
          if (!info[r.subject_name])
            info[r.subject_name] = {
              count: 0,
              teacherId: r.teacher_id || "",
              teacher: r.teacher_name || "",
              room: r.room || "",
              auto: !!r.teacher_id,
            };
          info[r.subject_name].count += 1;
        });
        setPeriods(ps);
        setCells(c);
        setExistingInfo(info);
        setDays(ALL_DAYS.filter((d) => rows.some((r) => r.day_of_week === d)));
      })
      .catch(console.error);
  }, [department, semesterYear]);

  // build the Subjects setup table (merge in saved teacher / room when editing)
  useEffect(() => {
    setPlan(
      subjects.map((s) => {
        const base = newPlanRow(s);
        const info = existingInfo[s.subject_name];
        return info
          ? { ...base, ppw: info.count, teacherId: info.teacherId, teacher: info.teacher, room: info.room, auto: info.auto }
          : base;
      })
    );
    setGenInfo(null);
  }, [subjects, existingInfo]);

  // subject name -> {teacherId, teacher, room, auto}
  const planMap = useMemo(() => {
    const m = {};
    plan.forEach((r) => { m[r.subject_name] = r; });
    return m;
  }, [plan]);

  const updatePeriod = (id, field, value) =>
    setPeriods(periods.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  const removePeriod = (id) => setPeriods(periods.filter((p) => p.id !== id));

  const setCell = (day, pid, subject) =>
    setCells((prev) => ({ ...prev, [`${day}|${pid}`]: subject }));

  /* ---------- Subjects setup rows ---------- */
  const patchPlan = (id, patch) =>
    setPlan((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  // typing in the Teacher ID box: if the name was auto-filled, unlock & clear it until the new ID is checked
  const changePlanTeacherId = (row, value) =>
    patchPlan(row.id, {
      teacherId: value,
      idError: "",
      ...(row.auto ? { teacher: "", auto: false } : {}),
    });

  // leaving the Teacher ID box: look the teacher up and fill the name
  const lookupPlanTeacher = async (row, rawId) => {
    const id = (rawId || "").trim();
    if (!id) {
      patchPlan(row.id, { teacherId: "", idError: "", auto: false });
      return;
    }
    try {
      const r = await axios.get(`${API}/schedule/teacher-lookup`, { params: { teacher_id: id } });
      patchPlan(row.id, { teacherId: id, teacher: r.data.name, auto: true, idError: "" });
    } catch {
      patchPlan(row.id, { teacherId: id, auto: false, idError: "Teacher ID not found" });
    }
  };

  const classPeriods = periods.filter((p) => p.type === "Class");
  const totalLessons = plan.reduce((sum, r) => sum + Math.max(0, parseInt(r.ppw, 10) || 0), 0);
  const totalSlots = classPeriods.length * days.length;

  const checkPeriods = () => {
    if (days.length === 0) return "Select at least one day";
    if (periods.some((p) => !p.start || !p.end)) return "Fill start and end time for every period";
    if (periods.some((p) => toMin(p.start) >= toMin(p.end))) return "End time must be after start time";
    const sorted = [...periods].sort((a, b) => toMin(a.start) - toMin(b.start));
    for (let i = 1; i < sorted.length; i++)
      if (toMin(sorted[i].start) < toMin(sorted[i - 1].end)) return "Periods must not overlap";
    return null;
  };

  /* ---------- GENETIC ALGORITHM: ask the backend to build a timetable ---------- */
  const generate = async () => {
    const err = checkPeriods();
    if (err) return alert(err);
    if (classPeriods.length === 0) return alert("Add at least one Class period");

    const chosen = plan.filter((r) => (parseInt(r.ppw, 10) || 0) > 0);
    if (chosen.length === 0) return alert("Set 'Periods / week' for at least one subject");
    if (chosen.some((r) => r.teacherId && !r.auto))
      return alert("A Teacher ID is not verified. Correct it, or clear it and type the teacher name.");
    if (totalLessons > totalSlots)
      return alert(`Too many lessons (${totalLessons}) for the available slots (${totalSlots}). Reduce periods/week or add periods/days.`);

    if (
      Object.values(cells).some(Boolean) &&
      !window.confirm("This will replace the subjects currently placed in the grid. Continue?")
    )
      return;

    setGenerating(true);
    setGenInfo(null);
    try {
      const res = await axios.post(`${API}/schedule/generate`, {
        department_code: department,
        semester_year: semesterYear,
        days,
        quality,
        periods: classPeriods.map((p) => ({ id: p.id, start: p.start, end: p.end })),
        subjects: chosen.map((r) => ({
          subject_name: r.subject_name,
          periods_per_week: parseInt(r.ppw, 10),
          teacher_id: r.teacherId.trim(),
          teacher_name: r.teacher,
          room: r.room,
        })),
      });

      const d = res.data;
      const next = {};
      // only the subject goes in the cell; teacher / room are fetched from Subjects setup
      d.assignments.forEach((a) => { next[`${a.day}|${a.period_id}`] = a.subject_name; });
      setCells(next);
      setGenInfo(d);
    } catch (e) {
      alert(e.response?.data?.message || "Could not generate the schedule");
    } finally {
      setGenerating(false);
    }
  };

  const toggleDay = (d) =>
    setDays(days.includes(d) ? days.filter((x) => x !== d) : ALL_DAYS.filter((x) => x === d || days.includes(x)));

  const copyFirstDay = () => {
    if (days.length < 2) return;
    const first = days[0];
    const next = { ...cells };
    days.slice(1).forEach((d) =>
      periods.forEach((p) => {
        const src = cells[`${first}|${p.id}`];
        if (src) next[`${d}|${p.id}`] = src;
      })
    );
    setCells(next);
  };

  const save = async () => {
    if (!department || !semesterYear) return alert("Department & Semester/Year required");
    const err = checkPeriods();
    if (err) return alert(err);

    const sorted = [...periods].sort((a, b) => toMin(a.start) - toMin(b.start));
    const entries = [];
    let badSubject = null;
    sorted.forEach((p) =>
      days.forEach((d) => {
        if (p.type === "Break") {
          entries.push({ day_of_week: d, start_time: p.start, end_time: p.end, entry_type: "Break", subject_name: p.label || "Break" });
        } else {
          const subject = cells[`${d}|${p.id}`];
          if (subject) {
            // teacher + room come from the Subjects setup table
            const info = planMap[subject] || {};
            if (info.teacherId && !info.auto && !badSubject) badSubject = `${subject} (${info.teacherId})`;
            entries.push({
              day_of_week: d, start_time: p.start, end_time: p.end, entry_type: "Class",
              subject_name: subject,
              teacher_id: info.teacherId ? info.teacherId.trim() : "",
              teacher_name: info.teacher || "",
              room: info.room || "",
            });
          }
        }
      })
    );
    if (badSubject)
      return alert(`Teacher ID not found / not verified for: ${badSubject}\nCorrect the ID or clear it and type the teacher name in Subjects setup.`);
    if (!entries.some((e) => e.entry_type === "Class")) return alert("Assign at least one subject");

    setSaving(true);
    try {
      const res = await axios.post(`${API}/schedule`, { department_code: department, semester_year: semesterYear, entries });
      onSaved(existing ? "Time schedule updated successfully." : "Time schedule published successfully.");
    } catch (e) {
      const d = e.response?.data;
      if (d?.conflicts) alert(`${d.message}:\n\n- ${d.conflicts.join("\n- ")}`);
      else alert(d?.message || "Backend error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="form-box">
      <h3>{existing ? "Edit Time Schedule" : "Build Time Schedule"}</h3>

      <ClassPicker
        departments={departments}
        department={department}
        semesterYear={semesterYear}
        onChange={(d, s) => { setDepartment(d); setSemesterYear(s); }}
      />

      {existing && (
        <div className="edit-banner">
          A schedule already exists for {department} · {semesterYear}. Saving will replace it.
        </div>
      )}

      {department && semesterYear && (
        <>
          <h4>Working days</h4>
          <div className="day-toggles">
            {ALL_DAYS.map((d) => (
              <label key={d} className={days.includes(d) ? "day-chip on" : "day-chip"}>
                <input type="checkbox" checked={days.includes(d)} onChange={() => toggleDay(d)} />
                {d.slice(0, 3)}
              </label>
            ))}
          </div>

          <datalist id="teacher-list">
            {teachers.map((t) => <option key={t} value={t} />)}
          </datalist>

          {/* ---------------- SUBJECTS SETUP: teacher + room per subject ---------------- */}
          <h4>Subjects setup</h4>
          <p className="ga-help">
            Enter each subject's teacher and room once. Enter a Teacher ID to fill the name automatically, or leave
            the ID empty and type the name. Every period of that subject then gets this teacher and room
            automatically. "Periods / week" is used by the auto-generator (0 = skip the subject).
          </p>
          {subjects.length === 0 ? (
            <p style={{ color: "#888", fontSize: "0.9em" }}>No subjects found for this semester/year.</p>
          ) : (
            <div className="table-scroll">
              <table className="notice-table ga-table">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Teacher ID</th>
                    <th>Teacher name</th>
                    <th>Room</th>
                    <th>Periods / week</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.map((r) => (
                    <tr key={r.id}>
                      <td>{r.subject_name}</td>
                      <td>
                        <input
                          type="text"
                          placeholder="Teacher ID (optional)"
                          value={r.teacherId}
                          onChange={(e) => changePlanTeacherId(r, e.target.value)}
                          onBlur={(e) => lookupPlanTeacher(r, e.target.value)}
                        />
                        {r.idError && <span style={{ color: "#c0392b", fontSize: "0.75em" }}>{r.idError}</span>}
                      </td>
                      <td>
                        <input
                          type="text"
                          list="teacher-list"
                          placeholder={r.auto ? "Teacher" : "Name (if no ID)"}
                          value={r.teacher}
                          readOnly={r.auto}
                          style={r.auto ? { background: "#eef7ee", fontWeight: 600 } : undefined}
                          onChange={(e) => patchPlan(r.id, { teacher: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          placeholder="Room"
                          value={r.room}
                          onChange={(e) => patchPlan(r.id, { room: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          max="20"
                          value={r.ppw}
                          onChange={(e) => patchPlan(r.id, { ppw: e.target.value })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ---------------- PERIODS x DAYS GRID: subject only ---------------- */}
          <h4>Periods &amp; subjects</h4>
          <p className="ga-help">
            Pick a subject in each cell. Its teacher and room appear automatically from Subjects setup.
          </p>

          <div className="table-scroll">
            <table className="notice-table sched-builder">
              <thead>
                <tr>
                  <th>Period</th>
                  {days.map((d) => <th key={d}>{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.id}>
                    <td className="sched-period">
                      <select value={p.type} onChange={(e) => updatePeriod(p.id, "type", e.target.value)}>
                        <option value="Class">Class</option>
                        <option value="Break">Break</option>
                      </select>
                      <input type="time" value={p.start} onChange={(e) => updatePeriod(p.id, "start", e.target.value)} />
                      <input type="time" value={p.end} onChange={(e) => updatePeriod(p.id, "end", e.target.value)} />
                      {p.type === "Break" && (
                        <input type="text" placeholder="Label (Break / Lunch)" value={p.label}
                          onChange={(e) => updatePeriod(p.id, "label", e.target.value)} />
                      )}
                      {periods.length > 1 && (
                        <button type="button" className="btn-remove" onClick={() => removePeriod(p.id)}>✕ Remove</button>
                      )}
                    </td>

                    {p.type === "Break" ? (
                      <td colSpan={days.length} className="tt-break">{p.label || "Break"}</td>
                    ) : (
                      days.map((d) => {
                        const subject = cells[`${d}|${p.id}`] || "";
                        const info = subject ? planMap[subject] : null;
                        return (
                          <td key={d} className="sched-cell">
                            <select value={subject} onChange={(e) => setCell(d, p.id, e.target.value)}>
                              <option value="">— Free —</option>
                              {subjects.map((s) => (
                                <option key={s.id} value={s.subject_name}>{s.subject_name}</option>
                              ))}
                            </select>
                            {info && (info.teacher || info.room) && (
                              <div className="cell-info">
                                {info.teacher && <span>{info.teacher}</span>}
                                {info.room && <span>Room {info.room}</span>}
                              </div>
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

          <div className="builder-tools">
            <button type="button" className="btn-edit" onClick={() => setPeriods([...periods, newPeriod()])}>+ Add Period</button>
            <button type="button" className="btn-edit" onClick={copyFirstDay}>Copy first day to all days</button>
          </div>

          {/* ---------------- AUTO GENERATOR (GENETIC ALGORITHM) ---------------- */}
          {subjects.length > 0 && (
            <div className="ga-box">
              <h4>Auto-generate with Genetic Algorithm</h4>
              <p className="ga-help">
                Fills the grid above using the periods, days and Subjects setup. Clashes with other classes'
                timetables (same teacher or room at the same time) are avoided automatically. You can still edit
                any cell afterwards.
              </p>

              <div className="ga-controls">
                <span className={totalLessons > totalSlots ? "ga-count bad" : "ga-count"}>
                  Lessons: {totalLessons} / Slots: {totalSlots}
                </span>
                <select value={quality} onChange={(e) => setQuality(e.target.value)}>
                  {QUALITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <button type="button" className="btn-generate" onClick={generate} disabled={generating}>
                  {generating ? "Generating..." : "⚙ Generate Schedule"}
                </button>
              </div>

              {genInfo && (
                <div className={genInfo.hard_conflicts ? "ga-result warn" : "ga-result ok"}>
                  <strong>
                    {genInfo.hard_conflicts
                      ? `Generated with ${genInfo.hard_conflicts} unresolved clash(es)`
                      : "Generated with no teacher/room clashes"}
                  </strong>
                  <div>
                    {genInfo.lessons} lessons placed in {genInfo.slots} slots · {genInfo.generations_run} generations ·
                    quality penalty {genInfo.soft_penalty} (lower is better)
                  </div>
                  {genInfo.warnings?.length > 0 && (
                    <ul>
                      {genInfo.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  )}
                  <div className="ga-tip">Not happy? Click Generate again for a different arrangement, or edit cells above.</div>
                </div>
              )}
            </div>
          )}

          {saving && (
            <div className="status-bar loading">
              <span className="spinner" />
              {existing ? "Updating schedule..." : "Publishing schedule..."} Please wait.
            </div>
          )}

          <div className="form-actions">
            <button onClick={save} disabled={saving}>
              {saving ? (existing ? "Updating..." : "Publishing...") : existing ? "Update Schedule" : "Publish Schedule"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------ MAIN ------------------------------ */
/* Usage:
   <Schedule role="admin" />
   <Schedule role="student" department="BCA" semesterYear="3" />
   <Schedule role="teacher" teacherName="Ram Sharma" />
*/
function Schedule({ role = "admin", department = "", semesterYear = "", teacherName = "", embedded = false }) {
  const [tab, setTab] = useState(role === "admin" ? "build" : "view");
  const [departments, setDepartments] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [published, setPublished] = useState([]);
  const [edit, setEdit] = useState(null);
  const [editKey, setEditKey] = useState(0);
  const [flash, setFlash] = useState(null); // {type: "success" | "error", text}
  const [sendingKey, setSendingKey] = useState(null); // row currently being emailed

  // success / error message disappears by itself
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 7000);
    return () => clearTimeout(t);
  }, [flash]);

  const refresh = () => {
    axios.get(`${API}/schedule/teachers`).then((r) => setTeachers(r.data)).catch(console.error);
    axios.get(`${API}/schedule/classes`).then((r) => setPublished(r.data)).catch(console.error);
  };

  useEffect(() => {
    axios.get(`${API}/notice/departments`).then((r) => setDepartments(r.data)).catch(console.error);
    refresh();
  }, []);

  const handleEdit = (row) => {
    setEdit({ department: row.department_code, semesterYear: String(row.semester_year) });
    setEditKey((k) => k + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete time schedule of ${row.department_code} · ${row.semester_year}?`)) return;
    try {
      await axios.delete(`${API}/schedule`, {
        params: { department_code: row.department_code, semester_year: row.semester_year },
      });
      refresh();
      setEditKey((k) => k + 1);
      setFlash({ type: "success", text: `Time schedule of ${row.department_code} · ${row.semester_year} deleted successfully.` });
    } catch {
      setFlash({ type: "error", text: "Delete failed. Please try again." });
    }
  };

  const handlePrint = async (row) => {
    const res = await axios.get(`${API}/schedule`, {
      params: { department_code: row.department_code, semester_year: row.semester_year },
    });
    printTimetable("CLASS TIME SCHEDULE", `Department: ${row.department_code} | Semester/Year: ${row.semester_year}`, res.data, false);
  };

  // Email is sent ONLY from this button - never when a schedule is published / updated.
  const handleSendEmail = async (row) => {
    if (
      !window.confirm(
        `Send the time schedule of ${row.department_code} · ${row.semester_year} (PDF attached) by email to its students and assigned teachers?`
      )
    )
      return;
    setSendingKey(`${row.department_code}-${row.semester_year}`);
    try {
      const res = await axios.post(`${API}/schedule/send-email`, {
        department_code: row.department_code,
        semester_year: row.semester_year,
      });
      setFlash({ type: "success", text: res.data.message || "Email sent successfully." });
    } catch (e) {
      setFlash({ type: "error", text: e.response?.data?.message || "Could not send the email. Please try again." });
    } finally {
      setSendingKey(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <div className={embedded ? "schedule-embedded" : "notice-container"}>
      {!embedded && <h2>Time Schedule</h2>}

      {sendingKey && (
        <div className="status-bar loading" style={{ marginTop: 0, marginBottom: 16 }}>
          <span className="spinner" />
          Sending email with schedule PDF... Please wait.
        </div>
      )}

      {flash && (
        <div className={`flash ${flash.type}`} role="status">
          <span>{flash.type === "success" ? "✔ " : "✖ "}{flash.text}</span>
          <button type="button" className="flash-close" onClick={() => setFlash(null)} aria-label="Close">×</button>
        </div>
      )}

      {role === "admin" && (
        <div className="notice-buttons">
          <button className={tab === "build" ? "active" : ""} onClick={() => setTab("build")}>Build Schedule</button>
          <button className={tab === "view" ? "active" : ""} onClick={() => setTab("view")}>View Schedule</button>
        </div>
      )}

      {tab === "build" && role === "admin" && (
        <>
          <ScheduleBuilder
            key={editKey}
            departments={departments}
            teachers={teachers}
            initial={edit}
            onSaved={(msg) => {
              refresh();
              setEditKey((k) => k + 1);
              setEdit(null);
              setFlash({ type: "success", text: msg || "Time schedule saved successfully." });
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />

          <div className="form-box" style={{ marginTop: 20 }}>
            <div className="table-header-row"><h4>Published Schedules</h4></div>
            {published.length === 0 ? (
              <p className="table-empty">No time schedules yet.</p>
            ) : (
              <div className="table-scroll">
                <table className="notice-table published-table">
                  <thead>
                    <tr><th>Sn</th><th>Department</th><th>Sem / Year</th><th>Entries</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {published.map((r, i) => (
                      <tr key={`${r.department_code}-${r.semester_year}`}>
                        <td>{i + 1}</td>
                        <td>{r.department_code}</td>
                        <td>{r.semester_year}</td>
                        <td>{r.entries}</td>
                        <td>
                          <div className="action-btns">
                            <button className="btn-edit" onClick={() => handleEdit(r)}>Edit</button>
                            <button className="btn-delete" onClick={() => handleDelete(r)}>Delete</button>
                            <button className="btn-print" onClick={() => handlePrint(r)}>Print</button>
                            <button
                              className="btn-send"
                              disabled={sendingKey === `${r.department_code}-${r.semester_year}`}
                              onClick={() => handleSendEmail(r)}
                            >
                              {sendingKey === `${r.department_code}-${r.semester_year}` ? "Sending..." : "Send Email"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === "view" && (
        <ScheduleViewer
          role={role}
          departments={departments}
          teachers={teachers}
          fixedDept={department}
          fixedSem={semesterYear}
          fixedTeacher={teacherName}
        />
      )}
    </div>
  );
}

export default Schedule;