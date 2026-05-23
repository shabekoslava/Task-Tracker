import { useState, useEffect, useRef } from "react";
import "./Messenger.css";

export default function Messenger({
  chats = [],
  setChats,
  projects = [],
  currentUserId,
  onAddComment,
  openProject,
}) {
  const [activeRoomId, setActiveRoomId] = useState(null);
  const [messageText, setMessageText] = useState("");
  
  // Modals & Panel States
  const [isNewPersonalModalOpen, setIsNewPersonalModalOpen] = useState(false);
  const [isNewGroupModalOpen, setIsNewGroupModalOpen] = useState(false);
  const [isNotifModalOpen, setIsNotifModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedGroupMembers, setSelectedGroupMembers] = useState([]);
  
  const [collapsedCategories, setCollapsedCategories] = useState({
    personal: false,
    group: false,
    project: false,
    task: false,
  });
  const [groupNameError, setGroupNameError] = useState(false);

  const toggleCategory = (cat) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [cat]: !prev[cat],
    }));
  };
  
  // Consumer-focused notification states
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [visualAlerts, setVisualAlerts] = useState(true);
  const [recentNotifications, setRecentNotifications] = useState([
    {
      id: "not-init",
      date: new Date().toLocaleDateString([], { day: "2-digit", month: "2-digit" }),
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      title: "Система уведомлений",
      text: "Здесь будут отображаться ваши входящие упоминания в реальном времени.",
    }
  ]);

  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeRoomId, chats, projects]);

  // Load registered users from localStorage
  const allRegisteredUsers = JSON.parse(localStorage.getItem("auth_users") || "[]");

  // Filter projects where current user is a member
  const userProjects = projects.filter((p) =>
    p.members.some((m) => m.id === currentUserId)
  );

  // Extract teammates
  const teammateIds = new Set();
  userProjects.forEach((p) => {
    p.members.forEach((m) => {
      if (m.id !== currentUserId) teammateIds.add(m.id);
    });
  });

  const teammates = allRegisteredUsers.filter((u) => teammateIds.has(u.id));

  // Fallback teammates for empty workspace state
  const fallbackTeammates = [
    { id: "alex", name: "Алексей Смирнов", email: "alex@smirnov.ru" },
    { id: "dmitry", name: "Дмитрий Иванов", email: "dmitry@ivanov.ru" },
    { id: "elena", name: "Елена Кузнецова", email: "elena@kuznecova.ru" },
  ];

  const activeTeammates = teammates.length > 0 ? teammates : fallbackTeammates;

  // Synthesize soft premium notification audio tone
  const playNotificationSound = () => {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1200, ctx.currentTime + 0.1);

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
      console.warn("AudioContext blocked or uninitialized:", e);
    }
  };

  // --- Dynamic Chat Rooms Construction ---
  const dynamicRooms = [];

  // 1. Project-level Rooms (Auto-generated per active project)
  userProjects.forEach((project) => {
    dynamicRooms.push({
      id: `project-chat-${project.id}`,
      name: `📂 Проект: ${project.name}`,
      type: "project",
      projectId: project.id,
      members: project.members.map((m) => m.id),
      messages: [],
    });
  });

  // 2. Task-level Rooms (Auto-generated per active assigned task)
  userProjects.forEach((project) => {
    Object.values(project.tasks || {}).forEach((task) => {
      if (task.assignedTo === currentUserId) {
        dynamicRooms.push({
          id: `task-chat-${task.id}`,
          name: `📅 Задача: ${task.title}`,
          type: "task",
          projectId: project.id,
          taskId: task.id,
          taskName: task.title,
          members: [currentUserId],
          messages: [],
        });
      }
    });
  });

  // --- 💡 Deduplication Engine to prevent duplicate project/task chats ---
  const uniqueRoomsMap = new Map();

  // Add auto project and task rooms first
  dynamicRooms.forEach((room) => {
    uniqueRoomsMap.set(room.id, room);
  });

  // Merge with persistent chats (preserves message history without room duplication)
  chats.forEach((storedRoom) => {
    if (uniqueRoomsMap.has(storedRoom.id)) {
      const existingRoom = uniqueRoomsMap.get(storedRoom.id);
      uniqueRoomsMap.set(storedRoom.id, {
        ...existingRoom,
        ...storedRoom,
        messages: [
          ...(existingRoom.messages || []),
          ...(storedRoom.messages || []),
        ].reduce((acc, current) => {
          if (!acc.some((m) => m.id === current.id)) {
            acc.push(current);
          }
          return acc;
        }, []),
      });
    } else {
      uniqueRoomsMap.set(storedRoom.id, storedRoom);
    }
  });

  const allRooms = Array.from(uniqueRoomsMap.values());

  // Restrict access to rooms based on project membership (ФР 5.2)
  const accessibleRooms = allRooms.filter((room) => {
    if (room.type === "project" || room.type === "task") {
      const proj = projects.find((p) => p.id === room.projectId);
      if (!proj) return false;
      return proj.members.some((m) => m.id === currentUserId);
    }
    return room.members.includes(currentUserId);
  });

  const activeRoom = accessibleRooms.find((r) => r.id === activeRoomId);

  // Set default active room if none selected
  useEffect(() => {
    if (accessibleRooms.length > 0 && !activeRoomId) {
      setActiveRoomId(accessibleRooms[0].id);
    }
  }, [accessibleRooms, activeRoomId]);

  // --- Message retrieval ---
  const getRoomMessages = () => {
    if (!activeRoom) return [];

    if (activeRoom.type === "task") {
      const proj = projects.find((p) => p.id === activeRoom.projectId);
      const task = proj?.tasks?.[activeRoom.taskId];
      
      const comments = (task?.comments || []).map((c) => ({
        id: c.id,
        text: c.text,
        createdAt: c.createdAt || new Date().toISOString(),
        authorId: c.authorId || "alex",
        status: "read",
        isComment: true,
      }));

      const roomMsg = activeRoom.messages || [];
      const allMerged = [...comments, ...roomMsg];
      const uniqueMap = new Map();
      allMerged.forEach((m) => uniqueMap.set(m.id, m));
      
      return Array.from(uniqueMap.values()).sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
      );
    }

    return activeRoom.messages || [];
  };

  const currentMessages = getRoomMessages();

  // --- Send Message ---
  const handleSendMessage = () => {
    if (!messageText.trim() || !activeRoom) return;

    const trimmedMsg = messageText.trim();
    const msgId = `msg-${Date.now()}`;
    const timestamp = new Date().toISOString();

    const newMessage = {
      id: msgId,
      text: trimmedMsg,
      createdAt: timestamp,
      authorId: currentUserId,
      status: "delivered",
    };

    if (activeRoom.type === "task") {
      // Auto-comment integration
      onAddComment(activeRoom.projectId, activeRoom.taskId, trimmedMsg);
    }

    setChats((prev) => {
      const exists = prev.some((r) => r.id === activeRoom.id);
      if (exists) {
        return prev.map((r) => {
          if (r.id !== activeRoom.id) return r;
          return {
            ...r,
            messages: [...(r.messages || []), newMessage],
          };
        });
      } else {
        return [
          ...prev,
          {
            ...activeRoom,
            messages: [newMessage],
          },
        ];
      }
    });

    setMessageText("");
  };

  // Create personal chat
  const handleCreatePersonalChat = (teammateId) => {
    const roomId = `personal-chat-${[currentUserId, teammateId].sort().join("-")}`;
    const exists = accessibleRooms.find((r) => r.id === roomId);

    if (exists) {
      setActiveRoomId(roomId);
    } else {
      const teammateName = activeTeammates.find((u) => u.id === teammateId)?.name || teammateId;
      const newRoom = {
        id: roomId,
        name: `👤 ${teammateName}`,
        type: "personal",
        members: [currentUserId, teammateId],
        messages: [
          {
            id: `msg-welcome-${Date.now()}`,
            text: `Диалог с пользователем ${teammateName} начат.`,
            createdAt: new Date().toISOString(),
            authorId: "System",
            status: "read",
          },
        ],
      };
      setChats((prev) => [...prev, newRoom]);
      setActiveRoomId(roomId);
    }
    setIsNewPersonalModalOpen(false);
  };

  // Create group chat
  const handleCreateGroupChat = () => {
    if (!newGroupName.trim()) {
      setGroupNameError(true);
      return;
    }
    const roomId = `group-chat-${Date.now()}`;
    const newRoom = {
      id: roomId,
      name: `👥 ${newGroupName.trim()}`,
      type: "group",
      members: [currentUserId, ...selectedGroupMembers],
      messages: [
        {
          id: `msg-welcome-${Date.now()}`,
          text: `Групповой чат "${newGroupName.trim()}" успешно создан.`,
          createdAt: new Date().toISOString(),
          authorId: "System",
          status: "read",
        },
      ],
    };
    setChats((prev) => [...prev, newRoom]);
    setActiveRoomId(roomId);
    setNewGroupName("");
    setSelectedGroupMembers([]);
    setIsNewGroupModalOpen(false);
    setGroupNameError(false);
  };

  const handleLeaveChat = (roomId) => {
    if (!window.confirm("Вы действительно хотите выйти из этого чата?")) return;

    setChats((prev) =>
      prev.map((r) => {
        if (r.id !== roomId) return r;
        return {
          ...r,
          members: r.members.filter((m) => m !== currentUserId),
        };
      })
    );

    // Switch active room to another available room
    const nextRoom = accessibleRooms.find((r) => r.id !== roomId);
    setActiveRoomId(nextRoom ? nextRoom.id : null);
  };

  // Dispatch interactive notification event
  const handleReceiveTestNotification = () => {
    playNotificationSound();
    
    const newNotif = {
      id: `notif-${Date.now()}`,
      date: new Date().toLocaleDateString([], { day: "2-digit", month: "2-digit" }),
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      title: "Новое упоминание",
      text: "Дмитрий Иванов: 'Сделай пожалуйста ревью ПР по верстке!'",
    };

    setRecentNotifications((prev) => [newNotif, ...prev]);

    if (visualAlerts) {
      alert("🔔 Уведомление:\n\nДмитрий Иванов упомянул вас в чате проекта 'Канбан-доска 2.0':\n'Сделай пожалуйста ревью ПР по верстке!'");
    }
  };

  const getUserName = (userId) => {
    if (userId === "System") return "Система";
    if (userId === currentUserId) return "Вы";
    const found = allRegisteredUsers.find((u) => u.id === userId);
    if (found) return found.name;
    if (userId === "alex") return "Алексей Смирнов";
    if (userId === "dmitry") return "Дмитрий Иванов";
    if (userId === "elena") return "Елена Кузнецова";
    return userId;
  };

  return (
    <div className="messenger-workspace page-fade-in">
      
      {/* 1. Left Channel Sidebar Pane */}
      <aside className="messenger-sidebar">
        <div className="sidebar-header-area">
          <h3>Разделы чатов</h3>
          <div className="sidebar-action-buttons">
            <button
              className="btn primary small icon-btn-add"
              onClick={() => setIsNewPersonalModalOpen(true)}
              title="Создать личный чат"
            >
              💬 +1
            </button>
            <button
              className="btn done-btn-primary small icon-btn-add"
              onClick={() => setIsNewGroupModalOpen(true)}
              title="Создать групповой чат"
            >
              👥 +Гр
            </button>
          </div>
        </div>

        {/* 📋 Sidebar Folder Ordering: Personal -> Groups -> Projects -> Tasks */}
        <div className="sidebar-channels-scroll">
          {/* Folder 1: Personal Dialogues */}
          <div className="channel-category-block" style={{ marginBottom: "16px" }}>
            <h4 
              className="category-title" 
              onClick={() => toggleCategory("personal")} 
              style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", userSelect: "none" }}
            >
              <span>👤 Личные диалоги</span>
              <span style={{ fontSize: "10px", opacity: 0.7 }}>{collapsedCategories.personal ? "▶" : "▼"}</span>
            </h4>
            {!collapsedCategories.personal && (
              <div className="category-rooms-list" style={{ marginTop: "6px" }}>
                {accessibleRooms.filter((r) => r.type === "personal").map((room) => (
                  <button
                    key={room.id}
                    className={`room-item-link ${activeRoomId === room.id ? "active" : ""}`}
                    onClick={() => setActiveRoomId(room.id)}
                  >
                    <span className="room-icon-tag">👤</span>
                    <span className="room-name-text">{room.name.replace("👤 ", "")}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Folder 2: Group Chats */}
          <div className="channel-category-block" style={{ marginBottom: "16px" }}>
            <h4 
              className="category-title" 
              onClick={() => toggleCategory("group")} 
              style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", userSelect: "none" }}
            >
              <span>👥 Групповые чаты</span>
              <span style={{ fontSize: "10px", opacity: 0.7 }}>{collapsedCategories.group ? "▶" : "▼"}</span>
            </h4>
            {!collapsedCategories.group && (
              <div className="category-rooms-list" style={{ marginTop: "6px" }}>
                {accessibleRooms.filter((r) => r.type === "group").map((room) => (
                  <button
                    key={room.id}
                    className={`room-item-link ${activeRoomId === room.id ? "active" : ""}`}
                    onClick={() => setActiveRoomId(room.id)}
                  >
                    <span className="room-icon-tag">👥</span>
                    <span className="room-name-text">{room.name.replace("👥 ", "")}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Folder 3: Project Auto-Chats */}
          <div className="channel-category-block" style={{ marginBottom: "16px" }}>
            <h4 
              className="category-title" 
              onClick={() => toggleCategory("project")} 
              style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", userSelect: "none" }}
            >
              <span>📁 Проекты (Авто)</span>
              <span style={{ fontSize: "10px", opacity: 0.7 }}>{collapsedCategories.project ? "▶" : "▼"}</span>
            </h4>
            {!collapsedCategories.project && (
              <div className="category-rooms-list" style={{ marginTop: "6px" }}>
                {accessibleRooms.filter((r) => r.type === "project").map((room) => (
                  <button
                    key={room.id}
                    className={`room-item-link ${activeRoomId === room.id ? "active" : ""}`}
                    onClick={() => setActiveRoomId(room.id)}
                  >
                    <span className="room-icon-tag">📂</span>
                    <span className="room-name-text">{room.name.replace("📂 Проект: ", "")}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Folder 4: Assigned Tasks Auto-Chats (Grouped by Project) */}
          <div className="channel-category-block" style={{ marginBottom: "16px" }}>
            <h4 
              className="category-title" 
              onClick={() => toggleCategory("task")} 
              style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", userSelect: "none" }}
            >
              <span>📅 Задачи (Авто)</span>
              <span style={{ fontSize: "10px", opacity: 0.7 }}>{collapsedCategories.task ? "▶" : "▼"}</span>
            </h4>
            {!collapsedCategories.task && (
              <div className="category-rooms-list" style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "8px" }}>
                {userProjects.map((project) => {
                  const projectTaskRooms = accessibleRooms.filter(
                    (r) => r.type === "task" && r.projectId === project.id
                  );
                  if (projectTaskRooms.length === 0) return null;
                  return (
                    <div key={project.id} className="project-task-group" style={{ marginBottom: "4px" }}>
                      <div className="project-task-group-title" style={{ fontSize: "11px", fontWeight: "700", color: "var(--accent-color)", padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.5px", opacity: 0.8, marginBottom: "4px" }}>
                        📁 {project.name}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px", paddingLeft: "6px" }}>
                        {projectTaskRooms.map((room) => (
                          <button
                            key={room.id}
                            className={`room-item-link ${activeRoomId === room.id ? "active" : ""}`}
                            onClick={() => setActiveRoomId(room.id)}
                            style={{ paddingLeft: "8px" }}
                          >
                            <span className="room-icon-tag">📅</span>
                            <span className="room-name-text" style={{ fontSize: "12.5px" }}>{room.taskName}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* 2. Central Chat Thread Feed Workspace */}
      <main className="messenger-chat-area">
        {activeRoom ? (
          <>
            <header className="chat-header">
              <div className="room-header-info">
                <h3>{activeRoom.name}</h3>
                <div style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "4px" }}>
                  <span className="room-meta-tag">тип: {activeRoom.type}</span>
                  {activeRoom.type === "task" && (() => {
                    const proj = projects.find((p) => p.id === activeRoom.projectId);
                    return proj ? (
                      <span className="room-meta-tag" style={{ background: "rgba(139, 92, 246, 0.15)", color: "#8b5cf6", fontWeight: "600" }}>
                        📂 Проект: {proj.name}
                      </span>
                    ) : null;
                  })()}
                </div>
              </div>

              {/* Context Transition Buttons */}
              <div className="chat-context-actions" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                {(activeRoom.type === "personal" || activeRoom.type === "group") && (
                  <button
                    className="btn danger small"
                    onClick={() => handleLeaveChat(activeRoom.id)}
                    style={{ padding: "6px 12px", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                  >
                    🚪 Выйти из чата
                  </button>
                )}
                {activeRoom.type === "project" && (
                  <button
                    className="btn primary small"
                    onClick={() => openProject(activeRoom.projectId)}
                  >
                    📂 Доска проекта
                  </button>
                )}
                {activeRoom.type === "task" && (
                  <button
                    className="btn primary small"
                    onClick={() => openProject(activeRoom.projectId)}
                  >
                    🎯 Перейти к задаче
                  </button>
                )}
              </div>
            </header>

            <div className="chat-messages-thread">
              {currentMessages.length === 0 ? (
                <div className="chat-empty-state">
                  <span className="empty-chat-icon">💬</span>
                  <p>В этом чате пока нет сообщений. Начните обсуждение!</p>
                </div>
              ) : (
                currentMessages.map((msg) => {
                  const isOwn = msg.authorId === currentUserId;
                  const isSystem = msg.authorId === "System";

                  if (isSystem) {
                    return (
                      <div className="system-message-divider" key={msg.id}>
                        <span>{msg.text}</span>
                      </div>
                    );
                  }

                  return (
                    <div className={`message-bubble-wrapper ${isOwn ? "own-message" : ""}`} key={msg.id}>
                      <div className="message-avatar-circle">
                        {getUserName(msg.authorId).charAt(0).toUpperCase()}
                      </div>
                      <div className="message-content-block">
                        <div className="message-bubble-header">
                          <span className="message-author">{getUserName(msg.authorId)}</span>
                          <span className="message-time">
                            {new Date(msg.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <div className={`message-bubble-text ${msg.isComment ? "comment-aggregate" : ""}`}>
                          {msg.text}
                          {msg.isComment && (
                            <span className="comment-sync-badge">синхронизировано из карточки</span>
                          )}
                        </div>
                        {isOwn && (
                          <div className="message-status-ticks">
                            {msg.status === "read" ? "✔✔" : "✔"}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-bar">
              <input
                type="text"
                className="chat-input-field"
                placeholder={
                  activeRoom.type === "task"
                    ? "Написать в чат задачи (авто-комментирование)..."
                    : "Написать сообщение..."
                }
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              />
              <button className="btn primary" onClick={handleSendMessage}>
                Отправить
              </button>
            </div>
          </>
        ) : (
          <div className="chat-empty-state-full">
            <span className="huge-icon">💬</span>
            <h2>Выберите комнату</h2>
            <p>Выберите любой проектный или личный чат из боковой панели для начала переписки.</p>
          </div>
        )}
      </main>

      {/* 3. Consumer-Focused Notification Side Panel */}
      <aside className="messenger-tech-panel">
        
        {/* Alerts and Sounds Configuration */}
        <section className="tech-block notification-settings-section">
          <h4>🔔 Оповещения и звук</h4>
          <div className="settings-toggle-row" style={{ marginBottom: 12 }}>
            <label>
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(e) => setSoundEnabled(e.target.checked)}
              />
              Звуковые сигналы (WebAudio)
            </label>
          </div>
          <div className="settings-toggle-row" style={{ marginBottom: 16 }}>
            <label>
              <input
                type="checkbox"
                checked={visualAlerts}
                onChange={(e) => setVisualAlerts(e.target.checked)}
              />
              Всплывающие окна (Alert)
            </label>
          </div>
          <button
            className="btn secondary small full-width test-notif-btn"
            onClick={handleReceiveTestNotification}
          >
            Прислать тест-уведомление
          </button>
        </section>

        {/* Beautiful Inbox Feed for recent Notifications */}
        <section className="tech-block notifications-inbox-section" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: 8, marginBottom: 8 }}>
            <h4 style={{ margin: 0, border: "none", padding: 0 }}>📬 Лента уведомлений</h4>
            <button 
              className="btn secondary small" 
              style={{ fontSize: 10, padding: "4px 8px", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}
              onClick={() => setIsNotifModalOpen(true)}
              title="Открыть во всплывающем окне"
            >
              🖥️ Окно
            </button>
          </div>
          <div className="notifications-list-container">
            {recentNotifications.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--nav-text-inactive)", textAlign: "center", margin: "20px 0" }}>Нет новых уведомлений</p>
            ) : (
              recentNotifications.map((not) => (
                <div className="notif-inbox-item" key={not.id}>
                  <div className="notif-item-header">
                    <span>🔔 {not.title}</span>
                    <span className="notif-item-time">
                      {not.date && `${not.date} `}{not.time}
                    </span>
                  </div>
                  <p className="notif-item-text">{not.text}</p>
                </div>
              ))
            )}
          </div>
        </section>

      </aside>

      {/* 4. Modals */}
      {isNotifModalOpen && (
        <div className="modal-overlay" onClick={() => setIsNotifModalOpen(false)}>
          <div className="modal-window" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 24 }}>🔔</span>
                <div style={{ textAlign: "left" }}>
                  <h3 style={{ margin: 0 }}>Центр уведомлений</h3>
                  <span style={{ fontSize: 11, color: "var(--nav-text-inactive)" }}>
                    Всего уведомлений: {recentNotifications.length}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                {recentNotifications.length > 0 && (
                  <button
                    className="btn danger small"
                    style={{ fontSize: 11, padding: "6px 12px" }}
                    onClick={() => {
                      setRecentNotifications([]);
                      setIsNotifModalOpen(false);
                    }}
                  >
                    🗑️ Очистить
                  </button>
                )}
                <button className="close-btn" onClick={() => setIsNotifModalOpen(false)}>
                  ×
                </button>
              </div>
            </div>
            <div className="modal-body" style={{ maxHeight: "50vh", overflowY: "auto", paddingRight: 6 }}>
              {recentNotifications.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--nav-text-inactive)" }}>
                  <span style={{ fontSize: 48, display: "block", marginBottom: 12 }}>📬</span>
                  <p style={{ margin: 0 }}>У вас нет новых уведомлений.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {recentNotifications.map((not) => (
                    <div
                      key={not.id}
                      style={{
                        background: "rgba(255, 255, 255, 0.02)",
                        border: "1px solid var(--border-color)",
                        borderRadius: 12,
                        padding: 16,
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                        textAlign: "left"
                      }}
                      className="notif-modal-item"
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, fontWeight: "bold", color: "#8b5cf6" }}>
                          🔔 {not.title}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--nav-text-inactive)" }}>
                          {not.date} в {not.time}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5 }}>
                        {not.text}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {isNewPersonalModalOpen && (
        <div className="modal-overlay" onClick={() => setIsNewPersonalModalOpen(false)}>
          <div className="modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Создать личный чат</h3>
              <button className="close-btn" onClick={() => setIsNewPersonalModalOpen(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <p>Выберите коллегу из участников ваших проектов:</p>
              {activeTeammates.length === 0 ? (
                <p className="no-data-text">Нет доступных участников для диалога.</p>
              ) : (
                <div className="dialogue-users-list">
                  {activeTeammates.map((u) => (
                    <button
                      key={u.id}
                      className="dialogue-user-row"
                      onClick={() => handleCreatePersonalChat(u.id)}
                    >
                      <div className="user-initials">
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="user-row-details">
                        <span className="user-row-name">{u.name}</span>
                        <span className="user-row-id">ID: {u.id}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isNewGroupModalOpen && (
        <div className="modal-overlay" onClick={() => setIsNewGroupModalOpen(false)}>
          <div className="modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Создать групповой чат</h3>
              <button className="close-btn" onClick={() => setIsNewGroupModalOpen(false)}>
                ×
              </button>
            </div>
            <div className="modal-body group-modal-body">
               <input
                type="text"
                className="input-field"
                placeholder="Название группового чата"
                value={newGroupName}
                onChange={(e) => {
                  setNewGroupName(e.target.value);
                  setGroupNameError(false);
                }}
                style={{
                  borderColor: groupNameError ? "#ef4444" : "var(--border-color)",
                  boxShadow: groupNameError ? "0 0 0 2px rgba(239, 68, 68, 0.2)" : "none",
                  transition: "all 0.2s"
                }}
              />
              {groupNameError && (
                <span style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px", display: "block" }}>
                  ⚠️ Пожалуйста, укажите название группы
                </span>
              )}
              <p style={{ marginTop: 16, marginBottom: 8, fontWeight: 600 }}>Выберите участников:</p>
              <div className="group-members-checklist">
                {activeTeammates.map((u) => (
                  <label key={u.id} className="member-check-row">
                    <input
                      type="checkbox"
                      checked={selectedGroupMembers.includes(u.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedGroupMembers((prev) => [...prev, u.id]);
                        } else {
                          setSelectedGroupMembers((prev) => prev.filter((id) => id !== u.id));
                        }
                      }}
                    />
                    {u.name} ({u.id})
                  </label>
                ))}
              </div>
              <button
                className="btn primary full-width"
                style={{ marginTop: 20 }}
                onClick={handleCreateGroupChat}
              >
                Создать группу
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
