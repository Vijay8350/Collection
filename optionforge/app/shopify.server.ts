import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

// ─── Billing (Shopify Billing API) — Blueprint §3 / §18.5 ───
// One Shopify-facing plan per (internal plan × billing interval). Annual amounts
// are the 20%-off yearly totals from the pricing table. All paid plans get a
// 14-day trial. Free is the absence of a subscription (not billed here).
const TRIAL_DAYS = 14;

export type InternalPlan = "free" | "pro" | "premium" | "enterprise";

export interface PlanDefinition {
  /** Shopify-facing plan name; also the billing-config key and subscription name. */
  name: string;
  /** Our internal plan id stored on Shop.plan. */
  plan: InternalPlan;
  interval: "monthly" | "annual";
  amount: number;
}

export const PLAN_DEFINITIONS = [
  { name: "Pro", plan: "pro", interval: "monthly", amount: 9.99 },
  { name: "Pro (Annual)", plan: "pro", interval: "annual", amount: 95.9 },
  { name: "Premium", plan: "premium", interval: "monthly", amount: 19.99 },
  { name: "Premium (Annual)", plan: "premium", interval: "annual", amount: 191.9 },
  { name: "Enterprise", plan: "enterprise", interval: "monthly", amount: 79.99 },
  { name: "Enterprise (Annual)", plan: "enterprise", interval: "annual", amount: 767.9 },
] as const satisfies readonly PlanDefinition[];

export type PlanName = (typeof PLAN_DEFINITIONS)[number]["name"];

export const PLAN_BY_NAME: Record<string, PlanDefinition> = Object.fromEntries(
  PLAN_DEFINITIONS.map((p) => [p.name, p]),
);

// Test mode keeps real cards from being charged. Defaults on outside production;
// override with BILLING_TEST=true|false (set false only when charging for real).
export const billingIsTest =
  process.env.BILLING_TEST !== undefined
    ? process.env.BILLING_TEST === "true"
    : process.env.NODE_ENV !== "production";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  billing: {
    Pro: {
      trialDays: TRIAL_DAYS,
      lineItems: [{ amount: 9.99, currencyCode: "USD", interval: BillingInterval.Every30Days }],
    },
    "Pro (Annual)": {
      trialDays: TRIAL_DAYS,
      lineItems: [{ amount: 95.9, currencyCode: "USD", interval: BillingInterval.Annual }],
    },
    Premium: {
      trialDays: TRIAL_DAYS,
      lineItems: [{ amount: 19.99, currencyCode: "USD", interval: BillingInterval.Every30Days }],
    },
    "Premium (Annual)": {
      trialDays: TRIAL_DAYS,
      lineItems: [{ amount: 191.9, currencyCode: "USD", interval: BillingInterval.Annual }],
    },
    Enterprise: {
      trialDays: TRIAL_DAYS,
      lineItems: [{ amount: 79.99, currencyCode: "USD", interval: BillingInterval.Every30Days }],
    },
    "Enterprise (Annual)": {
      trialDays: TRIAL_DAYS,
      lineItems: [{ amount: 767.9, currencyCode: "USD", interval: BillingInterval.Annual }],
    },
  },
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    removeRest: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
