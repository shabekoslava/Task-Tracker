// src/pages/MyProjects/MyProject.jsx
import { useState } from "react";
import "./MyProject.css";

export default function MyProjects({
  projects,
  onCreateProject,
  onInviteUser,
  onChangeRole,
  onLeaveProject,
  onDeleteProject,
  currentUserId,
  openProject,
  onMoveProjectUp,
  onMoveProjectDown,
}) {
  const [projectName, setProjectName] = useState("");
  const [inviteDrafts, setInviteDrafts] = useState({});
  const [inviteRoles, setInviteRoles] = useState({});
  
  // Track which project cards are expanded
  const [expandedProjects, setExpandedProjects] = useState({});

  const toggleExpand = (projectId) => {
    setExpandedProjects((prev) => ({
      ...prev,
      [projectId]: !prev[projectId],
    }));
  };

  const handleCreate = () => {
    if (!projectName.trim()) return;
    onCreateProject(projectName);
    setProjectName("");
  };

  const handleInvite = (projectId) => {
    const inviteId = inviteDrafts[projectId]?.trim();
    const role = inviteRoles[projectId] || "member";
    if (!inviteId) return;
    onInviteUser(projectId, inviteId, role);
    setInviteDrafts((prev) => ({ ...prev, [projectId]: "" }));
    setInviteRoles((prev) => ({ ...prev, [projectId]: "member" }));
  };

  const isCurrentUserAdmin = (project) => {
    const me = project.members.find((m) => m.id === currentUserId);
    return me && me.role === "admin";
  };

  // Load real names mapping from localStorage
  const allUsers = JSON.parse(localStorage.getItem("auth_users") || "[]");
  const getUserName = (userId) => {
    if (!userId) return "Не назначено";
    const found = allUsers.find((u) => u.id === userId);
    return found ? found.name : userId;
  };

  return (
    <div className="page-fade-in projects-page">
      <div className="projects-header">
        <div>
          <h2>Управление проектами</h2>
          <p>Ваш ID: <span className="highlight-id">{currentUserId}</span></p>
        </div>
      </div>

      <div className="create-project-card">
        <h3>Создать новый проект</h3>
        <div className="create-project-form">
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="Название проекта (например, Redesign 2.0)"
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <button className="btn primary" onClick={handleCreate}>
            Создать
          </button>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="empty-projects">
          <p>У вас пока нет проектов. Создайте свой первый проект выше!</p>
        </div>
      ) : (
        <div className="projects-vertical-list">
          {projects.map((project, idx) => {
            const isAdmin = isCurrentUserAdmin(project);
            const isExpanded = !!expandedProjects[project.id];

            return (
              <div 
                className={`project-card-full ${isExpanded ? "expanded" : "collapsed"}`} 
                key={project.id}
              >
                {/* Header: Core Info, Actions & Toggle */}
                <div 
                  className="project-card-header" 
                  onClick={() => toggleExpand(project.id)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                    {/* Up/Down Reorder Arrows */}
                    <div className="reorder-arrows-wrapper" style={{ display: "flex", flexDirection: "column", gap: "2px" }} onClick={(e) => e.stopPropagation()}>
                      <button
                        className="reorder-arrow-btn"
                        onClick={() => onMoveProjectUp(project.id)}
                        disabled={idx === 0}
                        title="Переместить вверх"
                      >
                        ▲
                      </button>
                      <button
                        className="reorder-arrow-btn"
                        onClick={() => onMoveProjectDown(project.id)}
                        disabled={idx === projects.length - 1}
                        title="Переместить вниз"
                      >
                        ▼
                      </button>
                    </div>

                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "4px" }}>
                        <h3 className="project-title">{project.name}</h3>
                        <span className="project-id-badge">
                          ID: {project.id}
                        </span>
                      </div>
                      <p className="project-meta">
                        Участников: {project.members.length}
                      </p>
                    </div>
                  </div>

                  {/* Header Actions */}
                  <div className="project-actions-wrapper" onClick={(e) => e.stopPropagation()}>
                    <button className="btn primary small" onClick={() => openProject(project.id, "board")}>
                      Открыть доску
                    </button>
                    <button className="btn secondary small" onClick={() => openProject(project.id, "settings")} title="Открыть настройки проекта">
                      ⚙️ Настройки
                    </button>
                    
                    {/* Collapsible toggle arrow */}
                    <button 
                      className={`expand-arrow-toggle ${isExpanded ? "rotated" : ""}`}
                      onClick={() => toggleExpand(project.id)}
                    >
                      ▼
                    </button>
                  </div>
                </div>

                {/* Collapsible Body containing settings & members */}
                {isExpanded && (
                  <div className="project-card-body-wrapper page-fade-in">
                    <div className="project-card-body">
                      <div className="project-members-section">
                        <h4>Команда</h4>
                        <div className="members-list">
                          {project.members.map((member) => (
                            <div className="member-item" key={member.id}>
                              <div className="member-info">
                                <div className="member-avatar" title={getUserName(member.id)}>
                                  {getUserName(member.id).substring(0, 2).toUpperCase()}
                                </div>
                                <span className="member-name">
                                  {getUserName(member.id)} <span className="member-id-paren">({member.id})</span> {member.id === currentUserId && "(Вы)"}
                                </span>
                              </div>
                              <div className="member-controls">
                                {isAdmin && member.id !== currentUserId ? (
                                  <select
                                    value={member.role}
                                    onChange={(e) =>
                                      onChangeRole(project.id, member.id, e.target.value)
                                    }
                                    className="role-select"
                                  >
                                    <option value="admin">Админ</option>
                                    <option value="member">Участник</option>
                                    <option value="viewer">Наблюдатель</option>
                                  </select>
                                ) : (
                                  <span className="role-badge">{member.role === 'admin' ? 'Админ' : member.role === 'member' ? 'Участник' : 'Наблюдатель'}</span>
                                )}

                                {isAdmin && member.id !== currentUserId && (
                                  <button
                                    className="btn icon-btn danger"
                                    onClick={() => onLeaveProject(project.id, member.id)}
                                    title="Удалить участника"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {isAdmin && (
                        <div className="project-invite-section">
                          <h4>Пригласить участника</h4>
                          <div className="invite-form">
                            <input
                              type="text"
                              value={inviteDrafts[project.id] || ""}
                              onChange={(e) =>
                                setInviteDrafts({
                                  ...inviteDrafts,
                                  [project.id]: e.target.value,
                                })
                              }
                              placeholder="ID пользователя (например, INV-1234)"
                              onKeyDown={(e) => e.key === "Enter" && handleInvite(project.id)}
                            />
                            <select
                              value={inviteRoles[project.id] || "member"}
                              onChange={(e) =>
                                setInviteRoles({
                                  ...inviteRoles,
                                  [project.id]: e.target.value,
                                })
                              }
                              className="role-select"
                              style={{
                                padding: "10px 14px",
                                borderRadius: "8px",
                                border: "1px solid var(--border-color)",
                                background: "var(--bg-surface)",
                                color: "var(--text-primary)",
                                height: "auto"
                              }}
                            >
                              <option value="member">Участник</option>
                              <option value="viewer">Наблюдатель</option>
                              <option value="admin">Админ</option>
                            </select>
                            <button className="btn secondary" onClick={() => handleInvite(project.id)}>
                              Пригласить
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="project-card-footer" style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                      <button
                        className="btn danger"
                        onClick={() => {
                          if (window.confirm("Вы действительно хотите выйти из этого проекта?")) {
                            onLeaveProject(project.id, currentUserId);
                          }
                        }}
                      >
                        Выйти из проекта
                      </button>
                      {isAdmin && (
                        <button
                          className="btn danger"
                          onClick={() => {
                            if (window.confirm(`Вы уверены, что хотите полностью удалить проект "${project.name}"? Это действие со всеми его задачами абсолютно необратимо!`)) {
                              onDeleteProject(project.id);
                            }
                          }}
                          style={{
                            background: "rgba(239, 68, 68, 0.15)",
                            border: "1px solid #ef4444",
                            color: "#ef4444"
                          }}
                        >
                          🗑️ Удалить проект
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
