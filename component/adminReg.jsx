import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import "./adminRegister.css";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const pad2 = (n) => String(n).padStart(2, "0");

const daysInMonth = (year, month) => new Date(year, month, 0).getDate();

const todayObj = () => {
  const t = new Date();
  return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
};

const parseDateString = (str) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const [y, m, d] = str.split("-").map(Number);
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
};

const isFutureDate = (y, m, d) => {
  const today = todayObj();
  if (y > today.y) return true;
  if (y === today.y && m > today.m) return true;
  if (y === today.y && m === today.m && d > today.d) return true;
  return false;
};

const calcAge = (y, m, d) => {
  const today = new Date();
  let age = today.getFullYear() - y;
  const hasHadBirthdayThisYear =
    today.getMonth() + 1 > m ||
    (today.getMonth() + 1 === m && today.getDate() >= d);
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
};

const iconSvgStyle = {
  fill: "none",
  stroke: "currentColor",
  display: "block",
  flexShrink: 0,
};

const EyeIcon = ({ open }) => (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    style={iconSvgStyle}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {open ? (
      <>
        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ) : (
      <>
        <path d="M3 3l18 18" />
        <path d="M10.6 10.6a2 2 0 002.8 2.8" />
        <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 7 11 7a13.16 13.16 0 01-3.22 3.94M6.5 6.5C3.6 8.3 1 12 1 12s4 7 11 7a9.9 9.9 0 004.5-1.06" />
      </>
    )}
  </svg>
);

const CalendarIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    style={iconSvgStyle}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M16 3v4M8 3v4M3 10h18" />
  </svg>
);

const ChevronIcon = ({ direction }) => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    style={iconSvgStyle}
    strokeWidth="2.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={direction === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
  </svg>
);

const CakeIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="13"
    height="13"
    style={iconSvgStyle}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 21v-7a2 2 0 012-2h12a2 2 0 012 2v7" />
    <path d="M2 21h20" />
    <path d="M7 12V9M12 12V9M17 12V9" />
    <path d="M7 6a1.5 1.5 0 010-3M12 6a1.5 1.5 0 010-3M17 6a1.5 1.5 0 010-3" />
  </svg>
);

function DateOfBirthField({ value, onChange, error }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [slideDir, setSlideDir] = useState("next");
  const [viewYear, setViewYear] = useState(todayObj().y - 18);
  const [viewMonth, setViewMonth] = useState(todayObj().m);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const parsed = parseDateString(value);
    if (parsed) {
      setViewYear(parsed.y);
      setViewMonth(parsed.m);
    }
  }, [value]);

  useEffect(() => {
    const handleOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        closePopover();
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const closePopover = () => {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 140);
  };

  const handleTextChange = (e) => {
    const raw = e.target.value;
    onChange(raw);
  };

  const handleTextBlur = () => {
    const parsed = parseDateString(value);
    if (!parsed) {
      if (value.trim().length > 0) {
        onChange(value, "Enter a valid date as YYYY-MM-DD");
      }
      return;
    }
    if (isFutureDate(parsed.y, parsed.m, parsed.d)) {
      onChange(value, "Date of birth cannot be in the future");
    }
  };

  const selectDay = (d) => {
    if (isFutureDate(viewYear, viewMonth, d)) return;
    const formatted = `${viewYear}-${pad2(viewMonth)}-${pad2(d)}`;
    onChange(formatted, "");
    closePopover();
  };

  const goPrevMonth = () => {
    setSlideDir("prev");
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    setSlideDir("next");
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const jumpToToday = () => {
    const t = todayObj();
    setSlideDir("next");
    setViewYear(t.y);
    setViewMonth(t.m);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") closePopover();
    if (e.key === "ArrowLeft" && e.altKey) goPrevMonth();
    if (e.key === "ArrowRight" && e.altKey) goNextMonth();
  };

  const totalDays = daysInMonth(viewYear, viewMonth);
  const firstWeekday = new Date(viewYear, viewMonth - 1, 1).getDay();
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);

  const selected = parseDateString(value);
  const age =
    selected && !isFutureDate(selected.y, selected.m, selected.d)
      ? calcAge(selected.y, selected.m, selected.d)
      : null;

  const yearOptions = Array.from({ length: 100 }, (_, i) => todayObj().y - i);

  return (
    <div className="adminReg_dobWrapper" ref={wrapperRef} onKeyDown={handleKeyDown}>
      <div className="adminReg_passBox">
        <input
          className="adminReg_input"
          type="text"
          placeholder="YYYY-MM-DD"
          value={value}
          onChange={handleTextChange}
          onBlur={handleTextBlur}
          onFocus={() => setOpen(true)}
          inputMode="numeric"
          maxLength={10}
        />
        <span onClick={() => (open ? closePopover() : setOpen(true))} className="adminReg_calToggle">
          <CalendarIcon />
        </span>
      </div>

      {error && <p className="adminReg_fieldError">{error}</p>}

      {age !== null && !error && (
        <p className="adminReg_ageBadge">
          <CakeIcon />
          {age} years old
        </p>
      )}

      {open && (
        <div className={"adminReg_calendarPopover" + (closing ? " adminReg_calendarClosing" : " adminReg_calendarOpening")}>
          <div className="adminReg_calendarHeader">
            <button type="button" className="adminReg_calNavBtn" onClick={goPrevMonth} aria-label="Previous month">
              <ChevronIcon direction="left" />
            </button>

            <select
              className="adminReg_calSelect"
              value={viewMonth}
              onChange={(e) => {
                setSlideDir(Number(e.target.value) > viewMonth ? "next" : "prev");
                setViewMonth(Number(e.target.value));
              }}
            >
              {MONTH_NAMES.map((name, idx) => (
                <option key={name} value={idx + 1}>
                  {name}
                </option>
              ))}
            </select>

            <select
              className="adminReg_calSelect adminReg_calSelectYear"
              value={viewYear}
              onChange={(e) => {
                setSlideDir(Number(e.target.value) > viewYear ? "next" : "prev");
                setViewYear(Number(e.target.value));
              }}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>

            <button type="button" className="adminReg_calNavBtn" onClick={goNextMonth} aria-label="Next month">
              <ChevronIcon direction="right" />
            </button>
          </div>

          <div className="adminReg_calendarWeekdays">
            {WEEKDAYS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>

          <div className={"adminReg_calendarGrid " + (slideDir === "next" ? "adminReg_slideNext" : "adminReg_slidePrev")} key={`${viewYear}-${viewMonth}`}>
            {cells.map((d, idx) => {
              if (d === null) return <span key={`blank-${idx}`} className="adminReg_calCellEmpty" />;
              const isFuture = isFutureDate(viewYear, viewMonth, d);
              const isToday =
                viewYear === todayObj().y && viewMonth === todayObj().m && d === todayObj().d;
              const isSelected =
                selected &&
                selected.y === viewYear &&
                selected.m === viewMonth &&
                selected.d === d;
              return (
                <button
                  type="button"
                  key={d}
                  disabled={isFuture}
                  className={
                    "adminReg_calCell" +
                    (isSelected ? " adminReg_calCellSelected" : "") +
                    (isFuture ? " adminReg_calCellDisabled" : "") +
                    (isToday && !isSelected ? " adminReg_calCellToday" : "")
                  }
                  onClick={() => selectDay(d)}
                >
                  {d}
                </button>
              );
            })}
          </div>

          <button type="button" className="adminReg_calTodayLink" onClick={jumpToToday}>
            Jump to today
          </button>
        </div>
      )}
    </div>
  );
}

function AdminRegister() {
  const API = `http://${window.location.hostname}:5000`;
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    dob: "",
    password: "",
    confirmPassword: "",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleDobChange = (value, errMsg = "") => {
    setFormData((prev) => ({ ...prev, dob: value }));
    setFieldErrors((prev) => ({ ...prev, dob: errMsg }));
  };

  const resetForm = () => {
    setFormData({
      fullName: "",
      email: "",
      dob: "",
      password: "",
      confirmPassword: "",
    });
    setError("");
    setFieldErrors({});
  };

  const validateRegistration = () => {
    if (!formData.fullName.trim()) {
      setError("Full name is required");
      return false;
    }

    if (!formData.email.trim()) {
      setError("Email is required");
      return false;
    }

    const parsedDob = parseDateString(formData.dob);
    if (!parsedDob) {
      setFieldErrors((prev) => ({ ...prev, dob: "Enter a valid date as YYYY-MM-DD" }));
      setError("Please enter a valid date of birth");
      return false;
    }

    if (isFutureDate(parsedDob.y, parsedDob.m, parsedDob.d)) {
      setFieldErrors((prev) => ({ ...prev, dob: "Date of birth cannot be in the future" }));
      setError("Date of birth cannot be in the future");
      return false;
    }

    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters");
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Password does not match");
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!validateRegistration()) return;

    setLoading(true);
    try {
      const payload = {
        role: "admin",
        fullName: formData.fullName,
        roll: "",
        employeeId: "",
        email: formData.email,
        phone: "",
        department: "",
        customDepartment: "",
        dob: formData.dob,
        semester: "",
        year: "",
        password: formData.password,
      };

      const res = await axios.post(`${API}/register`, payload);

      if (res.data.status === "success") {
        alert("Admin Registration Success");
        resetForm();
      } else {
        setError(res.data.message || "Registration Failed");
      }
    } catch (err) {
      const msg = err?.response?.data?.message || "Server Error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="adminReg_page">
      <div className="adminReg_card">
        <h2 className="adminReg_heading">
          Admin Register
        </h2>

        {error && <p className="adminReg_error">{error}</p>}

        <form onSubmit={handleSubmit}>
          <label>Full Name</label>
          <input
            className="adminReg_input"
            type="text"
            name="fullName"
            value={formData.fullName}
            onChange={handleChange}
            required
          />

          <label>Email</label>
          <input
            className="adminReg_input"
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
          />

          <label>Date Of Birth</label>
          <DateOfBirthField
            value={formData.dob}
            onChange={handleDobChange}
            error={fieldErrors.dob}
          />

          <label>Password</label>
          <div className="adminReg_passBox">
            <input
              className="adminReg_input"
              type={showRegPassword ? "text" : "password"}
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
            />
            <span onClick={() => setShowRegPassword(!showRegPassword)}>
              <EyeIcon open={showRegPassword} />
            </span>
          </div>

          <label>Confirm Password</label>
          <div className="adminReg_passBox">
            <input
              className="adminReg_input"
              type={showRegConfirmPassword ? "text" : "password"}
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
            />
            <span onClick={() => setShowRegConfirmPassword(!showRegConfirmPassword)}>
              <EyeIcon open={showRegConfirmPassword} />
            </span>
          </div>

          <button className="adminReg_button" type="submit" disabled={loading}>
            {loading ? "Loading..." : "Register"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AdminRegister;