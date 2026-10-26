import type { CapacitorConfig } from "@capacitor/cli";
import { readFileSync } from "node:fs";

// appId and name from app.json, like the web bundle (PRP-7 D2): «Kshop Admin», com.fullkod.kshop.admin.
const app = JSON.parse(readFileSync(new URL("./app.json", import.meta.url), "utf8")) as {
  appId: string;
  name: string;
};

const config: CapacitorConfig = {
  appId: app.appId,
  appName: app.name,
  webDir: "dist",
  android: { allowMixedContent: false },
  plugins: {
    SplashScreen: { launchShowDuration: 800, backgroundColor: "#24104F", showSpinner: false },
  },
};

export default config;
