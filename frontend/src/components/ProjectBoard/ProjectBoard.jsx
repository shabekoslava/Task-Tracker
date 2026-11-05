import { useEffect, useState } from "react";
import Icon from "../Icon/Icon";
import Avatar from "../Avatar/Avatar";
import Modal from "../Modal/Modal";
import ProjectSettings from "./ProjectSettings";
import { formatDay, formatDateTime, isUrgent, toDateInput, roleLabel } from "../../lib/format";
import "./ProjectBoard.css";

const COLUMN_TONES = ["var(--info)", "var(--warning)", "#a26cf0", "var(--success)", "var(--accent)", "#2fb5b0"];

export default function ProjectBoard({
  project,
  users,
  currentUserId,
  currentUserRole,
  actions,
  initialViewMode = "board",
  initialActiveTaskId,
  onClearInitialActiveTaskId,
  onCloseTaskModal,
}) {
  const [viewMode, setViewMode] = useState(initialViewMode);
  // Задача, открытая со страницы «Мои задачи» или из чата
  const [activeTaskId, setActiveTaskId] = useState(() =>
    project.tasks?.[initialActiveTaskId] ? initialActiveTaskId : null,
  );
  const [addingInColumn, setAddingInColumn] = useState(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newColumnName, setNewColumnName] = useState("");
  const [editingColumnId, setEditingColumnId] = useState(null);
  const [columnNameDraft, setColumnNameDraft] = useState("");
  const [dragOverColumn, setDragOverColumn] = useState(null);

  const tasks = project.tasks || {};
  const canManage = currentUserRole === "admin";
  const canEdit = currentUserRole === "admin" || currentUserRole === "member";

  const user = (id) => users.find((u) => u.id === id);
  const userName = (id) => (id && id !== "Unassigned" ? user(id)?.name || id : "Не назначено");

  useEffect(() => {
    if (initialActiveTaskId) onClearInitialActiveTaskId();
    // Нужно только при открытии доски
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeTask = () => {
    setActiveTaskId(null);
    onCloseTaskModal?.();
  };

  const submitNewTask = (columnId) => {
    if (actions.addTask(project.id, columnId, newTaskTitle)) setNewTaskTitle("");
  };

  const submitRename = (columnId) => {
    actions.renameColumn(project.id, columnId, columnNameDraft);
    setEditingColumnId(null);
  };

  const handleDrop = (e, columnId) => {
    e.preventDefault();
    setDragOverColumn(null);
    const taskId = e.dataTransfer.getData("text/plain");
    if (taskId && canEdit) actions.moveTask(project.id, taskId, columnId);
  };

  return (
    <div className="board-page">
      <div className="board-head">
        <div className="board-title">
          <h1>{project.name}</h1>
          <span className={`badge ${canManage ? "badge-accent" : ""}`}>{roleLabel(currentUserRole)}</span>
          <div className="avatar-stack">
            {project.members.map((m) => (
              <Avatar key={m.id} name={userName(m.id)} src={user(m.id)?.avatar} size={26} />
            ))}
          </div>
        </div>
        <div className="segmented" role="tablist">
          <button
            role="tab"
            aria-selected={viewMode === "board"}
            className={viewMode === "board" ? "active" : ""}
            onClick={() => setViewMode("board")}
          >
            <Icon name="board" size={15} /> Доска
          </button>
          <button
            role="tab"
            aria-selected={viewMode === "settings"}
            className={viewMode === "settings" ? "active" : ""}
            onClick={() => setViewMode("settings")}
          >
            <Icon name="settings" size={15} /> Настройки
          </button>
        </div>
      </div>

      {viewMode === "settings" ? (
        <ProjectSettings
          project={project}
          users={users}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          actions={actions}
        />
      ) : (
        <div className="board-scroll">
          {project.columns.map((column, colIndex) => (
            <section
              key={column.id}
              className={`column ${dragOverColumn === column.id ? "is-drop-target" : ""}`}
              style={{ "--column-tone": COLUMN_TONES[colIndex % COLUMN_TONES.length] }}
              onDragOver={(e) => {
                if (!canEdit) return;
                e.preventDefault();
                setDragOverColumn(column.id);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setDragOverColumn(null);
              }}
              onDrop={(e) => handleDrop(e, column.id)}
            >
              <header className="column-head">
                <span className="column-dot" />
                {editingColumnId === column.id ? (
                  <input
                    className="input input-sm column-rename"
                    value={columnNameDraft}
                    onChange={(e) => setColumnNameDraft(e.target.value)}
                    onBlur={() => submitRename(column.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitRename(column.id);
                      if (e.key === "Escape") setEditingColumnId(null);
                    }}
                    autoFocus
                  />
                ) : (
                  <h2
                    className={`column-name ${canManage ? "is-editable" : ""}`}
                    onDoubleClick={() => {
                      if (!canManage) return;
                      setEditingColumnId(column.id);
                      setColumnNameDraft(column.name);
                    }}
                    title={canManage ? "Двойной клик — переименовать" : undefined}
                  >
                    {column.name}
                  </h2>
                )}
                <span className="column-count">{column.taskIds.length}</span>

                {canManage && editingColumnId !== column.id && (
                  <div className="column-tools">
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      onClick={() => actions.moveColumn(project.id, column.id, "left")}
                      disabled={colIndex === 0}
                      aria-label="Сдвинуть колонку влево"
                    >
                      <Icon name="chevronLeft" size={14} />
                    </button>
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      onClick={() => actions.moveColumn(project.id, column.id, "right")}
                      disabled={colIndex === project.columns.length - 1}
                      aria-label="Сдвинуть колонку вправо"
                    >
                      <Icon name="chevronRight" size={14} />
                    </button>
                    <button
                      className="btn btn-ghost btn-icon btn-sm danger-hover"
                      onClick={() => {
                        const count = column.taskIds.length;
                        const warning = count ? ` Вместе с ней удалятся задачи (${count}).` : "";
                        if (window.confirm(`Удалить колонку «${column.name}»?${warning}`)) {
                          actions.deleteColumn(project.id, column.id);
                        }
                      }}
                      aria-label="Удалить колонку"
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                )}
              </header>

              <div className="column-body">
                {column.taskIds.map((taskId) => {
                  const task = tasks[taskId];
                  if (!task) return null;
                  return (
                    <TaskCard
                      key={task.id}
                      task={task}
                      canEdit={canEdit}
                      assignee={user(task.assignedTo)}
                      assigneeName={userName(task.assignedTo)}
                      onOpen={() => setActiveTaskId(task.id)}
                      onToggle={() => actions.toggleTaskComplete(project.id, task.id)}
                    />
                  );
                })}

                {canEdit &&
                  (addingInColumn === column.id ? (
                    <div className="quick-add">
                      <textarea
                        className="textarea quick-add-input"
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        placeholder="Что нужно сделать?"
                        rows={2}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            submitNewTask(column.id);
                          }
                          if (e.key === "Escape") setAddingInColumn(null);
                        }}
                      />
                      <div className="quick-add-actions">
                        <button className="btn btn-primary btn-sm" onClick={() => submitNewTask(column.id)}>
                          Добавить
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setAddingInColumn(null)}>
                          Отмена
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="add-task"
                      onClick={() => {
                        setAddingInColumn(column.id);
                        setNewTaskTitle("");
                      }}
                    >
                      <Icon name="plus" size={15} /> Задача
                    </button>
                  ))}
              </div>
            </section>
          ))}

          {canManage && (
            <form
              className="column column-new"
              onSubmit={(e) => {
                e.preventDefault();
                if (actions.addColumn(project.id, newColumnName)) setNewColumnName("");
              }}
            >
              <input
                className="input input-sm"
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                placeholder="Новая колонка"
                aria-label="Название новой колонки"
              />
              <button className="btn btn-sm" disabled={!newColumnName.trim()}>
                <Icon name="plus" size={14} /> Добавить колонку
              </button>
            </form>
          )}
        </div>
      )}

      {activeTaskId && tasks[activeTaskId] && (
        <TaskModal
          project={project}
          task={tasks[activeTaskId]}
          users={users}
          canEdit={canEdit}
          canComment={currentUserRole !== "viewer"}
          actions={actions}
          onClose={closeTask}
        />
      )}
    </div>
  );
}

function TaskCard({ task, canEdit, assignee, assigneeName, onOpen, onToggle }) {
  return (
    <article
      className={`task-card ${task.completed ? "is-done" : ""}`}
      draggable={canEdit}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.currentTarget.classList.add("is-dragging");
      }}
      onDragEnd={(e) => e.currentTarget.classList.remove("is-dragging")}
      onClick={onOpen}
    >
      <div className="task-card-top">
        <button
          className={`task-check ${task.completed ? "checked" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          disabled={!canEdit}
          aria-label={task.completed ? "Вернуть в работу" : "Отметить выполненной"}
        >
          {task.completed && <Icon name="check" size={12} strokeWidth={3} />}
        </button>
        <h3 className="task-card-title">{task.title}</h3>
      </div>

      {(task.tags?.length > 0 || isUrgent(task) || task.sprint) && (
        <div className="task-card-labels">
          {isUrgent(task) && !task.completed && (
            <span className="badge badge-danger">
              <Icon name="flame" size={12} /> Срочно
            </span>
          )}
          {task.sprint && (
            <span className="badge badge-info">
              <Icon name="sprint" size={12} /> {task.sprint}
            </span>
          )}
          {task.tags?.map((tag) => (
            <span className="tag" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      )}

      <footer className="task-card-foot">
        <div className="task-card-meta">
          {task.deadline && (
            <span className="meta">
              <Icon name="calendar" size={13} /> {formatDay(task.deadline)}
            </span>
          )}
          {task.estimate && (
            <span className="meta">
              <Icon name="clock" size={13} /> {task.estimate}
            </span>
          )}
          {task.comments?.length > 0 && (
            <span className="meta">
              <Icon name="chat" size={13} /> {task.comments.length}
            </span>
          )}
        </div>
        <Avatar name={assigneeName} src={assignee?.avatar} size={22} />
      </footer>
    </article>
  );
}

function TaskModal({ project, task, users, canEdit, canComment, actions, onClose }) {
  const currentColumnId = project.columns.find((c) => c.taskIds.includes(task.id))?.id || "";
  const [draft, setDraft] = useState(() => ({
    title: task.title,
    description: task.description || "",
    assignedTo: task.assignedTo || "Unassigned",
    deadline: toDateInput(task.deadline),
    estimate: parseInt(task.estimate, 10) || "",
    priority: isUrgent(task) ? "Срочно" : "Не срочно",
    sprint: task.sprint || "",
    tags: task.tags || [],
    completed: !!task.completed,
    columnId: currentColumnId,
  }));
  const [comment, setComment] = useState("");
  const [newTag, setNewTag] = useState("");

  const set = (field, value) => setDraft((prev) => ({ ...prev, [field]: value }));
  const userById = (id) => users.find((u) => u.id === id);
  const projectTags = project.tags || [];

  const addTag = (tag) => {
    const trimmed = tag.trim();
    if (!trimmed || draft.tags.includes(trimmed)) return;
    set("tags", [...draft.tags, trimmed]);
    if (!projectTags.includes(trimmed)) actions.addTag(project.id, trimmed);
  };

  const save = () => {
    if (!draft.title.trim()) return;
    actions.editTask(project.id, task.id, {
      title: draft.title.trim(),
      description: draft.description,
      assignedTo: draft.assignedTo === "Unassigned" ? "" : draft.assignedTo,
      deadline: draft.deadline,
      estimate: draft.estimate ? `${draft.estimate} ч` : "",
      priority: draft.priority,
      sprint: draft.sprint.trim(),
      tags: draft.tags,
      completed: draft.completed,
    });
    if (draft.columnId && draft.columnId !== currentColumnId) {
      actions.moveTask(project.id, task.id, draft.columnId);
    }
    onClose();
  };

  const sendComment = () => {
    if (actions.addComment(project.id, task.id, comment)) setComment("");
  };

  return (
    <Modal
      width={880}
      className="task-modal"
      onClose={onClose}
      title={
        <input
          className="task-title-input"
          value={draft.title}
          onChange={(e) => set("title", e.target.value)}
          disabled={!canEdit}
          aria-label="Название задачи"
        />
      }
      footer={
        <>
          {canEdit && (
            <button
              className="btn btn-danger"
              onClick={() => {
                if (window.confirm("Удалить задачу? Это действие нельзя отменить.")) {
                  actions.deleteTask(project.id, task.id);
                  onClose();
                }
              }}
            >
              <Icon name="trash" size={15} /> Удалить
            </button>
          )}
          <div className="spacer" />
          <button className="btn" onClick={onClose}>
            {canEdit ? "Отмена" : "Закрыть"}
          </button>
          {canEdit && (
            <button className="btn btn-primary" onClick={save} disabled={!draft.title.trim()}>
              Сохранить
            </button>
          )}
        </>
      }
    >
      <div className="task-modal-grid">
        <div className="task-modal-main">
          <div className="field">
            <label htmlFor="task-desc">Описание</label>
            <textarea
              id="task-desc"
              className="textarea"
              rows={6}
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder={canEdit ? "Детали, ссылки, критерии готовности…" : "Описания нет"}
              disabled={!canEdit}
            />
          </div>

          <div className="comments">
            <h4 className="comments-title">
              Комментарии <span>{task.comments?.length || 0}</span>
            </h4>
            {task.comments?.length ? (
              <ul className="comment-list">
                {task.comments.map((c) => {
                  const author = userById(c.authorId);
                  return (
                    <li className="comment" key={c.id}>
                      <Avatar name={author?.name || c.authorId || "?"} src={author?.avatar} size={28} />
                      <div className="comment-body">
                        <div className="comment-head">
                          <b>{author?.name || c.authorId || "Неизвестный"}</b>
                          <span>{formatDateTime(c.createdAt)}</span>
                        </div>
                        <p>{c.text}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="comments-empty">Пока никто ничего не написал.</p>
            )}
            {canComment && (
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  sendComment();
                }}
              >
                <input
                  className="input"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Написать комментарий"
                />
                <button className="btn" disabled={!comment.trim()} aria-label="Отправить комментарий">
                  <Icon name="send" size={15} />
                </button>
              </form>
            )}
          </div>
        </div>

        <aside className="task-props">
          <label className="prop-check">
            <input
              type="checkbox"
              className="checkbox"
              checked={draft.completed}
              onChange={(e) => set("completed", e.target.checked)}
              disabled={!canEdit}
            />
            Задача выполнена
          </label>

          <Prop label="Колонка" icon="board">
            <select
              className="select select-sm"
              value={draft.columnId}
              onChange={(e) => set("columnId", e.target.value)}
              disabled={!canEdit}
            >
              {project.columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Prop>

          <Prop label="Исполнитель" icon="user">
            <select
              className="select select-sm"
              value={draft.assignedTo}
              onChange={(e) => set("assignedTo", e.target.value)}
              disabled={!canEdit}
            >
              <option value="Unassigned">Не назначен</option>
              {project.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {userById(m.id)?.name || m.id}
                </option>
              ))}
            </select>
          </Prop>

          <Prop label="Срок" icon="calendar">
            <input
              type="date"
              className="input input-sm"
              value={draft.deadline}
              onChange={(e) => set("deadline", e.target.value)}
              disabled={!canEdit}
            />
          </Prop>

          <Prop label="Оценка, ч" icon="clock">
            <input
              type="number"
              min="0"
              className="input input-sm"
              value={draft.estimate}
              onChange={(e) => set("estimate", e.target.value)}
              placeholder="—"
              disabled={!canEdit}
            />
          </Prop>

          <Prop label="Приоритет" icon="flag">
            <select
              className="select select-sm"
              value={draft.priority}
              onChange={(e) => set("priority", e.target.value)}
              disabled={!canEdit}
            >
              <option value="Не срочно">Обычный</option>
              <option value="Срочно">Срочно</option>
            </select>
          </Prop>

          <Prop label="Спринт" icon="sprint">
            <input
              className="input input-sm"
              value={draft.sprint}
              onChange={(e) => set("sprint", e.target.value)}
              placeholder="Например, Спринт 2"
              disabled={!canEdit}
            />
          </Prop>

          <div className="prop-tags">
            <span className="field-label">Теги</span>
            <div className="tag-list">
              {draft.tags.length === 0 && <span className="muted small">Нет тегов</span>}
              {draft.tags.map((tag) => (
                <span className="tag" key={tag}>
                  {tag}
                  {canEdit && (
                    <button
                      className="tag-remove"
                      onClick={() => set("tags", draft.tags.filter((t) => t !== tag))}
                      aria-label={`Убрать тег ${tag}`}
                    >
                      <Icon name="close" size={11} strokeWidth={2.5} />
                    </button>
                  )}
                </span>
              ))}
            </div>
            {canEdit && (
              <div className="tag-pick">
                {projectTags
                  .filter((tag) => !draft.tags.includes(tag))
                  .map((tag) => (
                    <button key={tag} className="tag tag-option" onClick={() => addTag(tag)}>
                      {tag}
                    </button>
                  ))}
                <form
                  className="tag-new"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addTag(newTag);
                    setNewTag("");
                  }}
                >
                  <input
                    className="input input-sm"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder="Новый тег"
                    aria-label="Новый тег"
                  />
                </form>
              </div>
            )}
          </div>

          <p className="task-created">Создана {formatDateTime(task.createdAt) || "—"}</p>
        </aside>
      </div>
    </Modal>
  );
}

function Prop({ label, icon, children }) {
  return (
    <div className="prop">
      <span className="prop-label">
        <Icon name={icon} size={14} /> {label}
      </span>
      {children}
    </div>
  );
}
