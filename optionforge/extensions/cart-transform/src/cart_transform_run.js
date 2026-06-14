// @ts-check
/**
 * OptionForge Cart Transform Function
 *
 * Reads `_optionforge_*` line item attributes injected by the storefront widget
 * and expands them into bundled child lines with structured per-option metadata.
 *
 * Per Shopify limits (blueprint §4.4):
 *   - Max 1 cart-transform function per shop.
 *   - <11M instruction budget per cart call.
 *
 * NOTE: This is a starter implementation. Stage 2 will:
 *   - Merge identical configurations (same product + same options) into one line.
 *   - Compute formula-based upcharges using merchant-defined math expressions
 *     pre-compiled at deploy time (math.js not available in Functions runtime).
 *
 * @param {import("../generated/api").RunInput} input
 * @returns {import("../generated/api").FunctionRunResult}
 */
export function cartTransformRun(input) {
  const operations = [];

  for (const line of input.cart.lines) {
    const ofAttrs = line.attributes.filter((a) => a.key.startsWith("_optionforge_"));
    if (ofAttrs.length === 0) continue;

    // Build per-line title suffix so the cart shows "Product — Engraving: Hello | Font: Script".
    const summary = ofAttrs
      .filter((a) => !a.key.startsWith("_optionforge_addon_"))
      .map((a) => `${humanise(a.key)}: ${a.value}`)
      .join(" · ");

    if (summary) {
      operations.push({
        update: {
          cartLineId: line.id,
          title: summary,
        },
      });
    }
  }

  return { operations };
}

function humanise(key) {
  return key
    .replace(/^_optionforge_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Export name must match the `export` field in shopify.extension.toml.
export default {
  cartTransformRun,
};
