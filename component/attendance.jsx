import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import "./attandance.css";

const API = `http://${window.location.hostname}:5000`;

function normalizeCode(code) {
  return (code || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function getGrade(dept) {
  if (!dept || dept.course_type?.toLowerCase() !== "year") return null;

  const match = normalizeCode(dept.department_code).match(/(11|12)$/);

  return match ? Number(match[1]) : null;
}

function sortRecords(records, sortConfig) {
  if (!sortConfig.key) return records;
  const sorted = [...records].sort((a, b) => {
    const rawA = sortConfig.key === "name" ? (a.full_name || a.student_name) : a.roll;
    const rawB = sortConfig.key === "name" ? (b.full_name || b.student_name) : b.roll;
    const valA = String(rawA ?? "");
    const valB = String(rawB ?? "");
    return valA.localeCompare(valB, undefined, { numeric: true, sensitivity: "base" });
  });
  return sortConfig.direction === "desc" ? sorted.reverse() : sorted;
}

function Attendance() {
  const user = JSON.parse(localStorage.getItem("user")) || {};

  const [departments, setDepartments] = useState([]);
  const [semesterList, setSemesterList] = useState([]);
  const [yearList, setYearList] = useState([]);
  const [studentsDB, setStudentsDB] = useState([]);

  const [attendanceData, setAttendanceData] = useState({});
  const [lockedDays, setLockedDays] = useState({});
  const [holidayMap, setHolidayMap] = useState({});

  const [monthlyReport, setMonthlyReport] = useState([]);
  const [started, setStarted] = useState(false);
  const [search, setSearch] = useState("");
  const [daysInMonth, setDaysInMonth] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [currentLockValue, setCurrentLockValue] = useState(0);
  const [sortConfig, setSortConfig] = useState({ key: "roll", direction: "asc" });

  const [selectedDeptType, setSelectedDeptType] = useState("");

  const [teacherLookupStatus, setTeacherLookupStatus] = useState("");

  const [setup, setSetup] = useState({
    department: "",
    semester: "",
    year: "",
    teacher_id: user.employee_id || "",
    teacher_name: user.full_name || "",
    access_code: "",
    month: new Date().getMonth() + 1,
    year_number: new Date().getFullYear()
  });

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const selectedDept = useMemo(
    () => departments.find(d => d.department_name === setup.department),
    [departments, setup.department]
  );

  const isGradeDept = !!getGrade(selectedDept);

  const yearWord = isGradeDept ? "Grade" : "Year";

  useEffect(() => {
    axios.get(`${API}/departments`)
      .then(res => setDepartments(res.data || []))
      .catch(err => console.error("Error fetching departments: ", err));
  }, []);

  useEffect(() => {
    if (user.full_name) {
      setSetup(prev => ({
        ...prev,
        teacher_name: user.full_name,
        teacher_id: user.employee_id || ""
      }));
    }
  }, []);

  useEffect(() => {
    if (!setup.teacher_id.trim()) {
      setSetup(prev => ({ ...prev, teacher_name: "" }));
      setTeacherLookupStatus("");
      return;
    }

    setTeacherLookupStatus("checking");

    const delayDebounce = setTimeout(() => {
      axios.post(`${API}/teacher-by-id`, { teacher_id: setup.teacher_id })
        .then(res => {
          if (res.data.success && res.data.teacher) {
            setSetup(prev => ({ ...prev, teacher_name: res.data.teacher.full_name }));
            setTeacherLookupStatus("");
          } else if (res.data.verified === false && res.data.teacher === undefined && res.data.message?.toLowerCase().includes("pending")) {
            setSetup(prev => ({ ...prev, teacher_name: "" }));
            setTeacherLookupStatus("not_verified");
          } else {
            setSetup(prev => ({ ...prev, teacher_name: "" }));
            setTeacherLookupStatus("not_found");
          }
        })
        .catch(err => {
          console.error("Error auto-fetching teacher profile: ", err);
          setSetup(prev => ({ ...prev, teacher_name: "" }));
          setTeacherLookupStatus("not_found");
        });
    }, 600);

    return () => clearTimeout(delayDebounce);
  }, [setup.teacher_id]);

  const generateSemester = (type) =>
    type?.toLowerCase() === "semester" ? ["1", "2", "3", "4", "5", "6", "7", "8"] : [];

  const generateYearsList = (type, dept) => {
    if (type?.toLowerCase() === "semester") return [];

    const grade = getGrade(dept);

    return grade ? [String(grade)] : ["1", "2", "3", "4"];
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "department") {
      const dept = departments.find(d => d.department_name === value);
      if (dept) {
        const type = dept.course_type?.toLowerCase() || "semester";
        setSelectedDeptType(type);

        const sList = generateSemester(type);
        const yList = generateYearsList(type, dept);

        setSemesterList(sList);
        setYearList(yList);

        setSetup(prev => ({
          ...prev,
          department: value,
          semester: type === "semester" ? (sList[0] || "1") : "",
          year: type !== "semester" ? (yList[0] || "1") : ""
        }));
      } else {
        setSelectedDeptType("");
        setSemesterList([]);
        setYearList([]);
        setSetup(prev => ({ ...prev, department: value, semester: "", year: "" }));
      }
      return;
    }

    setSetup(prev => ({ ...prev, [name]: value }));
  };

  const generateMonthDays = () => {
    const total = new Date(setup.year_number, setup.month, 0).getDate();
    setDaysInMonth([...Array(total)].map((_, i) => i + 1));
  };

  const handleStart = async () => {
    if (!setup.department || !setup.access_code) {
      return alert("Please fill out Department and Access Code structural fields.");
    }
    if (selectedDeptType === "semester" && !setup.semester) {
      return alert("Please select a target active Semester.");
    }
    if (selectedDeptType !== "semester" && !setup.year) {
      return alert(`Please select a target active ${yearWord}.`);
    }

    try {
      const res = await axios.post(`${API}/verify-attendance-access`, {
        department: setup.department,
        semester: selectedDeptType === "semester" ? setup.semester : "",
        year: selectedDeptType !== "semester" ? setup.year : "",
        code: setup.access_code
      });

      if (res.data.valid || res.data.success) {
        setAttendanceData({});
        setLockedDays({});
        setHolidayMap({});
        setCurrentLockValue(0);

        generateMonthDays();

        const fetchedStudentsList = await fetchStudentsDirectly();
        setStudentsDB(fetchedStudentsList);

        await fetchAttendance(fetchedStudentsList);
        setStarted(true);
      } else {
        alert(res.data.message || "Invalid Access Code credentials match.");
      }
    } catch (error) {
      console.error(error);
      alert("Error parsing permissions credentials against database records.");
    }
  };

  const fetchStudentsDirectly = async () => {
    try {
      const res = await axios.post(`${API}/attendance-students`, {
        department: setup.department,
        semester: selectedDeptType === "semester" ? setup.semester : "",
        year: selectedDeptType !== "semester" ? setup.year : ""
      });
      if (res.data.success) {
        return res.data.students || [];
      }
      return [];
    } catch (err) {
      return [];
    }
  };

  const fetchAttendance = async (overrideStudentsList = null) => {
    try {
      const res = await axios.post(`${API}/monthly-attendance-data`, {
        department: setup.department,
        semester: selectedDeptType === "semester" ? setup.semester : "",
        year: selectedDeptType !== "semester" ? setup.year : "",
        month: String(setup.month),
        year_number: String(setup.year_number)
      });

      const map = {};
      const lock = {};
      const holiday = {};
      let isAnyRecordLocked = 0;

      if (res.data.success && res.data.attendance && res.data.attendance.length > 0) {
        res.data.attendance.forEach(rec => {
          if (rec.locked === 1) isAnyRecordLocked = 1;

          if (rec.attendance_date) {
            const dateObj = new Date(rec.attendance_date);
            const dayNum = dateObj.getDate();

            const cellKey = `${rec.roll}_${dayNum}`;
            map[cellKey] = { status: rec.status };

            if (rec.status === "H") {
              holiday[dayNum] = true;
            }

            if (rec.locked === 1) {
              lock[dayNum] = true;
            }
          }
        });
      }

      setAttendanceData(map);
      setLockedDays(lock);
      setHolidayMap(holiday);
      setCurrentLockValue(isAnyRecordLocked ? 1 : 0);
    } catch (err) {
      console.error("Error reading attendance matrices: ", err);
    }
  };

  const setStatus = (roll, day, status) => {
    if (lockedDays[day] || holidayMap[day]) return;

    const key = `${roll}_${day}`;
    setAttendanceData(prev => ({
      ...prev,
      [key]: { status: prev[key]?.status === status ? "" : status }
    }));
  };

  const markHoliday = (day) => {
    if (lockedDays[day]) return;

    setHolidayMap(prev => {
      const isNowHoliday = !prev[day];

      setAttendanceData(curr => {
        const updatedMatrix = { ...curr };
        studentsDB.forEach(stu => {
          const key = `${stu.roll}_${day}`;
          if (isNowHoliday) {
            updatedMatrix[key] = { status: "H" };
          } else {
            updatedMatrix[key] = { status: "" };
          }
        });
        return updatedMatrix;
      });

      return { ...prev, [day]: isNowHoliday };
    });
  };

  const saveAttendanceToDatabase = async () => {
    setIsSaving(true);
    try {
      const flatRecordsPayload = [];

      studentsDB.forEach(stu => {
        daysInMonth.forEach(day => {
          const cellKey = `${stu.roll}_${day}`;
          const currentStatus = attendanceData[cellKey]?.status;

          if (currentStatus) {
            const formattedDay = String(day).padStart(2, "0");
            const formattedMonth = String(setup.month).padStart(2, "0");
            const sqlDateString = `${setup.year_number}-${formattedMonth}-${formattedDay}`;

            flatRecordsPayload.push({
              student_id: stu.id,
              roll: stu.roll,
              student_name: stu.full_name || stu.student_name,
              teacher_id: setup.teacher_id,
              teacher_name: setup.teacher_name,
              department: setup.department,
              semester: selectedDeptType === "semester" ? setup.semester : "",
              year: selectedDeptType !== "semester" ? setup.year : "",
              attendance_date: sqlDateString,
              attendance_month: String(setup.month),
              attendance_year: String(setup.year_number),
              nepali_date: "",
              status: currentStatus
            });
          }
        });
      });

      if (flatRecordsPayload.length === 0) {
        alert("No attendance metrics populated onto grid logs workspace to commit.");
        setIsSaving(false);
        return;
      }

      const response = await axios.post(`${API}/save-attendance-records`, { records: flatRecordsPayload });
      if (response.data.success) {
        alert("Attendance changes saved successfully!");
        await fetchAttendance(studentsDB);
      } else {
        alert("Failed recording process: " + response.data.message);
      }
    } catch (err) {
      console.error(err);
      alert("Error streaming modifications packet payloads down to backend APIs.");
    } finally {
      setIsSaving(false);
    }
  };

  const makeAttendanceEditable = async () => {
    setIsUnlocking(true);
    try {
      const response = await axios.post(`${API}/unlock-attendance-records`, {
        department: setup.department,
        semester: selectedDeptType === "semester" ? setup.semester : "",
        year: selectedDeptType !== "semester" ? setup.year : "",
        month: String(setup.month),
        year_number: String(setup.year_number)
      });

      if (response.data.success) {
        setLockedDays({});
        setCurrentLockValue(0);
        alert("Grid modification states unlocked successfully!");
        await fetchAttendance(studentsDB);
      } else {
        alert("Unlock operation failed: " + response.data.message);
      }
    } catch (err) {
      console.error(err);
      alert("Network exception encountered attempting workspace unlock updates.");
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: "asc" };
    });
  };

  const sortIndicator = (key) => {
    if (sortConfig.key !== key) return "";
    return sortConfig.direction === "asc" ? " ▲" : " ▼";
  };

  const filteredStudents = useMemo(() => {
    const matched = studentsDB.filter(s =>
      (s.full_name || s.student_name || "").toLowerCase().includes(search.toLowerCase()) ||
      String(s.roll || "").includes(search)
    );
    return sortRecords(matched, sortConfig);
  }, [studentsDB, search, sortConfig]);

  useEffect(() => {
    const report = [];

    filteredStudents.forEach((stu, i) => {
      let p = 0, a = 0, h = 0;

      daysInMonth.forEach(day => {
        const key = `${stu.roll}_${day}`;
        const st = attendanceData[key]?.status;

        if (st === "P") p++;
        if (st === "A") a++;
        if (st === "H") h++;
      });

      const totalClassesGiven = p + a;
      const totalDaysSummed = p + a + h;

      report.push({
        sn: i + 1,
        roll: stu.roll,
        name: stu.full_name || stu.student_name,
        present: p,
        absent: a,
        holidays: h,
        total: totalClassesGiven,
        totalHoldDays: totalDaysSummed,
        percent: totalClassesGiven ? Math.round((p / totalClassesGiven) * 100) : 0
      });
    });

    setMonthlyReport(report);
  }, [attendanceData, daysInMonth, filteredStudents]);

  const teacherLookupMessage = () => {
    if (teacherLookupStatus === "checking") return "Checking teacher ID...";
    if (teacherLookupStatus === "not_verified") return "Account pending verification. Contact admin.";
    if (teacherLookupStatus === "not_found") return "No teacher found matching ID...";
    return "";
  };

  if (!started) {
    return (
      <div className="attendance">
        <div className="accessCard">
          <h2>Attendance Access form</h2>

          <div className="input-group">
            <label>Department</label>
            <select name="department" value={setup.department} onChange={handleChange}>
              <option value="">Select Department</option>
              {departments.map(d => (
                <option key={d.id || d.department_name} value={d.department_name}>
                  {d.department_name}
                </option>
              ))}
            </select>
          </div>

          {selectedDeptType === "semester" && (
            <div className="input-group">
              <label>Semester</label>
              <select name="semester" value={setup.semester} onChange={handleChange}>
                <option value="">Select Semester</option>
                {semesterList.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}

          {selectedDeptType && selectedDeptType !== "semester" && (
            <div className="input-group">
              <label>{yearWord}</label>
              <select name="year" value={setup.year} onChange={handleChange}>
                <option value="">Select {yearWord}</option>
                {yearList.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          )}

          <div className="input-group">
            <label>Teacher Profile Verification</label>
            <input
              name="teacher_id"
              value={setup.teacher_id}
              onChange={handleChange}
              placeholder="Type Teacher Employee ID"
            />
            <input
              value={setup.teacher_name ? setup.teacher_name : teacherLookupMessage()}
              readOnly
              placeholder="Teacher Profile Name"
              className="readonly-input"
              style={{
                color: setup.teacher_name
                  ? "#2563eb"
                  : teacherLookupStatus === "not_verified"
                    ? "#d97706"
                    : "#ef4444",
                fontWeight: setup.teacher_name ? "600" : "500"
              }}
            />
          </div>

          <div className="input-group">
            <label>Access Verification Key Code</label>
            <input
              name="access_code"
              value={setup.access_code}
              onChange={handleChange}
              placeholder="Enter Access Code"
              type="password"
            />
          </div>

          <div className="input-group">
            <label>Target Sheet Month</label>
            <select name="month" value={setup.month} onChange={handleChange}>
              {monthNames.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>

          <button className="primary-btn" onClick={handleStart} disabled={!setup.teacher_name}>
            Open Sheet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="attendanceSheet">
      <div className="attendanceInfoHeader">
        <div className="meta-grid">
          <div><strong>Department:</strong> {setup.department}</div>
          <div>
            {selectedDeptType === "semester" ? (
              <span><strong>Semester:</strong> {setup.semester}</span>
            ) : (
              <span><strong>{yearWord}:</strong> {setup.year}</span>
            )}
          </div>
          <div><strong>Teacher Logging:</strong> {setup.teacher_name} ({setup.teacher_id})</div>
          <div><strong>Calendar Domain:</strong> {monthNames[setup.month - 1]} {setup.year_number}</div>
        </div>
        <div className="lock-status-alert">
          <span className="lock-indicator">Sheet Lock Level: {currentLockValue}</span>
        </div>
      </div>

      <div className="action-row">
        <div className="search-wrapper">
          <input
            className="search-input"
            placeholder="Search student name or roll number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="sort-wrapper">
          <select
            className="sort-select"
            value={sortConfig.key}
            onChange={(e) => handleSort(e.target.value)}
          >
            <option value="roll">Sort by Roll No.</option>
            <option value="name">Sort by Name</option>
          </select>
          <button
            className="sort-dir-btn"
            onClick={() => handleSort(sortConfig.key)}
            title="Toggle sort direction"
          >
            {sortConfig.direction === "asc" ? "Asc ▲" : "Desc ▼"}
          </button>
        </div>

        <div className="button-group">
          <button
            className="save-changes-btn"
            onClick={saveAttendanceToDatabase}
            disabled={isSaving}
          >
            {isSaving ? "Saving States..." : "Save Changes"}
          </button>

          <button
            className="edit-changes-btn"
            onClick={makeAttendanceEditable}
            disabled={isUnlocking}
          >
            {isUnlocking ? "Unlocking..." : "Edit Sheet"}
          </button>

          <button
            className="back-btn"
            onClick={() => setStarted(false)}
          >
            back Menu
          </button>
        </div>
      </div>

      <div className="table-wrapper">
        <table className="interactive-table">
          <thead>
            <tr>
              <th className="sticky-sn">SN</th>
              <th className="sticky-roll sortable-th" onClick={() => handleSort("roll")}>
                Roll{sortIndicator("roll")}
              </th>
              <th className="sticky-col sortable-th" onClick={() => handleSort("name")}>
                Student Name{sortIndicator("name")}
              </th>
              {daysInMonth.map(day => (
                <th key={day} className={`day-col ${holidayMap[day] ? "holiday-th" : ""}`}>
                  <div className="day-header-wrap">
                    <span className="day-num" style={{ color: lockedDays[day] ? "#ef4444" : "inherit" }}>
                      {day}
                    </span>
                    <button
                      className={`h-toggle ${holidayMap[day] ? "active-h" : ""}`}
                      onClick={() => markHoliday(day)}
                      disabled={lockedDays[day]}
                      title={lockedDays[day] ? "Day Locked" : "Toggle Holiday"}
                    >
                      H
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filteredStudents.map((stu, i) => (
              <tr key={stu.roll || stu.id}>
                <td className="sticky-sn">{i + 1}</td>
                <td className="sticky-roll"><strong>{stu.roll}</strong></td>
                <td className="sticky-col student-name-cell">{stu.full_name || stu.student_name}</td>

                {daysInMonth.map(day => {
                  const key = `${stu.roll}_${day}`;
                  const st = attendanceData[key]?.status;

                  return (
                    <td key={day} className={`status-cell day-col ${st === "P" ? "cell-p" : st === "A" ? "cell-a" : st === "H" ? "cell-h" : ""}`}>
                      {holidayMap[day] || st === "H" ? (
                        <span
                          className="holiday-lbl"
                          onClick={() => { if (!lockedDays[day]) markHoliday(day); }}
                          style={{ cursor: lockedDays[day] ? "not-allowed" : "pointer" }}
                        >
                          H
                        </span>
                      ) : (
                        <div className="cell-actions">
                          <button
                            className={`btn-p ${st === "P" ? "selected" : ""}`}
                            onClick={() => setStatus(stu.roll, day, "P")}
                            disabled={lockedDays[day]}
                          >
                            P
                          </button>
                          <button
                            className={`btn-a ${st === "A" ? "selected" : ""}`}
                            onClick={() => setStatus(stu.roll, day, "A")}
                            disabled={lockedDays[day]}
                          >
                            A
                          </button>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="report-section">
        <h3>Monthly Report</h3>
        <div className="report-table-wrapper">
          <table className="report-table">
            <thead>
              <tr>
                <th>SN</th>
                <th>Roll Number</th>
                <th>Student Identity</th>
                <th>Present Days (P)</th>
                <th>Absent Days (A)</th>
                <th>Holidays (H)</th>
                <th>Total Days (P+A+H)</th>
                <th>Total Classes (P+A)</th>
                <th>Percentage Matrix</th>
              </tr>
            </thead>
            <tbody>
              {monthlyReport.map(r => (
                <tr key={r.roll}>
                  <td>{r.sn}</td>
                  <td><strong>{r.roll}</strong></td>
                  <td>{r.name}</td>
                  <td className="txt-p">{r.present}</td>
                  <td className="txt-a">{r.absent}</td>
                  <td className="txt-h">{r.holidays}</td>
                  <td><strong>{r.totalHoldDays}</strong></td>
                  <td><strong>{r.total}</strong></td>
                  <td>
                    <span className={`pct-badge ${r.percent >= 75 ? "pct-good" : "pct-low"}`}>
                      {r.percent}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default Attendance;