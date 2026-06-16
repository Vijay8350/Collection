# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

This working directory holds the product blueprint plus the app itself:

- `SHOPIFY_PRODUCT_OPTIONS_APP_BLUEPRINT.md` — the canonical spec. Source code comments reference it by section (e.g. "Blueprint §4.4"). When a feature's intent is unclear, check the referenced section.
- `optionforge/` — the actual application. **All commands below run from inside `optionforge/`.**

## Commands

```bash
cd optionforge

npm run dev          # Shopify CLI: tunnels, builds, prints install URL (primary dev loop)
npm run worker       # BullMQ worker (separate terminal; needs REDIS_URL)
npm run typecheck    # tsc --noEmit — the only static check; there is no lint/test suite
npm run build        # remix vite:build
npm start            # remix-serve ./build/server/index.js (production)

npm run deploy       # push Theme App Extension + Cart Transform Function + app config
npm run config:link  # link local toml to a Partner app (run once after clone)

npx prisma migrate dev --name <name>   # create + apply a migration in dev
npx prisma db seed                     # load the 3 starter templates (prisma/seed.ts)
npx prisma generate                    # regenerate client after schema edits
npx prisma studio                      # inspect the DB
```

There is **no test runner and no linter** — `npm run typecheck` is the verification gate. Run it after any TypeScript change. `scripts/test-deepseek.mjs` is a standalone connectivity check for the LLM provider (`node scripts/test-deepseek.mjs`).

## Deployment

Production is a **single EC2 box** running web + worker + PostgreSQL + Redis behind nginx (see `DEPLOY.md` for the full runbook). The two Node processes are managed by PM2 via `ecosystem.config.cjs` (`optionforge-web` on `PORT=3000`, `optionforge-worker`) — `pm2 start ecosystem.config.cjs && pm2 save`. The `deploy/` scripts automate provisioning: `setup.sh` (first-run install + nginx + Let's Encrypt), `update.sh` (pull + rebuild + restart), `aws-provision.sh`. `npm run setup` (`prisma generate && prisma migrate deploy`) runs migrations on deploy.

**Multiple Partner app configs** coexist as `shopify.app.*.toml` (e.g. `shopify.app.st-shor.toml`); `shopify.app.toml` is the active one. Switch with `npm run config:use` and re-link with `npm run config:link`. Don't commit real `client_id`s into the template `shopify.app.toml`.

## Architecture

OptionForge is a Shopify embedded app (Remix + Vite + Polaris) that adds custom product options to storefronts. Two differentiators drive the design: **AI-generated option sets** and **one-click migration** from competitor apps.

### Three runtimes, one codebase

Code is split across execution contexts that do **not** share a request lifecycle — know which one you're editing:

1. **Remix server** (`app/`) — embedded admin UI + App Proxy endpoints. Files named `*.server.ts` are server-only; never import them into widget/extension code.
2. **BullMQ worker** (`workers/index.ts`) — a standalone process with its **own** `PrismaClient` and its **own** `adminFetch` GraphQL helper. It does not use `app/shopify.server.ts`. Background jobs (hidden-variant cleanup; migration) are enqueued via `app/lib/queue.server.ts` and consumed here. Throttled to ~10 Shopify mutations/min to respect the leaky-bucket rate limit.
3. **Storefront extensions** (`extensions/`) — vanilla JS Theme App Extension widget (`options-widget`) and a Shopify Cart Transform Function (`cart-transform`, JS runtime). These run on the merchant's storefront / Shopify's infra, not on our server.

### Request boundaries (authentication differs per route prefix)

- `app.*` routes → `authenticate.admin(request)` — embedded admin, session-token auth.
- `proxy.*` routes → `authenticate.public.appProxy(request)` — storefront traffic via Shopify App Proxy at `/apps/optionforge/*`. The widget fetches `proxy.options.$productId` (cached 5 min) to render fields and POSTs selections to `proxy.submit`.
- `webhooks.*` routes → registered in `shopify.app.toml`; includes the 3 mandatory GDPR topics plus `orders/*`, `themes/publish`, `app/uninstalled`.

### Data model (`prisma/schema.prisma`, PostgreSQL)

- `Shop` is the tenant root; almost every table cascades from it via `onDelete: Cascade`. Access tokens are stored **encrypted** (`accessTokenEnc`, AES-256-GCM via `crypto.server.ts`); decrypt only when calling Shopify.
- Option-set tree: `OptionSet → Option → OptionValue`, with `ConditionalRule` (show/hide predicate trees) and `ProductMapping` (product/collection/tag scope).
- **JSON-as-text convention:** columns like `validationJson`, `predicateJson`, `payloadJson`, `errorJson`, `fileUploadIds` store serialized JSON in `String` fields for portability. Always parse defensively — `proxy.options` uses a `safeJson()` wrapper that returns `{}` on malformed input.
- `HiddenVariant` tracks auto-created Shopify upcharge variants (Globo/Hulk model). SKUs are prefixed `optionforge-` so cleanup-on-uninstall is reliable; capped at 100/product (`hidden-variants.server.ts`).

### Key server libs (`app/lib/`)

- `ai.server.ts` — AI Studio. Calls an LLM through a swappable `LLMProvider` interface (`getLlmProvider()`, selected by `LLM_PROVIDER`); the default `DeepSeekProvider` uses the **OpenAI SDK** (`baseURL: api.deepseek.com`) with the versioned model `deepseek-v3.2` (`DEEPSEEK_MODEL`; the bare `deepseek-chat` alias retires 2026-07-24). Forced `response_format: json_object`, validated with a Zod schema, token cost tracked in micro-USD ($0.28/$0.42 per 1M in/out). Identical prompts are served from a 24h in-process cache (`cached: true`). Prompts are sanitized for injection before sending.
- `shop.server.ts` — shop lifecycle + AI quota enforcement (per-plan monthly limits, env-overridable). Check `isQuotaExceeded` before generating.
- `formula.server.ts` — sandboxed math.js for formula pricing. Dangerous functions (`import`/`evaluate`/`parse`/`createUnit`) are overridden to throw; input is regex-screened. Wired but not yet called from the PDP.
- `migrations/` — `Importer` interface (`detect` + async-generator `import`) per competitor. `sc.server.ts` and `shoppad.server.ts` ship today; globo/easify/hulk are Stage 2 stubs. Imports land as `Draft` and never modify the source app (reversible).
- `storage.server.ts` (R2/S3), `crypto.server.ts`, `queue.server.ts` — infra adapters.

### Graceful degradation

Redis (`queue.server.ts`) and Cloudflare R2 are **optional** — the helpers return `null` / no-op and log a warning when env vars are absent, so the app runs without them. Don't assume a queue exists; callers handle the `null` queue.

## Conventions

- API version is pinned to `ApiVersion.January25` (`2025-01`) in both `shopify.server.ts` and the worker's `SHOPIFY_API_VERSION` — keep them in sync.
- REST is disabled (`future.removeRest: true`); use Admin **GraphQL** only.
- Shopify IDs are GIDs (e.g. `gid://shopify/Product/123`); `.split("/").pop()` extracts the numeric id.
- After editing `prisma/schema.prisma`, run `npx prisma generate` (and a migration) before relying on the new types.
- `TODO` comments mark explicit Stage-2 handoff points (e.g. `proxy.submit` add-on variant computation). Grep for them before assuming a feature is complete; the README's "intentionally stubbed" list is authoritative for what is unfinished.
