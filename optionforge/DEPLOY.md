# Deploying OptionForge — EC2 + Hostinger domain + Shopify Partner (public app)

A single-box production setup: one EC2 instance runs the Remix app, the BullMQ
worker, PostgreSQL, and Redis behind nginx with a Let's Encrypt certificate. Your
Hostinger domain points at the instance; the Shopify Partner app points at your
domain.

> Use a **subdomain** for the app, e.g. `app.yourdomain.com`. The guide assumes that.

> **Shortcut:** steps 4–8 are automated by `deploy/setup.sh`. After you've done
> steps 1–3 (Partner app, EC2, DNS), edit the CONFIG block at the top of
> `deploy/setup.sh` (`DOMAIN`, `DB_PASSWORD`, `LETSENCRYPT_EMAIL`) and run it on the
> server — it installs everything, creates a blank `.env` for you to fill, then on
> a second run builds, starts PM2, and provisions nginx + HTTPS. The manual steps
> below explain what it does. Later code updates: `deploy/update.sh`.

---

## 0. What you need before starting

- A Shopify **Partner account** (partners.shopify.com) and a **development store**.
- AWS account (for EC2).
- A domain in **Hostinger**.
- **DeepSeek API key** (platform.deepseek.com) — required for AI Studio.
- Optional: **Cloudflare R2** keys (file uploads), Sentry/Axiom tokens.
- Shopify CLI on your **local machine**: `npm i -g @shopify/cli`.

---

## 1. Create the Shopify Partner app (get keys)

1. Partners dashboard → **Apps** → **Create app** → **Create app manually**.
2. Name it (e.g. OptionForge). You now have a **Client ID** and **Client secret**.
3. Leave the URLs as placeholders for now — you'll set them in step 8 once the
   domain + TLS are live.

Keep the Client ID / secret handy; they become `SHOPIFY_API_KEY` /
`SHOPIFY_API_SECRET` in `.env`.

---

## 2. Launch the EC2 instance

1. EC2 → **Launch instance**.
   - **AMI:** Ubuntu Server 24.04 LTS (or 22.04).
   - **Type:** `t3.small` (2 GB) minimum; `t3.medium` recommended (Vite build +
     Postgres + Redis on one box). 2 GB needs swap (step 4).
   - **Key pair:** create/download a `.pem` so you can SSH.
   - **Storage:** 30 GB gp3.
2. **Security group** inbound rules:
   - SSH `22` — **your IP only**.
   - HTTP `80` — `0.0.0.0/0`.
   - HTTPS `443` — `0.0.0.0/0`.
   - Do **not** open 5432 (Postgres) or 6379 (Redis) — they stay on localhost.
3. Allocate an **Elastic IP** and associate it with the instance (so the IP
   survives reboots — your DNS depends on it).

SSH in:
```bash
ssh -i /path/to/key.pem ubuntu@YOUR_ELASTIC_IP
```

---

## 3. Point the Hostinger domain at EC2

In Hostinger **hPanel → Domains → DNS / Nameservers → DNS Zone**:

| Type | Name  | Points to        | TTL  |
|------|-------|------------------|------|
| A    | `app` | `YOUR_ELASTIC_IP`| 3600 |

(Optionally also an A record for `@` if you want the apex to resolve.)

Wait for propagation (a few minutes to a couple hours). Verify:
```bash
dig +short app.yourdomain.com    # should return your Elastic IP
```

---

## 4. Install the stack on EC2

```bash
sudo apt update && sudo apt upgrade -y

# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PostgreSQL 16, Redis, nginx, certbot, git, build tools
sudo apt install -y postgresql postgresql-contrib redis-server nginx \
  certbot python3-certbot-nginx git build-essential

# PM2 process manager
sudo npm i -g pm2

# 2 GB swap (skip if instance has >=4 GB RAM) — keeps the build from OOM-killing
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Create the database and user:
```bash
sudo -u postgres psql <<'SQL'
CREATE USER optionforge WITH PASSWORD 'CHANGE_ME_STRONG';
CREATE DATABASE optionforge OWNER optionforge;
SQL
```
Redis runs on `redis://localhost:6379` out of the box. Confirm: `redis-cli ping` → `PONG`.

---

## 5. Get the code and configure `.env`

```bash
cd /home/ubuntu
git clone YOUR_REPO_URL optionforge      # or scp the project up
cd optionforge
npm ci                                    # installs deps incl. devDeps (needed to build + run the tsx worker)
```

Create the production `.env` (copy `.env.example` and fill in real values):
```bash
cp .env.example .env
nano .env
```
Set at minimum:
```
SHOPIFY_API_KEY=<Client ID from step 1>
SHOPIFY_API_SECRET=<Client secret from step 1>
SHOPIFY_APP_URL=https://app.yourdomain.com
SCOPES=read_products,write_products,read_product_listings,read_orders,read_all_orders,read_themes,write_themes,read_files,write_files,read_metaobject_definitions,write_metaobject_definitions,read_metaobjects,write_metaobjects,write_cart_transforms,read_translations,write_translations,read_locales,read_markets

DATABASE_URL="postgresql://optionforge:CHANGE_ME_STRONG@localhost:5432/optionforge?schema=public"
REDIS_URL="redis://localhost:6379"

DEEPSEEK_API_KEY=<your key>
DEEPSEEK_MODEL=deepseek-v3.2
LLM_PROVIDER=deepseek

# Billing: keep test mode ON until you've verified the flow on a dev store.
BILLING_TEST=true

# Generate a 32-byte hex key for access-token encryption:
#   openssl rand -hex 32
SHOP_TOKEN_ENCRYPTION_KEY=<output of openssl rand -hex 32>

# R2 (optional — leave blank to disable file uploads)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=optionforge-uploads
R2_PUBLIC_URL=

NODE_ENV=production
PORT=3000
```

> The app **degrades gracefully** without Redis/R2, but the worker (hidden-variant
> cleanup) needs `REDIS_URL`. Keep it set.

---

## 6. Migrate the database and build

```bash
npm run setup        # prisma generate && prisma migrate deploy
npm run prisma -- db seed   # optional: load the 3 starter templates
npm run build        # remix vite:build
```

---

## 7. Run the app + worker with PM2

```bash
# Web app (remix-serve listens on $PORT = 3000)
pm2 start npm --name optionforge-web -- run start

# Background worker
pm2 start npm --name optionforge-worker -- run worker

pm2 save
pm2 startup    # run the command it prints (sets PM2 to start on boot)
```
Check: `pm2 status` and `pm2 logs optionforge-web`. The app is now on
`http://localhost:3000` (not yet public).

---

## 8. nginx reverse proxy + HTTPS

Create the site config:
```bash
sudo nano /etc/nginx/sites-available/optionforge
```
```nginx
server {
    listen 80;
    server_name app.yourdomain.com;

    client_max_body_size 110M;   # file-upload option types (up to 100 MB Premium)

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```
Enable it and get the certificate:
```bash
sudo ln -s /etc/nginx/sites-available/optionforge /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# Let's Encrypt cert (auto-edits the nginx config for 443 + redirect)
sudo certbot --nginx -d app.yourdomain.com
```
Certbot auto-renews via a systemd timer. Visit `https://app.yourdomain.com` —
you should get a response from the app (a Shopify auth redirect is expected).

---

## 9. Push app config + extensions to Shopify

This is done **from your local machine** (where Shopify CLI is logged in), not the
server. In your local project copy:

1. Put your **Client ID** into `shopify.app.toml` (`client_id = "..."`) and set:
   ```toml
   application_url = "https://app.yourdomain.com"

   [app_proxy]
   url = "https://app.yourdomain.com/proxy"
   subpath = "optionforge"
   prefix = "apps"

   [auth]
   redirect_urls = [
     "https://app.yourdomain.com/auth/callback",
     "https://app.yourdomain.com/auth/shopify/callback",
     "https://app.yourdomain.com/api/auth/callback"
   ]
   ```
   (Leave the `[webhooks]` and `[access_scopes]` blocks as they are.)
2. Link and deploy:
   ```bash
   npm run config:link      # pick your Partner org + this app
   npm run deploy           # pushes app config, webhooks, Theme App Extension + Cart Transform Function
   ```

`npm run deploy` uploads the **storefront extensions** and registers the webhook
subscriptions and app-proxy/redirect config from the toml. Re-run it whenever you
change `shopify.app.toml` or the `extensions/` code.

---

## 10. Install on your dev store and smoke-test

1. Partner dashboard → your app → **Test on development store** → install.
2. OAuth should complete and land you in the embedded admin.
3. Verify the core flows:
   - **AI Studio** → generate an option set (confirms `DEEPSEEK_API_KEY`).
   - Create/assign an option set → open a product page on the store with the
     **App Embed** enabled (Theme editor → App embeds → OptionForge) → the widget
     fetches `https://app.yourdomain.com/apps/optionforge/options/<productId>`.
   - **Uninstall** the app → confirm the `app/uninstalled` webhook fired
     (`pm2 logs optionforge-worker` shows the hidden-variant cleanup job).

---

## 11. Deploying updates later

```bash
ssh ... ubuntu@EC2
cd /home/ubuntu/optionforge
git pull
npm ci
npm run setup          # apply any new migrations
npm run build
pm2 restart optionforge-web optionforge-worker
```
If you changed `shopify.app.toml` or `extensions/`, also run `npm run deploy`
from your local machine.

---

## 12. Before you can go *public* (App Store)

Listing a **public** app has gates beyond hosting — see `SHOPIFY_PRODUCT_OPTIONS_APP_BLUEPRINT.md` §18:

- **Billing** is wired to the Shopify Billing API (`app.settings.tsx` +
  `billing` config in `shopify.server.ts`): Pro/Premium/Enterprise, monthly +
  annual (20% off), 14-day trial, with a `app_subscriptions/update` webhook
  keeping `Shop.plan` in sync. **Test it on a dev store with `BILLING_TEST=true`,**
  then set `BILLING_TEST=false` to charge for real.
- **Mandatory compliance webhooks** (`customers/data_request`, `customers/redact`,
  `shop/redact`) are already declared — verify each returns 401 on bad HMAC.
- **Protected Customer Data** approval in the Partner dashboard if any option
  captures email/phone/name/address.
- Performance/Built-for-Shopify checks (admin LCP/CLS/INP, storefront Lighthouse).
- Privacy policy URL, listing copy, screenshots, demo video.

For private/single-merchant use you can stop at step 10 and install via the
Partner dashboard without App Store review.

---

## Production hardening (recommended)

- **Managed DB instead of local Postgres:** move to AWS RDS Postgres for backups/PITR;
  just repoint `DATABASE_URL`. (Blueprint §17 wants RPO ≤ 5 min.)
- **Backups:** if you keep Postgres on the box, add a nightly `pg_dump` to S3.
- **Secrets:** `.env` is fine for one box; consider AWS SSM Parameter Store later.
- **Firewall:** `sudo ufw allow 22,80,443/tcp && sudo ufw enable`.
- **Monitoring:** set `SENTRY_DSN` / `AXIOM_TOKEN` in `.env`.
```
