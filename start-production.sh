#!/bin/bash
# ========================================================================
# Production Server Startup Script
# ========================================================================
# This script builds and starts both frontend and backend services
# for a production environment
#
# Usage:
#   ./start-production.sh [--rebuild] [--no-daemon]
#
# Options:
#   --rebuild: Rebuild the frontend and reinstall dependencies
#   --no-daemon: Run in foreground (don't use PM2)
# ========================================================================

set -e # Exit immediately if a command exits with a non-zero status

# Text colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
FRONTEND_DIR="./frontend"
BACKEND_DIR="./backend"
LOGS_DIR="./logs"
ENV_FILE=".env.production"
REBUILD=false
USE_PM2=true

# Parse command line arguments
for arg in "$@"; do
  case $arg in
    --rebuild)
      REBUILD=true
      shift
      ;;
    --no-daemon)
      USE_PM2=false
      shift
      ;;
    *)
      # Unknown option
      ;;
  esac
done

# Create logs directory if it doesn't exist
mkdir -p "$LOGS_DIR"

# Function to log messages
log() {
  local msg="[$(date +'%Y-%m-%d %H:%M:%S')] $1"
  echo -e "$msg"
  echo "$msg" >> "$LOGS_DIR/startup.log"
}

# Function to check if a command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Check for required dependencies
check_dependencies() {
  log "${BLUE}Checking dependencies...${NC}"
  
  if ! command_exists node; then
    log "${RED}Error: Node.js is not installed${NC}"
    log "${YELLOW}Please install Node.js v14+ before continuing${NC}"
    exit 1
  fi
  
  NODE_VERSION=$(node -v | cut -d 'v' -f 2)
  if [[ $(echo "$NODE_VERSION < 14" | bc -l) -eq 1 ]]; then
    log "${YELLOW}Warning: Node.js version $NODE_VERSION detected. Recommended: v14+${NC}"
  else
    log "${GREEN}Node.js version $NODE_VERSION detected${NC}"
  fi
  
  if ! command_exists npm; then
    log "${RED}Error: npm is not installed${NC}"
    exit 1
  fi
  
  if $USE_PM2 && ! command_exists pm2; then
    log "${YELLOW}PM2 is not installed. Installing...${NC}"
    npm install -g pm2
    if ! command_exists pm2; then
      log "${RED}Failed to install PM2. Please install manually: npm install -g pm2${NC}"
      exit 1
    fi
  fi
  
  log "${GREEN}All required dependencies are installed.${NC}"
}

# Load environment variables
load_env() {
  if [ -f "$ENV_FILE" ]; then
    log "${BLUE}Loading environment variables from $ENV_FILE${NC}"
    set -o allexport
    source "$ENV_FILE"
    set +o allexport
    log "${GREEN}Environment variables loaded${NC}"
  else
    log "${YELLOW}Warning: $ENV_FILE not found. Using default environment variables.${NC}"
    # Set default production environment variables
    export NODE_ENV=production
    export PORT=3000
  fi
}

# Build frontend
build_frontend() {
  if [ -d "$FRONTEND_DIR" ]; then
    log "${BLUE}Setting up frontend...${NC}"
    cd "$FRONTEND_DIR"
    
    if [ "$REBUILD" = true ]; then
      log "Installing frontend dependencies..."
      npm ci --production
    elif [ ! -d "node_modules" ]; then
      log "Frontend node_modules not found. Installing dependencies..."
      npm ci --production
    fi
    
    log "Building frontend for production..."
    npm run build
    
    if [ $? -eq 0 ]; then
      log "${GREEN}Frontend built successfully${NC}"
    else
      log "${RED}Frontend build failed${NC}"
      exit 1
    fi
    
    cd - > /dev/null
  else
    log "${RED}Error: Frontend directory not found at $FRONTEND_DIR${NC}"
    exit 1
  fi
}

# Setup and start backend
start_backend() {
  if [ -d "$BACKEND_DIR" ]; then
    log "${BLUE}Setting up backend...${NC}"
    cd "$BACKEND_DIR"
    
    if [ "$REBUILD" = true ]; then
      log "Installing backend dependencies..."
      npm ci --production
    elif [ ! -d "node_modules" ]; then
      log "Backend node_modules not found. Installing dependencies..."
      npm ci --production
    fi
    
    if [ "$USE_PM2" = true ]; then
      log "Starting backend with PM2..."
      pm2 start app.js --name "backend" --log "$LOGS_DIR/backend.log" --time
      log "${GREEN}Backend started with PM2${NC}"
    else
      log "Starting backend in foreground..."
      node app.js > "$LOGS_DIR/backend.log" 2>&1 &
      BACKEND_PID=$!
      log "${GREEN}Backend started with PID: $BACKEND_PID${NC}"
    fi
    
    cd - > /dev/null
  else
    log "${RED}Error: Backend directory not found at $BACKEND_DIR${NC}"
    exit 1
  fi
}

# Serve frontend
serve_frontend() {
  if [ -d "$FRONTEND_DIR/build" ] || [ -d "$FRONTEND_DIR/dist" ]; then
    log "${BLUE}Setting up frontend server...${NC}"
    
    # Determine build directory
    FRONTEND_BUILD_DIR="$FRONTEND_DIR/build"
    if [ ! -d "$FRONTEND_BUILD_DIR" ]; then
      FRONTEND_BUILD_DIR="$FRONTEND_DIR/dist"
    fi
    
    if command_exists nginx; then
      log "Nginx detected. Setting up Nginx configuration..."
      # Here you would generate or update Nginx config
      # This is a placeholder - you'll need to customize for your environment
      log "${YELLOW}Note: Please ensure Nginx is configured to serve from $FRONTEND_BUILD_DIR${NC}"
      log "${YELLOW}Check if Nginx is running with: systemctl status nginx${NC}"
    else
      log "Serving frontend with Node.js server..."
      
      cd "$FRONTEND_DIR"
      
      # Install serve if not available
      if ! command_exists serve && ! [ -f "node_modules/.bin/serve" ]; then
        log "Installing 'serve' package..."
        npm install serve --no-save
      fi
      
      if [ "$USE_PM2" = true ]; then
        log "Starting frontend with PM2..."
        pm2 start npm --name "frontend" -- run serve --log "$LOGS_DIR/frontend.log" --time
        log "${GREEN}Frontend server started with PM2${NC}"
      else
        log "Starting frontend server in foreground..."
        npx serve -s "$FRONTEND_BUILD_DIR" -l ${FRONTEND_PORT:-5000} > "$LOGS_DIR/frontend.log" 2>&1 &
        FRONTEND_PID=$!
        log "${GREEN}Frontend server started with PID: $FRONTEND_PID${NC}"
      fi
      
      cd - > /dev/null
    fi
  else
    log "${RED}Error: Frontend build directory not found. Did the build process complete?${NC}"
    exit 1
  fi
}

# Monitor services
monitor_services() {
  if [ "$USE_PM2" = true ]; then
    log "${BLUE}Services started and monitored by PM2${NC}"
    pm2 list
    log "${YELLOW}Monitor logs with: pm2 logs${NC}"
    log "${YELLOW}Stop services with: pm2 stop all${NC}"
  else
    log "${BLUE}Services started in background${NC}"
    log "${YELLOW}Backend PID: $BACKEND_PID, check logs at $LOGS_DIR/backend.log${NC}"
    log "${YELLOW}Frontend PID: $FRONTEND_PID, check logs at $LOGS_DIR/frontend.log${NC}"
    log "${YELLOW}Use 'kill $BACKEND_PID $FRONTEND_PID' to stop services${NC}"
    
    # Function to handle script exit
    cleanup() {
      log "${BLUE}Shutting down services...${NC}"
      [ -n "$BACKEND_PID" ] && kill $BACKEND_PID 2>/dev/null
      [ -n "$FRONTEND_PID" ] && kill $FRONTEND_PID 2>/dev/null
      log "${GREEN}All services stopped${NC}"
    }
    
    # Register cleanup function on script exit
    trap cleanup EXIT INT TERM
  fi
}

# Main execution
main() {
  log "${GREEN}=== Starting Production Environment ===${NC}"
  
  check_dependencies
  load_env
  build_frontend
  start_backend
  serve_frontend
  monitor_services
  
  log "${GREEN}=== Production Environment Successfully Started ===${NC}"
  log "${BLUE}Backend API available at: http://localhost:${PORT:-3000}${NC}"
  log "${BLUE}Frontend available at: http://localhost:${FRONTEND_PORT:-5000}${NC}"
}

main "$@" 