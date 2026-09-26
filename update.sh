#!/usr/bin/env bash
# =============================================================================
# SportzMitra AuctionPro — Lightweight Update Script
# Run this on the VPS after pushing code changes to GitHub.
#
# Usage:  sudo bash /var/www/sportzmitra_auctionpro/update.sh
# =============================================================================
set -euo pipefail

REPO_DIR="/var/www/sportzmitra_auctionpro"
APP_DIR="/var/www/sportzmitra"

GREEN="\033[0;32m"; YELLOW="\033[1;33m"; RED="\033[0;31m"; RESET="\033[0m"; BOLD="\033[1m"
info()    { echo -e "${BOLD}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }

echo -e "${BOLD}${GREEN}"
echo "  ┌──────────────────────────────────────┐"
echo "  │   SportzMitra — Updating Live App    │"
echo "  └──────────────────────────────────────┘"
echo -e "${RESET}"

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
info "Syncing backend files..."
rsync -a --exclude='node_modules' --exclude='.env' --exclude='logs' \
  "$REPO_DIR/backend/" "$APP_DIR/backend/"
success "Backend files synced."

info "Installing backend dependencies (if any changed)..."
cd "$APP_DIR/backend"
npm install --omit=dev
success "Backend dependencies up to date."

# Run migrations in case schema changed
info "Running database migrations..."
npm run migrate 2>/dev/null && success "Migrations complete." \
  || warn "Migration runner not found or no new migrations — skipping."

# =============================================================================
# 3. Sync & rebuild frontend
# =============================================================================
info "Syncing frontend files..."
rsync -a --exclude='node_modules' --exclude='dist' \
  "$REPO_DIR/frontend/" "$APP_DIR/frontend/"
success "Frontend files synced."

info "Installing frontend dependencies (if any changed)..."
cd "$APP_DIR/frontend"
npm install
success "Frontend dependencies up to date."

info "Building frontend for production..."
npm run build
success "Frontend build complete."

# =============================================================================
# 4. Reload backend (zero-downtime)
# =============================================================================
info "Reloading PM2 workers (zero-downtime)..."
pm2 reload sportzmitra-auction
success "PM2 reloaded."

# =============================================================================
# 5. Health check
# =============================================================================
sleep 2
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:5000/health" || echo "000")
if [[ "$HTTP_STATUS" == "200" ]]; then
  success "Backend health check PASSED"
else
  warn "Backend health check returned HTTP $HTTP_STATUS — check with: pm2 logs sportzmitra-auction"
fi

echo ""
echo -e "${BOLD}${GREEN}Update complete!${RESET}"
echo "  Frontend: https://auction.sportzmitrastore.com"
echo "  API:      https://api.auction.sportzmitrastore.com"
echo ""
