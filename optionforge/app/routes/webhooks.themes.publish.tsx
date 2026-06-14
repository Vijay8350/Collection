import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// When merchant publishes a new theme we re-verify the App Embed is enabled.
// Theme App Extension App Embeds carry over by default, so usually no-op,
// but we log to surface support tickets early.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  console.log(`[themes/publish] ${shop} themeId=${(payload as any)?.id}`);
  // TODO: schedule a background job to call Admin GraphQL `theme.files(filenames: ...)`
  //       and warn merchant if App Embed is disabled.
  return new Response();
};
