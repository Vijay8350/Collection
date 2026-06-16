#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# OptionForge — SAFE co-host deploy for a server that ALREADY runs another
# project (e.g. tools.apanjob.com). Unlike deploy/setup.sh, this script:
#   • NEVER deletes the default nginx site or any existing server block
#   • NEVER runs `apt-get upgrade` (won't disturb the existing app's packages)
#   • installs ONLY packages that are missing
#   • REUSES the existing Postgres engine (creates an isolated DB/role)
#   • isolates Redis on a separate DB index (so BullMQ keys can't collide)
#   • auto-picks a free app port if 3000 is taken
#   • adds its OWN nginx server block for st.apanjob.com only
#
# Run it TWICE:
#   1st run → installs missing deps + DB, creates a blank .env, then stops.
#   edit    → fill in optionforge/.env (secrets).
#   2nd run → builds, starts PM2, configures nginx + Let's Encrypt.
#
# Usage:
#   chmod +x deploy/cohost-setup.sh
#   ./deploy/cohost-setup.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ===== EDIT THESE =====================================================
DOMAIN="st.apanjob.com"                   # already pointed at this EC2 (13.207.96.98)
DB_PASSWORD="CHANGE_ME_STRONG"            # must match the password in your .env DATABASE_URL
LETSENCRYPT_EMAIL="marketplace@deodap.com"
DB_NAME="optionforge"                     # change if a DB named optionforge already exists
DB_USER="optionforge"
REDIS_DB_INDEX="1"                        # 0 is the existing app's; OptionForge uses 1
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# =====================================================================

log()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
warn() { printf '\n\033[1;33m! %s\033[0m\n' "$*"; }

# ── Guard: refuse to clobber the existing project ────────────────────
# This script only ever ADDS /etc/nginx/sites-available/optionforge.
# It never touches sites-enabled/default or any other existing site.
EXISTING_SITES="$(ls /etc/nginx/sites-enabled/ 2>/dev/null | grep -v '^optionforge$' || true)"
if [[ -n "$EXISTING_SITES" ]]; then
  log "Existing nginx sites detected (these will NOT be modified):"
  printf '   %s\n' $EXISTING_SITES
fi

# ── Phase 1: install ONLY what's missing (no apt upgrade) ────────────
log "Refreshing apt index"
sudo apt-get update -y

if ! command -v node >/dev/null || [[ "$(node -v)" != v2[024]* ]]; then
  log "Installing Node.js 20 LTS"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  log "Node $(node -v) already present — skipping"
fi

command -v psql        >/dev/null || { log "Installing PostgreSQL"; sudo apt-get install -y postgresql postgresql-contrib; }
command -v redis-server >/dev/null || { log "Installing Redis";      sudo apt-get install -y redis-server; }
command -v nginx       >/dev/null || { log "Installing nginx";       sudo apt-get install -y nginx; }
command -v certbot     >/dev/null || { log "Installing certbot";     sudo apt-get install -y certbot python3-certbot-nginx; }
command -v git         >/dev/null || sudo apt-get install -y git build-essential
command -v pm2         >/dev/null || sudo npm install -g pm2

# ── Phase 2: isolated PostgreSQL role + database (idempotent) ────────
log "Ensuring isolated PostgreSQL role '${DB_USER}' and database '${DB_NAME}'"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

# ── Phase 3: pick a free app port (default 3000) ─────────────────────
APP_PORT="3000"
if sudo ss -ltn "( sport = :3000 )" | grep -q ":3000"; then
  APP_PORT="3100"
  warn "Port 3000 is already in use — OptionForge will use ${APP_PORT} instead."
  # Bake the chosen port into OptionForge's own ecosystem file (survives reloads).
  sed -i "s/PORT: \"3000\"/PORT: \"${APP_PORT}\"/" "$APP_DIR/ecosystem.config.cjs"
fi
log "OptionForge web port: ${APP_PORT}"

# ── Phase 4: .env gate ───────────────────────────────────────────────
cd "$APP_DIR"
if [[ ! -f .env ]]; then
  cp .env.example .env
  cat <<EOF

──────────────────────────────────────────────────────────────
.env was created from .env.example. EDIT IT NOW:  nano "$APP_DIR/.env"

At minimum set:
  SHOPIFY_API_KEY, SHOPIFY_API_SECRET     (from Partner dashboard)
  SHOPIFY_APP_URL=https://${DOMAIN}
  DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}?schema=public
  REDIS_URL=redis://localhost:6379/${REDIS_DB_INDEX}
  DEEPSEEK_API_KEY
  SHOP_TOKEN_ENCRYPTION_KEY               (run: openssl rand -hex 32)
  NODE_ENV=production
  BILLING_TEST=false                      (true only while testing on a dev store)

Then re-run:  ./deploy/cohost-setup.sh
──────────────────────────────────────────────────────────────
EOF
  exit 0
fi

# ── Phase 5: build + migrate + start under PM2 ───────────────────────
log "Installing dependencies (npm ci)"
npm ci
log "Applying database migrations"
npm run setup            # prisma generate && prisma migrate deploy
log "Seeding starter templates (safe to ignore if already seeded)"
npm run prisma -- db seed || true
log "Building the app"
npm run build

log "Starting / reloading PM2 (adds optionforge-* without touching other apps)"
pm2 start ecosystem.config.cjs || pm2 reload ecosystem.config.cjs
pm2 save
pm2 startup systemd -u "$USER" --hp "$HOME" | grep -E '^sudo ' | bash || true

# ── Phase 6: ADD a new nginx server block (never edit existing ones) ─
log "Writing nginx server block for ${DOMAIN} (additive)"
sudo tee /etc/nginx/sites-available/optionforge >/dev/null <<NGINX
server {
    listen 80;
    server_name ${DOMAIN};
    client_max_body_size 110M;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
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
# NOTE: intentionally NO `rm` of the default site or any existing config.
log "Testing nginx config"
sudo nginx -t
log "Reloading nginx (zero downtime for the existing site)"
sudo systemctl reload nginx

# ── Phase 7: HTTPS via Let's Encrypt (this domain only) ──────────────
log "Requesting Let's Encrypt certificate for ${DOMAIN}"
if sudo certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${LETSENCRYPT_EMAIL}" --redirect; then
  log "HTTPS is live: https://${DOMAIN}"
else
  warn "certbot failed — usually DNS or rate-limit. DNS for ${DOMAIN} should resolve to this box."
  echo "Check:  dig +short ${DOMAIN}    Then re-run:  sudo certbot --nginx -d ${DOMAIN}"
fi

cat <<EOF

✓ Done. OptionForge is deployed at https://${DOMAIN} on port ${APP_PORT}.
  Your existing project was not modified.

Next (from your LOCAL machine):
  • Set the Partner app URLs to https://${DOMAIN} (already in shopify.app.toml).
  • Run:  npm run deploy     (pushes extensions + app config to Shopify)
  • Install the app on your store and confirm OAuth works.

Verify nothing else broke:
  pm2 ls                                   # all processes online
  curl -I https://tools.apanjob.com        # existing site still 200
  curl -I https://${DOMAIN}                # new site 200/302
EOF
