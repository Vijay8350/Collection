import { useState } from "react";
import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Card,
  Layout,
  Text,
  Badge,
  Button,
  BlockStack,
  InlineStack,
  Banner,
  Box,
  List,
  ProgressBar,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getShopByDomain, getMigrationEntitlement } from "../lib/shop.server";
import { detectAllSources, runImport, IMPORTERS } from "../lib/migrations/index.server";
import { SOURCE_LABELS } from "../lib/migrations/labels";
import type { MigrationSource } from "../lib/migrations/types";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await getShopByDomain(session.shop);

  const adminGraphql = async (query: string, variables?: Record<string, unknown>) => {
    const r = await admin.graphql(query, { variables });
    return r.json();
  };

  const detections = await detectAllSources({
    shopId: shop.id,
    shopifyDomain: shop.shopifyDomain,
    adminGraphql,
  });

  const jobs = await prisma.migrationJob.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const entitlement = getMigrationEntitlement(shop);

  return {
    detections,
    entitlement: {
      ...entitlement,
      freeUntil:
        entitlement.reason === "free_trial" ? entitlement.freeUntil.toISOString() : null,
    },
    jobs: jobs.map((j) => ({
      id: j.id,
      source: j.source,
      status: j.status,
      detectedCount: j.detectedCount,
      migratedCount: j.migratedCount,
      startedAt: j.startedAt?.toISOString() ?? null,
      completedAt: j.completedAt?.toISOString() ?? null,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await getShopByDomain(session.shop);
  const form = await request.formData();
  const source = form.get("source") as MigrationSource;

  if (!source || !IMPORTERS[source]) {
    return { error: "Unknown migration source" };
  }

  const entitlement = getMigrationEntitlement(shop);
  if (!entitlement.entitled) {
    return {
      error: `Your 90-day free migration window has ended. Migration tooling is a one-time $${entitlement.feeUsd} fee on the Free plan, or included free on Pro and above.`,
    };
  }

  const job = await prisma.migrationJob.create({
    data: {
      shopId: shop.id,
      source,
      status: "running",
      startedAt: new Date(),
      rollbackUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
  });

  const adminGraphql = async (query: string, variables?: Record<string, unknown>) => {
    const r = await admin.graphql(query, { variables });
    return r.json();
  };

  try {
    const result = await runImport(
      source,
      { shopId: shop.id, shopifyDomain: shop.shopifyDomain, adminGraphql },
      async (imported) => {
        const created = await prisma.optionSet.create({
          data: {
            shopId: shop.id,
            name: imported.name,
            status: "draft",
            appliedScope: "product",
            options: {
              create: imported.options.map((opt, idx) => ({
                type: opt.type,
                label: opt.label,
                required: opt.required,
                position: idx,
                validationJson: "{}",
                values: opt.values
                  ? {
                      create: opt.values.map((v, vidx) => ({
                        label: v.label,
                        value: v.value,
                        position: vidx,
                        addonPriceCents: v.addonPriceCents ?? 0,
                      })),
                    }
                  : undefined,
              })),
            },
            productMappings: {
              create: imported.appliedToProductIds.map((pid) => ({
                shopifyProductId: pid,
              })),
            },
          },
        });
        await prisma.migrationJob.update({
          where: { id: job.id },
          data: {
            migratedCount: { increment: 1 },
            detectedCount: { increment: 1 },
          },
        });
      },
    );

    await prisma.migrationJob.update({
      where: { id: job.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        migratedCount: result.totalImported,
        detectedCount: result.totalImported,
      },
    });

    throw redirect("/app/option-sets");
  } catch (err) {
    await prisma.migrationJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        completedAt: new Date(),
        errorJson: JSON.stringify({ message: (err as Error).message }),
      },
    });
    return { error: `Migration failed: ${(err as Error).message}` };
  }
};

export default function MigrationWizard() {
  const { detections, jobs, entitlement } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const submitting = fetcher.state === "submitting";
  const submittingSource = fetcher.formData?.get("source") as string | undefined;

  const detected = detections.filter((d) => d.installed);

  return (
    <Page title="Migration wizard" subtitle="Import option sets from any of the top 5 competitor apps in minutes.">
      <Layout>
        {entitlement.reason === "free_trial" && entitlement.freeUntil && (
          <Layout.Section>
            <Banner tone="info" title="Free migration window">
              <p>
                Migration tooling is free on your Free plan until{" "}
                <strong>{new Date(entitlement.freeUntil).toLocaleDateString()}</strong>{" "}
                (90 days post-install). After that it's a one-time $49 fee, or upgrade to
                Pro for unlimited free migrations.
              </p>
            </Banner>
          </Layout.Section>
        )}

        {!entitlement.entitled && (
          <Layout.Section>
            <Banner tone="warning" title="Migration requires a one-time fee">
              <p>
                Your 90-day free migration window has ended. Importing now is a one-time
                ${entitlement.feeUsd} fee on the Free plan, or included free on Pro and
                above.
              </p>
            </Banner>
          </Layout.Section>
        )}

        {detected.length === 0 && (
          <Layout.Section>
            <Banner tone="info" title="No competitor apps detected">
              <p>
                We didn't find any installed option-apps from our supported sources.
                If you've already uninstalled the competing app, contact support — we
                can import from a CSV export.
              </p>
            </Banner>
          </Layout.Section>
        )}

        {detections.map((d) => (
          <Layout.Section key={d.source}>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between">
                  <Text as="h3" variant="headingMd">{SOURCE_LABELS[d.source as MigrationSource]}</Text>
                  <Badge tone={d.installed ? "success" : undefined}>
                    {d.installed ? "Detected" : "Not detected"}
                  </Badge>
                </InlineStack>

                {d.evidence.length > 0 && (
                  <Box paddingInlineStart="200">
                    <List type="bullet">
                      {d.evidence.map((e, i) => (
                        <List.Item key={i}>{e}</List.Item>
                      ))}
                    </List>
                  </Box>
                )}

                {d.installed && (
                  <BlockStack gap="200">
                    <Text as="p">
                      Estimated <strong>{d.optionSetEstimate}</strong> option set(s) across{" "}
                      <strong>{d.productCount}</strong> product(s).
                    </Text>
                    <fetcher.Form method="post">
                      <input type="hidden" name="source" value={d.source} />
                      <Button
                        submit
                        variant="primary"
                        loading={submittingSource === d.source && submitting}
                        disabled={!entitlement.entitled}
                      >
                        Import from {SOURCE_LABELS[d.source as MigrationSource]}
                      </Button>
                    </fetcher.Form>
                    <Text as="p" tone="subdued">
                      Original app stays installed. You can roll back for 30 days. Your competitor's data is never modified.
                    </Text>
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        ))}

        {jobs.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingMd">Migration history</Text>
                {jobs.map((j) => (
                  <InlineStack key={j.id} align="space-between">
                    <BlockStack gap="100">
                      <Text as="p" fontWeight="semibold">
                        {SOURCE_LABELS[j.source as MigrationSource]}
                      </Text>
                      <Text as="p" tone="subdued">
                        {j.startedAt && new Date(j.startedAt).toLocaleString()}
                      </Text>
                    </BlockStack>
                    <InlineStack gap="200">
                      <Badge tone={j.status === "completed" ? "success" : j.status === "failed" ? "critical" : undefined}>
                        {j.status}
                      </Badge>
                      <Text as="p">{j.migratedCount} imported</Text>
                    </InlineStack>
                  </InlineStack>
                ))}
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
