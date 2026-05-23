// src/components/Sidebar.jsx
import "./Sidebar.css"; // Подключаем стили
import {
  TasksIcon,
  ProjectsIcon,
  MessengerIcon,
  OpenIcon,
  CloseIcon,
  AccountIcon,
  InviteIcon,
} from "./IconsSidebar";

export default function Sidebar({
  isOpen,
  toggle,
  currentTab,
  setCurrentTab,
  projects,
  currentUserId,
  openProject,
}) {
  const menuItems = [
    { id: "Мои задачи", name: "Мои задачи", Icon: TasksIcon },
    { id: "Мессенджер", name: "Мессенджер", Icon: MessengerIcon },
    { id: "Приглашения", name: "Приглашения", Icon: InviteIcon },
    { id: "Мои проекты", name: "Мои проекты", Icon: ProjectsIcon },
  ];

  return (
    <aside className={`sidebar ${isOpen ? "open" : "closed"}`}>
      {/* --- ВЕРХНЯЯ ЧАСТЬ (Header / Profile) --- */}
      <div className="sidebar-header-wrapper">
        {isOpen ? (
          <div className="sidebar-header open">
            <button
              className={`nav-item profile-btn ${currentTab === "Мой профиль" ? "active" : ""}`}
              onClick={() => setCurrentTab("Мой профиль")}
            >
              <AccountIcon className="nav-icon-svg" />
              <span className="nav-text">Мой профиль</span>
            </button>
            <button className="collapse-btn" onClick={toggle}>
              <CloseIcon className="nav-icon-svg" />
            </button>
          </div>
        ) : (
          <div className="sidebar-header closed">
            <button className="collapse-btn" onClick={toggle}>
              <OpenIcon className="nav-icon-svg" />
            </button>
            <hr className="sidebar-divider" />
            <button
              className={`nav-item ${currentTab === "Мой профиль" ? "active" : ""}`}
              onClick={() => setCurrentTab("Мой профиль")}
            >
              <AccountIcon className="nav-icon-svg" />
            </button>
          </div>
        )}
      </div>

      <hr className="sidebar-divider" />

      {/* --- ОСНОВНОЕ МЕНЮ --- */}
      <nav className="nav-menu">
        {menuItems.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${currentTab === item.id ? "active" : ""}`}
            onClick={() => setCurrentTab(item.id)}
          >
            <item.Icon className="nav-icon-svg" />
            {isOpen && <span className="nav-text">{item.name}</span>}
          </button>
        ))}

        {projects && projects.length > 0 && (
          <>
            {(() => {
              const userProjects = projects.filter((project) =>
                project.members.some((m) => m.id === currentUserId)
              );
              if (userProjects.length === 0) return null;
              return (
                <>
                  <hr className="sidebar-divider" />
                  {userProjects.map((project) => (
                    <button
                      key={project.id}
                      className={`nav-item ${currentTab === `project-${project.id}` ? "active" : ""}`}
                      onClick={() => {
                        if (openProject) {
                          openProject(project.id, "board");
                        } else {
                          setCurrentTab(`project-${project.id}`);
                        }
                      }}
                    >
                      <ProjectsIcon className="nav-icon-svg" />
                      {isOpen && <span className="nav-text">{project.name}</span>}
                    </button>
                  ))}
                </>
              );
            })()}
          </>
        )}
      </nav>
    </aside>
  );
}
