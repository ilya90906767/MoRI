#!/bin/bash

# SSH connection and commands
sshpass -p "" ssh -o StrictHostKeyChecking=no root << 'EOF'

# Clone repository
git clone https://gitlab.com/mori5235012/website.git
cd website

# Frontend build
cd frontend
yarn install
yarn build

# Deploy frontend
rm -rf /var/www/html/*
cp -r dist/* /var/www/html/

# Backend setup
cd ..
python3.10 -m pip install -r requirements.txt

# Start backend with PM2
pm2 start backend

EOF
