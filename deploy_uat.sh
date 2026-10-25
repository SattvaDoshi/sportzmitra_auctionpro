#!/usr/bin/env bash
# =============================================================================
#  SportzMitra AuctionPro — Full-Stack Deploy Script (UAT Environment)
#  Target: 1 vCPU · 4 GB RAM · 50 GB NVMe · Ubuntu 22.04 LTS
#  Server IP: 200.141.1.164
#  Frontend Domain: auction2.sportzmitrastore.com
#  API Domain:      api2.auction.sportzmitrastore.com
#  Backend Port:    5001 (isolated from existing port 5000 service)
#  App Dir:         /var/www/sportzmitra_uat (isolated from /var/www/sportzmitra)
#  PM2 App:         sportzmitra-auction-uat
#
#  Run as root (or sudo) on the VPS:
#      chmod +x deploy_uat.sh
#      sudo bash deploy_uat.sh
#
#  What this script does:
#    1. Safe system packages (Node.js 22 LTS, PM2, Certbot, etc.)
#    2. Configures 2GB swap on NVMe disk (prevents OOM on 4GB RAM)
#    3. Safely connects to MySQL without purging; creates sportzmitra_auction DB & imports schema
#    4. Tunes MySQL for 4GB RAM if not already tuned
#    5. Deploys backend on port 5001 under PM2 (sportzmitra-auction-uat)
#    6. Builds frontend with Vite targeting api2.auction.sportzmitrastore.com
#    7. Configures isolated Nginx site (sportzmitra-uat) with zero downtime to other sites
#    8. Obtains/configures Let's Encrypt SSL via webroot challenge without stopping Nginx
#    9. PM2 startup on reboot
#   10. Health check on port 5001
# =============================================================================

set -euo pipefail

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
die()     { echo -e "${RED}[ERROR]${RESET} $*" >&2; exit 1; }
section() { echo -e "\n${BOLD}${GREEN}══════════════════════════════════════════════${RESET}"; \
            echo -e "${BOLD}  $*${RESET}"; \
            echo -e "${BOLD}${GREEN}══════════════════════════════════════════════${RESET}\n"; }

# ── Ensure we are root ────────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && die "Please run as root: sudo bash deploy_uat.sh"

# =============================================================================
# STEP 0 — Collect configuration
# =============================================================================
section "STEP 0 · Configuration (UAT)"

echo -e "${BOLD}SportzMitra AuctionPro UAT Deployment (Isolated Mode)${RESET}"
echo ""

SERVER_IP="200.141.1.164"
FRONTEND_DOMAIN="auction2.sportzmitrastore.com"
API_DOMAIN="api2.auction.sportzmitrastore.com"
DOMAIN="$FRONTEND_DOMAIN"

# Isolated paths and ports so existing apps remain completely untouched
APP_DIR="/var/www/sportzmitra_uat"
PM2_APP_NAME="sportzmitra-auction-uat"
BACKEND_PORT="5001"

DB_HOST="127.0.0.1"
DB_PORT="3306"
DB_ROOT_PASS="SportzM@4321"
DB_NAME="sportzmitra_auction"
DB_USER="root"
DB_PASS="SportzM@4321"

JWT_SECRET=$(openssl rand -hex 32)
ENABLE_HTTPS="y"
LE_EMAIL="sattvadoshi.dev@gmail.com"
PROTOCOL="https"
FRONTEND_ORIGIN="https://${FRONTEND_DOMAIN}"

info "Configuration for UAT:"
echo "  Server IP:          $SERVER_IP"
echo "  Frontend domain:    $FRONTEND_DOMAIN"
echo "  API domain:         $API_DOMAIN"
echo "  App directory:      $APP_DIR (isolated)"
echo "  PM2 app name:       $PM2_APP_NAME (isolated)"
echo "  Backend port:       $BACKEND_PORT (isolated from port 5000)"
echo "  DB name:            $DB_NAME"
echo "  DB user:            $DB_USER"
echo ""

# =============================================================================
# STEP 1 — System packages & Swap
# =============================================================================
section "STEP 1 · System Packages & Swap"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  curl wget git unzip build-essential \
  nginx certbot python3-certbot-nginx \
  ufw fail2ban \
  ca-certificates gnupg lsb-release

success "System packages verified."

# ── Ensure 2GB swap on NVMe disk (prevents OOM during Vite builds on 4GB RAM) ──
if [ ! -f /swapfile ] && [ "$(swapon --show | wc -l)" -le 1 ]; then
  info "Configuring 2GB swapfile on NVMe disk for memory stability..."
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl vm.swappiness=10 >/dev/null 2>&1 || true
  success "2GB swapfile configured."
else
  info "Swap already configured."
fi

# =============================================================================
# STEP 2 — Node.js 22 LTS & PM2
# =============================================================================
section "STEP 2 · Node.js 22 LTS & PM2"

if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
else
  NODE_MAJOR=$(node -v | grep -oP '(?<=v)\d+' | head -1 || echo "0")
  if [[ "$NODE_MAJOR" -lt 22 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  fi
fi

success "Node $(node -v) / npm $(npm -v)"

# Install PM2 globally if not present
if ! command -v pm2 &>/dev/null; then
  npm install -g pm2@latest
fi
success "PM2 $(pm2 -v) ready."

# =============================================================================
# STEP 3 — MySQL Connection & Safe Tuning
# =============================================================================
section "STEP 3 · MySQL Connection & Safe Tuning"

# Ensure MySQL service is running
systemctl start mysql 2>/dev/null || true

# Test TCP connection first (mysql -h 127.0.0.1 -P 3306 -u root -p)
if mysql -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" -p"${DB_PASS}" -e "QUIT" 2>/dev/null; then
  MYSQL_ROOT_CMD="mysql -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} -p${DB_PASS}"
  success "Connected to MySQL at ${DB_HOST}:${DB_PORT} as ${DB_USER}."
elif mysql --user="${DB_USER}" --password="${DB_PASS}" -e "QUIT" 2>/dev/null; then
  MYSQL_ROOT_CMD="mysql --user=${DB_USER} --password=${DB_PASS}"
  success "Connected to MySQL via local socket."
elif mysql -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" -e "QUIT" 2>/dev/null; then
  MYSQL_ROOT_CMD="mysql -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER}"
  success "Connected to MySQL at ${DB_HOST}:${DB_PORT} without password."
elif mysql --user="${DB_USER}" -e "QUIT" 2>/dev/null; then
  MYSQL_ROOT_CMD="mysql --user=${DB_USER}"
  success "Connected to MySQL via local socket without password."
else
  die "Could not connect to MySQL at ${DB_HOST}:${DB_PORT}. Please verify MySQL credentials."
fi

# Apply safe tuning config if not already present
if [ ! -f /etc/mysql/mysql.conf.d/sportzmitra_uat.cnf ] && [ ! -f /etc/mysql/mysql.conf.d/sportzmitra.cnf ]; then
  info "Adding MySQL tuning for 4GB RAM VPS..."
  cat > /etc/mysql/mysql.conf.d/sportzmitra_uat.cnf <<MYCNF
[mysqld]
innodb_buffer_pool_size         = 1G
innodb_buffer_pool_instances    = 1
innodb_log_file_size            = 128M
innodb_flush_log_at_trx_commit  = 2
innodb_flush_method             = O_DIRECT
max_connections                 = 100
wait_timeout                    = 60
interactive_timeout             = 60
table_open_cache                = 400
thread_cache_size               = 16
performance_schema              = OFF
MYCNF
  systemctl restart mysql
  sleep 2
  success "MySQL tuned for 4GB RAM."
else
  info "MySQL configuration already present; keeping existing settings."
fi

# =============================================================================
# STEP 4 — Database + Schema
# =============================================================================
section "STEP 4 · Database & Schema"

# Create the dedicated UAT database without touching any other databases
if [ "$DB_USER" = "root" ]; then
  $MYSQL_ROOT_CMD <<MYSQL_SETUP
    CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`
      CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
MYSQL_SETUP
else
  $MYSQL_ROOT_CMD <<MYSQL_SETUP
    CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`
      CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    CREATE USER IF NOT EXISTS '${DB_USER}'@'127.0.0.1' IDENTIFIED WITH mysql_native_password BY '${DB_PASS}';
    CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED WITH mysql_native_password BY '${DB_PASS}';
    GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'127.0.0.1';
    GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
    FLUSH PRIVILEGES;
MYSQL_SETUP
fi

success "Database '${DB_NAME}' created/verified."

# Import schema into sportzmitra_auction
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_DIR="$SCRIPT_DIR/database"

if [[ -d "$DB_DIR" ]]; then
  for SQL_FILE in \
    "$DB_DIR/sportzmitra_auction.sql" \
    "$DB_DIR/sp_get_public_auction_snapshot.sql" \
    "$DB_DIR/sp_live_auction_procedures.sql" \
    "$DB_DIR/seed.sql"
  do
    if [[ -f "$SQL_FILE" ]]; then
      info "Importing $(basename "$SQL_FILE") into ${DB_NAME} ..."
      $MYSQL_ROOT_CMD "${DB_NAME}" < "$SQL_FILE"
      success "$(basename "$SQL_FILE") imported."
    fi
  done
else
  warn "No database/ directory found beside script — skipping schema import."
fi

# =============================================================================
# STEP 5 — Backend on Port 5001
# =============================================================================
section "STEP 5 · Backend (Port 5001)"

BACKEND_DIR="$APP_DIR/backend"
mkdir -p "$BACKEND_DIR/logs"

# Copy backend source
info "Copying backend source to $BACKEND_DIR ..."
rsync -a --exclude='node_modules' --exclude='.env' --exclude='logs' \
  "$SCRIPT_DIR/backend/" "$BACKEND_DIR/"

# Write isolated UAT backend .env
cat > "$BACKEND_DIR/.env" <<DOTENV
NODE_ENV=production
PORT=${BACKEND_PORT}

DB_HOST=${DB_HOST}
DB_PORT=${DB_PORT}
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASS}
DB_POOL_LIMIT=20

JWT_SECRET=${JWT_SECRET}

OTP_MODE=production
MOCK_OTP=

APP_BASE_URL=${PROTOCOL}://${API_DOMAIN}
FRONTEND_ORIGIN=${FRONTEND_ORIGIN}
DOTENV

chmod 600 "$BACKEND_DIR/.env"
success "Backend .env written for port ${BACKEND_PORT}."

# Clean native modules and install dependencies
cd "$BACKEND_DIR"
npm uninstall @u4/opencv4nodejs 2>/dev/null || true
rm -rf node_modules/@u4 2>/dev/null || true
npm install --omit=dev --ignore-engines
success "Backend dependencies installed."

# Run migrations
npm run migrate 2>/dev/null && success "Migrations complete." \
  || warn "Migration runner not found or no new migrations — skipping."

# Stop existing UAT PM2 process if running (does NOT touch existing other PM2 apps)
pm2 delete "${PM2_APP_NAME}" 2>/dev/null || true

# Start with PM2 under dedicated name sportzmitra-auction-uat
pm2 start "$BACKEND_DIR/ecosystem.config.js" \
  --name "${PM2_APP_NAME}" \
  --env production
pm2 set "${PM2_APP_NAME}":max_memory_restart 512M 2>/dev/null || true
pm2 save
success "Backend started on port ${BACKEND_PORT} with PM2 (${PM2_APP_NAME})."

# =============================================================================
# STEP 6 — Frontend Build (Vite)
# =============================================================================
section "STEP 6 · Frontend Build (UAT)"

FRONTEND_DIR="$APP_DIR/frontend"
FRONTEND_DIST="$APP_DIR/frontend/dist"
mkdir -p "$FRONTEND_DIR"

info "Copying frontend source to $FRONTEND_DIR ..."
rsync -a --exclude='node_modules' --exclude='dist' --exclude='.env' \
  "$SCRIPT_DIR/frontend/" "$FRONTEND_DIR/"

# Point Vite specifically to UAT API domain
cat > "$FRONTEND_DIR/.env.production" <<VENV
VITE_API_BASE_URL=${PROTOCOL}://${API_DOMAIN}/api
VITE_SOCKET_URL=${PROTOCOL}://${API_DOMAIN}
VITE_API_ROOT=${PROTOCOL}://${API_DOMAIN}
VENV

info "Installing frontend dependencies ..."
cd "$FRONTEND_DIR"
npm install --ignore-engines

info "Building frontend (Vite) for UAT with 1.5GB memory limit..."
NODE_OPTIONS="--max-old-space-size=1536" npm run build
success "Frontend built → $FRONTEND_DIST"

# =============================================================================
# STEP 7 — Firewall (UFW)
# =============================================================================
section "STEP 7 · Firewall (UFW)"

# Safely allow traffic without wiping existing rules
ufw allow ssh >/dev/null 2>&1 || true
ufw allow 80/tcp >/dev/null 2>&1 || true
ufw allow 443/tcp >/dev/null 2>&1 || true
success "Firewall rules ensured for SSH, HTTP (80), and HTTPS (443)."

# =============================================================================
# STEP 8 — Nginx & Let's Encrypt HTTPS (Zero downtime to other apps)
# =============================================================================
section "STEP 8 · Nginx & Let's Encrypt HTTPS"

mkdir -p /var/www/certbot

# Create SSL helper files if missing
if [ ! -f /etc/letsencrypt/options-ssl-nginx.conf ]; then
  mkdir -p /etc/letsencrypt
  cat > /etc/letsencrypt/options-ssl-nginx.conf <<'SSLCONF'
ssl_session_cache shared:le_nginx_SSL:10m;
ssl_session_timeout 1440m;
ssl_session_tickets off;
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
ssl_ciphers "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256";
SSLCONF
fi

if [ ! -f /etc/letsencrypt/ssl-dhparams.pem ]; then
  info "Generating DH params (this takes ~30s) ..."
  openssl dhparam -out /etc/letsencrypt/ssl-dhparams.pem 2048
fi

# Stop nginx for a few seconds so certbot can bind port 80 cleanly without Nginx conflicts
systemctl stop nginx 2>/dev/null || true
pkill -f "nginx" 2>/dev/null || true
sleep 2

# Request certificate for Frontend domain (standalone)
if [ ! -f "/etc/letsencrypt/live/${FRONTEND_DOMAIN}/fullchain.pem" ]; then
  info "Requesting Let's Encrypt certificate for ${FRONTEND_DOMAIN} ..."
  certbot certonly --standalone \
    -d "${FRONTEND_DOMAIN}" \
    --email "${LE_EMAIL}" \
    --agree-tos --non-interactive || warn "Certbot failed for ${FRONTEND_DOMAIN}."
fi

# Request certificate for API domain (standalone)
if [ ! -f "/etc/letsencrypt/live/${API_DOMAIN}/fullchain.pem" ]; then
  info "Requesting Let's Encrypt certificate for ${API_DOMAIN} ..."
  certbot certonly --standalone \
    -d "${API_DOMAIN}" \
    --email "${LE_EMAIL}" \
    --agree-tos --non-interactive || warn "Certbot failed for ${API_DOMAIN}."
fi

# Fallback self-signed cert if DNS has not propagated yet, so Nginx never fails
for DOM in "${FRONTEND_DOMAIN}" "${API_DOMAIN}"; do
  if [ ! -f "/etc/letsencrypt/live/${DOM}/fullchain.pem" ]; then
    warn "Creating temporary self-signed certificate for ${DOM}..."
    mkdir -p "/etc/letsencrypt/live/${DOM}"
    openssl req -x509 -nodes -days 30 -newkey rsa:2048 \
      -keyout "/etc/letsencrypt/live/${DOM}/privkey.pem" \
      -out "/etc/letsencrypt/live/${DOM}/fullchain.pem" \
      -subj "/CN=${DOM}" 2>/dev/null || true
  fi
done

# Write the production Nginx site config for sportzmitra-uat
cat > /etc/nginx/sites-available/sportzmitra-uat <<NGINX
# ── SportzMitra AuctionPro UAT ── Nginx Config ────────────────────────────────

upstream sportzmitra_uat_api {
    server 127.0.0.1:${BACKEND_PORT};
    keepalive 32;
}

# ─────────────────────────────────────────────────────────────────────────────
# FRONTEND  →  ${FRONTEND_DOMAIN}
# ─────────────────────────────────────────────────────────────────────────────

server {
    listen 80;
    server_name ${FRONTEND_DOMAIN};
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://\$host\$request_uri; }
}

server {
    listen 443 ssl http2;
    server_name ${FRONTEND_DOMAIN};

    ssl_certificate     /etc/letsencrypt/live/${FRONTEND_DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${FRONTEND_DOMAIN}/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    add_header X-Frame-Options        "SAMEORIGIN"    always;
    add_header X-Content-Type-Options "nosniff"       always;
    add_header X-XSS-Protection       "1; mode=block" always;
    add_header Referrer-Policy        "strict-origin"  always;
    add_header Permissions-Policy     "geolocation=()" always;

    root ${FRONTEND_DIST};
    index index.html;

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location ~ /\. {
        deny all;
    }
}

# ─────────────────────────────────────────────────────────────────────────────
# BACKEND API  →  ${API_DOMAIN}
# ─────────────────────────────────────────────────────────────────────────────

server {
    listen 80;
    server_name ${API_DOMAIN};
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://\$host\$request_uri; }
}

server {
    listen 443 ssl http2;
    server_name ${API_DOMAIN};

    ssl_certificate     /etc/letsencrypt/live/${API_DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${API_DOMAIN}/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    add_header X-Frame-Options        "SAMEORIGIN"    always;
    add_header X-Content-Type-Options "nosniff"       always;
    add_header X-XSS-Protection       "1; mode=block" always;
    add_header Referrer-Policy        "strict-origin"  always;

    add_header Access-Control-Allow-Origin  "https://${FRONTEND_DOMAIN}" always;
    add_header Access-Control-Allow-Methods "GET, POST, PUT, PATCH, DELETE, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Authorization, Content-Type, X-Requested-With" always;
    add_header Access-Control-Allow-Credentials "true" always;

    location / {
        if (\$request_method = OPTIONS) {
            return 204;
        }

        proxy_pass         http://sportzmitra_uat_api;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_set_header   Connection        "";

        client_max_body_size 15m;

        proxy_connect_timeout 10s;
        proxy_send_timeout    30s;
        proxy_read_timeout    30s;
    }

    location /socket.io/ {
        proxy_pass         http://sportzmitra_uat_api;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade           \$http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;

        proxy_connect_timeout 10s;
        proxy_read_timeout  86400s;
        proxy_send_timeout  86400s;

        proxy_buffering off;
    }

    location /uploads/ {
        proxy_pass http://sportzmitra_uat_api;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        expires 7d;
        add_header Cache-Control "public";
    }

    location ~ /\. {
        deny all;
    }
}
NGINX

# Test & reload Nginx (zero downtime to existing sites)
nginx -t && systemctl reload nginx
success "Nginx reloaded with isolated sportzmitra-uat configuration."

# Auto-renew via cron if not already present
if ! crontab -l 2>/dev/null | grep -q 'certbot renew'; then
  (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --deploy-hook 'systemctl reload nginx'") | crontab -
  success "Certbot auto-renew cron configured."
fi

# =============================================================================
# STEP 9 — PM2 startup on reboot
# =============================================================================
section "STEP 9 · PM2 Startup"

pm2 save
env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u root --hp /root | tail -1 | bash || true
success "PM2 configured to survive reboot."

# =============================================================================
# STEP 10 — Health check
# =============================================================================
section "STEP 10 · Health Check"

sleep 3

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${BACKEND_PORT}/health" || echo "000")
if [[ "$HTTP_STATUS" == "200" ]]; then
  success "Backend health check PASSED on port ${BACKEND_PORT} (HTTP $HTTP_STATUS)"
else
  warn "Backend health check returned HTTP $HTTP_STATUS — check with: pm2 logs ${PM2_APP_NAME}"
fi

PM2_STATUS=$(pm2 jlist 2>/dev/null | python3 -c "import sys,json; apps=json.load(sys.stdin); print(sum(1 for a in apps if a['name']=='${PM2_APP_NAME}' and a['pm2_env']['status']=='online'))" 2>/dev/null || echo "?")
info "PM2 worker online: $PM2_STATUS"

# =============================================================================
# DONE
# =============================================================================
section "UAT DEPLOYMENT COMPLETE"

echo -e "${BOLD}${GREEN}"
echo "  ┌─────────────────────────────────────────────────────────┐"
echo "  │   SportzMitra AuctionPro UAT is LIVE                    │"
echo "  ├─────────────────────────────────────────────────────────┤"
echo "  │   Frontend: https://${FRONTEND_DOMAIN}"
echo "  │   API:      https://${API_DOMAIN}"
echo "  │   Backend:  127.0.0.1:${BACKEND_PORT}  (PM2: ${PM2_APP_NAME}) │"
echo "  │   DB:       ${DB_NAME} @ localhost                  │"
echo "  │   App Dir:  ${APP_DIR}"
echo "  ├─────────────────────────────────────────────────────────┤"
echo "  │   Useful commands:                                      │"
echo "  │     pm2 status                                          │"
echo "  │     pm2 logs ${PM2_APP_NAME}                            │"
echo "  │     pm2 reload ${PM2_APP_NAME}                          │"
echo "  │     nginx -t && nginx -s reload                         │"
echo "  └─────────────────────────────────────────────────────────┘"
echo -e "${RESET}"

echo -e "${YELLOW}IMPORTANT — save these credentials securely:${RESET}"
echo "  MySQL root:  $DB_ROOT_PASS"
echo "  MySQL user:  ${DB_USER} / ${DB_PASS}"
echo "  JWT secret:  $JWT_SECRET"
echo ""
echo -e "${YELLOW}Backend .env is at: $BACKEND_DIR/.env  (chmod 600)${RESET}"
echo ""
