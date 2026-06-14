import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@prisma/client";
import { decryptToken } from "../app/lib/crypto.server";

if (!process.env.REDIS_URL) {
  console.error("REDIS_URL is required to run the worker");
  process.exit(1);
}

const prisma = new PrismaClient();
const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });

const SHOPIFY_API_VERSION = "2025-01";

async function adminFetch(shopDomain: string, accessToken: string, query: string, variables?: any) {
  const res = await fetch(`https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

async function handleHiddenVariantCleanup(job: Job) {
  const { shopId } = job.data as { shopId: string };
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) return;

  // Mark all as pending deletion.
  await prisma.hiddenVariant.updateMany({
    where: { shopId, pendingDeletion: false },
    data: { pendingDeletion: true },
  });

  // If shop is uninstalled we have no access token, so just delete records.
  if (shop.uninstalledAt || !shop.accessTokenEnc) {
    await prisma.hiddenVariant.deleteMany({ where: { shopId } });
    return;
  }

  const accessToken = decryptToken(shop.accessTokenEnc);
  const mutation = `#graphql
    mutation DeleteVariant($id: ID!) {
      productVariantDelete(id: $id) {
        deletedProductVariantId
        userErrors { field message }
      }
    }
  `;

  let processed = 0;
  while (true) {
    const batch = await prisma.hiddenVariant.findMany({
      where: { shopId, pendingDeletion: true },
      take: 10,
    });
    if (batch.length === 0) break;
    for (const v of batch) {
      try {
        await adminFetch(shop.shopifyDomain, accessToken, mutation, { id: v.shopifyVariantId });
      } catch (err) {
        console.error("Failed to delete variant", v.shopifyVariantId, err);
      }
      await prisma.hiddenVariant.delete({ where: { id: v.id } });
      processed += 1;
      // throttle: 10/min to stay well under Shopify's REST/GraphQL leaky bucket.
      await new Promise((r) => setTimeout(r, 6_000));
    }
  }
  console.log(`Cleaned up ${processed} hidden variants for shop ${shopId}`);
}

new Worker(
  "optionforge",
  async (job) => {
    console.log(`[worker] processing ${job.name} id=${job.id}`);
    switch (job.name) {
      case "hidden-variant-cleanup":
        await handleHiddenVariantCleanup(job);
        break;
      default:
        console.warn(`Unknown job: ${job.name}`);
    }
  },
  { connection, concurrency: 2 },
);

console.log("OptionForge worker started");
