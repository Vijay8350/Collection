import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// GDPR (mandatory): redact all PII we hold for a specific customer within 30
// days. We delete uploaded files (may contain PII like photos) and overwrite
// the submission payload + identifying fields. The R2 objects behind deleted
// FileUpload rows expire via the bucket lifecycle TTL.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  const customerId = String((payload as any)?.customer?.id ?? "");
  const shopRecord = await prisma.shop.findUnique({ where: { shopifyDomain: shop } });
  if (!shopRecord || !customerId) return new Response();

  const matches = await prisma.submission.findMany({
    where: {
      shopId: shopRecord.id,
      payloadJson: { contains: customerId },
    },
  });

  for (const m of matches) {
    let fileIds: string[] = [];
    try {
      fileIds = JSON.parse(m.fileUploadIds || "[]");
    } catch {
      fileIds = [];
    }
    if (fileIds.length) {
      await prisma.fileUpload.deleteMany({
        where: { id: { in: fileIds }, shopId: shopRecord.id },
      });
    }
    await prisma.submission.update({
      where: { id: m.id },
      data: {
        payloadJson: JSON.stringify({ redacted: true, redactedAt: new Date().toISOString() }),
        fileUploadIds: "[]",
        compositePreviewUrl: null,
        cartToken: null,
      },
    });
  }

  console.log(
    `[customers/redact] ${shop} customer=${customerId} submissions=${matches.length} (files + PII cleared)`,
  );
  return new Response();
};
