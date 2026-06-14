import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, payload } = await authenticate.webhook(request);
  console.log(`[scopes_update] ${shop}`, payload);
  if (session) {
    await prisma.session.updateMany({
      where: { shop },
      data: { scope: (payload as any)?.current?.join(",") ?? session.scope },
    });
  }
  return new Response();
};
