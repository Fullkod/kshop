// Uploads an APK built by GitHub Actions (workflow android-app.yml) and registers it, hidden, in store_app_builds
// (PRP-7 D11, D13). The superadmin installs it, tries it and publishes it in Superadmin › Apps.
//
//   node scripts/app-publish.mjs <slug|admin> [--run <id>] [--dir <folder>] [--notes "…"]
//
// Without --dir it downloads the artifact "apk-<slug>" of the latest successful run (or --run) with the GitHub CLI
// (`gh`, signed in to the repo). --dir takes a folder with build.json and the APK (apps/<app>/release of
// `pnpm app:build <slug> --assemble`). The Supabase secret key stays here: it never goes to GitHub.

import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
    'Usage: node scripts/app-publish.mjs <slug|admin> [--run <id>] [--dir <folder>] [--notes "…"]',
  );
  process.exit(1);
}

const gh = (...args) => execFileSync("gh", args, { cwd: root, encoding: "utf8" });

let dir = option("--dir");
let tempDir = null;
if (!dir) {
  let runId = option("--run");
  if (!runId) {
    const runs = JSON.parse(
      gh(
        "run",
        "list",
        "--workflow",
        "android-app.yml",
        "--status",
        "success",
        "--limit",
        "50",
        "--json",
        "databaseId,displayTitle,createdAt",
      ),
    );
    const found = runs.find((r) => r.displayTitle === `Android app: ${target}`);
    if (!found) throw new Error(`No successful android-app run for "${target}": run the workflow first`);
    runId = String(found.databaseId);
    console.log(`Run ${runId} (${found.createdAt})`);
  }
  tempDir = mkdtempSync(join(tmpdir(), "kshop-apk-"));
  gh("run", "download", runId, "--name", `apk-${target}`, "--dir", tempDir);
  dir = tempDir;
}

try {
  const build = JSON.parse(readFileSync(join(dir, "build.json"), "utf8"));
  if (build.target !== target) throw new Error(`build.json is for "${build.target}", not "${target}"`);
  const apk = readFileSync(join(dir, build.apk));
  const sha256 = createHash("sha256").update(apk).digest("hex");
  if (sha256 !== build.sha256) throw new Error("The APK does not match its build.json (sha256)");

  const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false },
  });
  if (target !== "admin") {
    const { data: store, error } = await service.from("stores").select("id").eq("slug", target).single();
    if (error) throw error;
    if (store.id !== build.storeId) throw new Error("The APK belongs to another store id");
  }

  const path = `${build.storeId ? `stores/${build.storeId}` : "admin"}/${build.apk}`;
  const { error: uploadError } = await service.storage.from("store-apps").upload(path, apk, {
    contentType: "application/vnd.android.package-archive",
    upsert: false,
  });
  if (uploadError) throw new Error(`Upload of ${path} failed: ${uploadError.message}`);

  const { error: insertError } = await service.from("store_app_builds").insert({
    store_id: build.storeId,
    app_id: build.appId,
    version_code: build.versionCode,
    version_name: build.versionName,
    apk_path: path,
    size_bytes: build.sizeBytes,
    sha256,
    notes: option("--notes") ?? null,
    published: false,
  });
  if (insertError) {
    await service.storage.from("store-apps").remove([path]);
    throw new Error(`Register failed: ${insertError.message}`);
  }
  console.log(
    `${build.name} ${build.versionName} (${build.versionCode}) uploaded to store-apps/${path}, hidden.\n` +
      "Install it, try it and publish it in Superadmin › Apps.",
  );
} finally {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
}
