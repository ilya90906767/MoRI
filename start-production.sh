#!/bin/bash
set -euo pipefail

if [ -z "${SSH_PASSWORD:-}" ] || [ -z "${SERVER:-}" ]; then
    echo "Set SSH_PASSWORD and SERVER first"
    exit 1
fi

sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=no "root@$SERVER" << 'EOF'

apt-get update
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
npm install pm2 -g
npm install -g yarn

rm -rf /root/website
git clone git@github.com:ilya90906767/MoRI.git /root/website
cd /root/website

cd /root/website/frontend
rm -rf node_modules yarn.lock package-lock.json
yarn install --frozen-lockfile

yarn build

mkdir -p /var/www/html
rm -rf /var/www/html/*
[ -d "dist" ] && cp -r dist/* /var/www/html/

cd /root/website
pm2 stop backend || true
apt-get install -y python3.10-venv
python3.10 -m venv .venv
source .venv/bin/activate
python3.10 -m pip install --upgrade pip
python3.10 -m pip install -r requirements.txt

cd backend
pm2 start ecosystem.config.js || pm2 start backend

EOF
