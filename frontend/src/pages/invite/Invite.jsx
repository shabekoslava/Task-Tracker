// src/pages/invite/Invite.jsx
import { useState } from "react";
import "./Invite.css";

export default function Invite({
  currentUserId,
  projects,
  receivedInvites,
  sentInvites,
  onJoinProjectById,
  onSendInvite,
  onAcceptInvite,
  onDeclineInvite,
  onCancelInvite,
  onClearInviteHistory
}) {
  const [projectIdInput, setProjectIdInput] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joinSuccess, setJoinSuccess] = useState("");

  const [inviteUserId, setInviteUserId] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [inviteRole, setInviteRole] = useState("member");

  // Get projects where current user is admin
  const adminProjects = projects.filter((p) =>
    p.members.some((m) => m.id === currentUserId && m.role === "admin")
  );

  const handleJoinByCode = (e) => {
    e.preventDefault();
    setJoinError("");
    setJoinSuccess("");

    const code = projectIdInput.trim();
    if (!code) {
      setJoinError("Пожалуйста, введите ID проекта");
      return;
    }

    const success = onJoinProjectById(code);
    if (success) {
      setJoinSuccess("Вы успешно вступили в проект!");
      setProjectIdInput("");
    } else {
      setJoinError("Проект с таким ID не найден или вы уже состоите в нем");
    }
  };

  const handleSendInvite = (e) => {
    e.preventDefault();
    setInviteError("");
    setInviteSuccess("");

    const targetUserId = inviteUserId.trim();
    const projId = selectedProjectId;

    if (!targetUserId || !projId) {
      setInviteError("Пожалуйста, заполните все поля");
      return;
    }

    if (targetUserId.toUpperCase() === currentUserId.toUpperCase()) {
      setInviteError("Вы не можете пригласить сами себя");
      return;
    }

    // Call state handler in parent
    const result = onSendInvite(projId, targetUserId, inviteRole);
    if (result.success) {
      setInviteSuccess(result.message);
      setInviteUserId("");
      setInviteRole("member");
    } else {
      setInviteError(result.message);
    }
  };

  const copyUserId = () => {
    navigator.clipboard.writeText(currentUserId);
    alert(`Ваш ID (${currentUserId}) успешно скопирован в буфер обмена!`);
  };

  // Check if there is any history (accepted or declined) to clean
  const hasHistory = sentInvites.some(inv => inv.status !== "pending") || receivedInvites.some(inv => inv.status !== "pending");

  return (
    <div className="page-fade-in invite-page">
      <div className="invite-header-section">
        <h2>Приглашения</h2>
        <p>Ваш личный ID: <span className="user-id-highlight" onClick={copyUserId} style={{ cursor: "pointer" }} title="Нажмите, чтобы скопировать">{currentUserId} 📋</span></p>
      </div>

      <div className="invite-grid-layouts">
        {/* Left Side: Join and Send Forms */}
        <div className="invite-forms-column">
          {/* Join Project Card */}
          <div className="invite-card">
            <h3>Войти в проект по ID проекта</h3>
            
            <form onSubmit={handleJoinByCode} className="invite-form-element">
              <input
                type="text"
                value={projectIdInput}
                onChange={(e) => setProjectIdInput(e.target.value)}
                placeholder="Например, 17163821034"
              />
              <button type="submit" className="btn primary">
                Присоединиться
              </button>
            </form>
            {joinError && <div className="invite-msg error-msg">{joinError}</div>}
            {joinSuccess && <div className="invite-msg success-msg">{joinSuccess}</div>}
          </div>

          {/* Send Invite Card */}
          <div className="invite-card">
            <h3>Отправить приглашение</h3>

            {adminProjects.length === 0 ? (
              <p className="no-admin-projects-warn">Вы не являетесь администратором ни одного проекта. Чтобы приглашать коллег, создайте проект во вкладке "Мои проекты".</p>
            ) : (
              <form onSubmit={handleSendInvite} className="invite-form-element vertical">
                <div className="form-field-wrapper">
                  <label>Выбрать проект</label>
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    required
                  >
                    <option value="">-- Выберите проект --</option>
                    {adminProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-field-wrapper">
                  <label>ID пользователя</label>
                  <input
                    type="text"
                    value={inviteUserId}
                    onChange={(e) => setInviteUserId(e.target.value)}
                    placeholder="Например, INV-1234"
                    required
                  />
                </div>

                <div className="form-field-wrapper">
                  <label>Роль в проекте</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    required
                  >
                    <option value="member">Участник</option>
                    <option value="viewer">Наблюдатель</option>
                    <option value="admin">Админ</option>
                  </select>
                </div>

                <button type="submit" className="btn primary">
                  Отправить приглашение
                </button>
              </form>
            )}
            {inviteError && <div className="invite-msg error-msg">{inviteError}</div>}
            {inviteSuccess && <div className="invite-msg success-msg">{inviteSuccess}</div>}
          </div>
        </div>

        {/* Right Side: Incoming and Outgoing Lists */}
        <div className="invite-lists-column">
          {/* Incoming Card */}
          <div className="invite-card">
            <h3>Входящие приглашения ({receivedInvites.length})</h3>
            
            {receivedInvites.length === 0 ? (
              <div className="empty-state-list-text">
                Пока никто не присылал вам приглашений.
              </div>
            ) : (
              <div className="invitations-list-wrapper">
                {receivedInvites.map((inv) => (
                  <div key={inv.id} className="invitation-item-card incoming">
                    <div className="inv-details">
                      <div className="project-title-name">
                        {inv.projectName}{" "}
                        <span style={{ fontSize: "11px", opacity: 0.6, fontFamily: "monospace" }}>
                          (ID: {inv.projectId})
                        </span>
                      </div>
                      <div className="inv-meta-info">
                        Отправитель: <span className="sender-id">{inv.invitedBy}</span> | Роль: <span style={{ fontWeight: "600", color: "var(--primary-color)" }}>{inv.role === 'admin' ? 'Админ' : inv.role === 'member' ? 'Участник' : 'Наблюдатель'}</span>
                      </div>
                    </div>
                    <div className="inv-actions">
                      <button
                        className="btn success small"
                        onClick={() => onAcceptInvite(inv.id, inv.projectId)}
                      >
                        Принять
                      </button>
                      <button
                        className="btn danger small"
                        onClick={() => onDeclineInvite(inv.id)}
                      >
                        Отклонить
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Outgoing Card */}
          <div className="invite-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h3>Исходящие приглашения ({sentInvites.length})</h3>
              {hasHistory && (
                <button className="btn-link-clear" onClick={onClearInviteHistory} title="Удалить принятые и отклоненные из истории">
                  Очистить историю
                </button>
              )}
            </div>

            {sentInvites.length === 0 ? (
              <div className="empty-state-list-text">
                Вы пока не приглашали коллег.
              </div>
            ) : (
              <div className="invitations-list-wrapper">
                {sentInvites.map((inv) => (
                  <div key={inv.id} className="invitation-item-card outgoing">
                    <div className="inv-details">
                      <div className="project-title-name">
                        {inv.projectName}{" "}
                        <span style={{ fontSize: "11px", opacity: 0.6, fontFamily: "monospace" }}>
                          (ID: {inv.projectId})
                        </span>
                      </div>
                      <div className="inv-meta-info">
                        Кому: <span className="recipient-id">{inv.invitedUser}</span> | Роль: <span style={{ fontWeight: "600", color: "var(--primary-color)" }}>{inv.role === 'admin' ? 'Админ' : inv.role === 'member' ? 'Участник' : 'Наблюдатель'}</span>
                      </div>
                    </div>
                    <div className="inv-actions-status">
                      {inv.status === "pending" ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span className="status-badge pending">В ожидании</span>
                          <button 
                            className="btn-icon-cancel" 
                            onClick={() => onCancelInvite(inv.id)}
                            title="Отменить и отозвать приглашение"
                          >
                            &times;
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          {inv.status === "accepted" && (
                            <span className="status-badge accepted">Принято</span>
                          )}
                          {inv.status === "declined" && (
                            <span className="status-badge declined">Отклонено</span>
                          )}
                          <button 
                            className="btn-icon-delete" 
                            onClick={() => onCancelInvite(inv.id)} // Uses the same filter callback
                            title="Удалить из истории"
                          >
                            🗑️
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
