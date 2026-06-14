import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Storefront-facing endpoint served via Shopify App Proxy.
// URL on storefront: /apps/optionforge/options/{productId}
// The theme widget fetches this JSON to render fields.
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { liquid, session, storefront } = await authenticate.public.appProxy(request);
  const shopDomain = session?.shop;
  if (!shopDomain) return json({ error: "no session" }, { status: 401 });

  const shop = await prisma.shop.findUnique({ where: { shopifyDomain: shopDomain } });
  if (!shop) return json({ options: [] });

  const productId = params.productId;

  const mappings = await prisma.productMapping.findMany({
    where: {
      OR: [
        { shopifyProductId: productId },
        { shopifyProductId: null }, // global sets (appliedScope=all)
      ],
    },
    include: {
      optionSet: {
        include: {
          options: {
            orderBy: { position: "asc" },
            include: {
              values: { orderBy: { position: "asc" } },
              conditionalRules: true,
            },
          },
        },
      },
    },
  });

  const activeSets = mappings
    .map((m) => m.optionSet)
    .filter((os) => os && os.shopId === shop.id && os.status === "active");

  return json(
    {
      productId,
      optionSets: activeSets.map((os) => ({
        id: os!.id,
        name: os!.name,
        options: os!.options.map((o) => ({
          id: o.id,
          type: o.type,
          label: o.label,
          required: o.required,
          placeholder: o.placeholder,
          helpText: o.helpText,
          validation: safeJson(o.validationJson),
          values: o.values.map((v) => ({
            id: v.id,
            label: v.label,
            value: v.value,
            addonPriceCents: v.addonPriceCents,
            swatchColor: v.swatchColor,
            swatchImageUrl: v.swatchImageUrl,
          })),
          conditionalRules: o.conditionalRules.map((r) => ({
            predicate: safeJson(r.predicateJson),
            action: r.action,
          })),
        })),
      })),
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300", // 5 minutes
        "Content-Type": "application/json",
      },
    },
  );
};

function safeJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return {};
  }
}
