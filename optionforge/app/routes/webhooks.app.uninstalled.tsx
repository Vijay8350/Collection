import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { enqueueHiddenVariantCleanup } from "../lib/queue.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`[${topic}] received for ${shop}`);

  if (session) {
    await prisma.session.deleteMany({ where: { shop } });
  }

  const shopRecord = await prisma.shop.findUnique({ where: { shopifyDomain: shop } });
  if (shopRecord) {
    await prisma.shop.update({
      where: { id: shopRecord.id },
      data: { uninstalledAt: new Date() },
    });
    // Queue cleanup of hidden upcharge variants (throttled across 7 days).
    await enqueueHiddenVariantCleanup(shopRecord.id);
  }

  return new Response();
};
