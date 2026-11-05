import { useState } from "react";
import Icon from "../Icon/Icon";
import Avatar from "../Avatar/Avatar";
import Modal from "../Modal/Modal";
import { roleLabel } from "../../lib/format";
import { toast } from "../../lib/toast";

export default function ProjectSettings({ project, users, currentUserId, currentUserRole, actions }) {
  const isAdmin = currentUserRole === "admin";
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || "");
  const [inviteId, setInviteId] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [newTag, setNewTag] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");

  const userById = (id) => users.find((u) => u.id === id);
  const tags = project.tags || [];
  const isDirty = name.trim() !== project.name || description.trim() !== (project.description || "");

  const saveGeneral = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    actions.editProject(project.id, { name: name.trim(), description: description.trim() });
    toast("Настройки проекта сохранены");
  };

  const sendInvite = (e) => {
    e.preventDefault();
    const result = actions.invite(project.id, inviteId, inviteRole);
    toast(result.message, result.success ? "success" : "error");
    if (result.success) setInviteId("");
  };

  const copyId = () => {
    navigator.clipboard?.writeText(project.id);
    toast("ID проекта скопирован");
  };

  return (
    <div className="settings-grid">
      <div className="settings-col">
        <form className="panel panel-pad settings-section" onSubmit={saveGeneral}>
          <div>
            <h3 className="panel-title">Основное</h3>
            <p className="panel-sub">Название и описание видят все участники проекта.</p>
          </div>
          <div className="field">
            <label htmlFor="project-name">Название</label>
            <input
              id="project-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isAdmin}
            />
          </div>
          <div className="field">
            <label htmlFor="project-desc">Описание</label>
            <textarea
              id="project-desc"
              className="textarea"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={isAdmin ? "Цель проекта, ссылки, договорённости…" : "Описания нет"}
              disabled={!isAdmin}
            />
          </div>
          <div className="settings-row">
            <button type="button" className="id-chip" onClick={copyId} title="Скопировать ID проекта">
              ID {project.id} <Icon name="copy" size={12} />
            </button>
            {isAdmin && (
              <button className="btn btn-primary" disabled={!isDirty || !name.trim()}>
                Сохранить
              </button>
            )}
          </div>
        </form>

        <section className="panel panel-pad settings-section">
          <div>
            <h3 className="panel-title">Теги</h3>
            <p className="panel-sub">Из этого списка выбираются метки для задач.</p>
          </div>
          <div className="tag-list">
            {tags.length === 0 && <span className="muted">Тегов пока нет</span>}
            {tags.map((tag) => (
              <span className="tag" key={tag}>
                {tag}
                {isAdmin && (
                  <button
                    className="tag-remove"
                    onClick={() => actions.removeTag(project.id, tag)}
                    aria-label={`Удалить тег ${tag}`}
                  >
                    <Icon name="close" size={11} strokeWidth={2.5} />
                  </button>
                )}
              </span>
            ))}
          </div>
          {isAdmin && (
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                actions.addTag(project.id, newTag);
                setNewTag("");
              }}
            >
              <input
                className="input"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="Новый тег"
              />
              <button className="btn" disabled={!newTag.trim()}>
                Добавить
              </button>
            </form>
          )}
        </section>
      </div>

      <div className="settings-col">
        <section className="panel settings-section members-panel">
          <div className="members-head">
            <h3 className="panel-title">Участники</h3>
            <span className="muted">{project.members.length}</span>
          </div>
          <ul className="member-list">
            {project.members.map((m) => {
              const member = userById(m.id);
              const isMe = m.id === currentUserId;
              return (
                <li className="member" key={m.id}>
                  <Avatar name={member?.name || m.id} src={member?.avatar} size={32} />
                  <div className="member-info">
                    <span className="member-name">
                      {member?.name || m.id}
                      {isMe && <span className="muted"> (вы)</span>}
                    </span>
                    <span className="member-id mono">{m.id}</span>
                  </div>
                  {isAdmin && !isMe ? (
                    <>
                      <select
                        className="select select-sm member-role"
                        value={m.role}
                        onChange={(e) => actions.changeRole(project.id, m.id, e.target.value)}
                        aria-label="Роль участника"
                      >
                        <option value="admin">Админ</option>
                        <option value="member">Участник</option>
                        <option value="viewer">Наблюдатель</option>
                      </select>
                      <button
                        className="btn btn-ghost btn-icon btn-sm danger-hover"
                        onClick={() => {
                          if (window.confirm(`Исключить ${member?.name || m.id} из проекта?`)) {
                            actions.leaveProject(project.id, m.id);
                          }
                        }}
                        aria-label="Исключить участника"
                      >
                        <Icon name="close" size={14} />
                      </button>
                    </>
                  ) : (
                    <span className={`badge ${m.role === "admin" ? "badge-accent" : ""}`}>{roleLabel(m.role)}</span>
                  )}
                </li>
              );
            })}
          </ul>

          {isAdmin && (
            <form className="invite-row" onSubmit={sendInvite}>
              <span className="field-label">Пригласить по ID пользователя</span>
              <div className="inline-form">
                <input
                  className="input"
                  value={inviteId}
                  onChange={(e) => setInviteId(e.target.value)}
                  placeholder="INV-1234"
                  aria-label="ID пользователя"
                />
                <select
                  className="select invite-role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  aria-label="Роль"
                >
                  <option value="member">Участник</option>
                  <option value="viewer">Наблюдатель</option>
                  <option value="admin">Админ</option>
                </select>
                <button className="btn btn-primary" disabled={!inviteId.trim()}>
                  Пригласить
                </button>
              </div>
            </form>
          )}
        </section>

        <section className="panel panel-pad settings-section danger-zone">
          <div>
            <h3 className="panel-title">Опасная зона</h3>
            <p className="panel-sub">
              {isAdmin
                ? "Удаление проекта сотрёт доску, задачи и чаты без возможности восстановления."
                : "Выйдя из проекта, вы потеряете доступ к доске и чатам."}
            </p>
          </div>
          <div className="settings-row">
            <button
              className="btn btn-danger"
              onClick={() => {
                if (window.confirm(`Выйти из проекта «${project.name}»?`)) {
                  actions.leaveProject(project.id, currentUserId);
                }
              }}
            >
              <Icon name="logout" size={15} /> Выйти из проекта
            </button>
            {isAdmin && (
              <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
                <Icon name="trash" size={15} /> Удалить проект
              </button>
            )}
          </div>
        </section>
      </div>

      {confirmDelete && (
        <Modal
          title="Удалить проект?"
          onClose={() => setConfirmDelete(false)}
          footer={
            <>
              <div className="spacer" />
              <button className="btn" onClick={() => setConfirmDelete(false)}>
                Отмена
              </button>
              <button
                className="btn btn-danger"
                disabled={deleteInput.trim() !== project.name}
                onClick={() => actions.deleteProject(project.id)}
              >
                Удалить навсегда
              </button>
            </>
          }
        >
          <div className="field">
            <label htmlFor="confirm-delete">
              Чтобы подтвердить, введите название проекта: <b>{project.name}</b>
            </label>
            <input
              id="confirm-delete"
              className="input"
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              autoFocus
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
