import Icon from "../../components/Icon/Icon";
import { formatDay, isUrgent, parseDay, pluralize } from "../../lib/format";
import "./MyTasks.css";

const GROUPS = [
  { id: "overdue", title: "Просрочено", tone: "danger" },
  { id: "today", title: "Сегодня и срочные", tone: "warning" },
  { id: "week", title: "На этой неделе", tone: "info" },
  { id: "later", title: "Позже", tone: "neutral" },
  { id: "none", title: "Без срока", tone: "neutral" },
  { id: "done", title: "Выполнено", tone: "success" },
];

function groupOf(task, today, weekEnd) {
  if (task.completed) return "done";
  const deadline = parseDay(task.deadline);
  if (deadline && deadline < today) return "overdue";
  if (isUrgent(task) || (deadline && deadline.getTime() === today.getTime())) return "today";
  if (!deadline) return "none";
  return deadline <= weekEnd ? "week" : "later";
}

export default function MyTasks({ projects, currentUserId, onToggleTaskComplete, onOpenTask }) {
  const tasks = projects.flatMap((project) =>
    Object.values(project.tasks || {})
      .filter((task) => task.assignedTo === currentUserId)
      .map((task) => ({ ...task, projectId: project.id, projectName: project.name })),
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);

  const grouped = Object.fromEntries(GROUPS.map((g) => [g.id, []]));
  tasks.forEach((task) => grouped[groupOf(task, today, weekEnd)].push(task));
  Object.values(grouped).forEach((list) =>
    list.sort((a, b) => (parseDay(a.deadline) || Infinity) - (parseDay(b.deadline) || Infinity)),
  );

  const active = tasks.length - grouped.done.length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Мои задачи</h1>
          <p className="page-sub">
            {tasks.length === 0
              ? "Здесь появятся задачи, где вы указаны исполнителем."
              : `${active} ${pluralize(active, ["активная", "активные", "активных"])} из ${tasks.length}`}
          </p>
        </div>
        {grouped.overdue.length > 0 && (
          <span className="badge badge-danger">
            <Icon name="flame" size={13} /> {grouped.overdue.length} просрочено
          </span>
        )}
      </div>

      {tasks.length === 0 ? (
        <div className="panel">
          <div className="empty">
            <Icon name="inbox" size={36} strokeWidth={1.5} />
            <h3>Пока пусто</h3>
            <p>Откройте проект и назначьте себя исполнителем — задача сразу окажется здесь.</p>
          </div>
        </div>
      ) : (
        <div className="task-groups">
          {GROUPS.filter((g) => grouped[g.id].length > 0).map((group) => (
            <section className={`task-group tone-${group.tone}`} key={group.id}>
              <header className="task-group-head">
                <span className="task-group-dot" />
                <h2>{group.title}</h2>
                <span className="task-group-count">{grouped[group.id].length}</span>
              </header>

              <ul className="task-rows">
                {grouped[group.id].map((task) => (
                  <li key={task.id}>
                    <div
                      className={`task-row ${task.completed ? "is-done" : ""}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => onOpenTask(task.projectId, task.id)}
                      onKeyDown={(e) => e.key === "Enter" && onOpenTask(task.projectId, task.id)}
                    >
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={!!task.completed}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => onToggleTaskComplete(task.projectId, task.id)}
                        aria-label={task.completed ? "Вернуть в работу" : "Отметить выполненной"}
                      />
                      <div className="task-row-main">
                        <span className="task-row-title">{task.title}</span>
                        {task.description && <span className="task-row-desc">{task.description}</span>}
                      </div>
                      <div className="task-row-meta">
                        {isUrgent(task) && !task.completed && (
                          <span className="badge badge-danger">Срочно</span>
                        )}
                        {task.tags?.slice(0, 2).map((tag) => (
                          <span className="tag" key={tag}>{tag}</span>
                        ))}
                        {task.comments?.length > 0 && (
                          <span className="meta">
                            <Icon name="chat" size={14} /> {task.comments.length}
                          </span>
                        )}
                        {task.deadline && (
                          <span className={`meta ${group.id === "overdue" ? "meta-danger" : ""}`}>
                            <Icon name="calendar" size={14} /> {formatDay(task.deadline)}
                          </span>
                        )}
                        <span className="task-row-project">{task.projectName}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
