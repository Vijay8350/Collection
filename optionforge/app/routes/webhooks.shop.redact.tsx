import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// GDPR: shop fully redacted 48 hours after uninstall. We must wipe everything.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request);
  const shopRecord = await prisma.shop.findUnique({ where: { shopifyDomain: shop } });
  if (!shopRecord) return new Response();

  // Cascade-delete via FK. Order matters only for unrelated tables.
  await prisma.shop.delete({ where: { id: shopRecord.id } });
  await prisma.session.deleteMany({ where: { shop } });

  console.log(`[shop/redact] ${shop} fully deleted`);
  return new Response();
};
