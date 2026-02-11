# Используем официальный образ Node.js как базовый
FROM node:18-alpine

# Создаем рабочую директорию
WORKDIR /usr/src/app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Копируем public и server в рабочую директорию
COPY public ./public

RUN mkdir /usr/src/app/server

COPY server/uploads /usr/src/app/server/uploads

COPY server/server.js /usr/src/app/server/server.js

RUN mkdir /usr/src/app/data

COPY data/db.json /usr/src/app/data/db.json

# Устанавливаем зависимости
RUN npm install

# Копируем остальные файлы проекта
# COPY . .

# Определяем переменные окружения
ENV PORT=3000

# Открываем порт
EXPOSE 3000

# Команда запуска
CMD ["npm", "start"]
