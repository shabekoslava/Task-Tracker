-- ============================================================
-- 1. Пользователи
-- ============================================================
CREATE TABLE IF NOT EXISTS user_ (
    user_id VARCHAR(20) PRIMARY KEY,
    user_name VARCHAR(100) NOT NULL,
    user_email VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL
);

-- ============================================================
-- 2. Теги и их состояния
-- ============================================================
CREATE TABLE IF NOT EXISTS tag (
    tag_id SERIAL PRIMARY KEY,
    tag_name VARCHAR(50) NOT NULL UNIQUE
);

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

-- ============================================================
-- 3. Проект
-- ============================================================
CREATE TABLE IF NOT EXISTS project (
    project_id VARCHAR(50) PRIMARY KEY,
    project_name VARCHAR(100) NOT NULL,
    description TEXT DEFAULT '',
    owner_id VARCHAR(20),
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_project_owner FOREIGN KEY (owner_id)
        REFERENCES user_(user_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);

-- ============================================================
-- 4. Колонки внутри проекта
-- ============================================================
CREATE TABLE IF NOT EXISTS project_column (
    column_id VARCHAR(50) PRIMARY KEY,
    project_id VARCHAR(50) NOT NULL,
    column_name VARCHAR(100) NOT NULL,
    position INT NOT NULL DEFAULT 0,
    CONSTRAINT fk_column_project FOREIGN KEY (project_id)
        REFERENCES project(project_id)
        ON DELETE CASCADE,
    CONSTRAINT uq_column_name_per_project UNIQUE (project_id, column_name)
);

-- ============================================================
-- 5. Задача
-- ============================================================
CREATE TABLE IF NOT EXISTS task (
    task_id VARCHAR(50) PRIMARY KEY,
    task_title VARCHAR(200) NOT NULL,
    description TEXT DEFAULT '',
    project_id VARCHAR(50) NOT NULL,
    column_id VARCHAR(50),
    creator_id VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT now(),
    deadline TIMESTAMPTZ,
    estimate VARCHAR(50),
    sprint VARCHAR(100),
    priority VARCHAR(20) DEFAULT 'Средний',
    completed BOOLEAN DEFAULT FALSE,
    task_color VARCHAR(7),
    CONSTRAINT fk_task_project FOREIGN KEY (project_id)
        REFERENCES project(project_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_task_column FOREIGN KEY (column_id)
        REFERENCES project_column(column_id)
        ON DELETE SET NULL,
    CONSTRAINT fk_task_creator FOREIGN KEY (creator_id)
        REFERENCES user_(user_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);

-- ============================================================
-- 6. Комментарии к задачам
-- ============================================================
CREATE TABLE IF NOT EXISTS task_comments (
    comment_id VARCHAR(50) PRIMARY KEY,
    task_id VARCHAR(50) NOT NULL,
    author_id VARCHAR(20),
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_comment_task FOREIGN KEY (task_id)
        REFERENCES task(task_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_comment_author FOREIGN KEY (author_id)
        REFERENCES user_(user_id)
        ON DELETE SET NULL
);

-- ============================================================
-- 7. Чат
-- ============================================================
CREATE TABLE IF NOT EXISTS chat (
    chat_id VARCHAR(50) PRIMARY KEY,
    chat_name VARCHAR(100) NOT NULL,
    project_id VARCHAR(50),
    task_id VARCHAR(50),
    CONSTRAINT chk_chat_owner CHECK (
        (project_id IS NOT NULL AND task_id IS NULL) OR
        (project_id IS NULL AND task_id IS NOT NULL) OR
        (project_id IS NULL AND task_id IS NULL)
    ),
    CONSTRAINT fk_chat_project FOREIGN KEY (project_id)
        REFERENCES project(project_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_chat_task FOREIGN KEY (task_id)
        REFERENCES task(task_id)
        ON DELETE CASCADE
);

-- ============================================================
-- 8. Участники чата
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_member (
    chat_id VARCHAR(50) NOT NULL,
    user_id VARCHAR(20) NOT NULL,
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

-- ============================================================
-- 9. Роли участников в проектах
-- ============================================================
CREATE TABLE IF NOT EXISTS project_user_role (
    project_id VARCHAR(50) NOT NULL,
    user_id VARCHAR(20) NOT NULL,
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

-- ============================================================
-- 10. Теги задачи
-- ============================================================
CREATE TABLE IF NOT EXISTS task_tag (
    task_id VARCHAR(50) NOT NULL,
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

-- ============================================================
-- 11. Исполнители задач
-- ============================================================
CREATE TABLE IF NOT EXISTS task_performer (
    task_id VARCHAR(50) NOT NULL,
    performer_id VARCHAR(20) NOT NULL,
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

-- ============================================================
-- 12. Приглашения в проект
-- ============================================================
CREATE TABLE IF NOT EXISTS invitations (
    invite_id VARCHAR(50) PRIMARY KEY,
    project_id VARCHAR(50) NOT NULL,
    invited_by VARCHAR(20) NOT NULL,
    invited_user VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    role VARCHAR(50) DEFAULT 'member',
    created_at TIMESTAMPTZ DEFAULT now(),
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

-- ============================================================
-- 13. Сообщения в чатах
-- ============================================================
CREATE TABLE IF NOT EXISTS message (
    message_id VARCHAR(50) PRIMARY KEY,
    chat_id VARCHAR(50) NOT NULL,
    sender_id VARCHAR(20),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_message_chat FOREIGN KEY (chat_id)
        REFERENCES chat(chat_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT fk_message_sender FOREIGN KEY (sender_id)
        REFERENCES user_(user_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);

-- ============================================================
-- Индексы
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_message_chat_created ON message(chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_sender ON message(sender_id);
CREATE INDEX IF NOT EXISTS idx_task_project_id ON task(project_id);
CREATE INDEX IF NOT EXISTS idx_task_column_id ON task(column_id);
CREATE INDEX IF NOT EXISTS idx_task_performer_task ON task_performer(task_id);
CREATE INDEX IF NOT EXISTS idx_chat_member_user ON chat_member(user_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);
