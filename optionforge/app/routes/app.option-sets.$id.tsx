import { useState } from "react";
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useLoaderData, useFetcher, useNavigation } from "@remix-run/react";
import {
  Page,
  Card,
  Layout,
  TextField,
  Select,
  Checkbox,
  Button,
  Badge,
  BlockStack,
  InlineStack,
  Text,
  Divider,
  Banner,
  EmptyState,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getShopByDomain } from "../lib/shop.server";

const OPTION_TYPES = [
  { label: "Short text", value: "text" },
  { label: "Paragraph", value: "textarea" },
  { label: "Dropdown", value: "dropdown" },
  { label: "Radio", value: "radio" },
  { label: "Checkbox", value: "checkbox" },
  { label: "Color swatch", value: "swatch_color" },
  { label: "Image swatch", value: "swatch_image" },
  { label: "Number", value: "number" },
  { label: "Date", value: "date" },
  { label: "Email", value: "email" },
  { label: "Phone", value: "phone" },
  { label: "File upload", value: "file" },
  { label: "Image upload", value: "image_upload" },
  { label: "Dimensions", value: "dimensions" },
  { label: "Quantity", value: "quantity" },
  { label: "Range slider", value: "range" },
  { label: "Toggle", value: "toggle" },
  { label: "Font picker", value: "font_picker" },
  { label: "Calculation", value: "calculation" },
];

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopByDomain(session.shop);
  const optionSet = await prisma.optionSet.findFirst({
    where: { id: params.id!, shopId: shop.id },
    include: {
      options: {
        orderBy: { position: "asc" },
        include: { values: { orderBy: { position: "asc" } } },
      },
      productMappings: true,
    },
  });
  if (!optionSet) throw new Response("Not found", { status: 404 });
  return { optionSet };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopByDomain(session.shop);
  const form = await request.formData();
  const intent = String(form.get("intent"));

  const optionSet = await prisma.optionSet.findFirst({
    where: { id: params.id!, shopId: shop.id },
  });
  if (!optionSet) throw new Response("Not found", { status: 404 });

  switch (intent) {
    case "update_meta": {
      await prisma.optionSet.update({
        where: { id: optionSet.id },
        data: {
          name: String(form.get("name")),
          status: String(form.get("status")),
        },
      });
      return { ok: true };
    }
    case "add_option": {
      const lastPosition = await prisma.option.findFirst({
        where: { optionSetId: optionSet.id },
        orderBy: { position: "desc" },
      });
      await prisma.option.create({
        data: {
          optionSetId: optionSet.id,
          type: String(form.get("type") || "text"),
          label: String(form.get("label") || "New option"),
          required: form.get("required") === "on",
          position: (lastPosition?.position ?? -1) + 1,
        },
      });
      return { ok: true };
    }
    case "delete_option": {
      await prisma.option.delete({
        where: { id: String(form.get("optionId")) },
      });
      return { ok: true };
    }
    case "delete_set": {
      await prisma.optionSet.delete({ where: { id: optionSet.id } });
      throw redirect("/app/option-sets");
    }
  }
  return { ok: false };
};

export default function OptionSetEditor() {
  const { optionSet } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [name, setName] = useState(optionSet.name);
  const [status, setStatus] = useState(optionSet.status);

  return (
    <Page
      title={optionSet.name}
      titleMetadata={<Badge tone={status === "active" ? "success" : undefined}>{status}</Badge>}
      backAction={{ content: "Option sets", url: "/app/option-sets" }}
      secondaryActions={[
        {
          content: "Delete",
          destructive: true,
          onAction: () => {
            if (confirm("Delete this option set? This cannot be undone.")) {
              const fd = new FormData();
              fd.set("intent", "delete_set");
              fetcher.submit(fd, { method: "post" });
            }
          },
        },
      ]}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="update_meta" />
              <BlockStack gap="400">
                <TextField label="Name" name="name" value={name} onChange={setName} autoComplete="off" />
                <Select
                  label="Status"
                  name="status"
                  value={status}
                  onChange={setStatus}
                  options={[
                    { label: "Draft", value: "draft" },
                    { label: "Active", value: "active" },
                    { label: "Archived", value: "archived" },
                  ]}
                />
                <InlineStack>
                  <Button submit variant="primary">Save</Button>
                </InlineStack>
              </BlockStack>
            </fetcher.Form>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text as="h3" variant="headingMd">Options</Text>
              </InlineStack>
              {optionSet.options.length === 0 ? (
                <EmptyState
                  heading="No options yet"
                  image=""
                >
                  <p>Add your first option below.</p>
                </EmptyState>
              ) : (
                <BlockStack gap="300">
                  {optionSet.options.map((opt) => (
                    <Card key={opt.id} background="bg-surface-secondary">
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="100">
                          <Text as="p" fontWeight="semibold">{opt.label}</Text>
                          <Text as="p" tone="subdued">{opt.type} {opt.required ? "· required" : ""} · {opt.values.length} value(s)</Text>
                        </BlockStack>
                        <fetcher.Form method="post">
                          <input type="hidden" name="intent" value="delete_option" />
                          <input type="hidden" name="optionId" value={opt.id} />
                          <Button submit variant="plain" tone="critical">Remove</Button>
                        </fetcher.Form>
                      </InlineStack>
                    </Card>
                  ))}
                </BlockStack>
              )}

              <Divider />
              <AddOptionForm />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">Applied to</Text>
              <Text as="p" tone="subdued">{optionSet.productMappings.length} product(s) / collection(s) / tag(s)</Text>
              <Button>Manage assignments</Button>
            </BlockStack>
          </Card>

          {optionSet.aiGenerated && (
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">AI generated</Text>
                <Text as="p" tone="subdued">Original prompt:</Text>
                <Text as="p">{optionSet.aiGenerationPrompt}</Text>
              </BlockStack>
            </Card>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function AddOptionForm() {
  const fetcher = useFetcher();
  const [type, setType] = useState("text");
  const [label, setLabel] = useState("");
  const [required, setRequired] = useState(false);

  return (
    <fetcher.Form
      method="post"
      onSubmit={() => {
        setLabel("");
        setRequired(false);
      }}
    >
      <input type="hidden" name="intent" value="add_option" />
      <BlockStack gap="300">
        <Text as="h4" variant="headingSm">Add option</Text>
        <InlineStack gap="300" align="start">
          <div style={{ minWidth: 200 }}>
            <Select label="Type" name="type" options={OPTION_TYPES} value={type} onChange={setType} />
          </div>
          <div style={{ flex: 1 }}>
            <TextField label="Label" name="label" value={label} onChange={setLabel} autoComplete="off" />
          </div>
        </InlineStack>
        <Checkbox label="Required" name="required" checked={required} onChange={setRequired} />
        <InlineStack>
          <Button submit variant="primary" disabled={!label}>Add option</Button>
        </InlineStack>
      </BlockStack>
    </fetcher.Form>
  );
}
