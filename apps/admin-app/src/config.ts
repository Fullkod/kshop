// Build config of the admin app, injected by vite.config.ts from app.json and the env.
export type AdminAppConfig = {
  appId: string;
  name: string;
  versionCode: number;
  versionName: string;
  supabaseUrl: string;
  supabaseKey: string;
  apiBaseUrl: string;
  platformDomain: string;
  protocol: "http" | "https";
};

declare const __KSHOP_ADMIN_APP__: AdminAppConfig;

export const appConfig: AdminAppConfig = __KSHOP_ADMIN_APP__;

/** The full admin of a store on the web («Abrir el panel completo»). */
export const webAdminUrl = (slug: string, path = "/admin") =>
  `${appConfig.protocol}://${slug}.${appConfig.platformDomain}${path}`;
