/// <reference types="@remix-run/node" />
/// <reference types="vite/client" />

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      SHOPIFY_API_KEY: string;
      SHOPIFY_API_SECRET: string;
      SCOPES: string;
      SHOPIFY_APP_URL: string;
      DATABASE_URL: string;
      REDIS_URL: string;
      DEEPSEEK_API_KEY: string;
      R2_ACCOUNT_ID: string;
      R2_ACCESS_KEY_ID: string;
      R2_SECRET_ACCESS_KEY: string;
      R2_BUCKET: string;
      R2_PUBLIC_URL: string;
      SHOP_TOKEN_ENCRYPTION_KEY: string;
      NODE_ENV: "development" | "production" | "test";
    }
  }
}

export {};
