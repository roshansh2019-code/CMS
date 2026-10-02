import { useEffect, useState, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import axios from "axios";
import {
  FiUser, FiMail, FiPhone, FiCalendar,
  FiShield, FiEdit2, FiLock, FiSun, FiMoon,
  FiBell, FiGlobe, FiSave, FiX, FiCamera,
  FiEye, FiEyeOff, FiCheck, FiAlertCircle,
  FiBook, FiBriefcase, FiUsers, FiUploadCloud,
  FiZoomIn, FiZoomOut, FiRotateCw,
} from "react-icons/fi";
import "./profileSetting.css";

const API = `http://${window.location.hostname}:5000`;

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

const iconSvgStyle = {
  fill: "none",
  stroke: "currentColor",
  display: "block",
  flexShrink: 0,
};

function CalendarGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" style={iconSvgStyle} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </svg>
  );
}

function ChevronGlyph({ direction }) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" style={iconSvgStyle} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={direction === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
    </svg>
  );
}

function DobField({ value, onChange, error }) {
  const [open, setOpen] = useState(false);
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
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const handleTextChange = (e) => {
    onChange(e.target.value);
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
    setOpen(false);
  };

  const goPrevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const totalDays = daysInMonth(viewYear, viewMonth);
  const firstWeekday = new Date(viewYear, viewMonth - 1, 1).getDay();
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);

  const selected = parseDateString(value);
  const yearOptions = Array.from({ length: 100 }, (_, i) => todayObj().y - i);

  return (
    <div className="ps-dob-wrap" ref={wrapperRef}>
      <div className="ps-dob-input-box">
        <input
          type="text"
          placeholder="YYYY-MM-DD"
          value={value}
          onChange={handleTextChange}
          onBlur={handleTextBlur}
          onFocus={() => setOpen(true)}
          inputMode="numeric"
          maxLength={10}
        />
        <span className="ps-dob-toggle" onClick={() => setOpen((o) => !o)}>
          <CalendarGlyph />
        </span>
      </div>

      {error && <p className="ps-field-error">{error}</p>}

      {open && (
        <div className="ps-cal-popover">
          <div className="ps-cal-header">
            <button type="button" className="ps-cal-nav" onClick={goPrevMonth}>
              <ChevronGlyph direction="left" />
            </button>

            <select
              className="ps-cal-select"
              value={viewMonth}
              onChange={(e) => setViewMonth(Number(e.target.value))}
            >
              {MONTH_NAMES.map((name, idx) => (
                <option key={name} value={idx + 1}>{name}</option>
              ))}
            </select>

            <select
              className="ps-cal-select"
              value={viewYear}
              onChange={(e) => setViewYear(Number(e.target.value))}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>

            <button type="button" className="ps-cal-nav" onClick={goNextMonth}>
              <ChevronGlyph direction="right" />
            </button>
          </div>

          <div className="ps-cal-weekdays">
            {WEEKDAYS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>

          <div className="ps-cal-grid">
            {cells.map((d, idx) => {
              if (d === null) return <span key={`blank-${idx}`} className="ps-cal-cell-empty" />;
              const isFuture = isFutureDate(viewYear, viewMonth, d);
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
                    "ps-cal-cell" +
                    (isSelected ? " ps-cal-cell--selected" : "") +
                    (isFuture ? " ps-cal-cell--disabled" : "")
                  }
                  onClick={() => selectDay(d)}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function getInitials(name) {
  if (!name) return "?";
  const p = name.trim().split(" ");
  return p.length >= 2
    ? (p[0][0] + p[p.length - 1][0]).toUpperCase()
    : p[0][0].toUpperCase();
}

function syncToLocalStorage(updatedUser) {
  const ts = String(Date.now());
  localStorage.setItem("user",     JSON.stringify(updatedUser));
  localStorage.setItem("avatarTs", ts);
  window.dispatchEvent(new Event("userUpdated"));
}

function Toast({ message, type, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className={`ps-toast ps-toast--${type}`}>
      <span className="ps-toast__icon">
        {type === "success" ? <FiCheck size={14} /> : <FiAlertCircle size={14} />}
      </span>
      {message}
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <label className="ps-toggle">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="ps-toggle__track">
        <span className="ps-toggle__thumb" />
      </span>
    </label>
  );
}

function ImagePreviewModal({ file, onConfirm, onCancel }) {
  const canvasRef   = useRef(null);
  const imgRef      = useRef(null);
  const [zoom,      setZoom]      = useState(1);
  const [rotation,  setRotation]  = useState(0);
  const [dragging,  setDragging]  = useState(false);
  const [offset,    setOffset]    = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [previewSrc, setPreviewSrc] = useState(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreviewSrc(url);
    setZoom(1); setRotation(0); setOffset({ x: 0, y: 0 });
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!previewSrc || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");
    const size   = 260;
    canvas.width  = size;
    canvas.height = size;

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, size, size);

      ctx.save();
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.clip();

      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(0, 0, size, size);

      ctx.translate(size / 2 + offset.x, size / 2 + offset.y);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(zoom, zoom);

      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width  * scale;
      const h = img.height * scale;
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
    };
    img.src = previewSrc;
  }, [previewSrc, zoom, rotation, offset]);

  const onMouseDown = (e) => {
    setDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };
  const onMouseMove = (e) => {
    if (!dragging) return;
    setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };
  const onMouseUp   = () => setDragging(false);

  const onTouchStart = (e) => {
    const t = e.touches[0];
    setDragging(true);
    setDragStart({ x: t.clientX - offset.x, y: t.clientY - offset.y });
  };
  const onTouchMove = (e) => {
    if (!dragging) return;
    const t = e.touches[0];
    setOffset({ x: t.clientX - dragStart.x, y: t.clientY - dragStart.y });
  };

  const handleUpload = () => {
    if (!canvasRef.current) return;
    canvasRef.current.toBlob((blob) => {
      if (!blob) return;
      const ext      = file.name.split(".").pop() || "jpg";
      const adjusted = new File([blob], `cropped.${ext}`, { type: blob.type });
      onConfirm(adjusted);
    }, file.type || "image/jpeg", 0.92);
  };

  return (
    <div className="ps-overlay" onClick={onCancel}>
      <div className="ps-modal ps-img-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ps-modal__head">
          <h3>Adjust Photo</h3>
          <button className="ps-icon-btn" onClick={onCancel}><FiX size={17} /></button>
        </div>

        <div className="ps-modal__body ps-img-body">
          <p className="ps-img-hint">Drag to reposition and scroll to zoom</p>

          <div className="ps-canvas-wrap"
            onMouseDown={onMouseDown} onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}    onMouseLeave={onMouseUp}
            onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onMouseUp}
            style={{ cursor: dragging ? "grabbing" : "grab" }}
          >
            <canvas ref={canvasRef} className="ps-crop-canvas" />
          </div>

          <div className="ps-img-controls">
            <div className="ps-ctrl-group">
              <span className="ps-ctrl-label"><FiZoomOut size={13}/> Zoom</span>
              <input
                type="range" min="0.5" max="3" step="0.05"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="ps-ctrl-slider"
              />
              <span className="ps-ctrl-val">{Math.round(zoom * 100)}%</span>
            </div>
            <button
              className="ps-ctrl-rotate-btn"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              title="Rotate 90°"
            >
              <FiRotateCw size={14} /> Rotate
            </button>
          </div>
        </div>

        <div className="ps-modal__foot">
          <button className="ps-btn ps-btn--ghost" onClick={onCancel}>
            <FiX size={14} /> Cancel
          </button>
          <button className="ps-btn ps-btn--primary" onClick={handleUpload}>
            <FiUploadCloud size={14} /> Upload photo
          </button>
        </div>
      </div>
    </div>
  );
}

function EditModal({ user, onClose, onSave }) {
  const [form, setForm] = useState({
    full_name: user.full_name || "",
    phone:     user.phone     || "",
    dob:       user.dob ? user.dob.split("T")[0] : "",
    gender:    user.gender    || "",
  });
  const [dobError, setDobError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const handleDobChange = (value, errMsg = "") => {
    setForm((p) => ({ ...p, dob: value }));
    setDobError(errMsg);
  };

  const handleSave = async () => {
    if (!form.full_name.trim()) return;
    if (dobError) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <div className="ps-overlay" onClick={onClose}>
      <div className="ps-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ps-modal__head">
          <h3>Edit Profile</h3>
          <button className="ps-icon-btn" onClick={onClose}><FiX size={17} /></button>
        </div>
        <div className="ps-modal__body">
          <div className="ps-field">
            <label>Full name</label>
            <input type="text" value={form.full_name} onChange={set("full_name")} placeholder="Your full name" />
          </div>
          <div className="ps-field">
            <label>Phone number</label>
            <input type="tel" value={form.phone} onChange={set("phone")} placeholder="+977 98XXXXXXXX" />
          </div>
          <div className="ps-field">
            <label>Date of birth</label>
            <DobField value={form.dob} onChange={handleDobChange} error={dobError} />
          </div>
          <div className="ps-field">
            <label>Gender</label>
            <select value={form.gender} onChange={set("gender")}>
              <option value="">— Select gender —</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
              <option value="Prefer not to say">Prefer not to say</option>
            </select>
          </div>
        </div>
        <div className="ps-modal__foot">
          <button className="ps-btn ps-btn--ghost" onClick={onClose}>Cancel</button>
          <button
            className="ps-btn ps-btn--primary"
            onClick={handleSave}
            disabled={saving || !form.full_name.trim() || !!dobError}
          >
            {saving ? <span className="ps-spin" /> : <FiSave size={14} />}
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PasswordModal({ userId, onClose, onToast }) {
  const [form,    setForm]    = useState({ current: "", next: "", confirm: "" });
  const [show,    setShow]    = useState({ current: false, next: false, confirm: false });
  const [loading, setLoading] = useState(false);

  const set        = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const toggleShow = (k) => setShow((p) => ({ ...p, [k]: !p[k] }));

  const isStrong = form.next.length >= 6;
  const isMatch  = form.next && form.next === form.confirm;

  const handleSave = async () => {
    if (!form.current.trim())       return onToast("Enter your current password", "error");
    if (!isStrong)                  return onToast("New password must be at least 6 characters", "error");
    if (!isMatch)                   return onToast("Passwords do not match", "error");
    if (form.current === form.next) return onToast("New password must differ from current", "error");

    setLoading(true);
    try {
      await axios.put(`${API}/profile/${userId}/password`, {
        current_password: form.current,
        new_password:     form.next,
      });
      onToast("Password updated successfully", "success");
      onClose();
    } catch (err) {
      onToast(err?.response?.data?.message || "Current password is incorrect", "error");
    } finally {
      setLoading(false);
    }
  };

  const fields = [
    { label: "Current password", key: "current", hint: "Enter existing password" },
    { label: "New password",     key: "next",    hint: "At least 6 characters"   },
    { label: "Confirm password", key: "confirm", hint: "Re-enter new password"    },
  ];

  return (
    <div className="ps-overlay" onClick={onClose}>
      <div className="ps-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ps-modal__head">
          <h3>Change Password</h3>
          <button className="ps-icon-btn" onClick={onClose}><FiX size={17} /></button>
        </div>
        <div className="ps-modal__body">
          {fields.map(({ label, key, hint }) => (
            <div className="ps-field ps-field--pw" key={key}>
              <label>{label}</label>
              <div className="ps-pw-wrap">
                <input
                  type={show[key] ? "text" : "password"}
                  value={form[key]}
                  onChange={set(key)}
                  placeholder={hint}
                  autoComplete="new-password"
                />
                <button className="ps-eye" type="button" onClick={() => toggleShow(key)}>
                  {show[key] ? <FiEyeOff size={15} /> : <FiEye size={15} />}
                </button>
              </div>
            </div>
          ))}
          {form.next.length > 0 && (
            <div className={`ps-hint ${isStrong ? "ps-hint--ok" : "ps-hint--warn"}`}>
              {isStrong ? <FiCheck size={12} /> : <FiAlertCircle size={12} />}
              {isStrong ? "Password length is good" : `${6 - form.next.length} more character(s) needed`}
            </div>
          )}
          {form.next && form.confirm && (
            <div className={`ps-hint ${isMatch ? "ps-hint--ok" : "ps-hint--warn"}`}>
              {isMatch ? <FiCheck size={12} /> : <FiAlertCircle size={12} />}
              {isMatch ? "Passwords match" : "Passwords do not match"}
            </div>
          )}
        </div>
        <div className="ps-modal__foot">
          <button className="ps-btn ps-btn--ghost" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="ps-btn ps-btn--primary" onClick={handleSave} disabled={loading}>
            {loading ? <span className="ps-spin" /> : <FiLock size={14} />}
            {loading ? "Updating…" : "Update password"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileTab({ user, setUser, onToast }) {
  const [showEdit,      setShowEdit]      = useState(false);
  const [showPw,        setShowPw]        = useState(false);
  const [imgLoading,    setImgLoading]    = useState(false);
  const [imgError,      setImgError]      = useState(false);
  const [pendingFile,   setPendingFile]   = useState(null);
  const fileRef = useRef(null);

  const [avatarTs, setAvatarTs] = useState(
    () => localStorage.getItem("avatarTs") || String(Date.now())
  );

  const avatarUrl = user.profileimg
    ? `${API}/uploads/${user.profileimg}?t=${avatarTs}`
    : null;

  const handleFileSelected = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file.type)) {
      onToast("Only JPG, PNG, or WEBP allowed", "error");
      e.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      onToast("Image must be under 5 MB", "error");
      e.target.value = "";
      return;
    }

    setPendingFile(file);
    e.target.value = "";
  };

  const handleConfirmUpload = async (adjustedFile) => {
    setPendingFile(null);
    setImgLoading(true);

    try {
      const fd = new FormData();
      fd.append("image", adjustedFile);

      const res = await axios.post(`${API}/profile/${user.id}/image`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const serverUser = res.data.user;
      if (serverUser) {
        setUser(serverUser);
        syncToLocalStorage(serverUser);
      } else {
        const fallback = { ...user, profileimg: res.data.profileimg };
        setUser(fallback);
        syncToLocalStorage(fallback);
      }

      const ts = String(Date.now());
      setAvatarTs(ts);
      setImgError(false);
      onToast("Profile photo updated", "success");

    } catch (err) {
      console.error("Image upload error:", err?.response?.data || err.message);
      onToast(err?.response?.data?.message || "Upload failed", "error");
    } finally {
      setImgLoading(false);
    }
  };

  const handleCancelUpload = () => setPendingFile(null);

  const handleSave = async (form) => {
    try {
      const res        = await axios.put(`${API}/profile/${user.id}`, form);
      const serverUser = res.data.user;
      const updated    = serverUser || { ...user, ...form };

      setUser(updated);
      syncToLocalStorage(updated);
      onToast("Profile updated", "success");
      setShowEdit(false);
    } catch (err) {
      onToast(err?.response?.data?.message || "Failed to update profile", "error");
    }
  };

  const roleColor = {
    admin:   "#2563eb",
    teacher: "#0ea5e9",
    student: "#10b981",
  }[(user.role || "").toLowerCase()] || "#6b7280";

  const infoRows = [
    { icon: <FiUser size={15} />,      label: "Full name",    value: user.full_name  || "—" },
    { icon: <FiMail size={15} />,      label: "Email",        value: user.email      || "—" },
    { icon: <FiPhone size={15} />,     label: "Phone",        value: user.phone      || "—" },
    { icon: <FiUsers size={15} />,     label: "Gender",       value: user.gender     || "—" },
    {
      icon:  <FiCalendar size={15} />,
      label: "Date of birth",
      value: user.dob
        ? new Date(user.dob).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
        : "—",
    },
    { icon: <FiBook size={15} />,      label: "Department",   value: user.department || "—" },
    { icon: <FiBriefcase size={15} />, label: "Role",         value: user.role       || "—" },
    {
      icon:  <FiCalendar size={15} />,
      label: "Member since",
      value: user.created_at
        ? new Date(user.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
        : "—",
    },
  ];

  return (
    <>
      <div className="ps-card">
        <div className="ps-hero">
          <div className="ps-avatar-wrap">
            {!imgError && avatarUrl ? (
              <img
                className={`ps-avatar ${imgLoading ? "ps-avatar--fade" : ""}`}
                src={avatarUrl}
                alt={user.full_name || "Profile"}
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="ps-avatar ps-avatar--initials" style={{ background: roleColor }}>
                {getInitials(user.full_name)}
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              style={{ display: "none" }}
              onChange={handleFileSelected}
            />
            <button
              className="ps-cam-btn"
              onClick={() => fileRef.current?.click()}
              title="Change photo"
              disabled={imgLoading}
              aria-label="Upload profile photo"
            >
              {imgLoading ? <span className="ps-spin ps-spin--sm" /> : <FiCamera size={12} />}
            </button>
          </div>

          <div className="ps-hero__info">
            <p className="ps-hero__name">{user.full_name || "User"}</p>
            <span className={`ps-badge ps-badge--${(user.role || "").toLowerCase()}`}>
              {user.role}
            </span>
            <p className="ps-hero__email">{user.email}</p>
          </div>
        </div>

        <div className="ps-divider" />

        <div className="ps-info-grid">
          {infoRows.map(({ icon, label, value }) => (
            <div className="ps-info-row" key={label}>
              <span className="ps-info-icon">{icon}</span>
              <div>
                <p className="ps-info-label">{label}</p>
                <p className="ps-info-value">{value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="ps-card-foot">
          <button className="ps-btn ps-btn--primary" onClick={() => setShowEdit(true)}>
            <FiEdit2 size={14} /> Edit profile
          </button>
          <button className="ps-btn ps-btn--outline" onClick={() => setShowPw(true)}>
            <FiLock size={14} /> Change password
          </button>
        </div>
      </div>

      {pendingFile && (
        <ImagePreviewModal
          file={pendingFile}
          onConfirm={handleConfirmUpload}
          onCancel={handleCancelUpload}
        />
      )}

      {showEdit && (
        <EditModal user={user} onClose={() => setShowEdit(false)} onSave={handleSave} />
      )}
      {showPw && (
        <PasswordModal userId={user.id} onClose={() => setShowPw(false)} onToast={onToast} />
      )}
    </>
  );
}

function SettingsTab({ onToast }) {
  const [darkMode,     setDarkMode]     = useState(localStorage.getItem("theme") === "dark");
  const [notifEnabled, setNotifEnabled] = useState(localStorage.getItem("notifEnabled") !== "false");
  const [emailNotif,   setEmailNotif]   = useState(localStorage.getItem("emailNotif") === "true");
  const [language,     setLanguage]     = useState(localStorage.getItem("lang") || "en");
  const [autoLogout,   setAutoLogout]   = useState(localStorage.getItem("autoLogout") !== "false");

  const applyTheme = (dark) => {
    setDarkMode(dark);
    document.body.classList.toggle("darkMode", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
    onToast(dark ? "Dark mode enabled" : "Light mode enabled", "success");
  };

  const save = (key, val, msg) => {
    localStorage.setItem(key, val);
    onToast(msg, "success");
  };

  return (
    <>
      <div className="ps-card">
        <div className="ps-sec-head">
          <span className="ps-sec-icon"><FiSun size={15} /></span>
          <h3>Appearance</h3>
        </div>
        <div className="ps-setting-row">
          <div className="ps-setting-info">
            <p className="ps-setting-label">Theme</p>
            <p className="ps-setting-desc">Switch between light and dark interface</p>
          </div>
          <div className="ps-theme-btns">
            <button className={`ps-theme-btn ${!darkMode ? "ps-theme-btn--on" : ""}`} onClick={() => applyTheme(false)}>
              <FiSun size={13} /> Light
            </button>
            <button className={`ps-theme-btn ${darkMode ? "ps-theme-btn--on" : ""}`} onClick={() => applyTheme(true)}>
              <FiMoon size={13} /> Dark
            </button>
          </div>
        </div>
        <div className="ps-setting-row">
          <div className="ps-setting-info">
            <p className="ps-setting-label">Language</p>
            <p className="ps-setting-desc">Preferred display language</p>
          </div>
          <select className="ps-select" value={language} onChange={(e) => { setLanguage(e.target.value); save("lang", e.target.value, "Language saved"); }}>
            <option value="en">🇺🇸 English</option>
            <option value="ne">🇳🇵 Nepali</option>
            <option value="hi">🇮🇳 Hindi</option>
          </select>
        </div>
      </div>

      <div className="ps-card">
        <div className="ps-sec-head">
          <span className="ps-sec-icon"><FiBell size={15} /></span>
          <h3>Notifications</h3>
        </div>
        <div className="ps-setting-row">
          <div className="ps-setting-info">
            <p className="ps-setting-label">In-app notifications</p>
            <p className="ps-setting-desc">Events, exams, and results</p>
          </div>
          <Toggle checked={notifEnabled} onChange={() => { const v = !notifEnabled; setNotifEnabled(v); save("notifEnabled", String(v), v ? "Notifications on" : "Notifications off"); }} />
        </div>
        <div className="ps-setting-row">
          <div className="ps-setting-info">
            <p className="ps-setting-label">Email notifications</p>
            <p className="ps-setting-desc">Important updates via email</p>
          </div>
          <Toggle checked={emailNotif} onChange={() => { const v = !emailNotif; setEmailNotif(v); save("emailNotif", String(v), v ? "Email notifications on" : "Email notifications off"); }} />
        </div>
      </div>

      <div className="ps-card">
        <div className="ps-sec-head">
          <span className="ps-sec-icon"><FiShield size={15} /></span>
          <h3>Security</h3>
        </div>
        <div className="ps-setting-row">
          <div className="ps-setting-info">
            <p className="ps-setting-label">Auto logout</p>
            <p className="ps-setting-desc">Sign out after 30 min of inactivity</p>
          </div>
          <Toggle checked={autoLogout} onChange={() => { const v = !autoLogout; setAutoLogout(v); save("autoLogout", String(v), v ? "Auto logout enabled" : "Auto logout disabled"); }} />
        </div>
        <div className="ps-setting-row">
          <div className="ps-setting-info">
            <p className="ps-setting-label">Active sessions</p>
            <p className="ps-setting-desc">Devices where you are logged in</p>
          </div>
          <button className="ps-btn ps-btn--outline ps-btn--sm">
            <FiGlobe size={13} /> View sessions
          </button>
        </div>
      </div>
    </>
  );
}

export default function ProfileSetting() {
  const location = useLocation();
  const tab = location.pathname.endsWith("settings") ? "settings" : "profile";

  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast,   setToast]   = useState(null);

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("user") || "null");
    if (!stored?.id) { setLoading(false); return; }

    axios.get(`${API}/profile/${stored.id}`)
      .then((res) => {
        const serverUser = res.data;
        setUser(serverUser);
        syncToLocalStorage(serverUser);
        setLoading(false);
      })
      .catch(() => {
        setUser(stored);
        setLoading(false);
      });
  }, []);

  const showToast = (message, type = "success") => setToast({ message, type });

  if (loading) return (
    <div className="ps-page ps-page--center">
      <div className="ps-spin ps-spin--lg" />
      <p className="ps-loading-txt">Loading profile…</p>
    </div>
  );

  if (!user) return (
    <div className="ps-page ps-page--center">
      <p className="ps-loading-txt">User not found. Please log in again.</p>
    </div>
  );

  return (
    <div className="ps-page">
      <div className="ps-content">
        {tab === "profile"
          ? <ProfileTab user={user} setUser={setUser} onToast={showToast} />
          : <SettingsTab onToast={showToast} />}
      </div>
      {toast && (
        <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />
      )}
    </div>
  );
}