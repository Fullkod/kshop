// KSH0005: prints the store help (/help/print on the platform, public) to apps/web/public/help/kshop-ayuda.pdf,
// the PDF of the Ayuda page. Run it after help:shots when guides or screenshots change. Needs pnpm dev
// (QA_PLATFORM_URL / QA_BASE_URL for another port).
//
//   pnpm help:pdf

import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = process.env;
const PORT = new URL(env.QA_BASE_URL ?? "http://localhost:3000").port || "3000";
const PLATFORM_URL = env.QA_PLATFORM_URL ?? `http://kshop.localhost:${PORT}`;
const OUT = join(root, "apps/web/public/help/kshop-ayuda.pdf");
mkdirSync(dirname(OUT), { recursive: true });

function chromiumPath() {
  if (env.QA_CHROMIUM_PATH) return env.QA_CHROMIUM_PATH;
  const cache = join(env.LOCALAPPDATA ?? join(env.HOME ?? "", ".cache"), "ms-playwright");
  const dirs = existsSync(cache) ? readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)) : [];
  dirs.sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const dir of dirs) {
    for (const exe of [
      "chrome-win64/chrome.exe",
      "chrome-linux/chrome",
      "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
    ]) {
      if (existsSync(join(cache, dir, exe))) return join(cache, dir, exe);
    }
  }
  throw new Error(
    `No Chromium in ${cache}; install one (npx playwright install chromium) or set QA_CHROMIUM_PATH`,
  );
}

const browser = await chromium.launch({ executablePath: chromiumPath() });
try {
  const page = await browser.newPage({ colorScheme: "light" });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("kshop-theme", "light");
    } catch {
      // the print view is light anyway
    }
  });
  await page.goto(`${PLATFORM_URL}/help/print`);
  await page.getByTestId("help-print").waitFor({ timeout: 60000 });
  // Every screenshot loaded (a missing PNG fails here, not as a blank box in the PDF).
  const broken = await page.evaluate(async () => {
    const imgs = [...document.images];
    await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => (i.onload = i.onerror = r)))));
    return imgs.filter((i) => i.naturalWidth === 0).map((i) => i.getAttribute("src"));
  });
  if (broken.length)
    throw new Error(`Screenshots that do not load: ${broken.join(", ")} (run pnpm help:shots)`);
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: OUT,
    format: "A4",
    printBackground: true,
    margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" },
  });
  console.log(`ok - ${OUT} (${Math.round(statSync(OUT).size / 1024)} KB)`);
} finally {
  await browser.close();
}
