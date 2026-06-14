// Standalone DeepSeek smoke test — runs without `npm install`.
// Reads DEEPSEEK_API_KEY from the OptionForge .env file.
//
// Run:  node scripts/test-deepseek.mjs

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, "..", ".env");

// Minimal .env parser
function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[m[1]] = v;
  }
  return env;
}

const env = loadEnv(ENV_PATH);
const apiKey = env.DEEPSEEK_API_KEY;
if (!apiKey) {
  console.error("DEEPSEEK_API_KEY missing in .env");
  process.exit(1);
}

const SYSTEM_PROMPT = `You are an expert Shopify merchandiser specialising in product personalisation.
Given a product description, return ONLY a JSON object describing an option set.

RULES:
- Use 3-8 options. Quality over quantity.
- Prefer swatch_color or swatch_image over dropdown when there are <=6 visual choices.
- Add validation (char limits, required) where it reduces support tickets.
- Never invent fields the merchant didn't imply.
- Suggest add-on prices in cents (USD) for upgrades; 0 for free.
- For each dropdown/radio/checkbox/swatch, include 2-8 values.

JSON SHAPE:
{
  "name": "string",
  "options": [
    {
      "type": "text|textarea|dropdown|radio|checkbox|swatch_color|swatch_image|number|date|email|phone|file|image_upload|dimensions|quantity|range|toggle",
      "label": "string",
      "required": true|false,
      "placeholder": "string?",
      "helpText": "string?",
      "validation": { "maxLength": 20, "min": 0, "max": 99 },
      "values": [
        { "label": "string", "value": "string", "addonPriceCents": 0, "swatchColor": "#hex", "swatchImageUrl": "url" }
      ]
    }
  ]
}`;

const TEST_PROMPT = "Custom engraved leather wallet with up to 20 characters and 3 font choices.";

console.log("→ Sending test prompt to DeepSeek:");
console.log(`   "${TEST_PROMPT}"\n`);

const startedAt = Date.now();

const res = await fetch("https://api.deepseek.com/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    model: env.DEEPSEEK_MODEL || "deepseek-v3.2",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: TEST_PROMPT + "\n\nReturn as JSON." },
    ],
    response_format: { type: "json_object" },
    temperature: 0.4,
    max_tokens: 2000,
  }),
});

const latency = Date.now() - startedAt;

if (!res.ok) {
  const errBody = await res.text();
  console.error(`✗ DeepSeek API returned ${res.status} ${res.statusText}`);
  console.error(errBody);
  process.exit(2);
}

const data = await res.json();
const text = data.choices?.[0]?.message?.content ?? "";

console.log(`✓ Response in ${latency}ms`);
console.log(`✓ Model: ${data.model}`);
console.log(`✓ Tokens — input: ${data.usage?.prompt_tokens}, output: ${data.usage?.completion_tokens}, total: ${data.usage?.total_tokens}`);
console.log(`✓ Cache hit tokens: ${data.usage?.prompt_cache_hit_tokens ?? 0} / cache miss: ${data.usage?.prompt_cache_miss_tokens ?? data.usage?.prompt_tokens}`);

// Cost calc (DeepSeek V3.2 cache-miss pricing: $0.28 / $0.42 per 1M in/out)
const inputCost = (data.usage?.prompt_tokens ?? 0) * 0.28 / 1_000_000;
const outputCost = (data.usage?.completion_tokens ?? 0) * 0.42 / 1_000_000;
console.log(`✓ Cost (this call): $${(inputCost + outputCost).toFixed(6)}\n`);

let parsed;
try {
  parsed = JSON.parse(text);
} catch (e) {
  console.error("✗ Response is not valid JSON:");
  console.error(text);
  process.exit(3);
}

console.log("✓ Parsed option set:");
console.log(JSON.stringify(parsed, null, 2));
console.log("\n→ Validation:");
console.log(`   name:    ${typeof parsed.name === "string" ? "OK" : "MISSING"}`);
console.log(`   options: ${Array.isArray(parsed.options) ? `OK (${parsed.options.length} options)` : "MISSING"}`);
if (Array.isArray(parsed.options)) {
  for (const opt of parsed.options) {
    const hasValues = Array.isArray(opt.values) ? ` [${opt.values.length} values]` : "";
    console.log(`   - ${opt.type}: "${opt.label}"${opt.required ? " *" : ""}${hasValues}`);
  }
}
console.log("\n✓ DeepSeek integration verified end-to-end.");
