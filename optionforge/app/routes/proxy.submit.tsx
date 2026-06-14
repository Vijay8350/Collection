import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Storefront posts the configured options here before add-to-cart.
// We return any auto-created hidden variant IDs to inject as add-on line items.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  const shopDomain = session?.shop;
  if (!shopDomain) return json({ error: "no session" }, { status: 401 });

  const shop = await prisma.shop.findUnique({ where: { shopifyDomain: shopDomain } });
  if (!shop) return json({ error: "shop not found" }, { status: 404 });

  const body = await request.json();
  const { productId, cartToken, payload } = body as {
    productId: string;
    cartToken: string;
    payload: Record<string, unknown>;
  };

  await prisma.submission.create({
    data: {
      shopId: shop.id,
      cartToken,
      payloadJson: JSON.stringify(payload),
      fileUploadIds: "[]",
    },
  });

  // TODO: compute add-on variant IDs from payload selections and return them
  // so the storefront can add them to cart alongside the base product.
  return json({ ok: true, addonVariantIds: [] });
};
