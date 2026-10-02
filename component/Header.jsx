import {
  Component,
  useState,
  useEffect,
  useRef,
} from "react";

import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";

import axios from "axios";

import "./header.css";
import "./noticeDisplay.css";

import {
  Search,
  Bell,
  Menu,
  Settings,
  LogOut,
  UserCircle,
  Moon,
  Sun,
  X,
  CalendarDays,
  BookOpen,
  Award,
  Clock,
  Inbox,
  AlertCircle,
  BotMessageSquare,
} from "lucide-react";

const ALL_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/* ---------- response normalizer ----------
   The API can return a plain array, a wrapped payload ({ data: [...] }),
   an error object, or even an HTML string. Always end up with an array. */
const toArray = (d) => {
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.data)) return d.data;
  if (Array.isArray(d?.entries)) return d.entries;
  if (Array.isArray(d?.schedule)) return d.schedule;
  if (Array.isArray(d?.schedules)) return d.schedules;
  if (Array.isArray(d?.rows)) return d.rows;
  if (Array.isArray(d?.result)) return d.result;
  return [];
};

/* ---------- department / semester matching ----------
   users.department stores the department NAME ("Bachelor in Computer Application"),
   notices and schedules store the department CODE ("BCA").
   resolveDeptCode() looks the code up in the departments table. */
const normCode = (v) => String(v ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

const normPeriod = (v) => {
  const m = String(v ?? "").match(/\d+/);
  return m ? String(parseInt(m[0], 10)) : "";
};

const resolveDeptCode = (user, departments) => {
  const raw = user?.department ?? user?.department_code ?? user?.dept ?? "";
  const n = normCode(raw);
  const d = toArray(departments).find(
    (x) =>
      normCode(x.department_code) === n ||
      normCode(x.department_name) === n ||
      (n && normCode(x.department_name).includes(n)) ||
      (n && n.includes(normCode(x.department_name)))
  );
  return d ? d.department_code : raw;
};

const deptMatches = (userCode, noticeDept) => {
  const u = normCode(userCode);
  const n = normCode(noticeDept);
  return !!u && !!n && (u === n || n.startsWith(u) || u.startsWith(n));
};

const isGradeValue = (value) => ["11", "12"].includes(String(value ?? "").trim());
const periodLabel = (value) =>
  isGradeValue(value) ? `Grade ${value}` : `Semester ${value}`;

/* ---------- schedule helpers ---------- */
const toMin = (t) => {
  if (!t) return NaN;
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + m;
};

const fmtTime = (t) => {
  if (!t) return "";
  const [h, m] = String(t).split(":").map(Number);
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

/* ---------- error boundary so one bad notice cannot blank the app ---------- */
class NoticeBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    console.error("Notice render error:", error);
  }
  render() {
    return this.state.failed ? (
      <div className="hdr_msgEmpty">
        <AlertCircle size={14} />
        Unable to display this notice.
      </div>
    ) : (
      this.props.children
    );
  }
}

function HdrTodayStrip({ entries }) {
  const list = toArray(entries);
  const now = new Date();
  const today = ALL_DAYS[now.getDay()];
  const mins = now.getHours() * 60 + now.getMinutes();
  const todays = list
    .filter((e) => e.day_of_week === today && e.entry_type === "Class")
    .sort((a, b) => toMin(a.start_time) - toMin(b.start_time));
  const current = todays.find((e) => toMin(e.start_time) <= mins && mins < toMin(e.end_time));
  const next = todays.find((e) => toMin(e.start_time) > mins);

  const line = (e) =>
    `${e.subject_name} · ${fmtTime(e.start_time)} - ${fmtTime(e.end_time)}` +
    (e.room ? ` · Room ${e.room}` : "") +
    (e.department_code ? ` · ${e.department_code} ${e.semester_year}` : "");

  return (
    <div className="hdr_schToday">
      <strong>Today · {today}</strong>
      {todays.length === 0 ? (
        <p>No classes scheduled today.</p>
      ) : (
        <>
          <p><span className="hdr_schPill hdr_schPill--now">Now</span>{current ? line(current) : "No class in progress"}</p>
          <p><span className="hdr_schPill hdr_schPill--next">Next</span>{next ? line(next) : "No more classes today"}</p>
        </>
      )}
    </div>
  );
}

function HdrScheduleGrid({ entries: rawEntries, showClass }) {
  const entries = toArray(rawEntries);
  const { slots, days } = buildGrid(entries);
  const today = ALL_DAYS[new Date().getDay()];

  if (!entries.length)
    return (
      <div className="hdr_msgEmpty">
        <AlertCircle size={14} />
        No time schedule has been published yet.
      </div>
    );

  return (
    <div className="hdr_schWrap">
      <table className="hdr_schTable">
        <thead>
          <tr>
            <th>Time</th>
            {days.map((d) => (
              <th key={d} className={d === today ? "hdr_schToday--head" : ""}>{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slots.map((s) => (
            <tr key={`${s.start}-${s.end}`}>
              <td className="hdr_schTime">{fmtTime(s.start)} - {fmtTime(s.end)}</td>
              {s.isBreak ? (
                <td colSpan={days.length} className="hdr_schBreak">{s.label}</td>
              ) : (
                days.map((d) => {
                  const e = findEntry(entries, d, s);
                  return (
                    <td key={d} className={d === today ? "hdr_schTodayCol" : ""}>
                      {e ? (
                        <div className="hdr_schCell">
                          <strong>{e.subject_name}</strong>
                          {showClass ? (
                            <span>{e.department_code} · {periodLabel(e.semester_year)}</span>
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

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : parts[0][0].toUpperCase();
}

function Header({ sidebarOpen, setSidebarOpen, collapsed }) {
  // const API = "http://127.0.0.1:5000";
  const API = `http://${window.location.hostname}:5000`;

  const navigate = useNavigate();

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [darkMode, setDarkMode] = useState(
    localStorage.getItem("theme") === "dark"
  );
  const profileRef = useRef(null);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [notifications,  setNotifications]  = useState([]);
  const [notifLoading,   setNotifLoading]   = useState(false);
  const [notifSearch,    setNotifSearch]    = useState("");
  const notifRef = useRef(null);
  const [user, setUser] = useState(() =>
    JSON.parse(localStorage.getItem("user") || "null")
  );
  const [imgError, setImgError] = useState(false);
  const [avatarTs, setAvatarTs] = useState(
    () => localStorage.getItem("avatarTs") || String(Date.now())
  );

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("user") || "null");
    if (!stored?.id) return;
    axios.get(`${API}/profile/${stored.id}`)
      .then((res) => {
        const serverUser = res.data;
        if (!serverUser?.id) return;
        localStorage.setItem("user", JSON.stringify(serverUser));
        const prevImg = stored.profileimg || "";
        const newImg  = serverUser.profileimg || "";
        const ts = newImg !== prevImg
          ? String(Date.now())
          : (localStorage.getItem("avatarTs") || String(Date.now()));
        localStorage.setItem("avatarTs", ts);
        setUser(serverUser);
        setAvatarTs(ts);
        setImgError(false);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const syncFromStorage = () => {
      const updated = JSON.parse(localStorage.getItem("user") || "null");
      const ts      = localStorage.getItem("avatarTs") || String(Date.now());
      if (updated) { setUser(updated); setImgError(false); setAvatarTs(ts); }
    };
    window.addEventListener("userUpdated", syncFromStorage);
    const handleStorage = (e) => {
      if (e.key === "user" || e.key === "avatarTs") syncFromStorage();
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("userUpdated", syncFromStorage);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const avatarUrl = user?.profileimg
    ? `${API}/uploads/${user.profileimg}?t=${avatarTs}`
    : null;

  const userRole            = (user?.role || "").toLowerCase();
  const canSearch           = userRole === "admin" || userRole === "teacher";
  const canSeePublicNotices = user && (user.role === "student" || user.role === "teacher");

  const userKey          = user?.id ?? user?.email ?? user?.roll ?? user?.employeeId ?? "guest";
  const READ_NOTICES_KEY = `readNoticeIds_${userKey}`;

  const getBasePath = () => {
    const parts = window.location.pathname.split("/").filter(Boolean);
    return parts.length > 0 ? `/${parts[0]}` : "";
  };

  const [readIds, setReadIds] = useState(() => {
    try {
      const stored = localStorage.getItem(READ_NOTICES_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  useEffect(() => {
    try {
      const stored = localStorage.getItem(READ_NOTICES_KEY);
      setReadIds(stored ? new Set(JSON.parse(stored)) : new Set());
    } catch { setReadIds(new Set()); }
  }, [READ_NOTICES_KEY]);

  const saveReadIds = (idsSet) => {
    setReadIds(new Set(idsSet));
    try { localStorage.setItem(READ_NOTICES_KEY, JSON.stringify([...idsSet])); } catch {}
  };

  const [selectedNotice, setSelectedNotice] = useState(null);
  const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length;

  const [searchQuery,       setSearchQuery]       = useState("");
  const [searchResults,     setSearchResults]     = useState([]);
  const [searchLoading,     setSearchLoading]     = useState(false);
  const [searchOpen,        setSearchOpen]        = useState(false);
  const [searchFocused,     setSearchFocused]     = useState(false);
  const [activeSearchIndex, setActiveSearchIndex] = useState(-1);
  const searchRef      = useRef(null);
  const searchInputRef = useRef(null);
  const searchListRef  = useRef(null);

  const debouncedQuery = useDebounce(searchQuery, 280);

  useEffect(() => {
    if (!canSearch) return;
    const q = debouncedQuery.trim();
    if (!q) {
      setSearchResults([]);
      setSearchOpen(false);
      setActiveSearchIndex(-1);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    (async () => {
      try {
        const res = await axios.get(`${API}/search/users`, {
          params: {
            q,
            caller_role: user?.role       || "",
            caller_dept: user?.department || "",
            caller_roll: user?.roll       || "",
          },
        });
        if (!cancelled) {
          let results = Array.isArray(res.data) ? res.data : [];
          if (userRole === "teacher") {
            results = results.filter((r) => r.role?.toLowerCase() === "student");
          }
          setSearchResults(results);
          setSearchOpen(true);
          setActiveSearchIndex(-1);
        }
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [debouncedQuery, canSearch]);

  useEffect(() => {
    const handler = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setShowProfileMenu(false);
      if (notifRef.current   && !notifRef.current.contains(e.target))   setShowNotifPanel(false);
      if (searchRef.current  && !searchRef.current.contains(e.target)) {
        setSearchOpen(false);
        setSearchFocused(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!localStorage.getItem("user")) navigate("/");
  }, [navigate]);

  useEffect(() => {
    document.body.classList.toggle("darkMode", darkMode);
  }, [darkMode]);

  const handleSearchKeyDown = (e) => {
    if (!searchOpen || searchResults.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSearchIndex((p) => (p < searchResults.length - 1 ? p + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSearchIndex((p) => (p > 0 ? p - 1 : searchResults.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeSearchIndex >= 0 && searchResults[activeSearchIndex])
        handleSearchSelect(searchResults[activeSearchIndex]);
    } else if (e.key === "Escape") {
      setSearchOpen(false);
      setSearchQuery("");
      searchInputRef.current?.blur();
    }
  };

  useEffect(() => {
    if (activeSearchIndex < 0 || !searchListRef.current) return;
    const items = searchListRef.current.querySelectorAll(".header_searchItem");
    items[activeSearchIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeSearchIndex]);

  const getSearchPath = (result) => {
    const rr = (result.role || "").toLowerCase();
    if (userRole === "admin") {
      if (rr === "student") return { path: "/admin/students" };
      if (rr === "teacher") return { path: "/admin/teachers" };
      if (rr === "admin")   return { path: "/admin/admins" };
    }
    if (userRole === "teacher" && rr === "student") return { path: "/teacher/students" };
    return { path: "/" };
  };

  const handleSearchSelect = (result) => {
    setSearchOpen(false);
    setSearchQuery("");
    navigate(getSearchPath(result).path);
  };

  const highlightMatch = (text, query) => {
    if (!text || !query) return text || "";
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="header_searchHighlight">{text.slice(idx, idx + query.length)}</mark>
        {text.slice(idx + query.length)}
      </>
    );
  };

  useEffect(() => {
    if (!canSeePublicNotices) { setNotifications([]); return; }
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 120000);
    return () => clearInterval(interval);
  }, [canSeePublicNotices, userKey]);

  const fetchNotifications = async () => {
    setNotifLoading(true);
    try {
      // For students, ask the server to scope result notices to their own roll
      // (same pattern used by NoticeDisplay.js).
      const resultUrl =
        user && user.role === "student" && user.roll
          ? `${API}/notice/result?roll=${encodeURIComponent(user.roll)}`
          : `${API}/notice/result`;

      const [eventRes, examRes, resultRes, deptRes] = await Promise.all([
        axios.get(`${API}/notice/event`).catch(() => ({ data: [] })),
        axios.get(`${API}/notice/exam`).catch(() => ({ data: [] })),
        axios.get(resultUrl).catch(() => ({ data: [] })),
        axios.get(`${API}/notice/departments`).catch(() => ({ data: [] })),
      ]);

      // "Bachelor in Computer Application" -> "BCA"
      const userDeptCode = resolveDeptCode(user, deptRes.data);

      const events = toArray(eventRes.data)
        .filter((n) => n.is_public === undefined || n.is_public === 1 || n.is_public === true)
        .filter((n) => {
          const audience = String(n.audience || n.target_role || n.visible_to || "all").toLowerCase();
          return audience === "all" || audience === "" || audience === (user?.role || "").toLowerCase();
        })
        .map((n) => ({
          id:       `event-${n.id}`,
          type:     "event",
          title:    n.title || n.notice_type || "Event Notice",
          subtitle: n.notice_type || "Event",
          date:     n.created_at,
          raw:      n,
        }));

      const exams = toArray(examRes.data)
        .filter((n) => n.is_public === undefined || n.is_public === 1 || n.is_public === true)
        .filter((n) => {
          if (!user || user.role !== "student") return false;
          const userSemYear = String(user.semester ?? user.year ?? "");
          return deptMatches(userDeptCode, n.department_code)
            && normPeriod(n.semester_year) === normPeriod(userSemYear);
        })
        .map((n) => ({
          id:       `exam-${n.id}`,
          type:     "exam",
          title:    `${n.department_code || ""} • Semester ${n.semester_year || ""} Exam Schedule`,
          subtitle: n.exam_type || "Exam Schedule",
          date:     n.created_at,
          raw:      n,
        }));

      const results = toArray(resultRes.data)
        .filter((n) => n.is_public === undefined || n.is_public === 1 || n.is_public === true)
        .filter((n) => {
          if (!user || user.role !== "student") return false;

          // A result notice must belong to THIS student's roll number.
          const noticeRoll = n.roll ?? n.student_roll ?? n.raw?.roll;
          if (noticeRoll === undefined || noticeRoll === null || noticeRoll === "") {
            return false;
          }
          if (String(noticeRoll) !== String(user.roll ?? "")) {
            return false;
          }

          const noticeDept = n.department_code || n.department || "";
          if (noticeDept && !deptMatches(userDeptCode, noticeDept)) return false;
          if (n.semester !== undefined && n.semester !== null)
            return String(n.semester) === String(user.semester ?? "");
          if (n.year !== undefined && n.year !== null)
            return String(n.year) === String(user.year ?? "");
          return true;
        })
        .map((n) => ({
          id:       `result-${n.id}`,
          type:     "result",
          title:    `${n.department_code || n.department || ""} ${
            n.semester ? `Semester ${n.semester}` : n.year ? `Year ${n.year}` : ""
          } Result Published`,
          subtitle: n.exam_term || "Result",
          date:     n.created_at || n.published_at,
          raw:      n,
        }));

      // ---------- published time schedules ----------
      let schedules = [];
      try {
        if (user?.role === "student") {
          const schRes = await axios.get(`${API}/schedule/classes`);
          const userPeriod = normPeriod(user.semester ?? user.year ?? user.semester_year);
          schedules = toArray(schRes.data)
            .filter((r) => deptMatches(userDeptCode, r.department_code) && normPeriod(r.semester_year) === userPeriod)
            .map((r) => ({
              // published_at is part of the id, so a re-published schedule shows as unread again
              id:       `schedule-${r.department_code}-${r.semester_year}-${r.published_at || ""}`,
              type:     "schedule",
              title:    `${r.department_code} • ${periodLabel(r.semester_year)} Time Schedule`,
              subtitle: "Time Schedule",
              date:     r.published_at,
              raw:      { ...r, mode: "class" },
            }));
        } else if (user?.role === "teacher") {
          const teacherName = String(user.full_name || user.name || "").trim();
          if (teacherName) {
            const schRes = await axios.get(`${API}/schedule`, { params: { teacher: teacherName } });
            const entries = toArray(schRes.data);
            if (entries.length > 0) {
              const latestTs = Math.max(...entries.map((e) => new Date(e.created_at).getTime() || 0));
              const latest = latestTs ? new Date(latestTs).toISOString() : null;
              schedules = [{
                id:       `schedule-teacher-${latest || entries.length}`,
                type:     "schedule",
                title:    "Your Weekly Teaching Schedule",
                subtitle: "My Schedule",
                date:     latest,
                raw:      { mode: "teacher", teacher: teacherName, entries },
              }];
            }
          }
        }
      } catch (err) {
        console.log("Schedule notification error:", err);
      }

      const combined = [...events, ...exams, ...results, ...schedules].sort((a, b) => {
        const da = a.date ? new Date(a.date).getTime() : 0;
        const db = b.date ? new Date(b.date).getTime() : 0;
        return db - da;
      });

      setNotifications(combined);

      const currentIds = new Set(combined.map((n) => n.id));
      setReadIds((prev) => {
        const pruned = new Set([...prev].filter((id) => currentIds.has(id)));
        try { localStorage.setItem(READ_NOTICES_KEY, JSON.stringify([...pruned])); } catch {}
        return pruned;
      });
    } catch (err) {
      console.log("Notification fetch error:", err);
    } finally {
      setNotifLoading(false);
    }
  };

  const formatNotifDate = (dateStr) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const getNotifIcon = (type) => {
    if (type === "exam")     return <BookOpen size={16} />;
    if (type === "result")   return <Award size={16} />;
    if (type === "schedule") return <Clock size={16} />;
    return <CalendarDays size={16} />;
  };

  const filteredNotifications = notifications.filter((n) => {
    if (!notifSearch.trim()) return true;
    const q = notifSearch.trim().toLowerCase();
    return (
      n.title.toLowerCase().includes(q) ||
      (n.subtitle || "").toLowerCase().includes(q) ||
      (n.raw?.description || "").toLowerCase().includes(q) ||
      (n.raw?.department_code || "").toLowerCase().includes(q)
    );
  });

  const handleNotifClick = async (notif) => {
    setShowNotifPanel(false);
    setNotifSearch("");
    if (!readIds.has(notif.id)) {
      const updated = new Set(readIds);
      updated.add(notif.id);
      saveReadIds(updated);
    }

    // a class schedule notification loads its timetable when opened
    if (notif.type === "schedule" && !Array.isArray(notif.raw.entries)) {
      try {
        const res = await axios.get(`${API}/schedule`, {
          params: {
            department_code: notif.raw.department_code,
            semester_year: notif.raw.semester_year,
          },
        });
        // console.log("schedule response:", res.data); // uncomment to debug the API shape
        notif = { ...notif, raw: { ...notif.raw, entries: toArray(res.data) } };
      } catch {
        notif = { ...notif, raw: { ...notif.raw, entries: [] } };
      }
    }
    setSelectedNotice(notif);
  };

  useEffect(() => {
    document.body.style.overflow = selectedNotice ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [selectedNotice]);

  const renderNoticeModalContent = (notif) => {
    if (!notif) return null;
    const { type, raw, title, subtitle, date } = notif;

    return (
      <div className="hdr_msgModal">

        <div className="hdr_msgBotRow">
          <div className={`hdr_msgBotAvatar hdr_msgBotAvatar--${type}`}>
            <BotMessageSquare size={20} />
          </div>
          <div className="hdr_msgBotMeta">
            <span className="hdr_msgBotLabel">Notice Box</span>
            {date && <span className="hdr_msgBotDate">{formatNotifDate(date)}</span>}
          </div>
        </div>

        <div className="hdr_msgBubble">

          <div className="hdr_msgTypeTag">
            <span className={`hdr_msgTag hdr_msgTag--${type}`}>
              {getNotifIcon(type)}
              {subtitle}
            </span>
          </div>

          <p className="hdr_msgTitle">{title}</p>

          {type === "event" && (
            <>
              {raw.image && (
                <div className="hdr_msgImage">
                  <img src={`${API}/uploads/${raw.image}`} alt="Notice Attachment" />
                </div>
              )}
              {raw.description && (
                <p className="hdr_msgDesc">{raw.description}</p>
              )}
            </>
          )}

          {type === "exam" && (
            <>
              <p className="hdr_msgBody">
                Examination schedule for{" "}
                <strong>{raw.department_code}</strong>{" "}
                Department — Semester <strong>{raw.semester_year}</strong> has been officially published.
                Please review carefully and attend on the specified dates.
              </p>

              {raw.image && (
                <div className="hdr_msgImage">
                  <img src={`${API}/uploads/${raw.image}`} alt="Exam Schedule" />
                </div>
              )}

              {Array.isArray(raw.subjects) && raw.subjects.length > 0 ? (
                <div className="hdr_msgTableWrap">
                  <table className="hdr_msgTable">
                    <thead>
                      <tr>
                        <th className="hdr_msgTh hdr_msgTh--sn">SN</th>
                        <th className="hdr_msgTh hdr_msgTh--subject">Subject Name</th>
                        <th className="hdr_msgTh hdr_msgTh--date">Exam Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {raw.subjects.map((s, idx) => (
                        <tr key={s.id || idx}>
                          <td className="hdr_msgTd hdr_msgTd--sn">
                            {String(idx + 1).padStart(2, "0")}
                          </td>
                          <td className="hdr_msgTd hdr_msgTd--subject">
                            {s.subject_name || "—"}
                          </td>
                          <td className="hdr_msgTd hdr_msgTd--date">
                            {s.exam_date ? formatNotifDate(s.exam_date) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="hdr_msgEmpty">
                  <AlertCircle size={14} />
                  No schedule dates specified yet.
                </div>
              )}
            </>
          )}

          {type === "schedule" && (
            <>
              {raw.mode === "teacher" ? (
                <p className="hdr_msgBody">
                  This is the weekly teaching schedule of <strong>{raw.teacher}</strong>.
                  Please be present in the assigned class and room at the scheduled time.
                </p>
              ) : (
                <p className="hdr_msgBody">
                  The class time schedule for <strong>{raw.department_code}</strong> Department —{" "}
                  <strong>{periodLabel(raw.semester_year)}</strong> has been officially published.
                  Please follow it strictly and attend classes at the specified times.
                </p>
              )}
              <HdrTodayStrip entries={raw.entries} />
              <HdrScheduleGrid entries={raw.entries} showClass={raw.mode === "teacher"} />
            </>
          )}

          {type === "result" && (
            <>
              <p className="hdr_msgBody">
                Result for <strong>{raw.department_code || raw.department || ""}</strong>{" "}
                {raw.semester
                  ? <>Semester <strong>{raw.semester}</strong></>
                  : raw.year
                    ? <>Year <strong>{raw.year}</strong></>
                    : ""}
                {raw.exam_term ? <> ({raw.exam_term})</> : ""} has been officially verified and published.
              </p>
              <div className="hdr_msgResultGrid">
                {raw.department_code && (
                  <div className="hdr_msgResultChip">
                    <span className="hdr_msgChipLabel">Department</span>
                    <span className="hdr_msgChipValue">{raw.department_code}</span>
                  </div>
                )}
                {(raw.semester || raw.semester_year) && (
                  <div className="hdr_msgResultChip">
                    <span className="hdr_msgChipLabel">Semester</span>
                    <span className="hdr_msgChipValue">{raw.semester || raw.semester_year}</span>
                  </div>
                )}
                {raw.exam_term && (
                  <div className="hdr_msgResultChip">
                    <span className="hdr_msgChipLabel">Exam Term</span>
                    <span className="hdr_msgChipValue">{raw.exam_term}</span>
                  </div>
                )}
                {raw.roll && (
                  <div className="hdr_msgResultChip">
                    <span className="hdr_msgChipLabel">Roll No.</span>
                    <span className="hdr_msgChipValue">{raw.roll}</span>
                  </div>
                )}
              </div>
              {raw.description && <p className="hdr_msgDesc">{raw.description}</p>}
            </>
          )}

        </div>
      </div>
    );
  };

  const handleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  const handleLogout = async () => {
    if (!window.confirm("Do you want to logout?")) return;
    try { await axios.post(`${API}/logout`); } catch {}
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    localStorage.removeItem("theme");
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("avatarTs");
    sessionStorage.clear();
    document.body.classList.remove("darkMode");
    setShowProfileMenu(false);
    navigate("/");
    window.history.pushState(null, "", "/");
    window.location.reload();
  };

  const headerClass = [
    "headerBar",
    sidebarOpen ? "withSidebar" : "fullWidth",
    sidebarOpen && collapsed ? "collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={headerClass}>

      <div className="header_left">
        <div className="header_menuBtn" onClick={() => setSidebarOpen(!sidebarOpen)}>
          <Menu size={20} />
        </div>
        <div className="header_systemName">CMS Dashboard</div>
      </div>

      {canSearch && (
        <div className="header_searchWrapper" ref={searchRef}>
          <div className={`header_searchBar ${searchFocused ? "header_searchBar--focused" : ""}`}>
            <Search size={15} style={{ flexShrink: 0, opacity: 0.7 }} />
            <input
              ref={searchInputRef}
              type="search"
              placeholder={
                userRole === "teacher"
                  ? "Search students…"
                  : "Search students, teachers, admins…"
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => {
                setSearchFocused(true);
                if (searchResults.length > 0) setSearchOpen(true);
              }}
              onKeyDown={handleSearchKeyDown}
              autoComplete="off"
            />
            {searchQuery && (
              <button
                className="header_searchClearBtn"
                onClick={() => {
                  setSearchQuery("");
                  setSearchResults([]);
                  setSearchOpen(false);
                  searchInputRef.current?.focus();
                }}
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {searchOpen && (
            <div className="header_searchDropdown" role="listbox">
              {searchLoading && (
                <div className="header_searchStatus">
                  <div className="header_searchSkeleton">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="header_skeletonRow">
                        <div className="header_skeletonAvatar" />
                        <div className="header_skeletonLines">
                          <div className="header_skeletonLine header_skeletonLine--wide" />
                          <div className="header_skeletonLine header_skeletonLine--narrow" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!searchLoading && searchResults.length === 0 && (
                <div className="header_searchEmpty">
                  <p>No results for <strong>"{searchQuery}"</strong></p>
                  <span>
                    {userRole === "teacher"
                      ? "Try student name, email, or roll no"
                      : "Try name, email, roll no, or employee ID"}
                  </span>
                </div>
              )}

              {!searchLoading && searchResults.length > 0 && (
                <>
                  <div className="header_searchResultsHeader">
                    {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} found
                  </div>
                  <div className="header_searchList" ref={searchListRef}>
                    {searchResults.map((result, idx) => (
                      <div
                        key={result.id}
                        className={`header_searchItem ${activeSearchIndex === idx ? "header_searchItem--active" : ""}`}
                        role="option"
                        aria-selected={activeSearchIndex === idx}
                        onClick={() => handleSearchSelect(result)}
                        onMouseEnter={() => setActiveSearchIndex(idx)}
                      >
                        <div className={`header_searchAvatar header_searchAvatar--${result.role?.toLowerCase()}`}>
                          {result.full_name?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                        <div className="header_searchInfo">
                          <div className="header_searchName">
                            {highlightMatch(result.full_name, searchQuery)}
                          </div>
                          <div className="header_searchMeta">
                            {result.email && (
                              <span className="header_searchMetaItem">
                                Email: {highlightMatch(result.email, searchQuery)}
                              </span>
                            )}
                            {result.roll && (
                              <span className="header_searchMetaItem">
                                Roll: {highlightMatch(String(result.roll), searchQuery)}
                              </span>
                            )}
                            {result.employee_id && (
                              <span className="header_searchMetaItem">
                                ID: {highlightMatch(String(result.employee_id), searchQuery)}
                              </span>
                            )}
                            {result.department && (
                              <span className="header_searchMetaItem">
                                Dept: {result.department}
                              </span>
                            )}
                            {(result.semester || result.year) && (
                              <span className="header_searchMetaItem">
                                {result.semester ? `Sem ${result.semester}` : `Year ${result.year}`}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className={`header_searchRoleBadge header_searchRoleBadge--${result.role?.toLowerCase()}`}>
                          {result.role}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <div className="header_right">

        {canSeePublicNotices && (
          <div className="header_notifWrapper" ref={notifRef}>
            <div
              className="header_notification"
              onClick={() => setShowNotifPanel((p) => !p)}
              aria-label="Notifications"
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="header_notifBadge">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </div>

            {showNotifPanel && (
              <>
                <div className="header_notifOverlay" onClick={() => setShowNotifPanel(false)} />
                <div className="header_notifPanel">
                  <div className="header_notifPanel__header">
                    <span>Notifications</span>
                    <button
                      className="header_notifPanel__close"
                      onClick={() => setShowNotifPanel(false)}
                      aria-label="Close"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div className="header_notifSearch">
                    <Search size={14} />
                    <input
                      type="search"
                      placeholder="Search notices, exams, results, schedule..."
                      value={notifSearch}
                      onChange={(e) => setNotifSearch(e.target.value)}
                      autoFocus
                    />
                    {notifSearch && (
                      <X
                        size={14}
                        className="header_notifSearch__clear"
                        onClick={() => setNotifSearch("")}
                      />
                    )}
                  </div>

                  <div className="header_notifList">
                    {notifLoading && (
                      <div className="header_notifEmpty"><p>Loading…</p></div>
                    )}
                    {!notifLoading && filteredNotifications.length === 0 && (
                      <div className="header_notifEmpty">
                        <Inbox size={26} />
                        <p>
                          {notifSearch
                            ? "No matching notifications found."
                            : "No public notices available right now."}
                        </p>
                      </div>
                    )}
                    {!notifLoading && filteredNotifications.map((n) => (
                      <div
                        key={n.id}
                        className={`header_notifItem ${!readIds.has(n.id) ? "header_notifItem--unread" : ""}`}
                        onClick={() => handleNotifClick(n)}
                      >
                        <div className={`header_notifIcon header_notifIcon--${n.type}`}>
                          {getNotifIcon(n.type)}
                        </div>
                        <div className="header_notifContent">
                          <p className="header_notifTitle">{n.title}</p>
                          <div className="header_notifMeta">
                            <span className={`header_notifTag header_notifTag--${n.type}`}>{n.subtitle}</span>
                            {n.date && <span className="header_notifDate">{formatNotifDate(n.date)}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <div className="header_profileWrapper" ref={profileRef}>
          <div
            className="header_profile"
            onClick={() => setShowProfileMenu((p) => !p)}
          >
            {!imgError && avatarUrl ? (
              <img
                className="header_profileAvatar"
                src={avatarUrl}
                alt={user?.full_name || "Profile"}
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="header_profileInitials">
                {getInitials(user?.full_name)}
              </div>
            )}
            <span>{user?.full_name || "Admin"}</span>
          </div>

          {showProfileMenu && (
            <div className="header_profileDropdown">
              <div className="header_dropdownAvatar">
                {!imgError && avatarUrl ? (
                  <img
                    className="header_dropdownAvatarImg"
                    src={avatarUrl}
                    alt={user?.full_name || "Profile"}
                    onError={() => setImgError(true)}
                  />
                ) : (
                  <div className="header_dropdownAvatarInitials">
                    {getInitials(user?.full_name)}
                  </div>
                )}
                <div className="header_dropdownAvatarInfo">
                  <p className="header_dropdownName">{user?.full_name || "Admin"}</p>
                  <p className="header_dropdownRole">{user?.role || ""}</p>
                </div>
              </div>

              <div className="header_dropdownDivider" />

              <div
                className="header_dropdownItem"
                onClick={() => {
                  setShowProfileMenu(false);
                  navigate(`${getBasePath()}/profile`);
                }}
              >
                <UserCircle size={16} /><span>Profile</span>
              </div>

              <div
                className="header_dropdownItem"
                onClick={() => {
                  setShowProfileMenu(false);
                  navigate(`${getBasePath()}/settings`);
                }}
              >
                <Settings size={16} /><span>Settings</span>
              </div>

              <div className="header_dropdownItem" onClick={handleTheme}>
                {darkMode ? <Sun size={16} /> : <Moon size={16} />}
                <span>{darkMode ? "Light Mode" : "Dark Mode"}</span>
              </div>

              <div className="header_dropdownItem header_logoutBtn" onClick={handleLogout}>
                <LogOut size={16} /><span>Logout</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedNotice && createPortal(
        <div className="notice-modal-overlay" onClick={() => setSelectedNotice(null)}>
          <div
            className={`hdr_msgModalWrap ${selectedNotice.type === "schedule" ? "hdr_msgModalWrap--wide" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="hdr_msgCloseBtn"
              onClick={() => setSelectedNotice(null)}
              aria-label="Close"
            >
              <X size={16} />
            </button>
            <NoticeBoundary key={selectedNotice.id}>
              {renderNoticeModalContent(selectedNotice)}
            </NoticeBoundary>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default Header;