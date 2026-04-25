// Generic SQL migration runner: `node apply-sql.mjs <relative-or-absolute-sql-path>`.
// Uses the `postgres` npm dep already shipped with @quickload/shared — no psql required.
// DATABASE_URL is read from apps/user/.env.local, apps/user/.env, packages/shared/.env,
// or the process env (in that order).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findDatabaseUrl() {
  const candidates = [
    path.join(__dirname, "../../../apps/user/.env.local"),
    path.join(__dirname, "../../../apps/user/.env"),
    path.join(__dirname, "../.env"),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      if (trimmed.startsWith("DATABASE_URL=")) {
        let v = trimmed.slice("DATABASE_URL=".length).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        return v;
      }
    }
  }
  return process.env.DATABASE_URL ?? null;
}

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: node packages/shared/scripts/apply-sql.mjs <path-to-sql>");
  process.exit(1);
}

const sqlPath = path.isAbsolute(arg) ? arg : path.resolve(process.cwd(), arg);
if (!fs.existsSync(sqlPath)) {
  console.error(`SQL file not found: ${sqlPath}`);
  process.exit(1);
}

const url = findDatabaseUrl();
if (!url) {
  console.error("DATABASE_URL not found. Add it to apps/user/.env.local or export DATABASE_URL.");
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, "utf8");
const client = postgres(url, { max: 1 });
try {
  await client.unsafe(sql);
  console.log(`Applied ${path.relative(process.cwd(), sqlPath)} successfully.`);
} finally {
  await client.end({ timeout: 5 });
}
