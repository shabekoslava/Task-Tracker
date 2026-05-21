// src/components/ProjectBoard/ProjectBoard.jsx
import { useState } from "react";
import "./ProjectBoard.css";

// Helper component for user avatars
const Avatar = ({ name }) => {
  // Generate initials
  const initials = name
    .split(/[\s-]+/)
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
  return (
    <div className="avatar" data-name={name}>
      {initials}
      <span className="avatar-tooltip">{name}</span>
    </div>
  );
};

export default function ProjectBoard({
  project,
  members,
  onAddColumn,
  onRenameColumn,
  onDeleteColumn,
  onAddTask,
  onEditTask,
  onAddComment,
  onToggleTaskComplete,
  onMoveTask,
  currentUserRole = "viewer", // "admin" | "member" | "viewer"
}) {
  const [newColumnName, setNewColumnName] = useState("");
  const [editingColumnId, setEditingColumnId] = useState(null);
  const [columnNameDraft, setColumnNameDraft] = useState("");

  // Modal State
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [editTaskDraft, setEditTaskDraft] = useState({});
  const [commentDraft, setCommentDraft] = useState("");

  // Adding Task State
  const [addingInColumn, setAddingInColumn] = useState(null);
  const [newTaskDraft, setNewTaskDraft] = useState({ title: "" });
  const [draggedOverColumnId, setDraggedOverColumnId] = useState(null);
  const [columnCounters, setColumnCounters] = useState({});

  const tasks = project.tasks || {};

  // --- Role Enforcements ---
  const canManageColumns = currentUserRole === "admin";
  const canEditTasks = currentUserRole === "admin" || currentUserRole === "member";
  const canComment = currentUserRole !== "viewer";

  const handleAddColumn = () => {
    if (!canManageColumns) return;
    if (!newColumnName.trim()) return;
    onAddColumn(project.id, newColumnName);
    setNewColumnName("");
  };

  const handleRenameColumn = (columnId) => {
    if (!canManageColumns) return;
    if (!columnNameDraft.trim()) {
      setEditingColumnId(null);
      return;
    }
    onRenameColumn(project.id, columnId, columnNameDraft);
    setEditingColumnId(null);
  };

  const handleAddTask = (columnId) => {
    if (!canEditTasks) return;
    if (!newTaskDraft.title.trim()) return;
    onAddTask(project.id, columnId, { title: newTaskDraft.title });
    setAddingInColumn(null);
    setNewTaskDraft({ title: "" });
  };

  const openTaskModal = (taskId) => {
    const task = tasks[taskId];
    setActiveTaskId(taskId);
    setEditTaskDraft({
      title: task.title,
      description: task.description || "",
      assignedTo: task.assignedTo || members[0] || "",
      tags: (task.tags || []).join(", "),
      deadline: task.deadline || "",
      estimate: task.estimate || "",
      sprint: task.sprint || "",
      priority: task.priority || "Средний",
    });
  };

  const closeTaskModal = () => {
    setActiveTaskId(null);
    setEditTaskDraft({});
    setCommentDraft("");
  };

  const saveTaskDetails = () => {
    if (!canEditTasks) return;
    if (!editTaskDraft.title.trim()) return;
    const tagsArray = editTaskDraft.tags
      ? editTaskDraft.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    onEditTask(project.id, activeTaskId, {
      ...editTaskDraft,
      tags: tagsArray,
    });
    closeTaskModal();
  };

  const handleAddComment = () => {
    if (!canComment) return;
    if (!commentDraft.trim()) return;
    onAddComment(project.id, activeTaskId, commentDraft);
    setCommentDraft("");
  };

  // Drag & Drop
  const handleDragStart = (e, taskId) => {
    if (currentUserRole === "viewer") {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData("text/plain", taskId);
    e.target.classList.add("is-dragging");
  };

  const handleDragEnd = (e) => {
    e.target.classList.remove("is-dragging");
    setDraggedOverColumnId(null);
    setColumnCounters({});
  };

  const handleDrop = (e, columnId) => {
    e.preventDefault();
    setDraggedOverColumnId(null);
    setColumnCounters({});
    if (currentUserRole === "viewer") return;
    const taskId = e.dataTransfer.getData("text/plain");
    if (taskId) onMoveTask(project.id, taskId, columnId);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  // Render Modal
  const renderTaskModal = () => {
    if (!activeTaskId) return null;
    const task = tasks[activeTaskId];
    if (!task) return null;

    return (
      <div className="modal-overlay" onMouseDown={closeTaskModal}>
        <div className="task-modal" onMouseDown={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <input
              className="modal-title-input"
              value={editTaskDraft.title}
              onChange={(e) =>
                setEditTaskDraft({ ...editTaskDraft, title: e.target.value })
              }
              placeholder="Название задачи"
              disabled={!canEditTasks}
            />
            <button className="close-btn" onClick={closeTaskModal}>
              ×
            </button>
          </div>

          <div className="modal-body">
            <div className="modal-main">
              <div className="field-group">
                <label>Описание</label>
                <textarea
                  value={editTaskDraft.description}
                  onChange={(e) =>
                    setEditTaskDraft({
                      ...editTaskDraft,
                      description: e.target.value,
                    })
                  }
                  placeholder={canEditTasks ? "Добавьте подробное описание..." : "Описание отсутствует"}
                  rows={4}
                  disabled={!canEditTasks}
                />
              </div>

              <div className="comments-section">
                <h4>Комментарии</h4>
                <div className="comments-list">
                  {task.comments?.length > 0 ? (
                    task.comments.map((c) => (
                      <div key={c.id} className="comment-item">
                        <Avatar name="User" />
                        <div className="comment-content">
                          <span className="comment-text">{c.text}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="no-comments">Пока нет комментариев</p>
                  )}
                </div>
                <div className="comment-input-area">
                  <input
                    type="text"
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    placeholder={canComment ? "Написать комментарий..." : "Комментарии отключены (Режим просмотра)"}
                    disabled={!canComment}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddComment();
                    }}
                  />
                  <button 
                    className="btn primary small" 
                    onClick={handleAddComment}
                    disabled={!canComment}
                  >
                    Отправить
                  </button>
                </div>
              </div>
            </div>

            <div className="modal-sidebar">
              <div className="field-group">
                <label>Исполнитель</label>
                <select
                  value={editTaskDraft.assignedTo}
                  onChange={(e) =>
                    setEditTaskDraft({
                      ...editTaskDraft,
                      assignedTo: e.target.value,
                    })
                  }
                  disabled={!canEditTasks}
                >
                  {members.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field-group">
                <label>Срок (Дедлайн)</label>
                <input
                  type="date"
                  value={editTaskDraft.deadline}
                  onChange={(e) =>
                    setEditTaskDraft({
                      ...editTaskDraft,
                      deadline: e.target.value,
                    })
                  }
                  disabled={!canEditTasks}
                />
              </div>

              <div className="field-group">
                <label>Оценка времени</label>
                <input
                  type="text"
                  value={editTaskDraft.estimate}
                  onChange={(e) =>
                    setEditTaskDraft({
                      ...editTaskDraft,
                      estimate: e.target.value,
                    })
                  }
                  placeholder="напр. 4ч"
                  disabled={!canEditTasks}
                />
              </div>

              <div className="field-group">
                <label>Приоритет</label>
                <select
                  value={editTaskDraft.priority}
                  onChange={(e) =>
                    setEditTaskDraft({
                      ...editTaskDraft,
                      priority: e.target.value,
                    })
                  }
                  disabled={!canEditTasks}
                >
                  <option value="Низкий">Низкий</option>
                  <option value="Средний">Средний</option>
                  <option value="Высокий">Высокий</option>
                  <option value="Критичный">Критичный</option>
                </select>
              </div>

              <div className="field-group">
                <label>Теги (через запятую)</label>
                <input
                  type="text"
                  value={editTaskDraft.tags}
                  onChange={(e) =>
                    setEditTaskDraft({ ...editTaskDraft, tags: e.target.value })
                  }
                  placeholder="дизайн, баг, срочно"
                  disabled={!canEditTasks}
                />
              </div>

              <div className="field-group">
                <label>Спринт</label>
                <input
                  type="text"
                  value={editTaskDraft.sprint}
                  onChange={(e) =>
                    setEditTaskDraft({
                      ...editTaskDraft,
                      sprint: e.target.value,
                    })
                  }
                  placeholder="Спринт 1"
                  disabled={!canEditTasks}
                />
              </div>

              <button
                className={`btn full-width ${
                  task.completed ? "secondary" : "done-btn-primary"
                }`}
                onClick={() => {
                  onToggleTaskComplete(project.id, task.id);
                  closeTaskModal();
                }}
                disabled={!canEditTasks}
              >
                {task.completed ? "Отменить выполнение" : "✔ Отметить выполненной"}
              </button>
            </div>
          </div>

          <div className="modal-footer">
            <button className="btn secondary" onClick={closeTaskModal}>
              {canEditTasks ? "Отмена" : "Закрыть"}
            </button>
            {canEditTasks && (
              <button className="btn primary" onClick={saveTaskDetails}>
                Сохранить изменения
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="board-layout">
      {/* Шапка проекта */}
      <div className="board-header-section">
        <div className="board-title-area">
          <h2>{project.name}</h2>
          <span className="role-tag-badge" style={{ fontSize: "11px", fontWeight: "600", textTransform: "uppercase", padding: "2px 8px", borderRadius: "10px", backgroundColor: currentUserRole === "admin" ? "rgba(239, 68, 68, 0.15)" : currentUserRole === "member" ? "rgba(59, 130, 246, 0.15)" : "rgba(148, 163, 184, 0.15)", color: currentUserRole === "admin" ? "#ef4444" : currentUserRole === "member" ? "#3b82f6" : "#94a3b8", border: "1px solid currentColor" }}>
            {currentUserRole === "admin" ? "Владелец" : currentUserRole === "member" ? "Участник" : "Наблюдатель"}
          </span>
          <div className="board-members">
            {members.map((m) => (
              <Avatar key={m} name={m} />
            ))}
          </div>
        </div>
        <div className="board-toolbar">
          {canManageColumns && (
            <div className="add-column-row">
              <input
                type="text"
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                placeholder="Добавить колонку..."
                onKeyDown={(e) => e.key === "Enter" && handleAddColumn()}
              />
              <button className="btn primary small" onClick={handleAddColumn}>
                + Колонку
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Горизонтально скроллируемая область колонок */}
      <div className="board-scroll">
        {project.columns.map((column) => (
          <div
            key={column.id}
            className={`board-column ${draggedOverColumnId === column.id ? "drag-hover" : ""}`}
            onDragOver={handleDragOver}
            onDragEnter={() => {
              if (currentUserRole !== "viewer") {
                setColumnCounters((prev) => {
                  const current = prev[column.id] || 0;
                  const next = current + 1;
                  if (next === 1) {
                    setDraggedOverColumnId(column.id);
                  }
                  return { ...prev, [column.id]: next };
                });
              }
            }}
            onDragLeave={() => {
              if (currentUserRole !== "viewer") {
                setColumnCounters((prev) => {
                  const current = prev[column.id] || 0;
                  const next = Math.max(0, current - 1);
                  if (next === 0) {
                    setDraggedOverColumnId((prevId) => (prevId === column.id ? null : prevId));
                  }
                  return { ...prev, [column.id]: next };
                });
              }
            }}
            onDrop={(e) => handleDrop(e, column.id)}
          >
            <div className="column-header">
              {editingColumnId === column.id ? (
                <input
                  className="column-title-input"
                  value={columnNameDraft}
                  onChange={(e) => setColumnNameDraft(e.target.value)}
                  onBlur={() => handleRenameColumn(column.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameColumn(column.id);
                    if (e.key === "Escape") setEditingColumnId(null);
                  }}
                  autoFocus
                />
              ) : (
                <div
                  className="column-title-clickable"
                  onClick={() => {
                    if (canManageColumns) {
                      setEditingColumnId(column.id);
                      setColumnNameDraft(column.name);
                    }
                  }}
                  style={{ cursor: canManageColumns ? "pointer" : "default" }}
                >
                  <h3 className="column-title">{column.name}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="task-count">{column.taskIds.length}</span>
                    {canManageColumns && (
                      <button 
                        className="btn icon-btn danger" 
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          if (window.confirm("Удалить эту колонку? Все задачи в ней также будут удалены.")) {
                            onDeleteColumn(project.id, column.id);
                          }
                        }}
                        title="Удалить колонку"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="column-tasks">
              {column.taskIds.map((taskId) => {
                const task = tasks[taskId];
                if (!task) return null;

                return (
                  <div
                    key={task.id}
                    className={`task-card ${task.completed ? "completed" : ""} ${currentUserRole === "viewer" ? "readonly" : ""}`}
                    draggable={currentUserRole !== "viewer"}
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => openTaskModal(task.id)}
                  >
                    {task.tags && task.tags.length > 0 && (
                      <div className="task-card-tags">
                        {task.tags.map((tag) => (
                          <span key={tag} className="tag-pill">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="task-card-badges">
                      {task.priority && (
                        <span className={`badge-pill priority-${task.priority === 'Критичный' ? 'critical' : task.priority === 'Высокий' ? 'high' : task.priority === 'Низкий' ? 'low' : 'medium'}`}>
                          {task.priority}
                        </span>
                      )}
                      {task.sprint && <span className="badge-pill sprint-badge">🏃 {task.sprint}</span>}
                    </div>

                    <h4 className="task-card-title">{task.title}</h4>

                    <div className="task-card-footer">
                      <div className="task-card-meta">
                        {task.estimate && (
                          <span className="meta-icon estimate">
                            ⏳ {task.estimate}
                          </span>
                        )}
                        {task.deadline && (
                          <span className="meta-icon due-date">
                            📅 {new Date(task.deadline).toLocaleDateString("ru-RU", { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                        {task.comments?.length > 0 && (
                          <span className="meta-icon">
                            💬 {task.comments.length}
                          </span>
                        )}
                      </div>
                      <Avatar name={task.assignedTo || "Unassigned"} />
                    </div>
                  </div>
                );
              })}

              {/* Форма быстрого добавления задачи (Скрыта для Viewer) */}
              {canEditTasks && (
                addingInColumn === column.id ? (
                  <div className="inline-add-task">
                    <input
                      type="text"
                      value={newTaskDraft.title}
                      onChange={(e) =>
                        setNewTaskDraft({ title: e.target.value })
                      }
                      placeholder="Название задачи..."
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddTask(column.id);
                        if (e.key === "Escape") setAddingInColumn(null);
                      }}
                    />
                    <div className="inline-add-actions">
                      <button
                        className="btn primary small"
                        onClick={() => handleAddTask(column.id)}
                      >
                        Добавить
                      </button>
                      <button
                        className="btn icon-btn"
                        onClick={() => setAddingInColumn(null)}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="add-task-trigger"
                    onClick={() => {
                      setAddingInColumn(column.id);
                      setNewTaskDraft({ title: "" });
                    }}
                  >
                    + Добавить задачу
                  </button>
                )
              )}
            </div>
          </div>
        ))}
      </div>

      {renderTaskModal()}
    </div>
  );
}
