import "./MyTasks.css";

export default function MyTasks({ projects, currentUserId }) {
  // Extract and enrich tasks assigned to the user from all active projects
  const assignedTasks = projects.flatMap((project) =>
    Object.values(project.tasks || {})
      .filter((task) => task.assignedTo === currentUserId)
      .map((task) => ({ 
        ...task, 
        projectName: project.name, 
        projectId: project.id 
      })),
  );

  // Parse dates to separate into IT standard urgency categories
  const now = new Date();
  now.setHours(0, 0, 0, 0); // Start of today

  const overdue = [];
  const urgent = [];
  const thisWeek = [];
  const later = [];
  const noDeadline = [];
  const completed = [];

  const endOfWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  endOfWeek.setHours(23, 59, 59, 999);

  assignedTasks.forEach((task) => {
    if (task.completed) {
      completed.push(task);
      return;
    }

    if (!task.deadline) {
      if (task.priority === "critical" || task.priority === "high") {
        urgent.push(task);
      } else {
        noDeadline.push(task);
      }
      return;
    }

    const deadlineDate = new Date(task.deadline);
    deadlineDate.setHours(0, 0, 0, 0);

    if (deadlineDate < now) {
      overdue.push(task);
    } else if (
      deadlineDate.getTime() === now.getTime() ||
      task.priority === "critical" ||
      task.priority === "high"
    ) {
      urgent.push(task);
    } else if (deadlineDate <= endOfWeek) {
      thisWeek.push(task);
    } else {
      later.push(task);
    }
  });

  // Groups config to render cleanly
  const groups = [
    {
      id: "overdue",
      title: "Просрочено",
      icon: "🔥",
      tasks: overdue,
      className: "group-overdue",
    },
    {
      id: "urgent",
      title: "Срочно / Сегодня",
      icon: "⚡",
      tasks: urgent,
      className: "group-urgent",
    },
    {
      id: "thisWeek",
      title: "На этой неделе",
      icon: "📅",
      tasks: thisWeek,
      className: "group-thisweek",
    },
    {
      id: "later",
      title: "Позже",
      icon: "🧘",
      tasks: later,
      className: "group-later",
    },
    {
      id: "noDeadline",
      title: "Без дедлайна",
      icon: "⚪",
      tasks: noDeadline,
      className: "group-nodeadline",
    },
    {
      id: "completed",
      title: "Выполнено",
      icon: "✅",
      tasks: completed,
      className: "group-completed",
    },
  ];

  const totalActiveTasks = assignedTasks.filter((t) => !t.completed).length;

  return (
    <div className="page-fade-in tasks-page">
      <div className="tasks-summary">
        <div>
          <h2>Мои задачи</h2>
          <p>Задачи, назначенные вам во всех проектах, отсортированные по Agile-приоритетам.</p>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <div className="task-count urgent-badge">Активных: {totalActiveTasks}</div>
          <div className="task-count">Всего: {assignedTasks.length}</div>
        </div>
      </div>

      {assignedTasks.length === 0 ? (
        <div className="task-card empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="empty-state-icon">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <h3>Назначенных задач пока нет</h3>
          <p>Когда в ваших проектах появятся задачи, в которых вы указаны исполнителем, они мгновенно отобразятся здесь с группировкой по срокам.</p>
        </div>
      ) : (
        <div className="tasks-groups-container">
          {groups.map(
            (group) =>
              group.tasks.length > 0 && (
                <section className={`tasks-group-section ${group.className}`} key={group.id}>
                  <div className="group-header">
                    <span className="group-icon">{group.icon}</span>
                    <h3>{group.title}</h3>
                    <span className="group-badge">{group.tasks.length}</span>
                  </div>

                  <div className="task-grid">
                    {group.tasks.map((task) => (
                      <article className={`task-card ${task.completed ? "completed" : ""}`} key={task.id}>
                        <div className="task-card-header">
                          <span className="project-badge">{task.projectName}</span>
                          {task.priority && (
                            <span className={`priority-badge priority-${task.priority}`}>
                              {task.priority}
                            </span>
                          )}
                        </div>

                        <h3>{task.title}</h3>
                        
                        {task.description && <p className="task-description">{task.description}</p>}

                        <div className="task-tags-container">
                          {task.tags?.length > 0 && (
                            <div className="task-tags">
                              {task.tags.map((tag) => (
                                <span className="tag-pill" key={tag}>
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="task-footer">
                          <div className="task-meta">
                            {task.deadline && (
                              <span className={`due-date-meta ${group.id === "overdue" ? "text-danger" : ""}`}>
                                📅 До: {task.deadline}
                              </span>
                            )}
                            {task.estimate && <span>⏱ Оценка: {task.estimate}</span>}
                          </div>
                          <span className="comments-count-badge">
                            💬 {task.comments?.length || 0}
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )
          )}
        </div>
      )}
    </div>
  );
}
