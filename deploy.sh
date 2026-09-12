#!/usr/bin/env bash
# =============================================================================
#  SportzMitra AuctionPro — Full-Stack Deploy Script
#  Target: Hostinger KVM 4 · Ubuntu 22.04 LTS
#
#  Run as root (or sudo) on a FRESH VPS:
#      chmod +x deploy.sh
#      sudo bash deploy.sh
#
#  What this script does:
#    1. System update + essential packages
#    2. Install Node.js 20 LTS
#    3. Install & harden MySQL 8
#    4. Create database + user + import schema + stored procedures
#    5. Configure backend (.env, PM2, 4 cluster workers)
#    6. Build & deploy frontend (Vite → static files)
#    7. Install & configure Nginx (reverse proxy + static serving)
#    8. Install Certbot for free HTTPS (optional — prompted)
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
[[ $EUID -ne 0 ]] && die "Please run as root: sudo bash deploy.sh"

# =============================================================================
# STEP 0 — Collect configuration
# =============================================================================
section "STEP 0 · Configuration"

echo -e "${BOLD}SportzMitra AuctionPro Deployment${RESET}"
echo "Press ENTER to accept the [default] shown in brackets."
echo ""

read -rp "Your server's public IP address [auto-detect]: " SERVER_IP
[[ -z "$SERVER_IP" ]] && SERVER_IP=$(curl -s https://api.ipify.org || curl -s https://checkip.amazonaws.com | tr -d '\n')
info "Server IP: $SERVER_IP"

read -rp "Your domain name (e.g. auction.yourdomain.com) [Leave blank to use IP]: " DOMAIN
if [[ -z "$DOMAIN" ]]; then
  DOMAIN="$SERVER_IP"
  info "No domain provided. Using IP: $DOMAIN"
fi

read -rp "App deploy directory [/var/www/sportzmitra]: " APP_DIR
APP_DIR="${APP_DIR:-/var/www/sportzmitra}"

read -rp "MySQL root password (new, will be set now): " -s DB_ROOT_PASS; echo
[[ -z "$DB_ROOT_PASS" ]] && die "MySQL root password is required."

read -rp "MySQL app database name [sportzmitra_auction]: " DB_NAME
DB_NAME="${DB_NAME:-sportzmitra_auction}"

read -rp "MySQL app user name [sportzmitra]: " DB_USER
DB_USER="${DB_USER:-sportzmitra}"

read -rp "MySQL app user password: " -s DB_PASS; echo
[[ -z "$DB_PASS" ]] && die "MySQL app password is required."

read -rp "Backend port [5000]: " BACKEND_PORT
BACKEND_PORT="${BACKEND_PORT:-5000}"

read -rp "JWT secret (leave blank to auto-generate): " JWT_SECRET
[[ -z "$JWT_SECRET" ]] && JWT_SECRET=$(openssl rand -hex 32)

read -rp "Enable HTTPS via Let's Encrypt Certbot? (y/n) [y]: " ENABLE_HTTPS
ENABLE_HTTPS="${ENABLE_HTTPS:-y}"

if [[ "$DOMAIN" == "$SERVER_IP" ]]; then
  ENABLE_HTTPS="n"
  info "Using IP address, forcing HTTPS to 'n'."
  PROTOCOL="http"
else
  PROTOCOL=$([[ "$ENABLE_HTTPS" == "y" ]] && echo "https" || echo "http")
fi

read -rp "Frontend origin URL (e.g. $PROTOCOL://$DOMAIN) [$PROTOCOL://$DOMAIN]: " FRONTEND_ORIGIN
FRONTEND_ORIGIN="${FRONTEND_ORIGIN:-$PROTOCOL://$DOMAIN}"

read -rp "Your email for Let's Encrypt notifications: " LE_EMAIL

echo ""
info "Configuration summary:"
echo "  Domain:           $DOMAIN"
echo "  Server IP:        $SERVER_IP"
echo "  App directory:    $APP_DIR"
echo "  DB name:          $DB_NAME"
echo "  DB user:          $DB_USER"
echo "  Backend port:     $BACKEND_PORT"
echo "  HTTPS:            $ENABLE_HTTPS"
echo ""
read -rp "Proceed with deployment? (y/n): " CONFIRM
[[ "$CONFIRM" != "y" ]] && { info "Aborted."; exit 0; }

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

# =============================================================================
# STEP 2 — Node.js 20 LTS
# =============================================================================
section "STEP 2 · Node.js 20 LTS"

if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
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

if ! command -v mysql &>/dev/null; then
  apt-get install -y mysql-server
fi

# Secure MySQL and set root password
mysql --user=root <<MYSQL_SECURE
  ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${DB_ROOT_PASS}';
  DELETE FROM mysql.user WHERE User='';
  DELETE FROM mysql.user WHERE User='root' AND Host NOT IN ('localhost','127.0.0.1','::1');
  DROP DATABASE IF EXISTS test;
  DELETE FROM mysql.db WHERE Db='test' OR Db='test\\_%';
  FLUSH PRIVILEGES;
MYSQL_SECURE

success "MySQL root secured."

# Tune MySQL for 16 GB RAM VPS
cat > /etc/mysql/mysql.conf.d/sportzmitra.cnf <<MYCNF
[mysqld]
# Memory — use ~6 GB for InnoDB buffer pool (leave rest for OS + Node)
innodb_buffer_pool_size         = 6G
innodb_buffer_pool_instances    = 4
innodb_log_file_size            = 512M
innodb_flush_log_at_trx_commit  = 2
innodb_flush_method             = O_DIRECT

# Connections — 4 PM2 workers × 10 conns = 40 app + headroom
max_connections                 = 200
wait_timeout                    = 60
interactive_timeout             = 60

# Query cache (disabled in MySQL 8 by default — good)
# Performance schema
performance_schema              = OFF

# Slow query log for debugging
slow_query_log                  = 1
slow_query_log_file             = /var/log/mysql/slow.log
long_query_time                 = 2
MYCNF

systemctl restart mysql
success "MySQL tuned and restarted."

# =============================================================================
# STEP 4 — Database + Schema
# =============================================================================
section "STEP 4 · Database & Schema"

# Create database and user
mysql --user=root --password="${DB_ROOT_PASS}" <<MYSQL_SETUP
  CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost'
    IDENTIFIED WITH mysql_native_password BY '${DB_PASS}';
  GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
  FLUSH PRIVILEGES;
MYSQL_SETUP

success "Database '${DB_NAME}' and user '${DB_USER}' created."

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
  warn "No database/ directory found next to deploy.sh — skipping schema import."
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

# Write production .env
cat > "$BACKEND_DIR/.env" <<DOTENV
NODE_ENV=production
PORT=${BACKEND_PORT}

DB_HOST=localhost
DB_PORT=3306
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASS}
DB_POOL_LIMIT=40

JWT_SECRET=${JWT_SECRET}

OTP_MODE=production
MOCK_OTP=

APP_BASE_URL=${PROTOCOL}://${DOMAIN}
FRONTEND_ORIGIN=${FRONTEND_ORIGIN}
DOTENV

chmod 600 "$BACKEND_DIR/.env"
success "Backend .env written (mode 600)."

# Install Node modules
info "Installing backend dependencies ..."
cd "$BACKEND_DIR"
npm install --omit=dev
success "Backend npm install complete."

# Stop existing PM2 app if running
pm2 delete sportzmitra-auction 2>/dev/null || true

# Start with PM2 (production mode, 4 workers via ecosystem.config.js)
pm2 start "$BACKEND_DIR/ecosystem.config.js" --env production
success "Backend started with PM2 (4 workers)."

# =============================================================================
# STEP 6 — Frontend (Vite build)
# =============================================================================
section "STEP 6 · Frontend Build"

FRONTEND_DIR="$APP_DIR/frontend"
FRONTEND_DIST="$APP_DIR/frontend/dist"
mkdir -p "$FRONTEND_DIR"

info "Copying frontend source to $FRONTEND_DIR ..."
rsync -a --exclude='node_modules' --exclude='dist' --exclude='.env' \
  "$SCRIPT_DIR/frontend/" "$FRONTEND_DIR/"

# Write production .env for Vite
cat > "$FRONTEND_DIR/.env.production" <<VENV
VITE_API_BASE_URL=${PROTOCOL}://${DOMAIN}/api
VITE_SOCKET_URL=${PROTOCOL}://${DOMAIN}
VITE_API_ROOT=${PROTOCOL}://${DOMAIN}
VENV

info "Installing frontend dependencies ..."
cd "$FRONTEND_DIR"
npm install

info "Building frontend (Vite) ..."
npm run build

success "Frontend built → $FRONTEND_DIST"

# =============================================================================
# STEP 7 — Nginx
# =============================================================================
section "STEP 7 · Nginx"

# Remove default site
rm -f /etc/nginx/sites-enabled/default

cat > /etc/nginx/sites-available/sportzmitra <<NGINX
# ── SportzMitra AuctionPro ── Nginx Config ────────────────────────────────────

# Upstream — PM2 backend (single port, PM2 handles clustering internally)
upstream sportzmitra_api {
    server 127.0.0.1:${BACKEND_PORT};
    keepalive 32;
}

# HTTP → HTTPS redirect (Certbot will update this block)
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    # For Let's Encrypt ACME challenge
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

# HTTPS — main server block
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN};

    # TLS — managed by Certbot
    ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    # Security headers
    add_header X-Frame-Options           "SAMEORIGIN"           always;
    add_header X-Content-Type-Options    "nosniff"              always;
    add_header X-XSS-Protection          "1; mode=block"        always;
    add_header Referrer-Policy           "strict-origin"        always;
    add_header Permissions-Policy        "geolocation=()"       always;

    # ── Static frontend ────────────────────────────────────────────────────
    root ${FRONTEND_DIST};
    index index.html;

    # Cache hashed Vite assets aggressively (assets/ folder has content-hashed filenames)
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Uploaded player photos
    location /uploads/ {
        proxy_pass http://sportzmitra_api;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        expires 7d;
        add_header Cache-Control "public";
    }

    # ── API proxy ──────────────────────────────────────────────────────────
    location /api/ {
        proxy_pass         http://sportzmitra_api;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_set_header   Connection        "";

        # Larger body for file uploads
        client_max_body_size 15m;

        # Timeout tuning
        proxy_connect_timeout 10s;
        proxy_send_timeout    30s;
        proxy_read_timeout    30s;
    }

    # ── Socket.io ──────────────────────────────────────────────────────────
    location /socket.io/ {
        proxy_pass         http://sportzmitra_api;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade           \$http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;

        # WebSocket keep-alive
        proxy_read_timeout  86400s;
        proxy_send_timeout  86400s;
    }

    # ── SPA fallback — serve index.html for all unknown routes ─────────────
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Block hidden files
    location ~ /\. {
        deny all;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/sportzmitra /etc/nginx/sites-enabled/sportzmitra

# Tune global Nginx for high concurrency
cat > /etc/nginx/conf.d/performance.conf <<NGXPERF
# Worker processes match vCPU count
worker_processes auto;
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
    use epoll;
    multi_accept on;
}

http {
    sendfile           on;
    tcp_nopush         on;
    tcp_nodelay        on;
    keepalive_timeout  65;
    keepalive_requests 1000;
    types_hash_max_size 2048;

    # Gzip (backup — backend already compresses, Nginx handles static)
    gzip             on;
    gzip_vary        on;
    gzip_proxied     any;
    gzip_comp_level  4;
    gzip_types text/plain text/css application/json application/javascript
               text/xml application/xml application/xml+rss text/javascript
               image/svg+xml;

    # Rate limiting zones (shared memory — applies across all workers)
    limit_req_zone \$binary_remote_addr zone=api_public:10m rate=60r/m;
    limit_req_zone \$binary_remote_addr zone=api_auth:10m   rate=10r/m;

    # Hide Nginx version
    server_tokens off;
}
NGXPERF

# Test Nginx config (skip SSL check before cert exists)
nginx -t 2>&1 | grep -v "ssl" || true
success "Nginx configured."

# =============================================================================
# STEP 8 — HTTPS (Let's Encrypt)
# =============================================================================
section "STEP 8 · HTTPS (Let's Encrypt)"

# Create HTTP-only temp server block for ACME challenge (before cert exists)
cat > /etc/nginx/sites-available/sportzmitra-temp <<NGINXTMP
server {
    listen 80;
    server_name ${DOMAIN};
    root /var/www/certbot;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 200 "SportzMitra Deploy"; add_header Content-Type text/plain; }
}
NGINXTMP

mkdir -p /var/www/certbot
ln -sf /etc/nginx/sites-available/sportzmitra-temp /etc/nginx/sites-enabled/sportzmitra-temp
rm -f /etc/nginx/sites-enabled/sportzmitra
nginx -t && systemctl reload nginx

if [[ "$ENABLE_HTTPS" == "y" && -n "$LE_EMAIL" ]]; then
  info "Requesting Let's Encrypt certificate for ${DOMAIN} ..."
  certbot certonly --webroot -w /var/www/certbot \
    -d "${DOMAIN}" \
    --email "${LE_EMAIL}" \
    --agree-tos --non-interactive --quiet

  success "Certificate obtained for ${DOMAIN}."

  # Enable full HTTPS Nginx config
  rm -f /etc/nginx/sites-enabled/sportzmitra-temp
  ln -sf /etc/nginx/sites-available/sportzmitra /etc/nginx/sites-enabled/sportzmitra
  nginx -t && systemctl reload nginx
  success "Nginx reloaded with HTTPS."

  # Auto-renew via cron
  (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --deploy-hook 'systemctl reload nginx'") | crontab -
  success "Certbot auto-renew cron set (daily at 3 AM)."
else
  warn "Skipping HTTPS — switching to HTTP-only mode."
  # Use HTTP-only Nginx config
  cat > /etc/nginx/sites-available/sportzmitra-http <<NGINXHTTP
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} ${SERVER_IP};

    root ${FRONTEND_DIST};
    index index.html;

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location /api/ {
        proxy_pass         http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   Connection        "";
        client_max_body_size 15m;
    }

    location /socket.io/ {
        proxy_pass         http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host       \$host;
        proxy_read_timeout 86400s;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINXHTTP

  rm -f /etc/nginx/sites-enabled/sportzmitra-temp
  ln -sf /etc/nginx/sites-available/sportzmitra-http /etc/nginx/sites-enabled/sportzmitra
  nginx -t && systemctl reload nginx
fi

systemctl enable nginx
success "Nginx enabled."

# =============================================================================
# STEP 9 — Firewall (UFW)
# =============================================================================
section "STEP 9 · Firewall"

ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
# Do NOT expose 5000 publicly — only Nginx talks to it
ufw --force enable
success "UFW firewall configured (SSH + 80 + 443 open)."

# Harden fail2ban for SSH
systemctl enable fail2ban
systemctl start fail2ban
success "fail2ban enabled."

# =============================================================================
# STEP 10 — PM2 startup on reboot
# =============================================================================
section "STEP 10 · PM2 Startup"

pm2 save
env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u root --hp /root | tail -1 | bash || true
success "PM2 configured to start on boot."

# =============================================================================
# STEP 11 — Health check
# =============================================================================
section "STEP 11 · Health Check"

sleep 3  # give PM2 a moment to fully start

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${BACKEND_PORT}/health" || echo "000")
if [[ "$HTTP_STATUS" == "200" ]]; then
  success "Backend health check PASSED (HTTP $HTTP_STATUS)"
else
  warn "Backend health check returned HTTP $HTTP_STATUS — check logs with: pm2 logs sportzmitra-auction"
fi

PM2_STATUS=$(pm2 jlist 2>/dev/null | python3 -c "import sys,json; apps=json.load(sys.stdin); print(sum(1 for a in apps if a['name']=='sportzmitra-auction' and a['pm2_env']['status']=='online'))" 2>/dev/null || echo "?")
info "PM2 workers online: $PM2_STATUS / 4"

# =============================================================================
# DONE
# =============================================================================
section "DEPLOYMENT COMPLETE"

echo -e "${BOLD}${GREEN}"
echo "  ┌─────────────────────────────────────────────────────────┐"
echo "  │   SportzMitra AuctionPro is LIVE                        │"
echo "  ├─────────────────────────────────────────────────────────┤"
if [[ "$ENABLE_HTTPS" == "y" ]]; then
echo "  │   URL:      https://${DOMAIN}"
else
echo "  │   URL:      http://${DOMAIN}  (HTTP only)"
fi
echo "  │   Backend:  127.0.0.1:${BACKEND_PORT}  (PM2, 4 workers)       │"
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
