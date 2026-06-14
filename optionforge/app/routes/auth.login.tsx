import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { login } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));
  return { errors, polarisTranslations: {} };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));
  return { errors };
};

function loginErrorMessage(loginErrors: { shop?: string } | undefined) {
  if (loginErrors?.shop) {
    return { shop: loginErrors.shop };
  }
  return {};
}

export default function Auth() {
  return null;
}
