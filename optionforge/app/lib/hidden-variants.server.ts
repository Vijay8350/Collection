import prisma from "../db.server";

// ─────────────────────────────────────────────────────────
// Hidden upcharge variants — Globo/Hulk model
// Blueprint §4.4
// We tag SKUs `optionforge-` so cleanup-on-uninstall is reliable.
// ─────────────────────────────────────────────────────────

const SKU_PREFIX = "optionforge-";
const MAX_VARIANTS_PER_PRODUCT = 100;

export interface CreateHiddenVariantInput {
  shopId: string;
  shopifyProductId: string;
  optionValueId: string;
  priceCents: number;
  adminGraphql: (query: string, variables?: Record<string, unknown>) => Promise<any>;
}

export async function createHiddenVariant(input: CreateHiddenVariantInput) {
  const existingCount = await prisma.hiddenVariant.count({
    where: { shopId: input.shopId, shopifyProductId: input.shopifyProductId, pendingDeletion: false },
  });
  if (existingCount >= MAX_VARIANTS_PER_PRODUCT) {
    throw new Error(`Hidden variant cap (${MAX_VARIANTS_PER_PRODUCT}) reached for product ${input.shopifyProductId}`);
  }

  const sku = `${SKU_PREFIX}${input.shopifyProductId.split("/").pop()}-${Date.now()}`;

  const mutation = `#graphql
    mutation CreateVariant($input: ProductVariantInput!) {
      productVariantCreate(input: $input) {
        productVariant { id sku price }
        userErrors { field message }
      }
    }
  `;
  const res = await input.adminGraphql(mutation, {
    input: {
      productId: input.shopifyProductId,
      sku,
      price: (input.priceCents / 100).toFixed(2),
      inventoryManagement: null,
      inventoryPolicy: "CONTINUE",
      options: [sku], // unique option value so variant doesn't collide
      taxable: true,
    },
  });

  const variant = res?.data?.productVariantCreate?.productVariant;
  if (!variant) {
    const errors = res?.data?.productVariantCreate?.userErrors;
    throw new Error(`Variant creation failed: ${JSON.stringify(errors)}`);
  }

  return prisma.hiddenVariant.create({
    data: {
      shopId: input.shopId,
      optionValueId: input.optionValueId,
      shopifyProductId: input.shopifyProductId,
      shopifyVariantId: variant.id,
      priceCents: input.priceCents,
      sku,
    },
  });
}

// Mark all hidden variants for a shop as pending deletion.
// The worker iterates them in batches with rate-limit-respectful delays.
export async function markShopVariantsForDeletion(shopId: string) {
  await prisma.hiddenVariant.updateMany({
    where: { shopId, pendingDeletion: false },
    data: { pendingDeletion: true },
  });
}
