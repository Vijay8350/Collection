#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# OptionForge — one-shot EC2 provisioning script (Ubuntu 22.04 / 24.04).
#
# Installs Node 20, PostgreSQL, Redis, nginx, certbot, PM2; creates the DB;
# builds the app; starts it under PM2; configures nginx + HTTPS.
#
# Run it TWICE:
#   1st run  → installs system packages + DB, then creates a blank .env and stops
#              so you can paste your secrets.
#   edit     → fill in optionforge/.env (API keys, DEEPSEEK_API_KEY, etc.)
#   2nd run  → builds, starts PM2, configures nginx + Let's Encrypt.
#
# Usage:
#   chmod +x deploy/setup.sh
#   ./deploy/setup.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ===== EDIT THESE =====================================================
DOMAIN="app.yourdomain.com"             # subdomain pointed at this EC2's Elastic IP
DB_PASSWORD="CHANGE_ME_STRONG"          # must match the password in your .env DATABASE_URL
LETSENCRYPT_EMAIL="you@yourdomain.com"  # for cert expiry notices
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"  # project root (auto-detected)
# =====================================================================

log() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }

# ── Phase 1: system packages (idempotent) ────────────────────────────
log "Updating apt and installing system packages"
sudo apt-get update -y
sudo apt-get upgrade -y

if ! command -v node >/dev/null || [[ "$(node -v)" != v20* ]]; then
  log "Installing Node.js 20 LTS"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

sudo apt-get install -y postgresql postgresql-contrib redis-server nginx \
  certbot python3-certbot-nginx git build-essential

command -v pm2 >/dev/null || sudo npm install -g pm2

# ── 2 GB swap (skip if RAM >= 4 GB or swap already on) ───────────────
if [[ ! -f /swapfile ]] && [[ "$(free -m | awk '/Mem:/{print $2}')" -lt 4000 ]]; then
  log "Creating 2 GB swap"
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

# ── Phase 2: PostgreSQL role + database (idempotent) ─────────────────
log "Ensuring PostgreSQL role and database exist"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='optionforge'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE USER optionforge WITH PASSWORD '${DB_PASSWORD}';"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='optionforge'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE optionforge OWNER optionforge;"

sudo systemctl enable --now postgresql redis-server

# ── Phase 3: .env gate ───────────────────────────────────────────────
cd "$APP_DIR"
if [[ ! -f .env ]]; then
  cp .env.example .env
  cat <<EOF

\033[1;33m──────────────────────────────────────────────────────────────\033[0m
.env was just created from .env.example.

EDIT IT NOW:  nano "$APP_DIR/.env"

At minimum set:
  SHOPIFY_API_KEY, SHOPIFY_API_SECRET   (from Partner dashboard)
  SHOPIFY_APP_URL=https://${DOMAIN}
  DATABASE_URL=postgresql://optionforge:${DB_PASSWORD}@localhost:5432/optionforge?schema=public
  DEEPSEEK_API_KEY
  SHOP_TOKEN_ENCRYPTION_KEY   (run: openssl rand -hex 32)
  BILLING_TEST=true           (false only when charging for real)

Then re-run:  ./deploy/setup.sh
\033[1;33m──────────────────────────────────────────────────────────────\033[0m
EOF
  exit 0
fi

# ── Phase 4: build + migrate + start ─────────────────────────────────
log "Installing dependencies (npm ci)"
npm ci

log "Applying database migrations"
npm run setup            # prisma generate && prisma migrate deploy

log "Seeding starter templates (safe to ignore if already seeded)"
npm run prisma -- db seed || true

log "Building the app"
npm run build

log "Starting / reloading PM2 processes"
pm2 start ecosystem.config.cjs || pm2 reload ecosystem.config.cjs
pm2 save
# Configure PM2 to start on boot (prints a command only the first time):
pm2 startup systemd -u "$USER" --hp "$HOME" | grep -E '^sudo ' | bash || true

# ── Phase 5: nginx reverse proxy ─────────────────────────────────────
log "Writing nginx config for ${DOMAIN}"
sudo tee /etc/nginx/sites-available/optionforge >/dev/null <<NGINX
server {
    listen 80;
    server_name ${DOMAIN};
    client_max_body_size 110M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/optionforge /etc/nginx/sites-enabled/optionforge
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# ── Phase 6: HTTPS via Let's Encrypt ─────────────────────────────────
log "Requesting Let's Encrypt certificate for ${DOMAIN}"
if sudo certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${LETSENCRYPT_EMAIL}" --redirect; then
  log "HTTPS is live: https://${DOMAIN}"
else
  cat <<EOF

\033[1;33mcertbot failed — usually because DNS isn't pointing here yet.\033[0m
Check:  dig +short ${DOMAIN}   (should return this server's Elastic IP)
Once it does, re-run:  sudo certbot --nginx -d ${DOMAIN}
EOF
fi

log "Done. pm2 status / pm2 logs to inspect. Next: run 'npm run deploy' from your LOCAL machine to push extensions + app config."
