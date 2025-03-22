#!/bin/bash

# SSH connection and commands
sshpass -p "" ssh -o StrictHostKeyChecking=no root << 'EOF'

# Install required tools
apt-get update
apt-get install -y npm
npm install pm2 -g

# Clone repository
cd website
git pull

# Frontend build
cd frontend
yarn 
yarn build

# Deploy frontend
rm -rf /var/www/html/*
cp -r dist/* /var/www/html/

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
