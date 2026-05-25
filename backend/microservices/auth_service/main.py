# backend/microservices/auth_service/main.py
import os
import traceback
from typing import Optional
from fastapi import FastAPI, Body, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import databases

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:Slava2005@localhost:5432/task_tracker_bd"
)

database = databases.Database(DATABASE_URL)

app = FastAPI(title="Auth & User Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    await database.connect()
    print("🔓 Auth Service подключен к PostgreSQL!")

@app.on_event("shutdown")
async def shutdown():
    await database.disconnect()

# =============================================================================
# API эндпоинты
# =============================================================================

@app.get("/api/user/profile")
async def get_user_profile(userId: str = None):
    if userId:
        user = await database.fetch_one(
            "SELECT user_name, user_email FROM user_ WHERE UPPER(user_id) = :uid",
            {"uid": userId.upper()}
        )
        if user:
            return {"displayName": user["user_name"], "email": user["user_email"]}
    first = await database.fetch_one("SELECT user_name, user_email FROM user_ LIMIT 1")
    if first:
        return {"displayName": first["user_name"], "email": first["user_email"]}
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
        await database.execute(
            """INSERT INTO user_ (user_id, user_name, user_email, password_hash)
               VALUES (:uid, :name, :email, :pwd)
               ON CONFLICT (user_id) DO UPDATE SET
                   user_name = EXCLUDED.user_name,
                   user_email = EXCLUDED.user_email""",
            {"uid": user_id, "name": display_name, "email": email, "pwd": "pbkdf2:sha256:..."}
        )
    return {"status": "success", "message": "Profile updated successfully"}

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
