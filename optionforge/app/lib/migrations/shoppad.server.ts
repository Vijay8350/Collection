import type { Importer, ImporterContext, DetectedSource } from "./types";

// ───────────────────────────────────────────────────────────────
// ShopPad Infinite Options → OptionForge importer
// Architecture: linked add-on products + product metafields under `shoppad.*`
// Blueprint §2.7
// ───────────────────────────────────────────────────────────────

const SHOPPAD_NAMESPACE = "shoppad";

export const ShopPadImporter: Importer = {
  async detect(ctx): Promise<DetectedSource> {
    const evidence: string[] = [];

    const metaQuery = `#graphql
      query DetectShopPad {
        productsCount: productsCount(query: "metafield:shoppad.*") { count }
      }
    `;
    let productCount = 0;
    try {
      const res = await ctx.adminGraphql(metaQuery);
      productCount = res?.data?.productsCount?.count ?? 0;
      if (productCount > 0) evidence.push(`Found shoppad.* metafields on ${productCount} products`);
    } catch {
      // ignore
    }

    // Look for products tagged "shoppad-addon"
    const tagQuery = `#graphql
      query DetectShopPadAddons {
        addons: productsCount(query: "tag:shoppad-addon") { count }
      }
    `;
    try {
      const tagRes = await ctx.adminGraphql(tagQuery);
      const addonCount = tagRes?.data?.addons?.count ?? 0;
      if (addonCount > 0) evidence.push(`Found ${addonCount} ShopPad add-on products (tag:shoppad-addon)`);
    } catch {
      // ignore
    }

    return {
      source: "shoppad",
      installed: evidence.length > 0,
      productCount,
      optionSetEstimate: Math.ceil(productCount / 8),
      evidence,
    };
  },

  async *import(ctx: ImporterContext) {
    let cursor: string | null = null;
    let totalImported = 0;

    while (true) {
      const query = `#graphql
        query ShopPadProducts($cursor: String) {
          products(first: 50, after: $cursor, query: "metafield:shoppad.option_sets:*") {
            pageInfo { hasNextPage endCursor }
            nodes {
              id
              title
              metafields(namespace: "${SHOPPAD_NAMESPACE}", first: 10) {
                nodes { key value }
              }
            }
          }
        }
      `;
      const res = await ctx.adminGraphql(query, { cursor });
      const page = res?.data?.products;
      if (!page) break;

      for (const product of page.nodes ?? []) {
        const optionsMeta = product.metafields?.nodes?.find((m: any) => m.key === "option_sets" || m.key === "options");
        if (!optionsMeta) continue;
        try {
          const config = JSON.parse(optionsMeta.value);
          const optionSet = convertShopPadConfig(product, config);
          if (optionSet) {
            yield optionSet;
            totalImported += 1;
          }
        } catch (err) {
          console.error(`Failed to parse ShopPad config for ${product.id}:`, err);
        }
      }

      if (!page.pageInfo?.hasNextPage) break;
      cursor = page.pageInfo.endCursor;
    }

    return { totalImported };
  },
};

const SHOPPAD_TYPE_MAP: Record<string, string> = {
  text: "text",
  longtext: "textarea",
  dropdown: "dropdown",
  radio: "radio",
  checkbox: "checkbox",
  colorswatch: "swatch_color",
  imageswatch: "swatch_image",
  fileupload: "file",
  date: "date",
  number: "number",
};

function convertShopPadConfig(product: any, config: any) {
  const fields = Array.isArray(config) ? config : config?.fields ?? [];
  if (fields.length === 0) return null;
  return {
    externalId: product.id,
    name: `${product.title} (imported from ShopPad)`,
    appliedToProductIds: [product.id],
    options: fields.map((field: any) => ({
      type: SHOPPAD_TYPE_MAP[field.type] ?? "text",
      label: field.label ?? field.name ?? "Option",
      required: Boolean(field.required),
      values: Array.isArray(field.choices)
        ? field.choices.map((c: any, idx: number) => ({
            label: c.label ?? c.value ?? `Choice ${idx + 1}`,
            value: String(c.value ?? c.label ?? idx),
            addonPriceCents: c.addonProductId ? -1 : 0, // -1 sentinel: linked product, resolved later
          }))
        : undefined,
    })),
  };
}
