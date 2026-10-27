// Builds the Android app of a store or the admin app (PRP-7 D4, D11, D12, D14). Runs in GitHub Actions (workflow
// android-app.yml) and, up to the native project, also here without a JDK:
//
//   node scripts/app-build.mjs <slug|admin> [--version-code n] [--version-name x.y.z] [--assemble]
//
// 1. Config: apps/store-app/stores/{slug}.json from public data (scripts/app-config.mjs), or apps/admin-app/app.json.
// 2. Vite bundle of the app.
// 3. Native project apps/<app>/android and capacitor.config.json (generated, git-ignored): `cap add`/`cap sync`,
//    version in build.gradle.
// 4. Icon and splash: the store logo on its background color; the store initial on its color when there is no logo
//    or it is horizontal (D14). The admin app uses the Kshop symbol.
// 5. --assemble: `gradlew assembleRelease` signed with the app's keystore (KSHOP_KEYSTORE_FILE,
//    KSHOP_KEYSTORE_PASSWORD, KSHOP_KEY_ALIAS) → apps/<app>/release/{appId}-{versionName}.apk + build.json, the
//    input of `pnpm app:publish`. Needs JDK 21 and the Android SDK (both in the GitHub runner).

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };
for (const line of existsSync(join(root, ".env.local"))
  ? readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)
  : []) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !env[match[1]]) env[match[1]] = match[2].trim();
}

const [target, ...rest] = process.argv.slice(2);
const option = (name) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : undefined);
if (!target || !/^[a-z0-9][a-z0-9-]*$/.test(target)) {
  console.error(
    "Usage: node scripts/app-build.mjs <slug|admin> [--version-code n] [--version-name x.y.z] [--assemble]",
  );
  process.exit(1);
}
const isAdmin = target === "admin";
const appDir = join(root, "apps", isAdmin ? "admin-app" : "store-app");
const assemble = rest.includes("--assemble");

function run(cmd, args, options = {}) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32", ...options });
  if (result.status !== 0) throw new Error(`${cmd} ${args[0]} failed (${result.status})`);
}

// 1. Config.
let app;
if (isAdmin) {
  const json = JSON.parse(readFileSync(join(appDir, "app.json"), "utf8"));
  let versionCode = Number(option("--version-code"));
  if (!versionCode) {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/app_info`, {
      method: "POST",
      headers: {
        apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    versionCode = ((await res.json())?.latest?.version_code ?? 0) + 1;
  }
  app = {
    ...json,
    versionCode,
    versionName: option("--version-name") ?? `1.0.${versionCode}`,
    storeId: null,
    slug: "admin",
    logo: { svg: readFileSync(join(appDir, "public/icon.svg"), "utf8") },
    background: "#FFFFFF",
    accent: "#5B21B6",
    splashBackground: "#24104F",
  };
} else {
  const args = ["scripts/app-config.mjs", target];
  for (const name of ["--version-code", "--version-name"]) if (option(name)) args.push(name, option(name));
  run("node", args, { cwd: root });
  const store = JSON.parse(readFileSync(join(appDir, "stores", `${target}.json`), "utf8"));
  app = {
    ...store,
    logo: store.logoUrl ? { url: store.logoUrl } : null,
    background: store.theme.colors.background,
    accent: store.theme.colors.accent,
    splashBackground: store.theme.colors.background,
  };
}
console.log(`${app.name}: ${app.appId} ${app.versionName} (${app.versionCode})`);

const buildEnv = {
  ...process.env,
  KSHOP_STORE: isAdmin ? "" : target,
  KSHOP_APP_VERSION_CODE: String(app.versionCode),
  KSHOP_APP_VERSION_NAME: app.versionName,
};

// 2. Vite bundle.
run("pnpm", ["--filter", isAdmin ? "@kshop/admin-app" : "@kshop/store-app", "build"], {
  cwd: root,
  env: buildEnv,
});

// 3. Native project (capacitor.config.json is generated too: the CLI cannot load a .ts config in an ESM package).
writeFileSync(
  join(appDir, "capacitor.config.json"),
  `${JSON.stringify(
    {
      appId: app.appId,
      appName: app.name,
      webDir: "dist",
      android: { allowMixedContent: false },
      plugins: {
        // The app hides it when its first screen is ready (useHideSplash), not after a fixed time.
        SplashScreen: { launchAutoHide: false, backgroundColor: app.splashBackground, showSpinner: false },
      },
    },
    null,
    2,
  )}
`,
);
// A store app's project is regenerated when it belongs to another store.
const androidDir = join(appDir, "android");
const marker = join(androidDir, ".kshop-app");
if (existsSync(androidDir) && (!existsSync(marker) || readFileSync(marker, "utf8") !== app.appId)) {
  rmSync(androidDir, { recursive: true, force: true });
}
if (!existsSync(androidDir)) {
  run("pnpm", ["exec", "cap", "add", "android"], { cwd: appDir, env: buildEnv });
  writeFileSync(marker, app.appId);
}
run("pnpm", ["exec", "cap", "sync", "android"], { cwd: appDir, env: buildEnv });

const gradlePath = join(androidDir, "app/build.gradle");
const gradle = readFileSync(gradlePath, "utf8")
  .replace(/versionCode \d+/, `versionCode ${app.versionCode}`)
  .replace(/versionName "[^"]*"/, `versionName "${app.versionName}"`);
if (!gradle.includes(`versionCode ${app.versionCode}`))
  throw new Error("versionCode not found in build.gradle");
writeFileSync(gradlePath, gradle);

// 4. Icon and splash.
const escapeXml = (text) => text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The logo as a trimmed PNG buffer, or null (no logo, unreadable or horizontal → the initial is used). */
async function logoImage() {
  if (!app.logo) return null;
  try {
    const input = app.logo.svg
      ? Buffer.from(app.logo.svg)
      : Buffer.from(await (await fetch(app.logo.url)).arrayBuffer());
    const png = await sharp(input, { density: 600 }).trim().png().toBuffer();
    const { width, height } = await sharp(png).metadata();
    if (width / height > 1.4) {
      console.log("The logo is horizontal: the icon uses the store initial.");
      return null;
    }
    return png;
  } catch (error) {
    console.warn(`Logo not usable (${error.message}): the icon uses the store initial.`);
    return null;
  }
}

const logo = await logoImage();
const initial = [...app.name.trim()][0]?.toUpperCase() ?? "K";
// Without a logo the icon is the initial in white on the accent color.
const iconBackground = logo ? app.background : app.accent;

/** Content of an icon: the logo, or the initial, centered in a size×size transparent square at `scale`. */
async function mark(size, scale, color = "#FFFFFF", source = logo) {
  const box = Math.round(size * scale);
  const content = source
    ? await sharp(source).resize(box, box, { fit: "contain", background: "#00000000" }).png().toBuffer()
    : await sharp(
        Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${box}" height="${box}" viewBox="0 0 100 100">` +
            `<text x="50" y="50" dy="0.35em" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" ` +
            `font-weight="700" font-size="64" fill="${color}">${escapeXml(initial)}</text></svg>`,
        ),
      )
        .png()
        .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: "#00000000" } })
    .composite([{ input: content, gravity: "center" }])
    .png()
    .toBuffer();
}

async function legacyIcon(size, round) {
  const shape = round
    ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${iconBackground}"/>`
    : `<rect width="${size}" height="${size}" rx="${size * 0.18}" fill="${iconBackground}"/>`;
  const base = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${shape}</svg>`,
  );
  return sharp(base)
    .composite([{ input: await mark(size, round ? 0.6 : 0.7) }])
    .png()
    .toBuffer();
}

async function splash(width, height) {
  const side = Math.round(Math.min(width, height) * 0.3);
  // The admin splash is the night color: the symbol goes white there.
  const source = app.logo?.svg
    ? await sharp(Buffer.from(app.logo.svg.replaceAll("#5B21B6", "#FFFFFF")), { density: 600 })
        .trim()
        .png()
        .toBuffer()
    : logo;
  const background = source ? app.splashBackground : app.accent;
  return sharp({ create: { width, height, channels: 4, background } })
    .composite([{ input: await mark(side, 1, "#FFFFFF", source), gravity: "center" }])
    .png()
    .toBuffer();
}

function filesNamed(dir, pattern) {
  return readdirSync(dir, { recursive: true })
    .map((f) => join(dir, String(f)))
    .filter((f) => pattern.test(f.replaceAll("\\", "/")) && statSync(f).isFile());
}

const res = join(androidDir, "app/src/main/res");
for (const file of filesNamed(res, /\/mipmap-[^/]+\/ic_launcher(_round|_foreground)?\.png$/)) {
  const { width } = await sharp(file).metadata();
  // Adaptive foreground: 108 dp with the visible circle in the middle 66 dp.
  const image = file.endsWith("_foreground.png")
    ? await mark(width, 0.5)
    : await legacyIcon(width, file.endsWith("_round.png"));
  writeFileSync(file, image);
}
const backgroundXml = join(res, "values/ic_launcher_background.xml");
writeFileSync(
  backgroundXml,
  readFileSync(backgroundXml, "utf8").replace(/#[0-9A-Fa-f]{6,8}/, iconBackground),
);
for (const file of filesNamed(res, /\/drawable[^/]*\/splash\.png$/)) {
  const { width, height } = await sharp(file).metadata();
  writeFileSync(file, await splash(width, height));
}
console.log(`Icon and splash written (${logo ? "logo" : `initial «${initial}»`}).`);

// 5. Signed APK.
if (!assemble) {
  console.log(`Native project ready in ${androidDir} (no --assemble: no APK).`);
  process.exit(0);
}
const keystore = env.KSHOP_KEYSTORE_FILE;
if (!keystore || !existsSync(keystore) || !env.KSHOP_KEYSTORE_PASSWORD) {
  throw new Error(
    "KSHOP_KEYSTORE_FILE / KSHOP_KEYSTORE_PASSWORD missing: the APK must be signed with the app's key",
  );
}
const gradlew = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
run(
  gradlew,
  [
    "assembleRelease",
    "--no-daemon",
    `-Pandroid.injected.signing.store.file=${keystore}`,
    `-Pandroid.injected.signing.store.password=${env.KSHOP_KEYSTORE_PASSWORD}`,
    `-Pandroid.injected.signing.key.alias=${env.KSHOP_KEY_ALIAS ?? "kshop"}`,
    `-Pandroid.injected.signing.key.password=${env.KSHOP_KEYSTORE_PASSWORD}`,
  ],
  { cwd: androidDir, stdio: ["inherit", "inherit", "inherit"] },
);

const apkDir = join(androidDir, "app/build/outputs/apk/release");
const built = readdirSync(apkDir).find((f) => f.endsWith(".apk") && !f.includes("unsigned"));
if (!built) throw new Error(`No signed APK in ${apkDir}`);
const releaseDir = join(appDir, "release");
rmSync(releaseDir, { recursive: true, force: true });
mkdirSync(releaseDir, { recursive: true });
const apkName = `${app.appId}-${app.versionName}.apk`;
copyFileSync(join(apkDir, built), join(releaseDir, apkName));
const apk = readFileSync(join(releaseDir, apkName));
const info = {
  target,
  storeId: app.storeId,
  appId: app.appId,
  name: app.name,
  versionCode: app.versionCode,
  versionName: app.versionName,
  apk: apkName,
  sizeBytes: apk.length,
  sha256: createHash("sha256").update(apk).digest("hex"),
};
writeFileSync(join(releaseDir, "build.json"), `${JSON.stringify(info, null, 2)}\n`);
console.log(`APK: ${join(releaseDir, apkName)} (${(apk.length / 1024 / 1024).toFixed(1)} MB)`);
