# 🚀 Руководство по развертыванию Full-Stack проекта в интернет

В данном руководстве описан процесс упаковки вашего приложения (React + FastAPI + PostgreSQL) в контейнеры **Docker** и его деплой на хостинг с настроенным автоматическим обновлением (CI/CD) при каждом пуше в ваш репозиторий GitHub.

---

## 📦 Шаг 1: Контейнеризация проекта с помощью Docker

Для того чтобы приложение запускалось на любом удаленном сервере так же стабильно, как и на вашем локальном компьютере, упакуем его компоненты в **Docker-контейнеры**.

### 1. Создаем Dockerfile для бэкенда (`backend/Dockerfile`)
Создайте файл `Dockerfile` в папке `backend/` со следующим содержимым:

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Установка системных зависимостей для сборки некоторых библиотек
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Копируем и устанавливаем зависимости
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копируем код бэкенда
COPY . .

# Открываем порт бэкенда
EXPOSE 8000

# Команда для запуска
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

> [!NOTE]
> Не забудьте создать файл `backend/requirements.txt` и перечислить в нем ваши зависимости:
> `fastapi`, `uvicorn`, `databases`, `asyncpg`, `sqlalchemy`, `greenlet`

### 2. Создаем Dockerfile для фронтенда (`frontend/Dockerfile`)
Создайте файл `Dockerfile` в папке `frontend/` со следующим содержимым (сборка через Nginx для максимальной производительности):

```dockerfile
# Шаг 1: Сборка статики React/Vite
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Шаг 2: Раздача статики через Nginx
FROM nginx:stable-alpine

COPY --from=build /app/dist /usr/share/nginx/html
# Копируем кастомную конфигурацию Nginx (для поддержки SPA-роутинга)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

Для поддержки маршрутизации React (SPA) создайте файл `frontend/nginx.conf`:
```nginx
server {
    listen 80;
    
    location / {
        root /usr/share/nginx/html;
        index index.html index.htm;
        try_files $uri $uri/ /index.html;
    }

    # Проксирование запросов к бэкенду
    location /api {
        proxy_pass http://backend:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /ws {
        proxy_pass http://backend:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}
```

### 3. Настройка локального запуска через Docker Compose (`docker-compose.yml`)
Создайте файл `docker-compose.yml` в **корневой директории** проекта:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: task_tracker_db
    restart: always
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASSWORD:-Slava2005}
      POSTGRES_DB: task_tracker_bd
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  backend:
    build: ./backend
    container_name: task_tracker_backend
    restart: always
    environment:
      DATABASE_URL: postgresql+asyncpg://postgres:${DB_PASSWORD:-Slava2005}@postgres:5432/task_tracker_bd
    ports:
      - "8000:8000"
    depends_on:
      - postgres

  frontend:
    build: ./frontend
    container_name: task_tracker_frontend
    restart: always
    ports:
      - "80:80"
    depends_on:
      - backend

volumes:
  pgdata:
```

---

## 🌐 Шаг 2: Варианты хостинга и деплоя в интернет

Существует два основных способа развертывания проекта:

### Вариант А: Использование облачных PaaS-платформ (Самый простой способ ⭐️)
Платформы вроде **Railway**, **Render** или отечественной **Amvera** идеально подходят для этого.
* **Как это работает**: Вы привязываете свой аккаунт GitHub к платформе. При каждом коммите в ветку `main` облако само забирает код, собирает его через Docker и обновляет сайт без простоя (Zero-Downtime Deployment).
* **СУБД**: База PostgreSQL создается прямо внутри панели управления хостинга в один клик.

#### Инструкция для Amvera (Российский хостинг с поддержкой Docker и карт РФ):
1. Зарегистрируйтесь на [Amvera Cloud](https://amvera.ru/).
2. Создайте проект, выберите тип сборки **Docker**.
3. Создайте встроенную базу данных PostgreSQL в разделе «Базы данных».
4. В конфигурационном файле бэкенда привяжите строку подключения к системным переменным Amvera (`$AMVERA_DB_URL`).
5. Свяжите проект с вашим GitHub-репозиторием. Готово!

---

### Вариант Б: Аренда собственного VPS/VDS-сервера (Самый дешевый и гибкий 🛠)
Вы можете арендовать сервер (от 200 до 500 рублей/месяц на RuVDS, Timeweb Cloud, Beget или Reg.ru) с установленной ОС Ubuntu.

1. **Подключение к серверу через терминал**:
   ```bash
   ssh root@ip_адрес_вашего_сервера
   ```
2. **Установка Docker и Docker Compose**:
   ```bash
   sudo apt update
   sudo apt install docker.io docker-compose -y
   ```
3. **Клонирование вашего репозитория**:
   ```bash
   git clone https://github.com/ваш_логин/ваш_репозиторий.git project
   cd project
   ```
4. **Запуск всего приложения**:
   ```bash
   docker-compose up -d --build
   ```
   После этого ваш сайт станет доступен по публичному IP-адресу вашего сервера!

---

## 🔄 Шаг 3: Настройка автоматического обновления (CI/CD)

Если вы используете **Вариант А (Amvera / Railway / Render)**, то автоматическое обновление работает «из коробки» сразу после привязки GitHub.

Если вы выбрали **Вариант Б (Собственный VPS)**, вы можете настроить **GitHub Actions**, чтобы при отправке изменений код автоматически обновлялся на сервере:

1. В репозитории на GitHub перейдите в **Settings** ➔ **Secrets and variables** ➔ **Actions**.
2. Добавьте три секретных ключа:
   * `HOST` — IP-адрес вашего VPS.
   * `USERNAME` — имя пользователя (обычно `root`).
   * `SSH_KEY` — ваш приватный SSH-ключ для беспарольного входа.
3. В корне проекта создайте папку `.github/workflows/` и файл `deploy.yml`:

```yaml
name: Deploy to VPS

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Deploy via SSH
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.HOST }}
          username: ${{ secrets.USERNAME }}
          key: ${{ secrets.SSH_KEY }}
          script: |
            cd /root/project
            git pull origin main
            docker-compose up -d --build
```

Теперь, как только вы напишете `git push origin main` на своем компьютере, GitHub Actions самостоятельно подключится к вашему серверу, стянет обновленный код и мгновенно перезапустит Docker-контейнеры!
