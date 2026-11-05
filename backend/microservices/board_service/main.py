# backend/microservices/board_service/main.py
import os
import traceback
import json
import asyncio
import secrets
from typing import Optional
from fastapi import FastAPI, Body, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
import databases
import bcrypt
from jose import jwt, JWTError
from datetime import datetime, timezone

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/task_tracker_bd"
)
PASSWORD_PEPPER = os.getenv("PASSWORD_PEPPER", "")
# bcrypt учитывает только первые 72 байта и в новых версиях падает на более длинных
BCRYPT_MAX_BYTES = 72
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret-key-CHANGE-IN-PROD")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")

database = databases.Database(DATABASE_URL)


def hash_password(plain_password: str) -> str:
    """Хешируем пароль bcrypt + pepper."""
    peppered = plain_password + PASSWORD_PEPPER
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(peppered.encode("utf-8")[:BCRYPT_MAX_BYTES], salt)
    return hashed.decode("utf-8")


# Хеш случайного пароля для пользователей, которых board-service создаёт сам
# (например, упомянутых в приглашении до регистрации). Считается один раз:
# bcrypt медленный, а раньше он вызывался на каждого пользователя при каждом /api/sync.
PLACEHOLDER_PASSWORD_HASH = hash_password(secrets.token_urlsafe(24))

app = FastAPI(title="Board & Project Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Инициализация Kafka продюсера
KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS")
KAFKA_SEND_TIMEOUT_SEC = 5
producer = None


async def ensure_producer():
    """Возвращает запущенный Kafka продюсер или None.
    Если Kafka ещё не поднялась (например, при старте docker compose),
    продюсер не сохраняется — попытка подключения повторится при следующем вызове."""
    global producer
    if producer or not KAFKA_BOOTSTRAP_SERVERS:
        return producer
    candidate = None
    try:
        from aiokafka import AIOKafkaProducer
        candidate = AIOKafkaProducer(
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            request_timeout_ms=KAFKA_SEND_TIMEOUT_SEC * 1000,
        )
        await asyncio.wait_for(candidate.start(), timeout=KAFKA_SEND_TIMEOUT_SEC)
        producer = candidate
        print(f"⚡ Kafka Producer запущен (брокер: {KAFKA_BOOTSTRAP_SERVERS})", flush=True)
    except Exception as e:
        print(f"⚠️ Не удалось подключить Kafka Producer: {e!r}", flush=True)
        if candidate:
            try:
                await candidate.stop()
            except Exception:
                pass
    return producer

@app.on_event("startup")
async def startup():
    await database.connect()
    print("💾 Board Service подключен к PostgreSQL!")

    # 1. Автоматическая инициализация схемы БД при запуске
    # Ищем schema.sql на два уровня выше (для Docker /app/schema.sql), на один уровень выше или в текущей директории
    current_dir = os.path.dirname(os.path.abspath(__file__))
    possible_paths = [
        os.path.join(os.path.dirname(os.path.dirname(current_dir)), "schema.sql"),
        os.path.join(os.path.dirname(current_dir), "schema.sql"),
        os.path.join(current_dir, "schema.sql"),
        "schema.sql",
        "../schema.sql",
        "../../schema.sql"
    ]
    schema_path = None
    for path in possible_paths:
        if os.path.exists(path):
            schema_path = path
            break

    if schema_path:
        try:
            with open(schema_path, "r", encoding="utf-8") as f:
                schema_sql = f.read()
            # Разделяем SQL-скрипт по точке с запятой, чтобы выполнять команды по очереди
            # Это обходит ограничение asyncpg (cannot insert multiple commands into a prepared statement)
            for command in schema_sql.split(";"):
                trimmed_cmd = command.strip()
                if trimmed_cmd:
                    await database.execute(trimmed_cmd)
            print("🚀 Схема базы данных успешно инициализирована из schema.sql!")
        except Exception as e:
            print(f"⚠️ Не удалось инициализировать схему БД: {e}")
            traceback.print_exc()

        # Миграция: добавляем avatar если его нет
        try:
            await database.execute("ALTER TABLE user_ ADD COLUMN IF NOT EXISTS avatar TEXT;")
            await database.execute("ALTER TABLE task ADD COLUMN IF NOT EXISTS position INT NOT NULL DEFAULT 0;")
            print("🚀 Миграции применены (user_.avatar, task.position).")
        except Exception as e:
            print(f"⚠️ Не удалось добавить колонку avatar: {e}")

    # 2. Инициализация Kafka (если брокер ещё не готов — переподключимся при первом /api/sync)
    await ensure_producer()

@app.on_event("shutdown")
async def shutdown():
    await database.disconnect()
    if producer:
        await producer.stop()

# =============================================================================
# Авторизация (JWT выдаёт auth-service, здесь только проверяем подпись)
# =============================================================================
async def require_user(authorization: Optional[str] = Header(None)) -> str:
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Невалидный или истекший токен")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Невалидный токен")
    return user_id


# =============================================================================
# Вспомогательные функции
# =============================================================================
def parse_datetime(val) -> Optional[datetime]:
    if not val:
        return None
    if isinstance(val, datetime):
        return val
    if isinstance(val, str):
        val_str = val.replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(val_str)
        except ValueError:
            try:
                return datetime.strptime(val_str[:10], "%Y-%m-%d")
            except ValueError:
                return None
    return None


def to_iso(val) -> str:
    if isinstance(val, datetime):
        return val.isoformat()
    return str(val) if val else ""


def to_date(val) -> str:
    """Дедлайн отдаём датой (YYYY-MM-DD) — в таком виде его понимает <input type="date">."""
    if isinstance(val, datetime):
        return val.date().isoformat()
    return str(val)[:10] if val else ""


class UserCache:
    """Гарантирует наличие пользователей в user_ (нужно для внешних ключей).
    Создаётся на один вызов save_full_state, чтобы не ходить в БД за одним и тем же id."""

    def __init__(self):
        self.known: dict = {}

    async def load(self):
        rows = await database.fetch_all("SELECT user_id FROM user_")
        self.known = {r["user_id"].upper(): r["user_id"] for r in rows}

    async def ensure(self, user_id: Optional[str]) -> Optional[str]:
        if not user_id or not str(user_id).strip():
            return None
        key = str(user_id).upper()
        if key not in self.known:
            # Пароль — случайный хеш, вычисленный один раз при старте: войти под таким
            # пользователем нельзя, пока он не зарегистрируется сам.
            await database.execute(
                """INSERT INTO user_ (user_id, user_name, user_email, password_hash)
                   VALUES (:uid, :name, :email, :pwd)
                   ON CONFLICT (user_id) DO NOTHING""",
                {"uid": user_id, "name": f"Пользователь {user_id}",
                 "email": f"{user_id}@example.com", "pwd": PLACEHOLDER_PASSWORD_HASH}
            )
            self.known[key] = user_id
        return self.known[key]


def group_by(rows, key: str) -> dict:
    grouped: dict = {}
    for row in rows:
        grouped.setdefault(row[key], []).append(row)
    return grouped


# =============================================================================
# Чтение состояния: фиксированное число запросов вместо запросов на каждую задачу
# =============================================================================
async def build_full_state() -> dict:
    users = await database.fetch_all("SELECT user_id, user_name, user_email, avatar FROM user_")
    projects = await database.fetch_all("SELECT * FROM project ORDER BY created_at, project_id")
    columns = group_by(await database.fetch_all(
        "SELECT column_id, project_id, column_name, position FROM project_column ORDER BY position, column_id"
    ), "project_id")
    tasks = await database.fetch_all("SELECT * FROM task ORDER BY position, created_at")
    performers = group_by(await database.fetch_all("SELECT task_id, performer_id FROM task_performer"), "task_id")
    task_tags = group_by(await database.fetch_all(
        "SELECT tt.task_id, t.tag_name FROM task_tag tt JOIN tag t ON t.tag_id = tt.tag_id"
    ), "task_id")
    comments = group_by(await database.fetch_all(
        "SELECT comment_id, task_id, author_id, text, created_at FROM task_comments ORDER BY created_at"
    ), "task_id")
    members = group_by(await database.fetch_all(
        "SELECT project_id, user_id, user_role FROM project_user_role"
    ), "project_id")
    invitations = [serialize_invitation(inv) for inv in await database.fetch_all(
        """SELECT i.*, p.project_name FROM invitations i
           LEFT JOIN project p ON p.project_id = i.project_id
           ORDER BY i.created_at"""
    )]
    invitations_by_project = group_by(invitations, "projectId")

    tasks_by_project: dict = {}
    task_ids_by_column: dict = {}
    for t in tasks:
        tid = t["task_id"]
        task_performers = performers.get(tid)
        tasks_by_project.setdefault(t["project_id"], {})[tid] = {
            "id": tid,
            "title": t["task_title"],
            "description": t["description"] or "",
            "columnId": t["column_id"],
            "assignedTo": task_performers[0]["performer_id"] if task_performers else t["creator_id"],
            "priority": t["priority"] or "Средний",
            "completed": bool(t["completed"]),
            "task_color": t["task_color"],
            "estimate": t["estimate"],
            "sprint": t["sprint"],
            "createdAt": to_iso(t["created_at"]),
            "deadline": to_date(t["deadline"]),
            "tags": [tg["tag_name"] for tg in task_tags.get(tid, [])],
            "comments": [
                {"id": c["comment_id"], "authorId": c["author_id"], "text": c["text"],
                 "isComment": True, "createdAt": to_iso(c["created_at"])}
                for c in comments.get(tid, [])
            ],
        }
        if t["column_id"]:
            task_ids_by_column.setdefault(t["column_id"], []).append(tid)

    projects_list = []
    for p in projects:
        pid = p["project_id"]
        projects_list.append({
            "id": pid,
            "name": p["project_name"],
            "description": p["description"] or "",
            "owner_id": p["owner_id"],
            "tags": p["tags"] or [],
            "created_at": to_iso(p["created_at"]),
            "updated_at": to_iso(p["updated_at"]),
            "columns": [
                {"id": c["column_id"], "name": c["column_name"], "position": c["position"],
                 "taskIds": task_ids_by_column.get(c["column_id"], [])}
                for c in columns.get(pid, [])
            ],
            "tasks": tasks_by_project.get(pid, {}),
            "members": [{"id": m["user_id"], "role": m["user_role"]} for m in members.get(pid, [])],
            "invitations": invitations_by_project.get(pid, []),
        })

    return {
        "users": [
            {"id": u["user_id"], "name": u["user_name"], "email": u["user_email"], "avatar": u["avatar"]}
            for u in users
        ],
        "projects": projects_list,
        "invitations": invitations,
        "chats": await build_chats(),
    }


def serialize_invitation(inv) -> dict:
    return {
        "id": inv["invite_id"],
        "projectId": inv["project_id"],
        "projectName": inv["project_name"] or "Неизвестный проект",
        "invitedBy": inv["invited_by"],
        "invitedUser": inv["invited_user"],
        "status": inv["status"],
        "role": inv["role"] or "member",
        "created_at": to_iso(inv["created_at"]),
    }


async def build_chats() -> list:
    chats = await database.fetch_all(
        """SELECT c.chat_id, c.chat_name, c.project_id, c.task_id,
                  t.task_title, t.project_id AS task_project_id, p.project_name
           FROM chat c
           LEFT JOIN task t ON t.task_id = c.task_id
           LEFT JOIN project p ON p.project_id = c.project_id"""
    )
    chat_members = group_by(await database.fetch_all("SELECT chat_id, user_id FROM chat_member"), "chat_id")
    messages = group_by(await database.fetch_all(
        "SELECT message_id, chat_id, sender_id, content, created_at FROM message ORDER BY created_at"
    ), "chat_id")

    result = []
    for c in chats:
        cid = c["chat_id"]
        member_ids = [m["user_id"] for m in chat_members.get(cid, [])]
        chat = {"id": cid, "name": c["chat_name"], "chat_name": c["chat_name"], "members": member_ids}
        if c["task_id"]:
            chat.update(type="task", taskId=c["task_id"],
                        taskName=c["task_title"], projectId=c["task_project_id"])
        elif c["project_id"]:
            chat.update(type="project", projectId=c["project_id"], projectName=c["project_name"])
        else:
            chat["type"] = "personal" if len(member_ids) == 2 else "group"
        chat["messages"] = [
            {"id": m["message_id"], "authorId": m["sender_id"] or "System", "text": m["content"],
             "createdAt": to_iso(m["created_at"]), "status": "delivered", "isComment": False}
            for m in messages.get(cid, [])
        ]
        result.append(chat)
    return result


# =============================================================================
# Запись состояния
# =============================================================================
async def save_full_state(data: dict):
    users = UserCache()
    async with database.transaction():
        await users.load()

        # 1. Пользователи: только создаём отсутствующих. Имя, email и аватар
        #    меняются через auth-service (/api/user/profile) с проверкой токена.
        for u in data.get("users") or []:
            await users.ensure(u.get("id"))

        # 2. Проекты — до приглашений, т.к. приглашения ссылаются на проект
        if "projects" in data:
            await save_projects(data["projects"] or [], users)

        # 3. Приглашения
        if "invitations" in data:
            await database.execute("DELETE FROM invitations")
            existing_projects = {r["project_id"] for r in await database.fetch_all("SELECT project_id FROM project")}
            rows = []
            for inv in data["invitations"] or []:
                by_user = await users.ensure(inv.get("invitedBy"))
                to_user = await users.ensure(inv.get("invitedUser"))
                if not by_user or not to_user or inv.get("projectId") not in existing_projects:
                    continue
                rows.append({"iid": inv["id"], "pid": inv["projectId"], "by": by_user, "to": to_user,
                             "status": inv.get("status", "pending"), "role": inv.get("role", "member"),
                             "cat": parse_datetime(inv.get("created_at")) or datetime.now(timezone.utc)})
            if rows:
                await database.execute_many(
                    """INSERT INTO invitations (invite_id, project_id, invited_by, invited_user, status, role, created_at)
                       VALUES (:iid, :pid, :by, :to, :status, :role, :cat)
                       ON CONFLICT (invite_id) DO NOTHING""", rows)

        # 4. Чаты
        if "chats" in data:
            await save_chats(data["chats"] or [], users)


async def save_projects(projects: list, users: "UserCache"):
    """Проекты обновляются на месте, а не пересоздаются: иначе каскадное удаление
    стирало бы приглашения и чаты, которых нет в этом запросе."""
    incoming_ids = [p["id"] for p in projects]
    await database.execute(
        "DELETE FROM project WHERE NOT (project_id = ANY(:ids))", {"ids": incoming_ids}
    )

    tag_ids = {r["tag_name"]: r["tag_id"] for r in await database.fetch_all("SELECT tag_id, tag_name FROM tag")}
    now = datetime.now(timezone.utc)

    for proj in projects:
        pid = proj["id"]
        project_members = proj.get("members") or []
        owner_id = await users.ensure(project_members[0].get("id")) if project_members else None

        await database.execute(
            """INSERT INTO project (project_id, project_name, description, owner_id, tags, created_at, updated_at)
               VALUES (:pid, :name, :desc, :owner, :tags, :cat, :uat)
               ON CONFLICT (project_id) DO UPDATE SET
                   project_name = EXCLUDED.project_name,
                   description = EXCLUDED.description,
                   owner_id = EXCLUDED.owner_id,
                   tags = EXCLUDED.tags,
                   updated_at = EXCLUDED.updated_at""",
            {"pid": pid, "name": proj["name"], "desc": proj.get("description") or "",
             "owner": owner_id, "tags": proj.get("tags") or [],
             "cat": parse_datetime(proj.get("created_at")) or now, "uat": now}
        )

        # Колонки пересоздаём целиком (tasks.column_id на время обнулится и
        # будет восстановлен ниже). Порядок колонок — их индекс в массиве.
        project_columns = proj.get("columns") or []
        await database.execute("DELETE FROM project_column WHERE project_id = :pid", {"pid": pid})
        if project_columns:
            await database.execute_many(
                """INSERT INTO project_column (column_id, project_id, column_name, position)
                   VALUES (:cid, :pid, :cname, :pos)""",
                [{"cid": col["id"], "pid": pid, "cname": col["name"], "pos": index}
                 for index, col in enumerate(project_columns)]
            )

        # Позиция и колонка задачи берутся из taskIds колонок
        placement = {}
        for col in project_columns:
            for index, tid in enumerate(col.get("taskIds", col.get("tasks", []))):
                placement[tid] = (col["id"], index)

        tasks = proj.get("tasks") or {}
        task_ids = list(tasks.keys())
        await database.execute(
            "DELETE FROM task WHERE project_id = :pid AND NOT (task_id = ANY(:ids))",
            {"pid": pid, "ids": task_ids}
        )
        for table in ("task_tag", "task_performer", "task_comments"):
            await database.execute(f"DELETE FROM {table} WHERE task_id = ANY(:ids)", {"ids": task_ids})

        task_rows, performer_rows, tag_rows, comment_rows = [], [], [], []
        for tid, task in tasks.items():
            assigned_to = await users.ensure(task.get("assignedTo"))
            column_id, position = placement.get(tid, (task.get("columnId"), 0))
            task_rows.append({
                "tid": tid, "title": task.get("title", ""), "desc": task.get("description") or "",
                "pid": pid, "cid": column_id, "creator": assigned_to,
                "cat": parse_datetime(task.get("createdAt")) or now,
                "deadline": parse_datetime(task.get("deadline")),
                "est": str(task["estimate"]) if task.get("estimate") not in (None, "") else None,
                "sprint": task.get("sprint"), "prio": task.get("priority") or "Средний",
                "completed": bool(task.get("completed")), "color": task.get("task_color"),
                "pos": position,
            })
            if assigned_to:
                performer_rows.append({"tid": tid, "uid": assigned_to})
            for tag_name in dict.fromkeys(task.get("tags") or []):
                if tag_name not in tag_ids:
                    tag_ids[tag_name] = await database.fetch_val(
                        """INSERT INTO tag (tag_name) VALUES (:name)
                           ON CONFLICT (tag_name) DO UPDATE SET tag_name = EXCLUDED.tag_name
                           RETURNING tag_id""", {"name": tag_name})
                    await database.execute(
                        """INSERT INTO tag_state (tag_id, tag_state, tag_state_color)
                           VALUES (:tid, 'default', '#808080') ON CONFLICT DO NOTHING""",
                        {"tid": tag_ids[tag_name]})
                tag_rows.append({"tid": tid, "tag": tag_ids[tag_name]})
            for comment in task.get("comments") or []:
                comment_rows.append({
                    "cid": comment["id"], "tid": tid, "author": await users.ensure(comment.get("authorId")),
                    "text": comment["text"], "cat": parse_datetime(comment.get("createdAt")) or now,
                })

        if task_rows:
            await database.execute_many(
                """INSERT INTO task (task_id, task_title, description, project_id, column_id, creator_id,
                       created_at, deadline, estimate, sprint, priority, completed, task_color, position)
                   VALUES (:tid, :title, :desc, :pid, :cid, :creator, :cat, :deadline, :est,
                           :sprint, :prio, :completed, :color, :pos)
                   ON CONFLICT (task_id) DO UPDATE SET
                       task_title = EXCLUDED.task_title, description = EXCLUDED.description,
                       column_id = EXCLUDED.column_id, creator_id = EXCLUDED.creator_id,
                       deadline = EXCLUDED.deadline, estimate = EXCLUDED.estimate,
                       sprint = EXCLUDED.sprint, priority = EXCLUDED.priority,
                       completed = EXCLUDED.completed, task_color = EXCLUDED.task_color,
                       position = EXCLUDED.position""", task_rows)
        if performer_rows:
            await database.execute_many(
                "INSERT INTO task_performer (task_id, performer_id) VALUES (:tid, :uid) ON CONFLICT DO NOTHING",
                performer_rows)
        if tag_rows:
            await database.execute_many(
                """INSERT INTO task_tag (task_id, tag_id, tag_state) VALUES (:tid, :tag, 'default')
                   ON CONFLICT DO NOTHING""", tag_rows)
        if comment_rows:
            await database.execute_many(
                """INSERT INTO task_comments (comment_id, task_id, author_id, text, created_at)
                   VALUES (:cid, :tid, :author, :text, :cat) ON CONFLICT (comment_id) DO NOTHING""",
                comment_rows)

        await database.execute("DELETE FROM project_user_role WHERE project_id = :pid", {"pid": pid})
        member_rows = []
        for member in project_members:
            m_id = await users.ensure(member.get("id"))
            if m_id:
                member_rows.append({"pid": pid, "uid": m_id, "role": member.get("role", "member")})
        if member_rows:
            await database.execute_many(
                """INSERT INTO project_user_role (project_id, user_id, user_role) VALUES (:pid, :uid, :role)
                   ON CONFLICT (project_id, user_id) DO UPDATE SET user_role = EXCLUDED.user_role""",
                member_rows)


async def save_chats(chats: list, users: "UserCache"):
    await database.execute("DELETE FROM chat")  # участники и сообщения удаляются каскадом
    existing_projects = {r["project_id"] for r in await database.fetch_all("SELECT project_id FROM project")}
    existing_tasks = {r["task_id"] for r in await database.fetch_all("SELECT task_id FROM task")}
    now = datetime.now(timezone.utc)

    chat_rows, member_rows, message_rows = [], [], []
    for chat in chats:
        cid = chat["id"]
        pid, tid = chat.get("projectId"), chat.get("taskId")
        if chat.get("type") == "task":
            pid = None
        elif tid:
            tid = None
        # Чат удалённой задачи/проекта не сохраняем — он бы нарушил внешний ключ
        if (pid and pid not in existing_projects) or (tid and tid not in existing_tasks):
            continue
        chat_rows.append({"cid": cid, "cname": chat.get("name") or chat.get("chat_name") or "",
                          "pid": pid, "tid": tid})
        for uid in dict.fromkeys(chat.get("members") or []):
            m_uid = await users.ensure(uid)
            if m_uid:
                member_rows.append({"cid": cid, "uid": m_uid})
        for msg in chat.get("messages") or []:
            sender = msg.get("authorId")
            sender = None if not sender or sender == "System" else await users.ensure(sender)
            message_rows.append({"mid": msg["id"], "cid": cid, "sender": sender, "text": msg["text"],
                                 "cat": parse_datetime(msg.get("createdAt")) or now})

    if chat_rows:
        await database.execute_many(
            """INSERT INTO chat (chat_id, chat_name, project_id, task_id) VALUES (:cid, :cname, :pid, :tid)
               ON CONFLICT (chat_id) DO NOTHING""", chat_rows)
    if member_rows:
        await database.execute_many(
            "INSERT INTO chat_member (chat_id, user_id) VALUES (:cid, :uid) ON CONFLICT DO NOTHING", member_rows)
    if message_rows:
        await database.execute_many(
            """INSERT INTO message (message_id, chat_id, sender_id, content, created_at)
               VALUES (:mid, :cid, :sender, :text, :cat) ON CONFLICT (message_id) DO NOTHING""", message_rows)


# =============================================================================
# API эндпоинты
# =============================================================================
@app.get("/api/all_data")
async def get_all_data(_user_id: str = Depends(require_user)):
    return await build_full_state()


@app.post("/api/sync")
async def sync_data(data: dict = Body(...), _user_id: str = Depends(require_user)):
    try:
        await save_full_state(data)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Sync failed: {e}")

    # 📣 Событие в Kafka. Ошибка Kafka не должна ломать сохранение данных.
    kafka = await ensure_producer()
    if kafka:
        try:
            await asyncio.wait_for(
                kafka.send_and_wait("board-updates", {"event": "state_synced"}),
                timeout=KAFKA_SEND_TIMEOUT_SEC,
            )
        except Exception as ke:
            print(f"⚠️ Не удалось отправить событие в Kafka: {ke!r}", flush=True)

    return {"status": "success", "message": "State synchronized successfully"}
