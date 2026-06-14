import crypto from "node:crypto";
import OpenAI from "openai";
import { z } from "zod";

// ──────────────────────────────────────────────────────────────
// AI Option-Set Generation — DIFFERENTIATOR #1
// Powered by DeepSeek (deepseek-chat) via OpenAI-compatible API.
// Blueprint §2.6
// ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert Shopify merchandiser specialising in product personalisation.
Given a product description, return ONLY a JSON object describing an option set.

RULES:
- Use 3-8 options. Quality over quantity.
- Prefer swatch_color or swatch_image over dropdown when there are <=6 visual choices.
- Add validation (char limits, required) where it reduces support tickets.
- Never invent fields the merchant didn't imply.
- Suggest add-on prices in cents (USD) for upgrades; 0 for free.
- For each dropdown/radio/checkbox/swatch, include 2-8 values.
- Use the language hinted by the description (default English).

JSON SHAPE (return exactly this structure, no extra fields, no prose, no markdown fences):
{
  "name": "string (short name for the option set)",
  "options": [
    {
      "type": "one of: text | textarea | dropdown | radio | checkbox | swatch_color | swatch_image | number | date | email | phone | file | image_upload | dimensions | quantity | range | toggle",
      "label": "string",
      "required": true | false,
      "placeholder": "string (optional)",
      "helpText": "string (optional)",
      "validation": { "maxLength": 20, "minLength": 0, "min": 0, "max": 99 } (optional, omit any unused keys),
      "values": [
        { "label": "string", "value": "string", "addonPriceCents": 0, "swatchColor": "#hex (optional)", "swatchImageUrl": "url (optional)" }
      ] (only for dropdown/radio/checkbox/swatch_color/swatch_image)
    }
  ]
}`;

const AiOptionSchema = z.object({
  type: z.string(),
  label: z.string(),
  required: z.boolean().default(false),
  placeholder: z.string().nullable().optional(),
  helpText: z.string().nullable().optional(),
  validation: z.record(z.any()).nullable().optional(),
  values: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
        addonPriceCents: z.number().nullable().optional(),
        swatchColor: z.string().nullable().optional(),
        swatchImageUrl: z.string().nullable().optional(),
      }),
    )
    .nullable()
    .optional(),
});

export const AiOptionSetSchema = z.object({
  name: z.string(),
  options: z.array(AiOptionSchema),
});

export type AiOptionSet = z.infer<typeof AiOptionSetSchema>;

export interface GenerationResult {
  optionSet: AiOptionSet;
  inputTokens: number;
  outputTokens: number;
  costUsdMicros: number;
  latencyMs: number;
  cached: boolean;
}

// ──────────────────────────────────────────────────────────────
// LLM provider abstraction (Blueprint §2.6 / §4.1 / §13).
// DeepSeek is the default; the interface keeps DeepSeek swappable for
// Claude Haiku 4.5, GPT-4o-mini, or a future DeepSeek version with no
// call-site changes. Select via the LLM_PROVIDER env var.
// ──────────────────────────────────────────────────────────────

interface LlmCompletion {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  complete(system: string, user: string): Promise<LlmCompletion>;
  costUsdMicros(inputTokens: number, outputTokens: number): number;
}

// DeepSeek pricing (V3.2, verified June 2026): $0.28 / 1M input, $0.42 / 1M output.
// Source: api-docs.deepseek.com/quick_start/pricing
// The bare `deepseek-chat` alias retires 2026-07-24 — pin the versioned model.
const DEEPSEEK_INPUT_COST_PER_TOKEN = 0.28 / 1_000_000;
const DEEPSEEK_OUTPUT_COST_PER_TOKEN = 0.42 / 1_000_000;
const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v3.2";

class DeepSeekProvider implements LLMProvider {
  readonly name = "deepseek";
  readonly model: string;
  private client: OpenAI;

  constructor() {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not configured");
    this.model = process.env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL;
    this.client = new OpenAI({ apiKey, baseURL: DEEPSEEK_BASE_URL });
  }

  async complete(system: string, user: string): Promise<LlmCompletion> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_tokens: 2000,
    });
    return {
      text: completion.choices[0]?.message?.content ?? "",
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
    };
  }

  costUsdMicros(inputTokens: number, outputTokens: number): number {
    return Math.round(
      (inputTokens * DEEPSEEK_INPUT_COST_PER_TOKEN +
        outputTokens * DEEPSEEK_OUTPUT_COST_PER_TOKEN) *
        1_000_000,
    );
  }
}

let _provider: LLMProvider | null = null;
export function getLlmProvider(): LLMProvider {
  if (_provider) return _provider;
  const choice = (process.env.LLM_PROVIDER || "deepseek").toLowerCase();
  switch (choice) {
    case "deepseek":
      _provider = new DeepSeekProvider();
      break;
    default:
      throw new Error(`Unsupported LLM_PROVIDER: ${choice}`);
  }
  return _provider;
}

// 24h in-process cache keyed by description hash — deduplicates refresh
// requests for the same prompt without re-billing the model (Blueprint §2.6).
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
interface CacheEntry {
  result: GenerationResult;
  expiresAt: number;
}
const _cache = new Map<string, CacheEntry>();

function cacheKey(provider: LLMProvider, prompt: string, locale?: string): string {
  return crypto
    .createHash("sha256")
    .update(`${provider.name}:${provider.model}:${locale ?? ""}:${prompt}`)
    .digest("hex");
}

export async function generateOptionSetFromPrompt(
  prompt: string,
  options: { locale?: string } = {},
): Promise<GenerationResult> {
  const provider = getLlmProvider();
  const sanitized = sanitizePrompt(prompt);

  const key = cacheKey(provider, sanitized, options.locale);
  const hit = _cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return { ...hit.result, cached: true, latencyMs: 0 };
  }

  const startedAt = Date.now();
  const userMessage = options.locale
    ? `${sanitized}\n\nReturn labels in locale: ${options.locale}. Return as JSON.`
    : `${sanitized}\n\nReturn as JSON.`;

  const { text, inputTokens, outputTokens } = await provider.complete(
    SYSTEM_PROMPT,
    userMessage,
  );
  if (!text) throw new Error(`${provider.name} returned empty response`);

  let parsed: AiOptionSet;
  try {
    parsed = AiOptionSetSchema.parse(JSON.parse(text));
  } catch (err) {
    throw new Error(`${provider.name} returned malformed JSON: ${(err as Error).message}`);
  }

  const result: GenerationResult = {
    optionSet: parsed,
    inputTokens,
    outputTokens,
    costUsdMicros: provider.costUsdMicros(inputTokens, outputTokens),
    latencyMs: Date.now() - startedAt,
    cached: false,
  };

  _cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

// Strip prompt-injection markers and excessive length.
function sanitizePrompt(input: string): string {
  const trimmed = input.trim().slice(0, 1500);
  return trimmed.replace(/```|<\/?(system|assistant|user)>/gi, "");
}
