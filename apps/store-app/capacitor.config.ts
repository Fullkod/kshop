import type { CapacitorConfig } from "@capacitor/cli";
import { readFileSync } from "node:fs";

// appId and name come from the store's build config (stores/{slug}.json), like the web bundle (PRP-7 D4).
const slug = process.env.KSHOP_STORE ?? "demo";
const store = JSON.parse(readFileSync(new URL(`./stores/${slug}.json`, import.meta.url), "utf8")) as {
  appId: string;
  name: string;
  theme: { colors: { background: string } };
};

const config: CapacitorConfig = {
  appId: store.appId,
  appName: store.name,
  webDir: "dist",
  android: { allowMixedContent: false },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: store.theme.colors.background,
      showSpinner: false,
    },
  },
};

export default config;
