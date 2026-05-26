import "./MyProfile.css";
import { useState, useEffect } from "react";
import Card from "../../components/Card/Card";

export default function MyProfile({ userId, onLogout, onProfileUpdate }) {
  const [displayName, setDisplayName] = useState("");
  const [editingName, setEditingName] = useState("");

  const [email, setEmail] = useState("");
  const [editingEmail, setEditingEmail] = useState("");

  const [avatar, setAvatar] = useState(() => {
    const session = localStorage.getItem("active_user_session");
    if (session) {
      const parsed = JSON.parse(session);
      return parsed.avatar || null;
    }
    return null;
  });

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Загружаем профиль при первом рендере
  useEffect(() => {
    fetch(`/api/user/profile?userId=${userId}`) // Благодаря прокси работает без localhost:8000
      .then((res) => {
        if (!res.ok) throw new Error("Ошибка загрузки профиля");
        return res.json();
      })
      .then((data) => {
        setDisplayName(data.displayName);
        setEditingName(data.displayName);
        setEmail(data.email);
        setEditingEmail(data.email);
        setIsLoading(false);
      })
      .catch((err) => {
        console.warn("FastAPI backend не запущен, загружаем данные локальной сессии:", err.message);
        
        // Резервный вариант: загрузка из localStorage
        const session = localStorage.getItem("active_user_session");
        if (session) {
          const parsed = JSON.parse(session);
          setDisplayName(parsed.name || "Иван Иванов");
          setEditingName(parsed.name || "Иван Иванов");
          setEmail(parsed.email || "ivan@example.com");
          setEditingEmail(parsed.email || "ivan@example.com");
        } else {
          setDisplayName("Иван Иванов");
          setEditingName("Иван Иванов");
          setEmail("ivan@example.com");
          setEditingEmail("ivan@example.com");
        }
        setIsLoading(false);
      });
  }, [userId]);

  function saveName() {
    const trimmed = editingName.trim();
    if (!trimmed) {
      alert("Имя пользователя не может быть пустым");
      return;
    }

    setDisplayName(trimmed);
    
    // Sync local storage session so sidebar changes instantly
    const session = localStorage.getItem("active_user_session");
    let updatedSession = null;
    if (session) {
      updatedSession = JSON.parse(session);
      updatedSession.name = trimmed;
      localStorage.setItem("active_user_session", JSON.stringify(updatedSession));
    }

    // Sync inside auth_users database in localStorage
    const usersJson = localStorage.getItem("auth_users");
    if (usersJson) {
      const users = JSON.parse(usersJson);
      const updatedUsers = users.map((u) => 
        u.id === userId ? { ...u, name: trimmed } : u
      );
      localStorage.setItem("auth_users", JSON.stringify(updatedUsers));
    }

    if (onProfileUpdate && updatedSession) {
      onProfileUpdate(updatedSession);
    }

    // Sync to Python FastAPI Server
    fetch("/api/user/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        displayName: trimmed,
        email: editingEmail
      })
    })
    .then((res) => res.json())
    .then((data) => {
      console.log("Profile name synchronized to FastAPI:", data);
      alert("Имя сохранено");
    })
    .catch((err) => {
      console.log("FastAPI offline, profile saved locally:", err.message);
      alert("Имя сохранено локально");
    });
  }



  function changePassword() {
    if (!currentPassword || !newPassword) {
      alert("Заполните поля пароля");
      return;
    }
    if (newPassword !== confirmPassword) {
      alert("Новый пароль и подтверждение не совпадают");
      return;
    }
    const usersJson = localStorage.getItem("auth_users");
    if (usersJson) {
      const users = JSON.parse(usersJson);
      const user = users.find(u => u.id === userId);
      
      if (!user || user.password !== currentPassword) {
        alert("Текущий пароль введен неверно");
        return;
      }
      
      const updatedUsers = users.map((u) => 
        u.id === userId ? { ...u, password: newPassword } : u
      );
      localStorage.setItem("auth_users", JSON.stringify(updatedUsers));
      
      // Update session as well if password is stored there
      const session = localStorage.getItem("active_user_session");
      if (session) {
        const parsed = JSON.parse(session);
        parsed.password = newPassword;
        localStorage.setItem("active_user_session", JSON.stringify(parsed));
      }
      
      // Trigger sync
      const token = localStorage.getItem("auth_token");
      fetch("/api/sync", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ users: updatedUsers }),
      }).catch(e => console.log(e));
    }
    
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    alert("Пароль успешно изменён!");
  }

  function handleAvatarChange(event) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64Avatar = e.target.result;
        setAvatar(base64Avatar);
        
        // Save to active session
        const session = localStorage.getItem("active_user_session");
        if (session) {
          const parsed = JSON.parse(session);
          parsed.avatar = base64Avatar;
          localStorage.setItem("active_user_session", JSON.stringify(parsed));
          if (onProfileUpdate) onProfileUpdate(parsed);
        }
        
        // Save to users DB
        const usersJson = localStorage.getItem("auth_users");
        if (usersJson) {
          const users = JSON.parse(usersJson);
          const updatedUsers = users.map((u) => 
            u.id === userId ? { ...u, avatar: base64Avatar } : u
          );
          localStorage.setItem("auth_users", JSON.stringify(updatedUsers));
          
          // Trigger sync
          const token = localStorage.getItem("auth_token");
          fetch("/api/sync", {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              ...(token ? { "Authorization": `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ users: updatedUsers }),
          }).catch(e => console.log(e));
        }
      };
      reader.readAsDataURL(file);
    }
  }

  function handleLogout() {
    if (onLogout) {
      onLogout();
    }
  }

  // Пока данные грузятся, показываем спиннер
  if (isLoading) {
    return (
      <div className="page-fade-in profile-page" style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "80vh", fontSize: "18px", color: "var(--nav-text-inactive)" }}>
        Загрузка профиля...
      </div>
    );
  }

  return (
    <div className="page-fade-in profile-page">
      <h2 className="profile-title">Мой профиль — {displayName}</h2>

      <div className="profile-cards">
        <Card title="Аватар">
          <div className="avatar-section">
            {avatar ? (
              <img
                src={avatar}
                className="avatar-image"
                alt="Avatar"
                onClick={() => document.querySelector(".avatar-input").click()}
                style={{ cursor: "pointer" }}
              />
            ) : (
              <div 
                className="avatar-image avatar-placeholder" 
                onClick={() => document.querySelector(".avatar-input").click()}
              >
                <svg className="avatar-placeholder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="avatar-input"
              style={{ display: "none" }}
            />
            <button 
              className="btn secondary small" 
              onClick={() => document.querySelector(".avatar-input").click()}
            >
              Выбрать фото
            </button>
          </div>
        </Card>

        <Card title="Информация">
          <label>ID пользователя (только для чтения)</label>
          <input type="text" value={userId} readOnly />
          
          <label>Email (только для чтения)</label>
          <input type="text" value={email || ""} readOnly />
          
          <label>Отображаемое имя</label>
          <input
            type="text"
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn primary" onClick={saveName}>
              Сохранить
            </button>
            <button className="btn" onClick={() => setEditingName(displayName)}>
              Отмена
            </button>
          </div>
        </Card>

        <Card title="Смена пароля">
          <label>Текущий пароль</label>
          <input 
            type="password" 
            value={currentPassword} 
            onChange={(e) => setCurrentPassword(e.target.value)} 
          />
          <label>Новый пароль</label>
          <input 
            type="password" 
            value={newPassword} 
            onChange={(e) => setNewPassword(e.target.value)} 
          />
          <label>Подтвердите новый пароль</label>
          <input 
            type="password" 
            value={confirmPassword} 
            onChange={(e) => setConfirmPassword(e.target.value)} 
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn primary" onClick={changePassword}>
              Изменить пароль
            </button>
          </div>
        </Card>

        <Card title="Аккаунт">
          <p>Выйти из текущей учётной записи.</p>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn danger" onClick={handleLogout}>
              Выйти
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
