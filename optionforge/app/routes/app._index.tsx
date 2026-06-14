import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Badge,
  ProgressBar,
  Banner,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getShopByDomain, getAiQuota } from "../lib/shop.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopByDomain(session.shop);

  const [optionSetCount, submissionCount, aiGensThisMonth] = await Promise.all([
    prisma.optionSet.count({ where: { shopId: shop.id, status: "active" } }),
    prisma.submission.count({ where: { shopId: shop.id } }),
    prisma.aiGeneration.count({
      where: {
        shopId: shop.id,
        createdAt: { gte: new Date(new Date().setDate(1)) },
      },
    }),
  ]);

  const recentSubmissions = await prisma.submission.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return {
    plan: shop.plan,
    optionSetCount,
    submissionCount,
    aiGensThisMonth,
    aiQuota: getAiQuota(shop.plan),
    recentSubmissions: recentSubmissions.map((s) => ({
      id: s.id,
      orderId: s.orderId,
      createdAt: s.createdAt.toISOString(),
    })),
    trialEndsAt: shop.trialEndsAt?.toISOString() ?? null,
  };
};

export default function Dashboard() {
  const data = useLoaderData<typeof loader>();
  const aiPct = Math.min(100, (data.aiGensThisMonth / data.aiQuota) * 100);

  return (
    <Page title="OptionForge Dashboard">
      <Layout>
        {data.trialEndsAt && (
          <Layout.Section>
            <Banner tone="info" title="14-day trial active">
              <p>Trial ends {new Date(data.trialEndsAt).toLocaleDateString()}.</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <InlineStack gap="400" wrap>
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">Plan</Text>
                <Badge tone={data.plan === "free" ? undefined : "success"}>{data.plan.toUpperCase()}</Badge>
                <Link to="/app/settings"><Button variant="plain">Manage billing</Button></Link>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">Active option sets</Text>
                <Text as="p" variant="heading2xl">{data.optionSetCount}</Text>
                <Link to="/app/option-sets"><Button>Manage option sets</Button></Link>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">Submissions (all-time)</Text>
                <Text as="p" variant="heading2xl">{data.submissionCount}</Text>
                <Link to="/app/submissions"><Button variant="plain">View submissions</Button></Link>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">AI generations this month</Text>
                <Text as="p" variant="heading2xl">
                  {data.aiGensThisMonth} / {data.aiQuota}
                </Text>
                <ProgressBar progress={aiPct} size="small" />
                <Link to="/app/ai-studio"><Button variant="primary">Open AI Studio</Button></Link>
              </BlockStack>
            </Card>
          </InlineStack>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingMd">Quick start</Text>
              <BlockStack gap="100">
                <Link to="/app/ai-studio">→ Generate your first option set from a description (AI)</Link>
                <Link to="/app/migration">→ Import option sets from SC / ShopPad / Hulk / Globo / Easify</Link>
                <Link to="/app/templates">→ Start from a template (jewelry, apparel, photo print, …)</Link>
                <Link to="/app/option-sets/new">→ Build manually from scratch</Link>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingMd">Recent submissions</Text>
              {data.recentSubmissions.length === 0 ? (
                <Text as="p" tone="subdued">No submissions yet. Once customers configure options on a product, they appear here.</Text>
              ) : (
                <BlockStack gap="100">
                  {data.recentSubmissions.map((s) => (
                    <Text key={s.id} as="p">
                      {s.orderId ? `Order ${s.orderId}` : "Cart"} — {new Date(s.createdAt).toLocaleString()}
                    </Text>
                  ))}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
