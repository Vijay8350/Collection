import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { Page, Card, Layout, Text, Button, BlockStack, InlineStack, Badge } from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getShopByDomain } from "../lib/shop.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const templates = await prisma.template.findMany({ orderBy: { installCount: "desc" } });
  return {
    templates: templates.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      category: t.category,
      installCount: t.installCount,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopByDomain(session.shop);
  const form = await request.formData();
  const slug = String(form.get("slug"));
  const tpl = await prisma.template.findUnique({ where: { slug } });
  if (!tpl) return { error: "Template not found" };

  const def = JSON.parse(tpl.jsonDefinition);
  const optionSet = await prisma.optionSet.create({
    data: {
      shopId: shop.id,
      name: tpl.name,
      status: "draft",
      options: {
        create: (def.options ?? []).map((opt: any, idx: number) => ({
          type: opt.type,
          label: opt.label,
          required: opt.required ?? false,
          position: idx,
          validationJson: JSON.stringify(opt.validation ?? {}),
          values: opt.values
            ? {
                create: (Array.isArray(opt.values) ? opt.values : []).map((v: any, vidx: number) => ({
                  label: typeof v === "string" ? v : v.label,
                  value: typeof v === "string" ? v : v.value,
                  position: vidx,
                  addonPriceCents: typeof v === "object" ? v.addonPriceCents ?? 0 : 0,
                  swatchColor: typeof v === "object" ? v.swatchColor ?? null : null,
                })),
              }
            : undefined,
        })),
      },
    },
  });

  await prisma.template.update({
    where: { id: tpl.id },
    data: { installCount: { increment: 1 } },
  });

  throw redirect(`/app/option-sets/${optionSet.id}`);
};

export default function Templates() {
  const { templates } = useLoaderData<typeof loader>();

  return (
    <Page title="Templates" subtitle="Start from a curated option set used by similar stores.">
      <Layout>
        {templates.map((t) => (
          <Layout.Section key={t.id} variant="oneHalf">
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between">
                  <Text as="h3" variant="headingMd">{t.name}</Text>
                  <Badge>{t.category}</Badge>
                </InlineStack>
                <Text as="p" tone="subdued">
                  Used by {t.installCount} merchant(s)
                </Text>
                <Form method="post">
                  <input type="hidden" name="slug" value={t.slug} />
                  <Button submit variant="primary">Use this template</Button>
                </Form>
              </BlockStack>
            </Card>
          </Layout.Section>
        ))}
      </Layout>
    </Page>
  );
}
