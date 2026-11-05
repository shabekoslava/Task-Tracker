import Icon from "../Icon/Icon";
import Avatar from "../Avatar/Avatar";
import "./Sidebar.css";

const NAV = [
  { id: "tasks", label: "Мои задачи", icon: "tasks" },
  { id: "projects", label: "Проекты", icon: "folder" },
  { id: "messenger", label: "Мессенджер", icon: "chat" },
  { id: "invites", label: "Приглашения", icon: "mail" },
];

export function BrandMark({ size = 30 }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6} fill="none" aria-hidden="true">
        <rect x="3" y="4" width="5" height="16" rx="1.5" fill="currentColor" />
        <rect x="10" y="4" width="5" height="10" rx="1.5" fill="currentColor" opacity="0.7" />
        <rect x="17" y="4" width="4" height="6" rx="1.5" fill="currentColor" opacity="0.45" />
      </svg>
    </span>
  );
}

export default function Sidebar({
  collapsed,
  onToggle,
  currentTab,
  onNavigate,
  projects,
  onOpenProject,
  currentUser,
  pendingInvites,
}) {
  const item = (active, label, icon, onClick, extra) => (
    <button
      className={`nav-item ${active ? "active" : ""}`}
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-label={label}
    >
      {icon}
      {!collapsed && <span className="nav-label">{label}</span>}
      {extra}
    </button>
  );

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-top">
        {!collapsed && (
          <div className="brand">
            <BrandMark />
            <span className="brand-name">Task Tracker</span>
          </div>
        )}
        <button
          className="btn btn-ghost btn-icon btn-sm"
          onClick={onToggle}
          aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
        >
          <Icon name="sidebar" size={17} />
        </button>
      </div>

      <nav className="sidebar-nav">
        {NAV.map(({ id, label, icon }) =>
          item(
            currentTab === id,
            label,
            <Icon name={icon} />,
            () => onNavigate(id),
            id === "invites" && pendingInvites > 0 && (
              <span className="nav-count">{pendingInvites}</span>
            ),
          ),
        )}

        {projects.length > 0 && (
          <>
            {!collapsed && <div className="nav-section">Мои проекты</div>}
            {collapsed && <hr className="divider nav-divider" />}
            <div className="nav-projects">
              {projects.map((project) =>
                item(
                  currentTab === `project-${project.id}`,
                  project.name,
                  <span className="project-dot">{project.name.charAt(0).toUpperCase()}</span>,
                  () => onOpenProject(project.id, "board"),
                ),
              )}
            </div>
          </>
        )}
      </nav>

      <div className="sidebar-bottom">
        {item(
          currentTab === "profile",
          currentUser.name,
          <Avatar name={currentUser.name} src={currentUser.avatar} size={26} />,
          () => onNavigate("profile"),
        )}
      </div>
    </aside>
  );
}
