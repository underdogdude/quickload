import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";

export type AppDatabase = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { db: AppDatabase | undefined; sql: ReturnType<typeof postgres> | undefined };

export function getDb(): AppDatabase {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!globalForDb.db) {
    // Supabase's transaction pooler (port 6543) does not preserve prepared
    // statements across backend sessions. Postgres.js enables them by default,
    // which causes intermittent SQLSTATE 26000 errors under pooled traffic.
    const client = postgres(url, { max: 10, prepare: false });
    globalForDb.sql = client;
    globalForDb.db = drizzle(client, { schema });
  }
  return globalForDb.db;
}
