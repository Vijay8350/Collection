import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link, useNavigate } from "@remix-run/react";
import {
  Page,
  Card,
  IndexTable,
  Text,
  Badge,
  EmptyState,
  Button,
  useIndexResourceState,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getShopByDomain } from "../lib/shop.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopByDomain(session.shop);
  const optionSets = await prisma.optionSet.findMany({
    where: { shopId: shop.id },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { options: true, productMappings: true } },
    },
  });
  return {
    optionSets: optionSets.map((os) => ({
      id: os.id,
      name: os.name,
      status: os.status,
      aiGenerated: os.aiGenerated,
      optionCount: os._count.options,
      productCount: os._count.productMappings,
      updatedAt: os.updatedAt.toISOString(),
    })),
  };
};

export default function OptionSetsList() {
  const { optionSets } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const resourceName = { singular: "option set", plural: "option sets" };
  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(optionSets);

  if (optionSets.length === 0) {
    return (
      <Page title="Option sets">
        <Card>
          <EmptyState
            heading="No option sets yet"
            action={{ content: "Create one manually", url: "/app/option-sets/new" }}
            secondaryAction={{ content: "Generate with AI", url: "/app/ai-studio" }}
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <p>Create your first option set to start collecting custom inputs from customers.</p>
          </EmptyState>
        </Card>
      </Page>
    );
  }

  const rows = optionSets.map((os, idx) => (
    <IndexTable.Row id={os.id} key={os.id} position={idx} selected={selectedResources.includes(os.id)}>
      <IndexTable.Cell>
        <Link to={`/app/option-sets/${os.id}`}>
          <Text variant="bodyMd" fontWeight="bold" as="span">
            {os.name}
          </Text>
        </Link>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone={os.status === "active" ? "success" : os.status === "draft" ? undefined : "info"}>
          {os.status}
        </Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>{os.optionCount}</IndexTable.Cell>
      <IndexTable.Cell>{os.productCount}</IndexTable.Cell>
      <IndexTable.Cell>{os.aiGenerated ? <Badge tone="attention">AI</Badge> : null}</IndexTable.Cell>
      <IndexTable.Cell>{new Date(os.updatedAt).toLocaleDateString()}</IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page
      title="Option sets"
      primaryAction={{ content: "Create option set", onAction: () => navigate("/app/option-sets/new") }}
      secondaryActions={[{ content: "Generate with AI", onAction: () => navigate("/app/ai-studio") }]}
    >
      <Card padding="0">
        <IndexTable
          resourceName={resourceName}
          itemCount={optionSets.length}
          selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
          onSelectionChange={handleSelectionChange}
          headings={[
            { title: "Name" },
            { title: "Status" },
            { title: "Options" },
            { title: "Applied to" },
            { title: "Source" },
            { title: "Updated" },
          ]}
        >
          {rows}
        </IndexTable>
      </Card>
    </Page>
  );
}
