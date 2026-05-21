// src/pages/MyProjects/MyProject.jsx
import { useState } from "react";
import "./MyProject.css";

export default function MyProjects({
  projects,
  onCreateProject,
  onInviteUser,
  onChangeRole,
  onLeaveProject,
  currentUserId,
  openProject,
}) {
  const [projectName, setProjectName] = useState("");
  const [inviteDrafts, setInviteDrafts] = useState({});

  const handleCreate = () => {
    if (!projectName.trim()) return;
    onCreateProject(projectName);
    setProjectName("");
  };

  const handleInvite = (projectId) => {
    const inviteId = inviteDrafts[projectId]?.trim();
    if (!inviteId) return;
    onInviteUser(projectId, inviteId);
    setInviteDrafts((prev) => ({ ...prev, [projectId]: "" }));
  };

  const isCurrentUserAdmin = (project) => {
    const me = project.members.find((m) => m.id === currentUserId);
    return me && me.role === "admin";
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
          {projects.map((project) => {
            const isAdmin = isCurrentUserAdmin(project);

            return (
              <div className="project-card-full" key={project.id}>
                <div className="project-card-header">
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "4px" }}>
                      <h3 style={{ margin: 0 }}>{project.name}</h3>
                      <span style={{ fontSize: "11px", fontFamily: "monospace", padding: "2px 6px", borderRadius: "4px", backgroundColor: "var(--hover-color)", border: "1px solid var(--border-color)", color: "var(--nav-text-inactive)" }}>
                        ID: {project.id}
                      </span>
                    </div>
                    <p className="project-meta">Участников: {project.members.length}</p>
                  </div>
                  <button className="btn primary" onClick={() => openProject(project.id)}>
                    Открыть доску
                  </button>
                </div>

                <div className="project-card-body">
                  <div className="project-members-section">
                    <h4>Команда</h4>
                    <div className="members-list">
                      {project.members.map((member) => (
                        <div className="member-item" key={member.id}>
                          <div className="member-info">
                            <div className="member-avatar">{member.id.substring(0, 2).toUpperCase()}</div>
                            <span className="member-name">
                              {member.id} {member.id === currentUserId && "(Вы)"}
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
                        <button className="btn secondary" onClick={() => handleInvite(project.id)}>
                          Пригласить
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="project-card-footer">
                  <button
                    className="btn danger-outline"
                    onClick={() => onLeaveProject(project.id, currentUserId)}
                  >
                    Выйти из проекта
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
