import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// GDPR: redact PII for a specific customer within 30 days.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  const customerId = String((payload as any)?.customer?.id ?? "");
  const shopRecord = await prisma.shop.findUnique({ where: { shopifyDomain: shop } });
  if (!shopRecord || !customerId) return new Response();

  const matches = await prisma.submission.findMany({
    where: {
      shopId: shopRecord.id,
      payloadJson: { contains: customerId },
    },
  });

  for (const m of matches) {
    await prisma.submission.update({
      where: { id: m.id },
      data: { payloadJson: JSON.stringify({ redacted: true, redactedAt: new Date().toISOString() }) },
    });
  }

  console.log(`[customers/redact] ${shop} customer=${customerId} redacted=${matches.length}`);
  return new Response();
};
