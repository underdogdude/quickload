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

const url = findDatabaseUrl();
if (!url) {
  console.error("DATABASE_URL not found. Add it to apps/user/.env.local or export DATABASE_URL.");
  process.exit(1);
}

const sqlPath = path.join(__dirname, "../sql/20260422_orders.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

const sqlClient = postgres(url, { max: 1 });
try {
  await sqlClient.unsafe(sql);
  console.log("Applied packages/shared/sql/20260422_orders.sql successfully.");
} finally {
  await sqlClient.end({ timeout: 5 });
}
