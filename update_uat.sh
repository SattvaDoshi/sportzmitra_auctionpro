#!/usr/bin/env bash
# =============================================================================
# SportzMitra AuctionPro — Lightweight Update Script (UAT Environment)
# Target: 1 vCPU · 4 GB RAM · 50 GB NVMe · Ubuntu 22.04 LTS
# Backend Port: 5001 (isolated from existing port 5000 service)
# PM2 App Name: sportzmitra-auction-uat
# App Directory: /var/www/sportzmitra_uat
#
# Usage:  sudo bash /var/www/sportzmitra_auctionpro/update_uat.sh
# =============================================================================
set -euo pipefail

if [ -d "/var/www/sportzmitra_auctionpro_uat" ]; then
  REPO_DIR="/var/www/sportzmitra_auctionpro_uat"
else
  REPO_DIR="/var/www/sportzmitra_auctionpro"
fi

APP_DIR="/var/www/sportzmitra_uat"
PM2_APP_NAME="sportzmitra-auction-uat"
BACKEND_PORT="5001"
FRONTEND_DOMAIN="auction2.sportzmitrastore.com"
API_DOMAIN="api2.auction.sportzmitrastore.com"

GREEN="\033[0;32m"; YELLOW="\033[1;33m"; RED="\033[0;31m"; RESET="\033[0m"; BOLD="\033[1m"
info()    { echo -e "${BOLD}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }

echo -e "${BOLD}${GREEN}"
echo "  ┌──────────────────────────────────────────────┐"
echo "  │   SportzMitra — Updating UAT App (Port 5001) │"
echo "  └──────────────────────────────────────────────┘"
echo -e "${RESET}"

# =============================================================================
# 0. Ensure Node.js 22 LTS is installed (fixes googleapis EBADENGINE warnings)
# =============================================================================
NODE_MAJOR=$(node -v 2>/dev/null | grep -oP '(?<=v)\d+' | head -1 || echo "0")
if [[ "$NODE_MAJOR" -lt 22 ]]; then
  info "Node.js v${NODE_MAJOR} detected — upgrading to Node.js 22 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
  npm install -g pm2@latest
  success "Node.js $(node -v) installed."
else
  success "Node.js $(node -v) — already on v22+, no upgrade needed."
fi

# =============================================================================
# 1. Pull latest code from GitHub
# =============================================================================
info "Pulling latest code from GitHub..."
cd "$REPO_DIR"
git pull origin main
success "Git pull complete."

# =============================================================================
# 2. Sync & update backend
# =============================================================================
info "Syncing backend files to $APP_DIR/backend..."
rsync -a --exclude='node_modules' --exclude='.env' --exclude='logs' \
  "$REPO_DIR/backend/" "$APP_DIR/backend/"
success "Backend files synced."

# Clean broken native module installs
info "Cleaning native module cache..."
cd "$APP_DIR/backend"
npm uninstall @u4/opencv4nodejs 2>/dev/null || true
rm -rf node_modules/@u4 2>/dev/null || true

info "Installing backend dependencies (if any changed)..."
npm install --omit=dev --ignore-engines
success "Backend dependencies up to date."

# Run migrations in case schema changed
info "Running database migrations..."
npm run migrate 2>/dev/null && success "Migrations complete." \
  || warn "Migration runner not found or no new migrations — skipping."

# =============================================================================
# 3. Sync & rebuild frontend (configured for UAT)
# =============================================================================
info "Syncing frontend files to $APP_DIR/frontend..."
rsync -a --exclude='node_modules' --exclude='dist' \
  "$REPO_DIR/frontend/" "$APP_DIR/frontend/"
success "Frontend files synced."

# Explicitly ensure UAT Vite environment endpoints
cat > "$APP_DIR/frontend/.env.production" <<VENV
VITE_API_BASE_URL=https://${API_DOMAIN}/api
VITE_SOCKET_URL=https://${API_DOMAIN}
VITE_API_ROOT=https://${API_DOMAIN}
VENV

info "Installing frontend dependencies (if any changed)..."
cd "$APP_DIR/frontend"
npm install --ignore-engines
success "Frontend dependencies up to date."

info "Building frontend for UAT production (memory constrained)..."
NODE_OPTIONS="--max-old-space-size=1536" npm run build
success "Frontend build complete."

# =============================================================================
# 4. Update PM2 memory limit & reload isolated app (zero-downtime)
# =============================================================================
info "Updating PM2 memory limit for ${PM2_APP_NAME} to 512M..."
pm2 set "${PM2_APP_NAME}":max_memory_restart 512M 2>/dev/null || true

info "Reloading PM2 process ${PM2_APP_NAME}..."
pm2 reload "${PM2_APP_NAME}" 2>/dev/null || pm2 start "$APP_DIR/backend/ecosystem.config.js" --name "${PM2_APP_NAME}" --env production
pm2 save
success "PM2 (${PM2_APP_NAME}) reloaded."

# =============================================================================
# 5. Health check on port 5001
# =============================================================================
sleep 2
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${BACKEND_PORT}/health" || echo "000")
if [[ "$HTTP_STATUS" == "200" ]]; then
  success "Backend health check PASSED on port ${BACKEND_PORT} (HTTP $HTTP_STATUS)"
else
  warn "Backend health check returned HTTP $HTTP_STATUS — check with: pm2 logs ${PM2_APP_NAME}"
fi

echo ""
echo -e "${BOLD}${GREEN}UAT Update complete!${RESET}"
echo "  Frontend: https://${FRONTEND_DOMAIN}"
echo "  API:      https://${API_DOMAIN}"
echo "  Backend:  127.0.0.1:${BACKEND_PORT} (PM2: ${PM2_APP_NAME})"
echo "  Node.js:  $(node -v)"
echo "  PM2:      $(pm2 -v)"
echo ""
