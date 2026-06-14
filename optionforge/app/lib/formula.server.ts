import { create, all } from "mathjs";

// Sandboxed math.js for formula-based pricing.
// Blueprint §4.9 — security: no Function/eval exposure.

const math = create(all, { matrix: "Array", number: "number" });

// Disable dangerous functions.
math.import(
  {
    import: function () { throw new Error("Disabled"); },
    createUnit: function () { throw new Error("Disabled"); },
    evaluate: function () { throw new Error("Use scoped evaluate"); },
    parse: function () { throw new Error("Disabled"); },
  },
  { override: true },
);

export function evaluateFormula(expr: string, vars: Record<string, number>): number {
  if (!expr || expr.length > 200) {
    throw new Error("Formula too long or empty");
  }
  // Disallow obvious code-injection markers
  if (/[`;{}]|=>/.test(expr)) {
    throw new Error("Disallowed characters in formula");
  }
  try {
    const result = math.evaluate(expr, vars);
    const num = Number(result);
    if (!Number.isFinite(num)) throw new Error("Non-finite result");
    return Math.round(num * 100) / 100;
  } catch (err) {
    throw new Error(`Formula evaluation failed: ${(err as Error).message}`);
  }
}
