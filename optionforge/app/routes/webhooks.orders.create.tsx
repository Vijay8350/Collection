import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Move cart_token-keyed submissions to order_id when checkout completes.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  const cartToken = (payload as any)?.cart_token;
  const orderId = String((payload as any)?.id ?? "");
  if (!cartToken || !orderId) return new Response();

  const shopRecord = await prisma.shop.findUnique({ where: { shopifyDomain: shop } });
  if (!shopRecord) return new Response();

  await prisma.submission.updateMany({
    where: { shopId: shopRecord.id, cartToken },
    data: { orderId },
  });

  return new Response();
};
