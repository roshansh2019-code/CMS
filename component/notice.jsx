import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import "./notice.css";
import Schedule from "./Schedule";

const API = `http://${window.location.hostname}:5000`;

const COLLEGE_NAME = " College System";
const COLLEGE_ADDRESS = "College Address, City, State";

const normalizeCode = (code) => (code || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

const getPlusTwoGrade = (departmentCode) => {
  const norm = normalizeCode(departmentCode);
  if (!norm) return null;
  if (norm.includes("11")) return 11;
  if (norm.includes("12")) return 12;
  return null;
};

function Notice() {
  const [activeTab, setActiveTab] = useState("event");
  const [loading, setLoading] = useState(false);

  const [eventNotice, setEventNotice] = useState({
    noticeType: "Holiday",
    title: "",
    description: "",
    image: null,
  });
  const [editingEventId, setEditingEventId] = useState(null);

  const [examNotice, setExamNotice] = useState({
    department: "",
    semesterYear: "",
    examType: "",
    image: null,
  });
  const [editingExamId, setEditingExamId] = useState(null);
  const [subjects, setSubjects] = useState([{ subject: "", date: "" }]);
  const [departments, setDepartments] = useState([]);
  const [availableSubjects, setAvailableSubjects] = useState([]);
  const [selectedDeptType, setSelectedDeptType] = useState("");
  const [eventList, setEventList] = useState([]);
  const [examList, setExamList] = useState([]);
  const [eventSearch, setEventSearch] = useState("");
  const [examSearch, setExamSearch] = useState("");
  const formRef = useRef(null);

  useEffect(() => {
    axios
      .get(`${API}/notice/departments`)
      .then((res) => setDepartments(res.data))
      .catch((err) => console.error("Failed to fetch departments:", err));
  }, []);

  useEffect(() => {
    if (activeTab === "event") fetchEventList();
    if (activeTab === "exam") fetchExamList();
  }, [activeTab]);

  const fetchEventList = () => {
    axios.get(`${API}/notice/event`).then((res) => setEventList(res.data)).catch(console.error);
  };

  const fetchExamList = () => {
    axios.get(`${API}/notice/exam`).then((res) => setExamList(res.data)).catch(console.error);
  };

  useEffect(() => {
    if (!examNotice.department || !examNotice.semesterYear) {
      setAvailableSubjects([]);
      return;
    }
    const params = { department_code: examNotice.department };
    if (selectedDeptType === "semester") params.semester = examNotice.semesterYear;
    else params.year = examNotice.semesterYear;

    axios.get(`${API}/notice/subjects`, { params })
      .then((res) => setAvailableSubjects(res.data))
      .catch(console.error);
  }, [examNotice.department, examNotice.semesterYear]);

  const getOptions = () => {
    if (!selectedDeptType) return [];
    if (selectedDeptType === "semester") return Array.from({ length: 8 }, (_, i) => i + 1);
    const plusTwoGrade = getPlusTwoGrade(examNotice.department);
    if (plusTwoGrade) return [plusTwoGrade];
    return Array.from({ length: 4 }, (_, i) => i + 1);
  };

  const addSubject = () => setSubjects([...subjects, { subject: "", date: "" }]);
  const removeSubject = (i) => setSubjects(subjects.filter((_, idx) => idx !== i));
  const handleSubjectChange = (i, field, value) => {
    const updated = [...subjects];
    updated[i][field] = value;
    setSubjects(updated);
  };

  const handleDepartmentChange = (e) => {
    const deptCode = e.target.value;
    const dept = departments.find((d) => d.department_code === deptCode);
    const courseType = dept ? dept.course_type : "";
    setSelectedDeptType(courseType);
    const plusTwoGrade = courseType === "year" ? getPlusTwoGrade(deptCode) : null;
    setExamNotice({
      ...examNotice,
      department: deptCode,
      semesterYear: plusTwoGrade ? String(plusTwoGrade) : "",
    });
    setAvailableSubjects([]);
    setSubjects([{ subject: "", date: "" }]);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
    });
  };

  const resetEventForm = () => {
    setEventNotice({ noticeType: "Holiday", title: "", description: "", image: null });
    setEditingEventId(null);
  };

  const resetExamForm = () => {
    setExamNotice({ department: "", semesterYear: "", examType: "", image: null });
    setSubjects([{ subject: "", date: "" }]);
    setAvailableSubjects([]);
    setSelectedDeptType("");
    setEditingExamId(null);
  };

  const handleEditEvent = (n) => {
    setEditingEventId(n.id);
    setEventNotice({ noticeType: n.notice_type, title: n.title, description: n.description, image: null });
    formRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleEditExam = (n) => {
    setEditingExamId(n.id);
    const dept = departments.find((d) => d.department_code === n.department_code);
    setSelectedDeptType(dept ? dept.course_type : "semester");
    setExamNotice({
      department: n.department_code,
      semesterYear: String(n.semester_year),
      examType: n.exam_type || "",
      image: null,
    });
    setSubjects(
      n.subjects?.length > 0
        ? n.subjects.map((s) => ({
            subject: s.subject_name,
            date: s.exam_date ? s.exam_date.split("T")[0] : "",
          }))
        : [{ subject: "", date: "" }]
    );
    formRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const submitEventNotice = async () => {
    if (!eventNotice.title) return alert("Title is required");
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("notice_type", eventNotice.noticeType);
      formData.append("title", eventNotice.title);
      formData.append("description", eventNotice.description);
      if (eventNotice.image instanceof File) formData.append("image", eventNotice.image);

      const res = editingEventId
        ? await axios.put(`${API}/notice/event/${editingEventId}`, formData)
        : await axios.post(`${API}/notice/event`, formData);

      alert(res.data.message || "Saved");
      resetEventForm();
      fetchEventList();
    } catch (err) {
      alert(err.response?.data?.message || "Backend error");
    } finally {
      setLoading(false);
    }
  };

  const submitExamNotice = async () => {
    if (!examNotice.department || !examNotice.semesterYear)
      return alert("Department & Semester/Year required");
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("department_code", examNotice.department);
      formData.append("semester_year", examNotice.semesterYear);
      formData.append("exam_type", examNotice.examType);
      formData.append("subjects", JSON.stringify(subjects));
      if (examNotice.image instanceof File) formData.append("image", examNotice.image);

      const res = editingExamId
        ? await axios.put(`${API}/notice/exam/${editingExamId}`, formData)
        : await axios.post(`${API}/notice/exam`, formData);

      alert(res.data.message || "Saved");
      resetExamForm();
      fetchExamList();
    } catch (err) {
      alert(err.response?.data?.message || "Backend error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEvent = async (id) => {
    if (!window.confirm("Delete this event notice?")) return;
    try { await axios.delete(`${API}/notice/event/${id}`); fetchEventList(); }
    catch { alert("Delete failed"); }
  };

  const handleDeleteExam = async (id) => {
    if (!window.confirm("Delete this exam notice? All subjects will also be removed.")) return;
    try { await axios.delete(`${API}/notice/exam/${id}`); fetchExamList(); }
    catch { alert("Delete failed"); }
  };

  const printEventRow = (n) => {
    const descriptionBlock = n.description
      ? `<p style="margin:12px 0;font-size:15px;line-height:1.7;">${n.description}</p>`
      : "";

    const imageBlock = n.image
      ? `<div style="margin-top:16px;text-align:center;">
           <img src="${API}/uploads/${n.image}" style="max-width:100%;max-height:300px;border-radius:6px;" />
         </div>`
      : "";

    const win = window.open("", "_blank");
    win.document.write(`
      <html>
      <head>
      <title>${n.title}</title>
      <style>
       body{
          font-family: Arial, sans-serif;
          margin:0;padding:0;
          color:#222;
          background:#fff;
      }

      .header{
          text-align:center;
          border-bottom:3px solid #000;
          padding:20px;
      }

      .logo{
          width:80px;
          height:80px;
          margin:auto;
      }

      .logo img{
          width:100%;
          height:100%;
          object-fit:contain;
      }

      .college-name{
          font-size:28px;
          font-weight:bold;
          margin-top:8px;
      }

      .college-address{
          font-size:14px;
          color:#555;
          margin-top:5px;
      }

      .content{
          padding:30px 50px;
      }

      .notice-type{
          text-align:center;
          font-size:16px;
          font-weight:bold;
          text-transform:uppercase;
          color:#666;
          letter-spacing:1px;
          margin-bottom:10px;
      }

      .notice-title{
          text-align:center;
          font-size:24px;
          font-weight:bold;
          margin-bottom:25px;
          text-decoration:underline;
      }

      .notice-description{
          font-size:15px;
          line-height:1.9;
          text-align:justify;
          margin-bottom:25px;
      }

      .notice-image{
          text-align:center;
          margin-top:20px;
          margin-bottom:20px;
      }

      .notice-image img{
          max-width:500px;
          max-height:300px;
          border:1px solid #ccc;
          padding:5px;
      }

      .footer{
          margin-top:60px;
          border-top:2px solid #000;
          padding:20px 50px;
      }

      .signature{
          text-align:right;
          margin-top:40px;
      }

      .signature-line{
          width:180px;
          border-top:1px solid #000;
          margin-left:auto;
          margin-bottom:5px;
      }

      .principal{
          font-weight:bold;
          font-size:15px;
      }

      .contact{
          text-align:center;
          margin-top:25px;
          font-size:13px;
          color:#666;
      }

      @media print{
          body{
              -webkit-print-color-adjust: exact;
          }
      }
      </style>
      </head>
      <body>
      <div class="header">
          <div class="logo">
              <img src="/logo.png" alt="College Logo">
          </div>

      </div>
      <div class="content">
          <div class="notice-type">
              ${n.notice_type} Notice
          </div>
          <div class="notice-title">
              ${n.title}
          </div>
          ${descriptionBlock}
          ${imageBlock}
      </div>
      <div class="footer">
          <div class="signature">
              <div class="signature-line"></div>
              <div class="principal">Principal</div>
          </div>
          <div class="contact">
              Website: www.TEST |
              Email:TEST |
              Phone:TEST
          </div>
      </div>
      </body>
      </html>
      `);

    win.document.close();
    win.print();
  };

  const printExamRow = (n) => {
    const subjectRows = n.subjects?.length > 0
      ? n.subjects.map((s, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${s.subject_name}</td>
            <td>${formatDate(s.exam_date)}</td>
          </tr>`).join("")
      : `<tr><td colspan="3" style="text-align:center;color:#888;">No subjects listed</td></tr>`;

    const imageBlock = n.image
      ? `
    <div class="notice-image">
      <img src="${API}/uploads/${n.image}" />
    </div>
  `
      : "";

    const win = window.open("", "_blank");

    win.document.write(`
<html>
<head>
<title>Exam Schedule - ${n.department_code}</title>

<style>
body{
    font-family: Arial, sans-serif;
    margin:0;
    padding:0;
    color:#222;
    background:#fff;
}

.header{
    text-align:center;
    border-bottom:3px solid #000;
    padding:20px;
}

.logo{
    width:80px;
    height:80px;
    margin:auto;
}

.logo img{
    width:100%;
    height:100%;
    object-fit:contain;
}

.college-name{
    font-size:28px;
    font-weight:bold;
    margin-top:8px;
}

.college-address{
    font-size:14px;
    color:#555;
    margin-top:5px;
}

.content{
    padding:30px 50px;
}

.notice-title{
    text-align:center;
    font-size:22px;
    font-weight:bold;
    margin-bottom:10px;
    text-decoration:underline;
}

.notice-type{
    text-align:center;
    font-size:18px;
    margin-bottom:15px;
}

.dept-info{
    text-align:center;
    font-size:16px;
    font-weight:bold;
    margin-bottom:25px;
}

.notice-description{
    font-size:15px;
    line-height:1.8;
    text-align:justify;
    margin-bottom:20px;
}

.notice-image{
    text-align:center;
    margin:20px 0;
}

.notice-image img{
    max-width:450px;
    max-height:250px;
    border:1px solid #ddd;
    padding:5px;
}

table{
    width:100%;
    border-collapse:collapse;
    margin-top:20px;
}

th{
    background:#f0f0f0;
    border:1px solid #555;
    padding:10px;
}

td{
    border:1px solid #777;
    padding:10px;
}

tr:nth-child(even){
    background:#fafafa;
}

.footer{
    margin-top:60px;
    border-top:2px solid #000;
    padding:20px 50px;
}

.signature{
    text-align:right;
    margin-top:40px;
}

.signature-line{
    width:180px;
    border-top:1px solid #000;
    margin-left:auto;
    margin-bottom:5px;
}

.principal{
    font-weight:bold;
}

.contact{
    text-align:center;
    margin-top:25px;
    font-size:13px;
    color:#555;
}

@media print{
    body{
        -webkit-print-color-adjust: exact;
    }
}
</style>

</head>

<body>

<div class="header">

  <div class="logo">
    <img src="/logo.png" alt="College Logo">
  </div>

  <div class="college-name">${COLLEGE_NAME}</div>

  <div class="college-address">
      ${COLLEGE_ADDRESS}
  </div>

</div>

<div class="content">

  <div class="notice-title">
      EXAM NOTICE
  </div>

  <div class="notice-type">
      ${n.exam_type ? n.exam_type + " Examination" : "Examination"}
  </div>

  <div class="dept-info">
      Department: ${n.department_code}
      |
      Semester/Year: ${n.semester_year}
  </div>

  <div class="notice-description">
      This is to inform all students of the
      <strong>${n.department_code}</strong> department that the
      <strong>${n.exam_type}</strong> examination schedule has been
      published. Students are requested to follow the dates mentioned
      below and appear in the examination accordingly.
  </div>

  ${imageBlock}

  <table>
      <thead>
          <tr>
              <th>SN</th>
              <th>Subject</th>
              <th>Exam Date</th>
          </tr>
      </thead>
      <tbody>
          ${subjectRows}
      </tbody>
  </table>

</div>

<div class="footer">

  <div class="signature">
      <div class="signature-line"></div>
      <div class="principal">Principal</div>
      <div>College Management</div>
  </div>

  <div class="contact">
      Website: www.yourcollege.com |
      Email: info@yourcollege.com |
      Phone: +977-XXXXXXXXXX
  </div>

</div>

</body>
</html>
`);

    win.document.close();
    win.print();
  };

  const filteredEvents = eventList.filter((n) => {
    const q = eventSearch.toLowerCase();
    return (
      n.title?.toLowerCase().includes(q) ||
      n.description?.toLowerCase().includes(q) ||
      n.notice_type?.toLowerCase().includes(q)
    );
  });

  const filteredExams = examList.filter((n) => {
    const q = examSearch.toLowerCase();
    return (
      n.department_code?.toLowerCase().includes(q) ||
      n.exam_type?.toLowerCase().includes(q) ||
      String(n.semester_year).includes(q)
    );
  });

  return (
    <div className="notice-container">
      <h2>Notice System</h2>
      <div className="notice-buttons">
        <button
          className={activeTab === "event" ? "active" : ""}
          onClick={() => setActiveTab("event")}
        >
          Holiday / Event
        </button>
        <button
          className={activeTab === "exam" ? "active" : ""}
          onClick={() => setActiveTab("exam")}
        >
          Exam Schedule
        </button>
        <button
          className={activeTab === "schedule" ? "active" : ""}
          onClick={() => setActiveTab("schedule")}
        >
          Time Schedule
        </button>
      </div>

      {activeTab === "event" && (
        <div className="form-box" ref={formRef}>
          <h3>{editingEventId ? " Edit Event Notice" : "Holiday / Event Notice"}</h3>

          {editingEventId && (
            <div className="edit-banner">
              Editing notice #{editingEventId} &nbsp;
              <button className="btn-cancel" onClick={resetEventForm}>✕ Cancel</button>
            </div>
          )}

          <select
            value={eventNotice.noticeType}
            onChange={(e) => setEventNotice({ ...eventNotice, noticeType: e.target.value })}
          >
            <option>Holiday</option>
            <option>Event</option>
          </select>

          <input
            type="text"
            placeholder="Title *"
            value={eventNotice.title}
            onChange={(e) => setEventNotice({ ...eventNotice, title: e.target.value })}
          />

          <textarea
            placeholder="Description (optional)"
            rows="4"
            value={eventNotice.description}
            onChange={(e) => setEventNotice({ ...eventNotice, description: e.target.value })}
          />

          <label className="file-label">Image (optional)</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setEventNotice({ ...eventNotice, image: e.target.files[0] })}
          />

          <div className="form-actions">
            <button onClick={submitEventNotice} disabled={loading}>
              {loading ? "Saving..." : editingEventId ? "Update Notice" : "Publish"}
            </button>
          </div>

          <div className="notice-table-section">
            <div className="table-header-row">
              <h4>Published Event Notices</h4>
              <input
                type="text"
                className="search-bar"
                placeholder=" Search title, type..."
                value={eventSearch}
                onChange={(e) => setEventSearch(e.target.value)}
              />
            </div>

            {filteredEvents.length === 0 ? (
              <p className="table-empty">
                {eventSearch ? "No results found." : "No event notices yet."}
              </p>
            ) : (
              <div className="table-scroll">
                <table className="notice-table">
                  <thead>
                    <tr>
                      <th>Sn</th>
                      <th>Type</th>
                      <th>Title</th>
                      <th>Description</th>
                      <th>Image</th>
                      <th>Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEvents.map((n, i) => (
                      <tr key={n.id}>
                        <td>{i + 1}</td>
                        <td>
                          <span className={`badge ${n.notice_type === "Holiday" ? "badge-holiday" : "badge-event"}`}>
                            {n.notice_type}
                          </span>
                        </td>
                        <td>{n.title}</td>
                        <td className="td-desc">
                          {n.description ? n.description : <span className="text-muted">—</span>}
                        </td>
                        <td>
                          {n.image ? (
                            <a href={`${API}/uploads/${n.image}`} target="_blank" rel="noreferrer">View</a>
                          ) : <span className="text-muted">—</span>}
                        </td>
                        <td>{formatDate(n.created_at)}</td>
                        <td>
                          <div className="action-btns">
                            <button className="btn-edit" onClick={() => handleEditEvent(n)}>Edit</button>
                            <button className="btn-delete" onClick={() => handleDeleteEvent(n.id)}> Delete</button>
                            <button className="btn-print" onClick={() => printEventRow(n)}>Print</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "exam" && (
        <div className="form-box" ref={formRef}>
          <h3>{editingExamId ? "Edit Exam Notice" : "Exam Schedule Notice"}</h3>

          {editingExamId && (
            <div className="edit-banner">
              Editing notice #{editingExamId} &nbsp;
              <button className="btn-cancel" onClick={resetExamForm}>✕ Cancel</button>
            </div>
          )}
          <select value={examNotice.department} onChange={handleDepartmentChange}>
            <option value="">Select Department</option>
            {departments.map((d) => (
              <option key={d.department_code} value={d.department_code}>
                {d.department_name} ({d.department_code})
              </option>
            ))}
          </select>

          <select
            value={examNotice.semesterYear}
            onChange={(e) => setExamNotice({ ...examNotice, semesterYear: e.target.value })}
            disabled={!examNotice.department}
          >
            <option value="">
              {examNotice.department
                ? `Select ${
                    selectedDeptType === "semester"
                      ? "Semester"
                      : getPlusTwoGrade(examNotice.department)
                      ? "Grade"
                      : "Year"
                  }`
                : "Select Department First"}
            </option>
            {getOptions().map((n) => (
              <option key={n} value={n}>
                {selectedDeptType === "semester"
                  ? `Semester ${n}`
                  : getPlusTwoGrade(examNotice.department)
                  ? `Grade ${n}`
                  : `Year ${n}`}
              </option>
            ))}
          </select>

          <select
            value={examNotice.examType}
            onChange={(e) => setExamNotice({ ...examNotice, examType: e.target.value })}
          >
            <option value="">Select Exam Type</option>
            <option value="First">First Term</option>
            <option value="Mid">Mid Term</option>
            <option value="Pre Board">Pre Board</option>
            <option value="Final">Final</option>
          </select>

          <h4>Subjects</h4>
          {!examNotice.semesterYear && (
            <p style={{ color: "#888", fontSize: "0.9em" }}>
              Select department and semester/year to load subjects.
            </p>
          )}

          {subjects.map((s, i) => (
            <div key={i} className="subject-row">
              <select
                value={s.subject}
                onChange={(e) => handleSubjectChange(i, "subject", e.target.value)}
                disabled={availableSubjects.length === 0}
              >
                <option value="">
                  {availableSubjects.length === 0 ? "No subjects loaded" : "Select Subject"}
                </option>
                {availableSubjects.map((sub) => (
                  <option key={sub.id} value={sub.subject_name}>
                    {sub.subject_name} ({sub.subject_code})
                  </option>
                ))}
              </select>

              <input
                type="date"
                value={s.date}
                onChange={(e) => handleSubjectChange(i, "date", e.target.value)}
              />

              {subjects.length > 1 && (
                <button type="button" className="btn-remove" onClick={() => removeSubject(i)}>
                  ✕
                </button>
              )}
            </div>
          ))}

          <button onClick={addSubject} disabled={availableSubjects.length === 0}>
            + Add Subject
          </button>

          <label className="file-label" style={{ marginTop: "12px" }}>Image (optional)</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setExamNotice({ ...examNotice, image: e.target.files[0] })}
          />

          <div className="form-actions">
            <button onClick={submitExamNotice} disabled={loading}>
              {loading ? "Saving..." : editingExamId ? "Update Notice" : "Publish"}
            </button>
          </div>

          <div className="notice-table-section">
            <div className="table-header-row">
              <h4>Published Exam Notices</h4>
              <input
                type="text"
                className="search-bar"
                placeholder=" Search dept, exam type..."
                value={examSearch}
                onChange={(e) => setExamSearch(e.target.value)}
              />
            </div>

            {filteredExams.length === 0 ? (
              <p className="table-empty">
                {examSearch ? "No results found." : "No exam notices yet."}
              </p>
            ) : (
              <div className="table-scroll">
                <table className="notice-table">
                  <thead>
                    <tr>
                      <th>Sn</th>
                      <th>Department</th>
                      <th>Sem / Year</th>
                      <th>Exam Type</th>
                      <th>Subjects &amp; Dates</th>
                      <th>Image</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExams.map((n, i) => (
                      <tr key={n.id}>
                        <td>{i + 1}</td>
                        <td>{n.department_code}</td>
                        <td>{n.semester_year}</td>
                        <td>
                          {n.exam_type
                            ? <span className="badge badge-exam">{n.exam_type}</span>
                            : <span className="text-muted">—</span>}
                        </td>
                        <td>
                          {n.subjects?.length > 0 ? (
                            <table className="inner-table">
                              <thead>
                                <tr><th>Subject</th><th>Date</th></tr>
                              </thead>
                              <tbody>
                                {n.subjects.map((s, j) => (
                                  <tr key={j}>
                                    <td>{s.subject_name}</td>
                                    <td>{formatDate(s.exam_date)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : <span className="text-muted">—</span>}
                        </td>
                        <td>
                          {n.image
                            ? <a href={`${API}/uploads/${n.image}`} target="_blank" rel="noreferrer">View</a>
                            : <span className="text-muted">—</span>}
                        </td>
                        <td>
                          <div className="action-btns">
                            <button className="btn-edit" onClick={() => handleEditExam(n)}> Edit</button>
                            <button className="btn-delete" onClick={() => handleDeleteExam(n.id)}> Delete</button>
                            <button className="btn-print" onClick={() => printExamRow(n)}> Print</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "schedule" && <Schedule role="admin" embedded />}
    </div>
  );
}

export default Notice;