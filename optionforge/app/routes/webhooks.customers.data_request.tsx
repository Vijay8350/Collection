import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// GDPR: respond within 30 days. We package customer data and email the merchant.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  const customerId = (payload as any)?.customer?.id;
  const shopRecord = await prisma.shop.findUnique({ where: { shopifyDomain: shop } });
  if (!shopRecord || !customerId) return new Response();

  const submissions = await prisma.submission.findMany({
    where: {
      shopId: shopRecord.id,
      payloadJson: { contains: String(customerId) },
    },
  });

  console.log(`[customers/data_request] ${shop} customer=${customerId} matches=${submissions.length}`);
  // TODO: email package to merchant or store admin contact.
  return new Response();
};
