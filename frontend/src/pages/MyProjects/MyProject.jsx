import { useState } from "react";
import Icon from "../../components/Icon/Icon";
import Avatar from "../../components/Avatar/Avatar";
import { pluralize, roleLabel } from "../../lib/format";
import "./MyProject.css";

export default function MyProjects({
  projects,
  users,
  currentUserId,
  onCreateProject,
  onOpenProject,
  onMoveProject,
}) {
  const [name, setName] = useState("");

  const userById = (id) => users.find((u) => u.id === id);

  const handleCreate = (e) => {
    e.preventDefault();
    if (onCreateProject(name)) setName("");
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Проекты</h1>
          <p className="page-sub">
            {projects.length
              ? `${projects.length} ${pluralize(projects.length, ["проект", "проекта", "проектов"])}`
              : "Создайте первый проект — доска с базовыми колонками появится сразу."}
          </p>
        </div>
        <form className="inline-form create-project" onSubmit={handleCreate}>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название нового проекта"
            aria-label="Название нового проекта"
          />
          <button className="btn btn-primary" disabled={!name.trim()}>
            <Icon name="plus" size={16} /> Создать
          </button>
        </form>
      </div>

      {projects.length === 0 ? (
        <div className="panel">
          <div className="empty">
            <Icon name="folder" size={36} strokeWidth={1.5} />
            <h3>Проектов пока нет</h3>
            <p>Создайте проект или примите приглашение от коллег на странице «Приглашения».</p>
          </div>
        </div>
      ) : (
        <div className="project-grid">
          {projects.map((project, index) => {
            const tasks = Object.values(project.tasks || {});
            const done = tasks.filter((t) => t.completed).length;
            const progress = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
            const role = project.members.find((m) => m.id === currentUserId)?.role;

            return (
              <article className="project-card" key={project.id}>
                <button className="project-card-main" onClick={() => onOpenProject(project.id, "board")}>
                  <div className="project-card-top">
                    <span className="project-initial">{project.name.charAt(0).toUpperCase()}</span>
                    <span className={`badge ${role === "admin" ? "badge-accent" : ""}`}>{roleLabel(role)}</span>
                  </div>
                  <h3 className="project-card-title">{project.name}</h3>
                  <p className="project-card-desc">{project.description || "Без описания"}</p>

                  <div className="project-progress">
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${progress}%` }} />
                    </div>
                    <span>
                      {done}/{tasks.length}
                    </span>
                  </div>
                </button>

                <footer className="project-card-foot">
                  <div className="avatar-stack">
                    {project.members.slice(0, 4).map((m) => {
                      const user = userById(m.id);
                      return <Avatar key={m.id} name={user?.name || m.id} src={user?.avatar} size={24} />;
                    })}
                    {project.members.length > 4 && (
                      <span className="avatar-more">+{project.members.length - 4}</span>
                    )}
                  </div>
                  <div className="project-card-actions">
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      onClick={() => onMoveProject(project.id, -1)}
                      disabled={index === 0}
                      aria-label="Переместить выше"
                      title="Переместить выше"
                    >
                      <Icon name="chevronLeft" size={15} />
                    </button>
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      onClick={() => onMoveProject(project.id, 1)}
                      disabled={index === projects.length - 1}
                      aria-label="Переместить ниже"
                      title="Переместить ниже"
                    >
                      <Icon name="chevronRight" size={15} />
                    </button>
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      onClick={() => onOpenProject(project.id, "settings")}
                      aria-label="Настройки проекта"
                      title="Настройки проекта"
                    >
                      <Icon name="settings" size={15} />
                    </button>
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
