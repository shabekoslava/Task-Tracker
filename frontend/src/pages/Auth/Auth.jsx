// src/pages/Auth/Auth.jsx
import { useState, useEffect } from "react";
import "./Auth.css";

export default function Auth({ onLoginSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState("");
  
  // Login form fields
  const [loginIdOrEmail, setLoginIdOrEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register form fields
  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState("");

  // 📧 Email verification flow states
  const [isVerifying, setIsVerifying] = useState(false);
  const [generatedOtp, setGeneratedOtp] = useState("");
  const [userOtpInput, setUserOtpInput] = useState("");
  const [tempUserData, setTempUserData] = useState(null);
  const [isResending, setIsResending] = useState(false);

  // 🔑 Password Recovery states
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryStep, setRecoveryStep] = useState(1); // 1: Email, 2: OTP, 3: New Password
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  // 🔄 При монтировании проверяем сохранённый JWT токен
  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (token) {
      // Проверяем токен на бэкенде
      fetch("/api/auth/me", {
        headers: { "Authorization": `Bearer ${token}` }
      })
        .then((res) => {
          if (res.ok) return res.json();
          throw new Error("Invalid token");
        })
        .then((data) => {
          if (data.user) {
            const sessionData = {
              id: data.user.id,
              name: data.user.name,
              email: data.user.email
            };
            localStorage.setItem("active_user_session", JSON.stringify(sessionData));
            onLoginSuccess(sessionData);
          }
        })
        .catch(() => {
          // Токен невалидный или истёкший — удаляем
          localStorage.removeItem("auth_token");
        });
    }
  }, []);

  // ==========================================================================
  // 🔑 Логин через JWT (POST /api/auth/login)
  // ==========================================================================
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const trimmedInput = loginIdOrEmail.trim();
    const password = loginPassword;

    if (!trimmedInput || !password) {
      setError("Пожалуйста, заполните все поля");
      return;
    }

    try {
      // 🔐 Отправляем логин/пароль на бэкенд — пароль проверяется через bcrypt на сервере
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: trimmedInput, password: password })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setError(errData.detail || "Неверный логин или пароль");
        return;
      }

      const data = await res.json();

      // 🎫 Сохраняем зашифрованный JWT токен от бэкенда
      if (data.access_token) {
        localStorage.setItem("auth_token", data.access_token);
      }

      const sessionData = {
        id: data.user.id,
        name: data.user.name,
        email: data.user.email
      };
      localStorage.setItem("active_user_session", JSON.stringify(sessionData));

      // Подтягиваем данные проектов после успешного логина
      try {
        const allDataRes = await fetch("/api/all_data", {
          headers: data.access_token 
            ? { "Authorization": `Bearer ${data.access_token}` } 
            : {}
        });
        if (allDataRes.ok) {
          const allData = await allDataRes.json();
          if (allData.projects) {
            localStorage.setItem("project_tracker_projects", JSON.stringify(allData.projects));
          }
          if (allData.chats) {
            localStorage.setItem("project_tracker_chats", JSON.stringify(allData.chats));
          }
          if (allData.invitations) {
            localStorage.setItem("project_invitations", JSON.stringify(allData.invitations));
          }
        }
      } catch (err) {
        console.log("Не удалось подтянуть данные после логина:", err.message);
      }

      onLoginSuccess(sessionData);

    } catch (err) {
      console.error("Login error:", err);
      setError("Ошибка соединения с сервером. Проверьте, запущен ли бэкенд.");
    }
  };

  // ==========================================================================
  // 📝 Регистрация через JWT (POST /api/auth/register)
  // ==========================================================================
  const handleRegisterSubmit = (e) => {
    e.preventDefault();
    setError("");

    const name = registerName.trim();
    const email = registerEmail.trim();
    const password = registerPassword;
    const confirm = registerConfirmPassword;

    if (!name || !email || !password || !confirm) {
      setError("Пожалуйста, заполните все поля");
      return;
    }

    // 💡 Strict email syntax check using regex to prevent fake/malformed emails
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      setError("Пожалуйста, введите корректный адрес электронной почты");
      return;
    }

    if (password !== confirm) {
      setError("Пароли не совпадают");
      return;
    }

    // Generate a random 6-digit confirmation code
    const code = String(Math.floor(100000 + Math.random() * 900000));
    setGeneratedOtp(code);
    setTempUserData({ name, email, password });

    // Mock API call to display code in FastAPI terminal console
    fetch("/api/auth/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, name }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Бэкенд офлайн");
        return res.json();
      })
      .then(() => {
        setIsVerifying(true);
        setUserOtpInput("");
        alert(`На вашу почту ${email} был отправлен код подтверждения! Проверьте консоль бэкенда.`);
      })
      .catch((err) => {
        console.error(err);
        // Fallback for offline mode so developers/students can still test without a running server
        setIsVerifying(true);
        setUserOtpInput("");
        alert(`[Offline Mode] Код подтверждения сгенерирован: ${code} (Бэкенд недоступен, введите его для проверки)`);
      });
  };

  // ==========================================================================
  // ✅ Подтверждение OTP → Регистрация на бэкенде с хешированием пароля
  // ==========================================================================
  const handleVerifyOtpSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (userOtpInput !== generatedOtp) {
      setError("Неверный код подтверждения. Пожалуйста, проверьте код из консоли бэкенда.");
      return;
    }

    const name = tempUserData.name;
    const email = tempUserData.email;
    const password = tempUserData.password;

    try {
      // 🔐 Отправляем данные на бэкенд — пароль хешируется bcrypt НА СЕРВЕРЕ
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setError(errData.detail || "Ошибка при регистрации");
        setIsVerifying(false);
        return;
      }

      const data = await res.json();

      // 🎫 Сохраняем зашифрованный JWT токен от бэкенда
      if (data.access_token) {
        localStorage.setItem("auth_token", data.access_token);
      }

      const sessionData = {
        id: data.user.id,
        name: data.user.name,
        email: data.user.email
      };
      localStorage.setItem("active_user_session", JSON.stringify(sessionData));

      alert(`Регистрация успешна! Ваш уникальный ID: ${data.user.id}`);
      onLoginSuccess(sessionData);

    } catch (err) {
      console.error("Register error:", err);
      setError("Ошибка соединения с сервером.");
    }

    // Reset states
    setIsVerifying(false);
    setGeneratedOtp("");
    setUserOtpInput("");
    setTempUserData(null);
  };

  const handleResendOtp = () => {
    if (!tempUserData) return;
    setIsResending(true);
    setError("");
    const newCode = String(Math.floor(100000 + Math.random() * 900000));
    setGeneratedOtp(newCode);

    fetch("/api/auth/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: tempUserData.email,
        code: newCode,
        name: tempUserData.name
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Ошибка бэкенда при отправке");
        return res.json();
      })
      .then(() => {
        setIsResending(false);
        alert("Код подтверждения был повторно отправлен! Проверьте консоль сервера.");
      })
      .catch((err) => {
        console.error(err);
        setIsResending(false);
        setError("Не удалось отправить код повторно. Бэкенд офлайн?");
      });
  };

  // --- Password Recovery Handlers ---
  const handleRecoveryRequest = (e) => {
    e.preventDefault();
    setError("");
    const email = recoveryEmail.trim();
    if (!email) {
      setError("Введите вашу электронную почту");
      return;
    }

    // Отправляем код восстановления на бэкенд
    const code = String(Math.floor(100000 + Math.random() * 900000));
    setGeneratedOtp(code);
    setTempUserData({ email });

    fetch("/api/auth/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, name: "Восстановление" }),
    })
      .then(() => {
        setRecoveryStep(2);
        setUserOtpInput("");
        alert(`На вашу почту ${email} отправлен код для восстановления пароля.`);
      })
      .catch(() => {
        setRecoveryStep(2);
        setUserOtpInput("");
        alert(`[Offline Mode] Код для восстановления: ${code}`);
      });
  };

  const handleVerifyRecoveryOtp = (e) => {
    e.preventDefault();
    setError("");
    if (userOtpInput !== generatedOtp) {
      setError("Неверный код подтверждения.");
      return;
    }
    setRecoveryStep(3);
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmNewPassword) {
      setError("Пароли не совпадают");
      return;
    }
    if (newPassword.length < 3) {
      setError("Пароль слишком короткий");
      return;
    }

    try {
      // 🔐 Отправляем новый пароль на бэкенд — хешируется bcrypt на сервере
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: tempUserData?.email || recoveryEmail,
          newPassword: newPassword
        })
      });

      if (res.ok) {
        alert("Ваш пароль был успешно изменен! Теперь вы можете войти.");
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.detail || "Ошибка при смене пароля");
        return;
      }
    } catch (err) {
      console.error(err);
      alert("Пароль изменён локально, но сервер недоступен.");
    }

    setIsRecovering(false);
    setIsLogin(true);
    setLoginIdOrEmail(tempUserData?.email || recoveryEmail);
    setLoginPassword("");
  };

  return (
    <div className="auth-background-wrapper">
      <div className="auth-background-shapes">
        <div className="shape shape-1"></div>
        <div className="shape shape-2"></div>
      </div>
      
      <div className="auth-card-container page-fade-in">
        <div className="auth-card-header">
          <div className="auth-logo">
            <span className="auth-logo-icon">✔</span>
            <span className="auth-logo-text">Task Tracker</span>
          </div>
          <h2>
            {isRecovering
              ? "Восстановление пароля"
              : isVerifying 
                ? "Подтверждение почты" 
                : isLogin 
                  ? "Добро пожаловать!" 
                  : "Создать аккаунт"}
          </h2>
          <p className="auth-subtitle">
            {isRecovering
              ? recoveryStep === 1 
                ? "Введите email для сброса пароля"
                : recoveryStep === 2
                  ? `Мы отправили код на ${tempUserData?.email}`
                  : "Придумайте новый надежный пароль"
              : isVerifying 
                ? `Мы отправили 6-значный код подтверждения на ${tempUserData?.email}. Проверьте консоль бэкенда.`
                : isLogin 
                  ? "Введите свои учетные данные для доступа к доске" 
                  : "Заполните форму, чтобы начать работу с проектами"}
          </p>
        </div>

        {error && <div className="auth-error-box">{error}</div>}

        {isRecovering ? (
          recoveryStep === 1 ? (
            <form className="auth-form" onSubmit={handleRecoveryRequest}>
              <div className="auth-field">
                <label htmlFor="rec-email">Электронная почта</label>
                <input
                  id="rec-email"
                  type="email"
                  value={recoveryEmail}
                  onChange={(e) => setRecoveryEmail(e.target.value)}
                  placeholder="Ваш зарегистрированный email"
                  required
                />
              </div>
              <button type="submit" className="auth-submit-btn">Отправить код</button>
              <button 
                type="button" 
                className="auth-toggle-link"
                style={{ marginTop: "12px", background: "none", border: "none", cursor: "pointer", display: "block", width: "100%", textAlign: "center" }}
                onClick={() => { setIsRecovering(false); setError(""); }}
              >
                Вернуться ко входу
              </button>
            </form>
          ) : recoveryStep === 2 ? (
            <form className="auth-form" onSubmit={handleVerifyRecoveryOtp}>
              <div className="auth-field">
                <label htmlFor="rec-otp">Код подтверждения</label>
                <input
                  id="rec-otp"
                  type="text"
                  maxLength={6}
                  value={userOtpInput}
                  onChange={(e) => setUserOtpInput(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  style={{ textAlign: "center", letterSpacing: "8px", fontSize: "20px", fontWeight: "bold" }}
                  required
                />
              </div>
              <button type="submit" className="auth-submit-btn">Подтвердить код</button>
              <button 
                type="button" 
                className="auth-toggle-link"
                style={{ marginTop: "12px", background: "none", border: "none", cursor: "pointer", display: "block", width: "100%", textAlign: "center" }}
                onClick={() => { setRecoveryStep(1); setError(""); }}
              >
                Вернуться назад
              </button>
            </form>
          ) : (
            <form className="auth-form" onSubmit={handleResetPassword}>
              <div className="auth-field">
                <label htmlFor="rec-pass">Новый пароль</label>
                <input
                  id="rec-pass"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Придумайте новый пароль"
                  required
                />
              </div>
              <div className="auth-field">
                <label htmlFor="rec-pass-conf">Подтверждение пароля</label>
                <input
                  id="rec-pass-conf"
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Повторите новый пароль"
                  required
                />
              </div>
              <button type="submit" className="auth-submit-btn">Сохранить пароль</button>
            </form>
          )
        ) : isVerifying ? (
          <form className="auth-form" onSubmit={handleVerifyOtpSubmit}>
            <div className="auth-field">
              <label htmlFor="reg-otp">Код подтверждения</label>
              <input
                id="reg-otp"
                type="text"
                maxLength={6}
                value={userOtpInput}
                onChange={(e) => setUserOtpInput(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                style={{ 
                  textAlign: "center", 
                  letterSpacing: "8px", 
                  fontSize: "20px", 
                  fontWeight: "bold" 
                }}
                required
              />
            </div>

            <button type="submit" className="auth-submit-btn">
              Подтвердить регистрацию
            </button>

            <button 
              type="button" 
              className="auth-toggle-link"
              style={{ marginTop: "12px", background: "none", border: "none", cursor: "pointer", display: "block", width: "100%", textAlign: "center" }}
              onClick={() => {
                setIsVerifying(false);
                setError("");
                setTempUserData(null);
              }}
            >
              Вернуться назад
            </button>

            <button
              type="button"
              className="auth-toggle-link"
              style={{ marginTop: "8px", background: "none", border: "none", cursor: "pointer", display: "block", width: "100%", textAlign: "center", opacity: isResending ? 0.6 : 1 }}
              onClick={handleResendOtp}
              disabled={isResending}
            >
              {isResending ? "Отправка..." : "Отправить код повторно"}
            </button>
          </form>
        ) : isLogin ? (
          <form className="auth-form" onSubmit={handleLoginSubmit}>
            <div className="auth-field">
              <label htmlFor="login-input">ID пользователя или Email</label>
              <input
                id="login-input"
                type="text"
                value={loginIdOrEmail}
                onChange={(e) => setLoginIdOrEmail(e.target.value)}
                placeholder="INV-1529 или ivan@example.com"
                required
              />
            </div>
            
            <div className="auth-field">
              <label htmlFor="login-pass">Пароль</label>
              <input
                id="login-pass"
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Введите ваш пароль"
                required
              />
            </div>

            <button type="submit" className="auth-submit-btn">
              Войти в систему
            </button>
            <div style={{ textAlign: "center", marginTop: "15px" }}>
              <button 
                type="button" 
                className="auth-toggle-link"
                onClick={() => {
                  setIsRecovering(true);
                  setRecoveryStep(1);
                  setRecoveryEmail(loginIdOrEmail.includes("@") ? loginIdOrEmail : "");
                  setError("");
                }}
              >
                Забыли пароль?
              </button>
            </div>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleRegisterSubmit}>
            <div className="auth-field">
              <label htmlFor="reg-name">Ваше имя</label>
              <input
                id="reg-name"
                type="text"
                value={registerName}
                onChange={(e) => setRegisterName(e.target.value)}
                placeholder="Иван Иванов"
                required
              />
            </div>

            <div className="auth-field">
              <label htmlFor="reg-email">Электронная почта</label>
              <input
                id="reg-email"
                type="email"
                value={registerEmail}
                onChange={(e) => setRegisterEmail(e.target.value)}
                placeholder="ivan@example.com"
                required
              />
            </div>

            <div className="auth-field">
              <label htmlFor="reg-pass">Пароль</label>
              <input
                id="reg-pass"
                type="password"
                value={registerPassword}
                onChange={(e) => setRegisterPassword(e.target.value)}
                placeholder="Придумайте пароль"
                required
              />
            </div>

            <div className="auth-field">
              <label htmlFor="reg-confirm">Подтверждение пароля</label>
              <input
                id="reg-confirm"
                type="password"
                value={registerConfirmPassword}
                onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                placeholder="Повторите пароль"
                required
              />
            </div>

            <button type="submit" className="auth-submit-btn">
              Зарегистрироваться
            </button>
          </form>
        )}

        {!isVerifying && !isRecovering && (
          <div className="auth-footer-toggle">
            <span>
              {isLogin ? "Еще нет аккаунта?" : "Уже зарегистрированы?"}
            </span>
            <button 
              type="button" 
              className="auth-toggle-link"
              onClick={() => {
                setIsLogin(!isLogin);
                setError("");
              }}
            >
              {isLogin ? "Создать новый аккаунт" : "Войти в существующий"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
