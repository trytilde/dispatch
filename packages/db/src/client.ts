import { createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema.js";

let cached: LibSQLDatabase<typeof schema> | undefined;
let cachedClient: ReturnType<typeof createClient> | undefined;

export function databaseUrl(): string {
  const configured = process.env.DATABASE_URL ?? process.env.TURSO_DATABASE_URL;
  if (configured && !configured.startsWith("file:")) return configured;
  const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
  const path = configured?.slice("file:".length) || ".data/openbot.db";
  return `file:${isAbsolute(path) ? path : resolve(workspaceRoot, path)}`;
}

export function createDatabase(): LibSQLDatabase<typeof schema> {
  if (cached) return cached;
  const authToken = process.env.DATABASE_AUTH_TOKEN ?? process.env.TURSO_AUTH_TOKEN;
  cachedClient = createClient({ url: databaseUrl(), ...(authToken ? { authToken } : {}) });
  cached = drizzle(cachedClient, { schema });
  return cached;
}

export function closeDatabase(): void {
  cachedClient?.close();
  cachedClient = undefined;
  cached = undefined;
}
