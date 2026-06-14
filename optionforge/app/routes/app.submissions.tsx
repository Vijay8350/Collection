import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Card, IndexTable, Text, EmptyState } from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getShopByDomain } from "../lib/shop.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopByDomain(session.shop);
  const submissions = await prisma.submission.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return {
    submissions: submissions.map((s) => ({
      id: s.id,
      orderId: s.orderId,
      cartToken: s.cartToken,
      payload: s.payloadJson,
      createdAt: s.createdAt.toISOString(),
    })),
  };
};

export default function Submissions() {
  const { submissions } = useLoaderData<typeof loader>();

  if (submissions.length === 0) {
    return (
      <Page title="Submissions">
        <Card>
          <EmptyState heading="No submissions yet" image="">
            <p>Once customers configure options on a product, their submissions will appear here.</p>
          </EmptyState>
        </Card>
      </Page>
    );
  }

  return (
    <Page title="Submissions">
      <Card padding="0">
        <IndexTable
          itemCount={submissions.length}
          headings={[
            { title: "When" },
            { title: "Order / Cart" },
            { title: "Payload (truncated)" },
          ]}
          selectable={false}
        >
          {submissions.map((s, idx) => (
            <IndexTable.Row id={s.id} key={s.id} position={idx}>
              <IndexTable.Cell>{new Date(s.createdAt).toLocaleString()}</IndexTable.Cell>
              <IndexTable.Cell>{s.orderId ?? s.cartToken ?? "—"}</IndexTable.Cell>
              <IndexTable.Cell>
                <Text as="span" truncate>
                  {String(s.payload).slice(0, 120)}
                </Text>
              </IndexTable.Cell>
            </IndexTable.Row>
          ))}
        </IndexTable>
      </Card>
    </Page>
  );
}
