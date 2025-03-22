#!/bin/bash
sshpass -p "" ssh -o StrictHostKeyChecking=no root << 'EOF'

# Install required tools
apt-get update
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
npm install pm2 -g
npm install -g yarn

# Install vite locally in the project
rm -rf /root/website
git clone git@gitlab.com:mori5235012/website.git /root/website
cd /root/website

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
cd ..
pm2 stop backend
apt-get install -y python3.10-venv
python3.10 -m venv .venv
source .venv/bin/activate
python3.10 -m pip install -r requirements.txt
python3.10 -m pip install --upgrade pip

# Start backend with PM2
cd backend
pm2 start backend

EOF
