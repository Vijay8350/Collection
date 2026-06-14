# Shopify Product Options App — Full Build Blueprint

**Codename:** OptionForge (working title)
**Owner:** DeoDap Marketplace (marketplace@deodap.com)
**Version:** 2.0 (final, kickoff-ready)
**Date:** 2026-06-14 (v2.0); original draft 2026-05-24
**Status:** Final specification — internally consistent, Shopify Public App & Built-for-Shopify compliant
**Reference research:** See deep-dive blueprint of Globo / Infinite Options / SC / Easify / Hulk (Anthropic compass artifact, May 22 2026). v2.0 verified against shopify.dev (Built for Shopify requirements, Protected Customer Data, Privacy-law compliance, React Router app package, Polaris web components) on 2026-06-14.

> **Headline differentiators:**
> 1. **AI Option-Set Generation** — auto-generate full option sets from a product description in under 10 seconds (DeepSeek `deepseek-chat`/V3.2 via OpenAI-compatible API, ~$0.0004 per generation). No top-5 competitor ships this.
> 2. **One-Click Migration Tooling** — import option sets from SC Product Options (Bold), ShopPad Infinite Options, Hulk, Globo, and Easify so existing merchants can switch in minutes, not days.

> **v2.0 changelog:** Reconciled all internal inconsistencies (AI provider, Pro option-type count, Stage-1 migration scope, annual-discount math, AI cache cost, migration pricing); modernized the stack to Shopify's 2026 recommendations (React Router 7 app package, Polaris web components, latest App Bridge, GraphQL-only); added §14 QA & Testing, §15 Accessibility, §16 Analytics & Event Taxonomy, §17 Reliability/DR/Release, §18 Shopify Public App Compliance, plus new competitive product features (§2.14). References renumbered to §19.

---

## 0. Executive Summary

OptionForge is a Built-for-Shopify (BFS) infinite-product-options app that lets merchants add unlimited custom fields, swatches, file uploads, conditional logic, and add-on pricing to any product. The category has ~120,000 stores across the top 5 incumbents (Easify, Globo, ShopPad, Hulk, SC). Easify is the architectural leader (Cart Transform + Metaobjects + App Embed, +104.5% YoY install growth); SC is the most vulnerable (no BFS badge, legacy Liquid injection, and a Script-Tag-era architecture that Shopify already restricted in 2025 — ScriptTag blocked Feb 1 2025 and order-status scripts sunset Aug 28 2025); ShopPad is mature but English-only with no free tier.

OptionForge's wedge is **switch-the-installed-base + onboarding-speed via AI**. Existing merchants don't switch product-options apps because re-keying 50–500 option sets is painful — a one-click migration removes that friction. New merchants spend 2–6 hours building their first option set — AI generation collapses that to under a minute.

**Stage 1 (8 weeks)** ships a BFS-ready MVP with 15 option types, App Embed integration, hidden-variant upcharges, AI generation (DeepSeek), import from two competitors (SC + ShopPad), Polaris (web components) admin on React Router 7, Free + Pro tiers.
**Stage 2 (12 weeks)** adds Cart Transform Function, live preview, formula pricing, import from the remaining three competitors (Globo, Easify, Hulk), Premium tier.
**Stage 3 (moat)** adds B2B quote-builder, POS extension, Hydrogen components, structured packing slips.

**12-month targets:** 2,500 installs, 4.8★ rating, free→paid conversion >4%, support cost <$0.40/install/month, BFS badge by month 6.

---

## 1. Market Positioning

### 1.1 Competitive landscape (May 2026)

| App | Installs | Rating | Entry $/mo | BFS | Cart Transform | Free tier | Key weakness |
|---|---|---|---|---|---|---|---|
| ShopPad Infinite Options | 38,152 | 4.7 / 2,310 | $12.99 | ✅ | ❌ | ❌ | English only; intermittent load failure |
| Globo Product Options | 28,693 | 4.9 / 3,976 | Free / $9.90 | ✅ | ❌ | ✅ | No live preview <$19.90; mobile preview gap |
| Easify Custom Product Options | 21,994 | 4.9 / 2,322 | Free / $9.99 | ✅ | ✅ | ✅ | Admin English-only; younger app |
| Hulk Product Options | 19,317 | 4.8 / 1,121 | Free / $10 | ✅ | ❌ | ❌ (dev only) | Declining QoQ; legacy Script Tag scope |
| SC Product Options | 12,881 | 4.6 / 1,235 | $14.99 | ❌ | ❌ | ❌ | Liquid injection; no dynamic checkout buttons |

### 1.2 Where OptionForge wins

| Axis | Incumbents | OptionForge |
|---|---|---|
| Onboarding speed | 2–6 hours to build first option set | <60 seconds via AI |
| Switching cost | Re-key everything by hand | One-click import from 5 competitors |
| Admin language | English only (Easify, ShopPad) | English + Hindi + Vietnamese day 1 |
| Architecture | Mixed (Liquid, Script Tags, hidden variants) | 2026-modern: App Embed + Cart Transform + Metaobjects |
| Plus surcharge | Globo $39.90 / Hulk Enterprise $49.90 | Same price for all Shopify plans (Easify parity) |

### 1.3 Anti-positioning (what we explicitly are NOT)

- Not a page builder (PageFly territory).
- Not a bundles app (Shopify Bundles + Bundler.app territory).
- Not a subscriptions app (Recharge / Shopify Subscriptions territory).
- Not a B2B catalog gating tool (Wholesale Helper / B2B Login).

---

## 2. Product Specification

### 2.1 Option types (28 total at Premium parity with Easify)

**Tier-gated by plan:**

| # | Type | Free | Pro | Premium | Notes |
|---|---|---|---|---|---|
| 1 | Short text | ✅ | ✅ | ✅ | char limits |
| 2 | Paragraph text | ✅ | ✅ | ✅ | counter |
| 3 | Dropdown | ✅ | ✅ | ✅ | searchable on >10 items |
| 4 | Radio | ✅ | ✅ | ✅ | |
| 5 | Checkbox (single) | ✅ | ✅ | ✅ | |
| 6 | Checkbox (multi) | ✅ | ✅ | ✅ | |
| 7 | Color swatch | ✅ | ✅ | ✅ | hex or named |
| 8 | Image swatch | ✅ | ✅ | ✅ | CDN-hosted |
| 9 | Number | ✅ | ✅ | ✅ | min/max/step |
| 10 | Date picker | ✅ | ✅ | ✅ | blocked dates Pro+ |
| 11 | Time picker | ✅ | ✅ | ✅ | |
| 12 | Email | ✅ | ✅ | ✅ | RFC validation |
| 13 | Phone | ✅ | ✅ | ✅ | E.164 |
| 14 | URL | ✅ | ✅ | ✅ | |
| 15 | Scrollable list | ✅ | ✅ | ✅ | |
| 16 | File upload (single, 10 MB) | ❌ | ✅ | ✅ | |
| 17 | File upload (multi, 10×10 MB) | ❌ | ✅ | ✅ | |
| 18 | File upload (multi, 20×100 MB) | ❌ | ❌ | ✅ | |
| 19 | Image upload + cropper | ❌ | ✅ | ✅ | |
| 20 | Dimensions (W × H × D) | ❌ | ✅ | ✅ | formula-compatible |
| 21 | Quantity-per-option | ❌ | ✅ | ✅ | |
| 22 | Multi-textbox | ❌ | ✅ | ✅ | repeatable field |
| 23 | Color picker (open) | ❌ | ✅ | ✅ | |
| 24 | Font picker (Google Fonts) | ❌ | ❌ | ✅ | |
| 25 | Range slider | ❌ | ✅ | ✅ | |
| 26 | Toggle | ❌ | ✅ | ✅ | |
| 27 | Option group (nested) | ❌ | ✅ | ✅ | |
| 28 | Calculation (read-only formula display) | ❌ | ❌ | ✅ | |

### 2.2 Conditional logic

- **Free / Pro:** Show/hide an option based on another OptionForge option's value.
- **Premium:** Show/hide based on Shopify variant name (e.g. "if variant = 'Custom Size' show dimensions").
- **Editor UX:** Visual rule builder (predicate tree with AND/OR), no JSON editing.

### 2.3 Pricing models on add-ons

- Fixed surcharge (e.g. +$5).
- Percentage surcharge (e.g. +10%).
- One-time per order vs per-quantity.
- **Formula-based** (Premium): characters × $/char, dimensions × $/sq.cm, qty-tiered. Sandboxed `math.js` evaluator with server-side validation.
- Linked add-on product (real Shopify product appears as separate line item).
- Hidden variant (default — separate line item without polluting public catalog).

### 2.4 Live preview (Premium)

This is the **customer-facing storefront** live preview (a Premium upsell). It is distinct from the **admin editor preview** in §5.3, which ships on **all tiers** because Built for Shopify requirement 4.2.6 ("Visible previews") mandates that any app letting merchants customize something visual must show a live preview with editor and preview visible simultaneously on desktop. Do not gate the admin editor preview behind a paid plan.

- Konva.js canvas overlay on PDP.
- Base image from product; text/image layers from customer input.
- <30 ms re-render per keystroke; pre-rendered base images on Cloudflare R2 CDN.
- Mobile: sticky preview at top of viewport (fixes Globo's mobile-scroll complaint).
- Export composite as PNG attached to order (for the production team).

### 2.5 Templates

- 100+ ready-made templates at launch (parity with Easify): jewelry, apparel, signage, gaming PC, event tickets, gift cards, photo prints, bedding, business cards, custom mugs.
- Templates stored as Shopify Metaobjects (shareable, exportable, version-controlled).
- "Generate from template" wizard with AI fine-tuning of fields.

### 2.6 AI Option-Set Generation (DIFFERENTIATOR #1)

**User flow:**
1. Merchant types a one-line description: "Custom engraved leather wallet with up to 20 characters and 3 font choices."
2. OptionForge sends prompt to DeepSeek (`deepseek-chat`) via its OpenAI-compatible API with a system prompt instructing JSON output matching the OptionSet schema.
3. Returns a draft option set in <8 seconds with: text field (20 char max), font dropdown (3 choices), color swatch (5 leather colors), live preview enabled.
4. Merchant reviews in visual editor, accepts or tweaks, then assigns to product.

**System prompt design (excerpt):**
```
You are an expert Shopify merchandiser. Given a product description, return a JSON
OptionSet matching this schema: { options: [{ type, label, required, values?, addon_price?, conditional? }] }.
Use 3-8 options. Prefer swatches over dropdowns when <6 choices. Add validation
(char limits, required) where it reduces support tickets. Never invent fields
the merchant didn't imply. Return only JSON, no prose.
```

**Cost model (DeepSeek V3.2 pricing, verified June 2026):**
- DeepSeek `deepseek-chat` / V3.2: **$0.28 / 1M input tokens, $0.42 / 1M output tokens**; cache hits drop input to ~$0.028 / 1M (1/10). Output tokens are **not** discounted by caching.
- Avg generation: 400 input + 600 output tokens ≈ **$0.00036 per generation** (cache miss) or **~$0.00026** with an input-cache hit. Note: output dominates (600 × $0.42/1M = $0.000252), so caching only meaningfully helps repeated/duplicate prompts — the per-gen floor stays ≈ $0.00026, not half of the miss cost. (The original draft's "$0.00034 cache-hit" figure was arithmetically impossible and is corrected here.)
- 10 generations/install/month avg ≈ **$0.0036/install/month** → negligible (<0.1% of $9.99 Pro plan revenue).
- **Model-lifecycle note:** the bare `deepseek-chat` alias retires **July 24, 2026**; pin to the explicit versioned model (e.g. `deepseek-v3.2`) and keep the provider abstraction (below) so a model swap is config-only.

**Plan limits:**
- Free: 5 generations/month, watermark "Generated with OptionForge AI"
- Pro: 50/month
- Premium: 500/month
- Enterprise: unlimited

**Implementation:** Server-side via the **OpenAI-compatible SDK pointed at `api.deepseek.com`** (NOT the Google AI SDK — the original draft referenced Gemini in error; DeepSeek is the chosen provider). Forced `response_format: json_object`, validated against a Zod schema, behind a single `LLMProvider` interface so DeepSeek can be swapped for Claude Haiku 4.5, GPT-4o-mini, or DeepSeek-V4 Flash with no call-site changes. BullMQ queued; results cached for 24h by description hash (deduplicate refresh requests); prompts sanitized for injection before sending.

### 2.7 Migration Tooling (DIFFERENTIATOR #2)

**Supported sources at launch:**

| Source | Read mechanism | Status |
|---|---|---|
| SC Product Options (Bold) | Parse `bold-options-hybrid.liquid` snippet from theme + scrape Bold admin via merchant-pasted export CSV | Day 1 |
| ShopPad Infinite Options | Read linked add-on products + product metafields tagged `shoppad.*` | Day 1 |
| Globo Product Options | Read product metafields in `globo.*` namespace + hidden variants tagged `globo-` | Stage 2 |
| Easify Custom Product Options | Read product metafields in `easify.*` namespace + Cart Transform config via Admin GraphQL | Stage 2 |
| Hulk Product Options | Read product metafields in `hulk.*` namespace + hidden variants tagged `hulk-` | Stage 2 |

**Migration wizard UX:**
1. Detect installed competitor (Admin GraphQL `appInstallation` query).
2. Read source config → diff against OptionForge schema → preview mapping.
3. Merchant approves; OptionForge writes OptionForge option sets in parallel (does NOT delete source).
4. Switch storefront App Embed from competitor to OptionForge.
5. After 30-day grace period, offer "Uninstall [competitor]" button with hidden-variant cleanup.

**Migration safety guarantees:**
- Source app is never deleted automatically.
- All hidden upcharge variants kept until merchant clicks cleanup.
- Original config exported to merchant's Google Drive (optional) before any write.
- Reversible for 30 days (one-click "restore previous app" button).

**Pricing (canonical — matches §3):** Migration tooling is **included free on Pro / Premium / Enterprise** (no time limit). For **Free-tier** merchants it is **free for the first 90 days post-install**, then a **$49 one-time** fee thereafter.

### 2.8 Validation

Required, char min/max, file size cap, file MIME whitelist, blocked dates, lead time (e.g. "no Sundays, 3-day minimum lead"), cutoff time per timezone.

### 2.9 Multi-language

- **Storefront strings:** 15 languages day 1 (EN, HI, VI, FR, DE, ES, PT, IT, JA, ZH-S, ZH-T, NL, PL, AR, TH). Merchant overrides per-option via Shopify Translate API.
- **Admin UI:** EN + HI + VI at launch (Polaris i18n). FR/ES/PT in Stage 2.
- **AI prompts:** Detect store primary locale and instruct the model (DeepSeek) to generate option labels in that language.

### 2.10 Multi-currency / Shopify Markets

- Hidden-variant upcharges store base-currency price; presentment conversion via Storefront API `@inContext`.
- Cart Transform Function reads `@inContext` and emits localized line attributes.
- B2B catalog prices respected (Stage 3).

### 2.11 Import/export

- CSV export of all option sets + values (Pro+).
- CSV import (Pro+).
- JSON export for git-backed merchants (Premium).

### 2.12 POS

- Shopify POS UI Extension for "configure options" workflow (Stage 3).
- Captured options stored as line item properties; visible to associate at checkout.

### 2.13 B2B / Plus / Hydrogen

- B2B Companies API integration (Stage 3): different option sets per company, quote-builder flow.
- Shopify Plus: same price as base plans (no surcharge).
- Hydrogen: TypeScript component library + React hooks published as `@optionforge/hydrogen` (Stage 3).

### 2.14 Competitive feature differentiators (v2.0 additions)

Features that none of the top-5 incumbents ship well, layered on top of the AI + migration wedge. Each is mapped to a stage so it does not bloat the MVP.

- **Inventory-aware options (Stage 2).** Link an option value to a component/variant SKU and auto-hide or disable it when that SKU is out of stock (`get-inventory-levels`). Prevents the #1 custom-product support ticket — selling an add-on that can't be fulfilled. Incumbents either ignore stock or require manual toggling.
- **Saved & shareable configurations (Stage 2).** Customer saves a configured product to a short, shareable URL (e.g. `?ofc=ab12cd`) and can revisit or send it. Huge for high-consideration custom goods (jewelry, signage, gaming PCs) and a natural virality loop.
- **Per-option conversion & revenue analytics (Stage 2 → deepened Stage 3).** Which options are viewed, selected, and which lift AOV / conversion. Surfaced in-admin as "this option set adds an avg ₹X / +Y% AOV." Directly feeds the BFS "simplified monitoring/reporting" guideline and gives merchants a reason to keep the app.
- **A/B testing of option sets (Stage 3).** Split-test layout, default selections, copy, and add-on pricing with built-in conversion tracking. No incumbent offers native experimentation.
- **Shopify Flow + merchant API surface (Stage 2).** Emit a Flow trigger on submission ("Option submission created") so merchants automate tagging, fulfillment routing, and notifications; expose a read API/webhook for submissions so ERPs/print partners can pull structured option data.
- **Order & line-item metafield sync (Stage 2).** Write structured selections to order/line-item metafields (not just line-item properties) so downstream apps, packing-slip apps, and 3PLs can read them reliably.
- **Option-set versioning & one-click rollback (Stage 2).** Every save snapshots a version; merchants can diff and restore a prior version (pairs with the feature-flag/rollback discipline in §17). De-risks edits to high-traffic products.
- **AI option optimization (Stage 3, extends Differentiator #1).** Periodically analyze real submissions and suggest pruning low-use options, reordering by selection rate, or converting a free-text field to a dropdown — closing the loop from generation to ongoing optimization.
- **Accessibility-first storefront widget (Stage 1, see §15).** WCAG 2.2 AA option controls (keyboard, screen-reader, contrast, reduced-motion, RTL) shipped from day one — a genuine gap across all five incumbents and a procurement differentiator for larger/regulated merchants.

---

## 3. Pricing & Plans

| Plan | Monthly | Annual (20% off) | Included |
|---|---|---|---|
| **Free Forever** | $0 | — | 5 option sets, 15 option types, 5 AI generations/mo, conditional logic, 100+ templates, OptionForge watermark on AI sets, community support |
| **Pro** | **$9.99** | $95.90/yr | Unlimited option sets, 25 option types, 50 AI generations/mo, file upload (10×10 MB), formula pricing, conditional logic on variants, in-cart edit, CSV import/export, chat support, **free migration tooling** |
| **Premium** | **$19.99** | $191.90/yr | 28 option types, 500 AI generations/mo, live preview, file upload (20×100 MB), Google Font picker, calculation field, image cropper, structured packing slips, JSON export, priority chat |
| **Enterprise** | **$79.99** | $767.90/yr | Unlimited AI generations, white-glove migration + onboarding, POS extension, B2B integration, Hydrogen components, custom feature requests, dedicated Slack channel, SLA |

**Pledges:**  
- 14-day trial on all paid plans (via the Shopify Billing API — see §18.5).
- **Same price for all Shopify plans** (including Plus). Differentiator vs Globo ($39.90 Plus) and Hulk ($49.90 Enterprise).
- No per-order fees, no transaction cuts.
- **Annual = 20% off** (paid yearly), consistent with the "Annual (20% off)" figures in the table above — i.e. ≈2.4 months free. (The original draft's "2 months free" wording was ~17% and contradicted the 20% table figures; standardized to 20%.)

**Migration pricing (canonical — matches §2.7):**
- **Included free** on Pro / Premium / Enterprise (no time limit).
- **Free-tier merchants:** free for the first **90 days** post-install, then **$49 one-time** thereafter.

---

## 4. Technical Architecture

### 4.1 Stack

| Layer | Choice | Why |
|---|---|---|
| App framework | **React Router 7** via `@shopify/shopify-app-react-router` (Shopify CLI) | **Shopify's current recommended framework (2026)** — Remix merged into React Router 7; same loaders/actions/SSR model. The Stage-1 scaffold may start on `@shopify/shopify-app-remix` and migrate (API-compatible). |
| Admin UI | **Polaris web components** + **latest App Bridge** (`app-bridge.js` in `<head>`) | Shopify's 2026 design direction; better embedded performance and Web Vitals than Polaris React (still supported as a fallback for complex React views) |
| Database | **Postgres 16** on Fly.io (Singapore primary, read replicas in IAD/CDG) | Low-latency for India + US/EU stores |
| ORM | **Prisma 5+** | Type-safe; migration story |
| Queue | **BullMQ** on Upstash Redis | Hidden-variant sync, AI generation jobs, migration jobs |
| File storage | **Cloudflare R2** | Zero egress fees; 180-day lifecycle policy |
| AI | **DeepSeek** (`deepseek-chat` / V3.2) via OpenAI-compatible SDK, behind an `LLMProvider` interface | Cost (~$0.0004/gen), latency (<8s), native JSON mode (`response_format: json_object`); provider-abstracted for swap to Claude Haiku 4.5 / GPT-4o-mini |
| Admin API | **GraphQL Admin API only** (`future.removeRest: true`) | Mandatory for all new public apps since **April 1, 2025**; REST is not an option |
| Cart Transform Function | **Rust → WASM** (or JS runtime) | Required runtime per Shopify Functions spec; one CTF **per app** per store (multiple apps' CTFs coexist — see §4.4) |
| Theme integration | **Theme App Extension** (App Embed + App Block) | Only BFS-compatible path; auto-removed on uninstall (no code injection) |
| Webhooks ingestion | React Router route handlers with HMAC verification; compliance topics via `compliance_topics` in `shopify.app.toml` | |
| Observability | Axiom (logs) + Sentry (errors) + Grafana Cloud (metrics) + Web Vitals reporting (BFS) | |
| Auth | Shopify App Bridge **session tokens** (short-lived, ~60s TTL) | BFS-required; no cookie/session-cookie auth |
| Hosting | Fly.io regions: SIN (primary), IAD, CDG | India team + global coverage |
| CI/CD | GitHub Actions → Fly.io blue-green deploy; Lighthouse CI + axe-core gates (see §14) | |

### 4.2 Shopify scopes requested at install

```
read_products, write_products
read_product_listings
read_orders, read_all_orders
read_themes, write_themes (for ThemeFile metafield writes only — NOT Liquid injection)
read_files, write_files
read_metaobject_definitions, write_metaobject_definitions
read_metaobjects, write_metaobjects
write_cart_transforms (Pro+ only; requested in step-up flow)
read_translations, write_translations
read_locales
read_markets
read_customers (for B2B in Stage 3)
```

**Explicitly NOT requested:**
- `write_script_tags` — Script Tags deprecate Aug 26 2026 for non-Plus; SC and Hulk are exposed here.
- `read_users`, `read_files_all` — overscoped.

### 4.3 Theme integration

**Single Theme App Extension** with:
- **One App Embed** (`options-loader.liquid`) — loads on PDP only via `enabled_on: ["product"]`, defers JS to `requestIdleCallback`.
- **One App Block** (`options-block.liquid`) — optional, for merchants who want to control widget placement in Theme Editor.

**Zero Script Tags.** Zero Liquid file modification. This is non-negotiable for BFS.

JS bundle target: **<60 KB gzipped** (BFS warns at >100 KB). Lazy-load file upload library and Konva.js only when option set needs them.

### 4.4 Upcharge mechanism — decision tree

```
On install: hidden variants (Globo/Hulk model)
On Pro+ upgrade: prompt to switch to Cart Transform Function
On detect a competitor CTF: our CTF can still run alongside it (one per app), but warn the merchant that two apps transforming the cart may conflict; recommend disabling the competitor's
On uninstall of competing CTF app: prompt to migrate
```

**Hidden variant path:**
- Tag: `optionforge-` prefix on SKU; excluded from analytics via merchant docs.
- Cap: 100 upcharge variants per product (Shopify allows 2,048 since 2024-04 GA + Oct 15 2025 universal rollout, but analytics pollution + admin UX degrade above 100).
- Cleanup: `app/uninstalled` webhook → BullMQ job deletes all `optionforge-` tagged variants over 7 days (throttled to respect API rate limits).

**Cart Transform Function path:**
- **One CTF per _app_ per store** (not one per shop). Multiple apps can each register their own CTF and **all of them run** — so a competitor's Cart Transform does **not** block ours. This is a correction to the original draft, which assumed a single shop-wide CTF.
- WASM size budget: <256 KB.
- Instruction budget: <11M instructions per cart call (Shopify Functions limit; the often-cited "50ms wall clock" is unofficial).
- Operations supported: expand a line item into bundled children, merge identical configurations, and update line-item presentation/attributes with structured option data.
- Note: `expand` marks the parent as a bundle (product type changes); document this for merchants whose theme/reporting keys off product type.

### 4.5 File uploads

- **Cloudflare R2** with signed URLs; merchant never sees raw URL.
- **180-day TTL** by default (longer than Easify's 90 days — competitive note). Premium plan supports perpetual storage.
- Chunked uploads for slow connections (Indian / SEA mobile networks). 5 MB chunks.
- Server-side virus scan via ClamAV before signed URL becomes accessible.
- MIME whitelist per option (e.g. images only for image upload field).
- HEIC → JPEG transcoding via libvips for iPhone uploads.

### 4.6 Data model (Postgres)

```sql
-- Shops
shops (
  id PK, shopify_domain UNIQUE, access_token ENCRYPTED,
  plan ENUM('free','pro','premium','enterprise'),
  shopify_plan TEXT, -- 'basic','shopify','advanced','plus'
  installed_at, uninstalled_at, currency, locale, timezone,
  cart_transform_id UNIQUE NULLABLE
)

-- Option sets
option_sets (
  id PK, shop_id FK, name, status ENUM('draft','active','archived'),
  applied_scope ENUM('all','collection','product','tag'),
  ai_generated BOOL, ai_generation_prompt TEXT NULLABLE,
  created_at, updated_at
)

options (
  id PK, option_set_id FK, type, label, position INT,
  required BOOL, validation_json JSONB,
  placeholder, help_text
)

option_values (
  id PK, option_id FK, label, value, position INT,
  swatch_color, swatch_image_url,
  addon_price_cents INT, addon_currency CHAR(3),
  addon_product_id BIGINT NULLABLE, -- linked Shopify product
  addon_variant_id BIGINT NULLABLE, -- auto-created hidden variant
  formula TEXT NULLABLE -- math.js expression
)

conditional_rules (
  id PK, option_id FK,
  predicate_json JSONB, -- AND/OR tree
  action ENUM('show','hide')
)

-- Mapping
product_mappings (
  option_set_id FK, shopify_product_id BIGINT NULL,
  shopify_collection_id BIGINT NULL,
  shopify_tag TEXT NULL,
  PRIMARY KEY (option_set_id, shopify_product_id, shopify_collection_id, shopify_tag)
)

-- Hidden variants registry
hidden_variants (
  id PK, shop_id FK, option_value_id FK,
  shopify_product_id BIGINT, shopify_variant_id BIGINT,
  price_cents INT, sku TEXT, created_at,
  pending_deletion BOOL DEFAULT FALSE
)

-- File uploads
file_uploads (
  id PK, shop_id FK, signed_url, public_url,
  file_size_bytes INT, mime_type, original_filename,
  scan_status ENUM('pending','clean','infected'),
  expires_at, created_at
)

-- Submissions (customer answers)
submissions (
  id PK, shop_id FK, order_id BIGINT NULLABLE,
  cart_token, payload_json JSONB,
  file_upload_ids BIGINT[], composite_preview_url NULLABLE,
  created_at
)

-- AI generations
ai_generations (
  id PK, shop_id FK, prompt TEXT, response_json JSONB,
  input_tokens INT, output_tokens INT, cost_usd_micros INT,
  accepted BOOL, option_set_id FK NULLABLE,
  created_at
)

-- Migration jobs
migration_jobs (
  id PK, shop_id FK, source ENUM('sc','shoppad','globo','easify','hulk'),
  status ENUM('queued','running','completed','failed','rolled_back'),
  detected_count INT, migrated_count INT,
  source_export_url TEXT, -- Google Drive backup
  rollback_until TIMESTAMPTZ,
  started_at, completed_at, error_json JSONB
)

-- Usage tracking
usage_events (
  id PK, shop_id FK, event_type, occurred_at, metadata JSONB
)

-- Templates (denormalized cache of Metaobject content)
templates (
  id PK, slug UNIQUE, name, category, locale,
  json_definition JSONB, preview_image_url,
  install_count INT, version INT
)
```

### 4.7 Webhooks subscribed

| Topic | Handler responsibility |
|---|---|
| `app/uninstalled` | Queue hidden-variant cleanup, mark shop deleted, retain data 90 days for GDPR |
| `app/scopes_update` | Re-validate scope set |
| `customers/data_request` | GDPR: package submissions, email to admin |
| `customers/redact` | GDPR: redact PII in submissions |
| `shop/redact` | GDPR: full shop data deletion (48-hour SLA) |
| `orders/create` | Move cart_token submissions → order_id |
| `orders/updated` | Sync edits |
| `orders/cancelled` | Mark submissions cancelled |
| `themes/publish` | Re-inject App Embed if needed; warn if vintage theme |
| `themes/update` | Same as above |
| `products/delete` | Cascade delete hidden variants tagged `optionforge-` |

### 4.8 Performance budgets

**Built for Shopify hard gates (official — measured by Shopify; see §18.2).** These are pass/fail for the badge, not internal targets:

| BFS metric | Threshold | Measurement |
|---|---|---|
| Admin **LCP** (Largest Contentful Paint) | **≤ 2.5 s** at p75 | Web Vitals via latest App Bridge; min 100 calls / 28 days |
| Admin **CLS** (Cumulative Layout Shift) | **≤ 0.1** at p75 | Web Vitals; min 100 calls / 28 days |
| Admin **INP** (Interaction to Next Paint) | **≤ 200 ms** at p75 | Web Vitals; min 100 calls / 28 days |
| Storefront speed impact | **≤ 10-point** Lighthouse drop | Shopify storefront audit |
| Backend request latency | **p95 ≤ 500 ms**, ≤ 0.1% failure | Min 1000 requests / 28 days |

**Internal engineering budgets (tighter than BFS, to leave headroom):**

| Metric | Target | Notes |
|---|---|---|
| App Embed JS gzipped size | <60 KB | BFS warns above 100 KB; lazy-load Konva/upload libs |
| PDP LCP delta | <50 ms | Beats Hulk (~150 ms with Script Tag fallback) |
| Network calls on PDP | 1 (option config JSON) | Cached for 5 min |
| Time-to-first-option-paint | <200 ms p95 | |
| Admin dashboard TTI | <1.5s p95 | Keeps admin LCP well under the 2.5 s BFS gate |
| AI generation E2E | <8s p95 | Including DeepSeek + DB writes |
| Cart Transform Function | <2M instructions per cart | <20% of Shopify budget |
| Webhook ack | <500ms | Push to BullMQ, ack synchronously |

### 4.9 Security

- All Admin GraphQL calls use session tokens (60s TTL), rotated per request.
- HMAC verification on every webhook.
- Shop access_token encrypted at rest (AES-256-GCM, key in Fly secrets).
- File uploads scanned (ClamAV) + MIME whitelisted.
- Formula evaluator sandboxed (`math.js` with no `Function`/`eval` exposure; output coerced to number).
- AI prompts sanitized (strip backticks, instruction-injection markers).
- Rate limits: 100 AI gens/hour/shop, 1000 admin API calls/min/shop.
- CSP headers on embedded admin.
- Pen-tested before public launch (Cobalt or similar).

### 4.10 Compliance

- GDPR: 48h data deletion SLA via `shop/redact`.
- CCPA: identical handling.
- Shopify Privacy & Compliance API integrated.
- DPA signed with merchants on Premium+ via clickwrap.
- SOC 2 Type I targeted by month 12.

---

## 5. Admin UI (Polaris)

### 5.1 Navigation

```
├── Dashboard (usage stats, recent submissions, AI generation log)
├── Option Sets (IndexTable: name, applied products, status, last modified)
│   └── Editor (visual builder; tabs: Options / Conditions / Pricing / Display)
├── Templates (gallery of 100+; filter by category/vertical)
├── AI Studio (prompt → preview → save flow; cost meter)
├── Migration (detect installed competitors; one-click import)
├── Submissions (search by order/customer/file)
├── Files (R2-backed; storage usage by plan)
├── Settings
│   ├── Plan & billing
│   ├── Display (where widget appears, mobile behavior)
│   ├── Notifications (email on submission)
│   ├── Languages
│   └── Advanced (Cart Transform toggle, hidden variant cleanup)
└── Help (in-app docs, contact support, changelog)
```

### 5.2 Onboarding flow (first 5 minutes)

1. **Welcome** — pick goal: "Custom products" / "Add-ons" / "Personalization" / "Migrate from another app"
2. If migration: skip to **Migration wizard** (detects competitor, shows preview, merchant approves)
3. If not: **AI Studio** opens with example prompt pre-filled
4. Generate first option set in <60 seconds
5. Assign to a product (auto-suggests their newest product)
6. Preview on storefront (opens in new tab with `?optionforge_preview=1`)
7. Done — checklist shows next steps (theme embed activation if not auto-enabled)

### 5.3 Visual editor

- Drag-and-drop reorder.
- Inline preview pane (right 50% of editor).
- Conditional logic builder (visual rule tree — no JSON).
- Bulk-edit values (paste from spreadsheet).
- Undo/redo (last 20 actions).
- Auto-save every 10 seconds.

---

## 6. Storefront Widget

### 6.1 Render strategy

- One JS module, deferred to `requestIdleCallback`.
- Mounted into a slot defined by the App Embed (default: just above the Add-to-Cart button via DOM query for `form[action*="/cart/add"]`).
- Mobile: collapsible by default below 768px; tap-to-expand.
- Live preview (Premium): sticky panel at top of viewport on mobile (fixes Globo's scroll-to-see-preview complaint).
- Add-to-cart hook: intercepts form submission, injects line item properties + hidden variant SKUs OR triggers Cart Transform.

### 6.2 Compatibility

- All BFS-certified themes (Dawn, Sense, Crave, Origin, Spotlight, Refresh, etc.).
- "Buy Now" / Shop Pay / Apple Pay / Google Pay / PayPal Express — all supported (fixes SC's dynamic-checkout incompatibility).
- Recharge / Bold Subscriptions — coexist; document tested combinations.
- Search & Discovery — coexist (fixes one Easify complaint).
- Vintage themes (Brooklyn / Debut) — refuse install with clear "upgrade to OS 2.0" CTA.

### 6.3 Cart edit flow

- Customer can edit options from cart drawer or `/cart` page.
- Edits trigger Cart Transform re-run or hidden variant swap.
- Files re-uploadable.

---

## 7. Order Display

### 7.1 Admin order page

- Line item properties shown natively.
- Premium: structured table (option label, value, file preview thumbnail, formula breakdown).
- Composite preview image (Konva.js export) attached as order asset.

### 7.2 Packing slip (Premium)

- Shopify Order Printer App Extension (GA 2024-10).
- Custom Liquid template emitted by OptionForge that warehouse staff can parse: bullet list per option, file thumbnails, formula breakdown.
- Fixes ShopPad Infinite Options' #1 long-tenured complaint.

### 7.3 Order confirmation email

- Native Shopify email includes line item properties.
- OptionForge does NOT send its own email (avoid spam).

---

## 8. Roadmap

### Stage 1 — MVP (weeks 1–8)

**Goal:** Ship a BFS-ready app with AI generation and SC + ShopPad migration; 50 installs in first 30 days.

- Week 1–2: Shopify CLI scaffold (React Router 7 app package), Polaris web-components admin shell, latest App Bridge, OAuth flow, shop install, mandatory compliance webhooks wired (§18.4)
- Week 2–3: Database schema, option set CRUD, 15 option types
- Week 3–4: Theme App Extension (App Embed), storefront widget (WCAG 2.2 AA from day one — §15), hidden variant generation
- Week 4–5: AI Studio (DeepSeek integration, prompt → option set)
- Week 5–6: SC Product Options migration wizard (parse `bold-options-hybrid.liquid`) **and ShopPad Infinite Options wizard** (metafields + linked add-on products)
- Week 6–7: Polaris IndexTable polish, conditional logic editor, visible admin editor preview (§5.3 / BFS 4.2.6), file uploads (R2)
- Week 7: Billing (Shopify Billing API), Free + Pro plans, 14-day trial
- Week 7–8: BFS self-audit (Web Vitals LCP/CLS/INP, storefront Lighthouse, JS size, scope minimization, a11y via axe-core — §14/§18), Protected Customer Data review (§18.3), beta launch to 5 friendly merchants
- Week 8: App Store submission

### Stage 2 — Differentiation (weeks 9–20)

**Goal:** Cart Transform + live preview + all 5 migrations; reach 500 installs and BFS badge.

- Cart Transform Function (Rust/WASM), upgrade prompt from hidden variants
- Live preview (Konva.js), composite export
- Formula pricing (sandboxed math.js)
- Migration wizards for Globo, Easify, Hulk (SC + ShopPad already shipped in Stage 1)
- Premium plan launch ($19.99)
- 100+ templates (curated by hand, stored as Metaobjects)
- Hindi + Vietnamese admin UI
- Order Printer App Extension for packing slips
- BFS application submitted

### Stage 3 — Moat (weeks 21–52)

**Goal:** Defensible feature set; 2,500 installs, 4.8★ rating, Enterprise plan revenue.

- Shopify POS UI Extension
- B2B Companies API integration, quote-builder
- Hydrogen component library (`@optionforge/hydrogen`)
- AI option-set generation v2: image-to-image (upload product photo → suggest options based on visual)
- White-glove Enterprise migration (done-with-you)
- Advanced analytics dashboard (conversion by option, revenue per option set)
- SOC 2 Type I

---

## 9. Go-to-Market

### 9.1 Target segments (priority order)

1. **Stores currently on SC Product Options (~12,881)** — vulnerable due to no BFS + dynamic checkout button incompatibility + Liquid injection. Migration wizard is the lever.
2. **Stores currently on Hulk Product Options (~19,317)** — declining QoQ + Script Tag deprecation (Aug 2026) + long-tenured 1★ reviews unresolved.
3. **New stores** — onboarding via AI generation gets them live in 5 minutes vs 2-6 hours on competitors.
4. **Indian Shopify Plus merchants (~3,000 stores)** — Hindi admin + INR billing + same-price-on-Plus pledge.

### 9.2 Launch channels

- Shopify App Store SEO (focus on "product options" + "custom options" + "migrate from Bold")
- Shopify Partner directory listing
- Content (deodap blog + YouTube): "How to migrate from Bold Product Options in 60 seconds", "AI-generated product options for jewelry stores"
- Reddit r/shopify, Facebook Shopify groups (India + global)
- Direct outreach to SC/Hulk merchants identified via Store Leads (cold email, white-glove migration offer)
- Shopify Plus partner co-marketing (apply after 200 installs)

### 9.3 Pricing experiments

- A/B Pro at $7.99 vs $9.99 in first 90 days.
- 20% annual discount → test 25% in Stage 2.
- Migration fee waiver: test "Free for all" vs "Free for paid plans only".

---

## 10. Success Metrics

### 10.1 Product (track weekly)

| Metric | Stage 1 target | Stage 2 target | Stage 3 target |
|---|---|---|---|
| Installs | 50 | 500 | 2,500 |
| Free→paid conversion | 2% | 4% | 5% |
| Day-7 retention (paid) | 70% | 80% | 85% |
| Day-30 retention (paid) | 50% | 65% | 75% |
| App Store rating | 4.5★ | 4.7★ | 4.8★+ |
| Support tickets / install / month | <1.5 | <0.8 | <0.4 |
| AI generation acceptance rate | 50% | 65% | 75% |
| Migration completion rate | 70% | 85% | 90% |

### 10.2 Technical (track per release)

| Metric | Target |
|---|---|
| Theme App Extension JS bundle size | <60 KB gzipped |
| PDP LCP delta | <50 ms |
| Admin TTI p95 | <1.5s |
| AI generation p95 latency | <8s |
| Webhook ack p95 | <500ms |
| Uptime | 99.9% |
| Cart Transform p95 instruction count | <2M |

### 10.3 Business

- MRR by month 6: $5,000
- MRR by month 12: $25,000
- LTV / CAC: >5
- Support cost per install per month: <$0.40

---

## 11. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Easify replicates AI generation | High | High | Move fast; ship image-to-image v2 by month 9; lock in template library moat |
| DeepSeek pricing increases 10× or API outage | Medium | Medium | Abstract LLM provider behind one `LLMProvider` interface; fall back to GPT-4o-mini, Claude Haiku 4.5, or self-hosted Llama 3.1 8B |
| `deepseek-chat` alias retires (July 24, 2026) | High | Low | Pin the explicit versioned model (`deepseek-v3.2`/V4); provider abstraction makes the swap config-only; CI smoke-test validates JSON-schema adherence on model change |
| Shopify changes Theme App Extension API | Medium | High | Maintain test suite against Shopify partner sandbox; subscribe to changelog |
| Cart Transform Function single-instance limit blocks adoption | High | Medium | Hidden-variant fallback always available; detect conflicts at install |
| Migration wizard miss-maps complex SC config | High | Medium | 30-day reversibility; manual review of first 50 migrations |
| BFS badge revoked on LCP audit | Low | High | Weekly Lighthouse CI; budget alerts; theme-specific testing matrix |
| GDPR fines from late `shop/redact` | Low | Critical | Automated test; alerting on missed SLA |
| Shop Circle sunsets SC, forcing migration to OptionForge competitor instead | Medium | High | Move first on SC migration tooling (Stage 1); build brand before consolidation |
| Indian developer hiring slow | Medium | Medium | Remote-first; tap Rajkot/Ahmedabad Shopify community; partner with deodap network |
| Cloudflare R2 outage corrupts customer files | Low | High | Daily backup to S3 cold storage; documented RTO 24h |

---

## 12. Team & Cost

### 12.1 Team (Rajkot-based, lean)

- 1× Tech Lead / Backend (Remix + Postgres + Cart Transform Rust)
- 1× Frontend / Polaris developer
- 1× Storefront / Theme App Extension developer (also handles QA)
- 1× Designer / Polaris UX (part-time, can be contractor)
- 1× Founder / GTM / Support (deodap marketplace owner)

### 12.2 Monthly run cost (Stage 1)

| Item | Monthly $ |
|---|---|
| Fly.io (3 regions, Postgres, Redis) | $250 |
| Cloudflare R2 (1 TB storage + zero egress) | $15 |
| Upstash Redis | $50 |
| DeepSeek (avg 5,000 generations @ ~$0.0004) | $2 |
| Axiom + Sentry + Grafana | $100 |
| GitHub Actions / CI | $40 |
| Shopify Partner / sandbox stores | $0 (free for dev) |
| Domain + email + misc | $30 |
| **Total infra** | **~$490** |

Team cost dominates; expect $8,000–$15,000/month in Rajkot for 4-5 person team. Break-even at ~1,500 paid installs at $9.99 avg.

---

## 13. Open Decisions (to confirm before kickoff)

1. **App name** — OptionForge is placeholder. Finalize before App Store submission (week 7). Trademark search required.
2. **Pricing trial length** — 14 days (category standard) vs 21 days (more aggressive). Recommendation: 14.
3. **AI model choice** — DeepSeek, pinned to the explicit versioned model (`deepseek-v3.2`, since the bare `deepseek-chat` alias retires July 24, 2026) — cheap, OpenAI-compatible, strong JSON adherence. Stage 2 A/B: Claude Haiku 4.5 on Premium tier for quality-sensitive prompts.
4. **Migration: include Easify?** — Migrating away from the architectural leader is harder to pitch. Recommendation: ship the wizard but don't market it.
5. **Open source the Hydrogen components?** — MIT license to drive Hydrogen adoption. Recommendation: yes (Stage 3).
6. **Self-host vs Shopify Files for templates** — Templates use Metaobjects; preview images on R2. Confirmed.
7. **Support hours coverage** — India business hours only, or 24/7 via offshored shifts? Recommendation: India hours + email-only outside; upgrade to 24/7 chat at Premium tier in Stage 2.

---

## 14. Quality Assurance & Testing

The original draft had no automated test gate — the only static check is `npm run typecheck`. A custom-options app that mutates the cart and checkout cannot ship on type-checking alone, and BFS/App-Store review reward reliability. This section closes that gap.

### 14.1 Test pyramid

- **Unit (Vitest):** pure logic — the sandboxed `math.js` formula evaluator, the conditional-rule predicate engine, price/upcharge computation, the JSON-as-text parsers (`safeJson`), and each migration mapper. Target ≥80% line coverage on `app/lib/`.
- **Integration:** React Router/Remix loaders & actions against an ephemeral Postgres (Testcontainers), Admin GraphQL stubbed with recorded fixtures, Prisma migrations applied fresh per run.
- **Migration contract tests:** golden fixtures of real SC / ShopPad / Globo / Easify / Hulk configs → assert deterministic OptionForge output. Each importer (`detect` + async-generator `import`) is tested in isolation; imports must never mutate the source app.
- **End-to-end (Playwright on a dev store):** install → AI-generate → assign to product → storefront renders widget → add to cart → line-item properties / hidden variant present → order shows options. Plus the migration wizard and the billing upgrade/trial flow.
- **Shopify Functions:** `function-runner` + `cargo test` on the Cart Transform with recorded cart inputs; assert instruction count stays under the 2M budget.
- **Storefront widget:** jsdom unit tests + Playwright across the top BFS themes (Dawn, Sense, Refresh) and one vintage theme (assert graceful refuse-to-install).

### 14.2 Non-functional CI gates

- **Lighthouse CI** on a seeded storefront — fail the build if the storefront score drops >10 points (BFS gate) or the App Embed JS exceeds 60 KB gzipped.
- **axe-core** scan on admin + widget — fail on WCAG 2.2 A/AA violations (see §15).
- **Load test (k6)** on `proxy.options` and `proxy.submit` — p95 < 500 ms at expected peak (BFS backend gate).
- **Webhook tests:** HMAC verification, 401 on bad/unknown shop, and idempotent replay/duplicate-delivery handling.
- `npm run typecheck` stays the fast inner-loop gate; everything above runs in GitHub Actions.

### 14.3 Release QA

- Manual **BFS pre-submission checklist** (Web Vitals, clean install/uninstall, scope minimization, zero console errors, responsive/mobile).
- Cross-theme visual QA matrix.
- The **first 50 migrations** are manually reviewed (per the risk register) before automation is fully trusted.
- A staging shop cohort receives every release 24h before production (see §17 canary).

---

## 15. Accessibility (WCAG 2.2 AA)

Accessibility is both a Shopify Design-pillar expectation and a genuine competitive gap — none of the five incumbents do it well. Target **WCAG 2.2 AA** across admin and storefront.

### 15.1 Admin

Polaris web components are accessible by default; preserve their semantics, keep visible focus, label every field, and use the error-summary pattern on forms. The visual rule builder and drag-and-drop reorder must have a keyboard-operable alternative (move up/down controls plus an ARIA live region announcing the new position).

### 15.2 Storefront widget (the differentiator)

- Every custom control is keyboard-operable: swatches as a radio group (arrow-key navigation), range sliders with `aria-valuenow`, file upload with visible focus and a screen-reader status message.
- Color/image swatches never rely on color alone — each carries a text label and `aria-label`; contrast ≥3:1 for UI, ≥4.5:1 for text.
- `prefers-reduced-motion` is respected for live-preview transitions.
- Full **RTL** support for Arabic via logical CSS properties (matches the 15-language storefront claim in §2.9).
- Validation errors are programmatically associated with their field; required fields are announced.
- The live preview ships a text alternative / screen-reader summary of the configured product.

### 15.3 Testing

axe-core runs in CI (§14.2); manual NVDA (Windows) and VoiceOver (iOS/macOS) passes are required before any storefront-affecting release, and a keyboard-only walkthrough is part of the E2E suite.

---

## 16. Analytics & Event Taxonomy

The §10 metrics (activation funnel, conversion, AI acceptance, retention) require an explicit event model. **No customer PII enters product analytics** (Protected Customer Data — §18.3); events are keyed by shop and anonymized identifiers only.

### 16.1 Tooling

- **Product analytics:** PostHog (self-hostable, EU region) or Amplitude, ingested **server-side** from the app server and BullMQ worker — never from the storefront — to avoid both performance cost and PII leakage.
- **Warehouse:** events plus the `usage_events` table pipe to BigQuery/Postgres for cohort and retention analysis.
- Operational metrics (Grafana/Sentry/Axiom) stay separate from product analytics.

### 16.2 Canonical event taxonomy (shop-scoped, no customer PII)

| Event | Key properties |
|---|---|
| `app_installed` / `app_uninstalled` | shop, shopify_plan |
| `onboarding_step_completed` | step |
| `option_set_created` | ai_generated (bool) |
| `ai_generation_requested` / `_succeeded` / `_accepted` | input_tokens, output_tokens, cost_usd_micros, latency_ms |
| `migration_detected` / `_started` / `_completed` / `_rolled_back` | source, detected_count, migrated_count |
| `option_set_assigned` | scope (all/collection/product/tag) |
| `widget_rendered` | shop, product (aggregate counts only) |
| `submission_created` | option_ids, counts — **no answer payload, no PII** |
| `upgrade_started` / `subscription_activated` / `downgraded` / `churned` | plan |

### 16.3 Funnels & privacy guardrail

- **Activation:** install → onboarding complete → first option set assigned → first storefront render → first order with options.
- **AI:** requested → succeeded → accepted (the acceptance-rate metric in §10).
- **Migration:** detected → started → completed (the completion-rate metric in §10).
- **Guardrail:** event properties are allowlisted; a CI test rejects any event carrying `email`/`phone`/`address`/`name` keys.

---

## 17. Reliability, Disaster Recovery & Release Management

### 17.1 Backup & DR

- **Postgres:** continuous WAL archiving (point-in-time recovery) + daily snapshots, 30-day retention, replicated to a second region. **RPO ≤ 5 min, RTO ≤ 4 h.**
- **Cloudflare R2:** daily backup to S3 cold storage (per risk register), 180-day lifecycle, documented restore runbook (RTO 24 h).
- **Encryption keys** (AES-256-GCM) live in Fly secrets with a documented rotation + escrow procedure. Losing the key means losing every shop access token, so key backup is treated as a Sev-1 concern.
- **Quarterly restore drills:** restore a production snapshot into staging and verify integrity.

### 17.2 Release management

- **Trunk-based development;** every merge to main runs the §14 gates.
- **Fly.io blue-green deploys** with health-checked cutover and instant rollback to the prior release.
- **Expand/contract DB migrations** (add backward-compatible → deploy → backfill → remove old) so a rollback never breaks the running release; Prisma migrations are forward-only in production.
- **Feature flags** (self-hosted Flagsmith or LaunchDarkly) gate risky surfaces — the Cart Transform switch, live preview, each migration importer, and any new AI model — for cohort/canary rollout and instant kill-switch.
- **Canary path:** staging cohort → 5% of shops → 100%, with Web Vitals and error-budget checks between stages.
- **Kill-switches:** AI generation, migration jobs, and file scanning can each be disabled by flag without a redeploy (the app already degrades gracefully on a null queue/storage).

### 17.3 Incident response & SLOs

- **SLOs:** 99.9% app uptime; webhook processing success ≥ 99.5%; AI p95 < 8 s — tracked against a monthly error budget.
- **On-call** rotation (India hours + escalation), Sentry alerting, public status page.
- **Webhook reliability:** handlers are idempotent (keyed by webhook id) and safe to replay since Shopify auto-retries; a periodic backfill job reconciles any missed events.
- The mandatory `shop/redact` 48 h SLA (§18.4) is alarmed on any miss.

---

## 18. Shopify Public App Compliance

Consolidates every requirement OptionForge must meet to list and remain a Shopify **Public App** and to earn/keep the **Built for Shopify (BFS)** badge. Verified against shopify.dev on 2026-06-14.

### 18.1 App Store listing & review

- Truthful, accurate listing — a merchant can tell from it whether the app fits. Concise description, high-quality screenshots, demo video.
- Delivers novel, feature-complete functionality (admin UI blocks/actions/links must be complete, not stubs).
- **GraphQL Admin API only** — REST is banned for new public apps since **April 1, 2025**; already enforced via `future.removeRest: true`.
- Mandatory compliance webhooks + `app/uninstalled` configured before submission (§18.4).
- Budget for **2–3 review rounds, ~4–6 weeks** to listing.
- No deceptive UX: no fake urgency timers, no review-pressure ("leave a 5-star review to unlock"), no modals auto-popping on page load, and onboarding must not imply that installing another app is required (BFS Design rules).

### 18.2 Built for Shopify criteria (mapping)

- **Prerequisites:** ongoing App Store compliance, good Partner standing, demonstrable merchant utility, and minimum install / review / rating thresholds (**≥ 5 reviews** is explicit, plus a minimum install count and a category rating bar).
- **Performance gates** (the §4.8 hard gates): admin **LCP ≤ 2.5 s, CLS ≤ 0.1, INP ≤ 200 ms** at p75 via the latest App Bridge Web Vitals; **storefront Lighthouse impact ≤ 10 points**; backend **p95 ≤ 500 ms** at ≤ 0.1% failure over ≥ 1000 requests/28 days.
- **Integration:** embedded in admin via the latest App Bridge (`app-bridge.js` in `<head>`), session-token auth, primary workflows completable inside the admin, and clean install/uninstall via the Theme App Extension (no Liquid injection; app blocks auto-removed on uninstall).
- **Design:** familiar/helpful/user-friendly, responsive/mobile, **visible previews** (editor + preview simultaneously on desktop — §5.3), and **label-and-disable** (not hide) premium features with an upgrade link.

### 18.3 Protected Customer Data (PCD)

- Access is requested through the Partner Dashboard and requires Shopify approval on non-development stores.
- **Data minimization:** OptionForge stores customer-entered option *values*, not core identity PII, by default. If an option captures email/phone/name/address (e.g. an Email or Phone field), those become **protected customer fields** needing additional approval and stricter controls — encrypted backups, separate test vs production data, documented retention, access logging, and applying merchant/customer consent and opt-out decisions.
- **Transparency:** a published privacy policy and a clear statement of purpose-of-use shown to merchants; honor all data-subject requests.
- OptionForge uses **no Web Pixels**, so the Dec 10 2025 web-pixel PII enforcement does not apply; if pixels are added later, the corresponding protected scopes must be requested first.

### 18.4 Mandatory compliance (GDPR/CCPA) webhooks

- Three required topics, configured via `compliance_topics` in `shopify.app.toml`: **`customers/data_request`**, **`customers/redact`**, **`shop/redact`** (the last fired **48 h after uninstall**), plus `app/uninstalled`.
- Every handler verifies the **HMAC** and returns **401** on failure or an unknown shop.
- `shop/redact` runs full shop data deletion within the **48 h SLA**; `customers/redact` redacts PII in submissions; `customers/data_request` packages and returns a customer's stored option data. Post-uninstall data is retained only as long as legally required, then purged.
- These are required for **any** App Store app, whether or not it collects personal data.

### 18.5 Billing

- All subscription billing runs through the **Shopify Billing API** (GraphQL `appSubscriptionCreate`; usage records for metered AI overages) — merchants pay via their Shopify invoice. No off-Shopify payment for the app subscription (a policy violation that risks delisting).
- The 14-day trials and the **annual 20%-off** terms are implemented via the Billing API; displayed prices match the listing; plan changes are prorated per Shopify rules.
- Any usage-based charge (e.g. AI generations beyond plan) is declared transparently.

### 18.6 Acceptable use, security & API terms

- Comply with the Partner Program Agreement, the Shopify API License & Terms of Use, and the Acceptable Use Policy.
- Least-privilege scopes (§4.2); no `write_script_tags`; step-up scope requests (e.g. `write_cart_transforms` only on Pro+).
- Security per §4.9 (encrypted tokens, HMAC, sandboxed formula evaluator, ClamAV, CSP, rate limits) and compliance per §4.10 (GDPR 48 h deletion, CCPA, SOC 2 Type I targeted by month 12).

---

## 19. References

- Built for Shopify requirements: shopify.dev/docs/apps/launch/built-for-shopify/requirements (admin Web Vitals LCP ≤ 2.5 s / CLS ≤ 0.1 / INP ≤ 200 ms at p75; storefront ≤ 10-pt Lighthouse impact; backend p95 ≤ 500 ms over ≥ 1000 req/28 days; ≥ 5 reviews; clean uninstall via Theme App Extension; visible previews §4.2.6)
- App Store requirements & review process: shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements; shopify.dev/docs/apps/launch/app-store-review/review-process
- Protected customer data: shopify.dev/docs/apps/launch/protected-customer-data (web-pixel PII enforcement Dec 10 2025)
- Privacy-law compliance & mandatory webhooks: shopify.dev/docs/apps/build/compliance/privacy-law-compliance (`customers/data_request`, `customers/redact`, `shop/redact` via `compliance_topics`)
- GraphQL Admin API mandatory for new public apps since April 1, 2025
- React Router app package (Shopify's recommended framework; Remix merged into React Router 7): shopify.dev/docs/api/shopify-app-react-router
- Polaris web components & App Bridge: shopify.dev/docs/api/app-bridge; polaris.shopify.com
- Shopify Functions / Cart Transform (one CTF per app per store; multiple apps' CTFs coexist): shopify.dev/docs/api/functions/latest/cart-transform
- ScriptTag legacy/blocking timeline: shopify.dev/docs/apps/build/online-store/blocking-script-tags (blocked Feb 1 2025; order-status scripts sunset Aug 28 2025)
- Theme App Extensions: shopify.dev/docs/apps/build/online-store/theme-app-extensions
- Variant limit (2,048): Shopify changelog Oct 15 2025
- Order Printer App Extensions: shopify.dev/docs/api/admin-extensions/order-printer (GA 2024-10)
- Shopify Billing API: shopify.dev/docs/apps/launch/billing
- DeepSeek pricing & API docs (V3.2 ≈ $0.28 / $0.42 per 1M in/out; bare `deepseek-chat` alias retires July 24 2026): api-docs.deepseek.com/quick_start/pricing
- Reference research (deep-dive of top 5 competitors): Anthropic compass artifact dated May 22 2026

---

*End of blueprint v2.0. Next step: walk through Sections 1–4 with engineering, lock pricing in Section 3, confirm open decisions in Section 13, validate the compliance checklist in Section 18 with whoever owns the Partner account, then kick off Stage 1 sprint planning.*
