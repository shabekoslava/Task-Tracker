# backend/microservices/auth_service/main.py
# =============================================================================
# 🔑 Auth & User Service — JWT + bcrypt
# =============================================================================
import os
import traceback
from datetime import datetime, timedelta
from typing import Optional

from fastapi import FastAPI, Body, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import databases
import bcrypt
from jose import jwt, JWTError

# =============================================================================
# Конфигурация из переменных окружения (.env)
# =============================================================================
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:Slava2005@localhost:5432/task_tracker_bd"
)

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret-key-CHANGE-IN-PROD")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
PASSWORD_PEPPER = os.getenv("PASSWORD_PEPPER", "")

database = databases.Database(DATABASE_URL)
security = HTTPBearer(auto_error=False)

app = FastAPI(title="Auth & User Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# =============================================================================
# 🔐 Утилиты: хеширование паролей (bcrypt + соль + pepper)
# =============================================================================
def hash_password(plain_password: str) -> str:
    """Хешируем пароль с помощью bcrypt.
    Bcrypt автоматически генерирует случайную соль (salt) и включает её в хеш.
    Дополнительно добавляем pepper из переменных окружения."""
    peppered = plain_password + PASSWORD_PEPPER
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(peppered.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Проверяем пароль: добавляем pepper и сверяем с bcrypt хешем."""
    peppered = plain_password + PASSWORD_PEPPER
    try:
        return bcrypt.checkpw(peppered.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


# =============================================================================
# 🎫 Утилиты: JWT токены
# =============================================================================
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Создаём зашифрованный JWT access-токен на бэкенде.
    Фронтенд получает этот токен и использует для аутентификации запросов."""
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=JWT_ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "iat": datetime.utcnow()})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> Optional[dict]:
    """Расшифровываем и валидируем JWT токен."""
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        return None


async def get_current_user(authorization: Optional[str] = Header(None)) -> Optional[dict]:
    """Извлекаем текущего пользователя из JWT токена в заголовке Authorization."""
    if not authorization:
        return None

    # Формат: "Bearer <token>"
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None

    token = parts[1]
    payload = decode_access_token(token)
    if not payload:
        return None

    user_id = payload.get("sub")
    if not user_id:
        return None

    user = await database.fetch_one(
        "SELECT user_id, user_name, user_email FROM user_ WHERE user_id = :uid",
        {"uid": user_id}
    )
    if not user:
        return None

    return {"user_id": user["user_id"], "user_name": user["user_name"], "user_email": user["user_email"]}


# =============================================================================
# События запуска/останова
# =============================================================================
@app.on_event("startup")
async def startup():
    await database.connect()
    print("🔓 Auth Service подключен к PostgreSQL!")
    print(f"🔐 JWT Algorithm: {JWT_ALGORITHM}, Token TTL: {JWT_ACCESS_TOKEN_EXPIRE_MINUTES} мин.")


@app.on_event("shutdown")
async def shutdown():
    await database.disconnect()


# =============================================================================
# 📝 API: Регистрация (POST /api/auth/register)
# =============================================================================
@app.post("/api/auth/register")
async def register_user(data: dict = Body(...)):
    """Регистрация нового пользователя.
    Пароль хешируется bcrypt + salt + pepper и сохраняется в БД.
    В ответ возвращается JWT токен."""
    name = data.get("name", "").strip()
    email = data.get("email", "").strip()
    password = data.get("password", "")
    user_id = data.get("userId", "").strip()

    if not name or not email or not password:
        raise HTTPException(status_code=400, detail="Имя, email и пароль обязательны")

    # Проверяем, что email не занят
    existing = await database.fetch_one(
        "SELECT user_id FROM user_ WHERE LOWER(user_email) = :email",
        {"email": email.lower()}
    )
    if existing:
        raise HTTPException(status_code=409, detail="Пользователь с таким email уже существует")

    # Генерируем ID если не передан
    if not user_id:
        import random
        while True:
            user_id = f"INV-{random.randint(1000, 9999)}"
            check = await database.fetch_one(
                "SELECT user_id FROM user_ WHERE user_id = :uid", {"uid": user_id}
            )
            if not check:
                break

    # 🔐 Хешируем пароль — в БД попадает ТОЛЬКО хеш, НИКОГДА открытый пароль
    password_hash = hash_password(password)

    await database.execute(
        """INSERT INTO user_ (user_id, user_name, user_email, password_hash)
           VALUES (:uid, :name, :email, :pwd)
           ON CONFLICT (user_id) DO NOTHING""",
        {"uid": user_id, "name": name, "email": email, "pwd": password_hash}
    )

    # 🎫 Генерируем JWT токен на бэкенде
    access_token = create_access_token(data={"sub": user_id, "email": email, "name": name})

    print(f"✅ Зарегистрирован новый пользователь: {user_id} ({email})")

    return {
        "status": "success",
        "user": {
            "id": user_id,
            "name": name,
            "email": email
        },
        "access_token": access_token,
        "token_type": "bearer"
    }


# =============================================================================
# 🔑 API: Авторизация / Логин (POST /api/auth/login)
# =============================================================================
@app.post("/api/auth/login")
async def login_user(data: dict = Body(...)):
    """Авторизация пользователя.
    Проверяем пароль через bcrypt.checkpw (сравниваем хеши, НЕ открытые пароли).
    В ответ — зашифрованный JWT токен для фронтенда."""
    login_input = data.get("login", "").strip()
    password = data.get("password", "")

    if not login_input or not password:
        raise HTTPException(status_code=400, detail="Логин и пароль обязательны")

    # Ищем пользователя по ID или email
    user = await database.fetch_one(
        """SELECT user_id, user_name, user_email, password_hash, avatar
           FROM user_
           WHERE UPPER(user_id) = :login_upper
              OR LOWER(user_email) = :login_lower""",
        {"login_upper": login_input.upper(), "login_lower": login_input.lower()}
    )

    if not user:
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    # 🔐 Проверяем пароль через bcrypt (НЕ сравниваем строки!)
    if not verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    # 🎫 Генерируем JWT токен
    access_token = create_access_token(
        data={"sub": user["user_id"], "email": user["user_email"], "name": user["user_name"]}
    )

    print(f"🔓 Пользователь авторизован: {user['user_id']} ({user['user_email']})")

    return {
        "status": "success",
        "user": {
            "id": user["user_id"],
            "name": user["user_name"],
            "email": user["user_email"],
            "avatar": user["avatar"]
        },
        "access_token": access_token,
        "token_type": "bearer"
    }


# =============================================================================
# 🔍 API: Верификация токена (GET /api/auth/me)
# =============================================================================
@app.get("/api/auth/me")
async def get_me(current_user: Optional[dict] = Depends(get_current_user)):
    """Фронтенд отправляет JWT токен → бэкенд расшифровывает и возвращает данные пользователя."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Невалидный или истекший токен")

    return {
        "status": "success",
        "user": {
            "id": current_user["user_id"],
            "name": current_user["user_name"],
            "email": current_user["user_email"],
            "avatar": current_user.get("avatar")
        }
    }


# =============================================================================
# 👤 API: Профиль пользователя
# =============================================================================
@app.get("/api/user/profile")
async def get_user_profile(userId: str = None, current_user: Optional[dict] = Depends(get_current_user)):
    # Если есть JWT — используем данные из токена
    target_id = userId
    if not target_id and current_user:
        target_id = current_user["user_id"]

    if target_id:
        user = await database.fetch_one(
            "SELECT user_name, user_email, avatar FROM user_ WHERE UPPER(user_id) = :uid",
            {"uid": target_id.upper()}
        )
        if user:
            return {"displayName": user["user_name"], "email": user["user_email"], "avatar": user["avatar"]}

    first = await database.fetch_one("SELECT user_name, user_email, avatar FROM user_ LIMIT 1")
    if first:
        return {"displayName": first["user_name"], "email": first["user_email"], "avatar": first["avatar"]}
    return {"displayName": "Алексей Смирнов", "email": "alex@example.com"}


@app.post("/api/user/profile")
async def update_user_profile(data: dict = Body(...)):
    user_id = data.get("userId", "shaber")
    display_name = data["displayName"]
    email = data["email"]

    existing = await database.fetch_one(
        "SELECT user_id FROM user_ WHERE UPPER(user_id) = :uid", {"uid": user_id.upper()}
    )
    if existing:
        matched_id = existing["user_id"]
        await database.execute(
            "UPDATE user_ SET user_name = :name, user_email = :email WHERE user_id = :uid",
            {"name": display_name, "email": email, "uid": matched_id}
        )
    else:
        password_hash = hash_password("temp_password")
        await database.execute(
            """INSERT INTO user_ (user_id, user_name, user_email, password_hash)
               VALUES (:uid, :name, :email, :pwd)
               ON CONFLICT (user_id) DO UPDATE SET
                   user_name = EXCLUDED.user_name,
                   user_email = EXCLUDED.user_email""",
            {"uid": user_id, "name": display_name, "email": email, "pwd": password_hash}
        )
    return {"status": "success", "message": "Profile updated successfully"}


# =============================================================================
# 🔄 API: Смена пароля (POST /api/auth/change-password)
# =============================================================================
@app.post("/api/auth/change-password")
async def change_password(data: dict = Body(...)):
    """Смена пароля: проверяем текущий пароль через bcrypt, затем хешируем новый."""
    user_id = data.get("userId", "").strip()
    current_password = data.get("currentPassword", "")
    new_password = data.get("newPassword", "")
    email = data.get("email", "").strip()

    if not new_password:
        raise HTTPException(status_code=400, detail="Новый пароль обязателен")

    # Находим пользователя вместе с хешем пароля
    user = None
    if user_id:
        user = await database.fetch_one(
            "SELECT user_id, password_hash FROM user_ WHERE UPPER(user_id) = :uid",
            {"uid": user_id.upper()}
        )
    elif email:
        user = await database.fetch_one(
            "SELECT user_id, password_hash FROM user_ WHERE LOWER(user_email) = :email",
            {"email": email.lower()}
        )

    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    # 🔐 Проверяем текущий пароль через bcrypt
    if current_password:
        if not verify_password(current_password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Текущий пароль введён неверно")

    # 🔐 Хешируем новый пароль
    new_hash = hash_password(new_password)
    await database.execute(
        "UPDATE user_ SET password_hash = :pwd WHERE user_id = :uid",
        {"pwd": new_hash, "uid": user["user_id"]}
    )

    print(f"🔑 Пароль изменен для пользователя: {user['user_id']}")
    return {"status": "success", "message": "Пароль успешно изменен"}


# =============================================================================
# 📧 API: Отправка кода подтверждения
# =============================================================================
@app.post("/api/auth/send-code")
async def send_verification_code(data: dict = Body(...)):
    email = data.get("email")
    code = data.get("code")
    name = data.get("name", "Пользователь")
    if not email or not code:
        return {"status": "error", "message": "Email and code are required"}

    print("\n" + "═"*60)
    print(f"📧 [EMAIL VERIFICATION CODE] ДЛЯ: {name} ({email})")
    print("═"*60)
    print(f"👉   ВАШ КОД ПОДТВЕРЖДЕНИЯ:  {code}  👈")
    print("═"*60 + "\n")
    return {"status": "success", "message": f"Verification code sent to {email}"}
