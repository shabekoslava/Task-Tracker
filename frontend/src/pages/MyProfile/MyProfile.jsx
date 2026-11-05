import { useRef, useState } from "react";
import Icon from "../../components/Icon/Icon";
import Avatar from "../../components/Avatar/Avatar";
import { api } from "../../lib/api";
import { EMAIL_RE } from "../../lib/format";
import { toast } from "../../lib/toast";
import "./MyProfile.css";

const MAX_AVATAR_SIDE = 256;

// Сжимаем фото до 256px: аватар хранится в БД строкой base64
function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, MAX_AVATAR_SIDE / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function MyProfile({ user, onLogout, onProfileUpdate }) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [saving, setSaving] = useState(null);
  const fileRef = useRef(null);

  const updateProfile = async (changes, key, successText) => {
    setSaving(key);
    try {
      const data = await api("/api/user/profile", { method: "POST", body: changes });
      onProfileUpdate({ ...user, ...data.user });
      toast(successText);
      return true;
    } catch (err) {
      toast(err.message, "error");
      return false;
    } finally {
      setSaving(null);
    }
  };

  const saveInfo = (e) => {
    e.preventDefault();
    if (!name.trim()) return toast("Имя не может быть пустым", "error");
    if (!EMAIL_RE.test(email.trim())) return toast("Проверьте адрес почты", "error");
    updateProfile({ displayName: name.trim(), email: email.trim() }, "info", "Профиль обновлён");
  };

  const changeAvatar = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const avatar = await resizeImage(file);
      await updateProfile({ avatar }, "avatar", "Фото обновлено");
    } catch {
      toast("Не удалось прочитать изображение", "error");
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (passwords.next.length < 6) return toast("Новый пароль должен быть не короче 6 символов", "error");
    if (passwords.next !== passwords.confirm) return toast("Пароли не совпадают", "error");
    setSaving("password");
    try {
      await api("/api/auth/change-password", {
        method: "POST",
        body: { currentPassword: passwords.current, newPassword: passwords.next },
      });
      setPasswords({ current: "", next: "", confirm: "" });
      toast("Пароль изменён");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSaving(null);
    }
  };

  const setPassword = (field) => (e) => setPasswords((prev) => ({ ...prev, [field]: e.target.value }));
  const infoChanged = name.trim() !== user.name || email.trim() !== user.email;

  return (
    <div className="page profile-page">
      <section className="profile-hero panel">
        <button
          className="profile-avatar"
          onClick={() => fileRef.current?.click()}
          aria-label="Сменить фото"
          disabled={saving === "avatar"}
        >
          <Avatar name={user.name} src={user.avatar} size={84} />
          <span className="profile-avatar-overlay">
            <Icon name="image" size={20} />
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={changeAvatar} />
        <div className="profile-hero-text">
          <h1>{user.name}</h1>
          <span className="muted">{user.email}</span>
          <span className="id-chip">{user.id}</span>
        </div>
        <div className="profile-hero-actions">
          {user.avatar && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => updateProfile({ avatar: null }, "avatar", "Фото удалено")}
            >
              Убрать фото
            </button>
          )}
          <button className="btn btn-sm" onClick={onLogout}>
            <Icon name="logout" size={14} /> Выйти
          </button>
        </div>
      </section>

      <div className="profile-grid">
        <form className="panel panel-pad profile-section" onSubmit={saveInfo}>
          <div>
            <h3 className="panel-title">Личные данные</h3>
            <p className="panel-sub">Имя видят коллеги в проектах и чатах.</p>
          </div>
          <div className="field">
            <label htmlFor="profile-name">Имя</label>
            <input id="profile-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="profile-email">Почта</label>
            <input
              id="profile-email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="profile-actions">
            {infoChanged && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setName(user.name);
                  setEmail(user.email);
                }}
              >
                Отменить
              </button>
            )}
            <button className="btn btn-primary" disabled={!infoChanged || saving === "info"}>
              {saving === "info" ? "Сохраняем…" : "Сохранить"}
            </button>
          </div>
        </form>

        <form className="panel panel-pad profile-section" onSubmit={changePassword}>
          <div>
            <h3 className="panel-title">Пароль</h3>
            <p className="panel-sub">Минимум 6 символов.</p>
          </div>
          <div className="field">
            <label htmlFor="pw-current">Текущий пароль</label>
            <input
              id="pw-current"
              className="input"
              type="password"
              value={passwords.current}
              onChange={setPassword("current")}
              autoComplete="current-password"
              required
            />
          </div>
          <div className="field-pair">
            <div className="field">
              <label htmlFor="pw-next">Новый</label>
              <input
                id="pw-next"
                className="input"
                type="password"
                value={passwords.next}
                onChange={setPassword("next")}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="pw-confirm">Ещё раз</label>
              <input
                id="pw-confirm"
                className="input"
                type="password"
                value={passwords.confirm}
                onChange={setPassword("confirm")}
                autoComplete="new-password"
                required
              />
            </div>
          </div>
          <div className="profile-actions">
            <button className="btn btn-primary" disabled={saving === "password"}>
              {saving === "password" ? "Меняем…" : "Изменить пароль"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
