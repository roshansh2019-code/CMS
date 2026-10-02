import React, { useEffect, useState } from "react";
import axios from "axios";
import { 
  FaKey, 
  FaChartBar, 
  FaSearch, 
  FaEdit,
  FaTrash
} from "react-icons/fa";
import { MdOutlineClass } from "react-icons/md";
import { RiLoader4Line } from "react-icons/ri";
import './attendanceManage.css';

const API = `http://${window.location.hostname}:5000`;

// ================= HELPERS =================
// NEB departments (SCIENCE11, MANAGEMENT12, HUMANITIES11 ...) store the
// grade (11 or 12) in the "year" column, so the year dropdown must offer
// 11 or 12 for them instead of 1-4.
const normalizeCode = (code) =>
  (code || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

// Returns 11, 12, or null (null = not a Grade 11/12 department)
const getGrade = (dept) => {
  if (!dept || dept.course_type?.toLowerCase() !== "year") return null;

  const match = normalizeCode(dept.department_code).match(/(11|12)$/);

  return match ? Number(match[1]) : null;
};

function AttendanceManage() {
  const [departments, setDepartments] = useState([]);
  const [accessCourseType, setAccessCourseType] = useState("semester");
  const [reportCourseType, setReportCourseType] = useState("semester");
  const [accessTimelineList, setAccessTimelineList] = useState([]);
  const [reportTimelineList, setReportTimelineList] = useState([]);
  const [showAccess, setShowAccess] = useState(true);
  const [showReport, setShowReport] = useState(false);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // ===== Access code list state =====
  const [accessCodeList, setAccessCodeList] = useState([]);
  const [accessListLoading, setAccessListLoading] = useState(false);

  const [accessForm, setAccessForm] = useState({
    department: "",
    selectedValue: "", 
    code: ""
  });

  const [reportForm, setReportForm] = useState({
    department: "",
    selectedValue: "",
    fromMonth: new Date().getMonth() + 1,
    toMonth: new Date().getMonth() + 1   
  });

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Department objects currently chosen in each form (looked up by name)
  const accessDept = departments.find(d => d.department_name === accessForm.department);
  const reportDept = departments.find(d => d.department_name === reportForm.department);

  // "Year" or "Grade" depending on the selected department
  const accessYearWord = getGrade(accessDept) ? "Grade" : "Year";
  const reportYearWord = getGrade(reportDept) ? "Grade" : "Year";

  useEffect(() => {
    fetchDepartments();
    fetchAccessCodes();
  }, []);

  const fetchDepartments = async () => {
    try {
      const res = await axios.get(`${API}/departments`);
      setDepartments(res.data || []);
    } catch (err) {
      console.error("Error fetching departments: ", err);
    }
  };

  // ===== Fetch all created access codes =====
  const fetchAccessCodes = async () => {
    try {
      setAccessListLoading(true);
      const res = await axios.get(`${API}/attendance-access-list`);
      if (res.data.success) {
        setAccessCodeList(res.data.list || []);
      } else {
        setAccessCodeList([]);
      }
    } catch (err) {
      console.error("Error fetching access codes: ", err);
      setAccessCodeList([]);
    } finally {
      setAccessListLoading(false);
    }
  };

  // ===== Edit an existing access code =====
  const editAccessCode = async (item) => {
    const newCode = prompt(
      `Update Access Code for ${item.department_name} (${item.semester ? `Semester ${item.semester}` : `Year ${item.year}`}):`,
      item.access_code
    );

    if (newCode === null || newCode.trim() === "") return;

    try {
      const res = await axios.post(`${API}/add-attendance-access`, {
        department_name: item.department_name,
        department_code: item.department_code,
        semester: item.semester || "",
        year: item.year || "",
        code: newCode.trim()
      });

      if (res.data.success) {
        alert(res.data.message || "Access code updated successfully.");
        fetchAccessCodes();
      } else {
        alert(res.data.message || "Failed to update access code.");
      }
    } catch (err) {
      console.error(err);
      alert("System connection failure while updating access code.");
    }
  };

  // ===== Delete an access code =====
  const deleteAccessCode = async (id) => {
    if (!window.confirm("Remove this access code? This cannot be undone.")) return;

    try {
      const res = await axios.delete(`${API}/delete-attendance-access/${id}`);
      if (res.data.success) {
        setAccessCodeList(prev => prev.filter(item => item.id !== id));
      } else {
        alert(res.data.message || "Failed to remove access code.");
      }
    } catch (err) {
      console.error(err);
      alert("System connection failure while removing access code.");
    }
  };

  // Semester departments: 1-8. Grade 11/12 departments: just their grade.
  // Every other year-based department: 1-4.
  const generateTimeline = (dept) => {
    if (dept?.course_type?.toLowerCase() === "semester") {
      return ["1", "2", "3", "4", "5", "6", "7", "8"];
    }

    const grade = getGrade(dept);

    return grade ? [String(grade)] : ["1", "2", "3", "4"];
  };

  const handleAccessChange = (e) => {
    const { name, value } = e.target;
    let updated = { ...accessForm, [name]: value };
    if (name === "department") {
      const dept = departments.find(d => d.department_name === value);
      if (dept) {
        const type = dept.course_type?.toLowerCase() === "year" ? "year" : "semester";
        const list = generateTimeline(dept);
        setAccessCourseType(type);
        setAccessTimelineList(list);

        // Grade 11/12 has only one possible value, so select it automatically
        updated.selectedValue = getGrade(dept) ? list[0] : "";
      } else {
        setAccessCourseType("semester");
        setAccessTimelineList([]);
        updated.selectedValue = "";
      }
    }
    setAccessForm(updated);
  };

  const handleReportChange = (e) => {
    const { name, value } = e.target;
    let updated = { ...reportForm, [name]: value };

    if (name === "department") {
      const dept = departments.find(d => d.department_name === value);
      if (dept) {
        const type = dept.course_type?.toLowerCase() === "year" ? "year" : "semester";
        const list = generateTimeline(dept);
        setReportCourseType(type);
        setReportTimelineList(list);

        // Grade 11/12 has only one possible value, so select it automatically
        updated.selectedValue = getGrade(dept) ? list[0] : "";
      } else {
        setReportCourseType("semester");
        setReportTimelineList([]);
        updated.selectedValue = "";
      }
    }
    setReportForm(updated);
  };

  const createAccessCode = async () => {
    try {
      if (!accessForm.department || !accessForm.selectedValue || !accessForm.code) {
        alert(`Please complete all fields before creating an access key.`);
        return;
      }

      const targetDeptObj = departments.find(d => d.department_name === accessForm.department);
      const computedDeptCode = targetDeptObj ? (targetDeptObj.department_code || targetDeptObj.id) : accessForm.department;

      const isYearly = accessCourseType === "year";
      const payload = {
        department_name: accessForm.department,
        department_code: computedDeptCode,
        semester: isYearly ? "" : accessForm.selectedValue,
        year: isYearly ? accessForm.selectedValue : "",
        code: accessForm.code
      };

      const res = await axios.post(`${API}/add-attendance-access`, payload);

      if (res.data.success) {
        alert(res.data.message || "Access profile successfully committed to live ledger.");
        setAccessForm({ department: "", selectedValue: "", code: "" });
        setAccessTimelineList([]);
        fetchAccessCodes(); // refresh the table after creating
      } else {
        alert(res.data.message || "Access configuration insertion rejected.");
      }
    } catch (err) {
      console.error(err);
      alert("System connection failure while setting access rules.");
    }
  };

  const getReport = async () => {
    if (!reportForm.department || !reportForm.selectedValue) {
      alert(`Please choose a Department and its corresponding academic index to view reports.`);
      return;
    }

    if (Number(reportForm.fromMonth) > Number(reportForm.toMonth)) {
      alert("Validation Error: 'From Month' cannot occur after your selected 'To Month'.");
      return;
    }

    try {
      setLoading(true);
      setSearchQuery("");
      
      const isYearly = reportCourseType === "year";
      const payload = {
        department: reportForm.department,
        semester: isYearly ? "" : reportForm.selectedValue,
        year: isYearly ? reportForm.selectedValue : "",
        from_month: Number(reportForm.fromMonth), 
        to_month: Number(reportForm.toMonth)
      };

      const res = await axios.post(`${API}/monthly-attendance`, payload);

      if (res.data.success) {
        setRecords(res.data.report || []);
      } else {
        setRecords([]);
      }
    } catch (err) {
      console.error(err);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const editAttendance = async (student) => {
    const currentPresent = student.present || student.present_days || 0;
    const present = prompt(`Update Present Days for ${student.name || student.student_name}:`, currentPresent);

    if (present === null || present.trim() === "") return;

    try {
      const isYearly = reportCourseType === "year";
      const res = await axios.put(`${API}/update-attendance`, {
        student_id: student.student_id || student.id,
        present: Number(present),
        month: reportForm.fromMonth, 
        department: reportForm.department,
        semester: isYearly ? "" : reportForm.selectedValue,
        year: isYearly ? reportForm.selectedValue : ""
      });

      alert(res.data.message || "Attendance matrix records synced cleanly.");
      getReport(); 
    } catch (err) {
      console.error(err);
      alert("Modifications rewrite failed to commit safely against database layer.");
    }
  };

  const filteredRecords = records.filter((record) => {
    const studentName = (record.name || record.student_name || "").toLowerCase();
    const studentRoll = (record.roll || "").toString().toLowerCase();
    const query = searchQuery.toLowerCase();
    return studentName.includes(query) || studentRoll.includes(query);
  });

  return (
    <div className="attendanceManage">
      <div className="manageHeader">
        <h1>Attendance Management</h1>
      </div>

      <div className="manageGrid">
        <div
          className={`manageCard ${showAccess ? "activeCard" : ""}`}
          onClick={() => {
            setShowAccess(true);
            setShowReport(false);
          }}
        >
          <div className="cardIcon"><FaKey /></div>
          <h3>Create Access Code</h3>
        </div>

        <div
          className={`manageCard ${showReport ? "activeCard" : ""}`}
          onClick={() => {
            setShowReport(true);
            setShowAccess(false);
          }}
        >
          <div className="cardIcon"><FaChartBar /></div>
          <h3>Attendance Report View</h3>
        </div>
      </div>

      {showAccess && (
        <div className="formSection animateFade">
          <h2>Create Attendance Access Code</h2>
          <div className="formGrid">
            <div className="inputGroup">
              <label> Department</label>
              <select
                name="department"
                value={accessForm.department}
                onChange={handleAccessChange}
              >
                <option value="">Select Department</option>
                {departments.map(dep => (
                  <option key={dep.id} value={dep.department_name}>
                    {dep.department_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="inputGroup">
              <label> {accessCourseType === "year" ? `Academic ${accessYearWord}` : "Academic Semester"}</label>
              <select
                name="selectedValue"
                value={accessForm.selectedValue}
                onChange={handleAccessChange}
                disabled={!accessForm.department}
              >
                <option value="">
                  {accessCourseType === "year" ? `Select ${accessYearWord}` : "Select Semester"}
                </option>
                {accessTimelineList.map((t, i) => (
                  <option key={i} value={t}>
                    {accessCourseType === "year" ? `${accessYearWord} ${t}` : `Semester ${t}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="inputGroup">
              <label> Authorization Code</label>
              <input
                type="text"
                name="code"
                placeholder="Ex: ATT-2026"
                value={accessForm.code}
                onChange={handleAccessChange}
              />
            </div>
          </div>

          <button className="submitBtn" onClick={createAccessCode}>
            Submit Access Code
          </button>

          {/* ===== Table of all created access codes ===== */}
          <div className="accessCodeTableWrapper">
            <h3 className="accessCodeTableTitle">Existing Access Codes</h3>

            <div className="recordTable accessCodeTable">
              <table>
                <thead>
                  <tr>
                    <th>SN</th>
                    <th>Department</th>
                    <th>Semester / Grade</th>
                    <th>Access Code</th>
                    <th>Created By</th>
                    <th>Created At</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {accessListLoading ? (
                    <tr>
                      <td colSpan="7" className="table-status-text">
                        Loading access codes...
                      </td>
                    </tr>
                  ) : accessCodeList.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="table-status-text text-muted">
                        No access codes have been created yet.
                      </td>
                    </tr>
                  ) : (
                    accessCodeList.map((item, index) => (
                      <tr key={item.id}>
                        <td>{index + 1}</td>
                        <td className="studentNameCell">{item.department_name}</td>
                        <td>
                          {item.semester
                            ? `Semester ${item.semester}`
                            : `${getGrade({ course_type: "year", department_code: item.department_code }) ? "Grade" : "Year"} ${item.year}`}
                        </td>
                        <td><span className="rollBadge">{item.access_code}</span></td>
                        <td>{item.created_by || "-"}</td>
                        <td>{item.created_at ? new Date(item.created_at).toLocaleString() : "-"}</td>
                        <td className="actionsCell">
                          <button
                            className="editBtn"
                            onClick={() => editAccessCode(item)}
                          >
                            <FaEdit /> Edit
                          </button>
                          <button
                            className="editBtn deleteBtn"
                            onClick={() => deleteAccessCode(item.id)}
                          >
                            <FaTrash /> Remove
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showReport && (
        <div className="formSection animateFade">
          <h2>Admin Attendance Records</h2>
          
          <div className="reportQueryContainer">
            <div className="formGrid">
              <div className="inputGroup">
                <label> Department</label>
                <select
                  name="department"
                  value={reportForm.department}
                  onChange={handleReportChange}
                >
                  <option value="">Select Department</option>
                  {departments.map(dep => (
                    <option key={dep.id} value={dep.department_name}>
                      {dep.department_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="inputGroup">
                <label> {reportCourseType === "year" ? `Academic ${reportYearWord}` : "Academic Semester"}</label>
                <select
                  name="selectedValue"
                  value={reportForm.selectedValue}
                  onChange={handleReportChange}
                  disabled={!reportForm.department}
                >
                  <option value="">
                    {reportCourseType === "year" ? `Select ${reportYearWord}` : "Select Semester"}
                  </option>
                  {reportTimelineList.map((t, i) => (
                    <option key={i} value={t}>
                      {reportCourseType === "year" ? `${reportYearWord} ${t}` : `Semester ${t}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="monthRangeRow">
              <div className="inputGroup">
                <label> From Month</label>
                <select
                  name="fromMonth"
                  value={reportForm.fromMonth}
                  onChange={handleReportChange}
                >
                  {monthNames.map((m, i) => (
                    <option key={i + 1} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>

              <div className="inputGroup">
                <label> To Month</label>
                <select
                  name="toMonth"
                  value={reportForm.toMonth}
                  onChange={handleReportChange}
                >
                  {monthNames.map((m, i) => (
                    <option key={i + 1} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
            </div>

            <button className="submitBtn" onClick={getReport}>
              Pull Attendance Records 
            </button>
          </div>

          {records.length > 0 && !loading && (
            <div className="searchBarContainer animateFade">
              <span className="searchIcon"><FaSearch /></span>
              <input
                type="text"
                placeholder="Search student by name or roll index..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="studentSearchBar"
              />
            </div>
          )}

          <div className="recordTable">
            <table>
              <thead>
                <tr>
                  <th>SN</th>
                  <th>Roll Index</th>
                  <th>Student Target Name</th>
                  <th>Present</th>
                  <th>Absent</th>
                  <th>Holidays</th>
                  <th>Working Days</th>
                  <th>Total Days</th>
                  <th>Ratio Percentage</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="10" className="table-status-text">
                      Streaming logs from core DB storage layer...
                    </td>
                  </tr>
                ) : filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="table-status-text text-muted">
                      {records.length === 0 ? "No tracking tables found." : "No student matches your search query."}
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((r, index) => {
                    const workingDays = r.total_days || (Number(r.present || 0) + Number(r.absent || 0));
                    const totalDaysWithHolidays = r.total_hold_days || (workingDays + Number(r.holiday || 0));
                    const currentPct = r.percentage !== undefined ? r.percentage : (workingDays ? Math.round((Number(r.present || 0) / workingDays) * 100) : 0);

                    return (
                      <tr key={index}>
                        <td>{index + 1}</td>
                        <td><span className="rollBadge">{r.roll}</span></td>
                        <td className="studentNameCell"> {r.name || r.student_name}</td>
                        <td className="txt-present">{r.present} days</td>
                        <td className="txt-absent">{r.absent} days</td>
                        <td className="txt-holiday">{r.holiday || 0} days</td>
                        <td>{workingDays}</td>
                        <td className="txt-bold">{totalDaysWithHolidays}</td>
                        <td>
                          <span className={`badge ${currentPct >= 75 ? "badge-good" : "badge-warn"}`}>
                            {currentPct}%
                          </span>
                        </td>
                        <td>
                          <button
                            className="editBtn"
                            onClick={() => editAttendance(r)}
                          >
                           <FaEdit /> Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default AttendanceManage;