#!/bin/bash
set -euo pipefail

if [ -z "${SSH_PASSWORD:-}" ] || [ -z "${SERVER:-}" ]; then
    echo "Set SSH_PASSWORD and SERVER first"
    exit 1
fi

sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=no "root@$SERVER" << 'EOF'

cd /root/website
git pull

cd /root/website/frontend
rm -rf node_modules
yarn install --frozen-lockfile
yarn build

mkdir -p /var/www/html
rm -rf /var/www/html/*
[ -d "dist" ] && cp -r dist/* /var/www/html/

cd /root/website/backend
source /root/website/.venv/bin/activate
python3.10 -m pip install -r /root/website/requirements.txt
python3.10 /root/website/backend/manage.py migrate
python3.10 /root/website/backend/manage.py collectstatic --noinput || true

echo "Stopping processes on port 8000..."
sudo kill -9 $(sudo lsof -t -i :8000) 2>/dev/null || true
pkill -f gunicorn 2>/dev/null || true
pkill -f "manage.py runserver" 2>/dev/null || true
sleep 2

nohup gunicorn backend.wsgi:application --bind 0.0.0.0:8000 > /root/website/gunicorn.log 2>&1 &
sleep 3

if pgrep gunicorn > /dev/null; then
    echo "Gunicorn is running"
else
    echo "Gunicorn failed to start"
    exit 1
fi

EOF
