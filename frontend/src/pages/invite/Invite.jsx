import { useState } from "react";
import Icon from "../../components/Icon/Icon";
import Avatar from "../../components/Avatar/Avatar";
import { formatDay, roleLabel } from "../../lib/format";
import { toast } from "../../lib/toast";
import "./Invite.css";

const STATUS = {
  pending: ["Ожидает", ""],
  accepted: ["Принято", "badge-success"],
  declined: ["Отклонено", "badge-danger"],
};

export default function Invite({
  currentUserId,
  projects,
  users,
  receivedInvites,
  sentInvites,
  onJoinProjectById,
  onSendInvite,
  onAcceptInvite,
  onDeclineInvite,
  onCancelInvite,
  onClearInviteHistory,
}) {
  const [joinId, setJoinId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("member");

  const userName = (id) => users.find((u) => u.id === id)?.name || id;
  const userAvatar = (id) => users.find((u) => u.id === id)?.avatar;
  const adminProjects = projects.filter((p) =>
    p.members.some((m) => m.id === currentUserId && m.role === "admin"),
  );
  const hasHistory = sentInvites.some((inv) => inv.status !== "pending");

  const join = (e) => {
    e.preventDefault();
    if (onJoinProjectById(joinId.trim())) {
      toast("Вы присоединились к проекту");
      setJoinId("");
    } else {
      toast("Проект не найден или вы уже в нём состоите", "error");
    }
  };

  const invite = (e) => {
    e.preventDefault();
    const result = onSendInvite(projectId, userId, role);
    toast(result.message, result.success ? "success" : "error");
    if (result.success) setUserId("");
  };

  const copyMyId = () => {
    navigator.clipboard?.writeText(currentUserId);
    toast("ID скопирован — отправьте его коллеге");
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Приглашения</h1>
          <p className="page-sub">Чтобы вас добавили в проект, передайте коллеге свой ID.</p>
        </div>
        <button className="id-chip my-id" onClick={copyMyId} title="Скопировать">
          Мой ID: {currentUserId} <Icon name="copy" size={13} />
        </button>
      </div>

      <div className="invite-layout">
        <div className="invite-col">
          <section className="panel">
            <header className="list-head">
              <h3 className="panel-title">Входящие</h3>
              {receivedInvites.length > 0 && <span className="badge badge-accent">{receivedInvites.length}</span>}
            </header>
            {receivedInvites.length === 0 ? (
              <p className="list-empty">Новых приглашений нет.</p>
            ) : (
              <ul className="invite-list">
                {receivedInvites.map((inv) => (
                  <li className="invite-item" key={inv.id}>
                    <Avatar name={userName(inv.invitedBy)} src={userAvatar(inv.invitedBy)} size={34} />
                    <div className="invite-text">
                      <span>
                        <b>{userName(inv.invitedBy)}</b> зовёт в <b>{inv.projectName}</b>
                      </span>
                      <span className="invite-meta">
                        Роль: {roleLabel(inv.role)}
                        {inv.created_at && `, ${formatDay(inv.created_at)}`}
                      </span>
                    </div>
                    <div className="invite-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => onDeclineInvite(inv.id)}>
                        Отклонить
                      </button>
                      <button className="btn btn-primary btn-sm" onClick={() => onAcceptInvite(inv.id, inv.projectId)}>
                        Принять
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <header className="list-head">
              <h3 className="panel-title">Отправленные</h3>
              {hasHistory && (
                <button className="link-btn small" onClick={onClearInviteHistory}>
                  Очистить историю
                </button>
              )}
            </header>
            {sentInvites.length === 0 ? (
              <p className="list-empty">Вы ещё никого не приглашали.</p>
            ) : (
              <ul className="invite-list">
                {sentInvites.map((inv) => {
                  const [label, tone] = STATUS[inv.status] || STATUS.pending;
                  return (
                    <li className="invite-item" key={inv.id}>
                      <Avatar name={userName(inv.invitedUser)} src={userAvatar(inv.invitedUser)} size={34} />
                      <div className="invite-text">
                        <span>
                          <b>{userName(inv.invitedUser)}</b> → {inv.projectName}
                        </span>
                        <span className="invite-meta">Роль: {roleLabel(inv.role)}</span>
                      </div>
                      <span className={`badge ${tone}`}>{label}</span>
                      <button
                        className="btn btn-ghost btn-icon btn-sm danger-hover"
                        onClick={() => onCancelInvite(inv.id)}
                        aria-label={inv.status === "pending" ? "Отозвать приглашение" : "Убрать из истории"}
                        title={inv.status === "pending" ? "Отозвать" : "Убрать из истории"}
                      >
                        <Icon name="close" size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="invite-col">
          <form className="panel panel-pad invite-form" onSubmit={invite}>
            <div>
              <h3 className="panel-title">Пригласить коллегу</h3>
              <p className="panel-sub">Доступно для проектов, где вы администратор.</p>
            </div>
            {adminProjects.length === 0 ? (
              <p className="muted">Создайте проект — и сможете приглашать в него людей.</p>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="inv-project">Проект</label>
                  <select
                    id="inv-project"
                    className="select"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    required
                  >
                    <option value="">Выберите проект</option>
                    {adminProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field-pair">
                  <div className="field">
                    <label htmlFor="inv-user">ID пользователя</label>
                    <input
                      id="inv-user"
                      className="input"
                      value={userId}
                      onChange={(e) => setUserId(e.target.value)}
                      placeholder="INV-1234"
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="inv-role">Роль</label>
                    <select id="inv-role" className="select" value={role} onChange={(e) => setRole(e.target.value)}>
                      <option value="member">Участник</option>
                      <option value="viewer">Наблюдатель</option>
                      <option value="admin">Админ</option>
                    </select>
                  </div>
                </div>
                <button className="btn btn-primary" disabled={!projectId || !userId.trim()}>
                  Отправить приглашение
                </button>
              </>
            )}
          </form>

          <form className="panel panel-pad invite-form" onSubmit={join}>
            <div>
              <h3 className="panel-title">Вступить по ID проекта</h3>
              <p className="panel-sub">ID есть в настройках проекта у администратора.</p>
            </div>
            <div className="inline-form">
              <input
                className="input"
                value={joinId}
                onChange={(e) => setJoinId(e.target.value)}
                placeholder="Например, 1793472059183"
                aria-label="ID проекта"
              />
              <button className="btn" disabled={!joinId.trim()}>
                <Icon name="login" size={15} /> Вступить
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
