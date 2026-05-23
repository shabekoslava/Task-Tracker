// src/components/ProjectBoard/ProjectBoard.jsx
import { useState, useEffect } from "react";
import "./ProjectBoard.css";

const Avatar = ({ name }) => {
  // Generate initials
  const initials = name
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
  return (
    <div className="avatar" title={name}>
      {initials || "?"}
    </div>
  );
};

const parseEstimate = (str) => {
  const res = { days: "", hours: "", minutes: "" };
  if (!str) return res;
  
  const dMatch = str.match(/(\d+)\s*[dд]/i);
  const hMatch = str.match(/(\d+)\s*[hч]/i);
  const mMatch = str.match(/(\d+)\s*[mм]/i);
  
  if (dMatch) res.days = parseInt(dMatch[1], 10);
  if (hMatch) res.hours = parseInt(hMatch[1], 10);
  if (mMatch) res.minutes = parseInt(mMatch[1], 10);
  
  if (!dMatch && !hMatch && !mMatch && /^\d+$/.test(str.trim())) {
    res.hours = parseInt(str.trim(), 10);
  }
  
  return res;
};

const formatEstimate = (days, hours, minutes) => {
  const parts = [];
  const d = parseInt(days, 10);
  const h = parseInt(hours, 10);
  const m = parseInt(minutes, 10);
  
  if (!isNaN(d) && d > 0) parts.push(`${d}д`);
  if (!isNaN(h) && h > 0) parts.push(`${h}ч`);
  if (!isNaN(m) && m > 0) parts.push(`${m}м`);
  
  return parts.join(" ");
};

// 📝 Secure Client-Side Markdown parser
const renderMarkdown = (text, onEditClick, canEdit) => {
  if (!text) {
    return (
      <div
        onClick={canEdit ? onEditClick : undefined}
        style={{
          fontStyle: "italic",
          color: "var(--nav-text-inactive)",
          cursor: canEdit ? "pointer" : "default",
          padding: "10px 14px",
          background: "rgba(255,255,255,0.02)",
          border: "1px dashed var(--border-color)",
          borderRadius: "8px",
        }}
      >
        Нажмите, чтобы добавить описание к задаче...
      </div>
    );
  }

  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  let html = escaped
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(
      /^# (.*?)$/gm,
      "<h4 style='margin: 10px 0 6px 0; font-weight: 700; color: var(--text-primary); font-size: 15px;'>$1</h4>",
    )
    .replace(
      /^## (.*?)$/gm,
      "<h5 style='margin: 8px 0 4px 0; font-weight: 600; color: var(--text-primary); font-size: 13.5px;'>$1</h5>",
    )
    .replace(
      /^- (.*?)$/gm,
      "<li style='margin-left: 16px; list-style-type: disc; margin-bottom: 4px;'>$1</li>",
    )
    .replace(/\n/g, "<br />");

  return (
    <div
      onClick={canEdit ? onEditClick : undefined}
      dangerouslySetInnerHTML={{ __html: html }}
      style={{
        color: "var(--text-primary)",
        fontSize: "13.5px",
        lineHeight: "1.6",
        padding: "12px 16px",
        background: "rgba(255,255,255,0.02)",
        border: "1px solid var(--border-color)",
        borderRadius: "8px",
        cursor: canEdit ? "pointer" : "default",
        minHeight: "60px",
      }}
      title={canEdit ? "Нажмите для редактирования" : undefined}
    />
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
  onDeleteTask,
  onMoveColumn,
  onAddComment,
  onToggleTaskComplete,
  onMoveTask,
  currentUserRole = "viewer", // "admin" | "member" | "viewer"
  onEditProject,
  onInviteUser,
  onChangeRole,
  onLeaveProject,
  currentUserId,
  initialViewMode = "board",
  onAddProjectTag,
  onRemoveProjectTag,
  initialActiveTaskId = null,
  onClearInitialActiveTaskId = () => {},
}) {
  const [newColumnName, setNewColumnName] = useState("");
  const [editingColumnId, setEditingColumnId] = useState(null);
  const [columnNameDraft, setColumnNameDraft] = useState("");

  // Tab View Mode
  const [viewMode, setViewMode] = useState(initialViewMode || "board"); // "board" | "settings"
  const [projectNameDraft, setProjectNameDraft] = useState(project.name || "");
  const [projectDescDraft, setProjectDescDraft] = useState(
    project.description || "",
  );
  const [inviteUserIdDraft, setInviteUserIdDraft] = useState("");
  const [inviteUserRoleDraft, setInviteUserRoleDraft] = useState("member");

  // Sync draft states when project changes
  useEffect(() => {
    setProjectNameDraft(project.name || "");
    setProjectDescDraft(project.description || "");
    setViewMode(initialViewMode || "board");
  }, [project.id, initialViewMode]);

  // Load real names mapping from localStorage
  const allUsers = JSON.parse(localStorage.getItem("auth_users") || "[]");
  const getUserName = (userId) => {
    if (!userId) return "Не назначено";
    if (userId === "Unassigned") return "Не назначено";
    const found = allUsers.find((u) => u.id === userId);
    return found ? found.name : userId;
  };
  const projectTags = project.tags || [
    "дизайн",
    "баг",
    "срочно",
    "фича",
    "фронтенд",
    "бэкенд",
  ];

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

  useEffect(() => {
    if (initialActiveTaskId && tasks[initialActiveTaskId]) {
      openTaskModal(initialActiveTaskId);
      onClearInitialActiveTaskId();
    }
  }, [initialActiveTaskId, tasks]);

  // --- Role Enforcements ---
  const canManageColumns = currentUserRole === "admin";
  const canEditTasks =
    currentUserRole === "admin" || currentUserRole === "member";
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
      tags: task.tags || [],
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

    onEditTask(project.id, activeTaskId, {
      ...editTaskDraft,
      tags: editTaskDraft.tags || [],
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
              <div className="field-group" style={{ marginBottom: "24px" }}>
                <label
                  style={{
                    marginBottom: "8px",
                    display: "block",
                    fontSize: "13.5px",
                    fontWeight: "600",
                    color: "var(--text-primary)",
                  }}
                >
                  Описание
                </label>
                <textarea
                  value={editTaskDraft.description || ""}
                  onChange={(e) =>
                    setEditTaskDraft({
                      ...editTaskDraft,
                      description: e.target.value,
                    })
                  }
                  placeholder="Добавьте описание к задаче..."
                  rows={6}
                  disabled={!canEditTasks}
                  style={{
                    fontFamily: "inherit",
                    fontSize: "14.5px",
                    lineHeight: "1.6",
                    width: "100%",
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "8px",
                    color: "var(--text-primary)",
                    padding: "12px",
                    resize: "vertical",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
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
                    <p className="no-comments">
                      Комментариев пока нет. Начните обсуждение!
                    </p>
                  )}
                </div>
                <div className="comment-input-area">
                  <input
                    type="text"
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    placeholder={
                      canComment
                        ? "Напишите комментарий или задайте вопрос..."
                        : "Комментарии отключены (режим просмотра)"
                    }
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
              <div className="sidebar-properties-grid" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div className="sidebar-property-row">
                  <span className="sidebar-property-label">⚙️ Статус</span>
                  <div className="sidebar-property-value">
                    <select
                      value={task.completed ? "Completed" : "Active"}
                      onChange={() => {
                        onToggleTaskComplete(project.id, task.id);
                      }}
                      disabled={!canEditTasks}
                      style={{
                        background: task.completed ? 'rgba(16, 185, 129, 0.15) !important' : 'rgba(59, 130, 246, 0.15) !important',
                        borderColor: task.completed ? '#10b981 !important' : '#3b82f6 !important',
                        color: task.completed ? '#10b981 !important' : '#3b82f6 !important',
                        fontWeight: '600'
                      }}
                    >
                      <option value="Active">🔘 В работе</option>
                      <option value="Completed">✅ Выполнена</option>
                    </select>
                  </div>
                </div>

                <div className="sidebar-property-row">
                  <span className="sidebar-property-label">👤 Исполнитель</span>
                  <div className="sidebar-property-value">
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
                      <option value="Unassigned">Не назначено</option>
                      {members.map((m) => (
                        <option key={m} value={m}>
                          {getUserName(m)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="sidebar-property-row">
                  <span className="sidebar-property-label">📅 Дедлайн</span>
                  <div className="sidebar-property-value">
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
                </div>

                <div className="sidebar-property-row">
                  <span className="sidebar-property-label">⏳ Время выполнения</span>
                  <div className="sidebar-property-value" style={{ display: 'flex', alignItems: 'center', position: 'relative', width: '100%' }}>
                    <input
                      type="number"
                      className="estimate-hours-input"
                      min="0"
                      placeholder="0"
                      value={editTaskDraft.estimate ? parseInt(editTaskDraft.estimate, 10) || "" : ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditTaskDraft({
                          ...editTaskDraft,
                          estimate: val ? `${val} ч` : "",
                        });
                      }}
                      disabled={!canEditTasks}
                    />
                    <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--nav-text-inactive)', fontSize: '13px', pointerEvents: 'none' }}>ч</span>
                  </div>
                </div>

                <div className="sidebar-property-row">
                  <span className="sidebar-property-label">🔥 Срочность</span>
                  <div className="sidebar-property-value">
                    <select
                      value={editTaskDraft.priority === "Срочно" || editTaskDraft.priority === "Критичный" || editTaskDraft.priority === "Высокий" ? "Срочно" : "Не срочно"}
                      onChange={(e) =>
                        setEditTaskDraft({
                          ...editTaskDraft,
                          priority: e.target.value,
                        })
                      }
                      disabled={!canEditTasks}
                    >
                      <option value="Не срочно">Не срочно</option>
                      <option value="Срочно">Срочно</option>
                    </select>
                  </div>
                </div>

                <div className="sidebar-property-row">
                  <span className="sidebar-property-label">🏃 Спринт</span>
                  <div className="sidebar-property-value">
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
                </div>
              </div>

              <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--nav-text-inactive)', fontSize: '13.5px', fontWeight: '500', marginBottom: '10px' }}>
                  🏷️ Теги задачи
                </label>
                <div className="task-modal-tags-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                  {(editTaskDraft.tags || []).map((tag) => (
                    <span 
                      key={tag} 
                      className="tag-pill" 
                      style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '4px',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        background: 'rgba(59, 130, 246, 0.15)',
                        color: '#3b82f6',
                        fontSize: '12px',
                        fontWeight: '500'
                      }}
                    >
                      {tag}
                      {canEditTasks && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditTaskDraft({
                              ...editTaskDraft,
                              tags: editTaskDraft.tags.filter((t) => t !== tag),
                            });
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#ef4444',
                            fontSize: '12px',
                            padding: '0 2px',
                            lineHeight: 1,
                          }}
                          title="Убрать тег"
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                  {(editTaskDraft.tags || []).length === 0 && (
                    <span style={{ fontSize: '12.5px', color: 'var(--nav-text-inactive)', fontStyle: 'italic' }}>Нет тегов</span>
                  )}
                </div>

                {canEditTasks && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <select
                      value=""
                      onChange={(e) => {
                        const selectedTag = e.target.value;
                        if (selectedTag && !(editTaskDraft.tags || []).includes(selectedTag)) {
                          setEditTaskDraft({
                            ...editTaskDraft,
                            tags: [...(editTaskDraft.tags || []), selectedTag],
                          });
                        }
                      }}
                      style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', outline: 'none', width: '100%', cursor: 'pointer' }}
                    >
                      <option value="">+ Выбрать из списка...</option>
                      {projectTags
                        .filter((tag) => !(editTaskDraft.tags || []).includes(tag))
                        .map((tag) => (
                          <option key={tag} value={tag}>
                            {tag}
                          </option>
                        ))}
                    </select>
                    <div style={{ display: 'flex', gap: '2px', width: '100%' }}>
                      <input
                        type="text"
                        id="new-task-custom-tag-input"
                        placeholder="Свой новый тег..."
                        style={{ flex: 1, padding: '8px 10px', fontSize: '13px', borderRadius: '6px 0 0 6px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRight: 'none', color: 'var(--text-primary)', outline: 'none' }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const val = e.target.value.trim();
                            if (val) {
                              if (!(editTaskDraft.tags || []).includes(val)) {
                                setEditTaskDraft({
                                  ...editTaskDraft,
                                  tags: [...(editTaskDraft.tags || []), val],
                                });
                              }
                              onAddProjectTag(project.id, val);
                              e.target.value = '';
                            }
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const el = document.getElementById('new-task-custom-tag-input');
                          const val = el ? el.value.trim() : '';
                          if (val) {
                            if (!(editTaskDraft.tags || []).includes(val)) {
                              setEditTaskDraft({
                                ...editTaskDraft,
                                tags: [...(editTaskDraft.tags || []), val],
                              });
                            }
                            onAddProjectTag(project.id, val);
                            if (el) el.value = '';
                          }
                        }}
                        style={{
                          background: 'var(--accent-color)',
                          border: 'none',
                          color: '#fff',
                          padding: '0 12px',
                          borderRadius: '0 6px 6px 0',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: 'bold',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="modal-footer">
            {canEditTasks && (
              <button
                className="btn danger"
                style={{ marginRight: "auto" }}
                onClick={() => {
                  if (
                    window.confirm(
                      "Вы действительно хотите удалить эту задачу?",
                    )
                  ) {
                    onDeleteTask(project.id, activeTaskId);
                    closeTaskModal();
                  }
                }}
              >
                🗑️ Удалить задачу
              </button>
            )}
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
      <div
        className="board-header-section"
        style={{
          borderBottom: "1px solid var(--border-color)",
          paddingBottom: "20px",
        }}
      >
        <div className="board-title-area">
          <h2>{project.name}</h2>
          <span
            className="role-tag-badge"
            style={{
              fontSize: "11px",
              fontWeight: "600",
              textTransform: "uppercase",
              padding: "2px 8px",
              borderRadius: "10px",
              backgroundColor:
                currentUserRole === "admin"
                  ? "rgba(239, 68, 68, 0.15)"
                  : currentUserRole === "member"
                    ? "rgba(59, 130, 246, 0.15)"
                    : "rgba(148, 163, 184, 0.15)",
              color:
                currentUserRole === "admin"
                  ? "#ef4444"
                  : currentUserRole === "member"
                    ? "#3b82f6"
                    : "#94a3b8",
              border: "1px solid currentColor",
            }}
          >
            {currentUserRole === "admin"
              ? "Владелец"
              : currentUserRole === "member"
                ? "Участник"
                : "Наблюдатель"}
          </span>
          <div className="board-members">
            {members.map((m) => (
              <Avatar key={m} name={getUserName(m)} />
            ))}
          </div>
        </div>

        {/* Toggle Mode & Actions Toolbar */}
        <div
          className="board-toolbar"
          style={{ display: "flex", gap: "12px", alignItems: "center" }}
        >
          <div
            className="view-mode-tabs"
            style={{
              display: "flex",
              background: "rgba(0, 0, 0, 0.2)",
              padding: "4px",
              borderRadius: "8px",
              border: "1px solid var(--border-color)",
            }}
          >
            <button
              className={`btn small ${viewMode === "board" ? "primary" : "secondary"}`}
              style={{
                background:
                  viewMode === "board" ? "var(--btn-primary)" : "transparent",
                color:
                  viewMode === "board" ? "#ffffff" : "var(--nav-text-inactive)",
                border: "none",
                boxShadow: "none",
              }}
              onClick={() => setViewMode("board")}
            >
              📋 Доска
            </button>
            <button
              className={`btn small ${viewMode === "settings" ? "primary" : "secondary"}`}
              style={{
                background:
                  viewMode === "settings"
                    ? "var(--btn-primary)"
                    : "transparent",
                color:
                  viewMode === "settings"
                    ? "#ffffff"
                    : "var(--nav-text-inactive)",
                border: "none",
                boxShadow: "none",
              }}
              onClick={() => setViewMode("settings")}
            >
              ⚙️ Настройки
            </button>
          </div>

          {viewMode === "board" && canManageColumns && (
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

      {viewMode === "settings" ? (
        <div
          className="project-settings-container page-fade-in"
          style={{
            padding: "24px",
            background: "var(--bg-surface)",
            borderRadius: "16px",
            border: "1px solid var(--border-color)",
            marginTop: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
            overflowY: "auto",
            flex: 1,
          }}
        >
          <div>
            <h3
              style={{
                fontSize: "20px",
                fontWeight: "700",
                marginBottom: "4px",
                color: "var(--text-primary)",
              }}
            >
              Параметры проекта
            </h3>
            <p
              style={{
                color: "var(--nav-text-inactive)",
                fontSize: "13.5px",
                margin: 0,
              }}
            >
              Управляйте описанием, ролями и составом вашей команды в этом
              проекте.
            </p>
          </div>

          <div className="project-settings-grid">
            {/* Left Side: General Info */}
            <div
              style={{ display: "flex", flexDirection: "column", gap: "20px" }}
            >
              <div className="field-group" style={{ margin: 0 }}>
                <label>Название проекта</label>
                <input
                  type="text"
                  value={projectNameDraft}
                  onChange={(e) => setProjectNameDraft(e.target.value)}
                  placeholder="Название проекта"
                  disabled={currentUserRole !== "admin"}
                  style={{
                    padding: "12px",
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-color)",
                  }}
                />
              </div>

              <div className="field-group" style={{ margin: 0 }}>
                <label>Описание проекта</label>
                <textarea
                  value={projectDescDraft}
                  onChange={(e) => setProjectDescDraft(e.target.value)}
                  placeholder={
                    currentUserRole === "admin"
                      ? "Добавьте описание проекта..."
                      : "Описание проекта отсутствует"
                  }
                  disabled={currentUserRole !== "admin"}
                  rows={6}
                  style={{
                    padding: "12px",
                    resize: "vertical",
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-color)",
                  }}
                />
              </div>

              {currentUserRole === "admin" && (
                <button
                  className="btn primary"
                  onClick={() => {
                    if (!projectNameDraft.trim()) return;
                    onEditProject(project.id, {
                      name: projectNameDraft.trim(),
                      description: projectDescDraft.trim(),
                    });
                    alert("Изменения сохранены!");
                  }}
                  style={{ alignSelf: "flex-start" }}
                >
                  Сохранить настройки
                </button>
              )}
            </div>

            {/* Right Side: Members & Roles */}
            <div
              style={{ display: "flex", flexDirection: "column", gap: "20px" }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "var(--nav-text-inactive)",
                    marginBottom: "8px",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Участники команды ({project.members.length})
                </label>

                <div
                  style={{
                    background: "rgba(0, 0, 0, 0.15)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "12px",
                    overflow: "hidden",
                  }}
                >
                  {project.members.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "12px 16px",
                        borderBottom: "1px solid var(--border-color)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                        }}
                      >
                        <Avatar name={getUserName(m.id)} />
                        <div
                          style={{ display: "flex", flexDirection: "column" }}
                        >
                          <span
                            style={{
                              fontSize: "14.5px",
                              fontWeight: "600",
                              color: "var(--text-primary)",
                            }}
                          >
                            {getUserName(m.id)}{" "}
                            {m.id === currentUserId && " (Вы)"}
                          </span>
                          <span
                            style={{
                              fontSize: "11px",
                              color: "var(--nav-text-inactive)",
                              fontFamily: "monospace",
                            }}
                          >
                            ID: {m.id}
                          </span>
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                        }}
                      >
                        {currentUserRole === "admin" &&
                        m.id !== currentUserId ? (
                          <>
                            <select
                              value={m.role}
                              onChange={(e) =>
                                onChangeRole(project.id, m.id, e.target.value)
                              }
                              style={{
                                padding: "6px 10px",
                                fontSize: "13px",
                                borderRadius: "6px",
                                background: "var(--bg-card)",
                                border: "1px solid var(--border-color)",
                                color: "var(--text-primary)",
                              }}
                            >
                              <option value="admin">Админ</option>
                              <option value="member">Участник</option>
                              <option value="viewer">Наблюдатель</option>
                            </select>
                            <button
                              className="btn icon-btn danger"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Вы действительно хотите исключить участника ${getUserName(m.id)} из проекта?`,
                                  )
                                ) {
                                  onLeaveProject(project.id, m.id);
                                }
                              }}
                              title="Удалить участника"
                              style={{ padding: "4px 8px", fontSize: "16px" }}
                            >
                              ×
                            </button>
                          </>
                        ) : (
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: "700",
                              textTransform: "uppercase",
                              padding: "3px 8px",
                              borderRadius: "6px",
                              backgroundColor:
                                m.role === "admin"
                                  ? "rgba(239, 68, 68, 0.15)"
                                  : m.role === "member"
                                    ? "rgba(59, 130, 246, 0.15)"
                                    : "rgba(148, 163, 184, 0.15)",
                              color:
                                m.role === "admin"
                                  ? "#ef4444"
                                  : m.role === "member"
                                    ? "#3b82f6"
                                    : "#94a3b8",
                            }}
                          >
                            {m.role === "admin"
                              ? "Админ"
                              : m.role === "member"
                                ? "Участник"
                                : "Наблюдатель"}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick Invite User Box */}
              {currentUserRole !== "viewer" && (
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "12px",
                    padding: "16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  <h4
                    style={{
                      margin: 0,
                      fontSize: "14px",
                      fontWeight: "600",
                      color: "var(--text-primary)",
                    }}
                  >
                    Добавить участника
                  </h4>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <input
                      type="text"
                      value={inviteUserIdDraft}
                      onChange={(e) => setInviteUserIdDraft(e.target.value)}
                      placeholder="Введите ID пользователя (напр. INV-1234)"
                      style={{
                        flex: 1,
                        padding: "10px 14px",
                        background: "var(--bg-card)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "8px",
                        color: "var(--text-primary)",
                        fontSize: "13.5px",
                      }}
                    />
                    <select
                      value={inviteUserRoleDraft}
                      onChange={(e) => setInviteUserRoleDraft(e.target.value)}
                      style={{
                        padding: "10px 12px",
                        background: "var(--bg-card)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "8px",
                        color: "var(--text-primary)",
                        fontSize: "13.5px",
                      }}
                    >
                      <option value="member">Участник</option>
                      <option value="viewer">Наблюдатель</option>
                      <option value="admin">Админ</option>
                    </select>
                    <button
                      className="btn primary small"
                      onClick={() => {
                        if (!inviteUserIdDraft.trim()) return;
                        const success = onInviteUser(
                          project.id,
                          inviteUserIdDraft.trim(),
                          inviteUserRoleDraft,
                        );
                        if (success) {
                          alert("Участник добавлен!");
                          setInviteUserIdDraft("");
                          setInviteUserRoleDraft("member");
                        } else {
                          alert(
                            "Не удалось добавить: проверьте ID или пользователь уже состоит в проекте.",
                          );
                        }
                      }}
                    >
                      Добавить
                    </button>
                  </div>
                </div>
              )}

              {/* Project Tags Management Box */}
              <div
                style={{
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "12px",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <h4
                  style={{
                    margin: 0,
                    fontSize: "14px",
                    fontWeight: "600",
                    color: "#ffffff",
                  }}
                >
                  Управление тегами проекта
                </h4>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {projectTags.map((tag) => (
                    <span
                      key={tag}
                      className="tag-pill"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "4px 10px",
                        borderRadius: "6px",
                        background: "var(--hover-color)",
                        border: "1px solid var(--border-color)",
                        color: "var(--text-primary)",
                        fontSize: "12.5px",
                        fontWeight: "500",
                      }}
                    >
                      {tag}
                      {currentUserRole === "admin" && (
                        <button
                          type="button"
                          onClick={() => onRemoveProjectTag(project.id, tag)}
                          style={{
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            color: "#ef4444",
                            fontSize: "13px",
                            padding: "0 2px",
                            lineHeight: 1,
                          }}
                          title="Удалить тег из проекта"
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                  {projectTags.length === 0 && (
                    <span
                      style={{
                        fontSize: "13px",
                        color: "var(--nav-text-inactive)",
                        fontStyle: "italic",
                      }}
                    >
                      Теги отсутствуют
                    </span>
                  )}
                </div>

                {currentUserRole === "admin" && (
                  <div style={{ display: "flex", gap: "10px" }}>
                    <input
                      type="text"
                      id="new-project-master-tag-input"
                      placeholder="Название нового тега..."
                      style={{
                        flex: 1,
                        padding: "10px 14px",
                        background: "var(--bg-card)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "8px",
                        color: "var(--text-primary)",
                        fontSize: "13.5px",
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const val = e.target.value.trim();
                          if (val) {
                            onAddProjectTag(project.id, val);
                            e.target.value = "";
                          }
                        }
                      }}
                    />
                    <button
                      className="btn primary small"
                      onClick={() => {
                        const el = document.getElementById(
                          "new-project-master-tag-input",
                        );
                        const val = el ? el.value.trim() : "";
                        if (val) {
                          onAddProjectTag(project.id, val);
                          if (el) el.value = "";
                        }
                      }}
                    >
                      Добавить
                    </button>
                  </div>
                )}
              </div>

              {/* Leave project button (for non-admins or anyone) */}
              <button
                className="btn danger"
                onClick={() => {
                  if (
                    window.confirm(
                      "Вы действительно хотите покинуть этот проект?",
                    )
                  ) {
                    onLeaveProject(project.id, currentUserId);
                  }
                }}
                style={{ alignSelf: "flex-start", marginTop: "10px" }}
              >
                Выйти из проекта
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="board-scroll">
          {project.columns.map((column, colIndex) => (
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
                      setDraggedOverColumnId((prevId) =>
                        prevId === column.id ? null : prevId,
                      );
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
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      {canManageColumns && (
                        <div
                          className="column-arrows"
                          style={{ display: "flex", gap: "2px" }}
                        >
                          <button
                            className="btn icon-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              onMoveColumn(project.id, column.id, "left");
                            }}
                            disabled={colIndex === 0}
                            title="Переместить влево"
                            style={{
                              padding: "2px 4px",
                              fontSize: "11px",
                              opacity: colIndex === 0 ? 0.25 : 0.7,
                              cursor:
                                colIndex === 0 ? "not-allowed" : "pointer",
                            }}
                          >
                            ◀
                          </button>
                          <button
                            className="btn icon-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              onMoveColumn(project.id, column.id, "right");
                            }}
                            disabled={colIndex === project.columns.length - 1}
                            title="Переместить вправо"
                            style={{
                              padding: "2px 4px",
                              fontSize: "11px",
                              opacity:
                                colIndex === project.columns.length - 1
                                  ? 0.25
                                  : 0.7,
                              cursor:
                                colIndex === project.columns.length - 1
                                  ? "not-allowed"
                                  : "pointer",
                            }}
                          >
                            ▶
                          </button>
                        </div>
                      )}
                      <span className="task-count">
                        {column.taskIds.length}
                      </span>
                      {canManageColumns && (
                        <button
                          className="btn icon-btn danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (
                              window.confirm(
                                "Удалить эту колонку? Все задачи в ней также будут удалены.",
                              )
                            ) {
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
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "8px",
                          marginBottom: "8px",
                        }}
                      >
                        {canEditTasks && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleTaskComplete(project.id, task.id);
                            }}
                            title={
                              task.completed
                                ? "Отменить выполнение"
                                : "Отметить выполненной"
                            }
                            style={{
                              background: "transparent",
                              border: "none",
                              cursor: "pointer",
                              fontSize: "17px",
                              padding: 0,
                              marginTop: "1px",
                              lineHeight: 1,
                              color: task.completed ? "var(--accent-color)" : "var(--nav-text-inactive)",
                              transition: "color 0.2s, transform 0.1s",
                              outline: "none",
                            }}
                            onMouseEnter={(e) => {
                              e.target.style.transform = "scale(1.15)";
                            }}
                            onMouseLeave={(e) => {
                              e.target.style.transform = "scale(1)";
                            }}
                          >
                            {task.completed ? "☑" : "☐"}
                          </button>
                        )}
                        <h4
                          className="task-card-title"
                          style={{
                            margin: 0,
                            flex: 1,
                            fontSize: "14px",
                            fontWeight: "600",
                            color: "var(--text-primary)",
                            textDecoration: task.completed ? "line-through" : "none",
                            opacity: task.completed ? 0.6 : 1,
                            lineHeight: "1.4",
                          }}
                        >
                          {task.title}
                        </h4>
                      </div>

                      {task.tags && task.tags.length > 0 && (
                        <div className="task-card-tags" style={{ marginBottom: "6px" }}>
                          {task.tags.map((tag) => (
                            <span key={tag} className="tag-pill">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="task-card-badges" style={{ marginBottom: "8px" }}>
                        {task.priority === "Срочно" || task.priority === "Критичный" || task.priority === "Высокий" ? (
                          <span
                            className="badge-pill priority-critical"
                            style={{
                              background: "rgba(239, 68, 68, 0.15)",
                              color: "#ef4444",
                              fontWeight: "600",
                            }}
                          >
                            🔥 Срочно
                          </span>
                        ) : (
                          <span
                            className="badge-pill priority-low"
                            style={{
                              background: "rgba(148, 163, 184, 0.15)",
                              color: "#94a3b8",
                              fontWeight: "500",
                            }}
                          >
                            Не срочно
                          </span>
                        )}
                        {task.sprint && (
                          <span className="badge-pill sprint-badge">
                            🏃 {task.sprint}
                          </span>
                        )}
                      </div>

                      <div className="task-card-footer">
                        <div className="task-card-meta">
                          {task.estimate && (
                            <span className="meta-icon estimate">
                              ⏳ {task.estimate}
                            </span>
                          )}
                          {task.deadline && (
                            <span className="meta-icon due-date">
                              📅{" "}
                              {new Date(task.deadline).toLocaleDateString(
                                "ru-RU",
                                { day: "numeric", month: "short" },
                              )}
                            </span>
                          )}
                          {task.comments?.length > 0 && (
                            <span className="meta-icon">
                              💬 {task.comments.length}
                            </span>
                          )}
                        </div>
                        <Avatar
                          name={getUserName(task.assignedTo || "Unassigned")}
                        />
                      </div>
                    </div>
                  );
                })}

                {/* Форма быстрого добавления задачи (Скрыта для Viewer) */}
                {canEditTasks &&
                  (addingInColumn === column.id ? (
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
                  ))}
              </div>
            </div>
          ))}
          {canManageColumns && (
            <div
              className="board-column add-column-special-card"
              style={{
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px dashed var(--border-color)",
                justifyContent: "center",
                alignItems: "center",
                padding: "20px",
                height: "fit-content",
                minHeight: "100px",
                alignSelf: "flex-start",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  width: "100%",
                }}
              >
                <h4
                  style={{
                    margin: 0,
                    fontSize: "14px",
                    fontWeight: "600",
                    color: "var(--text-primary)",
                  }}
                >
                  Добавить колонку
                </h4>
                <input
                  type="text"
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  placeholder="Название новой колонки..."
                  onKeyDown={(e) => e.key === "Enter" && handleAddColumn()}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                    background: "var(--bg-card)",
                    color: "var(--text-primary)",
                    outline: "none",
                    fontSize: "13.5px",
                  }}
                />
                <button
                  className="btn primary full-width"
                  onClick={handleAddColumn}
                  style={{ marginTop: 0 }}
                >
                  + Добавить колонку
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {renderTaskModal()}
    </div>
  );
}
