# backend/main.py
import os
import json
from typing import Dict, List, Any
from fastapi import FastAPI, Body, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from db import init_db, get_all_data_from_db, sync_data_to_db

app = FastAPI()

# Allow CORS for client development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ⚡ Real-Time Connection Manager for WebSockets
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict, exclude: WebSocket = None):
        for connection in self.active_connections:
            if connection != exclude:
                try:
                    await connection.send_json(message)
                except Exception:
                    pass

manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Listen to incoming sync data broadcasted by one of the clients
            data = await websocket.receive_json()
            # Broadcast the new state to all other connected clients
            await manager.broadcast(data, exclude=websocket)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)

@app.on_event("startup")
def startup_event():
    try:
        init_db()
        print("\n" + "═"*60)
        print("⚡ [DATABASE INITIALIZED] Connected and synchronized with PostgreSQL!")
        print("═"*60 + "\n")
    except Exception as e:
        print("\n" + "!"*80)
        print("⚠️  [DATABASE CONNECTION FAILED] СОЕДИНЕНИЕ С POSTGRESQL НЕ УДАЛОСЬ!  ⚠️")
        print(f"Ошибка: {e}")
        print("Приложение продолжит работу в режиме ожидания.")
        print("Пожалуйста, убедитесь, что PostgreSQL запущен, и параметры в backend/db.py верны.")
        print("Учетные данные по умолчанию: хост=localhost, порт=5432, бд=postgres, пользователь=postgres, пароль=postgres")
        print("!"*80 + "\n")

def load_db() -> dict:
    try:
        return get_all_data_from_db()
    except Exception as e:
        print(f"Error loading from PostgreSQL: {e}")
        return {
            "users": [],
            "projects": [],
            "invitations": [],
            "chats": []
        }

def save_db(data: dict):
    try:
        sync_data_to_db(data)
    except Exception as e:
        print(f"Error saving to PostgreSQL: {e}")

@app.get("/api/user/profile")
def get_user_profile(userId: str = None):
    db = load_db()
    if userId:
        for user in db["users"]:
            if user.get("id", "").upper() == userId.upper():
                return {
                    "displayName": user.get("name", "Алексей Смирнов"),
                    "email": user.get("email", "alex@example.com")
                }
    # Fallback to fir user in db
    if db["users"]:
        user = db["users"][0]
        return {
            "displayName": user.get("name", "Алексей Смирнов"),
            "email": user.get("email", "alex@example.com")
        }
    return {
        "displayName": "Алексей Смирнов",
        "email": "alex@example.com"
    }

@app.post("/api/user/profile")
def update_user_profile(data: dict = Body(...)):
    db = load_db()
    userId = data.get("userId")
    displayName = data.get("displayName")
    email = data.get("email")

    updated = False
    if userId:
        for user in db["users"]:
            if user.get("id", "").upper() == userId.upper():
                user["name"] = displayName
                user["email"] = email
                updated = True
                break

    if not updated and db["users"]:
        db["users"][0]["name"] = displayName
        db["users"][0]["email"] = email
        updated = True

    if not updated:
        db["users"].append({
            "id": userId or "shaber",
            "name": displayName,
            "email": email,
            "password": "pbkdf2:sha256:...",
            "role": "admin"
        })

    save_db(db)
    return {"status": "success", "message": "Profile updated successfully"}

@app.get("/api/all_data")
def get_all_data():
    """Retrieve full application state (users, projects, invitations) from backend"""
    return load_db()

@app.post("/api/sync")
def sync_data(data: dict = Body(...)):
    """Synchronize state mutations from frontend into backend JSON database"""
    db = load_db()
    if "users" in data:
        db["users"] = data["users"]
    if "projects" in data:
        db["projects"] = data["projects"]
    if "invitations" in data:
        db["invitations"] = data["invitations"]
    if "chats" in data:
        db["chats"] = data["chats"]
    save_db(db)
    return {"status": "success", "message": "State synchronized successfully"}

@app.post("/api/auth/send-code")
def send_verification_code(data: dict = Body(...)):
    """Simulate sending a verification code by printing it to the console in a highlighted block."""
    email = data.get("email")
    code = data.get("code")
    name = data.get("name")
    
    if not email or not code:
        return {"status": "error", "message": "Email and code are required"}
        
    print("\n" + "═"*60)
    print(f"📧 [EMAIL VERIFICATION CODE] ДЛЯ: {name} ({email})")
    print("═"*60)
    print(f"👉   ВАШ КОД ПОДТВЕРЖДЕНИЯ:  {code}  👈")
    print("═"*60 + "\n")
    
    return {"status": "success", "message": f"Verification code sent to {email}"}

