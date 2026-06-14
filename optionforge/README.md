# OptionForge

> Custom product options for Shopify — with AI-generated option sets and one-click migration from SC Product Options, ShopPad Infinite Options, Hulk, Globo, and Easify.

Built per the spec in [SHOPIFY_PRODUCT_OPTIONS_APP_BLUEPRINT.md](../SHOPIFY_PRODUCT_OPTIONS_APP_BLUEPRINT.md).

---

## Stack

- **Remix** (Vite) + **TypeScript**
- **Polaris React v12** embedded admin
- **Prisma** + **PostgreSQL** (16+)
- **@shopify/shopify-app-remix** for OAuth, session, webhooks
- **Theme App Extension** (App Embed + App Block) — zero Script Tags, BFS-ready
- **Cart Transform Function** (Shopify Functions, JS runtime)
- **DeepSeek** (`deepseek-v3.2`, behind an `LLMProvider` interface) via OpenAI-compatible API for AI option-set generation
- **BullMQ + Redis** for background jobs (hidden-variant cleanup, migration)
- **Cloudflare R2** for file uploads (180-day TTL)

---

## Repo layout

```
optionforge/
├── shopify.app.toml              # App config (scopes, webhooks, app proxy)
├── shopify.web.toml              # Web role + predev hook
├── package.json
├── prisma/
│   ├── schema.prisma             # 12 tables (Shop, OptionSet, Option, …)
│   └── seed.ts                   # 3 starter templates
├── app/
│   ├── shopify.server.ts         # shopifyApp() init
│   ├── db.server.ts              # Prisma singleton
│   ├── entry.server.tsx
│   ├── root.tsx
│   ├── lib/
│   │   ├── ai.server.ts          # DeepSeek integration (OpenAI-compatible)
│   │   ├── crypto.server.ts      # AES-256-GCM for access tokens
│   │   ├── formula.server.ts     # Sandboxed math.js
│   │   ├── hidden-variants.server.ts
│   │   ├── queue.server.ts       # BullMQ producer
│   │   ├── shop.server.ts        # Shop record lifecycle, AI quota
│   │   ├── storage.server.ts     # R2 client
│   │   └── migrations/
│   │       ├── index.ts
│   │       ├── types.ts
│   │       ├── sc.server.ts      # SC Product Options (Bold) importer
│   │       └── shoppad.server.ts # ShopPad Infinite Options importer
│   └── routes/
│       ├── _index.tsx            # Public landing + install form
│       ├── auth.$.tsx
│       ├── auth.login.tsx
│       ├── app.tsx               # Embedded admin shell w/ NavMenu
│       ├── app._index.tsx        # Dashboard
│       ├── app.option-sets._index.tsx
│       ├── app.option-sets.new.tsx
│       ├── app.option-sets.$id.tsx     # Visual editor
│       ├── app.ai-studio.tsx           # DIFFERENTIATOR #1
│       ├── app.migration.tsx           # DIFFERENTIATOR #2
│       ├── app.templates.tsx
│       ├── app.submissions.tsx
│       ├── app.settings.tsx            # Plan switcher
│       ├── webhooks.*.tsx              # 7 webhooks incl. GDPR
│       ├── proxy.options.$productId.tsx  # Storefront API (App Proxy)
│       └── proxy.submit.tsx
├── extensions/
│   ├── options-widget/           # Theme App Extension
│   │   ├── shopify.extension.toml
│   │   ├── blocks/
│   │   │   ├── options-loader.liquid     # App Embed
│   │   │   └── options-block.liquid      # App Block
│   │   ├── assets/
│   │   │   ├── optionforge.js            # Vanilla JS widget, <60 KB target
│   │   │   └── optionforge.css
│   │   └── locales/
│   │       ├── en.default.json
│   │       └── hi.json                   # Hindi for India market
│   └── cart-transform/           # Shopify Cart Transform Function
│       ├── shopify.extension.toml
│       ├── package.json
│       └── src/
│           ├── cart_transform_run.js
│           └── cart_transform_run.graphql
└── workers/
    └── index.ts                  # BullMQ worker (hidden-variant cleanup)
```

---

## Setup

### Prerequisites

- **Node** 20.10+ or 22+
- **npm** 10+
- **PostgreSQL** 16+ (local Docker or hosted: Fly.io / Supabase / Neon / Railway)
- **Shopify CLI** 3.x: `npm install -g @shopify/cli @shopify/theme`
- **Shopify Partner account** with a dev store
- **DeepSeek API key** — https://platform.deepseek.com/api_keys
- Optional: **Redis** (local or Upstash) for background jobs
- Optional: **Cloudflare R2** account for file uploads

### Install

```bash
git clone <your-repo> optionforge
cd optionforge
npm install

# Start a local Postgres (skip if you have one)
docker run --name optionforge-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16

cp .env.example .env
# Edit .env — at minimum set DEEPSEEK_API_KEY, DATABASE_URL, SHOP_TOKEN_ENCRYPTION_KEY
openssl rand -hex 32   # paste output as SHOP_TOKEN_ENCRYPTION_KEY

npm exec prisma migrate dev --name init
npm exec prisma db seed
```

### Link to Shopify

```bash
npm run config:link
# Follow prompts to select your Partner org and create/select an app.
# Edit shopify.app.toml: paste your client_id, set application_url and dev_store_url.
```

### Run dev

```bash
npm run dev
# Shopify CLI opens an embedded tunnel and prints an install URL.
# Open the URL → grants OAuth scopes → lands on the embedded admin.
```

In a second terminal, if you have Redis:

```bash
npm run worker
```

---

## Key flows

### 1. Generate an option set with AI

1. Open the admin → **AI Studio**.
2. Type a description: *"Custom engraved leather wallet with up to 20 characters and 3 font choices."*
3. Click **Generate** → preview appears in <8 s.
4. Click **Accept** → option set created as draft.
5. Edit values, assign to a product, set status to **Active**.

Cost per generation: ~$0.0004 USD (DeepSeek `deepseek-v3.2`, ~400 input + 600 output tokens at $0.28/$0.42 per 1M). Identical prompts are served from a 24h cache. Quotas enforced server-side per plan.

### 2. Migrate from a competitor

1. Open the admin → **Migration**.
2. The wizard auto-detects installed competitors via Admin GraphQL metafield queries.
3. Click **Import from SC Product Options** (or ShopPad).
4. New option sets land in `Draft` status (review before activating).
5. Original app is **not modified** — fully reversible for 30 days.

Day-1 importers: SC, ShopPad. Globo / Easify / Hulk land in Stage 2.

### 3. Storefront widget

- Merchant enables the **App Embed** in Theme editor → Customize → App embeds → OptionForge.
- On every PDP, the JS loader fetches `/apps/optionforge/options/<productId>` via App Proxy.
- Fields render above the Add-to-Cart button; values inject as `properties[_optionforge_*]` line item properties.
- Cart Transform Function (Pro+) rewrites the cart-line title with the summary, e.g. *"Wallet — Engraving Text: HELLO · Font: Script"*.

---

## Deploy

### Production database

Provision a managed PostgreSQL (Fly.io / Supabase / Neon / Railway), point `DATABASE_URL` at it, and run `npx prisma migrate deploy`.

Recommended host: **Fly.io** Postgres in `sin` (Singapore) with read replicas in `iad` / `cdg` to match the Remix app regions.

### App hosting

Any Node 20+ host: Fly.io, Railway, Render, Vercel.

```bash
npm run build
npm start
```

### Push extensions and config

```bash
npm run deploy   # uploads Theme App Extension + Cart Transform Function + app config
```

### Background worker

Run `npm run worker` on a separate Fly/Railway machine. One worker can serve ~5,000 stores.

---

## Pricing (per the blueprint)

| Plan | Price | AI gens/mo | Migration |
|---|---|---|---|
| Free | $0 | 5 | Free 90 days, then $49 one-time |
| Pro | $9.99 (or $95.90/yr) | 50 | Free |
| Premium | $19.99 (or $191.90/yr) | 500 | Free |
| Enterprise | $79.99 (or $767.90/yr) | unlimited | White-glove |

**Same price on Shopify Plus.** No Plus surcharge.

---

## What's intentionally stubbed (Stage 2)

- File upload UI on PDP — endpoint exists, widget doesn't render the upload dropzone yet.
- Live preview (Konva.js canvas).
- Formula-pricing evaluator wired to PDP (server lib is ready in `app/lib/formula.server.ts`).
- Globo / Easify / Hulk importers (the others ship Stage 2).
- Shopify Billing API hookup on the Settings page (today it just flips the local `plan` field).
- POS extension, B2B integration, Hydrogen components (Stage 3).
- Cart Transform: merge-identical-config + formula-based upcharges (Stage 2).

Search the codebase for `TODO` to find the explicit handoff points.

---

## License

Proprietary — DeoDap Marketplace, 2026.
