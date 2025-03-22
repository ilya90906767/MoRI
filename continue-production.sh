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

echo "from django.contrib.auth import get_user_model; User = get_user_model(); User.objects.create_superuser('admin', '', 'admin') if not User.objects.filter(username='admin').exists() else None" | python manage.py shell

# Завершение всех процессов на порту 8000
echo "Завершение процессов на порту 8000..."
sudo kill -9 $(sudo lsof -t -i :8000) 2>/dev/null || true
pkill -f gunicorn 2>/dev/null || true
pkill -f "manage.py runserver" 2>/dev/null || true

# Проверка, что порт 8000 свободен
if sudo lsof -i :8000; then
    echo "Ошибка: порт 8000 всё ещё занят."
    exit 1
else
    echo "Порт 8000 свободен."
fi
gunicorn backend.wsgi:application --bind 0.0.0.0:8000 --daemon

# Start backend with PM2
# pm2 start backend

EOF
