// src/pages/Auth/Auth.jsx
import { useState } from "react";
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

  const handleLoginSubmit = (e) => {
    e.preventDefault();
    setError("");

    const trimmedInput = loginIdOrEmail.trim();
    const password = loginPassword;

    if (!trimmedInput || !password) {
      setError("Пожалуйста, заполните все поля");
      return;
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
          <h2>{isLogin ? "Добро пожаловать!" : "Создать аккаунт"}</h2>
          <p className="auth-subtitle">
            {isLogin 
              ? "Введите свои учетные данные для доступа к доске" 
              : "Заполните форму, чтобы начать работу с проектами"}
          </p>
        </div>

        {error && <div className="auth-error-box">{error}</div>}

        {isLogin ? (
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
      </div>
    </div>
  );
}
