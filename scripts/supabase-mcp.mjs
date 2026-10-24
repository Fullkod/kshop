// Starts the Supabase MCP server scoped to the Kshop project.
// Reads SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF from .env.local (one Supabase account per project).
// Used by .mcp.json: node scripts/supabase-mcp.mjs

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const envPath = join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local");

const env = { ...process.env };
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^(SUPABASE_ACCESS_TOKEN|SUPABASE_PROJECT_REF)=(.*)$/);
    if (match) env[match[1]] = match[2].trim();
  }
}

// Never fall back to an unscoped server: without a project ref it could reach other projects.
if (!env.SUPABASE_PROJECT_REF) {
  console.error("supabase-mcp: set SUPABASE_PROJECT_REF in .env.local (Kshop's own Supabase project).");
  process.exit(1);
}

const child = spawn(
  "npx",
  ["-y", "@supabase/mcp-server-supabase@latest", `--project-ref=${env.SUPABASE_PROJECT_REF}`],
  { env, stdio: "inherit", shell: process.platform === "win32" },
);
child.on("exit", (code) => process.exit(code ?? 0));
