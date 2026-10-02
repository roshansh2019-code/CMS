import { NavLink } from "react-router-dom";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  LayoutDashboard,
  GraduationCap,
  UserCheck,
  CalendarCheck,
  Bell,
  FileText,
  CreditCard,
  BookOpen,
  X,
  Building2,
  ClipboardList,
  CircleDollarSign,
  UserPlus,
  FileCheck2,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  InfoIcon,
} from "lucide-react";
import "./slideBar.css";

const API = `http://${window.location.hostname}:5000`;

const ADMIN_MENU = [
  { to: "/admin",                   end: true,  icon: <LayoutDashboard size={18} />, label: "Dashboard"           },
  { to: "/admin/students",          icon: <GraduationCap size={18} />,   label: "Student"             },
  { to: "/admin/teachers",          icon: <UserCheck size={18} />,       label: "Teacher"             },
  { to: "/admin/attendance",        icon: <CalendarCheck size={18} />,   label: "Attendance"          },
  { to: "/admin/notice",            icon: <Bell size={18} />,            label: "Notice Board"        },
  { to: "/admin/result",            icon: <FileText size={18} />,        label: "Result Check"        },
  { to: "/admin/fees",              icon: <CreditCard size={18} />,      label: "Fees"                },
  { to: "/admin/department",        icon: <Building2 size={18} />,       label: "Department"          },
  { to: "/admin/subject",           icon: <BookOpen size={18} />,        label: "Subject"             },
  { to: "/admin/attendanceManage",  icon: <ClipboardList size={18} />,   label: "Attendance Manage"   },
  { to: "/admin/adminReg",          icon: <UserPlus size={18} />,        label: "Add Admin User"      },
  { to: "/admin/applicationRecord", icon: <FileCheck2 size={18} />,      label: "Application Record"  },
  { to: "/admin/feedbackRecord",    icon: <MessageSquareText size={18} />, label: "Feedback Record"   },
  { to: "/admin/admissionRecord",    icon: <InfoIcon size={18} />, label: "Admission Record"   },
];

const TEACHER_MENU = [
  { to: "/teacher",            end: true,  icon: <LayoutDashboard size={18} />, label: "Home"           },
  { to: "/teacher/attendance",             icon: <CalendarCheck size={18} />,   label: "Attendance"     },
  { to: "/teacher/tResult",                icon: <FileText size={18} />,        label: "Teacher Result" },
  { to: "/teacher/tnotice",                icon: <Bell size={18} />,            label: "Notice Board"   },
];

const STUDENT_MENU = [
  { to: "/student",             end: true,  icon: <LayoutDashboard size={18} />,  label: "Home"            },
  { to: "/student/result",                  icon: <FileText size={18} />,         label: "Result View"     },
  { to: "/student/notice",                  icon: <Bell size={18} />,             label: "Notice"          },
  { to: "/student/feePayment",              icon: <CircleDollarSign size={18} />, label: "Total Fee Payed" },
];

function getInitials(name) {
  if (!name) return "?";
  const p = name.trim().split(" ");
  return p.length >= 2
    ? (p[0][0] + p[p.length - 1][0]).toUpperCase()
    : p[0][0].toUpperCase();
}

function SlideBar({ sidebarOpen, setSidebarOpen, collapsed: collapsedProp, onCollapseChange }) {
  const [user,     setUser]     = useState(() => JSON.parse(localStorage.getItem("user") || "null"));
  const [avatarTs, setAvatarTs] = useState(() => localStorage.getItem("avatarTs") || String(Date.now()));
  const [imgError, setImgError] = useState(false);

  const isControlled = collapsedProp !== undefined;
  const [internalCollapsed, setInternalCollapsed] = useState(
    () => localStorage.getItem("sidebarCollapsed") === "true"
  );
  const collapsed = isControlled ? collapsedProp : internalCollapsed;

  const prevProfileImgRef = useRef(user?.profileimg || "");
  const pollIntervalRef   = useRef(null);

  const role     = (user?.role || "").toLowerCase();
  const userName = user?.full_name || "Profile";
  const userRole = user?.role || "";

  const syncFromStorage = useCallback(() => {
    const updated = JSON.parse(localStorage.getItem("user") || "null");
    const ts      = localStorage.getItem("avatarTs") || String(Date.now());
    if (!updated) return;

    const newImg  = updated.profileimg || "";
    const prevImg = prevProfileImgRef.current;

    if (newImg !== prevImg) {
      prevProfileImgRef.current = newImg;
      setAvatarTs(ts);
      setImgError(false);
    }

    setUser(updated);
  }, []);

  useEffect(() => {
    pollIntervalRef.current = setInterval(() => {
      const stored   = JSON.parse(localStorage.getItem("user") || "null");
      const storedTs = localStorage.getItem("avatarTs") || "";

      if (!stored) return;

      const newImg  = stored.profileimg || "";
      const prevImg = prevProfileImgRef.current;

      if (newImg !== prevImg || storedTs !== avatarTs) {
        prevProfileImgRef.current = newImg;
        setUser(stored);
        setAvatarTs(storedTs || String(Date.now()));
        setImgError(false);
      }
    }, 1500);

    return () => clearInterval(pollIntervalRef.current);
  }, [avatarTs]);

  useEffect(() => {
    window.addEventListener("userUpdated", syncFromStorage);
    window.addEventListener("storage",     handleStorageEvent);

    return () => {
      window.removeEventListener("userUpdated", syncFromStorage);
      window.removeEventListener("storage",     handleStorageEvent);
    };
  }, [syncFromStorage]);

  function handleStorageEvent(e) {
    if (e.key === "user" || e.key === "avatarTs") syncFromStorage();
  }

  // Tell the parent layout the initial collapsed value on mount, in case
  // it was restored from localStorage before the parent knew about it.
  useEffect(() => {
    if (isControlled) return;
    onCollapseChange?.(internalCollapsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    localStorage.setItem("sidebarCollapsed", String(next));
    if (isControlled) {
      onCollapseChange?.(next);
    } else {
      setInternalCollapsed(next);
      onCollapseChange?.(next);
    }
  }

  const avatarUrl = user?.profileimg
    ? `${API}/uploads/${user.profileimg}?t=${avatarTs}`
    : null;

  const roleColor = {
    admin:   "#2563eb",
    teacher: "#0ea5e9",
    student: "#10b981",
  }[role] || "#6b7280";

  const menuItems =
    role === "admin"   ? ADMIN_MENU   :
    role === "teacher" ? TEACHER_MENU :
    role === "student" ? STUDENT_MENU : [];

  const closeOnMobile = () => {
    if (window.innerWidth <= 768) setSidebarOpen(false);
  };

  return (
    <>
      <div
        className={`side_backdrop ${sidebarOpen ? "backdrop_show" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      <div
        className={`side_firstRow ${sidebarOpen ? "side_show" : "side_hide"} ${collapsed ? "side_collapsed" : ""}`}
      >

        <div className="side_sidebar">
          <div className="side_header_wrapper">
            {!collapsed && (
              <div className="side_logo">
                <span>College System</span>
              </div>
            )}

            <button
              type="button"
              className="side_toggleBtn"
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
            </button>

            <button
              type="button"
              className="side_closeBtn"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close Sidebar"
            >
              <X size={20} />
            </button>
          </div>

          <nav className="side_menu">
            <ul>
              {menuItems.map((item) => (
                <li key={item.to} className="side_list">
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      isActive ? "side_active" : "side_link"
                    }
                    onClick={closeOnMobile}
                  >
                    <span className="side_iconWrap" data-tip={item.label}>
                      {item.icon}
                    </span>
                    <span className="side_linkLabel">{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="side_userProfileBtn">
          <div className="side_avatarWrap" data-tip={userName}>
            {!imgError && avatarUrl ? (
              <img
                key={avatarUrl}
                className="side_avatarImg"
                src={avatarUrl}
                alt={userName}
                onError={() => setImgError(true)}
              />
            ) : (
              <div
                className="side_avatarInitials"
                style={{ background: roleColor }}
              >
                {getInitials(userName)}
              </div>
            )}
            <span className="side_onlineDot" />
          </div>

          <div className="side_profileInfo">
            <span className="side_profileName">{userName}</span>
            <span className="side_profileRole">{userRole}</span>
          </div>
        </div>

      </div>
    </>
  );
}

export default SlideBar;