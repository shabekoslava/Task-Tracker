# Шаг 1: Сборка статического веб-сайта React/Vite
FROM node:20-alpine AS build

WORKDIR /app

# Копируем файлы зависимостей
COPY package*.json ./
RUN npm install

# Копируем код фронтенда и собираем его
COPY . .
RUN npm run build

# Шаг 2: Запуск легковесного сервера Nginx для раздачи собранного фронтенда
FROM nginx:stable-alpine

# Копируем собранный проект из предыдущего шага
COPY --from=build /app/dist /usr/share/nginx/html

# Копируем конфигурацию Nginx для поддержки React SPA маршрутизации
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
