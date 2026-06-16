# Deploying OptionForge alongside an existing project (shared EC2 box)

This guide adds **OptionForge** to an EC2 server that **already runs another
project**, on its **own subdomain**, **without touching the existing app**. It is
the safe, additive alternative to `deploy/setup.sh` for a shared server.

> ⛔ **Do NOT run `deploy/setup.sh` on this box.** That script is written for a
> *fresh* server. It runs `sudo rm -f /etc/nginx/sites-enabled/default` and
> assumes it owns nginx/Postgres/Redis — on a shared box it can break your
> existing site. Use **`deploy/cohost-setup.sh`** (the safe, additive script) or
> the manual steps below.

> ✅ **Fast path:** `deploy/cohost-setup.sh` automates every step here safely for
> `st.apanjob.com` (installs only what's missing, never deletes the default site,
> reuses Postgres, isolates Redis on index 1, auto-picks a free port). Edit the
> `DB_PASSWORD` at the top, then run it **twice** (it stops after creating `.env`
> so you can paste secrets, then finishes on the second run). The manual steps
> below explain exactly what it does.

---

## Will deploying cause problems? — short answer

**Not if you deploy additively.** OptionForge needs five things from the box:
a Node process port, a Postgres database, a Redis namespace, an nginx server
block, and a TLS cert. Each can be **isolated** so the existing project is never
modified. Here is the isolation contract this guide enforces:

| Shared resource | Existing project | OptionForge (isolated)                         |
|-----------------|------------------|------------------------------------------------|
| App port        | whatever it uses | `3000` (or `3100` if `3000` is taken)          |
| nginx           | its own block(s) | **new** block `/etc/nginx/sites-available/optionforge` — existing blocks untouched, default site **kept** |
| PostgreSQL      | its own DB/user  | **new** DB + role `optionforge`                |
| Redis           | DB index `0`     | DB index `1` (`redis://localhost:6379/1`)      |
| PM2             | its own names    | `optionforge-web`, `optionforge-worker`        |
| Domain + TLS    | its domain/cert  | **new** subdomain, **separate** cert           |

As long as you don't reuse the existing app's port, DB name, Redis index, nginx
block, or PM2 process names, the two run side by side with zero interference.

---

## Prerequisites

- The new **subdomain's DNS A-record already points at the EC2 public/Elastic IP**
  (confirmed). Verify: `dig +short st.apanjob.com` → returns the server IP.
- SSH access to the box with `sudo`.
- The server's security group already allows inbound **80** and **443** (it must,
  since the existing site is served) — no new ports need to be opened. Postgres
  (5432) and Redis (6379) stay **localhost-only**; do not expose them.
- Shopify **Partner app** keys, a **DeepSeek API key**, and (optional) Cloudflare
  R2 keys.

---

## Step 0 — Discovery (read-only; change nothing yet)

Run these first and keep the output. They tell you what's already installed and
which ports/names are free, so the rest of the guide can avoid every collision.

```bash
# What's installed?
which node psql redis-server pm2 nginx certbot
node -v                         # need Node 20, 22, or 24 (package.json "engines")

# Which ports are bound, and by what? (look for 3000, 5432, 6379, 80, 443)
sudo ss -ltnp

# Existing PM2 processes (make sure none are named optionforge-*)
pm2 ls

# Existing nginx sites — you will ADD to these, never edit/remove them
ls -l /etc/nginx/sites-enabled/

# Existing Postgres DBs and roles — confirm there is no "optionforge" already
sudo -u postgres psql -c "\l"
sudo -u postgres psql -c "\du"

# Is Redis present, and which DB indexes already hold keys?
redis-cli ping                  # expect PONG
redis-cli info keyspace         # shows db0, db1, ... that are in use
```

**Decisions to make from the output**
- If port **3000** is already bound → use **3100** in Step 1.
- If a Postgres DB/role named **optionforge** already exists → use a suffixed
  name like **optionforge_app** in Step 3.
- If Redis **db1** already has keys → pick the next free index (e.g. `db2`).
- If `redis-server` / `node` / `certbot` are missing → install in Step 2.

---

## Step 1 — Choose an isolated app port

OptionForge's web process defaults to **port 3000**
(`ecosystem.config.cjs` → `env.PORT`). If Step 0 showed 3000 is free, keep it.

If 3000 is taken, edit **OptionForge's own** `ecosystem.config.cjs` (this is the
new app's file — not the existing project) and set a free port, e.g.:

```js
// optionforge-web process:
env: { NODE_ENV: "production", PORT: "3100" },
```

Whatever you pick, remember it as `<APP_PORT>` for the nginx step.

---

## Step 2 — Install only what is missing

Install **only** the tools Step 0 reported as absent. Do **not** reinstall nginx
or PostgreSQL if they already exist — that's what risks the other project.

```bash
# Node 20 LTS — only if `node -v` is missing or < 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Redis — only if `which redis-server` is empty
sudo apt-get install -y redis-server

# PM2 — only if `which pm2` is empty
sudo npm install -g pm2

# certbot — only if `which certbot` is empty
sudo apt-get install -y certbot python3-certbot-nginx
```

nginx and PostgreSQL are assumed already present (the existing app uses them).

---

## Step 3 — Create an isolated Postgres database (reuse the existing engine)

This creates a **new** role and database next to the existing data. It does not
touch any existing database.

```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE optionforge WITH LOGIN PASSWORD 'CHANGE_ME_STRONG_PW';
CREATE DATABASE optionforge OWNER optionforge;
SQL
```

> If Step 0 showed an `optionforge` DB/role already exists, swap every
> `optionforge` here (and in the `DATABASE_URL` below) for `optionforge_app`.

Resulting connection string (used in Step 5):

```
DATABASE_URL="postgresql://optionforge:CHANGE_ME_STRONG_PW@localhost:5432/optionforge?schema=public"
```

Schema migrations are applied later by `npm run setup` (`prisma migrate deploy`)
in Step 6 — they only create OptionForge's own tables in its own database.

---

## Step 4 — Isolate Redis on a separate DB index

Reuse the existing Redis server, but put OptionForge's BullMQ keys on a
**different logical database** so they can never collide with the other app
(which uses the default index 0):

```
REDIS_URL="redis://localhost:6379/1"
```

(Use the next free index from `redis-cli info keyspace` if `db1` is already in
use.) Redis is optional for OptionForge — the queue degrades gracefully if it's
absent — but the worker (hidden-variant cleanup, migration jobs) needs it.

---

## Step 5 — Clone OptionForge into its own directory and write `.env`

Keep it completely separate from the existing project's folder:

```bash
cd /home/ubuntu
git clone <your-optionforge-repo-url> optionforge
cd optionforge
cp .env.example .env
nano .env
```

Fill in `.env` (required keys — see `env.d.ts`):

```bash
SHOPIFY_API_KEY=...                 # Partner dashboard → Client ID
SHOPIFY_API_SECRET=...              # Partner dashboard → Client secret
SHOPIFY_APP_URL=https://st.apanjob.com   # the NEW subdomain
SCOPES=...                          # keep the default list from .env.example

DATABASE_URL="postgresql://optionforge:CHANGE_ME_STRONG_PW@localhost:5432/optionforge?schema=public"
REDIS_URL="redis://localhost:6379/1"

DEEPSEEK_API_KEY=...                # AI Studio
DEEPSEEK_MODEL=deepseek-v3.2

# 32-byte hex — generate with: openssl rand -hex 32
SHOP_TOKEN_ENCRYPTION_KEY=...

NODE_ENV=production
BILLING_TEST=false                  # true while testing on a dev store
```

Optional (app runs without them): `R2_*` (file uploads), `SENTRY_DSN`,
`AXIOM_TOKEN`, and the plan/migration override vars.

---

## Step 6 — Build and start under PM2

`pm2 start` **adds** processes; it does not disturb the existing app's PM2
processes.

```bash
cd /home/ubuntu/optionforge
npm ci
npm run setup                 # prisma generate && prisma migrate deploy
npm run prisma -- db seed     # loads the 3 starter templates (optional)
npm run build

pm2 start ecosystem.config.cjs   # starts optionforge-web + optionforge-worker
pm2 save
```

Verify both new processes are `online` **and** all pre-existing ones still are:

```bash
pm2 ls
curl -I http://127.0.0.1:<APP_PORT>    # expect a response from remix-serve
```

---

## Step 7 — Add a NEW nginx server block (additive — never edit existing ones)

Create a dedicated config. **Do not delete the default site and do not edit the
existing project's block.**

```bash
sudo tee /etc/nginx/sites-available/optionforge >/dev/null <<'NGINX'
server {
    listen 80;
    server_name st.apanjob.com;     # the NEW subdomain
    client_max_body_size 110M;          # file-upload option fields need this

    location / {
        proxy_pass http://127.0.0.1:3000;   # change to <APP_PORT> if not 3000
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
NGINX

sudo ln -s /etc/nginx/sites-available/optionforge /etc/nginx/sites-enabled/optionforge
sudo nginx -t                 # MUST pass before reloading
sudo systemctl reload nginx   # reload (not restart) = zero downtime for the other site
```

> Note `ln -s` (not `ln -sf`) and **no** `rm` of any existing site — that is the
> key difference from `deploy/setup.sh`. nginx routes by `server_name`, so the
> existing domain and the new subdomain coexist cleanly.

---

## Step 8 — Issue TLS for the new subdomain only

certbot edits **only** the matching server block; the existing site's certificate
is untouched. DNS is already pointing here, so this should succeed immediately.

```bash
sudo certbot --nginx -d st.apanjob.com --agree-tos -m you@example.com --redirect
```

This rewrites the OptionForge block to listen on 443 and redirect HTTP→HTTPS, and
hooks into the existing auto-renew timer. Verify:

```bash
curl -I https://st.apanjob.com    # expect 200/302 from the app
```

---

## Step 9 — Point the Shopify Partner app at the new domain

On your **local machine** (not the server):

1. In the Partner Dashboard (or `shopify.app.toml`), set the **App URL** and the
   **Allowed redirection URL(s)** to `https://st.apanjob.com/...`.
2. `npm run deploy` — pushes the Theme App Extension, Cart Transform Function, and
   app config to Shopify.
3. Install the app on your dev/production store and confirm the OAuth flow
   completes against the new subdomain.

---

## Updating later (safe on the shared box)

OptionForge's `deploy/update.sh` only does `git pull → npm ci → npm run setup →
npm run build → pm2 reload ecosystem.config.cjs` — **no** nginx, system-package,
or other-project changes. Run it from the OptionForge directory:

```bash
cd /home/ubuntu/optionforge
./deploy/update.sh
```

If you changed `shopify.app.toml` or anything under `extensions/`, also run
`npm run deploy` from your local machine.

---

## Post-deploy verification checklist

- [ ] `sudo nginx -t` passes; existing domain still returns 200 **before and
      after** the reload (`curl -I https://tools.apanjob.com`).
- [ ] `pm2 ls` — `optionforge-web` + `optionforge-worker` online; **all
      pre-existing processes still online**.
- [ ] New subdomain serves over HTTPS: `curl -I https://st.apanjob.com`.
- [ ] Existing Redis data untouched: `redis-cli -n 0 dbsize` is unchanged;
      OptionForge keys appear only in `redis-cli -n 1 dbsize`.
- [ ] Existing Postgres databases unchanged (`\l` shows the new `optionforge` DB
      added, nothing removed).
- [ ] Shopify install/OAuth completes against the new domain.

## If something goes wrong — rollback (affects only OptionForge)

```bash
pm2 delete optionforge-web optionforge-worker      # stop only OptionForge
sudo rm /etc/nginx/sites-enabled/optionforge       # remove only its nginx block
sudo nginx -t && sudo systemctl reload nginx
# Optional: drop its DB/role
sudo -u postgres psql -c "DROP DATABASE optionforge; DROP ROLE optionforge;"
```

None of these touch the existing project.
