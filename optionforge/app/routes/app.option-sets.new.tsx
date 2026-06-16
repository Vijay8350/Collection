import { useState } from "react";
import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useNavigation } from "@remix-run/react";
import {
  Page,
  Card,
  FormLayout,
  TextField,
  Select,
  Button,
  Banner,
  BlockStack,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getShopByDomain, isOptionSetLimitReached } from "../lib/shop.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopByDomain(session.shop);
  const form = await request.formData();
  const name = String(form.get("name") || "").trim();
  const appliedScope = String(form.get("appliedScope") || "product");

  if (!name) return { error: "Name is required" };

  // Enforce per-plan option-set cap server-side (public-app requirement).
  const { reached, limit } = await isOptionSetLimitReached(shop);
  if (reached) {
    return {
      error: `Your ${shop.plan} plan allows up to ${limit} option set${limit === 1 ? "" : "s"}. Upgrade in Settings to add more.`,
    };
  }

  const optionSet = await prisma.optionSet.create({
    data: { shopId: shop.id, name, appliedScope },
  });
  throw redirect(`/app/option-sets/${optionSet.id}`);
};

export default function NewOptionSet() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const [name, setName] = useState("");
  const [scope, setScope] = useState("product");

  return (
    <Page title="Create option set" backAction={{ content: "Back", url: "/app/option-sets" }}>
      <Card>
        <Form method="post">
          <BlockStack gap="400">
            {actionData?.error && <Banner tone="critical">{actionData.error}</Banner>}
            <FormLayout>
              <TextField
                name="name"
                label="Name"
                helpText="Internal name — customers won't see this."
                value={name}
                onChange={setName}
                autoComplete="off"
              />
              <Select
                name="appliedScope"
                label="Apply to"
                options={[
                  { label: "Specific products", value: "product" },
                  { label: "Entire collection", value: "collection" },
                  { label: "Products with tag", value: "tag" },
                  { label: "All products", value: "all" },
                ]}
                value={scope}
                onChange={setScope}
              />
            </FormLayout>
            <Button submit variant="primary" loading={submitting}>Create</Button>
          </BlockStack>
        </Form>
      </Card>
    </Page>
  );
}
