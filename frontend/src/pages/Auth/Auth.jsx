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

  // 🔄 Подтягиваем пользователей при открытии страницы авторизации
  useEffect(() => {
    fetch("/api/all_data")
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error("Offline");
      })
      .then((data) => {
        if (data.users && data.users.length > 0) {
          localStorage.setItem("auth_users", JSON.stringify(data.users));
        }
      })
      .catch((err) => console.log("Auth Mount: Не удалось подтянуть пользователей:", err.message));
  }, []);

  // Helper: Get all registered users
  const getRegisteredUsers = () => {
    const usersJson = localStorage.getItem("auth_users");
    if (!usersJson) {
      // Seed with a default user matching App.jsx currentUserId if empty
      const defaultUser = {
        id: "INV-1529",
        name: "Иван Иванов",
        email: "ivan@example.com",
        password: "123"
      };
      const initialUsers = [defaultUser];
      localStorage.setItem("auth_users", JSON.stringify(initialUsers));
      return initialUsers;
    }
    return JSON.parse(usersJson);
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const trimmedInput = loginIdOrEmail.trim();
    const password = loginPassword;

    if (!trimmedInput || !password) {
      setError("Пожалуйста, заполните все поля");
      return;
    }

    // 🔄 Синхронизируем пользователей напрямую из PostgreSQL перед валидацией
    try {
      const res = await fetch("/api/all_data");
      if (res.ok) {
        const data = await res.json();
        if (data.users && data.users.length > 0) {
          localStorage.setItem("auth_users", JSON.stringify(data.users));
        }
      }
    } catch (err) {
      console.log("Auth: Не удалось подтянуть свежих пользователей с бэкенда:", err.message);
    }

    const users = getRegisteredUsers();
    // Allow logging in by either ID (e.g. INV-1529) or Email
    const matchedUser = users.find(
      (u) => 
        (u.id.toUpperCase() === trimmedInput.toUpperCase() || 
         u.email.toLowerCase() === trimmedInput.toLowerCase()) && 
        u.password === password
    );

    if (matchedUser) {
      const sessionData = {
        id: matchedUser.id,
        name: matchedUser.name,
        email: matchedUser.email
      };
      localStorage.setItem("active_user_session", JSON.stringify(sessionData));
      onLoginSuccess(sessionData);
    } else {
      setError("Неверный ID пользователя/Email или пароль");
    }
  };

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

    const users = getRegisteredUsers();

    // Check if email already registered
    if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      setError("Пользователь с таким Email уже зарегистрирован");
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

  const handleVerifyOtpSubmit = (e) => {
    e.preventDefault();
    setError("");

    if (userOtpInput !== generatedOtp) {
      setError("Неверный код подтверждения. Пожалуйста, проверьте код из консоли бэкенда.");
      return;
    }

    const name = tempUserData.name;
    const email = tempUserData.email;
    const password = tempUserData.password;

    const users = getRegisteredUsers();

    // Check if email already registered (double check)
    if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      setError("Пользователь с таким Email уже зарегистрирован");
      setIsVerifying(false);
      return;
    }

    // Generate unique User ID like INV-XXXX
    let generatedId = "";
    let isUnique = false;
    while (!isUnique) {
      const randomDigits = Math.floor(1000 + Math.random() * 9000); // 4 digits
      generatedId = `INV-${randomDigits}`;
      if (!users.some((u) => u.id === generatedId)) {
        isUnique = true;
      }
    }

    const newUser = {
      id: generatedId,
      name,
      email,
      password
    };

    // Save new user
    const updatedUsers = [...users, newUser];
    localStorage.setItem("auth_users", JSON.stringify(updatedUsers));

    // Save session
    const sessionData = {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email
    };
    localStorage.setItem("active_user_session", JSON.stringify(sessionData));

    alert(`Регистрация успешна! Ваш уникальный ID: ${generatedId}`);
    onLoginSuccess(sessionData);

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
            {isVerifying 
              ? "Подтверждение почты" 
              : isLogin 
                ? "Добро пожаловать!" 
                : "Создать аккаунт"}
          </h2>
          <p className="auth-subtitle">
            {isVerifying 
              ? `Мы отправили 6-значный код подтверждения на ${tempUserData?.email}. Проверьте консоль бэкенда.`
              : isLogin 
                ? "Введите свои учетные данные для доступа к доске" 
                : "Заполните форму, чтобы начать работу с проектами"}
          </p>
        </div>

        {error && <div className="auth-error-box">{error}</div>}

        {isVerifying ? (
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

        {!isVerifying && (
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
