# backend/main.py
import os
import json
from typing import Dict, List, Any
from fastapi import FastAPI, Body
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Allow CORS for client development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 💡 Make DB file path robust and independent of launch cwd
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, "backend_db.json")

def load_db() -> dict:
    if not os.path.exists(DB_FILE):
        return {
            "users": [],
            "projects": [],
            "invitations": [],
            "chats": []
        }
    try:
        with open(DB_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {
            "users": [],
            "projects": [],
            "invitations": [],
            "chats": []
        }

def save_db(data: dict):
    with open(DB_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

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
