#!/bin/bash

# SSH connection and commands
sshpass -p "" ssh -o StrictHostKeyChecking=no root << 'EOF'

# Install required tools


# Clone repository
cd website
git pull

# Установка зависимостей для фронтенда
cd /root/website/frontend
rm -rf node_modules yarn.lock package-lock.json # Очистка старых зависимостей
yarn install --frozen-lockfile # Установка зависимостей из yarn.lock

# Сборка фронтенда
yarn build

# Деплой фронтенда
mkdir -p /var/www/html # Создание директории, если её нет
rm -rf /var/www/html/* # Очистка старого содержимого
[ -d "dist" ] && cp -r dist/* /var/www/html/ # Копирование собранных файлов

# Backend setup
cd /root/website/backend
source /root/website/.venv/bin/activate
python3.10 -m pip install -r /root/website/requirements.txt
python3.10 /root/website/backend/manage.py makemigrations
python3.10 /root/website/backend/manage.py migrate
python3.10 /root/website/backend/manage.py runserver

gunicorn backend.wsgi:application --bind 0.0.0.0:8000 --daemon

# Start backend with PM2
# pm2 start backend

EOF
