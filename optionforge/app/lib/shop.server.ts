import prisma from "../db.server";
import { encryptToken } from "./crypto.server";

const AI_QUOTAS: Record<string, number> = {
  free: Number(process.env.AI_GEN_PER_MONTH_FREE ?? 5),
  pro: Number(process.env.AI_GEN_PER_MONTH_PRO ?? 50),
  premium: Number(process.env.AI_GEN_PER_MONTH_PREMIUM ?? 500),
  enterprise: Number.POSITIVE_INFINITY,
};

export function getAiQuota(plan: string): number {
  return AI_QUOTAS[plan] ?? AI_QUOTAS.free;
}

// Plan limits (Blueprint §3). Enforced server-side so the API can't be used to
// bypass the UI — a public-app review requirement. env-overridable.
const OPTION_SET_LIMITS: Record<string, number> = {
  free: Number(process.env.OPTION_SETS_FREE ?? 5),
  pro: Number.POSITIVE_INFINITY,
  premium: Number.POSITIVE_INFINITY,
  enterprise: Number.POSITIVE_INFINITY,
};

const OPTIONS_PER_SET_LIMITS: Record<string, number> = {
  free: Number(process.env.OPTIONS_PER_SET_FREE ?? 15),
  pro: Number(process.env.OPTIONS_PER_SET_PRO ?? 25),
  premium: Number(process.env.OPTIONS_PER_SET_PREMIUM ?? 28),
  enterprise: Number.POSITIVE_INFINITY,
};

export function getOptionSetLimit(plan: string): number {
  return OPTION_SET_LIMITS[plan] ?? OPTION_SET_LIMITS.free;
}

export function getOptionsPerSetLimit(plan: string): number {
  return OPTIONS_PER_SET_LIMITS[plan] ?? OPTIONS_PER_SET_LIMITS.free;
}

/** True when the shop has reached its plan's option-set cap. */
export async function isOptionSetLimitReached(shop: { id: string; plan: string }) {
  const limit = getOptionSetLimit(shop.plan);
  if (!Number.isFinite(limit)) return { reached: false, limit };
  const count = await prisma.optionSet.count({ where: { shopId: shop.id } });
  return { reached: count >= limit, limit, count };
}

/** True when an option set has reached its plan's per-set option cap. */
export async function isOptionLimitReached(shop: { plan: string }, optionSetId: string) {
  const limit = getOptionsPerSetLimit(shop.plan);
  if (!Number.isFinite(limit)) return { reached: false, limit };
  const count = await prisma.option.count({ where: { optionSetId } });
  return { reached: count >= limit, limit, count };
}

// Migration tooling pricing (Blueprint §2.7 / §3):
// - Free on Pro / Premium / Enterprise (no time limit).
// - Free-tier merchants: free for the first 90 days post-install, then a
//   $49 one-time fee thereafter.
const MIGRATION_FREE_DAYS = Number(process.env.MIGRATION_FREE_DAYS ?? 90);
const MIGRATION_ONE_TIME_FEE_USD = Number(process.env.MIGRATION_FEE_USD ?? 49);

export type MigrationEntitlement =
  | { entitled: true; reason: "included" }
  | { entitled: true; reason: "free_trial"; freeUntil: Date }
  | { entitled: false; reason: "fee_required"; feeUsd: number };

export function getMigrationEntitlement(shop: {
  plan: string;
  installedAt: Date;
}): MigrationEntitlement {
  if (shop.plan !== "free") {
    return { entitled: true, reason: "included" };
  }
  const freeUntil = new Date(
    shop.installedAt.getTime() + MIGRATION_FREE_DAYS * 24 * 60 * 60 * 1000,
  );
  if (Date.now() < freeUntil.getTime()) {
    return { entitled: true, reason: "free_trial", freeUntil };
  }
  return { entitled: false, reason: "fee_required", feeUsd: MIGRATION_ONE_TIME_FEE_USD };
}

export async function getShopByDomain(domain: string) {
  const shop = await prisma.shop.findUnique({ where: { shopifyDomain: domain } });
  if (!shop) {
    throw new Response(`Shop ${domain} not found`, { status: 404 });
  }
  return shop;
}

export async function ensureShopRecord(domain: string, accessToken: string) {
  const existing = await prisma.shop.findUnique({ where: { shopifyDomain: domain } });
  if (existing) {
    // Refresh token in case it rotated.
    if (existing.uninstalledAt) {
      await prisma.shop.update({
        where: { id: existing.id },
        data: { uninstalledAt: null, accessTokenEnc: encryptToken(accessToken) },
      });
    }
    return existing;
  }
  return prisma.shop.create({
    data: {
      shopifyDomain: domain,
      accessTokenEnc: encryptToken(accessToken),
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });
}

export async function isQuotaExceeded(shop: { id: string; plan: string }) {
  const quota = getAiQuota(shop.plan);
  if (!Number.isFinite(quota)) return { exceeded: false, quota };
  const used = await prisma.aiGeneration.count({
    where: {
      shopId: shop.id,
      createdAt: { gte: new Date(new Date().setDate(1)) },
    },
  });
  return { exceeded: used >= quota, quota };
}
