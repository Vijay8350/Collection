import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { login } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();
  return (
    <div style={{ maxWidth: 640, margin: "60px auto", fontFamily: "Inter, system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 32, marginBottom: 8 }}>OptionForge</h1>
      <p style={{ fontSize: 18, color: "#637381" }}>
        Custom product options for Shopify — with AI-generated option sets and one-click migration
        from SC Product Options, ShopPad Infinite Options, Hulk, Globo, and Easify.
      </p>
      {showForm && (
        <Form method="post" action="/auth/login" style={{ marginTop: 32 }}>
          <label>
            <div>Install on your Shopify store</div>
            <input
              type="text"
              name="shop"
              placeholder="your-shop.myshopify.com"
              style={{ padding: 8, marginRight: 8, minWidth: 280 }}
            />
          </label>
          <button type="submit" style={{ padding: "8px 16px" }}>Install</button>
        </Form>
      )}
    </div>
  );
}
