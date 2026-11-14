// The manuals for each plan (Kshop Admin, A5, and the web panel, A4) from packages/admin/src/help/guides/app.html and
// web.html. An element with data-plans="caja base pro" only stays in those plans; {{PLAN}}, {{EQUIPO}} and
// {{PRODUCTOS}} are filled per plan. Output: apps/web/public/help/guias/kshop-<plan>-<app|web>.pdf, offered to every
// store in Ayuda › Descargar (all six: a store sees what the other plans have). Fails if a page overflows.
// No database and no dev server: it opens the HTML files.
//
//   pnpm help:guides                 the six
//   pnpm help:guides pro             only those plans
//   SHOTS=<folder> pnpm help:guides  also a PNG of every page, to review them

import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, "packages/admin/src/help/guides");
const OUT = join(root, "apps/web/public/help/guias");

// Limits of each plan as the manuals tell them. Change here if the plans change.
const PLANS = {
  caja: { name: "Caja", equipo: "2", productos: "hasta 300 productos" },
  base: { name: "Base", equipo: "2", productos: "hasta 300 productos" },
  pro: { name: "Pro", equipo: "10", productos: "productos ilimitados" },
};
const KINDS = ["app", "web"];

function chromiumPath() {
  if (process.env.QA_CHROMIUM_PATH) return process.env.QA_CHROMIUM_PATH;
  const cache = join(process.env.LOCALAPPDATA ?? join(process.env.HOME ?? "", ".cache"), "ms-playwright");
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

const plans = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PLANS);
const unknown = plans.filter((p) => !PLANS[p]);
if (unknown.length) throw new Error(`Unknown plan: ${unknown.join(", ")}`);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: chromiumPath() });
let failed = false;
try {
  for (const plan of plans) {
    const info = PLANS[plan];
    for (const kind of KINDS) {
      const page = await browser.newPage();
      await page.goto(pathToFileURL(join(SRC, `${kind}.html`)).href, { waitUntil: "networkidle" });
      const overflow = await page.evaluate(
        ({ plan, info }) => {
          document.querySelectorAll("[data-plans]").forEach((el) => {
            if (!el.dataset.plans.split(/\s+/).includes(plan)) el.remove();
          });
          const fill = (s) =>
            s
              .replaceAll("{{PLAN}}", info.name)
              .replaceAll("{{EQUIPO}}", info.equipo)
              .replaceAll("{{PRODUCTOS}}", info.productos);
          document.title = fill(document.title);
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) n.nodeValue = fill(n.nodeValue);
          return [...document.querySelectorAll("section.page")]
            .map((s, i) => (s.scrollHeight > s.clientHeight + 1 ? i + 1 : 0))
            .filter(Boolean);
        },
        { plan, info },
      );
      await page.evaluate(() => document.fonts.ready);
      const file = join(OUT, `kshop-${plan}-${kind}.pdf`);
      await page.pdf({ path: file, printBackground: true, preferCSSPageSize: true });
      const pages = await page.$$eval("section.page", (s) => s.length);
      if (process.env.SHOTS) {
        const shots = join(process.env.SHOTS, `${plan}-${kind}`);
        mkdirSync(shots, { recursive: true });
        const sections = await page.$$("section.page");
        for (let i = 0; i < sections.length; i++)
          await sections[i].screenshot({ path: join(shots, `${i + 1}.png`) });
      }
      if (overflow.length) failed = true;
      console.log(
        `${overflow.length ? "not ok" : "ok"} - ${relative(root, file)}: ${pages} pages` +
          (overflow.length ? ` (page ${overflow.join(", ")} overflows)` : ""),
      );
      await page.close();
    }
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
