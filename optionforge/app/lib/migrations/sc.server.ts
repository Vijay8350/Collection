import type { Importer, ImporterContext, DetectedSource } from "./types";

// ───────────────────────────────────────────────────────────────
// SC Product Options (formerly Bold) → OptionForge importer
// Blueprint §2.7
// Detection: products carry metafields under `bold_options.*` namespace
//            and theme contains `bold-options-hybrid.liquid` snippet.
// Import:   read metafields → convert to OptionForge schema.
// ───────────────────────────────────────────────────────────────

const SC_METAFIELD_NAMESPACE = "bold_options";

const TYPE_MAP: Record<string, string> = {
  text: "text",
  textarea: "textarea",
  dropdown: "dropdown",
  radio: "radio",
  checkbox: "checkbox",
  color_swatch: "swatch_color",
  image_swatch: "swatch_image",
  file_upload: "file",
  date: "date",
  number: "number",
};

export const ScImporter: Importer = {
  async detect(ctx): Promise<DetectedSource> {
    const evidence: string[] = [];

    // 1. Look for bold_options metafields on any product
    const metafieldQuery = `#graphql
      query DetectSC {
        productsCount: productsCount(query: "metafield:bold_options.*") { count }
      }
    `;
    let productCount = 0;
    try {
      const res = await ctx.adminGraphql(metafieldQuery);
      productCount = res?.data?.productsCount?.count ?? 0;
      if (productCount > 0) evidence.push(`Found bold_options metafields on ${productCount} products`);
    } catch (e) {
      // productsCount with metafield query may not be supported on older APIs; fall back later
    }

    // 2. Check for snippet in published theme
    const themeQuery = `#graphql
      query ThemeFiles {
        themes(first: 1, roles: [MAIN]) {
          nodes {
            id
            files(filenames: ["snippets/bold-options-hybrid.liquid", "snippets/sc-includes.liquid"]) {
              nodes { filename }
            }
          }
        }
      }
    `;
    try {
      const themeRes = await ctx.adminGraphql(themeQuery);
      const snippets = themeRes?.data?.themes?.nodes?.[0]?.files?.nodes ?? [];
      if (snippets.length > 0) {
        evidence.push(`Found Liquid snippets: ${snippets.map((s: any) => s.filename).join(", ")}`);
      }
    } catch {
      // ignore
    }

    return {
      source: "sc",
      installed: evidence.length > 0,
      productCount,
      optionSetEstimate: Math.ceil(productCount / 10), // rough heuristic
      evidence,
    };
  },

  async *import(ctx: ImporterContext) {
    let cursor: string | null = null;
    let totalImported = 0;

    while (true) {
      const query = `#graphql
        query SCProducts($cursor: String) {
          products(first: 50, after: $cursor, query: "metafield:bold_options.options:*") {
            pageInfo { hasNextPage endCursor }
            nodes {
              id
              title
              metafield(namespace: "${SC_METAFIELD_NAMESPACE}", key: "options") {
                value
              }
            }
          }
        }
      `;
      const res = await ctx.adminGraphql(query, { cursor });
      const page = res?.data?.products;
      if (!page) break;

      for (const product of page.nodes ?? []) {
        const raw = product.metafield?.value;
        if (!raw) continue;
        try {
          const config = JSON.parse(raw);
          const optionSet = convertScConfig(product, config);
          if (optionSet) {
            yield optionSet;
            totalImported += 1;
          }
        } catch (err) {
          console.error(`Failed to parse SC config for ${product.id}:`, err);
        }
      }

      if (!page.pageInfo?.hasNextPage) break;
      cursor = page.pageInfo.endCursor;
    }

    return { totalImported };
  },
};

function convertScConfig(product: any, config: any) {
  if (!config?.options || !Array.isArray(config.options)) return null;
  return {
    externalId: product.id,
    name: `${product.title} (imported from SC)`,
    appliedToProductIds: [product.id],
    options: config.options.map((opt: any) => ({
      type: TYPE_MAP[opt.input_type] ?? "text",
      label: opt.public_name ?? opt.name ?? "Option",
      required: Boolean(opt.required),
      values: Array.isArray(opt.option_values)
        ? opt.option_values.map((v: any) => ({
            label: v.name,
            value: String(v.id ?? v.name),
            addonPriceCents: Math.round((Number(v.price_adjustment ?? 0) || 0) * 100),
          }))
        : undefined,
    })),
  };
}
