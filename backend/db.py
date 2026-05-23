# backend/db.py
import os
import json
import psycopg2
from psycopg2 import extras
from typing import Dict, List, Any

# PostgreSQL Connection settings
DB_HOST = os.environ.get("DB_HOST", "localhost")
DB_PORT = os.environ.get("DB_PORT", "5432")
DB_NAME = os.environ.get("DB_NAME", "postgres")
DB_USER = os.environ.get("DB_USER", "postgres")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "postgres")

# Base directory for ID mappings
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ID_MAP_FILE = os.path.join(BASE_DIR, "id_mapping.json")

def get_connection():
    """Establish a connection to the PostgreSQL database."""
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD
    )

def load_id_mappings() -> Dict[str, Dict[str, int]]:
    """Load frontend string ID <-> backend integer ID mappings from file."""
    if not os.path.exists(ID_MAP_FILE):
        return {
            "project": {},
            "task": {},
            "chat": {},
            "message": {},
            "invite": {},
            "tag": {}
        }
    try:
        with open(ID_MAP_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {
            "project": {},
            "task": {},
            "chat": {},
            "message": {},
            "invite": {},
            "tag": {}
        }

def save_id_mappings(mappings: Dict[str, Dict[str, int]]):
    """Save ID mappings to file."""
    try:
        with open(ID_MAP_FILE, "w", encoding="utf-8") as f:
            json.dump(mappings, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Error saving ID mappings: {e}")

# Global cached mappings
_mappings = load_id_mappings()

def get_pg_id(entity_type: str, frontend_id: str) -> int:
    """Get the PostgreSQL integer ID corresponding to a frontend string ID."""
    global _mappings
    # If the ID is already an integer or a string integer, return it
    try:
        return int(frontend_id)
    except ValueError:
        pass
    
    entity_maps = _mappings.setdefault(entity_type, {})
    return entity_maps.get(str(frontend_id))

def set_id_mapping(entity_type: str, frontend_id: str, pg_id: int):
    """Associate a frontend string ID with a PostgreSQL integer ID."""
    global _mappings
    entity_maps = _mappings.setdefault(entity_type, {})
    entity_maps[str(frontend_id)] = pg_id
    save_id_mappings(_mappings)

def get_frontend_id(entity_type: str, pg_id: int, prefix: str = "") -> str:
    """Get the frontend string ID corresponding to a PostgreSQL integer ID."""
    global _mappings
    entity_maps = _mappings.setdefault(entity_type, {})
    for fid, pid in entity_maps.items():
        if pid == pg_id:
            return fid
    # If not found in mapping, generate a generic one
    new_fid = f"{prefix}{pg_id}"
    entity_maps[new_fid] = pg_id
    save_id_mappings(_mappings)
    return new_fid

def init_db():
    """Create all tables and indices if they do not exist."""
    queries = [
        # 1. Users
        """
        CREATE TABLE IF NOT EXISTS user_ (
            user_id varchar(8) PRIMARY KEY,
            user_name VARCHAR(50) NOT NULL,
            user_email VARCHAR(50) NOT NULL,
            password_hash VARCHAR(255) NOT NULL
        );
        """,
        # 2. Tags
        """
        CREATE TABLE IF NOT EXISTS tag (
            tag_id SERIAL PRIMARY KEY,
            tag_name VARCHAR(50) NOT NULL
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS tag_state (
            tag_id INT NOT NULL,
            tag_state VARCHAR(50) NOT NULL,
            tag_state_color VARCHAR(7),
            CONSTRAINT pk_tag_state PRIMARY KEY (tag_id, tag_state),
            CONSTRAINT fk_tag_state_tag FOREIGN KEY (tag_id)
                REFERENCES tag(tag_id)
                ON UPDATE CASCADE
                ON DELETE CASCADE
        );
        """,
        # 3. Project
        """
        CREATE TABLE IF NOT EXISTS project (
            project_id SERIAL PRIMARY KEY,
            project_name VARCHAR(50) NOT NULL,
            description TEXT,
            owner_id varchar(8),
            created_at TIMESTAMP,
            updated_at TIMESTAMP,
            CONSTRAINT fk_project_owner FOREIGN KEY (owner_id)
                REFERENCES user_(user_id)
                ON UPDATE CASCADE
                ON DELETE SET NULL
        );
        """,
        # 4. Task
        """
        CREATE TABLE IF NOT EXISTS task (
            task_id SERIAL PRIMARY KEY,
            task_title VARCHAR(50) NOT NULL,
            status VARCHAR(50),
            project_id INT NOT NULL,
            creator_id varchar(8),
            task_color VARCHAR(7),
            CONSTRAINT fk_task_project FOREIGN KEY (project_id)
                REFERENCES project(project_id)
                ON UPDATE CASCADE
                ON DELETE CASCADE,
            CONSTRAINT fk_task_creator FOREIGN KEY (creator_id)
                REFERENCES user_(user_id)
                ON UPDATE CASCADE
                ON DELETE SET NULL
        );
        """,
        # 5. Chat
        """
        CREATE TABLE IF NOT EXISTS chat (
            chat_id SERIAL PRIMARY KEY,
            chat_name VARCHAR(50) NOT NULL,
            project_id INT,
            task_id INT,
            CONSTRAINT chk_chat_owner CHECK (
                (project_id IS NOT NULL AND task_id IS NULL) OR
                (project_id IS NULL AND task_id IS NOT NULL)
            ),
            CONSTRAINT fk_chat_project FOREIGN KEY (project_id)
                REFERENCES project(project_id)
                ON DELETE CASCADE,
            CONSTRAINT fk_chat_task FOREIGN KEY (task_id)
                REFERENCES task(task_id)
                ON DELETE CASCADE
        );
        """,
        # 6. Chat Member
        """
        CREATE TABLE IF NOT EXISTS chat_member (
            chat_id INT NOT NULL,
            user_id varchar(8) NOT NULL,
            CONSTRAINT pk_chat_member PRIMARY KEY (chat_id, user_id),
            CONSTRAINT fk_chat_member_chat FOREIGN KEY (chat_id)
                REFERENCES chat(chat_id)
                ON UPDATE CASCADE
                ON DELETE CASCADE,
            CONSTRAINT fk_chat_member_user FOREIGN KEY (user_id)
                REFERENCES user_(user_id)
                ON UPDATE CASCADE
                ON DELETE CASCADE
        );
        """,
        # 7. Project User Role
        """
        CREATE TABLE IF NOT EXISTS project_user_role (
            project_id INT NOT NULL,
            user_id varchar(8) NOT NULL,
            user_role VARCHAR(50) NOT NULL,
            CONSTRAINT pk_project_user_role PRIMARY KEY (project_id, user_id),
            CONSTRAINT fk_pur_project FOREIGN KEY (project_id)
                REFERENCES project(project_id)
                ON UPDATE CASCADE
                ON DELETE CASCADE,
            CONSTRAINT fk_pur_user FOREIGN KEY (user_id)
                REFERENCES user_(user_id)
                ON UPDATE CASCADE
                ON DELETE CASCADE
        );
        """,
        # 8. Task Tag
        """
        CREATE TABLE IF NOT EXISTS task_tag (
            task_id INT NOT NULL,
            tag_id INT NOT NULL,
            tag_state VARCHAR(50),
            CONSTRAINT pk_task_tag PRIMARY KEY (task_id, tag_id, tag_state),
            CONSTRAINT fk_task_tag_task FOREIGN KEY (task_id)
                REFERENCES task(task_id)
                ON UPDATE CASCADE
                ON DELETE CASCADE,
            CONSTRAINT fk_task_tag_tag FOREIGN KEY (tag_id)
                REFERENCES tag(tag_id)
                ON UPDATE CASCADE
                ON DELETE CASCADE,
            CONSTRAINT fk_task_tag_state FOREIGN KEY (tag_id, tag_state)
                REFERENCES tag_state(tag_id, tag_state)
                ON UPDATE CASCADE
                ON DELETE CASCADE
        );
        """,
        # 9. Task Performer
        """
        CREATE TABLE IF NOT EXISTS task_performer (
            task_id INT NOT NULL,
            performer_id varchar(8) NOT NULL,
            CONSTRAINT pk_task_performer PRIMARY KEY (task_id, performer_id),
            CONSTRAINT fk_task_performer_task FOREIGN KEY (task_id)
                REFERENCES task(task_id)
                ON UPDATE CASCADE
                ON DELETE CASCADE,
            CONSTRAINT fk_task_performer_user FOREIGN KEY (performer_id)
                REFERENCES user_(user_id)
                ON UPDATE CASCADE
                ON DELETE CASCADE
        );
        """,
        # 10. Invitations
        """
        CREATE TABLE IF NOT EXISTS invitations (
            invite_id SERIAL PRIMARY KEY,
            project_id INT NOT NULL,
            invited_by varchar(8) NOT NULL,
            invited_user varchar(8) NOT NULL,
            CONSTRAINT fk_invitations_project FOREIGN KEY (project_id)
                REFERENCES project(project_id)
                ON UPDATE CASCADE
                ON DELETE CASCADE,
            CONSTRAINT fk_invited_by_user FOREIGN KEY (invited_by)
                REFERENCES user_(user_id)
                ON UPDATE CASCADE
                ON DELETE CASCADE,
            CONSTRAINT fk_invited_user FOREIGN KEY (invited_user)
                REFERENCES user_(user_id)
                ON UPDATE CASCADE
                ON DELETE CASCADE
        );
        """,
        # 11. Message
        """
        CREATE TABLE IF NOT EXISTS message (
            message_id SERIAL PRIMARY KEY,
            chat_id INT NOT NULL,
            sender_id varchar(8),
            content TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT fk_message_chat FOREIGN KEY (chat_id)
                REFERENCES chat(chat_id)
                ON UPDATE CASCADE
                ON DELETE CASCADE,
            CONSTRAINT fk_message_sender FOREIGN KEY (sender_id)
                REFERENCES user_(user_id)
                ON UPDATE CASCADE
                ON DELETE SET NULL
        );
        """,
        # Indices
        "CREATE INDEX IF NOT EXISTS idx_message_chat_created ON message(chat_id, created_at DESC);",
        "CREATE INDEX IF NOT EXISTS idx_message_sender ON message(sender_id);",
        "CREATE INDEX IF NOT EXISTS idx_task_project_id ON task(project_id);",
        "CREATE INDEX IF NOT EXISTS idx_task_performer_task ON task_performer(task_id);",
        "CREATE INDEX IF NOT EXISTS idx_chat_member_user ON chat_member(user_id);"
    ]
    
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            for q in queries:
                cur.execute(q)
        conn.commit()
        print("Database initialized successfully.")
    except Exception as e:
        conn.rollback()
        print(f"Error initializing database: {e}")
        raise e
    finally:
        conn.close()

def get_system_project_id(cur) -> int:
    """Get or create a system project ID to attach internal/personal/group chats to."""
    cur.execute("SELECT project_id FROM project WHERE project_name = 'System Internal' LIMIT 1;")
    row = cur.fetchone()
    if row:
        return row[0]
    
    cur.execute(
        "INSERT INTO project (project_name, description, created_at, updated_at) VALUES (%s, %s, now(), now()) RETURNING project_id;",
        ("System Internal", "System Project for holding personal and group chats to satisfy relational database schema constraints.")
    )
    pid = cur.fetchone()[0]
    return pid

def get_all_data_from_db() -> Dict[str, Any]:
    """Retrieve full application state from the PostgreSQL database in the format the frontend expects."""
    conn = get_connection()
    db_state = {
        "users": [],
        "projects": [],
        "invitations": [],
        "chats": []
    }
    
    try:
        with conn.cursor(cursor_factory=extras.RealDictCursor) as cur:
            # 1. Users
            cur.execute("SELECT user_id, user_name, user_email, password_hash FROM user_;")
            for u in cur.fetchall():
                db_state["users"].append({
                    "id": u["user_id"],
                    "name": u["user_name"],
                    "email": u["user_email"],
                    "password": u["password_hash"]
                })
            
            # System project ID (used to skip System Internal project from being displayed in frontend)
            cur.execute("SELECT project_id FROM project WHERE project_name = 'System Internal' LIMIT 1;")
            sys_project_row = cur.fetchone()
            sys_project_id = sys_project_row["project_id"] if sys_project_row else None
            
            # 2. Projects
            cur.execute("SELECT project_id, project_name, description, owner_id FROM project;")
            projects_rows = cur.fetchall()
            
            for p in projects_rows:
                pid = p["project_id"]
                if pid == sys_project_id:
                    continue # Skip showing the internal project to the frontend
                
                # Fetch members
                cur.execute("SELECT user_id, user_role FROM project_user_role WHERE project_id = %s;", (pid,))
                members = []
                for m in cur.fetchall():
                    members.append({
                        "id": m["user_id"],
                        "role": m["user_role"]
                    })
                
                # Parse columns & task rich details from description
                columns = []
                task_details = {}
                desc_text = p["description"] or ""
                actual_description = desc_text
                
                if "--- METADATA ---" in desc_text:
                    parts = desc_text.split("--- METADATA ---")
                    actual_description = parts[0].strip()
                    try:
                        meta = json.loads(parts[1].strip())
                        columns = meta.get("columns", [])
                        task_details = meta.get("taskDetails", {})
                    except Exception:
                        pass
                
                # If no columns metadata was restored, generate defaults
                proj_fid = get_frontend_id("project", pid)
                if not columns:
                    columns = [
                        {"id": f"{proj_fid}-todo", "name": "В ожидании", "taskIds": []},
                        {"id": f"{proj_fid}-inwork", "name": "В работе", "taskIds": []},
                        {"id": f"{proj_fid}-review", "name": "На проверку", "taskIds": []},
                        {"id": f"{proj_fid}-done", "name": "Выполнено", "taskIds": []}
                    ]
                
                # Fetch tasks from DB
                cur.execute("SELECT task_id, task_title, status, creator_id, task_color FROM task WHERE project_id = %s;", (pid,))
                tasks_rows = cur.fetchall()
                
                tasks_dict = {}
                for t in tasks_rows:
                    tid = t["task_id"]
                    tfid = get_frontend_id("task", tid, prefix="task-")
                    
                    # Fetch performer
                    cur.execute("SELECT performer_id FROM task_performer WHERE task_id = %s LIMIT 1;", (tid,))
                    perf_row = cur.fetchone()
                    assigned_to = perf_row["performer_id"] if perf_row else ""
                    
                    # Fetch tags
                    cur.execute(
                        "SELECT t.tag_name FROM task_tag tt JOIN tag t ON tt.tag_id = t.tag_id WHERE tt.task_id = %s;",
                        (tid,)
                    )
                    tags = [tag_row["tag_name"] for tag_row in cur.fetchall()]
                    
                    # Get rich details from serialized metadata
                    rich = task_details.get(tfid, {})
                    
                    tasks_dict[tfid] = {
                        "id": tfid,
                        "title": t["task_title"],
                        "description": rich.get("description", ""),
                        "assignedTo": assigned_to,
                        "tags": tags,
                        "deadline": rich.get("deadline", ""),
                        "estimate": rich.get("estimate", ""),
                        "sprint": rich.get("sprint", ""),
                        "priority": rich.get("priority", "Средний"),
                        "completed": rich.get("completed", False),
                        "comments": rich.get("comments", []),
                        "createdAt": rich.get("createdAt", "")
                    }
                
                # Ensure all active tasks are in the columns' taskIds list
                # (and remove any stale task IDs from columns)
                existing_tfids = set(tasks_dict.keys())
                for col in columns:
                    col["taskIds"] = [tid for tid in col.get("taskIds", []) if tid in existing_tfids]
                
                # Add any tasks that aren't in any column to the first column
                placed_task_ids = set()
                for col in columns:
                    placed_task_ids.update(col["taskIds"])
                
                unplaced_tasks = existing_tfids - placed_task_ids
                if unplaced_tasks and columns:
                    columns[0]["taskIds"].extend(list(unplaced_tasks))
                
                db_state["projects"].append({
                    "id": proj_fid,
                    "name": p["project_name"],
                    "description": actual_description,
                    "members": members,
                    "columns": columns,
                    "tasks": tasks_dict
                })
            
            # 3. Invitations
            cur.execute("SELECT invite_id, project_id, invited_by, invited_user FROM invitations;")
            for inv in cur.fetchall():
                inv_fid = get_frontend_id("invite", inv["invite_id"], prefix="inv-")
                db_state["invitations"].append({
                    "id": inv_fid,
                    "projectId": get_frontend_id("project", inv["project_id"]),
                    "invitedBy": inv["invited_by"],
                    "invitedUser": inv["invited_user"],
                    "status": "pending" # Standard status mapped from db presence
                })
                
            # 4. Chats
            cur.execute("SELECT chat_id, chat_name, project_id, task_id FROM chat;")
            chats_rows = cur.fetchall()
            for ch in chats_rows:
                cid = ch["chat_id"]
                cfid = get_frontend_id("chat", cid)
                
                # Fetch members
                cur.execute("SELECT user_id FROM chat_member WHERE chat_id = %s;", (cid,))
                members = [m["user_id"] for m in cur.fetchall()]
                
                # Fetch messages
                cur.execute(
                    "SELECT message_id, sender_id, content, created_at FROM message WHERE chat_id = %s ORDER BY created_at ASC;",
                    (cid,)
                )
                messages = []
                for msg in cur.fetchall():
                    msg_fid = get_frontend_id("message", msg["message_id"], prefix="msg-")
                    messages.append({
                        "id": msg_fid,
                        "text": msg["content"],
                        "createdAt": msg["created_at"].isoformat() if hasattr(msg["created_at"], "isoformat") else str(msg["created_at"]),
                        "authorId": msg["sender_id"] or "System",
                        "status": "delivered"
                    })
                
                # Deduce chat type
                chat_type = "personal"
                project_id = None
                task_id = None
                
                if ch["task_id"] is not None:
                    chat_type = "task"
                    task_id = get_frontend_id("task", ch["task_id"], prefix="task-")
                    # Find project_id of this task
                    cur.execute("SELECT project_id FROM task WHERE task_id = %s;", (ch["task_id"],))
                    t_row = cur.fetchone()
                    if t_row:
                        project_id = get_frontend_id("project", t_row["project_id"])
                elif ch["project_id"] is not None and ch["project_id"] != sys_project_id:
                    chat_type = "project"
                    project_id = get_frontend_id("project", ch["project_id"])
                else:
                    # System linked internal chat (personal or group)
                    if cfid.startswith("personal-chat"):
                        chat_type = "personal"
                    else:
                        chat_type = "group"
                
                chat_obj = {
                    "id": cfid,
                    "name": ch["chat_name"],
                    "type": chat_type,
                    "members": members,
                    "messages": messages
                }
                if project_id:
                    chat_obj["projectId"] = project_id
                if task_id:
                    chat_obj["taskId"] = task_id
                    # Also append taskName
                    cur.execute("SELECT task_title FROM task WHERE task_id = %s;", (ch["task_id"],))
                    t_title_row = cur.fetchone()
                    if t_title_row:
                        chat_obj["taskName"] = t_title_row["task_title"]
                
                db_state["chats"].append(chat_obj)
                
    except Exception as e:
        print(f"Error fetching data from PostgreSQL: {e}")
    finally:
        conn.close()
        
    return db_state

def sync_data_to_db(data: Dict[str, Any]):
    """Synchronize the full application JSON state payload back into PostgreSQL tables."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            # 0. System internal project (to attach chats)
            sys_project_id = get_system_project_id(cur)
            
            # 1. Users sync
            users = data.get("users", [])
            existing_user_ids = set()
            for u in users:
                uid = u.get("id")
                if not uid:
                    continue
                existing_user_ids.add(uid)
                cur.execute(
                    """
                    INSERT INTO user_ (user_id, user_name, user_email, password_hash)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (user_id) DO UPDATE 
                    SET user_name = EXCLUDED.user_name,
                        user_email = EXCLUDED.user_email,
                        password_hash = EXCLUDED.password_hash;
                    """,
                    (uid, u.get("name"), u.get("email"), u.get("password", "123"))
                )
            
            # 2. Projects sync
            projects = data.get("projects", [])
            incoming_project_ids = []
            
            for p in projects:
                pfid = p.get("id")
                pid = get_pg_id("project", pfid)
                
                # Prepare description metadata to save columns & rich task details
                task_details = {}
                for tfid, tdetails in p.get("tasks", {}).items():
                    task_details[tfid] = {
                        "description": tdetails.get("description", ""),
                        "deadline": tdetails.get("deadline", ""),
                        "estimate": tdetails.get("estimate", ""),
                        "sprint": tdetails.get("sprint", ""),
                        "priority": tdetails.get("priority", "Средний"),
                        "completed": tdetails.get("completed", False),
                        "comments": tdetails.get("comments", []),
                        "createdAt": tdetails.get("createdAt", "")
                    }
                
                meta_str = json.dumps({
                    "columns": p.get("columns", []),
                    "taskDetails": task_details
                }, ensure_ascii=False)
                
                full_description = f"{p.get('description', '')}\n--- METADATA ---\n{meta_str}"
                
                # Get project owner ID (usually first member with admin role or first user)
                owner_id = None
                for m in p.get("members", []):
                    if m.get("role") == "admin":
                        owner_id = m.get("id")
                        break
                if not owner_id and p.get("members"):
                    owner_id = p.get("members")[0].get("id")
                if not owner_id and users:
                    owner_id = users[0].get("id")
                
                if pid:
                    # Update project
                    cur.execute(
                        """
                        UPDATE project 
                        SET project_name = %s, description = %s, owner_id = %s, updated_at = now()
                        WHERE project_id = %s;
                        """,
                        (p.get("name"), full_description, owner_id, pid)
                    )
                else:
                    # Insert new project
                    cur.execute(
                        """
                        INSERT INTO project (project_name, description, owner_id, created_at, updated_at)
                        VALUES (%s, %s, %s, now(), now()) RETURNING project_id;
                        """,
                        (p.get("name"), full_description, owner_id)
                    )
                    pid = cur.fetchone()[0]
                    set_id_mapping("project", pfid, pid)
                
                incoming_project_ids.append(pid)
                
                # Project Members sync (project_user_role)
                cur.execute("DELETE FROM project_user_role WHERE project_id = %s;", (pid,))
                for m in p.get("members", []):
                    mid = m.get("id")
                    if mid in existing_user_ids:
                        cur.execute(
                            "INSERT INTO project_user_role (project_id, user_id, user_role) VALUES (%s, %s, %s);",
                            (pid, mid, m.get("role", "member"))
                        )
                
                # Tasks inside project sync
                incoming_task_ids = []
                tasks = p.get("tasks", {})
                for tfid, t in tasks.items():
                    tid = get_pg_id("task", tfid)
                    
                    # Deduce status/column name
                    status = "В ожидании"
                    for col in p.get("columns", []):
                        if tfid in col.get("taskIds", []):
                            status = col.get("name", "В ожидании")
                            break
                    
                    creator_id = t.get("creator_id") or owner_id
                    if creator_id not in existing_user_ids and users:
                        creator_id = users[0].get("id")
                        
                    task_color = t.get("task_color") or None
                    
                    if tid:
                        # Update task
                        cur.execute(
                            """
                            UPDATE task 
                            SET task_title = %s, status = %s, creator_id = %s, task_color = %s
                            WHERE task_id = %s;
                            """,
                            (t.get("title"), status, creator_id, task_color, tid)
                        )
                    else:
                        # Insert task
                        cur.execute(
                            """
                            INSERT INTO task (task_title, status, project_id, creator_id, task_color)
                            VALUES (%s, %s, %s, %s, %s) RETURNING task_id;
                            """,
                            (t.get("title"), status, pid, creator_id, task_color)
                        )
                        tid = cur.fetchone()[0]
                        set_id_mapping("task", tfid, tid)
                    
                    incoming_task_ids.append(tid)
                    
                    # Task Performers sync
                    cur.execute("DELETE FROM task_performer WHERE task_id = %s;", (tid,))
                    assigned_to = t.get("assignedTo")
                    if assigned_to and assigned_to in existing_user_ids:
                        cur.execute(
                            "INSERT INTO task_performer (task_id, performer_id) VALUES (%s, %s);",
                            (tid, assigned_to)
                        )
                        
                    # Task Tags sync
                    cur.execute("DELETE FROM task_tag WHERE task_id = %s;", (tid,))
                    for tname in t.get("tags", []):
                        if not tname:
                            continue
                        
                        # Find or create tag
                        cur.execute("SELECT tag_id FROM tag WHERE tag_name = %s LIMIT 1;", (tname,))
                        tag_row = cur.fetchone()
                        if tag_row:
                            tag_id = tag_row[0]
                        else:
                            cur.execute("INSERT INTO tag (tag_name) VALUES (%s) RETURNING tag_id;", (tname,))
                            tag_id = cur.fetchone()[0]
                            # Create a default tag state
                            cur.execute(
                                "INSERT INTO tag_state (tag_id, tag_state, tag_state_color) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING;",
                                (tag_id, "default", "#e0e0e0")
                            )
                        
                        cur.execute(
                            "INSERT INTO task_tag (task_id, tag_id, tag_state) VALUES (%s, %s, 'default') ON CONFLICT DO NOTHING;",
                            (tid, tag_id)
                        )
                
                # Delete tasks from database that are no longer in this project
                if incoming_task_ids:
                    cur.execute(
                        "DELETE FROM task WHERE project_id = %s AND task_id NOT IN %s;",
                        (pid, tuple(incoming_task_ids))
                    )
                else:
                    cur.execute("DELETE FROM task WHERE project_id = %s;", (pid,))
            
            # Clean up projects that are no longer present
            if incoming_project_ids:
                # Include the internal system project so it isn't deleted!
                all_valid_projects = incoming_project_ids + [sys_project_id]
                cur.execute("DELETE FROM project WHERE project_id NOT IN %s;", (tuple(all_valid_projects),))
            else:
                cur.execute("DELETE FROM project WHERE project_id != %s;", (sys_project_id,))
                
            # 3. Invitations sync
            invitations = data.get("invitations", [])
            incoming_invite_ids = []
            for inv in invitations:
                infid = inv.get("id")
                iid = get_pg_id("invite", infid)
                
                ip_id = get_pg_id("project", inv.get("projectId"))
                iby = inv.get("invitedBy")
                iuser = inv.get("invitedUser")
                
                if ip_id and iby in existing_user_ids and iuser in existing_user_ids:
                    if iid:
                        # Ensure it exists
                        cur.execute("SELECT 1 FROM invitations WHERE invite_id = %s;", (iid,))
                        if not cur.fetchone():
                            cur.execute(
                                "INSERT INTO invitations (invite_id, project_id, invited_by, invited_user) VALUES (%s, %s, %s, %s);",
                                (iid, ip_id, iby, iuser)
                            )
                    else:
                        cur.execute(
                            "INSERT INTO invitations (project_id, invited_by, invited_user) VALUES (%s, %s, %s) RETURNING invite_id;",
                            (ip_id, iby, iuser)
                        )
                        iid = cur.fetchone()[0]
                        set_id_mapping("invite", infid, iid)
                    
                    incoming_invite_ids.append(iid)
            
            if incoming_invite_ids:
                cur.execute("DELETE FROM invitations WHERE invite_id NOT IN %s;", (tuple(incoming_invite_ids),))
            else:
                cur.execute("DELETE FROM invitations;")
                
            # 4. Chats sync
            chats = data.get("chats", [])
            incoming_chat_ids = []
            
            for ch in chats:
                cfid = ch.get("id")
                cid = get_pg_id("chat", cfid)
                
                cname = ch.get("name", "Chat")
                
                # Determine project_id or task_id ownership
                project_id = None
                task_id = None
                
                if ch.get("type") == "task" and ch.get("taskId"):
                    task_id = get_pg_id("task", ch.get("taskId"))
                elif ch.get("type") == "project" and ch.get("projectId"):
                    project_id = get_pg_id("project", ch.get("projectId"))
                
                # Force constraint fulfillment: if both are None, attach to system project
                if not project_id and not task_id:
                    project_id = sys_project_id
                
                if cid:
                    cur.execute(
                        "UPDATE chat SET chat_name = %s, project_id = %s, task_id = %s WHERE chat_id = %s;",
                        (cname, project_id, task_id, cid)
                    )
                else:
                    cur.execute(
                        "INSERT INTO chat (chat_name, project_id, task_id) VALUES (%s, %s, %s) RETURNING chat_id;",
                        (cname, project_id, task_id)
                    )
                    cid = cur.fetchone()[0]
                    set_id_mapping("chat", cfid, cid)
                
                incoming_chat_ids.append(cid)
                
                # Chat Members sync
                cur.execute("DELETE FROM chat_member WHERE chat_id = %s;", (cid,))
                for mem in ch.get("members", []):
                    if mem in existing_user_ids:
                        cur.execute(
                            "INSERT INTO chat_member (chat_id, user_id) VALUES (%s, %s) ON CONFLICT DO NOTHING;",
                            (cid, mem)
                        )
                
                # Chat Messages sync
                for msg in ch.get("messages", []):
                    mfid = msg.get("id")
                    mid = get_pg_id("message", mfid)
                    
                    sender_id = msg.get("authorId")
                    if sender_id == "System" or sender_id not in existing_user_ids:
                        sender_id = None # Maps to NULL in DB
                        
                    content = msg.get("text", "")
                    created_at = msg.get("createdAt")
                    
                    if mid:
                        cur.execute(
                            "UPDATE message SET sender_id = %s, content = %s WHERE message_id = %s;",
                            (sender_id, content, mid)
                        )
                    else:
                        if created_at:
                            cur.execute(
                                """
                                INSERT INTO message (chat_id, sender_id, content, created_at)
                                VALUES (%s, %s, %s, %s) RETURNING message_id;
                                """,
                                (cid, sender_id, content, created_at)
                            )
                        else:
                            cur.execute(
                                """
                                INSERT INTO message (chat_id, sender_id, content)
                                VALUES (%s, %s, %s) RETURNING message_id;
                                """,
                                (cid, sender_id, content)
                            )
                        mid = cur.fetchone()[0]
                        set_id_mapping("message", mfid, mid)
                        
            if incoming_chat_ids:
                cur.execute("DELETE FROM chat WHERE chat_id NOT IN %s;", (tuple(incoming_chat_ids),))
            else:
                cur.execute("DELETE FROM chat;")
                
        conn.commit()
        print("Data successfully synced to PostgreSQL.")
    except Exception as e:
        conn.rollback()
        print(f"Error syncing data to PostgreSQL: {e}")
        raise e
    finally:
        conn.close()
