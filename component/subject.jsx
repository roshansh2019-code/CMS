import { useEffect, useState } from "react";
import axios from "axios";
import "./subject.css";

// ================= HELPERS =================
// NEB departments (SCIENCE11, MANAGEMENT12, HUMANITIES11 ...) store the
// grade (11 or 12) in the "year" column of the subjects table, so the
// year dropdown must offer 11 or 12 for them instead of 1-4.
const normalizeCode = (code) =>
  (code || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

// Returns 11, 12, or null (null = not a Grade 11/12 department)
const getGrade = (dept) => {

  if (!dept || dept.course_type !== "year") return null;

  const match = normalizeCode(dept.department_code).match(/(11|12)$/);

  return match ? Number(match[1]) : null;
};

// Year/Grade options for the selected department
const getYearOptions = (dept) => {

  const grade = getGrade(dept);

  return grade ? [grade] : [1, 2, 3, 4];
};

// Label used in dropdowns and the table
const periodLabel = (dept, value) =>
  getGrade(dept) ? `Grade ${value}` : `Year ${value}`;

export default function Subject() {

  const API = "http://127.0.0.1:5000";

  const [subjectDepartments, setSubjectDepartments] = useState([]);
  const [subjectSubjects, setSubjectSubjects] = useState([]);

  const [subjectSelectedDept, setSubjectSelectedDept] = useState(null);

  const [subjectFilters, setSubjectFilters] = useState({
    department_code: "",
    value: ""
  });

  const [subjectForm, setSubjectForm] = useState({
    department_code: "",
    subject_name: "",
    subject_code: "",
    subject_type: "regular"
  });

  const [subjectEditId, setSubjectEditId] = useState(null);

  // ================= FETCH DEPARTMENTS =================
  useEffect(() => {

    const fetchDepartments = async () => {

      try {

        const res = await axios.get(`${API}/departments`);

        setSubjectDepartments(res.data || []);

      } catch (err) {

        console.log(err);

      }
    };

    fetchDepartments();

  }, []);

  // ================= FETCH SUBJECTS =================
  useEffect(() => {

    const fetchSubjects = async () => {

      if (
        !subjectFilters.department_code ||
        !subjectFilters.value
      ) {
        setSubjectSubjects([]);
        return;
      }

      try {

        const dept = subjectDepartments.find(
          d =>
            d.department_code ===
            subjectFilters.department_code
        );

        const params = {
          department_code:
            subjectFilters.department_code
        };

        if (dept?.course_type === "semester") {
          params.semester = subjectFilters.value;
        } else {
          params.year = subjectFilters.value;
        }

        const res = await axios.get(
          `${API}/subjects`,
          { params }
        );

        setSubjectSubjects(res.data || []);

      } catch (err) {

        console.log(err);

      }
    };

    fetchSubjects();

  }, [subjectFilters, subjectDepartments]);

  // ================= FILTER =================
  const subjectHandleFilterChange = (e) => {

    const { name, value } = e.target;

    let updated = {
      ...subjectFilters,
      [name]: value
    };

    if (name === "department_code") {

      const dept = subjectDepartments.find(
        d => d.department_code === value
      );

      setSubjectSelectedDept(dept || null);

      setSubjectForm({
        ...subjectForm,
        department_code: value
      });

      // Grade 11/12 departments only have one possible grade,
      // so pick it automatically. Everything else resets.
      const grade = getGrade(dept);

      updated.value = grade ? String(grade) : "";
    }

    setSubjectFilters(updated);
  };

  // ================= FORM =================
  const subjectHandleFormChange = (e) => {

    setSubjectForm({
      ...subjectForm,
      [e.target.name]: e.target.value
    });

  };

  // ================= SUBMIT =================
  const subjectSubmit = async (e) => {

    e.preventDefault();

    try {

      const payload = {

        department_code:
          subjectForm.department_code,

        subject_name:
          subjectForm.subject_name,

        subject_code:
          subjectForm.subject_code,

        subject_type:
          subjectForm.subject_type,

        semester:
          subjectSelectedDept?.course_type ===
          "semester"
            ? subjectFilters.value
            : null,

        year:
          subjectSelectedDept?.course_type ===
          "year"
            ? subjectFilters.value
            : null
      };

      if (subjectEditId) {

        await axios.put(
          `${API}/update-subject/${subjectEditId}`,
          payload
        );

        alert("Subject Updated");

      } else {

        await axios.post(
          `${API}/add-subject`,
          payload
        );

        alert("Subject Added");

      }

      setSubjectForm({
        department_code:
          subjectFilters.department_code,
        subject_name: "",
        subject_code: "",
        subject_type: "regular"
      });

      setSubjectEditId(null);

      subjectRefreshTable();

    } catch (err) {

      console.log(err);
      alert(
        err.response?.data?.message ||
        "Error Saving Subject"
      );

    }
  };

  // ================= REFRESH TABLE =================
  const subjectRefreshTable = async () => {

    try {

      const dept = subjectDepartments.find(
        d =>
          d.department_code ===
          subjectFilters.department_code
      );

      const params = {
        department_code:
          subjectFilters.department_code
      };

      if (dept?.course_type === "semester") {
        params.semester = subjectFilters.value;
      } else {
        params.year = subjectFilters.value;
      }

      const res = await axios.get(
        `${API}/subjects`,
        { params }
      );

      setSubjectSubjects(res.data || []);

    } catch (err) {

      console.log(err);

    }
  };

  // ================= EDIT =================
  const subjectHandleEdit = (s) => {

    setSubjectEditId(s.id);

    setSubjectForm({
      department_code: s.department_code,
      subject_name: s.subject_name,
      subject_code: s.subject_code,
      subject_type: s.subject_type
    });

  };

  // ================= DELETE =================
  const subjectHandleDelete = async (id) => {

    try {

      await axios.delete(
        `${API}/delete-subject/${id}`
      );

      setSubjectSubjects(
        subjectSubjects.filter(s => s.id !== id)
      );

      alert("Subject Deleted");

    } catch (err) {

      console.log(err);

    }
  };

  // ================= TABLE LABEL =================
  // Looks up the department of each row so Grade 11/12 rows show
  // "Grade 11" instead of "Year 11".
  const subjectPeriodText = (s) => {

    if (s.semester) return `Semester ${s.semester}`;

    const dept = subjectDepartments.find(
      d => d.department_code === s.department_code
    );

    return periodLabel(dept, s.year);
  };

  const isGradeDept = !!getGrade(subjectSelectedDept);

  return (

    <div className="subjectContainer">

      <h2 className="subjectTitle">
        Subject Management
      </h2>

      {/* FILTER */}
      <div className="subjectFilterBox">

        <select
          className="subjectSelect"
          name="department_code"
          value={subjectFilters.department_code}
          onChange={subjectHandleFilterChange}
        >

          <option value="">
            Select Department
          </option>

          {subjectDepartments.map(d => (

            <option
              key={d.id}
              value={d.department_code}
            >
              {d.department_name}
            </option>

          ))}

        </select>

        {subjectSelectedDept?.course_type ===
        "semester" ? (

          <select
            className="subjectSelect"
            name="value"
            value={subjectFilters.value}
            onChange={subjectHandleFilterChange}
          >

            <option value="">
              Select Semester
            </option>

            {[1,2,3,4,5,6,7,8].map(s => (

              <option key={s} value={s}>
                Semester {s}
              </option>

            ))}

          </select>

        ) : (

          <select
            className="subjectSelect"
            name="value"
            value={subjectFilters.value}
            onChange={subjectHandleFilterChange}
          >

            <option value="">
              {isGradeDept ? "Select Grade" : "Select Year"}
            </option>

            {getYearOptions(subjectSelectedDept).map(y => (

              <option key={y} value={y}>
                {periodLabel(subjectSelectedDept, y)}
              </option>

            ))}

          </select>

        )}

      </div>

      {/* MESSAGE */}
      {!subjectFilters.department_code ||
      !subjectFilters.value ? (

        <div className="subjectMessageBox">

          Please Select Department and
          Semester/Year/Grade

        </div>

      ) : null}

      {/* FORM */}
      <form
        className="subjectForm"
        onSubmit={subjectSubmit}
      >

        <input
          className="subjectInput"
          type="text"
          name="department_code"
          value={subjectForm.department_code}
          readOnly
          placeholder="Department"
        />

        <input
          className="subjectInput"
          type="text"
          name="subject_name"
          value={subjectForm.subject_name}
          onChange={subjectHandleFormChange}
          placeholder="Subject Name"
          required
        />

        <input
          className="subjectInput"
          type="text"
          name="subject_code"
          value={subjectForm.subject_code}
          onChange={subjectHandleFormChange}
          placeholder="Subject Code"
          required
        />

        <select
          className="subjectSelect"
          name="subject_type"
          value={subjectForm.subject_type}
          onChange={subjectHandleFormChange}
        >

          <option value="regular">
            Regular
          </option>

          <option value="optional">
            Optional
          </option>

        </select>

        <button
          className="subjectSubmitBtn"
          type="submit"
        >

          {subjectEditId
            ? "Update Subject"
            : "Add Subject"}

        </button>

      </form>

      {/* TABLE */}
      <div className="subjectTableWrapper">

        <table className="subjectTable">

          <thead>

            <tr>

              <th>Department</th>

              <th>Semester/Year/Grade</th>

              <th>Subject</th>

              <th>Code</th>

              <th>Type</th>

              <th>Assigned Teacher</th>

              <th>Action</th>

            </tr>

          </thead>

          <tbody>

            {subjectSubjects.length > 0 ? (

              subjectSubjects.map(s => (

                <tr key={s.id}>

                  <td>{s.department_code}</td>

                  <td>
                    {subjectPeriodText(s)}
                  </td>

                  <td>{s.subject_name}</td>

                  <td>{s.subject_code}</td>

                  <td>

                    <span
                      className={
                        s.subject_type ===
                        "regular"
                          ? "subjectRegularBadge"
                          : "subjectOptionalBadge"
                      }
                    >
                      {s.subject_type}
                    </span>

                  </td>

                  <td>
                    {s.teacher_names
                      ? s.teacher_names
                      : <span className="subjectNoTeacher">Not Assigned</span>}
                  </td>

                  <td>

                    <div className="subjectActionBox">

                      <button
                        className="subjectEditBtn"
                        onClick={() =>
                          subjectHandleEdit(s)
                        }
                      >
                        Edit
                      </button>

                      <button
                        className="subjectDeleteBtn"
                        onClick={() =>
                          subjectHandleDelete(s.id)
                        }
                      >
                        Delete
                      </button>

                    </div>

                  </td>

                </tr>

              ))

            ) : (

              <tr>

                <td
                  colSpan="7"
                  className="subjectNoData"
                >

                  No Subjects Found

                </td>

              </tr>

            )}

          </tbody>

        </table>

      </div>

    </div>
  );
}