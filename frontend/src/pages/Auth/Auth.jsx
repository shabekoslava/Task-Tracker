import { useEffect, useState } from "react";
import { api, setToken, getToken, clearToken } from "../../lib/api";
import { EMAIL_RE } from "../../lib/format";
import { toast } from "../../lib/toast";
import { BrandMark } from "../../components/Sidebar/Sidebar";
import "./Auth.css";

// login → register → verify;  recover → recover-code → recover-password
const COPY = {
  login: ["Вход", null],
  register: ["Регистрация", null],
  verify: ["Подтверждение почты", null],
  recover: ["Восстановление пароля", "Отправим код на почту, указанную при регистрации."],
  "recover-code": ["Код из письма", null],
  "recover-password": ["Новый пароль", "Не короче 6 символов."],
};

function sessionFrom(data) {
  return { id: data.user.id, name: data.user.name, email: data.user.email, avatar: data.user.avatar || null };
}

export default function Auth({ onLoginSuccess }) {
  const [step, setStep] = useState("login");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    login: "",
    password: "",
    name: "",
    email: "",
    confirm: "",
    code: "",
  });

  const set = (field) => (e) =>
    setForm((prev) => ({
      ...prev,
      [field]: field === "code" ? e.target.value.replace(/\D/g, "").slice(0, 6) : e.target.value,
    }));

  const go = (next) => {
    setError("");
    setStep(next);
  };

  // Восстанавливаем сессию по сохранённому токену
  useEffect(() => {
    if (!getToken()) return;
    api("/api/auth/me")
      .then(async (data) => {
        const profile = await api("/api/user/profile").catch(() => null);
        onLoginSuccess({ ...sessionFrom(data), avatar: profile?.avatar || null });
      })
      .catch(() => clearToken());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (action) => {
    setError("");
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const finishAuth = async (data) => {
    setToken(data.access_token);
    const profile = await api("/api/user/profile").catch(() => null);
    onLoginSuccess({ ...sessionFrom(data), avatar: profile?.avatar || null });
  };

  const submitLogin = (e) => {
    e.preventDefault();
    run(async () => {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: { login: form.login.trim(), password: form.password },
      });
      await finishAuth(data);
    });
  };

  const requestRegisterCode = () =>
    api("/api/auth/send-code", {
      method: "POST",
      body: { email: form.email.trim(), purpose: "register" },
    });

  const submitRegister = (e) => {
    e.preventDefault();
    if (!EMAIL_RE.test(form.email.trim())) return setError("Похоже, в адресе почты опечатка");
    if (form.password.length < 6) return setError("Пароль должен быть не короче 6 символов");
    if (form.password !== form.confirm) return setError("Пароли не совпадают");
    run(async () => {
      await requestRegisterCode();
      setForm((prev) => ({ ...prev, code: "" }));
      go("verify");
    });
  };

  const submitVerify = (e) => {
    e.preventDefault();
    run(async () => {
      const data = await api("/api/auth/register", {
        method: "POST",
        body: {
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          code: form.code,
        },
      });
      toast(`Аккаунт создан. Ваш ID: ${data.user.id}`);
      await finishAuth(data);
    });
  };

  const submitRecover = (e) => {
    e.preventDefault();
    run(async () => {
      await api("/api/auth/send-code", {
        method: "POST",
        body: { email: form.email.trim(), purpose: "reset" },
      });
      setForm((prev) => ({ ...prev, code: "" }));
      go("recover-code");
    });
  };

  const submitRecoverCode = (e) => {
    e.preventDefault();
    run(async () => {
      await api("/api/auth/verify-code", {
        method: "POST",
        body: { email: form.email.trim(), purpose: "reset", code: form.code },
      });
      setForm((prev) => ({ ...prev, password: "", confirm: "" }));
      go("recover-password");
    });
  };

  const submitNewPassword = (e) => {
    e.preventDefault();
    if (form.password.length < 6) return setError("Пароль должен быть не короче 6 символов");
    if (form.password !== form.confirm) return setError("Пароли не совпадают");
    run(async () => {
      await api("/api/auth/change-password", {
        method: "POST",
        body: { email: form.email.trim(), code: form.code, newPassword: form.password },
      });
      toast("Пароль обновлён, теперь можно войти");
      setForm((prev) => ({ ...prev, login: prev.email, password: "", confirm: "", code: "" }));
      go("login");
    });
  };

  const [title, subtitle] = COPY[step];
  const codeSubtitle = (
    <>
      Отправили код на <b>{form.email.trim()}</b>. Почтового сервера нет, поэтому код
      выводится в лог auth-service.
    </>
  );

  const field = (id, label, props) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input auth-input" required {...props} />
    </div>
  );

  const codeField = field("code", "Код из письма", {
    value: form.code,
    onChange: set("code"),
    inputMode: "numeric",
    autoComplete: "one-time-code",
    placeholder: "000000",
    className: "input auth-input code-input",
    autoFocus: true,
  });

  return (
    <div className="auth-page">
      <div className="auth-box">
        <div className="auth-brand">
          <BrandMark size={28} />
          <span>Task Tracker</span>
        </div>

        <div className="auth-card">
          <h1 className="auth-title">{title}</h1>
          {(subtitle || step === "verify" || step === "recover-code") && (
            <p className="auth-subtitle">
              {step === "verify" || step === "recover-code" ? codeSubtitle : subtitle}
            </p>
          )}

          {error && <div className="notice notice-error auth-error">{error}</div>}

          {step === "login" && (
            <form className="auth-form" onSubmit={submitLogin}>
              {field("login", "Email или ID", {
                value: form.login,
                onChange: set("login"),
                placeholder: "ivan@example.com или INV-1234",
                autoComplete: "username",
                autoFocus: true,
              })}
              <div className="field">
                <div className="field-row">
                  <label htmlFor="password">Пароль</label>
                  <button
                    type="button"
                    className="link-btn small"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, email: prev.login.includes("@") ? prev.login : prev.email }));
                      go("recover");
                    }}
                  >
                    Забыли пароль?
                  </button>
                </div>
                <input
                  id="password"
                  className="input auth-input"
                  type="password"
                  value={form.password}
                  onChange={set("password")}
                  autoComplete="current-password"
                  required
                />
              </div>
              <button className="btn btn-primary btn-block auth-submit" disabled={busy}>
                {busy ? "Входим…" : "Войти"}
              </button>
            </form>
          )}

          {step === "register" && (
            <form className="auth-form" onSubmit={submitRegister}>
              {field("name", "Имя", {
                value: form.name,
                onChange: set("name"),
                placeholder: "Иван Иванов",
                autoComplete: "name",
                autoFocus: true,
              })}
              {field("email", "Почта", {
                type: "email",
                value: form.email,
                onChange: set("email"),
                placeholder: "ivan@example.com",
                autoComplete: "email",
              })}
              <div className="field-pair">
                {field("new-password", "Пароль", {
                  type: "password",
                  value: form.password,
                  onChange: set("password"),
                  autoComplete: "new-password",
                })}
                {field("confirm", "Ещё раз", {
                  type: "password",
                  value: form.confirm,
                  onChange: set("confirm"),
                  autoComplete: "new-password",
                })}
              </div>
              <button className="btn btn-primary btn-block auth-submit" disabled={busy}>
                {busy ? "Отправляем код…" : "Продолжить"}
              </button>
            </form>
          )}

          {step === "verify" && (
            <form className="auth-form" onSubmit={submitVerify}>
              {codeField}
              <button className="btn btn-primary btn-block auth-submit" disabled={busy || form.code.length !== 6}>
                {busy ? "Проверяем…" : "Подтвердить и войти"}
              </button>
              <div className="auth-links">
                <button type="button" className="link-btn" onClick={() => go("register")}>
                  Изменить данные
                </button>
                <button
                  type="button"
                  className="link-btn"
                  disabled={busy}
                  onClick={() => run(async () => {
                    await requestRegisterCode();
                    toast("Новый код отправлен");
                  })}
                >
                  Отправить код ещё раз
                </button>
              </div>
            </form>
          )}

          {step === "recover" && (
            <form className="auth-form" onSubmit={submitRecover}>
              {field("recover-email", "Почта", {
                type: "email",
                value: form.email,
                onChange: set("email"),
                autoComplete: "email",
                autoFocus: true,
              })}
              <button className="btn btn-primary btn-block auth-submit" disabled={busy}>
                {busy ? "Отправляем…" : "Получить код"}
              </button>
            </form>
          )}

          {step === "recover-code" && (
            <form className="auth-form" onSubmit={submitRecoverCode}>
              {codeField}
              <button className="btn btn-primary btn-block auth-submit" disabled={busy || form.code.length !== 6}>
                Продолжить
              </button>
            </form>
          )}

          {step === "recover-password" && (
            <form className="auth-form" onSubmit={submitNewPassword}>
              {field("reset-password", "Новый пароль", {
                type: "password",
                value: form.password,
                onChange: set("password"),
                autoComplete: "new-password",
                autoFocus: true,
              })}
              {field("reset-confirm", "Повторите пароль", {
                type: "password",
                value: form.confirm,
                onChange: set("confirm"),
                autoComplete: "new-password",
              })}
              <button className="btn btn-primary btn-block auth-submit" disabled={busy}>
                Сохранить пароль
              </button>
            </form>
          )}

        </div>

        <p className="auth-switch">
          {step === "login" ? (
            <>
              Нет аккаунта?{" "}
              <button type="button" className="link-btn" onClick={() => go("register")}>
                Зарегистрироваться
              </button>
            </>
          ) : (
            <>
              {step === "register" ? "Уже есть аккаунт? " : ""}
              <button type="button" className="link-btn" onClick={() => go("login")}>
                {step === "register" ? "Войти" : "Вернуться ко входу"}
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
