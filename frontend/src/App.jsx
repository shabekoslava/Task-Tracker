import { useState, useEffect, useRef, useCallback } from "react";
import Sidebar from "./components/Sidebar/Sidebar";
import ProjectBoard from "./components/ProjectBoard/ProjectBoard";
import Toaster from "./components/Toaster/Toaster";
import Icon from "./components/Icon/Icon";
import MyProfile from "./pages/MyProfile/MyProfile";
import MyTasks from "./pages/MyTasks/MyTasks";
import MyProjects from "./pages/MyProjects/MyProject";
import Messenger from "./pages/Messenger/Messenger";
import Auth from "./pages/Auth/Auth";
import Invite from "./pages/invite/Invite";
import { api, clearToken, getToken } from "./lib/api";
import { toast } from "./lib/toast";
import { DEFAULT_PROJECT_TAGS } from "./lib/format";
import "./App.css";

const SYNC_DELAY_MS = 400;

const readJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const PAGE_TITLES = {
  tasks: "Мои задачи",
  projects: "Проекты",
  messenger: "Мессенджер",
  invites: "Приглашения",
  profile: "Профиль",
};

export default function App() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => window.innerWidth < 900);
  const [currentTab, setCurrentTab] = useState("tasks");
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
  const [initialProjectTab, setInitialProjectTab] = useState("board");
  const [initialActiveTaskId, setInitialActiveTaskId] = useState(null);
  const [openedFromMyTasks, setOpenedFromMyTasks] = useState(false);

  const [currentUser, setCurrentUser] = useState(() =>
    getToken() ? readJson("active_user_session", null) : null,
  );
  const currentUserId = currentUser?.id || "";

  // Кэш в localStorage нужен только для мгновенной отрисовки до ответа сервера
  const [projects, setProjects] = useState(() => readJson("project_tracker_projects", []));
  const [invitations, setInvitations] = useState(() => readJson("project_invitations", []));
  const [chats, setChats] = useState(() => readJson("project_tracker_chats", []));
  const [users, setUsers] = useState(() => readJson("auth_users", []));

  // /api/sync перезаписывает данные целиком, поэтому пушим только после загрузки
  // с сервера и только то, что реально изменилось (иначе пустой кэш нового
  // браузера стёр бы всю базу, а входящие обновления отправлялись бы обратно).
  const isServerStateLoadedRef = useRef(false);
  const lastSyncedRef = useRef({ board: null, invitations: null });

  const handleLogout = useCallback(() => {
    clearToken();
    localStorage.removeItem("active_user_session");
    isServerStateLoadedRef.current = false;
    lastSyncedRef.current = { board: null, invitations: null };
    setCurrentUser(null);
    setCurrentTab("tasks");
  }, []);

  const applyServerState = useCallback((data) => {
    lastSyncedRef.current = {
      board: JSON.stringify({ projects: data.projects || [], chats: data.chats || [] }),
      invitations: JSON.stringify(data.invitations || []),
    };
    setProjects(data.projects || []);
    setChats(data.chats || []);
    setInvitations(data.invitations || []);
    setUsers(data.users || []);
    isServerStateLoadedRef.current = true;
  }, []);

  const loadState = useCallback(
    () =>
      api("/api/all_data")
        .then(applyServerState)
        .catch((err) => {
          if (err.status === 401) {
            handleLogout();
            toast("Сессия истекла, войдите снова", "error");
          } else {
            toast(err.message, "error");
          }
        }),
    [applyServerState, handleLogout],
  );

  useEffect(() => {
    if (currentUserId) loadState();
  }, [currentUserId, loadState]);

  // Другие клиенты сохранили изменения → перечитываем состояние
  useEffect(() => {
    if (!currentUserId) return undefined;
    let socket;
    let retryTimer;
    let closed = false;

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
      socket.onmessage = (event) => {
        try {
          if (JSON.parse(event.data).event === "state_synced") loadState();
        } catch {
          /* посторонние сообщения игнорируем */
        }
      };
      socket.onclose = () => {
        if (!closed) retryTimer = setTimeout(connect, 3000);
      };
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(retryTimer);
      socket?.close();
    };
  }, [currentUserId, loadState]);

  useEffect(() => {
    localStorage.setItem("project_tracker_projects", JSON.stringify(projects));
    localStorage.setItem("project_tracker_chats", JSON.stringify(chats));
    if (!isServerStateLoadedRef.current) return undefined;

    const payload = JSON.stringify({ projects, chats });
    if (payload === lastSyncedRef.current.board) return undefined;

    const timer = setTimeout(() => {
      lastSyncedRef.current.board = payload;
      api("/api/sync", { method: "POST", body: { projects, chats } }).catch((err) =>
        toast(`Не удалось сохранить изменения: ${err.message}`, "error"),
      );
    }, SYNC_DELAY_MS);
    return () => clearTimeout(timer);
  }, [projects, chats]);

  useEffect(() => {
    localStorage.setItem("project_invitations", JSON.stringify(invitations));
    if (!isServerStateLoadedRef.current) return undefined;

    const payload = JSON.stringify(invitations);
    if (payload === lastSyncedRef.current.invitations) return undefined;

    const timer = setTimeout(() => {
      lastSyncedRef.current.invitations = payload;
      api("/api/sync", { method: "POST", body: { invitations } }).catch((err) =>
        toast(`Не удалось сохранить приглашения: ${err.message}`, "error"),
      );
    }, SYNC_DELAY_MS);
    return () => clearTimeout(timer);
  }, [invitations]);

  useEffect(() => {
    localStorage.setItem("auth_users", JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    document.body.classList.toggle("light-theme", theme === "light");
    localStorage.setItem("theme", theme);
  }, [theme]);

  const selectedProject = currentTab.startsWith("project-")
    ? projects.find((project) => currentTab === `project-${project.id}`)
    : null;

  useEffect(() => {
    const title = selectedProject ? selectedProject.name : PAGE_TITLES[currentTab];
    document.title = title ? `${title} — Task Tracker` : "Task Tracker";
  }, [currentTab, selectedProject]);

  const userProjects = projects.filter((p) => p.members?.some((m) => m.id === currentUserId));

  const handleLoginSuccess = (sessionData) => {
    localStorage.setItem("active_user_session", JSON.stringify(sessionData));
    setCurrentUser(sessionData);
    setCurrentTab("tasks");
  };

  const handleProfileUpdate = (sessionData) => {
    localStorage.setItem("active_user_session", JSON.stringify(sessionData));
    setCurrentUser(sessionData);
    setUsers((prev) =>
      prev.map((u) => (u.id === sessionData.id ? { ...u, ...sessionData } : u)),
    );
  };

  // ---------------------------------------------------------------------------
  // Проекты и приглашения
  // ---------------------------------------------------------------------------
  const updateProject = (projectId, update) =>
    setProjects((prev) => prev.map((p) => (p.id === projectId ? update(p) : p)));

  const handleJoinProjectById = (projectId, role = "member") => {
    const target = projects.find((p) => p.id === projectId);
    if (!target || target.members.some((m) => m.id === currentUserId)) return false;
    updateProject(projectId, (p) => ({ ...p, members: [...p.members, { id: currentUserId, role }] }));
    return true;
  };

  const handleSendInvite = (projectId, rawUserId, role = "member") => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return { success: false, message: "Проект не найден" };

    const recipient = users.find((u) => u.id.toUpperCase() === rawUserId.trim().toUpperCase());
    if (!recipient) {
      return { success: false, message: `Пользователь ${rawUserId.trim()} не зарегистрирован` };
    }
    if (recipient.id === currentUserId) {
      return { success: false, message: "Нельзя пригласить самого себя" };
    }
    if (project.members.some((m) => m.id === recipient.id)) {
      return { success: false, message: `${recipient.name} уже в проекте` };
    }
    const duplicate = invitations.some(
      (inv) => inv.projectId === projectId && inv.invitedUser === recipient.id && inv.status === "pending",
    );
    if (duplicate) {
      return { success: false, message: `${recipient.name} уже приглашён в этот проект` };
    }

    setInvitations((prev) => [
      ...prev,
      {
        id: `inv-${Date.now()}`,
        projectId,
        projectName: project.name,
        invitedBy: currentUserId,
        invitedUser: recipient.id,
        status: "pending",
        role,
        created_at: new Date().toISOString(),
      },
    ]);
    return { success: true, message: `Приглашение отправлено: ${recipient.name}` };
  };

  const setInviteStatus = (inviteId, status) =>
    setInvitations((prev) => prev.map((inv) => (inv.id === inviteId ? { ...inv, status } : inv)));

  const handleAcceptInvite = (inviteId, projectId) => {
    const invite = invitations.find((inv) => inv.id === inviteId);
    const joined = handleJoinProjectById(projectId, invite?.role || "member");
    setInviteStatus(inviteId, "accepted");
    if (joined) {
      toast(`Вы присоединились к проекту «${invite?.projectName || ""}»`);
      openProject(projectId);
    } else {
      toast("Вы уже состоите в этом проекте", "error");
    }
  };

  const createProject = (name) => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    const projectId = String(Date.now());
    setProjects((prev) => [
      ...prev,
      {
        id: projectId,
        name: trimmed,
        description: "",
        members: [{ id: currentUserId, role: "admin" }],
        tags: [...DEFAULT_PROJECT_TAGS],
        columns: [
          { id: `${projectId}-todo`, name: "В ожидании", taskIds: [] },
          { id: `${projectId}-inwork`, name: "В работе", taskIds: [] },
          { id: `${projectId}-review`, name: "На проверке", taskIds: [] },
          { id: `${projectId}-done`, name: "Готово", taskIds: [] },
        ],
        tasks: {},
      },
    ]);
    openProject(projectId, "board");
    return true;
  };

  const leaveProject = (projectId, userId) => {
    updateProject(projectId, (p) => ({ ...p, members: p.members.filter((m) => m.id !== userId) }));
    if (userId === currentUserId && currentTab === `project-${projectId}`) setCurrentTab("projects");
  };

  const deleteProject = (projectId) => {
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    setInvitations((prev) => prev.filter((inv) => inv.projectId !== projectId));
    setChats((prev) => prev.filter((c) => c.projectId !== projectId));
    if (currentTab === `project-${projectId}`) setCurrentTab("projects");
  };

  const moveProject = (projectId, direction) =>
    setProjects((prev) => {
      const from = prev.findIndex((p) => p.id === projectId);
      const to = from + direction;
      if (from === -1 || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });

  // ---------------------------------------------------------------------------
  // Доска: колонки и задачи
  // ---------------------------------------------------------------------------
  const boardActions = {
    editProject: (projectId, updates) => updateProject(projectId, (p) => ({ ...p, ...updates })),

    changeRole: (projectId, userId, role) =>
      updateProject(projectId, (p) => ({
        ...p,
        members: p.members.map((m) => (m.id === userId ? { ...m, role } : m)),
      })),

    addTag: (projectId, tag) => {
      const trimmed = tag.trim();
      if (!trimmed) return;
      updateProject(projectId, (p) => {
        const tags = p.tags || DEFAULT_PROJECT_TAGS;
        return tags.includes(trimmed) ? p : { ...p, tags: [...tags, trimmed] };
      });
    },

    removeTag: (projectId, tag) =>
      updateProject(projectId, (p) => ({
        ...p,
        tags: (p.tags || DEFAULT_PROJECT_TAGS).filter((t) => t !== tag),
      })),

    addColumn: (projectId, name) => {
      const trimmed = name.trim();
      if (!trimmed) return false;
      const project = projects.find((p) => p.id === projectId);
      if (project?.columns.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
        toast("Колонка с таким названием уже есть", "error");
        return false;
      }
      updateProject(projectId, (p) => ({
        ...p,
        columns: [...p.columns, { id: `column-${Date.now()}`, name: trimmed, taskIds: [] }],
      }));
      return true;
    },

    renameColumn: (projectId, columnId, name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      updateProject(projectId, (p) => ({
        ...p,
        columns: p.columns.map((c) => (c.id === columnId ? { ...c, name: trimmed } : c)),
      }));
    },

    // Удаляем колонку вместе с её задачами — раньше задачи оставались «висеть» без колонки
    deleteColumn: (projectId, columnId) =>
      updateProject(projectId, (p) => {
        const column = p.columns.find((c) => c.id === columnId);
        const tasks = { ...p.tasks };
        column?.taskIds.forEach((id) => delete tasks[id]);
        return { ...p, tasks, columns: p.columns.filter((c) => c.id !== columnId) };
      }),

    moveColumn: (projectId, columnId, direction) =>
      updateProject(projectId, (p) => {
        const from = p.columns.findIndex((c) => c.id === columnId);
        const to = from + (direction === "left" ? -1 : 1);
        if (from === -1 || to < 0 || to >= p.columns.length) return p;
        const columns = [...p.columns];
        [columns[from], columns[to]] = [columns[to], columns[from]];
        return { ...p, columns };
      }),

    addTask: (projectId, columnId, title) => {
      const trimmed = title.trim();
      if (!trimmed) return false;
      const task = {
        id: `task-${Date.now()}`,
        title: trimmed,
        description: "",
        assignedTo: currentUserId,
        tags: [],
        deadline: "",
        estimate: "",
        sprint: "",
        priority: "Средний",
        completed: false,
        comments: [],
        createdAt: new Date().toISOString(),
      };
      updateProject(projectId, (p) => ({
        ...p,
        tasks: { ...p.tasks, [task.id]: task },
        columns: p.columns.map((c) =>
          c.id === columnId ? { ...c, taskIds: [...c.taskIds, task.id] } : c,
        ),
      }));
      return true;
    },

    editTask: (projectId, taskId, updates) =>
      updateProject(projectId, (p) =>
        p.tasks[taskId] ? { ...p, tasks: { ...p.tasks, [taskId]: { ...p.tasks[taskId], ...updates } } } : p,
      ),

    deleteTask: (projectId, taskId) => {
      updateProject(projectId, (p) => {
        const tasks = { ...p.tasks };
        delete tasks[taskId];
        return {
          ...p,
          tasks,
          columns: p.columns.map((c) => ({ ...c, taskIds: c.taskIds.filter((id) => id !== taskId) })),
        };
      });
      setChats((prev) => prev.filter((c) => c.taskId !== taskId));
    },

    addComment: (projectId, taskId, text) => {
      const trimmed = text.trim();
      if (!trimmed) return false;
      const comment = {
        id: `comment-${Date.now()}`,
        text: trimmed,
        createdAt: new Date().toISOString(),
        authorId: currentUserId,
      };
      updateProject(projectId, (p) => {
        const task = p.tasks[taskId];
        if (!task) return p;
        return {
          ...p,
          tasks: { ...p.tasks, [taskId]: { ...task, comments: [...(task.comments || []), comment] } },
        };
      });
      return true;
    },

    toggleTaskComplete: (projectId, taskId) =>
      updateProject(projectId, (p) => {
        const task = p.tasks[taskId];
        return task ? { ...p, tasks: { ...p.tasks, [taskId]: { ...task, completed: !task.completed } } } : p;
      }),

    moveTask: (projectId, taskId, targetColumnId) =>
      updateProject(projectId, (p) => {
        const source = p.columns.find((c) => c.taskIds.includes(taskId));
        if (!source || source.id === targetColumnId) return p;
        return {
          ...p,
          columns: p.columns.map((c) => {
            if (c.id === source.id) return { ...c, taskIds: c.taskIds.filter((id) => id !== taskId) };
            if (c.id === targetColumnId) return { ...c, taskIds: [...c.taskIds, taskId] };
            return c;
          }),
        };
      }),

    invite: handleSendInvite,
    leaveProject,
    deleteProject,
  };

  function openProject(projectId, initialTab = "board") {
    setInitialProjectTab(initialTab);
    setCurrentTab(`project-${projectId}`);
  }

  const openTask = (projectId, taskId) => {
    setOpenedFromMyTasks(currentTab === "tasks");
    setInitialActiveTaskId(taskId);
    openProject(projectId);
  };

  const receivedInvites = invitations.filter(
    (inv) => inv.invitedUser?.toUpperCase() === currentUserId.toUpperCase() && inv.status === "pending",
  );
  const sentInvites = invitations.filter(
    (inv) => inv.invitedBy?.toUpperCase() === currentUserId.toUpperCase(),
  );

  const renderPage = () => {
    if (selectedProject) {
      return (
        <ProjectBoard
          key={`${selectedProject.id}:${initialProjectTab}`}
          project={selectedProject}
          users={users}
          currentUserId={currentUserId}
          currentUserRole={selectedProject.members.find((m) => m.id === currentUserId)?.role || "viewer"}
          actions={boardActions}
          initialViewMode={initialProjectTab}
          initialActiveTaskId={initialActiveTaskId}
          onClearInitialActiveTaskId={() => setInitialActiveTaskId(null)}
          onCloseTaskModal={() => {
            if (openedFromMyTasks) {
              setOpenedFromMyTasks(false);
              setCurrentTab("tasks");
            }
          }}
        />
      );
    }

    switch (currentTab) {
      case "projects":
        return (
          <MyProjects
            projects={userProjects}
            users={users}
            currentUserId={currentUserId}
            onCreateProject={createProject}
            onOpenProject={openProject}
            onMoveProject={moveProject}
          />
        );
      case "profile":
        return <MyProfile user={currentUser} onLogout={handleLogout} onProfileUpdate={handleProfileUpdate} />;
      case "messenger":
        return (
          <Messenger
            chats={chats}
            setChats={setChats}
            projects={userProjects}
            users={users}
            currentUserId={currentUserId}
            onAddComment={boardActions.addComment}
            onOpenProject={openProject}
            onOpenTask={openTask}
          />
        );
      case "invites":
        return (
          <Invite
            currentUserId={currentUserId}
            projects={projects}
            users={users}
            receivedInvites={receivedInvites}
            sentInvites={sentInvites}
            onJoinProjectById={handleJoinProjectById}
            onSendInvite={handleSendInvite}
            onAcceptInvite={handleAcceptInvite}
            onDeclineInvite={(id) => setInviteStatus(id, "declined")}
            onCancelInvite={(id) => setInvitations((prev) => prev.filter((inv) => inv.id !== id))}
            onClearInviteHistory={() =>
              setInvitations((prev) =>
                prev.filter((inv) => inv.status === "pending" || inv.invitedBy !== currentUserId),
              )
            }
          />
        );
      default:
        return (
          <MyTasks
            projects={userProjects}
            currentUserId={currentUserId}
            onToggleTaskComplete={boardActions.toggleTaskComplete}
            onOpenTask={openTask}
          />
        );
    }
  };

  if (!currentUser) {
    return (
      <>
        <Auth onLoginSuccess={handleLoginSuccess} />
        <Toaster />
      </>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        collapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed((v) => !v)}
        currentTab={currentTab}
        onNavigate={setCurrentTab}
        projects={userProjects}
        onOpenProject={openProject}
        currentUser={currentUser}
        pendingInvites={receivedInvites.length}
      />
      <main className="app-main">
        <header className="app-header">
          <div className="crumbs">
            {selectedProject ? (
              <>
                <button className="crumb-link" onClick={() => setCurrentTab("projects")}>
                  Проекты
                </button>
                <Icon name="chevronRight" size={14} className="crumb-sep" />
                <span className="crumb-current">{selectedProject.name}</span>
              </>
            ) : (
              <span className="crumb-current">{PAGE_TITLES[currentTab]}</span>
            )}
          </div>
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            aria-label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
            title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
          >
            <Icon name={theme === "dark" ? "sun" : "moon"} />
          </button>
        </header>
        <div className="app-content">{renderPage()}</div>
      </main>
      <Toaster />
    </div>
  );
}
