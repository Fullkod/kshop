// Creates the signing key of one app (PRP-7 D12): one keystore per app, outside the repo. Losing it means that app
// can never be updated (Android only installs an update signed with the same key): keep a backup.
//
//   node scripts/app-keystore.mjs <slug|admin> [--dir <folder>] [--github]
//
// Writes <folder>/<slug>.jks (PKCS12, alias "kshop") and <slug>.password.txt; the folder defaults to
// %USERPROFILE%\.kshop\keystores. Never overwrites a key. --github also stores both as GitHub Actions secrets of
// the repo (ANDROID_KEYSTORE_<SLUG> in base64 and ANDROID_KEYSTORE_PASSWORD_<SLUG>) with the GitHub CLI.

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const [target, ...rest] = process.argv.slice(2);
const option = (name) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : undefined);
if (!target || !/^[a-z0-9][a-z0-9-]*$/.test(target)) {
  console.error("Usage: node scripts/app-keystore.mjs <slug|admin> [--dir <folder>] [--github]");
  process.exit(1);
}

const dir = option("--dir") ?? join(homedir(), ".kshop", "keystores");
const keystore = join(dir, `${target}.jks`);
const passwordFile = join(dir, `${target}.password.txt`);
const secretSuffix = target.toUpperCase().replace(/-/g, "_");

if (existsSync(keystore)) {
  console.log(`${keystore} already exists: it is kept (a new key could not update the installed app).`);
} else {
  mkdirSync(dir, { recursive: true });
  const password = randomBytes(24).toString("base64url");
  execFileSync(
    "keytool",
    [
      "-genkeypair",
      "-keystore",
      keystore,
      "-storetype",
      "PKCS12",
      "-alias",
      "kshop",
      "-keyalg",
      "RSA",
      "-keysize",
      "2048",
      "-validity",
      "10000",
      "-storepass",
      password,
      "-keypass",
      password,
      "-dname",
      `CN=Kshop ${target}, O=Fullkod, C=CU`,
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
  writeFileSync(passwordFile, `${password}\n`);
  console.log(`Created ${keystore} and ${passwordFile}. Back both up (they cannot be recreated).`);
}

if (rest.includes("--github")) {
  const set = (name, value) =>
    execFileSync("gh", ["secret", "set", name], { input: value, stdio: ["pipe", "inherit", "inherit"] });
  set(`ANDROID_KEYSTORE_${secretSuffix}`, readFileSync(keystore).toString("base64"));
  set(`ANDROID_KEYSTORE_PASSWORD_${secretSuffix}`, readFileSync(passwordFile, "utf8").trim());
  console.log(
    `GitHub secrets ANDROID_KEYSTORE_${secretSuffix} and ANDROID_KEYSTORE_PASSWORD_${secretSuffix} set.`,
  );
} else {
  console.log(
    `To sign in GitHub Actions: pnpm app:keystore ${target} --github ` +
      `(secrets ANDROID_KEYSTORE_${secretSuffix} and ANDROID_KEYSTORE_PASSWORD_${secretSuffix}).`,
  );
}
