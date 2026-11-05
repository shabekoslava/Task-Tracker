import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "../../components/Icon/Icon";
import Avatar from "../../components/Avatar/Avatar";
import Modal from "../../components/Modal/Modal";
import { formatDateTime, formatTime, pluralize } from "../../lib/format";
import "./Messenger.css";

const SECTIONS = [
  { type: "personal", title: "Личные" },
  { type: "group", title: "Группы" },
  { type: "project", title: "Проекты" },
  { type: "task", title: "Задачи" },
];

// В старых данных названия чатов начинались с эмодзи («👥 Команда») — убираем
const cleanName = (name) => String(name || "").replace(/^[^\p{L}\p{N}]+/u, "").trim();

const membersLabel = (n) => `${n} ${pluralize(n, ["участник", "участника", "участников"])}`;

const readJson = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};

function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(740, ctx.currentTime);
    osc.frequency.setValueAtTime(988, ctx.currentTime + 0.09);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch {
    /* браузер может запретить звук до первого клика */
  }
}

export default function Messenger({
  chats,
  setChats,
  projects,
  users,
  currentUserId,
  onAddComment,
  onOpenProject,
  onOpenTask,
}) {
  const [activeRoomId, setActiveRoomId] = useState(null);
  const [text, setText] = useState("");
  const [collapsed, setCollapsed] = useState({});
  const [newChatMode, setNewChatMode] = useState(null); // "personal" | "group" | null
  const [groupName, setGroupName] = useState("");
  const [groupMembers, setGroupMembers] = useState([]);
  const [showInbox, setShowInbox] = useState(false);
  const [soundOn, setSoundOn] = useState(() => readJson("messenger_sound", true));
  const [lastRead, setLastRead] = useState(() => readJson("messenger_last_read", {}));
  const endRef = useRef(null);
  const seenMessagesRef = useRef(null);

  const userName = (id) => {
    if (id === currentUserId) return "Вы";
    return users.find((u) => u.id === id)?.name || id;
  };
  const userAvatar = (id) => users.find((u) => u.id === id)?.avatar;

  const teammates = useMemo(() => {
    const ids = new Set(projects.flatMap((p) => p.members.map((m) => m.id)));
    ids.delete(currentUserId);
    return users.filter((u) => ids.has(u.id));
  }, [projects, users, currentUserId]);

  // Комнаты проектов и задач создаются автоматически; переписка по ним хранится в chats,
  // а у задач сообщения — это её комментарии.
  const rooms = useMemo(() => {
    const stored = new Map(chats.map((c) => [c.id, c]));
    const list = [];

    projects.forEach((project) => {
      const id = `project-chat-${project.id}`;
      list.push({
        ...stored.get(id),
        id,
        type: "project",
        projectId: project.id,
        title: project.name,
        members: project.members.map((m) => m.id),
        messages: stored.get(id)?.messages || [],
      });
      stored.delete(id);

      Object.values(project.tasks || {})
        .filter((task) => task.assignedTo === currentUserId)
        .forEach((task) => {
          const taskRoomId = `task-chat-${task.id}`;
          stored.delete(taskRoomId);
          list.push({
            id: taskRoomId,
            type: "task",
            projectId: project.id,
            projectName: project.name,
            taskId: task.id,
            title: task.title,
            members: [currentUserId],
            messages: (task.comments || []).map((c) => ({ ...c, isComment: true })),
          });
        });
    });

    stored.forEach((chat) => {
      if (chat.type === "project" || chat.type === "task" || chat.projectId || chat.taskId) return;
      if (!chat.members?.includes(currentUserId)) return;
      const type = chat.type === "group" || chat.members.length > 2 ? "group" : "personal";
      const other = chat.members.find((m) => m !== currentUserId);
      list.push({
        ...chat,
        type,
        title: type === "personal" ? userName(other) : cleanName(chat.name) || "Группа",
        otherId: other,
      });
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chats, projects, users, currentUserId]);

  const activeRoom = rooms.find((r) => r.id === activeRoomId) || rooms[0] || null;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [activeRoom?.id, activeRoom?.messages.length]);

  // Комната считается прочитанной до последнего сообщения на момент, когда её покидают
  const markRead = (...list) => {
    const next = { ...lastRead };
    list.forEach((room) => {
      const last = room?.messages.at(-1)?.createdAt;
      if (last) next[room.id] = last;
    });
    setLastRead(next);
    localStorage.setItem("messenger_last_read", JSON.stringify(next));
  };

  const selectRoom = (roomId) => {
    markRead(activeRoom, rooms.find((r) => r.id === roomId));
    setActiveRoomId(roomId);
    setShowInbox(false);
  };

  useEffect(() => localStorage.setItem("messenger_sound", JSON.stringify(soundOn)), [soundOn]);

  const isUnread = (room) => {
    if (room.id === activeRoom?.id && !showInbox) return false;
    const last = room.messages.at(-1);
    if (!last || last.authorId === currentUserId || last.authorId === "System") return false;
    return !lastRead[room.id] || last.createdAt > lastRead[room.id];
  };

  const notifications = rooms
    .flatMap((room) =>
      room.messages
        .filter((m) => m.authorId !== currentUserId && m.authorId !== "System")
        .map((m) => ({ ...m, room })),
    )
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
    .slice(0, 30);

  // Звук на новые входящие (кроме тех, что были при открытии страницы)
  useEffect(() => {
    const ids = new Set(notifications.map((n) => n.id));
    if (seenMessagesRef.current && soundOn) {
      const fresh = notifications.some((n) => !seenMessagesRef.current.has(n.id) && n.room.id !== activeRoom?.id);
      if (fresh) playChime();
    }
    seenMessagesRef.current = ids;
  });

  const unreadCount = rooms.filter(isUnread).length;

  const send = (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || !activeRoom) return;

    if (activeRoom.type === "task") {
      onAddComment(activeRoom.projectId, activeRoom.taskId, trimmed);
    } else {
      const message = {
        id: `msg-${Date.now()}`,
        text: trimmed,
        createdAt: new Date().toISOString(),
        authorId: currentUserId,
      };
      setChats((prev) => {
        if (prev.some((c) => c.id === activeRoom.id)) {
          return prev.map((c) => (c.id === activeRoom.id ? { ...c, messages: [...(c.messages || []), message] } : c));
        }
        return [
          ...prev,
          {
            id: activeRoom.id,
            name: activeRoom.title,
            type: activeRoom.type,
            projectId: activeRoom.projectId,
            members: activeRoom.members,
            messages: [message],
          },
        ];
      });
    }
    setText("");
  };

  const startPersonal = (userId) => {
    const id = `personal-chat-${[currentUserId, userId].sort().join("-")}`;
    if (!chats.some((c) => c.id === id)) {
      setChats((prev) => [
        ...prev,
        { id, name: userName(userId), type: "personal", members: [currentUserId, userId], messages: [] },
      ]);
    }
    setActiveRoomId(id);
    setNewChatMode(null);
  };

  const createGroup = (e) => {
    e.preventDefault();
    if (!groupName.trim()) return;
    const id = `group-chat-${Date.now()}`;
    setChats((prev) => [
      ...prev,
      {
        id,
        name: groupName.trim(),
        type: "group",
        members: [currentUserId, ...groupMembers],
        messages: [
          {
            id: `msg-${Date.now()}`,
            text: `Создан чат «${groupName.trim()}»`,
            createdAt: new Date().toISOString(),
            authorId: "System",
          },
        ],
      },
    ]);
    setActiveRoomId(id);
    setGroupName("");
    setGroupMembers([]);
    setNewChatMode(null);
  };

  const leaveRoom = (room) => {
    if (!window.confirm(`Выйти из чата «${room.title}»?`)) return;
    setChats((prev) =>
      prev.map((c) => (c.id === room.id ? { ...c, members: c.members.filter((m) => m !== currentUserId) } : c)),
    );
    setActiveRoomId(null);
  };

  const roomIcon = { personal: null, group: "users", project: "folder", task: "tasks" };

  return (
    <div className="messenger">
      <aside className="rooms">
        <div className="rooms-head">
          <h1>Чаты</h1>
          <div className="rooms-head-actions">
            <button
              className={`btn btn-ghost btn-icon btn-sm inbox-btn ${showInbox ? "is-active" : ""}`}
              onClick={() => setShowInbox((v) => !v)}
              aria-label="Уведомления"
              title="Уведомления"
            >
              <Icon name="bell" size={16} />
              {unreadCount > 0 && <span className="inbox-dot" />}
            </button>
            <button
              className="btn btn-sm"
              onClick={() => setNewChatMode("personal")}
              disabled={teammates.length === 0}
              title={teammates.length === 0 ? "Сначала добавьте коллег в проект" : "Новый чат"}
            >
              <Icon name="plus" size={14} /> Новый
            </button>
          </div>
        </div>

        <div className="rooms-scroll">
          {rooms.length === 0 && (
            <p className="rooms-empty">Чаты появятся, когда вы создадите проект или напишете коллеге.</p>
          )}
          {SECTIONS.map(({ type, title }) => {
            const list = rooms.filter((r) => r.type === type);
            if (list.length === 0) return null;
            return (
              <div className="room-section" key={type}>
                <button
                  className="room-section-head"
                  onClick={() => setCollapsed((prev) => ({ ...prev, [type]: !prev[type] }))}
                >
                  <Icon name={collapsed[type] ? "chevronRight" : "chevronDown"} size={13} />
                  {title}
                  <span>{list.length}</span>
                </button>
                {!collapsed[type] &&
                  list.map((room) => {
                    const last = room.messages.at(-1);
                    const unread = isUnread(room);
                    return (
                      <button
                        key={room.id}
                        className={`room ${room.id === activeRoom?.id ? "active" : ""} ${unread ? "unread" : ""}`}
                        onClick={() => selectRoom(room.id)}
                      >
                        {room.type === "personal" ? (
                          <Avatar name={room.title} src={userAvatar(room.otherId)} size={30} />
                        ) : (
                          <span className={`room-icon room-icon-${room.type}`}>
                            <Icon name={roomIcon[room.type]} size={15} />
                          </span>
                        )}
                        <span className="room-text">
                          <span className="room-title">{room.title}</span>
                          <span className="room-preview">
                            {last
                              ? `${last.authorId === currentUserId ? "Вы: " : ""}${last.text}`
                              : room.type === "task"
                                ? room.projectName
                                : "Нет сообщений"}
                          </span>
                        </span>
                        {unread && <span className="room-unread" />}
                      </button>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </aside>

      <section className="chat">
        {showInbox ? (
          <div className="inbox">
            <header className="chat-head">
              <div>
                <h2>Уведомления</h2>
                <p className="chat-sub">Последние сообщения от коллег</p>
              </div>
              <label className="sound-toggle">
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={soundOn}
                  onChange={(e) => setSoundOn(e.target.checked)}
                />
                Звук
              </label>
            </header>
            <div className="inbox-list">
              {notifications.length === 0 ? (
                <div className="empty">
                  <Icon name="bell" size={32} strokeWidth={1.5} />
                  <p>Новых сообщений нет</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={`${n.room.id}-${n.id}`}
                    className="inbox-item"
                    onClick={() => selectRoom(n.room.id)}
                  >
                    <Avatar name={userName(n.authorId)} src={userAvatar(n.authorId)} size={30} />
                    <span className="inbox-text">
                      <span className="inbox-meta">
                        <b>{userName(n.authorId)}</b> в «{n.room.title}», {formatDateTime(n.createdAt)}
                      </span>
                      <span className="inbox-body">{n.text}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : activeRoom ? (
          <>
            <header className="chat-head">
              <div className="chat-head-title">
                <h2>{activeRoom.title}</h2>
                <p className="chat-sub">
                  {activeRoom.type === "personal" && "Личный диалог"}
                  {activeRoom.type === "group" && membersLabel(activeRoom.members.length)}
                  {activeRoom.type === "project" && `Чат проекта, ${membersLabel(activeRoom.members.length)}`}
                  {activeRoom.type === "task" && `Комментарии к задаче в проекте «${activeRoom.projectName}»`}
                </p>
              </div>
              <div className="chat-head-actions">
                {activeRoom.type === "project" && (
                  <button className="btn btn-sm" onClick={() => onOpenProject(activeRoom.projectId)}>
                    <Icon name="board" size={14} /> Доска
                  </button>
                )}
                {activeRoom.type === "task" && (
                  <button className="btn btn-sm" onClick={() => onOpenTask(activeRoom.projectId, activeRoom.taskId)}>
                    <Icon name="tasks" size={14} /> Открыть задачу
                  </button>
                )}
                {(activeRoom.type === "personal" || activeRoom.type === "group") && (
                  <button className="btn btn-ghost btn-sm" onClick={() => leaveRoom(activeRoom)}>
                    <Icon name="logout" size={14} /> Выйти
                  </button>
                )}
              </div>
            </header>

            <div className="messages">
              {activeRoom.messages.length === 0 ? (
                <div className="empty messages-empty">
                  <Icon name="chat" size={32} strokeWidth={1.5} />
                  <p>Сообщений пока нет — напишите первым.</p>
                </div>
              ) : (
                activeRoom.messages.map((msg, i) => {
                  if (msg.authorId === "System") {
                    return (
                      <div className="msg-system" key={msg.id}>
                        {msg.text}
                      </div>
                    );
                  }
                  const own = msg.authorId === currentUserId;
                  const prev = activeRoom.messages[i - 1];
                  const grouped = prev && prev.authorId === msg.authorId;
                  return (
                    <div className={`msg ${own ? "own" : ""} ${grouped ? "grouped" : ""}`} key={msg.id}>
                      {!own && (
                        <span className="msg-avatar">
                          {!grouped && <Avatar name={userName(msg.authorId)} src={userAvatar(msg.authorId)} size={30} />}
                        </span>
                      )}
                      <div className="msg-body">
                        {!grouped && !own && <span className="msg-author">{userName(msg.authorId)}</span>}
                        <div className="msg-bubble">
                          {msg.text}
                          <span className="msg-time">{formatTime(msg.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={endRef} />
            </div>

            <form className="composer" onSubmit={send}>
              <input
                className="input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={activeRoom.type === "task" ? "Комментарий к задаче" : "Сообщение"}
                aria-label="Текст сообщения"
              />
              <button className="btn btn-primary" disabled={!text.trim()} aria-label="Отправить">
                <Icon name="send" size={16} />
              </button>
            </form>
          </>
        ) : (
          <div className="empty chat-placeholder">
            <Icon name="chat" size={36} strokeWidth={1.5} />
            <h3>Выберите чат</h3>
            <p>Слева — личные диалоги, группы и автоматические чаты проектов и задач.</p>
          </div>
        )}
      </section>

      {newChatMode && (
        <Modal title="Новый чат" onClose={() => setNewChatMode(null)}>
          <div className="segmented new-chat-tabs">
            <button className={newChatMode === "personal" ? "active" : ""} onClick={() => setNewChatMode("personal")}>
              Личный
            </button>
            <button className={newChatMode === "group" ? "active" : ""} onClick={() => setNewChatMode("group")}>
              Группа
            </button>
          </div>

          {newChatMode === "personal" ? (
            <ul className="people">
              {teammates.map((u) => (
                <li key={u.id}>
                  <button className="person" onClick={() => startPersonal(u.id)}>
                    <Avatar name={u.name} src={u.avatar} size={32} />
                    <span className="person-text">
                      <b>{u.name}</b>
                      <span className="mono">{u.id}</span>
                    </span>
                    <Icon name="chevronRight" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <form className="group-form" onSubmit={createGroup}>
              <div className="field">
                <label htmlFor="group-name">Название</label>
                <input
                  id="group-name"
                  className="input"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Например, Фронтенд"
                  autoFocus
                />
              </div>
              <span className="field-label">Участники</span>
              <ul className="people">
                {teammates.map((u) => (
                  <li key={u.id}>
                    <label className="person">
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={groupMembers.includes(u.id)}
                        onChange={(e) =>
                          setGroupMembers((prev) =>
                            e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id),
                          )
                        }
                      />
                      <Avatar name={u.name} src={u.avatar} size={28} />
                      <span className="person-text">
                        <b>{u.name}</b>
                        <span className="mono">{u.id}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <button className="btn btn-primary btn-block" disabled={!groupName.trim()}>
                Создать группу
              </button>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
