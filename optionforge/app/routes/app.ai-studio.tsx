import { useState } from "react";
import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import {
  Page,
  Card,
  Layout,
  TextField,
  Button,
  Banner,
  BlockStack,
  Text,
  InlineStack,
  Badge,
  Divider,
  Box,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getShopByDomain, getAiQuota, isQuotaExceeded } from "../lib/shop.server";
import { generateOptionSetFromPrompt, AiOptionSetSchema } from "../lib/ai.server";

const EXAMPLE_PROMPTS = [
  "Custom engraved leather wallet with up to 20 characters and 3 font choices.",
  "Personalised baby blanket with name embroidery in 6 thread colors and 4 font styles.",
  "Custom gaming PC build with CPU choice, RAM tier, GPU tier, RGB lighting selection.",
  "Photo print with size choice (4x6, 5x7, 8x10), matte vs glossy finish, customer photo upload.",
  "Custom wedding invitation with bride name, groom name, date, venue, and 5 design themes.",
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopByDomain(session.shop);
  const usedThisMonth = await prisma.aiGeneration.count({
    where: {
      shopId: shop.id,
      createdAt: { gte: new Date(new Date().setDate(1)) },
    },
  });
  return {
    plan: shop.plan,
    quota: getAiQuota(shop.plan),
    usedThisMonth,
    locale: shop.locale,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopByDomain(session.shop);
  const form = await request.formData();
  const intent = String(form.get("intent"));

  if (intent === "generate") {
    const prompt = String(form.get("prompt") || "").trim();
    if (prompt.length < 10) {
      return { error: "Please write at least a one-line description (10+ chars)." };
    }

    const quotaCheck = await isQuotaExceeded(shop);
    if (quotaCheck.exceeded) {
      return { error: `You've hit your ${quotaCheck.quota} monthly AI generations on the ${shop.plan} plan. Upgrade to continue.` };
    }

    try {
      const gen = await generateOptionSetFromPrompt(prompt, { locale: shop.locale });
      const record = await prisma.aiGeneration.create({
        data: {
          shopId: shop.id,
          prompt,
          responseJson: JSON.stringify(gen.optionSet),
          inputTokens: gen.inputTokens,
          outputTokens: gen.outputTokens,
          costUsdMicros: gen.costUsdMicros,
          accepted: false,
        },
      });
      return { generationId: record.id, preview: gen.optionSet, latencyMs: gen.latencyMs };
    } catch (err) {
      return { error: `AI generation failed: ${(err as Error).message}` };
    }
  }

  if (intent === "accept") {
    const generationId = String(form.get("generationId"));
    const gen = await prisma.aiGeneration.findFirst({
      where: { id: generationId, shopId: shop.id },
    });
    if (!gen) return { error: "Generation not found" };

    const parsed = AiOptionSetSchema.parse(JSON.parse(gen.responseJson));

    const optionSet = await prisma.optionSet.create({
      data: {
        shopId: shop.id,
        name: parsed.name,
        status: "draft",
        aiGenerated: true,
        aiGenerationPrompt: gen.prompt,
        options: {
          create: parsed.options.map((opt, idx) => ({
            type: opt.type,
            label: opt.label,
            required: opt.required ?? false,
            position: idx,
            placeholder: opt.placeholder ?? null,
            helpText: opt.helpText ?? null,
            validationJson: JSON.stringify(opt.validation ?? {}),
            values: opt.values
              ? {
                  create: opt.values.map((v, vidx) => ({
                    label: v.label,
                    value: v.value,
                    position: vidx,
                    addonPriceCents: v.addonPriceCents ?? 0,
                    swatchColor: v.swatchColor ?? null,
                    swatchImageUrl: v.swatchImageUrl ?? null,
                  })),
                }
              : undefined,
          })),
        },
      },
    });

    await prisma.aiGeneration.update({
      where: { id: gen.id },
      data: { accepted: true, optionSetId: optionSet.id },
    });

    throw redirect(`/app/option-sets/${optionSet.id}`);
  }

  return { error: "Unknown intent" };
};

export default function AiStudio() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const generating =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "generate";

  const [prompt, setPrompt] = useState("");

  return (
    <Page title="AI Studio" subtitle="Generate option sets from a one-line description in seconds.">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text as="p">
                  <strong>{data.usedThisMonth}</strong> / {data.quota} generations used this month on the <Badge>{data.plan.toUpperCase()}</Badge> plan
                </Text>
              </InlineStack>

              {actionData && "error" in actionData && actionData.error && (
                <Banner tone="critical">{actionData.error}</Banner>
              )}

              <Form method="post">
                <input type="hidden" name="intent" value="generate" />
                <BlockStack gap="300">
                  <TextField
                    name="prompt"
                    label="Describe your customisable product"
                    multiline={3}
                    value={prompt}
                    onChange={setPrompt}
                    placeholder="e.g. Custom engraved leather wallet with up to 20 characters and 3 font choices."
                    autoComplete="off"
                  />
                  <InlineStack gap="200">
                    <Button submit variant="primary" loading={generating} disabled={prompt.length < 10}>
                      Generate option set
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Form>

              <Divider />

              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">Example prompts</Text>
                {EXAMPLE_PROMPTS.map((ex, i) => (
                  <Button key={i} variant="plain" onClick={() => setPrompt(ex)}>
                    {ex}
                  </Button>
                ))}
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {actionData && "preview" in actionData && actionData.preview && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h3" variant="headingMd">Preview: {actionData.preview.name}</Text>
                  <Text as="p" tone="subdued">Generated in {actionData.latencyMs}ms</Text>
                </InlineStack>

                <BlockStack gap="200">
                  {actionData.preview.options.map((opt, idx) => (
                    <Box key={idx} padding="300" background="bg-surface-secondary" borderRadius="200">
                      <InlineStack align="space-between">
                        <BlockStack gap="100">
                          <Text as="p" fontWeight="semibold">
                            {opt.label} {opt.required && <Badge tone="attention">required</Badge>}
                          </Text>
                          <Text as="p" tone="subdued">{opt.type}</Text>
                          {opt.values && (
                            <Text as="p" tone="subdued">
                              {opt.values.length} value(s): {opt.values.map((v) => v.label).join(", ")}
                            </Text>
                          )}
                        </BlockStack>
                      </InlineStack>
                    </Box>
                  ))}
                </BlockStack>

                <Form method="post">
                  <input type="hidden" name="intent" value="accept" />
                  <input type="hidden" name="generationId" value={actionData.generationId} />
                  <InlineStack gap="200">
                    <Button submit variant="primary">Accept and create option set</Button>
                    <Button onClick={() => setPrompt("")}>Generate something else</Button>
                  </InlineStack>
                </Form>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
