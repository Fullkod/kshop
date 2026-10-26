// Build config of this store app (PRP-7 D4), injected by vite.config.ts from stores/{slug}.json and the env.
export type AppConfig = {
  storeId: string;
  slug: string;
  name: string;
  appId: string;
  versionCode: number;
  versionName: string;
  logoUrl: string | null;
  theme: { colors: { background: string; accent: string } };
  supabaseUrl: string;
  supabaseKey: string;
  apiBaseUrl: string;
};

declare const __KSHOP_APP__: AppConfig;

export const appConfig: AppConfig = __KSHOP_APP__;

/** The store on the web, for when the app cannot be used. */
export const storeWebUrl = `https://${appConfig.slug}.kshop.fullkod.com`;
