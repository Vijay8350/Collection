import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import {
  Page,
  Card,
  Layout,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Button,
  Banner,
  Box,
} from "@shopify/polaris";

import {
  authenticate,
  billingIsTest,
  PLAN_BY_NAME,
  type InternalPlan,
  type PlanName,
} from "../shopify.server";
import prisma from "../db.server";
import { getShopByDomain, getAiQuota } from "../lib/shop.server";

interface PlanCard {
  plan: InternalPlan;
  name: string;
  monthlyPrice: string;
  monthlyName?: PlanName;
  annualPrice?: string;
  annualName?: PlanName;
  perks: string[];
}

const PLAN_CARDS: PlanCard[] = [
  {
    plan: "free",
    name: "Free Forever",
    monthlyPrice: "$0/mo",
    perks: ["5 option sets", "15 option types", "5 AI gens / mo", "Community support"],
  },
  {
    plan: "pro",
    name: "Pro",
    monthlyPrice: "$9.99/mo",
    monthlyName: "Pro",
    annualPrice: "$95.90/yr",
    annualName: "Pro (Annual)",
    perks: ["Unlimited option sets", "25 option types", "50 AI gens / mo", "Free migration tooling", "Chat support"],
  },
  {
    plan: "premium",
    name: "Premium",
    monthlyPrice: "$19.99/mo",
    monthlyName: "Premium",
    annualPrice: "$191.90/yr",
    annualName: "Premium (Annual)",
    perks: ["28 option types", "Live preview", "500 AI gens / mo", "Structured packing slips", "Priority chat"],
  },
  {
    plan: "enterprise",
    name: "Enterprise",
    monthlyPrice: "$79.99/mo",
    monthlyName: "Enterprise",
    annualPrice: "$767.90/yr",
    annualName: "Enterprise (Annual)",
    perks: ["Unlimited AI", "White-glove migration", "POS extension", "B2B integration", "Dedicated Slack"],
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const shop = await getShopByDomain(session.shop);

  // Reconcile our local plan with Shopify's source of truth. After a merchant
  // approves/cancels a charge, Shopify redirects back here and this syncs it.
  const { appSubscriptions } = await billing.check({ isTest: billingIsTest });
  const active = appSubscriptions.find((s) => s.status === "ACTIVE");
  const resolvedPlan: InternalPlan = active
    ? PLAN_BY_NAME[active.name]?.plan ?? (shop.plan as InternalPlan)
    : "free";

  if (resolvedPlan !== shop.plan) {
    await prisma.shop.update({ where: { id: shop.id }, data: { plan: resolvedPlan } });
  }

  return {
    plan: resolvedPlan,
    shopifyPlan: shop.shopifyPlan,
    quota: getAiQuota(resolvedPlan),
    locale: shop.locale,
    timezone: shop.timezone,
    activeSubscriptionName: active?.name ?? null,
    testMode: billingIsTest,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "subscribe");

  if (intent === "cancel") {
    // Downgrade to Free: cancel every active subscription, then update locally.
    const { appSubscriptions } = await billing.check({ isTest: billingIsTest });
    for (const sub of appSubscriptions) {
      if (sub.status === "ACTIVE") {
        await billing.cancel({ subscriptionId: sub.id, isTest: billingIsTest, prorate: true });
      }
    }
    const shop = await getShopByDomain(session.shop);
    await prisma.shop.update({ where: { id: shop.id }, data: { plan: "free" } });
    return { ok: true, plan: "free" as InternalPlan };
  }

  // Subscribe / upgrade: redirect the merchant to Shopify's approval screen.
  const planName = String(form.get("planName"));
  if (!PLAN_BY_NAME[planName]) {
    return { error: "Unknown plan" };
  }

  const returnUrl = `${process.env.SHOPIFY_APP_URL}/app/settings`;
  // billing.request throws a redirect to Shopify's confirmation URL.
  await billing.request({
    plan: planName as PlanName,
    isTest: billingIsTest,
    returnUrl,
  });

  return null;
};

export default function Settings() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";

  return (
    <Page title="Settings">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">Current plan</Text>
              <InlineStack gap="200">
                <Badge tone={data.plan === "free" ? undefined : "success"}>{data.plan.toUpperCase()}</Badge>
                {data.activeSubscriptionName && (
                  <Badge tone="info">{data.activeSubscriptionName}</Badge>
                )}
                <Text as="p" tone="subdued">
                  Shopify plan: {data.shopifyPlan ?? "unknown"} — same price applies (no Plus surcharge)
                </Text>
              </InlineStack>
              <Text as="p" tone="subdued">
                Annual billing saves 20% (≈2.4 months free) on every paid plan. All paid plans
                include a 14-day free trial.
              </Text>
              {data.testMode && (
                <Banner tone="warning">
                  Billing is in <strong>test mode</strong> — no real charges are made. Set
                  <code> BILLING_TEST=false</code> in production to charge merchants.
                </Banner>
              )}
              {actionData && "ok" in actionData && actionData.ok && (
                <Banner tone="success">Subscription cancelled. You're on the Free plan.</Banner>
              )}
              {actionData && "error" in actionData && actionData.error && (
                <Banner tone="critical">{actionData.error}</Banner>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {PLAN_CARDS.map((p) => (
          <Layout.Section key={p.plan} variant="oneHalf">
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between">
                  <Text as="h3" variant="headingMd">{p.name}</Text>
                  <Text as="p" fontWeight="bold">{p.monthlyPrice}</Text>
                </InlineStack>
                <Box paddingInlineStart="200">
                  <BlockStack gap="100">
                    {p.perks.map((perk) => (
                      <Text key={perk} as="p" tone="subdued">• {perk}</Text>
                    ))}
                  </BlockStack>
                </Box>

                {data.plan === p.plan ? (
                  <InlineStack gap="200">
                    <Badge tone="success">Current plan</Badge>
                    {p.plan !== "free" && (
                      <Form method="post">
                        <input type="hidden" name="intent" value="cancel" />
                        <Button submit variant="plain" tone="critical" loading={busy}>
                          Cancel & downgrade to Free
                        </Button>
                      </Form>
                    )}
                  </InlineStack>
                ) : p.plan === "free" ? (
                  <Form method="post">
                    <input type="hidden" name="intent" value="cancel" />
                    <Button submit loading={busy}>Switch to Free</Button>
                  </Form>
                ) : (
                  <InlineStack gap="200">
                    <Form method="post">
                      <input type="hidden" name="intent" value="subscribe" />
                      <input type="hidden" name="planName" value={p.monthlyName ?? ""} />
                      <Button submit variant="primary" loading={busy}>
                        {p.monthlyPrice}
                      </Button>
                    </Form>
                    {p.annualName && (
                      <Form method="post">
                        <input type="hidden" name="intent" value="subscribe" />
                        <input type="hidden" name="planName" value={p.annualName} />
                        <Button submit loading={busy}>
                          {`${p.annualPrice} (save 20%)`}
                        </Button>
                      </Form>
                    )}
                  </InlineStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        ))}

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingMd">Locale & language</Text>
              <Text as="p" tone="subdued">Locale: {data.locale} · Timezone: {data.timezone}</Text>
              <Text as="p" tone="subdued">
                Admin available in English, Hindi, and Vietnamese. Storefront widget in 15 languages.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
