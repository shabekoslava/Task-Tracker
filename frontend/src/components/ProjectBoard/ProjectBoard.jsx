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

// 📝 Secure Client-Side Markdown parser
const renderMarkdown = (text, onEditClick, canEdit) => {
  if (!text) {
    return (
      <div 
        onClick={canEdit ? onEditClick : undefined}
        style={{ fontStyle: 'italic', color: 'var(--nav-text-inactive)', cursor: canEdit ? 'pointer' : 'default', padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border-color)', borderRadius: '8px' }}
      >
        Описание отсутствует. Нажмите, чтобы добавить...
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
    .replace(/^# (.*?)$/gm, "<h4 style='margin: 10px 0 6px 0; font-weight: 700; color: var(--text-primary); font-size: 15px;'>$1</h4>")
    .replace(/^## (.*?)$/gm, "<h5 style='margin: 8px 0 4px 0; font-weight: 600; color: var(--text-primary); font-size: 13.5px;'>$1</h5>")
    .replace(/^- (.*?)$/gm, "<li style='margin-left: 16px; list-style-type: disc; margin-bottom: 4px;'>$1</li>")
    .replace(/\n/g, "<br />");

  return (
    <div 
      onClick={canEdit ? onEditClick : undefined}
      dangerouslySetInnerHTML={{ __html: html }} 
      style={{ 
        color: 'var(--text-primary)', 
        fontSize: '13.5px', 
        lineHeight: '1.6', 
        padding: '12px 16px', 
        background: 'rgba(255,255,255,0.02)', 
        border: '1px solid var(--border-color)', 
        borderRadius: '8px',
        cursor: canEdit ? 'pointer' : 'default',
        minHeight: '60px'
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
}) {
  const [newColumnName, setNewColumnName] = useState("");
  const [editingColumnId, setEditingColumnId] = useState(null);
  const [columnNameDraft, setColumnNameDraft] = useState("");

  // Tab View Mode
  const [viewMode, setViewMode] = useState(initialViewMode || "board"); // "board" | "settings"
  const [projectNameDraft, setProjectNameDraft] = useState(project.name || "");
  const [projectDescDraft, setProjectDescDraft] = useState(project.description || "");
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
  const projectTags = project.tags || ["дизайн", "баг", "срочно", "фича", "фронтенд", "бэкенд"];

  // Modal State
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [editTaskDraft, setEditTaskDraft] = useState({});
  const [commentDraft, setCommentDraft] = useState("");
  const [descViewMode, setDescViewMode] = useState("preview"); // "edit" | "preview"

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
    setDescViewMode("preview");
    setEditTaskDraft({
      title: task.title,
      description: task.description || "",
      assignedTo: task.assignedTo || members[0] || "",
      tags: task.tags || [],
      subtasks: task.subtasks || [],
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
              <div className="field-group" style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ margin: 0 }}>Описание (с поддержкой Markdown)</label>
                  {canEditTasks && (
                    <div style={{ display: 'flex', gap: '4px', background: 'rgba(0, 0, 0, 0.2)', padding: '2px', borderRadius: '4px' }}>
                      <button 
                        type="button"
                        onClick={() => setDescViewMode("edit")}
                        style={{ background: descViewMode === 'edit' ? 'var(--accent-color)' : 'transparent', color: '#ffffff', border: 'none', padding: '2px 8px', borderRadius: '3px', fontSize: '11px', cursor: 'pointer' }}
                      >
                        Редактор
                      </button>
                      <button 
                        type="button"
                        onClick={() => setDescViewMode("preview")}
                        style={{ background: descViewMode === 'preview' ? 'var(--accent-color)' : 'transparent', color: '#ffffff', border: 'none', padding: '2px 8px', borderRadius: '3px', fontSize: '11px', cursor: 'pointer' }}
                      >
                        Предпросмотр
                      </button>
                    </div>
                  )}
                </div>
                
                {descViewMode === "edit" && canEditTasks ? (
                  <textarea
                    value={editTaskDraft.description}
                    onChange={(e) =>
                      setEditTaskDraft({
                        ...editTaskDraft,
                        description: e.target.value,
                      })
                    }
                    placeholder="Добавьте подробное описание. Поддерживаются **жирный**, *курсив*, # заголовки и - списки..."
                    rows={6}
                    style={{ fontFamily: 'inherit', fontSize: '14px', lineHeight: '1.6' }}
                  />
                ) : (
                  renderMarkdown(
                    editTaskDraft.description, 
                    () => setDescViewMode("edit"), 
                    canEditTasks
                  )
                )}
              </div>

              {/* Чек-лист подзадач */}
              <div className="subtasks-section" style={{ marginBottom: '24px', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>📋 Чек-лист подзадач</h4>
                  {editTaskDraft.subtasks && editTaskDraft.subtasks.length > 0 && (
                    <span style={{ fontSize: '12px', color: 'var(--nav-text-inactive)' }}>
                      {editTaskDraft.subtasks.filter(s => s.completed).length} из {editTaskDraft.subtasks.length} ({Math.round((editTaskDraft.subtasks.filter(s => s.completed).length / editTaskDraft.subtasks.length) * 100)}%)
                    </span>
                  )}
                </div>

                {/* Subtask Progress Bar */}
                {editTaskDraft.subtasks && editTaskDraft.subtasks.length > 0 && (
                  <div className="progress-bar-track" style={{ height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden', marginBottom: '16px' }}>
                    <div 
                      className="progress-bar-fill" 
                      style={{ 
                        width: `${Math.round((editTaskDraft.subtasks.filter(s => s.completed).length / editTaskDraft.subtasks.length) * 100)}%`, 
                        height: '100%', 
                        background: 'var(--accent-color)', 
                        borderRadius: '3px', 
                        transition: 'width 0.3s ease' 
                      }}
                    ></div>
                  </div>
                )}

                {/* List of subtasks */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                  {(editTaskDraft.subtasks || []).map((subtask) => (
                    <div key={subtask.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0, fontSize: '13.5px', color: subtask.completed ? 'var(--nav-text-inactive)' : 'var(--text-primary)', textDecoration: subtask.completed ? 'line-through' : 'none', flex: 1, textTransform: 'none', letterSpacing: 'normal' }}>
                        <input
                          type="checkbox"
                          checked={subtask.completed}
                          disabled={!canEditTasks}
                          onChange={(e) => {
                            const updatedSubtasks = editTaskDraft.subtasks.map((s) =>
                              s.id === subtask.id ? { ...s, completed: e.target.checked } : s
                            );
                            setEditTaskDraft({
                              ...editTaskDraft,
                              subtasks: updatedSubtasks
                            });
                          }}
                          style={{ width: 'auto', margin: 0, cursor: 'pointer' }}
                        />
                        {subtask.title}
                      </label>
                      {canEditTasks && (
                        <button
                          type="button"
                          onClick={() => {
                            const updatedSubtasks = editTaskDraft.subtasks.filter((s) => s.id !== subtask.id);
                            setEditTaskDraft({
                              ...editTaskDraft,
                              subtasks: updatedSubtasks
                            });
                          }}
                          style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px', padding: '0 4px', lineHeight: 1 }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  {(editTaskDraft.subtasks || []).length === 0 && (
                    <p style={{ color: 'var(--nav-text-inactive)', fontSize: '13px', fontStyle: 'italic', margin: 0 }}>Подзадачи пока отсутствуют</p>
                  )}
                </div>

                {/* Add new subtask form */}
                {canEditTasks && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      id="new-subtask-title-input"
                      placeholder="Напишите название подзадачи..."
                      style={{ flex: 1, padding: '8px 12px', fontSize: '13.5px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const val = e.target.value.trim();
                          if (val) {
                            const newSubtask = {
                              id: `sub-${Date.now()}`,
                              title: val,
                              completed: false
                            };
                            setEditTaskDraft({
                              ...editTaskDraft,
                              subtasks: [...(editTaskDraft.subtasks || []), newSubtask]
                            });
                            e.target.value = '';
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn primary small"
                      onClick={() => {
                        const el = document.getElementById('new-subtask-title-input');
                        const val = el ? el.value.trim() : '';
                        if (val) {
                          const newSubtask = {
                            id: `sub-${Date.now()}`,
                            title: val,
                            completed: false
                          };
                          setEditTaskDraft({
                            ...editTaskDraft,
                            subtasks: [...(editTaskDraft.subtasks || []), newSubtask]
                          });
                          if (el) el.value = '';
                        }
                      }}
                    >
                      Добавить
                    </button>
                  </div>
                )}
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
                  <option value="Unassigned">Не назначено</option>
                  {members.map((m) => (
                    <option key={m} value={m}>
                      {getUserName(m)}
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
                <label>Теги задачи</label>
                <div className="task-modal-tags-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
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
                    <span style={{ fontSize: '12px', color: 'var(--nav-text-inactive)', fontStyle: 'italic' }}>Нет активных тегов</span>
                  )}
                </div>

                {canEditTasks && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {/* Select tag from project master list */}
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
                      style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    >
                      <option value="" style={{ color: 'var(--text-primary)', background: 'var(--bg-card)' }}>-- Добавить тег из проекта --</option>
                      {projectTags
                        .filter((tag) => !(editTaskDraft.tags || []).includes(tag))
                        .map((tag) => (
                          <option key={tag} value={tag} style={{ color: 'var(--text-primary)', background: 'var(--bg-card)' }}>
                            {tag}
                          </option>
                        ))}
                    </select>

                    {/* Quickly add a brand new tag to project + task */}
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input
                        type="text"
                        id="new-task-custom-tag-input"
                        placeholder="Создать новый тег..."
                        style={{ flex: 1, padding: '6px 10px', fontSize: '13px', borderRadius: '6px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
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
                        className="btn secondary small"
                        style={{ padding: '4px 10px' }}
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
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}
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
      <div className="board-header-section" style={{ borderBottom: "1px solid var(--border-color)", paddingBottom: "20px" }}>
        <div className="board-title-area">
          <h2>{project.name}</h2>
          <span className="role-tag-badge" style={{ fontSize: "11px", fontWeight: "600", textTransform: "uppercase", padding: "2px 8px", borderRadius: "10px", backgroundColor: currentUserRole === "admin" ? "rgba(239, 68, 68, 0.15)" : currentUserRole === "member" ? "rgba(59, 130, 246, 0.15)" : "rgba(148, 163, 184, 0.15)", color: currentUserRole === "admin" ? "#ef4444" : currentUserRole === "member" ? "#3b82f6" : "#94a3b8", border: "1px solid currentColor" }}>
            {currentUserRole === "admin" ? "Владелец" : currentUserRole === "member" ? "Участник" : "Наблюдатель"}
          </span>
          <div className="board-members">
            {members.map((m) => (
              <Avatar key={m} name={getUserName(m)} />
            ))}
          </div>
        </div>
        
        {/* Toggle Mode & Actions Toolbar */}
        <div className="board-toolbar" style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <div className="view-mode-tabs" style={{ display: "flex", background: "rgba(0, 0, 0, 0.2)", padding: "4px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
            <button
              className={`btn small ${viewMode === "board" ? "primary" : "secondary"}`}
              style={{ background: viewMode === "board" ? "var(--btn-primary)" : "transparent", color: viewMode === "board" ? "#ffffff" : "var(--nav-text-inactive)", border: "none", boxShadow: "none" }}
              onClick={() => setViewMode("board")}
            >
              📋 Доска
            </button>
            <button
              className={`btn small ${viewMode === "settings" ? "primary" : "secondary"}`}
              style={{ background: viewMode === "settings" ? "var(--btn-primary)" : "transparent", color: viewMode === "settings" ? "#ffffff" : "var(--nav-text-inactive)", border: "none", boxShadow: "none" }}
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
        <div className="project-settings-container page-fade-in" style={{ padding: '24px', background: 'var(--bg-surface)', borderRadius: '16px', border: '1px solid var(--border-color)', marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '24px', overflowY: 'auto', flex: 1 }}>
          <div>
            <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '4px', color: 'var(--text-primary)' }}>Параметры проекта</h3>
            <p style={{ color: 'var(--nav-text-inactive)', fontSize: '13.5px', margin: 0 }}>Управляйте описанием, ролями и составом вашей команды в этом проекте.</p>
          </div>

          <div className="project-settings-grid">
            {/* Left Side: General Info */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="field-group" style={{ margin: 0 }}>
                <label>Название проекта</label>
                <input
                  type="text"
                  value={projectNameDraft}
                  onChange={(e) => setProjectNameDraft(e.target.value)}
                  placeholder="Название проекта"
                  disabled={currentUserRole !== "admin"}
                  style={{ padding: '12px', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
                />
              </div>

              <div className="field-group" style={{ margin: 0 }}>
                <label>Описание проекта</label>
                <textarea
                  value={projectDescDraft}
                  onChange={(e) => setProjectDescDraft(e.target.value)}
                  placeholder={currentUserRole === "admin" ? "Добавьте описание проекта..." : "Описание проекта отсутствует"}
                  disabled={currentUserRole !== "admin"}
                  rows={6}
                  style={{ padding: '12px', resize: 'vertical', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
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
                    alert("Настройки проекта успешно сохранены!");
                  }}
                  style={{ alignSelf: 'flex-start' }}
                >
                  Сохранить настройки
                </button>
              )}
            </div>

            {/* Right Side: Members & Roles */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--nav-text-inactive)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Участники команды ({project.members.length})
                </label>
                
                <div style={{ background: 'rgba(0, 0, 0, 0.15)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' }}>
                  {project.members.map((m) => (
                    <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Avatar name={getUserName(m.id)} />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '14.5px', fontWeight: '600', color: 'var(--text-primary)' }}>
                            {getUserName(m.id)} {m.id === currentUserId && " (Вы)"}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--nav-text-inactive)', fontFamily: 'monospace' }}>ID: {m.id}</span>
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {currentUserRole === "admin" && m.id !== currentUserId ? (
                          <>
                            <select
                              value={m.role}
                              onChange={(e) => onChangeRole(project.id, m.id, e.target.value)}
                              style={{ padding: '6px 10px', fontSize: '13px', borderRadius: '6px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                            >
                              <option value="admin">Админ</option>
                              <option value="member">Участник</option>
                              <option value="viewer">Наблюдатель</option>
                            </select>
                            <button
                              className="btn icon-btn danger"
                              onClick={() => {
                                if (window.confirm(`Вы действительно хотите исключить участника ${getUserName(m.id)} из проекта?`)) {
                                  onLeaveProject(project.id, m.id);
                                }
                              }}
                              title="Удалить участника"
                              style={{ padding: '4px 8px', fontSize: '16px' }}
                            >
                              ×
                            </button>
                          </>
                        ) : (
                          <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', padding: '3px 8px', borderRadius: '6px', backgroundColor: m.role === 'admin' ? 'rgba(239, 68, 68, 0.15)' : m.role === 'member' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(148, 163, 184, 0.15)', color: m.role === 'admin' ? '#ef4444' : m.role === 'member' ? '#3b82f6' : '#94a3b8' }}>
                            {m.role === 'admin' ? 'Админ' : m.role === 'member' ? 'Участник' : 'Наблюдатель'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick Invite User Box (Admin Only) */}
              {currentUserRole === "admin" && (
                <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>Добавить участника напрямую</h4>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                      type="text"
                      value={inviteUserIdDraft}
                      onChange={(e) => setInviteUserIdDraft(e.target.value)}
                      placeholder="Введите ID пользователя (напр. INV-1234)"
                      style={{ flex: 1, padding: '10px 14px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '13.5px' }}
                    />
                    <select
                      value={inviteUserRoleDraft}
                      onChange={(e) => setInviteUserRoleDraft(e.target.value)}
                      style={{ padding: '10px 12px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '13.5px' }}
                    >
                      <option value="member">Участник</option>
                      <option value="viewer">Наблюдатель</option>
                      <option value="admin">Админ</option>
                    </select>
                    <button
                      className="btn primary small"
                      onClick={() => {
                        if (!inviteUserIdDraft.trim()) return;
                        const success = onInviteUser(project.id, inviteUserIdDraft.trim(), inviteUserRoleDraft);
                        if (success) {
                          alert(`Пользователь ${inviteUserIdDraft.trim()} успешно добавлен в команду проекта с ролью ${inviteUserRoleDraft === 'admin' ? 'Админ' : inviteUserRoleDraft === 'member' ? 'Участник' : 'Наблюдатель'}!`);
                          setInviteUserIdDraft("");
                          setInviteUserRoleDraft("member");
                        } else {
                          alert("Пользователь уже в проекте или ID некорректен.");
                        }
                      }}
                    >
                      Добавить
                    </button>
                  </div>
                </div>
              )}

              {/* Project Tags Management Box */}
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#ffffff' }}>Управление тегами проекта</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {projectTags.map((tag) => (
                    <span 
                      key={tag} 
                      className="tag-pill" 
                      style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '6px',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        background: 'var(--hover-color)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        fontSize: '12.5px',
                        fontWeight: '500'
                      }}
                    >
                      {tag}
                      {currentUserRole === "admin" && (
                        <button
                          type="button"
                          onClick={() => onRemoveProjectTag(project.id, tag)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#ef4444',
                            fontSize: '13px',
                            padding: '0 2px',
                            lineHeight: 1
                          }}
                          title="Удалить тег из проекта"
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                  {projectTags.length === 0 && (
                    <span style={{ fontSize: '13px', color: 'var(--nav-text-inactive)', fontStyle: 'italic' }}>Теги отсутствуют</span>
                  )}
                </div>

                {currentUserRole === "admin" && (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                      type="text"
                      id="new-project-master-tag-input"
                      placeholder="Название нового тега..."
                      style={{ flex: 1, padding: '10px 14px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '13.5px' }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = e.target.value.trim();
                          if (val) {
                            onAddProjectTag(project.id, val);
                            e.target.value = '';
                          }
                        }
                      }}
                    />
                    <button
                      className="btn primary small"
                      onClick={() => {
                        const el = document.getElementById('new-project-master-tag-input');
                        const val = el ? el.value.trim() : '';
                        if (val) {
                          onAddProjectTag(project.id, val);
                          if (el) el.value = '';
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
                  if (window.confirm("Вы действительно хотите покинуть этот проект?")) {
                    onLeaveProject(project.id, currentUserId);
                  }
                }}
                style={{ alignSelf: 'flex-start', marginTop: '10px' }}
              >
                Выйти из проекта
              </button>
            </div>
          </div>
        </div>
      ) : (
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

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                        <h4 className="task-card-title" style={{ margin: 0, flex: 1 }}>{task.title}</h4>
                        {canEditTasks && (
                          <button
                            className={`card-complete-checkbox-btn ${task.completed ? "is-completed" : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleTaskComplete(project.id, task.id);
                            }}
                            title={task.completed ? "Отменить выполнение" : "Отметить выполненной"}
                            style={{
                              background: "transparent",
                              border: "none",
                              cursor: "pointer",
                              fontSize: "15px",
                              padding: "2px 4px",
                              lineHeight: 1,
                              opacity: 0.6,
                              transition: "opacity 0.2s, transform 0.1s"
                            }}
                            onMouseEnter={(e) => { e.target.style.opacity = "1"; e.target.style.transform = "scale(1.15)"; }}
                            onMouseLeave={(e) => { e.target.style.opacity = "0.6"; e.target.style.transform = "scale(1)"; }}
                          >
                            {task.completed ? "✅" : "⬜"}
                          </button>
                        )}
                      </div>

                      {task.subtasks && task.subtasks.length > 0 && (() => {
                        const total = task.subtasks.length;
                        const completed = task.subtasks.filter(s => s.completed).length;
                        const percent = Math.round((completed / total) * 100);
                        return (
                          <div className="task-subtask-progress-wrapper" style={{ marginTop: '8px', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--nav-text-inactive)', marginBottom: '3px' }}>
                              <span>📋 {completed}/{total} подзадач</span>
                              <span>{percent}%</span>
                            </div>
                            <div className="progress-bar-track" style={{ height: '4px', background: 'var(--border-color)', borderRadius: '2px', overflow: 'hidden' }}>
                              <div className="progress-bar-fill" style={{ width: `${percent}%`, height: '100%', background: 'var(--accent-color)', borderRadius: '2px', transition: 'width 0.3s ease' }}></div>
                            </div>
                          </div>
                        );
                      })()}

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
                        <Avatar name={getUserName(task.assignedTo || "Unassigned")} />
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
      )}

      {renderTaskModal()}
    </div>
  );
}
