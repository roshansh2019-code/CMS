import { useState, useEffect } from "react";
import axios from "axios";
import "./department.css";

// ================= KNOWN COURSES =================
// Selecting one of these auto-fills department code + course type.
// deptCode values are the plain SHORT FORM (no dots/spaces), matching
// the prefix used for auto-generated subject codes in
// backend/course_templates.py (e.g. "BSCCSIT-S1-01", not "BSc.CSIT-...").
// Keep the "key" values AND deptCode values in sync with
// COURSE_TEMPLATES / COURSE_ALIASES in backend/course_templates.py so
// the backend still recognizes the code and auto-fills subjects too.
//
// "group" decides which <optgroup> the option appears under:
//   "TU"  -> Tribhuvan University programs
//   "NEB" -> Grade 11 & 12 (+2) programs
//   none  -> shown at the bottom (Custom)
const COURSE_OPTIONS = [
  // ---------- TU programs ----------
  {
    key: "BCA",
    group: "TU",
    label: "BCA — Bachelor in Computer Application",
    deptName: "Bachelor in Computer Application",
    deptCode: "BCA",
    courseType: "semester"
  },
  {
    key: "BSCCSIT",
    group: "TU",
    label: "BSc.CSIT — Bachelor of Science in Computer Science and IT",
    deptName: "Bachelor of Science in Computer Science and Information Technology",
    deptCode: "BSCCSIT",
    courseType: "semester"
  },
  {
    key: "BBS",
    group: "TU",
    label: "BBS — Bachelor of Business Studies",
    deptName: "Bachelor of Business Studies",
    deptCode: "BBS",
    courseType: "year"
  },
  {
    key: "BBA",
    group: "TU",
    label: "BBA — Bachelor of Business Administration",
    deptName: "Bachelor of Business Administration",
    deptCode: "BBA",
    courseType: "semester"
  },
  {
    key: "BIM",
    group: "TU",
    label: "BIM — Bachelor of Information Management",
    deptName: "Bachelor of Information Management",
    deptCode: "BIM",
    courseType: "semester"
  },
  {
    key: "MBS",
    group: "TU",
    label: "MBS — Master of Business Studies",
    deptName: "Master of Business Studies",
    deptCode: "MBS",
    courseType: "semester"
  },
  {
    key: "BSW",
    group: "TU",
    label: "BSW — Bachelor of Social Work",
    deptName: "Bachelor of Social Work",
    deptCode: "BSW",
    courseType: "year"
  },

  // ---------- NEB Grade 11 & 12 (+2) ----------
  {
    key: "SCIENCE11",
    group: "NEB",
    label: "Science — Grade 11",
    deptName: "Grade 11 Science",
    deptCode: "SCIENCE11",
    courseType: "year"
  },
  {
    key: "SCIENCE12",
    group: "NEB",
    label: "Science — Grade 12",
    deptName: "Grade 12 Science",
    deptCode: "SCIENCE12",
    courseType: "year"
  },
  {
    key: "MANAGEMENT11",
    group: "NEB",
    label: "Management — Grade 11",
    deptName: "Grade 11 Management",
    deptCode: "MANAGEMENT11",
    courseType: "year"
  },
  {
    key: "MANAGEMENT12",
    group: "NEB",
    label: "Management — Grade 12",
    deptName: "Grade 12 Management",
    deptCode: "MANAGEMENT12",
    courseType: "year"
  },
  {
    key: "HUMANITIES11",
    group: "NEB",
    label: "Humanities — Grade 11",
    deptName: "Grade 11 Humanities",
    deptCode: "HUMANITIES11",
    courseType: "year"
  },
  {
    key: "HUMANITIES12",
    group: "NEB",
    label: "Humanities — Grade 12",
    deptName: "Grade 12 Humanities",
    deptCode: "HUMANITIES12",
    courseType: "year"
  },

  // ---------- Custom ----------
  {
    key: "custom",
    label: "Other / Custom Department"
  }
];

function Department() {

  const API = "http://127.0.0.1:5000";

  // ================= STATE =================
  const [selectedCourse, setSelectedCourse] = useState("custom");

  const [departmentForm, setDepartmentForm] = useState({
    deptName: "",
    deptCode: "",
    courseType: ""
  });

  const [departmentList, setDepartmentList] = useState([]);

  const [departmentEditId, setDepartmentEditId] =
    useState(null);

  // ================= COURSE SELECT =================
  const isCustom = selectedCourse === "custom";

  const departmentHandleCourseSelect = (e) => {

    const key = e.target.value;
    setSelectedCourse(key);

    if (key === "custom") {

      setDepartmentForm({
        deptName: "",
        deptCode: "",
        courseType: ""
      });

      return;
    }

    const course = COURSE_OPTIONS.find(c => c.key === key);

    setDepartmentForm({
      deptName: course.deptName,
      deptCode: course.deptCode,
      courseType: course.courseType
    });

  };

  // ================= FETCH =================
  const departmentFetch = async () => {

    try {

      const res = await axios.get(
        `${API}/departments`
      );

      setDepartmentList(res.data || []);

    } catch (err) {

      console.log(err);

    }
  };

  // ================= LOAD =================
  useEffect(() => {

    departmentFetch();

  }, []);

  // ================= CHANGE =================
  const departmentHandleChange = (e) => {

    setDepartmentForm({
      ...departmentForm,
      [e.target.name]: e.target.value
    });

  };

  // ================= RESET =================
  const departmentReset = () => {

    setDepartmentForm({
      deptName: "",
      deptCode: "",
      courseType: ""
    });

    setDepartmentEditId(null);

    setSelectedCourse("custom");

  };

  // ================= SUBMIT =================
  const departmentSubmit = async (e) => {

    e.preventDefault();

    if (
      !departmentForm.deptName ||
      !departmentForm.deptCode ||
      !departmentForm.courseType
    ) {
      alert("Please Fill All Fields");
      return;
    }

    try {

      const payload = {

        department_name:
          departmentForm.deptName,

        department_code:
          departmentForm.deptCode,

        course_type:
          departmentForm.courseType

      };

      // UPDATE
      if (departmentEditId) {

        await axios.put(
          `${API}/update-department/${departmentEditId}`,
          payload
        );

        alert("Department Updated");

      }

      // ADD
      else {

        const res = await axios.post(
          `${API}/add-department`,
          payload
        );

        if (res.data?.auto_filled) {
          alert(
            `Department Added — ${res.data.subjects_added} subjects auto-added from the ${res.data.university} curriculum (${departmentForm.deptCode.toUpperCase()})`
          );
        } else {
          alert("Department Added");
        }

      }

      departmentReset();

      departmentFetch();

    } catch (err) {

      console.log(err);

      // Show the backend's message (e.g. "Department already exists")
      // when there is one, otherwise a generic error.
      alert(
        err.response?.data?.message ||
        "Error Saving Department"
      );

    }
  };

  // ================= EDIT =================
  const departmentEdit = (d) => {

    // Editing goes into "custom" mode so every field stays
    // directly editable, regardless of which course it came from.
    setSelectedCourse("custom");

    setDepartmentForm({

      deptName: d.department_name,

      deptCode: d.department_code,

      courseType: d.course_type

    });

    setDepartmentEditId(d.id);

  };

  // ================= DELETE =================
  const departmentDelete = async (id) => {

    const confirmDelete = window.confirm(
      "Are you sure you want to delete?"
    );

    if (!confirmDelete) return;

    try {

      await axios.delete(
        `${API}/delete-department/${id}`
      );

      alert("Department Deleted");

      departmentFetch();

    } catch (err) {

      console.log(err);

    }
  };

  return (

    <div className="departmentContainer">

      {/* TITLE */}
      <h2 className="departmentTitle">

        Department Management

      </h2>

      {/* FORM */}
      <form
        className="departmentForm"
        onSubmit={departmentSubmit}
      >

        {/* COURSE SELECT — picking one auto-fills code + type below */}
        <select
          className="departmentInput"
          value={selectedCourse}
          onChange={departmentHandleCourseSelect}
          disabled={!!departmentEditId}
        >

          <optgroup label="TU Programs">
            {COURSE_OPTIONS.filter(c => c.group === "TU").map(c => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </optgroup>

          <optgroup label="NEB — Grade 11 & 12 (+2)">
            {COURSE_OPTIONS.filter(c => c.group === "NEB").map(c => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </optgroup>

          {COURSE_OPTIONS.filter(c => !c.group).map(c => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}

        </select>

        <input
          className="departmentInput"
          type="text"
          name="deptName"
          placeholder="Department Name"
          value={departmentForm.deptName}
          onChange={departmentHandleChange}
        />

        <input
          className="departmentInput"
          type="text"
          name="deptCode"
          placeholder="Department Code (e.g. BCA, BSCCSIT, SCIENCE11)"
          value={departmentForm.deptCode}
          onChange={departmentHandleChange}
          readOnly={!isCustom}
        />

        {!isCustom && (
          <p className="departmentAutoNote">
            Code and course type auto-detected from the selected course.
          </p>
        )}

        <select
          className="departmentInput"
          name="courseType"
          value={departmentForm.courseType}
          onChange={departmentHandleChange}
          disabled={!isCustom}
        >

          <option value="">
            Select Course Type
          </option>

          <option value="semester">
            Semester
          </option>

          <option value="year">
            Year
          </option>

        </select>

        <div className="departmentBtnBox">

          <button
            className="departmentAddBtn"
            type="submit"
          >

            {departmentEditId
              ? "Update Department"
              : "Add Department"}

          </button>

          {departmentEditId && (

            <button
              type="button"
              className="departmentCancelBtn"
              onClick={departmentReset}
            >

              Cancel

            </button>

          )}

        </div>

      </form>

      {/* TABLE */}
      <div className="departmentTableWrapper">

        <table className="departmentTable">

          <thead>

            <tr>

              <th>Department Name</th>

              <th>Department Code</th>

              <th>Course Type</th>

              <th>Action</th>

            </tr>

          </thead>

          <tbody>

            {departmentList.length > 0 ? (

              departmentList.map((d) => (

                <tr key={d.id}>

                  <td>
                    {d.department_name}
                  </td>

                  <td>
                    {d.department_code}
                  </td>

                  <td>

                    <span
                      className={
                        d.course_type === "semester"
                          ? "departmentSemesterBadge"
                          : "departmentYearBadge"
                      }
                    >

                      {d.course_type}

                    </span>

                  </td>

                  <td>

                    <div className="departmentActionBox">

                      <button
                        className="departmentEditBtn"
                        onClick={() =>
                          departmentEdit(d)
                        }
                      >

                        Edit

                      </button>

                      <button
                        className="departmentDeleteBtn"
                        onClick={() =>
                          departmentDelete(d.id)
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
                  colSpan="4"
                  className="departmentNoData"
                >

                  No Departments Found

                </td>

              </tr>

            )}

          </tbody>

        </table>

      </div>

    </div>
  );
}

export default Department;