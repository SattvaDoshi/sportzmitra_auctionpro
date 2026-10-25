#!/usr/bin/env bash
# =============================================================================
#  SportzMitra AuctionPro — Full-Stack Deploy Script (UAT Environment)
#  Target: 1 vCPU · 4 GB RAM · 50 GB NVMe · Ubuntu 22.04 LTS
#  Server IP: 200.141.1.164
#  Frontend Domain: auction2.sportzmitrastore.com
#  API Domain:      api2.auction.sportzmitrastore.com
#
#  Run as root (or sudo) on a FRESH VPS:
#      chmod +x deploy_uat.sh
#      sudo bash deploy_uat.sh
#
#  What this script does:
#    1. System update + essential packages
#    2. Install Node.js 22 LTS + PM2
#    3. Install & harden MySQL 8 (database: sportzmitra_auction)
#    4. Create database + user + import schema + stored procedures
#    5. Configure backend (.env, PM2, single fork worker)
#    6. Build & deploy frontend (Vite → static files)
#    7. Install & configure Nginx (reverse proxy + static serving)
#    8. Install Certbot for HTTPS (auction2 & api2.auction)
#    9. PM2 startup on reboot
#   10. Final health-check
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

echo -e "${BOLD}SportzMitra AuctionPro UAT Deployment${RESET}"
echo ""

SERVER_IP="200.141.1.164"
FRONTEND_DOMAIN="auction2.sportzmitrastore.com"
API_DOMAIN="api2.auction.sportzmitrastore.com"
DOMAIN="$FRONTEND_DOMAIN"          # kept for backward-compat references
APP_DIR="/var/www/sportzmitra"
DB_ROOT_PASS="SportzM@4321"
DB_NAME="sportzmitra_auction"
DB_USER="root"
DB_PASS="SportzM@4321"
BACKEND_PORT="5000"
JWT_SECRET=$(openssl rand -hex 32)
ENABLE_HTTPS="y"
LE_EMAIL="sattvadoshi.dev@gmail.com"
PROTOCOL="https"
FRONTEND_ORIGIN="https://${FRONTEND_DOMAIN}"

info "Configuration for UAT:"
echo "  Server IP:          $SERVER_IP"
echo "  Frontend domain:    $FRONTEND_DOMAIN"
echo "  API domain:         $API_DOMAIN"
echo "  App directory:      $APP_DIR"
echo "  DB name:            $DB_NAME"
echo "  DB user:            $DB_USER"
echo "  Backend port:       $BACKEND_PORT"
echo "  HTTPS:              $ENABLE_HTTPS"
echo ""

# =============================================================================
# STEP 1 — System packages
# =============================================================================
section "STEP 1 · System Update & Packages"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
  curl wget git unzip build-essential \
  nginx certbot python3-certbot-nginx \
  ufw fail2ban \
  ca-certificates gnupg lsb-release

success "System packages installed."

# ── Ensure 2GB swap on NVMe disk (prevents OOM during Vite builds on 4GB RAM) ──
if [ ! -f /swapfile ] && [ "$(swapon --show | wc -l)" -le 1 ]; then
  info "Configuring 2GB swapfile on NVMe disk..."
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl vm.swappiness=10 >/dev/null 2>&1 || true
  success "2GB swapfile configured."
fi

# =============================================================================
# STEP 2 — Node.js 22 LTS
# =============================================================================
section "STEP 2 · Node.js 22 LTS"

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

NODE_VER=$(node -v)
NPM_VER=$(npm -v)
success "Node $NODE_VER / npm $NPM_VER"

# Install PM2 globally
npm install -g pm2@latest
success "PM2 $(pm2 -v) installed."

# =============================================================================
# STEP 3 — MySQL 8
# =============================================================================
section "STEP 3 · MySQL 8"

# ── Helper: is MySQL running and connectable? ─────────────────────────────────
mysql_connect_no_pass()  { mysql --user=root                         -e "QUIT" 2>/dev/null; }
mysql_connect_with_pass(){ mysql --user=root --password="${DB_ROOT_PASS}" -e "QUIT" 2>/dev/null; }

# ── Full reinstall if /var/lib/mysql is missing or empty ──────────────────────
if [ ! -d "/var/lib/mysql" ] || [ -z "$(ls -A /var/lib/mysql 2>/dev/null)" ]; then
  warn "/var/lib/mysql is missing/empty — doing a full MySQL reinstall..."
  apt-get purge -y --auto-remove mysql-server mysql-client mysql-common \
    mysql-server-core-* mysql-client-core-* 2>/dev/null || true
  rm -rf /etc/mysql /var/lib/mysql /var/log/mysql
  apt-get install -y mysql-server
  systemctl start mysql
  sleep 5
fi

# ── If mysql binary is missing, install it ───────────────────────────────────
if ! command -v mysql &>/dev/null; then
  apt-get install -y mysql-server
  systemctl start mysql
  sleep 5
fi

# ── Make sure the service is running ─────────────────────────────────────────
systemctl start mysql 2>/dev/null || true
sleep 3

# ── Determine how to connect as root ─────────────────────────────────────────
if mysql_connect_no_pass; then
  info "MySQL root: no-password login (fresh install)."
  MYSQL_ROOT_CMD="mysql --user=root"

elif mysql_connect_with_pass; then
  info "MySQL root: authenticated with the password."
  MYSQL_ROOT_CMD="mysql --user=root --password=${DB_ROOT_PASS}"

else
  # ── Nuclear option: Percona/MySQL is locked — full purge and clean reinstall ─
  warn "MySQL root: both logins failed (likely Percona with auth_socket)."
  warn "Purging existing MySQL/Percona installation and doing a clean reinstall..."

  systemctl stop mysql 2>/dev/null || true
  sleep 2
  pkill -9 mysqld      2>/dev/null || true
  pkill -9 mysqld_safe 2>/dev/null || true
  sleep 2

  # Purge everything MySQL/Percona related
  DEBIAN_FRONTEND=noninteractive apt-get purge -y \
    mysql-server mysql-client mysql-common \
    mysql-server-core-* mysql-client-core-* \
    percona-server-server percona-server-client percona-server-common \
    percona-server-server-8.0 2>/dev/null || true
  apt-get autoremove -y 2>/dev/null || true

  # Wipe all data dirs so the new install starts fresh
  rm -rf /etc/mysql /var/lib/mysql /var/log/mysql /var/run/mysqld

  # Install official MySQL 8 from Ubuntu repos fully non-interactively
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    -o Dpkg::Options::="--force-confnew" \
    mysql-server
  systemctl start mysql
  sleep 5

  if mysql --user=root -e "QUIT" 2>/dev/null; then
    MYSQL_ROOT_CMD="mysql --user=root"
    success "MySQL reinstalled clean — root login works!"
  else
    die "MySQL reinstall failed. Run 'journalctl -xeu mysql.service' on the server for details."
  fi
fi

# ── Set/confirm root password and harden ─────────────────────────────────────
$MYSQL_ROOT_CMD <<MYSQL_SECURE
  ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${DB_ROOT_PASS}';
  DELETE FROM mysql.user WHERE User='';
  DELETE FROM mysql.user WHERE User='root' AND Host NOT IN ('localhost','127.0.0.1','::1');
  DROP DATABASE IF EXISTS test;
  DELETE FROM mysql.db WHERE Db='test' OR Db='test\\_%';
  FLUSH PRIVILEGES;
MYSQL_SECURE

success "MySQL root secured."

# ── Tune MySQL for 1 vCPU / 4 GB RAM VPS ─────────────────────────────────────
mkdir -p /etc/mysql/mysql.conf.d
cat > /etc/mysql/mysql.conf.d/sportzmitra.cnf <<MYCNF
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
slow_query_log                  = 1
slow_query_log_file             = /var/log/mysql/slow.log
long_query_time                 = 2
MYCNF

systemctl restart mysql
sleep 3
success "MySQL tuned and restarted."

# =============================================================================
# STEP 4 — Database + Schema
# =============================================================================
section "STEP 4 · Database & Schema"

# Create database and user
if [ "$DB_USER" = "root" ]; then
  mysql --user=root --password="${DB_ROOT_PASS}" <<MYSQL_SETUP
    CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`
      CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO 'root'@'localhost';
    FLUSH PRIVILEGES;
MYSQL_SETUP
else
  mysql --user=root --password="${DB_ROOT_PASS}" <<MYSQL_SETUP
    CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`
      CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost'
      IDENTIFIED WITH mysql_native_password BY '${DB_PASS}';
    GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
    FLUSH PRIVILEGES;
MYSQL_SETUP
fi

success "Database '${DB_NAME}' configured for user '${DB_USER}'."

# Import schema (if SQL files exist beside the script)
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
      info "Importing $(basename "$SQL_FILE") ..."
      mysql --user="${DB_USER}" --password="${DB_PASS}" "${DB_NAME}" < "$SQL_FILE"
      success "$(basename "$SQL_FILE") imported."
    else
      warn "SQL file not found (skipped): $SQL_FILE"
    fi
  done
else
  warn "No database/ directory found next to deploy_uat.sh — skipping schema import."
  warn "You can import manually: mysql -u ${DB_USER} -p ${DB_NAME} < database/sportzmitra_auction.sql"
fi

# =============================================================================
# STEP 5 — Backend
# =============================================================================
section "STEP 5 · Backend"

BACKEND_DIR="$APP_DIR/backend"
mkdir -p "$BACKEND_DIR"

# Copy backend source
info "Copying backend source to $BACKEND_DIR ..."
rsync -a --exclude='node_modules' --exclude='.env' --exclude='logs' \
  "$SCRIPT_DIR/backend/" "$BACKEND_DIR/"

# Create logs directory
mkdir -p "$BACKEND_DIR/logs"

# Write production .env for backend
cat > "$BACKEND_DIR/.env" <<DOTENV
NODE_ENV=production
PORT=${BACKEND_PORT}

DB_HOST=localhost
DB_PORT=3306
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
success "Backend .env written (mode 600)."

# Install Node modules
info "Installing backend dependencies ..."
cd "$BACKEND_DIR"
npm install --omit=dev --ignore-engines
success "Backend npm install complete."

# Run migrations if any
info "Running database migrations..."
npm run migrate 2>/dev/null && success "Migrations complete." \
  || warn "Migration runner not found or no new migrations — skipping."

# Stop existing PM2 app if running
pm2 delete sportzmitra-auction 2>/dev/null || true

# Start with PM2
pm2 start "$BACKEND_DIR/ecosystem.config.js" --env production
success "Backend started with PM2."

# =============================================================================
# STEP 6 — Frontend (Vite build)
# =============================================================================
section "STEP 6 · Frontend Build (UAT)"

FRONTEND_DIR="$APP_DIR/frontend"
FRONTEND_DIST="$APP_DIR/frontend/dist"
mkdir -p "$FRONTEND_DIR"

info "Copying frontend source to $FRONTEND_DIR ..."
rsync -a --exclude='node_modules' --exclude='dist' --exclude='.env' \
  "$SCRIPT_DIR/frontend/" "$FRONTEND_DIR/"

# Write production .env for Vite targeting UAT domains
cat > "$FRONTEND_DIR/.env.production" <<VENV
VITE_API_BASE_URL=${PROTOCOL}://${API_DOMAIN}/api
VITE_SOCKET_URL=${PROTOCOL}://${API_DOMAIN}
VITE_API_ROOT=${PROTOCOL}://${API_DOMAIN}
VENV

info "Installing frontend dependencies ..."
cd "$FRONTEND_DIR"
npm install --ignore-engines

info "Building frontend (Vite) for UAT ..."
NODE_OPTIONS="--max-old-space-size=1536" npm run build

success "Frontend built → $FRONTEND_DIST"

# =============================================================================
# STEP 7 — Firewall (UFW)
# =============================================================================
section "STEP 7 · Firewall (UFW)"

ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
success "UFW firewall configured (SSH + 80 + 443 open)."

# Harden fail2ban for SSH
systemctl enable fail2ban
systemctl start fail2ban
success "fail2ban enabled."

# =============================================================================
# STEP 8 — Nginx & Let's Encrypt HTTPS
# =============================================================================
section "STEP 8 · Nginx & Let's Encrypt HTTPS"

# Remove default sites
rm -f /etc/nginx/sites-enabled/default
rm -f /etc/nginx/sites-enabled/sportzmitra
rm -f /etc/nginx/sites-enabled/sportzmitra-http
rm -f /etc/nginx/sites-enabled/sportzmitra-temp

# Standard tuned nginx.conf
cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak 2>/dev/null || true
cat > /etc/nginx/nginx.conf <<'MAINNGINX'
user www-data;
worker_processes auto;
pid /run/nginx.pid;
include /etc/nginx/modules-enabled/*.conf;

events {
    worker_connections 1024;
    multi_accept on;
}

http {
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    keepalive_requests 1000;
    types_hash_max_size 2048;
    server_tokens off;

    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 4;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml;

    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log;

    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
}
MAINNGINX

rm -f /etc/nginx/conf.d/performance.conf

# Stop nginx so certbot --standalone can bind to port 80
systemctl stop nginx 2>/dev/null || true
pkill -f "nginx" 2>/dev/null || true
sleep 2

# Request SSL for Frontend domain
if [ ! -f "/etc/letsencrypt/live/${FRONTEND_DOMAIN}/fullchain.pem" ]; then
  info "Requesting Let's Encrypt certificate for ${FRONTEND_DOMAIN} ..."
  certbot certonly --standalone \
    -d "${FRONTEND_DOMAIN}" \
    --email "${LE_EMAIL}" \
    --agree-tos --non-interactive || warn "Certbot failed for ${FRONTEND_DOMAIN}. Ensure DNS A record points to ${SERVER_IP}."
fi

# Request SSL for API domain
if [ ! -f "/etc/letsencrypt/live/${API_DOMAIN}/fullchain.pem" ]; then
  info "Requesting Let's Encrypt certificate for ${API_DOMAIN} ..."
  certbot certonly --standalone \
    -d "${API_DOMAIN}" \
    --email "${LE_EMAIL}" \
    --agree-tos --non-interactive || warn "Certbot failed for ${API_DOMAIN}. Ensure DNS A record points to ${SERVER_IP}."
fi

# Fallback: if either certificate is missing (e.g. pending DNS propagation), generate temporary self-signed cert so Nginx can start
for DOM in "${FRONTEND_DOMAIN}" "${API_DOMAIN}"; do
  if [ ! -f "/etc/letsencrypt/live/${DOM}/fullchain.pem" ]; then
    warn "Creating temporary self-signed certificate for ${DOM} so Nginx passes syntax check..."
    mkdir -p "/etc/letsencrypt/live/${DOM}"
    openssl req -x509 -nodes -days 30 -newkey rsa:2048 \
      -keyout "/etc/letsencrypt/live/${DOM}/privkey.pem" \
      -out "/etc/letsencrypt/live/${DOM}/fullchain.pem" \
      -subj "/CN=${DOM}" 2>/dev/null || true
  fi
done

# Create SSL helper files if missing
if [ ! -f /etc/letsencrypt/options-ssl-nginx.conf ]; then
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

# Write Nginx site configuration
cat > /etc/nginx/sites-available/sportzmitra <<NGINX
# ── SportzMitra AuctionPro UAT ── Nginx Config ────────────────────────────────

upstream sportzmitra_api {
    server 127.0.0.1:${BACKEND_PORT};
    keepalive 32;
}

# ─────────────────────────────────────────────────────────────────────────────
# FRONTEND  →  ${FRONTEND_DOMAIN}
# ─────────────────────────────────────────────────────────────────────────────

# HTTP → HTTPS redirect for frontend
server {
    listen 80;
    listen [::]:80;
    server_name ${FRONTEND_DOMAIN};
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://\$host\$request_uri; }
}

# HTTPS — frontend (serves the Vite SPA)
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
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

    # Aggressively cache hashed Vite assets
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA fallback
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Block hidden files
    location ~ /\. {
        deny all;
    }
}

# ─────────────────────────────────────────────────────────────────────────────
# BACKEND API  →  ${API_DOMAIN}
# ─────────────────────────────────────────────────────────────────────────────

# HTTP → HTTPS redirect for API
server {
    listen 80;
    listen [::]:80;
    server_name ${API_DOMAIN};
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://\$host\$request_uri; }
}

# HTTPS — API (proxies all traffic to PM2 backend on port ${BACKEND_PORT})
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${API_DOMAIN};

    ssl_certificate     /etc/letsencrypt/live/${API_DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${API_DOMAIN}/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    add_header X-Frame-Options        "SAMEORIGIN"    always;
    add_header X-Content-Type-Options "nosniff"       always;
    add_header X-XSS-Protection       "1; mode=block" always;
    add_header Referrer-Policy        "strict-origin"  always;

    # CORS — allow requests from the frontend domain
    add_header Access-Control-Allow-Origin  "https://${FRONTEND_DOMAIN}" always;
    add_header Access-Control-Allow-Methods "GET, POST, PUT, PATCH, DELETE, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Authorization, Content-Type, X-Requested-With" always;
    add_header Access-Control-Allow-Credentials "true" always;

    # ── API routes ─────────────────────────────────────────────────────────
    location / {
        if (\$request_method = OPTIONS) {
            return 204;
        }

        proxy_pass         http://sportzmitra_api;
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

    # ── Socket.io (WebSocket + polling) ──────────────────────────────────────
    location /socket.io/ {
        proxy_pass         http://sportzmitra_api;
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

    # ── Uploaded player photos ─────────────────────────────────────────────
    location /uploads/ {
        proxy_pass http://sportzmitra_api;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        expires 7d;
        add_header Cache-Control "public";
    }

    # Block hidden files
    location ~ /\. {
        deny all;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/sportzmitra /etc/nginx/sites-enabled/sportzmitra
nginx -t && systemctl restart nginx
success "Nginx started with configuration for UAT."

# Auto-renew via cron
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --deploy-hook 'systemctl reload nginx'") | crontab -
success "Certbot auto-renew cron set (daily at 3 AM)."

systemctl enable nginx
success "Nginx service enabled."

# =============================================================================
# STEP 9 — PM2 startup on reboot
# =============================================================================
section "STEP 9 · PM2 Startup"

pm2 save
env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u root --hp /root | tail -1 | bash || true
success "PM2 configured to start on boot."

# =============================================================================
# STEP 10 — Health check
# =============================================================================
section "STEP 10 · Health Check"

sleep 3

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${BACKEND_PORT}/health" || echo "000")
if [[ "$HTTP_STATUS" == "200" ]]; then
  success "Backend health check PASSED (HTTP $HTTP_STATUS)"
else
  warn "Backend health check returned HTTP $HTTP_STATUS — check logs with: pm2 logs sportzmitra-auction"
fi

PM2_STATUS=$(pm2 jlist 2>/dev/null | python3 -c "import sys,json; apps=json.load(sys.stdin); print(sum(1 for a in apps if a['name']=='sportzmitra-auction' and a['pm2_env']['status']=='online'))" 2>/dev/null || echo "?")
info "PM2 workers online: $PM2_STATUS"

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
echo "  │   Backend:  127.0.0.1:${BACKEND_PORT}  (PM2)                 │"
echo "  │   DB:       ${DB_NAME} @ localhost                  │"
echo "  ├─────────────────────────────────────────────────────────┤"
echo "  │   Useful commands:                                      │"
echo "  │     pm2 status                  — worker status         │"
echo "  │     pm2 monit                   — live CPU/RAM          │"
echo "  │     pm2 logs sportzmitra-auction — live logs            │"
echo "  │     pm2 reload sportzmitra-auction — zero-down reload   │"
echo "  │     nginx -t && nginx -s reload  — reload Nginx         │"
echo "  └─────────────────────────────────────────────────────────┘"
echo -e "${RESET}"

echo -e "${YELLOW}IMPORTANT — save these credentials securely:${RESET}"
echo "  MySQL root:  $DB_ROOT_PASS"
echo "  MySQL user:  ${DB_USER} / ${DB_PASS}"
echo "  JWT secret:  $JWT_SECRET"
echo ""
echo -e "${YELLOW}Backend .env is at: $BACKEND_DIR/.env  (chmod 600)${RESET}"
echo ""
