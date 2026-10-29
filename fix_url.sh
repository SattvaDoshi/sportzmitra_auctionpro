#!/usr/bin/env bash
set -e

FRONTEND_DOMAIN="auction2.sportzmitrastore.com"
API_DOMAIN="api2.auction.sportzmitrastore.com"
BACKEND_PORT="5001"

echo "=== STEP 1: Detecting Frontend Dist ==="
if [ -d "/var/www/sportzmitra_uat/frontend/dist" ]; then
  FRONTEND_DIST="/var/www/sportzmitra_uat/frontend/dist"
elif [ -d "/var/www/sportzmitra_auctionpro/frontend/dist" ]; then
  FRONTEND_DIST="/var/www/sportzmitra_auctionpro/frontend/dist"
else
  FRONTEND_DIST="/var/www/sportzmitra_uat/frontend/dist"
  mkdir -p "$FRONTEND_DIST"
fi
echo "Using Frontend Root: $FRONTEND_DIST"

echo "=== STEP 2: Writing Nginx Site Config ==="
cat > /etc/nginx/sites-available/sportzmitra-uat <<NGINX
upstream sportzmitra_uat_api {
    server 127.0.0.1:${BACKEND_PORT};
    keepalive 32;
}

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

echo "=== STEP 3: Enabling in Nginx ==="
mkdir -p /etc/nginx/sites-enabled
ln -sf /etc/nginx/sites-available/sportzmitra-uat /etc/nginx/sites-enabled/sportzmitra-uat

# Check if sites-enabled is included in nginx.conf, fallback to conf.d if not
if ! nginx -T 2>/dev/null | grep -q "${FRONTEND_DOMAIN}"; then
  echo "Linking to conf.d as well..."
  ln -sf /etc/nginx/sites-available/sportzmitra-uat /etc/nginx/conf.d/sportzmitra-uat.conf
fi

echo "=== STEP 4: Testing Nginx Configuration ==="
nginx -t

echo "=== STEP 5: Restarting Nginx Service ==="
systemctl restart nginx

echo "=== STEP 6: PM2 UAT Status ==="
pm2 status sportzmitra-auction-uat || true

echo ""
echo "=== SUCCESS! ==="
echo "Check in browser: https://${FRONTEND_DOMAIN}"
