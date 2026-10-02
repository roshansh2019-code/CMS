import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Bell,
  User,
  FileText,
  X 
} from "lucide-react";

import "./slideBar.css";

function StudentSlideBar({ sidebarOpen, setSidebarOpen }) {
  
  const user = JSON.parse(localStorage.getItem("user") || "null");
  const studentName = user?.full_name || "Student Profile";
  const handleNavigationClick = () => {
    if (window.innerWidth <= 768) {
      setSidebarOpen(false);
    }
  };

  return (
    <>
  
      <div 
        className={`side_backdrop ${sidebarOpen ? "backdrop_show" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      <div className={`side_firstRow ${sidebarOpen ? "side_show" : "side_hide"}`}>
        <div className="side_sidebar">

          <div className="side_header_wrapper">
            <div className="side_logo">
              <span>College System</span>
            </div>
            
            <button 
              type="button"
              className="side_closeBtn" 
              onClick={() => setSidebarOpen(false)}
              aria-label="Close Sidebar"
            >
              <X size={20} />
            </button>
          </div>

          <div className="side_menu">
            <ul>
              <li className="side_list">
                <NavLink 
                  to="/student" 
                  end 
                  className={({ isActive }) => isActive ? "side_active" : "side_link"} 
                  onClick={handleNavigationClick}
                >
                  <LayoutDashboard size={18} />
                  <span>Home</span>
                </NavLink>
              </li>

              <li className="side_list">
                <NavLink 
                  to="/student/result" 
                  className={({ isActive }) => isActive ? "side_active" : "side_link"} 
                  onClick={handleNavigationClick}
                >
                  <FileText size={18} />
                  <span>Result View</span>
                </NavLink>
              </li>
      
              <li className="side_list">
                <NavLink 
                  to="/student/notice" 
                  className={({ isActive }) => isActive ? "side_active" : "side_link"} 
                  onClick={handleNavigationClick}
                >
                  <Bell size={18} />
                  <span>Notice</span>
                </NavLink>
              </li>
            </ul>
          </div>
        </div>
        
        <div className="side_userProfileBtn">
          <User size={18} />
          <span className="side_profileName">
            {studentName}
          </span>
        </div>
      </div>
    </>
  );
}

export default StudentSlideBar;