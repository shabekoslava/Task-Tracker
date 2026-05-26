# backend/main.py
import os
import traceback
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta

from fastapi import FastAPI, Body, WebSocket, WebSocketDisconnect, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
import databases
import bcrypt
from jose import jwt, JWTError

# =============================================================================
# Загрузка переменных окружения из .env файла
# =============================================================================
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))
except ImportError:
    pass  # python-dotenv не установлен — переменные берутся из системного окружения

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

# =============================================================================
# FastAPI приложение и CORS
# =============================================================================
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# =============================================================================
# WebSocket менеджер
# =============================================================================
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
    """Создаём зашифрованный JWT access-токен на бэкенде."""
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
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    payload = decode_access_token(parts[1])
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


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            await manager.broadcast(data, exclude=websocket)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)

# =============================================================================
# События запуска/останова
# =============================================================================
@app.on_event("startup")
async def startup():
    await database.connect()
    # Автоматически инициализируем структуру БД из schema.sql
    schema_path = os.path.join(os.path.dirname(__file__), "schema.sql")
    if os.path.exists(schema_path):
        try:
            with open(schema_path, "r", encoding="utf-8") as f:
                schema_sql = f.read()
            await database.execute(schema_sql)
            print("🚀 Схема базы данных успешно инициализирована из schema.sql!")
        except Exception as e:
            print(f"⚠️ Не удалось инициализировать схему БД: {e}")
            traceback.print_exc()

@app.on_event("shutdown")
async def shutdown():
    await database.disconnect()

# =============================================================================
# Вспомогательные функции
# =============================================================================
def parse_datetime(val) -> Optional[datetime]:
    if not val:
        return None
    if isinstance(val, datetime):
        return val
    try:
        if isinstance(val, str):
            val_str = val.replace("Z", "+00:00")
            try:
                return datetime.fromisoformat(val_str)
            except ValueError:
                return datetime.strptime(val_str, "%Y-%m-%d")
    except Exception:
        pass
    return datetime.utcnow()

async def ensure_user_exists(user_id: Optional[str]) -> Optional[str]:
    if not user_id or user_id.strip() == "":
        return None
    # Проверяем существование пользователя в базе без учёта регистра
    existing = await database.fetch_one(
        "SELECT user_id FROM user_ WHERE UPPER(user_id) = :uid", {"uid": user_id.upper()}
    )
    if not existing:
        name = user_id.capitalize()
        email = f"{user_id.lower()}@example.com"
        # 🔐 Хешируем пароль-заглушку вместо хранения в открытом виде
        temp_hash = hash_password("temp_password")
        await database.execute(
            """INSERT INTO user_ (user_id, user_name, user_email, password_hash)
               VALUES (:uid, :name, :email, :pwd)
               ON CONFLICT (user_id) DO NOTHING""",
            {"uid": user_id, "name": name, "email": email, "pwd": temp_hash}
        )
        return user_id
    return existing["user_id"]

async def ensure_tag_state_exists(tag_id: int, state_name: str) -> str:
    existing = await database.fetch_one(
        "SELECT tag_state FROM tag_state WHERE tag_id = :tid AND tag_state = :state",
        {"tid": tag_id, "state": state_name}
    )
    if not existing:
        await database.execute(
            """INSERT INTO tag_state (tag_id, tag_state, tag_state_color)
               VALUES (:tid, :state, :color)
               ON CONFLICT (tag_id, tag_state) DO NOTHING""",
            {"tid": tag_id, "state": state_name, "color": "#808080"}
        )
    return state_name

def _find_column_for_task(columns, task_id):
    for col in columns:
        if task_id in col.get("taskIds", []):
            return col["id"]
    return None

# =============================================================================
# Сборка полного состояния (как у фронтенда)
# =============================================================================
async def build_full_state() -> dict:
    # Пользователи (⚠️ пароли НЕ возвращаем на фронтенд!)
    users = await database.fetch_all(
        "SELECT user_id AS id, user_name AS name, user_email AS email FROM user_"
    )
    users_list = [dict(u) for u in users]

    # Проекты
    projects_raw = await database.fetch_all("SELECT * FROM project")
    projects_list = []
    for proj in projects_raw:
        proj_dict = dict(proj)
        pid = proj_dict["project_id"]

        # Колонки и их taskIds
        columns_raw = await database.fetch_all(
            "SELECT column_id, column_name, position FROM project_column WHERE project_id = :pid ORDER BY position",
            {"pid": pid}
        )
        columns = []
        for col in columns_raw:
            col_dict = dict(col)
            col_dict["id"] = col_dict.pop("column_id")
            col_dict["name"] = col_dict.pop("column_name")
            # Достаём задачи, привязанные к этой колонке
            task_rows = await database.fetch_all(
                "SELECT task_id FROM task WHERE column_id = :cid ORDER BY task_id",
                {"cid": col_dict["id"]}
            )
            col_dict["taskIds"] = [t["task_id"] for t in task_rows]
            columns.append(col_dict)

        # Задачи – собираем объект { task_id: task }
        tasks_raw = await database.fetch_all(
            "SELECT * FROM task WHERE project_id = :pid", {"pid": pid}
        )
        tasks_dict = {}
        for task in tasks_raw:
            task_dict = dict(task)
            tid = task_dict.pop("task_id")
            # Переименовываем поля под фронтенд
            task_dict["id"] = tid
            task_dict["title"] = task_dict.pop("task_title")

            creator_id = task_dict.pop("creator_id", None)
            task_dict["assignedTo"] = creator_id or ""

            # Исполнители
            performers = await database.fetch_all(
                "SELECT performer_id FROM task_performer WHERE task_id = :tid", {"tid": tid}
            )
            if performers:
                task_dict["assignedTo"] = performers[0]["performer_id"]
            else:
                task_dict["assignedTo"] = creator_id or ""

            # Теги задачи
            tag_rows = await database.fetch_all(
                """SELECT t.tag_name FROM task_tag tt JOIN tag t ON tt.tag_id = t.tag_id
                   WHERE tt.task_id = :tid""",
                {"tid": tid}
            )
            task_dict["tags"] = [t["tag_name"] for t in tag_rows]

            # Комментарии
            comments_raw = await database.fetch_all(
                "SELECT comment_id, author_id, text, created_at FROM task_comments WHERE task_id = :tid",
                {"tid": tid}
            )
            comments = []
            for c in comments_raw:
                c_dict = dict(c)
                c_dict["id"] = c_dict.pop("comment_id")
                c_dict["authorId"] = c_dict.pop("author_id")

                c_created_at = c_dict.pop("created_at", None)
                if isinstance(c_created_at, datetime):
                    c_dict["createdAt"] = c_created_at.isoformat()
                elif c_created_at:
                    c_dict["createdAt"] = str(c_created_at)
                else:
                    c_dict["createdAt"] = ""
                comments.append(c_dict)
            task_dict["comments"] = comments

            # Даты
            created_at = task_dict.pop("created_at", None)
            if isinstance(created_at, datetime):
                task_dict["createdAt"] = created_at.isoformat()
            elif created_at:
                task_dict["createdAt"] = str(created_at)
            else:
                task_dict["createdAt"] = datetime.utcnow().isoformat()

            deadline = task_dict.pop("deadline", None)
            if isinstance(deadline, datetime):
                task_dict["deadline"] = deadline.isoformat()
            elif deadline:
                task_dict["deadline"] = str(deadline)
            else:
                task_dict["deadline"] = ""

            task_dict["completed"] = task_dict.get("completed", False)
            task_dict["columnId"] = task_dict.pop("column_id", None)
            tasks_dict[tid] = task_dict

        # Участники проекта
        members = await database.fetch_all(
            "SELECT user_id, user_role FROM project_user_role WHERE project_id = :pid",
            {"pid": pid}
        )
        members_list = [{"id": m["user_id"], "role": m["user_role"]} for m in members]

        # Приглашения, связанные с проектом
        invitations = await database.fetch_all(
            "SELECT invite_id, invited_by, invited_user, status, role, created_at FROM invitations WHERE project_id = :pid",
            {"pid": pid}
        )
        inv_list = []
        for inv in invitations:
            inv_dict = dict(inv)
            inv_dict["id"] = inv_dict.pop("invite_id")
            inv_dict["projectId"] = pid
            inv_dict["projectName"] = proj_dict.get("project_name", "")
            inv_dict["invitedBy"] = inv_dict.pop("invited_by")
            inv_dict["invitedUser"] = inv_dict.pop("invited_user")

            i_created_at = inv_dict.pop("created_at", None)
            if isinstance(i_created_at, datetime):
                inv_dict["created_at"] = i_created_at.isoformat()
            elif i_created_at:
                inv_dict["created_at"] = str(i_created_at)
            else:
                inv_dict["created_at"] = ""
            inv_list.append(inv_dict)

        proj_dict["id"] = proj_dict.pop("project_id")
        proj_dict["name"] = proj_dict.pop("project_name")
        proj_dict["columns"] = columns
        proj_dict["tasks"] = tasks_dict
        proj_dict["members"] = members_list
        proj_dict["invitations"] = inv_list
        proj_dict["tags"] = proj_dict.get("tags", [])
        projects_list.append(proj_dict)

    # Чаты
    chats_raw = await database.fetch_all("SELECT * FROM chat")
    chats_list = []
    for chat in chats_raw:
        chat_dict = dict(chat)
        cid = chat_dict.pop("chat_id")
        chat_dict["id"] = cid
        # Определяем тип чата
        if chat_dict.get("task_id"):
            chat_dict["type"] = "task"
            chat_dict["taskId"] = chat_dict.pop("task_id")
            chat_dict.pop("project_id", None)

            task_info = await database.fetch_one(
                "SELECT task_title, project_id FROM task WHERE task_id = :tid",
                {"tid": chat_dict["taskId"]}
            )
            if task_info:
                chat_dict["taskName"] = task_info["task_title"]
                chat_dict["projectId"] = task_info["project_id"]
        elif chat_dict.get("project_id"):
            chat_dict["type"] = "project"
            chat_dict["projectId"] = chat_dict.pop("project_id")
            chat_dict.pop("task_id", None)

            proj_info = await database.fetch_one(
                "SELECT project_name FROM project WHERE project_id = :pid",
                {"pid": chat_dict["projectId"]}
            )
            if proj_info:
                chat_dict["projectName"] = proj_info["project_name"]
        else:
            chat_dict.pop("task_id", None)
            chat_dict.pop("project_id", None)
            # По количеству участников
            members_count = await database.fetch_val(
                "SELECT COUNT(*) FROM chat_member WHERE chat_id = :cid", {"cid": cid}
            )
            chat_dict["type"] = "personal" if members_count == 2 else "group"

        # Участники
        members = await database.fetch_all(
            "SELECT user_id FROM chat_member WHERE chat_id = :cid", {"cid": cid}
        )
        chat_dict["members"] = [m["user_id"] for m in members]

        # Сообщения
        messages_raw = await database.fetch_all(
            "SELECT message_id, sender_id, content, created_at FROM message WHERE chat_id = :cid ORDER BY created_at",
            {"cid": cid}
        )
        messages = []
        for msg in messages_raw:
            msg_dict = dict(msg)
            msg_dict["id"] = msg_dict.pop("message_id")
            msg_dict["authorId"] = msg_dict.pop("sender_id") or "System"
            msg_dict["text"] = msg_dict.pop("content")

            m_created_at = msg_dict.pop("created_at", None)
            if isinstance(m_created_at, datetime):
                msg_dict["createdAt"] = m_created_at.isoformat()
            elif m_created_at:
                msg_dict["createdAt"] = str(m_created_at)
            else:
                msg_dict["createdAt"] = ""

            msg_dict["status"] = "delivered"
            msg_dict["isComment"] = False
            messages.append(msg_dict)
        chat_dict["messages"] = messages
        chats_list.append(chat_dict)

    return {
        "users": users_list,
        "projects": projects_list,
        "invitations": await get_all_invitations(),
        "chats": chats_list
    }

async def get_all_invitations():
    invs = await database.fetch_all("SELECT * FROM invitations")
    result = []
    for inv in invs:
        inv_dict = dict(inv)
        inv_dict["id"] = inv_dict.pop("invite_id")
        inv_dict["projectId"] = inv_dict.pop("project_id")
        # Получаем имя проекта
        proj = await database.fetch_one("SELECT project_name FROM project WHERE project_id = :pid", {"pid": inv_dict["projectId"]})
        inv_dict["projectName"] = proj["project_name"] if proj else "Неизвестный проект"
        inv_dict["invitedBy"] = inv_dict.pop("invited_by")
        inv_dict["invitedUser"] = inv_dict.pop("invited_user")
        inv_dict["role"] = inv_dict.get("role", "member")

        created_at = inv_dict.pop("created_at", None)
        if isinstance(created_at, datetime):
            inv_dict["created_at"] = created_at.isoformat()
        elif created_at:
            inv_dict["created_at"] = str(created_at)
        else:
            inv_dict["created_at"] = ""
        result.append(inv_dict)
    return result

# =============================================================================
# Сохранение состояния (частичная перезапись)
# =============================================================================
async def save_full_state(data: dict):
    async with database.transaction():
        # 1. Пользователи
        if "users" in data:
            await database.execute("DELETE FROM user_")
            for u in data["users"]:
                uid = u.get("id")
                if uid and uid.strip():
                    # 🔐 Если пароль передан — хешируем, иначе ставим хеш-заглушку
                    raw_pwd = u.get("password", "")
                    if raw_pwd and not raw_pwd.startswith("$2b$"):
                        pwd_hash = hash_password(raw_pwd)
                    elif raw_pwd.startswith("$2b$"):
                        pwd_hash = raw_pwd  # уже хешированный
                    else:
                        pwd_hash = hash_password("temp_password")
                    await database.execute(
                        """INSERT INTO user_ (user_id, user_name, user_email, password_hash)
                           VALUES (:uid, :name, :email, :pwd)
                           ON CONFLICT (user_id) DO UPDATE SET
                               user_name = EXCLUDED.user_name,
                               user_email = EXCLUDED.user_email,
                               password_hash = EXCLUDED.password_hash""",
                        {"uid": uid, "name": u.get("name", ""), "email": u.get("email", ""),
                         "pwd": pwd_hash}
                    )

        # 2. Приглашения
        if "invitations" in data:
            await database.execute("DELETE FROM invitations")
            for inv in data["invitations"]:
                by_user = await ensure_user_exists(inv.get("invitedBy"))
                to_user = await ensure_user_exists(inv.get("invitedUser"))
                if not by_user or not to_user:
                    continue
                await database.execute(
                    """INSERT INTO invitations (invite_id, project_id, invited_by, invited_user, status, role, created_at)
                       VALUES (:iid, :pid, :by, :to, :status, :role, :cat)
                       ON CONFLICT (invite_id) DO NOTHING""",
                    {"iid": inv["id"], "pid": inv["projectId"], "by": by_user,
                     "to": to_user, "status": inv.get("status", "pending"),
                     "role": inv.get("role", "member"), "cat": parse_datetime(inv.get("created_at"))}
                )

        # 3. Проекты (при наличии)
        if "projects" in data:
            # Удаляем связанные данные
            await database.execute("DELETE FROM task_comments WHERE task_id IN (SELECT task_id FROM task WHERE project_id IN (SELECT project_id FROM project))")
            await database.execute("DELETE FROM task_tag WHERE task_id IN (SELECT task_id FROM task WHERE project_id IN (SELECT project_id FROM project))")
            await database.execute("DELETE FROM task_performer WHERE task_id IN (SELECT task_id FROM task WHERE project_id IN (SELECT project_id FROM project))")
            await database.execute("DELETE FROM task WHERE project_id IN (SELECT project_id FROM project)")
            await database.execute("DELETE FROM project_column WHERE project_id IN (SELECT project_id FROM project)")
            await database.execute("DELETE FROM project_user_role WHERE project_id IN (SELECT project_id FROM project)")
            await database.execute("DELETE FROM invitations WHERE project_id IN (SELECT project_id FROM project)")
            await database.execute("DELETE FROM project")

            for proj in data["projects"]:
                pid = proj["id"]
                owner_id = proj.get("members", [{}])[0].get("id") if proj.get("members") else None
                owner_id = await ensure_user_exists(owner_id)

                await database.execute(
                    """INSERT INTO project (project_id, project_name, description, owner_id, tags, created_at, updated_at)
                       VALUES (:pid, :name, :desc, :owner, :tags, :cat, :uat)
                       ON CONFLICT (project_id) DO NOTHING""",
                    {"pid": pid, "name": proj["name"], "desc": proj.get("description", ""),
                     "owner": owner_id,
                     "tags": proj.get("tags", []),
                     "cat": parse_datetime(proj.get("created_at")), "uat": parse_datetime(proj.get("updated_at"))}
                )

                # Колонки
                for col in proj.get("columns", []):
                    await database.execute(
                        """INSERT INTO project_column (column_id, project_id, column_name, position)
                           VALUES (:cid, :pid, :cname, :pos)
                           ON CONFLICT (column_id) DO NOTHING""",
                        {"cid": col["id"], "pid": pid, "cname": col["name"], "pos": col.get("position", 0)}
                    )

                # Задачи (из объекта tasks)
                tasks = proj.get("tasks", {})
                for tid, task in tasks.items():
                    assigned_to = task.get("assignedTo")
                    assigned_to = await ensure_user_exists(assigned_to)

                    column_id = task.get("columnId") or _find_column_for_task(proj["columns"], tid)

                    await database.execute(
                        """INSERT INTO task (task_id, task_title, description, project_id, column_id,
                           creator_id, created_at, deadline, estimate, sprint, priority, completed, task_color)
                           VALUES (:tid, :title, :desc, :pid, :cid, :creator, :cat, :deadline, :est,
                                   :sprint, :prio, :completed, :color)
                           ON CONFLICT (task_id) DO NOTHING""",
                        {"tid": tid, "title": task.get("title", ""), "desc": task.get("description", ""),
                         "pid": pid,
                         "cid": column_id,
                         "creator": assigned_to,
                         "cat": parse_datetime(task.get("createdAt")),
                         "deadline": parse_datetime(task.get("deadline")), "est": task.get("estimate"),
                         "sprint": task.get("sprint"), "prio": task.get("priority", "Средний"),
                         "completed": task.get("completed", False), "color": task.get("task_color")}
                    )

                    # Исполнители
                    if assigned_to:
                        await database.execute(
                            "INSERT INTO task_performer (task_id, performer_id) VALUES (:tid, :pid) ON CONFLICT DO NOTHING",
                            {"tid": tid, "pid": assigned_to}
                        )

                    # Теги задачи
                    for tag_name in task.get("tags", []):
                        tag = await database.fetch_one("SELECT tag_id FROM tag WHERE tag_name = :tname", {"tname": tag_name})
                        if not tag:
                            tag_id = await database.fetch_val(
                                "INSERT INTO tag (tag_name) VALUES (:tname) RETURNING tag_id", {"tname": tag_name}
                            )
                        else:
                            tag_id = tag["tag_id"]

                        await ensure_tag_state_exists(tag_id, "default")
                        await database.execute(
                            """INSERT INTO task_tag (task_id, tag_id, tag_state)
                               VALUES (:tid, :tag, :state)
                               ON CONFLICT DO NOTHING""",
                            {"tid": tid, "tag": tag_id, "state": "default"}
                        )

                    # Комментарии
                    for comment in task.get("comments", []):
                        author_id = comment.get("authorId")
                        author_id = await ensure_user_exists(author_id)
                        await database.execute(
                            """INSERT INTO task_comments (comment_id, task_id, author_id, text, created_at)
                               VALUES (:cid, :tid, :author, :text, :cat)
                               ON CONFLICT (comment_id) DO NOTHING""",
                            {"cid": comment["id"], "tid": tid, "author": author_id,
                             "text": comment["text"], "cat": parse_datetime(comment.get("createdAt"))}
                        )

                # Участники проекта
                for member in proj.get("members", []):
                    m_id = await ensure_user_exists(member.get("id"))
                    if m_id:
                        await database.execute(
                            """INSERT INTO project_user_role (project_id, user_id, user_role)
                               VALUES (:pid, :uid, :role)
                               ON CONFLICT (project_id, user_id) DO UPDATE SET user_role = EXCLUDED.user_role""",
                            {"pid": pid, "uid": m_id, "role": member.get("role", "member")}
                        )

        # 4. Чаты (если есть)
        if "chats" in data:
            await database.execute("DELETE FROM message")
            await database.execute("DELETE FROM chat_member")
            await database.execute("DELETE FROM chat")
            for chat in data["chats"]:
                cid = chat["id"]
                pid = chat.get("projectId")
                tid = chat.get("taskId")
                if pid and tid:
                    if chat.get("type") == "task":
                        pid = None
                    else:
                        tid = None

                await database.execute(
                    """INSERT INTO chat (chat_id, chat_name, project_id, task_id)
                       VALUES (:cid, :cname, :pid, :tid)
                       ON CONFLICT (chat_id) DO NOTHING""",
                    {"cid": cid, "cname": chat.get("name", ""),
                     "pid": pid, "tid": tid}
                )
                for uid in chat.get("members", []):
                    m_uid = await ensure_user_exists(uid)
                    if m_uid:
                        await database.execute(
                            "INSERT INTO chat_member (chat_id, user_id) VALUES (:cid, :uid) ON CONFLICT DO NOTHING",
                            {"cid": cid, "uid": m_uid}
                        )
                for msg in chat.get("messages", []):
                    sender = msg.get("authorId")
                    if not sender or sender.strip() == "":
                        sender = "System"
                    sender_id = await ensure_user_exists(sender)
                    await database.execute(
                        """INSERT INTO message (message_id, chat_id, sender_id, content, created_at)
                           VALUES (:mid, :cid, :sender, :text, :cat)
                           ON CONFLICT (message_id) DO NOTHING""",
                        {"mid": msg["id"], "cid": cid, "sender": sender_id,
                         "text": msg["text"], "cat": parse_datetime(msg.get("createdAt"))}
                    )

# =============================================================================
# API эндпоинты
# =============================================================================

@app.get("/api/all_data")
async def get_all_data():
    return await build_full_state()

@app.post("/api/sync")
async def sync_data(data: dict = Body(...)):
    try:
        await save_full_state(data)
        await manager.broadcast({"event": "state_synced"})
        return {"status": "success", "message": "State synchronized successfully"}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")

# =============================================================================
# 🔑 JWT Auth эндпоинты (дублируют auth_service для монолитного режима)
# =============================================================================
@app.post("/api/auth/register")
async def register_user(data: dict = Body(...)):
    """Регистрация: хешируем пароль bcrypt, возвращаем JWT токен."""
    name = data.get("name", "").strip()
    email = data.get("email", "").strip()
    password = data.get("password", "")
    user_id = data.get("userId", "").strip()

    if not name or not email or not password:
        raise HTTPException(status_code=400, detail="Имя, email и пароль обязательны")

    existing = await database.fetch_one(
        "SELECT user_id FROM user_ WHERE LOWER(user_email) = :email",
        {"email": email.lower()}
    )
    if existing:
        raise HTTPException(status_code=409, detail="Пользователь с таким email уже существует")

    if not user_id:
        import random
        while True:
            user_id = f"INV-{random.randint(1000, 9999)}"
            check = await database.fetch_one(
                "SELECT user_id FROM user_ WHERE user_id = :uid", {"uid": user_id}
            )
            if not check:
                break

    password_hash = hash_password(password)

    await database.execute(
        """INSERT INTO user_ (user_id, user_name, user_email, password_hash)
           VALUES (:uid, :name, :email, :pwd)
           ON CONFLICT (user_id) DO NOTHING""",
        {"uid": user_id, "name": name, "email": email, "pwd": password_hash}
    )

    access_token = create_access_token(data={"sub": user_id, "email": email, "name": name})

    return {
        "status": "success",
        "user": {"id": user_id, "name": name, "email": email},
        "access_token": access_token,
        "token_type": "bearer"
    }


@app.post("/api/auth/login")
async def login_user(data: dict = Body(...)):
    """Логин: проверяем bcrypt хеш, возвращаем JWT токен."""
    login_input = data.get("login", "").strip()
    password = data.get("password", "")

    if not login_input or not password:
        raise HTTPException(status_code=400, detail="Логин и пароль обязательны")

    user = await database.fetch_one(
        """SELECT user_id, user_name, user_email, password_hash 
           FROM user_ 
           WHERE UPPER(user_id) = :login_upper 
              OR LOWER(user_email) = :login_lower""",
        {"login_upper": login_input.upper(), "login_lower": login_input.lower()}
    )

    if not user:
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    if not verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    access_token = create_access_token(
        data={"sub": user["user_id"], "email": user["user_email"], "name": user["user_name"]}
    )

    return {
        "status": "success",
        "user": {"id": user["user_id"], "name": user["user_name"], "email": user["user_email"]},
        "access_token": access_token,
        "token_type": "bearer"
    }


@app.get("/api/auth/me")
async def get_me(current_user: Optional[dict] = Depends(get_current_user)):
    """Верификация JWT токена."""
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


@app.post("/api/auth/change-password")
async def change_password(data: dict = Body(...)):
    """Смена пароля с хешированием."""
    user_id = data.get("userId", "").strip()
    new_password = data.get("newPassword", "")
    email = data.get("email", "").strip()

    if not new_password:
        raise HTTPException(status_code=400, detail="Новый пароль обязателен")

    user = None
    if user_id:
        user = await database.fetch_one(
            "SELECT user_id FROM user_ WHERE UPPER(user_id) = :uid", {"uid": user_id.upper()}
        )
    elif email:
        user = await database.fetch_one(
            "SELECT user_id FROM user_ WHERE LOWER(user_email) = :email", {"email": email.lower()}
        )

    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    new_hash = hash_password(new_password)
    await database.execute(
        "UPDATE user_ SET password_hash = :pwd WHERE user_id = :uid",
        {"pwd": new_hash, "uid": user["user_id"]}
    )
    return {"status": "success", "message": "Пароль успешно изменен"}

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
        temp_hash = hash_password("temp_password")
        await database.execute(
            """INSERT INTO user_ (user_id, user_name, user_email, password_hash)
               VALUES (:uid, :name, :email, :pwd)
               ON CONFLICT (user_id) DO UPDATE SET
                   user_name = EXCLUDED.user_name,
                   user_email = EXCLUDED.user_email""",
            {"uid": user_id, "name": display_name, "email": email, "pwd": temp_hash}
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
