# backend/microservices/auth_service/main.py
# =============================================================================
# 🔑 Auth & User Service — JWT + bcrypt
# =============================================================================
import os
import re
import time
import secrets
import asyncio
from datetime import datetime, timedelta
from typing import Optional

from fastapi import FastAPI, Body, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
import databases
import bcrypt
from jose import jwt, JWTError

# =============================================================================
# Конфигурация из переменных окружения (.env)
# =============================================================================
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/task_tracker_bd"
)

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret-key-CHANGE-IN-PROD")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
PASSWORD_PEPPER = os.getenv("PASSWORD_PEPPER", "")
# bcrypt учитывает только первые 72 байта и в новых версиях падает на более длинных
BCRYPT_MAX_BYTES = 72

database = databases.Database(DATABASE_URL)

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
    hashed = bcrypt.hashpw(peppered.encode("utf-8")[:BCRYPT_MAX_BYTES], salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Проверяем пароль: добавляем pepper и сверяем с bcrypt хешем."""
    peppered = plain_password + PASSWORD_PEPPER
    try:
        return bcrypt.checkpw(peppered.encode("utf-8")[:BCRYPT_MAX_BYTES], hashed_password.encode("utf-8"))
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


async def require_user(current_user: Optional[dict] = Depends(get_current_user)) -> dict:
    if not current_user:
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    return current_user


# =============================================================================
# 📧 Коды подтверждения (регистрация и восстановление пароля)
# =============================================================================
# Код генерирует и проверяет только сервер. Хранится в памяти процесса —
# для одного инстанса auth-service этого достаточно.
CODE_TTL_SEC = 10 * 60
CODE_MAX_ATTEMPTS = 5
CODE_PURPOSES = {"register", "reset"}
_pending_codes: dict = {}  # (email, purpose) -> {"code", "expires", "attempts"}


def issue_code(email: str, purpose: str) -> str:
    code = f"{secrets.randbelow(1_000_000):06d}"
    _pending_codes[(email.lower(), purpose)] = {
        "code": code, "expires": time.monotonic() + CODE_TTL_SEC, "attempts": 0,
    }
    return code


def check_code(email: str, purpose: str, code: str, consume: bool) -> bool:
    key = (email.lower(), purpose)
    entry = _pending_codes.get(key)
    if not entry or time.monotonic() > entry["expires"]:
        _pending_codes.pop(key, None)
        return False
    if not secrets.compare_digest(entry["code"], str(code or "").strip()):
        entry["attempts"] += 1
        if entry["attempts"] >= CODE_MAX_ATTEMPTS:
            _pending_codes.pop(key, None)
        return False
    if consume:
        _pending_codes.pop(key, None)
    return True


async def find_user_by_email(email: str):
    return await database.fetch_one(
        "SELECT user_id, user_name, user_email, password_hash FROM user_ WHERE LOWER(user_email) = :email",
        {"email": email.lower()}
    )


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

    if await find_user_by_email(email):
        raise HTTPException(status_code=409, detail="Пользователь с таким email уже существует")

    if not check_code(email, "register", data.get("code"), consume=True):
        raise HTTPException(status_code=400, detail="Неверный или просроченный код подтверждения")

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
    password_hash = await asyncio.to_thread(hash_password, password)

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
        """SELECT user_id, user_name, user_email, password_hash 
           FROM user_ 
           WHERE UPPER(user_id) = :login_upper 
              OR LOWER(user_email) = :login_lower""",
        {"login_upper": login_input.upper(), "login_lower": login_input.lower()}
    )

    if not user:
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    # 🔐 Проверяем пароль через bcrypt (НЕ сравниваем строки!)
    if not await asyncio.to_thread(verify_password, password, user["password_hash"]):
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
            "email": user["user_email"]
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
            "email": current_user["user_email"]
        }
    }


# =============================================================================
# 👤 API: Профиль пользователя
# =============================================================================
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")


@app.get("/api/user/profile")
async def get_user_profile(userId: Optional[str] = None, current_user: Optional[dict] = Depends(get_current_user)):
    target_id = userId or (current_user["user_id"] if current_user else None)
    if not target_id:
        raise HTTPException(status_code=401, detail="Требуется авторизация")

    user = await database.fetch_one(
        "SELECT user_id, user_name, user_email, avatar FROM user_ WHERE UPPER(user_id) = :uid",
        {"uid": target_id.upper()}
    )
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return {"id": user["user_id"], "displayName": user["user_name"],
            "email": user["user_email"], "avatar": user["avatar"]}


@app.post("/api/user/profile")
async def update_user_profile(data: dict = Body(...), current_user: dict = Depends(require_user)):
    """Обновляет имя, email и/или аватар текущего пользователя (из JWT)."""
    user_id = current_user["user_id"]
    updates = {}

    if "displayName" in data:
        name = (data.get("displayName") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Имя не может быть пустым")
        updates["user_name"] = name

    if "email" in data:
        email = (data.get("email") or "").strip()
        if not EMAIL_RE.match(email):
            raise HTTPException(status_code=400, detail="Некорректный email")
        other = await find_user_by_email(email)
        if other and other["user_id"] != user_id:
            raise HTTPException(status_code=409, detail="Этот email уже занят")
        updates["user_email"] = email

    if "avatar" in data:
        updates["avatar"] = data.get("avatar") or None

    if updates:
        assignments = ", ".join(f"{col} = :{col}" for col in updates)
        await database.execute(
            f"UPDATE user_ SET {assignments} WHERE user_id = :uid", {**updates, "uid": user_id}
        )

    user = await database.fetch_one(
        "SELECT user_id, user_name, user_email, avatar FROM user_ WHERE user_id = :uid", {"uid": user_id}
    )
    return {"status": "success",
            "user": {"id": user["user_id"], "name": user["user_name"],
                     "email": user["user_email"], "avatar": user["avatar"]}}


# =============================================================================
# 🔄 API: Смена пароля (POST /api/auth/change-password)
# =============================================================================
@app.post("/api/auth/change-password")
async def change_password(data: dict = Body(...), current_user: Optional[dict] = Depends(get_current_user)):
    """Два сценария:
    - пользователь вошёл (есть JWT) — нужен текущий пароль;
    - восстановление — нужен email и код, выданный /api/auth/send-code (purpose=reset)."""
    new_password = data.get("newPassword", "")
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Пароль должен быть не короче 6 символов")

    if current_user:
        user = await database.fetch_one(
            "SELECT user_id, password_hash FROM user_ WHERE user_id = :uid",
            {"uid": current_user["user_id"]}
        )
        ok = await asyncio.to_thread(verify_password, data.get("currentPassword", ""), user["password_hash"])
        if not ok:
            raise HTTPException(status_code=400, detail="Текущий пароль введён неверно")
    else:
        email = (data.get("email") or "").strip()
        user = await find_user_by_email(email) if email else None
        if not user or not check_code(email, "reset", data.get("code"), consume=True):
            raise HTTPException(status_code=400, detail="Неверный или просроченный код подтверждения")

    new_hash = await asyncio.to_thread(hash_password, new_password)
    await database.execute(
        "UPDATE user_ SET password_hash = :pwd WHERE user_id = :uid",
        {"pwd": new_hash, "uid": user["user_id"]}
    )

    print(f"🔑 Пароль изменен для пользователя: {user['user_id']}", flush=True)
    return {"status": "success", "message": "Пароль успешно изменен"}


# =============================================================================
# 📧 API: Коды подтверждения
# =============================================================================
@app.post("/api/auth/send-code")
async def send_verification_code(data: dict = Body(...)):
    """Генерирует код и «отправляет» его. Почтового сервера нет,
    поэтому код печатается в лог auth-service."""
    email = (data.get("email") or "").strip()
    purpose = data.get("purpose", "register")
    if not EMAIL_RE.match(email) or purpose not in CODE_PURPOSES:
        raise HTTPException(status_code=400, detail="Некорректный запрос")

    user = await find_user_by_email(email)
    if purpose == "register" and user:
        raise HTTPException(status_code=409, detail="Пользователь с таким email уже существует")

    # Для восстановления не раскрываем, существует ли аккаунт: ответ одинаковый.
    if purpose == "register" or user:
        code = issue_code(email, purpose)
        print("═" * 60, flush=True)
        print(f"📧 [{purpose.upper()} CODE] для {email}", flush=True)
        print(f"👉   КОД ПОДТВЕРЖДЕНИЯ:  {code}", flush=True)
        print("═" * 60, flush=True)

    return {"status": "success", "message": f"Код отправлен на {email}"}


@app.post("/api/auth/verify-code")
async def verify_code(data: dict = Body(...)):
    """Проверка кода без его использования (шаг 2 восстановления пароля)."""
    email = (data.get("email") or "").strip()
    purpose = data.get("purpose", "reset")
    if not check_code(email, purpose, data.get("code"), consume=False):
        raise HTTPException(status_code=400, detail="Неверный или просроченный код подтверждения")
    return {"status": "success"}
