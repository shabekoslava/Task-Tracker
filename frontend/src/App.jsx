// src/App.jsx
import { useState, useEffect, useRef } from "react";
import Sidebar from "./components/Sidebar/Sidebar";
import ProjectBoard from "./components/ProjectBoard/ProjectBoard";
import MyProfile from "./pages/MyProfile/MyProfile";
import MyTasks from "./pages/MyTasks/MyTasks";
import MyProjects from "./pages/MyProjects/MyProject";
import Messenger from "./pages/Messenger/Messenger";
import Auth from "./pages/Auth/Auth";
import Invite from "./pages/invite/Invite";
import "./App.css";

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [currentTab, setCurrentTab] = useState("Мои задачи");
  const [isDark, setIsDark] = useState(true);
  const [initialProjectTab, setInitialProjectTab] = useState("board"); // "board" | "settings"
  const [initialActiveTaskId, setInitialActiveTaskId] = useState(null);
  const [openedFromMyTasks, setOpenedFromMyTasks] = useState(false);

  // 👤 Auth State: loaded from localStorage session
  const [currentUser, setCurrentUser] = useState(() => {
    const session = localStorage.getItem("active_user_session");
    return session ? JSON.parse(session) : null;
  });

  const currentUserId = currentUser ? currentUser.id : "";

  // 📂 Projects State: loaded from localStorage or initialized with default projects
  const [projects, setProjects] = useState(() => {
    const storedProjects = localStorage.getItem("project_tracker_projects");
    return storedProjects ? JSON.parse(storedProjects) : [];
  });

  // ✉️ Invitations State: loaded from localStorage
  const [invitations, setInvitations] = useState(() => {
    const storedInvites = localStorage.getItem("project_invitations");
    return storedInvites ? JSON.parse(storedInvites) : [];
  });

  // 💬 Chats State: loaded from localStorage
  const [chats, setChats] = useState(() => {
    const storedChats = localStorage.getItem("project_tracker_chats");
    return storedChats ? JSON.parse(storedChats) : [];
  });

  const wsRef = useRef(null);
  const isIncomingSyncRef = useRef(false);

  // ⚡ Initialize Reconnecting WebSocket Connection for Real-Time State Sync
  useEffect(() => {
    let socket;
    let reconnectTimeout;

    const connectWS = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws`;

      console.log("⚡ Connecting to real-time WebSockets sync:", wsUrl);
      socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "SYNC_STATE") {
            console.log("⚡ Real-time WebSocket sync update received:", data);
            isIncomingSyncRef.current = true;
            if (data.projects) {
              localStorage.setItem(
                "project_tracker_projects",
                JSON.stringify(data.projects),
              );
              setProjects(data.projects);
            }
            if (data.chats) {
              localStorage.setItem(
                "project_tracker_chats",
                JSON.stringify(data.chats),
              );
              setChats(data.chats);
            }
          }
        } catch (err) {
          console.error("Failed to parse WebSocket sync message:", err);
        }
      };

      socket.onclose = () => {
        console.log("⚡ WebSocket connection closed. Reconnecting in 3s...");
        reconnectTimeout = setTimeout(connectWS, 3000);
      };

      socket.onerror = (err) => {
        console.error("⚡ WebSocket error:", err);
        socket.close();
      };
    };

    connectWS();

    return () => {
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
      clearTimeout(reconnectTimeout);
    };
  }, []);

  const selectedProject = currentTab.startsWith("project-")
    ? projects.find((project) => currentTab === `project-${project.id}`)
    : null;

  // Sync state initially from FastAPI if active
  useEffect(() => {
    fetch("/api/all_data")
      .then((res) => {
        if (!res.ok) throw new Error("API Offline");
        return res.json();
      })
      .then((data) => {
        console.log("State synchronized from FastAPI:", data);
        if (data.projects) {
          localStorage.setItem(
            "project_tracker_projects",
            JSON.stringify(data.projects),
          );
          setProjects(data.projects);
        }
        if (data.invitations) {
          localStorage.setItem(
            "project_invitations",
            JSON.stringify(data.invitations),
          );
          setInvitations(data.invitations);
        }
        if (data.users && data.users.length > 0) {
          localStorage.setItem("auth_users", JSON.stringify(data.users));
        }
        if (data.chats) {
          localStorage.setItem(
            "project_tracker_chats",
            JSON.stringify(data.chats),
          );
          setChats(data.chats);
        }
      })
      .catch((err) => {
        console.log(
          "FastAPI offline, using offline localStorage mode:",
          err.message,
        );
      });
  }, []);

  // Sync projects and chats with localStorage, backend, and WebSockets
  useEffect(() => {
    localStorage.setItem("project_tracker_projects", JSON.stringify(projects));
    localStorage.setItem("project_tracker_chats", JSON.stringify(chats));

    // If this update was triggered by an incoming WebSocket sync, prevent loop
    if (isIncomingSyncRef.current) {
      isIncomingSyncRef.current = false;
      return;
    }

    // Broadcast state mutation to other clients over WebSocket
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "SYNC_STATE",
          projects,
          chats,
        }),
      );
    }

    // Background push to backend
    const users = JSON.parse(localStorage.getItem("auth_users") || "[]");
    fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projects, users, chats }),
    }).catch((err) =>
      console.log("Failed to sync projects to FastAPI:", err.message),
    );
  }, [projects, chats]);

  // Sync invitations with localStorage and backend
  useEffect(() => {
    localStorage.setItem("project_invitations", JSON.stringify(invitations));

    // Background push to backend
    fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitations }),
    }).catch((err) =>
      console.log("Failed to sync invitations to FastAPI:", err.message),
    );
  }, [invitations]);

  // Sync registered users when currentUser logs in/out
  useEffect(() => {
    if (currentUser) {
      const users = JSON.parse(localStorage.getItem("auth_users") || "[]");
      fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ users }),
      }).catch((err) =>
        console.log("Failed to sync users to FastAPI:", err.message),
      );
    }
  }, [currentUser]);

  // Handle page resize for responsive sidebar
  useEffect(() => {
    const handleResize = () => {
      const minWidthForSidebar = 768;
      if (window.innerWidth < minWidthForSidebar && isSidebarOpen) {
        setIsSidebarOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => window.removeEventListener("resize", handleResize);
  }, [isSidebarOpen]);

  // Update window title dynamically
  useEffect(() => {
    document.title = `${currentTab} — Task Tracker`;
  }, [currentTab]);

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.body.classList.toggle("light-theme");
  };

  // --- Auth Callbacks ---
  const handleLoginSuccess = (sessionData) => {
    setCurrentUser(sessionData);
    setCurrentTab("Мои задачи");
  };

  const handleLogout = () => {
    localStorage.removeItem("active_user_session");
    setCurrentUser(null);
    setCurrentTab("Мои задачи");
  };

  // --- Invitation Callbacks ---
  const handleJoinProjectById = (projectId, role = "member") => {
    const targetProject = projects.find((p) => p.id === projectId);
    if (!targetProject) return false;

    // Check if already a member
    if (targetProject.members.some((m) => m.id === currentUserId)) {
      return false;
    }

    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== projectId) return project;
        return {
          ...project,
          members: [...project.members, { id: currentUserId, role: role }],
        };
      }),
    );

    return true;
  };

  const handleSendInvite = (projectId, targetUserId, role = "member") => {
    const targetProject = projects.find((p) => p.id === projectId);
    if (!targetProject) {
      return { success: false, message: "Проект не найден" };
    }

    // Verify if recipient exists in registered users
    const registeredUsers = JSON.parse(
      localStorage.getItem("auth_users") || "[]",
    );
    const recipientExists = registeredUsers.some(
      (u) => u.id.toUpperCase() === targetUserId.toUpperCase(),
    );

    if (!recipientExists) {
      return {
        success: false,
        message: `Пользователь с ID ${targetUserId} не зарегистрирован`,
      };
    }

    // Check if target is already in project members
    if (
      targetProject.members.some(
        (m) => m.id.toUpperCase() === targetUserId.toUpperCase(),
      )
    ) {
      return {
        success: false,
        message: "Пользователь уже является участником этого проекта",
      };
    }

    // Check if a pending invite already exists
    const duplicateInvite = invitations.some(
      (inv) =>
        inv.projectId === projectId &&
        inv.invitedUser.toUpperCase() === targetUserId.toUpperCase() &&
        inv.status === "pending",
    );

    if (duplicateInvite) {
      return {
        success: false,
        message: "Приглашение этому пользователю уже отправлено",
      };
    }

    // Generate new invite
    const newInvite = {
      id: `inv-${Date.now()}`,
      projectId,
      projectName: targetProject.name,
      invitedBy: currentUserId,
      invitedUser: targetUserId,
      status: "pending",
      role: role,
    };

    setInvitations((prev) => [...prev, newInvite]);
    return {
      success: true,
      message: `Приглашение успешно отправлено для ${targetUserId}!`,
    };
  };

  const handleAcceptInvite = (inviteId, projectId) => {
    // Find the invitation object to get the assigned role
    const inviteObj = invitations.find((inv) => inv.id === inviteId);
    const selectedRole = inviteObj ? inviteObj.role || "member" : "member";

    // 1. Join project with custom role
    const success = handleJoinProjectById(projectId, selectedRole);

    // 2. Mark invitation status as accepted
    setInvitations((prev) =>
      prev.map((inv) =>
        inv.id === inviteId ? { ...inv, status: "accepted" } : inv,
      ),
    );

    if (success) {
      alert("Добро пожаловать в проект! Приглашение успешно принято.");
      setCurrentTab(`project-${projectId}`);
    } else {
      alert("Не удалось войти: вы уже состоите в этом проекте.");
    }
  };

  const handleDeclineInvite = (inviteId) => {
    setInvitations((prev) =>
      prev.map((inv) =>
        inv.id === inviteId ? { ...inv, status: "declined" } : inv,
      ),
    );
  };

  const handleCancelInvite = (inviteId) => {
    setInvitations((prev) => prev.filter((inv) => inv.id !== inviteId));
  };

  const handleClearInviteHistory = () => {
    setInvitations((prev) => prev.filter((inv) => inv.status === "pending"));
  };

  // --- Project Board Callbacks ---
  const createProject = (name) => {
    const trimmed = name.trim();
    if (!trimmed) return false;

    const projectId = String(Date.now());
    const nextProject = {
      id: projectId,
      name: trimmed,
      description: "",
      members: [{ id: currentUserId, role: "admin" }],
      tags: ["дизайн", "баг", "срочно", "фича", "фронтенд", "бэкенд"],
      columns: [
        { id: `${projectId}-todo`, name: "В ожидании", taskIds: [] },
        { id: `${projectId}-inwork`, name: "В работе", taskIds: [] },
        { id: `${projectId}-review`, name: "На проверку", taskIds: [] },
        { id: `${projectId}-done`, name: "Выполнено", taskIds: [] },
      ],
      tasks: {},
    };

    setProjects((prev) => [...prev, nextProject]);
    setInitialProjectTab("settings");
    setCurrentTab(`project-${nextProject.id}`);
    return true;
  };

  const editProject = (projectId, updates) => {
    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== projectId) return project;
        return {
          ...project,
          ...updates,
        };
      }),
    );
  };

  const inviteUser = (projectId, userId, role = "member") => {
    const trimmed = userId.trim();
    if (!trimmed) return false;

    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== projectId) return project;
        if (project.members.some((m) => m.id === trimmed)) return project;
        return {
          ...project,
          members: [...project.members, { id: trimmed, role: role }],
        };
      }),
    );

    return true;
  };

  const changeUserRole = (projectId, userId, newRole) => {
    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== projectId) return project;
        return {
          ...project,
          members: project.members.map((m) =>
            m.id === userId ? { ...m, role: newRole } : m,
          ),
        };
      }),
    );
  };

  const leaveProject = (projectId, userId) => {
    setProjects((prev) => {
      const updatedProjects = prev.map((project) => {
        if (project.id !== projectId) return project;
        return {
          ...project,
          members: project.members.filter((m) => m.id !== userId),
        };
      });
      return updatedProjects;
    });

    if (currentUserId === userId && currentTab === `project-${projectId}`) {
      setCurrentTab("Мои проекты");
    }
  };

  const deleteProject = (projectId) => {
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    if (currentTab === `project-${projectId}`) {
      setCurrentTab("Мои проекты");
    }
  };

  const addProjectTag = (projectId, tag) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== projectId) return project;
        const currentTags = project.tags || [
          "дизайн",
          "баг",
          "срочно",
          "фича",
          "фронтенд",
          "бэкенд",
        ];
        if (currentTags.includes(trimmed)) return project;
        return { ...project, tags: [...currentTags, trimmed] };
      }),
    );
  };

  const removeProjectTag = (projectId, tag) => {
    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== projectId) return project;
        const currentTags = project.tags || [
          "дизайн",
          "баг",
          "срочно",
          "фича",
          "фронтенд",
          "бэкенд",
        ];
        return { ...project, tags: currentTags.filter((t) => t !== tag) };
      }),
    );
  };

  const addColumn = (projectId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return false;

    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== projectId) return project;
        return {
          ...project,
          columns: [
            ...project.columns,
            {
              id: `column-${Date.now()}`,
              name: trimmed,
              taskIds: [],
            },
          ],
        };
      }),
    );

    return true;
  };

  const renameColumn = (projectId, columnId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return false;

    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== projectId) return project;
        return {
          ...project,
          columns: project.columns.map((column) =>
            column.id === columnId ? { ...column, name: trimmed } : column,
          ),
        };
      }),
    );

    return true;
  };

  const deleteColumn = (projectId, columnId) => {
    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== projectId) return project;
        return {
          ...project,
          columns: project.columns.filter((column) => column.id !== columnId),
        };
      }),
    );
  };

  const moveColumn = (projectId, columnId, direction) => {
    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== projectId) return project;
        const columns = [...project.columns];
        const index = columns.findIndex((col) => col.id === columnId);
        if (index === -1) return project;

        if (direction === "left" && index > 0) {
          const temp = columns[index];
          columns[index] = columns[index - 1];
          columns[index - 1] = temp;
        } else if (direction === "right" && index < columns.length - 1) {
          const temp = columns[index];
          columns[index] = columns[index + 1];
          columns[index + 1] = temp;
        }

        return { ...project, columns };
      }),
    );
  };

  const addTask = (projectId, columnId, taskData) => {
    const title = taskData.title?.trim();
    if (!title) return false;

    const newTask = {
      id: `task-${Date.now()}`,
      title,
      description: taskData.description || "",
      assignedTo: taskData.assignedTo || currentUserId,
      tags: taskData.tags || [],
      deadline: taskData.deadline || "",
      estimate: taskData.estimate || "",
      sprint: taskData.sprint || "",
      priority: taskData.priority || "Средний",
      completed: false,
      comments: [],
      createdAt: new Date().toISOString(),
    };

    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== projectId) return project;
        return {
          ...project,
          tasks: {
            ...project.tasks,
            [newTask.id]: newTask,
          },
          columns: project.columns.map((column) =>
            column.id === columnId
              ? { ...column, taskIds: [...column.taskIds, newTask.id] }
              : column,
          ),
        };
      }),
    );

    return true;
  };

  const editTask = (projectId, taskId, updates) => {
    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== projectId) return project;
        const task = project.tasks[taskId];
        if (!task) return project;
        return {
          ...project,
          tasks: {
            ...project.tasks,
            [taskId]: {
              ...task,
              ...updates,
              tags: updates.tags ?? task.tags,
            },
          },
        };
      }),
    );
  };

  const deleteTask = (projectId, taskId) => {
    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== projectId) return project;
        const updatedTasks = { ...project.tasks };
        delete updatedTasks[taskId];
        const updatedColumns = project.columns.map((column) => ({
          ...column,
          taskIds: column.taskIds.filter((id) => id !== taskId),
        }));
        return {
          ...project,
          tasks: updatedTasks,
          columns: updatedColumns,
        };
      }),
    );
  };

  const addComment = (projectId, taskId, text) => {
    const trimmed = text.trim();
    if (!trimmed) return false;

    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== projectId) return project;
        const task = project.tasks[taskId];
        if (!task) return project;
        return {
          ...project,
          tasks: {
            ...project.tasks,
            [taskId]: {
              ...task,
              comments: [
                ...task.comments,
                {
                  id: `comment-${Date.now()}`,
                  text: trimmed,
                  createdAt: new Date().toISOString(),
                },
              ],
            },
          },
        };
      }),
    );

    return true;
  };

  const toggleTaskComplete = (projectId, taskId) => {
    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== projectId) return project;
        const task = project.tasks[taskId];
        if (!task) return project;
        return {
          ...project,
          tasks: {
            ...project.tasks,
            [taskId]: {
              ...task,
              completed: !task.completed,
            },
          },
        };
      }),
    );
  };

  const moveTask = (projectId, taskId, targetColumnId) => {
    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== projectId) return project;
        const sourceColumns = project.columns.map((column) => {
          if (column.taskIds.includes(taskId)) {
            return {
              ...column,
              taskIds: column.taskIds.filter((id) => id !== taskId),
            };
          }
          return column;
        });
        return {
          ...project,
          columns: sourceColumns.map((column) =>
            column.id === targetColumnId
              ? { ...column, taskIds: [...column.taskIds, taskId] }
              : column,
          ),
        };
      }),
    );
  };

  const openProject = (projectId, initialTab = "board") => {
    setInitialProjectTab(initialTab);
    setCurrentTab(`project-${projectId}`);
  };

  const moveProjectUp = (projectId) => {
    setProjects((prev) => {
      const index = prev.findIndex((p) => p.id === projectId);
      if (index <= 0) return prev;
      const updated = [...prev];
      const temp = updated[index];
      updated[index] = updated[index - 1];
      updated[index - 1] = temp;
      return updated;
    });
  };

  const moveProjectDown = (projectId) => {
    setProjects((prev) => {
      const index = prev.findIndex((p) => p.id === projectId);
      if (index === -1 || index >= prev.length - 1) return prev;
      const updated = [...prev];
      const temp = updated[index];
      updated[index] = updated[index + 1];
      updated[index + 1] = temp;
      return updated;
    });
  };

  // --- Filtering Received & Sent Invites for children ---
  const receivedInvites = invitations.filter(
    (inv) =>
      inv.invitedUser.toUpperCase() === currentUserId.toUpperCase() &&
      inv.status === "pending",
  );

  const sentInvites = invitations.filter(
    (inv) => inv.invitedBy.toUpperCase() === currentUserId.toUpperCase(),
  );

  // --- Page Switcher ---
  const renderPage = () => {
    if (currentTab.startsWith("project-") && selectedProject) {
      return (
        <ProjectBoard
          project={selectedProject}
          currentUserRole={
            selectedProject.members.find((m) => m.id === currentUserId)?.role ||
            "viewer"
          }
          members={selectedProject.members.map((m) => m.id)}
          onAddColumn={addColumn}
          onRenameColumn={renameColumn}
          onDeleteColumn={deleteColumn}
          onMoveColumn={moveColumn}
          onAddTask={addTask}
          onEditTask={editTask}
          onDeleteTask={deleteTask}
          onAddComment={addComment}
          onToggleTaskComplete={toggleTaskComplete}
          onMoveTask={moveTask}
          onEditProject={editProject}
          onInviteUser={inviteUser}
          onChangeRole={changeUserRole}
          onLeaveProject={leaveProject}
          onDeleteProject={deleteProject}
          currentUserId={currentUserId}
          initialViewMode={initialProjectTab}
          onAddProjectTag={addProjectTag}
          onRemoveProjectTag={removeProjectTag}
          initialActiveTaskId={initialActiveTaskId}
          onClearInitialActiveTaskId={() => setInitialActiveTaskId(null)}
          onCloseTaskModal={() => {
            if (openedFromMyTasks) {
              setOpenedFromMyTasks(false);
              setCurrentTab("Мои задачи");
            }
          }}
        />
      );
    }

    if (currentTab === "Мои проекты") {
      return (
        <MyProjects
          projects={projects.filter((p) =>
            p.members.some((m) => m.id === currentUserId),
          )}
          onCreateProject={createProject}
          onInviteUser={inviteUser}
          onChangeRole={changeUserRole}
          onLeaveProject={leaveProject}
          onDeleteProject={deleteProject}
          currentUserId={currentUserId}
          openProject={openProject}
          onMoveProjectUp={moveProjectUp}
          onMoveProjectDown={moveProjectDown}
        />
      );
    }

    if (currentTab === "Мой профиль") {
      return (
        <MyProfile
          userId={currentUserId}
          onLogout={handleLogout}
          onProfileUpdate={setCurrentUser}
        />
      );
    }

    if (currentTab === "Мои задачи") {
      return (
        <MyTasks
          projects={projects}
          currentUserId={currentUserId}
          onToggleTaskComplete={toggleTaskComplete}
          onOpenTask={(projectId, taskId) => {
            setOpenedFromMyTasks(true);
            setInitialActiveTaskId(taskId);
            openProject(projectId);
          }}
        />
      );
    }

    if (currentTab === "Мессенджер") {
      return (
        <Messenger
          chats={chats}
          setChats={setChats}
          projects={projects}
          currentUserId={currentUserId}
          onAddComment={addComment}
          openProject={openProject}
        />
      );
    }

    if (currentTab === "Приглашения") {
      return (
        <Invite
          currentUserId={currentUserId}
          projects={projects}
          receivedInvites={receivedInvites}
          sentInvites={sentInvites}
          onJoinProjectById={handleJoinProjectById}
          onSendInvite={handleSendInvite}
          onAcceptInvite={handleAcceptInvite}
          onDeclineInvite={handleDeclineInvite}
          onCancelInvite={handleCancelInvite}
          onClearInviteHistory={handleClearInviteHistory}
        />
      );
    }

    return <MyTasks projects={projects} currentUserId={currentUserId} />;
  };

  // 🔒 Auth Guard: render login screen if user is not authenticated
  if (!currentUser) {
    return <Auth onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="app-container">
      <Sidebar
        isOpen={isSidebarOpen}
        toggle={() => setIsSidebarOpen(!isSidebarOpen)}
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        projects={projects}
        currentUserId={currentUserId}
        openProject={openProject}
      />
      <main className="main-wrapper">
        <header className="header">
          <div
            className="logo-text"
            style={{
              color: "var(--text-color)",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            {currentTab.startsWith("project-") && selectedProject ? (
              <>
                <span>{selectedProject.name}</span>
                <span
                  style={{
                    fontSize: "12px",
                    color: "var(--nav-text-inactive)",
                    backgroundColor: "var(--hover-color)",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    border: "1px solid var(--border-color)",
                    fontFamily: "monospace",
                  }}
                >
                  ID: {selectedProject.id}
                </span>
              </>
            ) : (
              currentTab
            )}
          </div>
          <button
            className="theme-btn"
            onClick={toggleTheme}
            aria-label="Переключить тему"
          >
            <span className="theme-icon">{isDark ? "☀️" : "🌙"}</span>
            <span className="theme-text">{isDark ? "Светлая" : "Темная"}</span>
          </button>
        </header>
        <div className="page-content">{renderPage()}</div>
      </main>
    </div>
  );
}
