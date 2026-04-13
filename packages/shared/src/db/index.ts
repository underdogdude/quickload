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
    const client = postgres(url, { max: 10 });
    globalForDb.sql = client;
    globalForDb.db = drizzle(client, { schema });
  }
  return globalForDb.db;
}
