import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate, PLAN_BY_NAME, type InternalPlan } from "../shopify.server";
import prisma from "../db.server";

// Keeps Shop.plan in sync when a subscription changes outside our settings page
// (merchant cancels from the Shopify admin, trial expires, charge frozen, etc.).
const INACTIVE_STATUSES = ["CANCELLED", "EXPIRED", "DECLINED", "FROZEN"];

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`[${topic}] received for ${shop}`);

  const sub = (payload as { app_subscription?: { name?: string; status?: string } })
    .app_subscription;
  const status = sub?.status ?? "";
  const name = sub?.name ?? "";

  const shopRecord = await prisma.shop.findUnique({ where: { shopifyDomain: shop } });
  if (!shopRecord) return new Response();

  let plan: InternalPlan = shopRecord.plan as InternalPlan;
  if (status === "ACTIVE") {
    plan = PLAN_BY_NAME[name]?.plan ?? plan;
  } else if (INACTIVE_STATUSES.includes(status)) {
    plan = "free";
  }

  if (plan !== shopRecord.plan) {
    await prisma.shop.update({ where: { id: shopRecord.id }, data: { plan } });
  }

  return new Response();
};
