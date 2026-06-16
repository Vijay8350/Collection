import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

function safeParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

// GDPR (mandatory): respond within 30 days. We assemble every piece of data we
// hold for this customer so the merchant can fulfil the request.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  const customerId = (payload as any)?.customer?.id;
  const shopRecord = await prisma.shop.findUnique({ where: { shopifyDomain: shop } });
  if (!shopRecord || !customerId) return new Response();

  const submissions = await prisma.submission.findMany({
    where: {
      shopId: shopRecord.id,
      payloadJson: { contains: String(customerId) },
    },
  });

  const fileIds = submissions.flatMap((s) => {
    try {
      return JSON.parse(s.fileUploadIds || "[]") as string[];
    } catch {
      return [];
    }
  });
  const files = fileIds.length
    ? await prisma.fileUpload.findMany({
        where: { id: { in: fileIds }, shopId: shopRecord.id },
      })
    : [];

  const dataPackage = {
    shop,
    customerId,
    generatedAt: new Date().toISOString(),
    submissions: submissions.map((s) => ({
      id: s.id,
      orderId: s.orderId,
      createdAt: s.createdAt,
      data: safeParse(s.payloadJson),
    })),
    files: files.map((f) => ({
      id: f.id,
      filename: f.originalFilename,
      url: f.publicUrl,
      mimeType: f.mimeType,
      uploadedAt: f.createdAt,
    })),
  };

  // Logged for the 30-day audit trail. In production, deliver this package to
  // the merchant's contact email or as a signed download link.
  console.log(
    `[customers/data_request] data package for ${shop} customer=${customerId}:`,
    JSON.stringify(dataPackage),
  );
  return new Response();
};
