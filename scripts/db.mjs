// Database tooling for Kshop's online Supabase project, through the Supabase Management API
// (no database password needed). Reads SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF from .env.local.
// With KSHOP_DB_TARGET=local in the process environment (set by scripts/db-env.mjs, never read from .env.local) it
// talks to the local Supabase (Docker) through KSHOP_LOCAL_DB_URL instead; auth-config is then a no-op
// (supabase/config.toml holds the local auth settings).
//
//   node scripts/db.mjs status             applied vs pending migrations
//   node scripts/db.mjs migrate            apply pending supabase/migrations/*.sql (recorded in the history)
//   node scripts/db.mjs query "<sql>"      run SQL (or: query -f file.sql)
//   node scripts/db.mjs test [filter]      run supabase/tests/*.sql (RLS isolation); each runs inside a rolled back transaction
//   node scripts/db.mjs auth-config        apply supabase/auth-config.json (site URL, redirect URLs)
//   node scripts/db.mjs graphql-schema     write packages/data/graphql/schema.json for codegen

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const env = { ...process.env };
  const envPath = join(root, ".env.local");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !env[match[1]]) env[match[1]] = match[2].trim();
    }
  }
  if (process.env.KSHOP_DB_TARGET === "local") {
    if (!process.env.KSHOP_LOCAL_DB_URL) {
      console.error("db: KSHOP_DB_TARGET=local needs KSHOP_LOCAL_DB_URL (run through scripts/db-env.mjs)");
      process.exit(1);
    }
    return env;
  }
  if (!env.SUPABASE_ACCESS_TOKEN || !env.SUPABASE_PROJECT_REF) {
    console.error("db: set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF in .env.local");
    process.exit(1);
  }
  return env;
}

const env = loadEnv();
const api = `https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}`;

async function call(method, path, body) {
  const res = await fetch(`${api}${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = data?.message ?? text;
    throw new Error(`${method} ${path} -> ${res.status}: ${message}`);
  }
  return data;
}

const local = process.env.KSHOP_DB_TARGET === "local";
const localSql = local ? postgres(process.env.KSHOP_LOCAL_DB_URL, { max: 1, onnotice: () => {} }) : null;

// Like the Management API: the rows of the last statement that returned columns (a script may end in `rollback`).
async function localQuery(text) {
  const result = await localSql.unsafe(text).simple();
  const results = Array.isArray(result[0]) || result.length === 0 ? result : [result];
  const withRows = results.filter((r) => Array.isArray(r) && r.columns?.length);
  return withRows.length ? [...withRows.at(-1)] : [];
}

const query = (sql) => (local ? localQuery(sql) : call("POST", "/database/query", { query: sql }));

function localMigrations() {
  const dir = join(root, "supabase", "migrations");
  return readdirSync(dir)
    .filter((f) => /^\d{14}_.+\.sql$/.test(f))
    .sort()
    .map((file) => ({ file, version: file.slice(0, 14), name: file.slice(15, -4), path: join(dir, file) }));
}

async function appliedMigrations() {
  const rows = local
    ? await query("select name from supabase_migrations.schema_migrations")
    : await call("GET", "/database/migrations");
  return new Set(rows.map((r) => r.name));
}

async function status() {
  const applied = await appliedMigrations();
  for (const m of localMigrations()) console.log(`${applied.has(m.name) ? "applied" : "PENDING"}  ${m.file}`);
}

async function migrate() {
  const applied = await appliedMigrations();
  const pending = localMigrations().filter((m) => !applied.has(m.name));
  if (pending.length === 0) return console.log("Nothing to apply.");
  for (const m of pending) {
    process.stdout.write(`Applying ${m.file} ... `);
    if (local) {
      await query(
        `begin;
${readFileSync(m.path, "utf8")}
;insert into supabase_migrations.schema_migrations (version, name) values ('${m.version}', '${m.name}');
commit;`,
      );
      console.log("ok");
      continue;
    }
    await call("POST", "/database/migrations", { name: m.name, query: readFileSync(m.path, "utf8") });
    // The API stamps the current time as version; keep the file's version so the history matches the CLI.
    await query(
      `update supabase_migrations.schema_migrations set version = '${m.version}' where name = '${m.name}'`,
    );
    console.log("ok");
  }
}

async function runTests(filter) {
  const dir = join(root, "supabase", "tests");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".test.sql") && (!filter || f.includes(filter)))
    .sort();
  const harness = readFileSync(join(dir, "_harness.sql"), "utf8");
  let failed = 0;
  let total = 0;
  for (const file of files) {
    console.log(`\n# ${file}`);
    const body = readFileSync(join(dir, file), "utf8");
    // Everything runs in one transaction that is rolled back, so the online database keeps no test data.
    const sql = `begin;\n${harness}\n${body}\nselect seq, name, ok, detail from pg_temp.results order by seq;\nrollback;`;
    let rows;
    try {
      rows = await query(sql);
    } catch (error) {
      total++;
      failed++;
      console.log(`not ok - ${file} crashed: ${error.message}`);
      continue;
    }
    for (const row of rows) {
      total++;
      if (row.ok) console.log(`ok ${row.seq} - ${row.name}`);
      else {
        failed++;
        console.log(`not ok ${row.seq} - ${row.name}${row.detail ? ` (${row.detail})` : ""}`);
      }
    }
  }
  console.log(`\n${total - failed}/${total} passed${failed ? `, ${failed} failed` : ""}`);
  if (failed) process.exitCode = 1;
}

async function authConfig() {
  if (local)
    return console.log("Local database: auth settings live in supabase/config.toml (restart the stack).");
  const config = JSON.parse(readFileSync(join(root, "supabase", "auth-config.json"), "utf8"));
  await call("PATCH", "/config/auth", config);
  console.log("Auth config applied:", Object.keys(config).join(", "));
}

// pg_graphql introspection is disabled on the live API (the schema is not discoverable). For codegen we
// enable it only inside a rolled back transaction and introspect as `authenticated` (a superset of anon).
async function graphqlSchema() {
  const { getIntrospectionQuery } = await import("graphql");
  const introspection = getIntrospectionQuery({ descriptions: true }).replaceAll("$$", "");
  const comment = '@graphql({"inflect_names": true, "max_rows": 100, "introspection": true})';
  const rows = await query(
    `begin;
     comment on schema public is '${comment}';
     set local role authenticated;
     select graphql.resolve(query := $gql$${introspection}$gql$) as result;
     rollback;`,
  );
  const result = rows[0].result;
  if (result.errors) throw new Error(JSON.stringify(result.errors));
  const out = join(root, "packages", "data", "graphql", "schema.json");
  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`GraphQL schema written to ${out}`);
}

const [command, ...args] = process.argv.slice(2);
try {
  if (command === "status") await status();
  else if (command === "migrate") await migrate();
  else if (command === "test") await runTests(args[0]);
  else if (command === "auth-config") await authConfig();
  else if (command === "graphql-schema") await graphqlSchema();
  else if (command === "query") {
    const sql = args[0] === "-f" ? readFileSync(args[1], "utf8") : args.join(" ");
    console.log(JSON.stringify(await query(sql), null, 2));
  } else {
    console.error("Usage: node scripts/db.mjs <status|migrate|query|test|auth-config|graphql-schema>");
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await localSql?.end();
}
