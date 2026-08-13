import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createClient } from "@libsql/client";
import { databaseUrl } from "./client.js";

const migrations = [
  `CREATE TABLE IF NOT EXISTS installations (id TEXT PRIMARY KEY NOT NULL, phase TEXT NOT NULL DEFAULT 'tilde', onboarding_step TEXT NOT NULL DEFAULT 'meet', public_origin TEXT, sandbox_provider_id TEXT, sandbox_instance_id TEXT, sandbox_state TEXT, sandbox_created_at INTEGER, sandbox_checkpoint_id TEXT, configuration_digest TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS deployment_steps (id TEXT PRIMARY KEY NOT NULL, status TEXT NOT NULL, output_json TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS agent_registrations (source_id TEXT PRIMARY KEY NOT NULL, provider_id TEXT NOT NULL, remote_id TEXT, source_digest TEXT NOT NULL, status TEXT NOT NULL, endpoint_url TEXT NOT NULL, last_error TEXT, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS skill_registrations (name TEXT PRIMARY KEY NOT NULL, provider_id TEXT NOT NULL, remote_id TEXT, registry_id TEXT, digest TEXT NOT NULL, status TEXT NOT NULL, last_error TEXT, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS lifecycle_leases (id TEXT PRIMARY KEY NOT NULL, holder TEXT NOT NULL, expires_at INTEGER NOT NULL)`,
];

const legacyTables = [
  "chat_sessions",
  "sandboxes",
  "agents",
  "encrypted_secrets",
  "provider_instances",
];

const installationColumns = [
  ["sandbox_provider_id", "TEXT"],
  ["sandbox_instance_id", "TEXT"],
  ["sandbox_state", "TEXT"],
  ["sandbox_created_at", "INTEGER"],
  ["sandbox_checkpoint_id", "TEXT"],
  ["configuration_digest", "TEXT"],
] as const;

export async function migrate(): Promise<void> {
  const url = databaseUrl();
  if (url.startsWith("file:")) {
    const value = url.slice(5);
    await mkdir(dirname(resolve(value)), { recursive: true });
  }
  const authToken = process.env.DATABASE_AUTH_TOKEN ?? process.env.TURSO_AUTH_TOKEN;
  const client = createClient({ url, ...(authToken ? { authToken } : {}) });
  try {
    for (const statement of migrations) await client.execute(statement);
    const result = await client.execute("PRAGMA table_info(installations)");
    const existing = new Set(result.rows.map((row) => String(row.name)));
    for (const [name, type] of installationColumns) {
      if (!existing.has(name))
        await client.execute(`ALTER TABLE installations ADD COLUMN ${name} ${type}`);
    }
    for (const table of legacyTables) await client.execute(`DROP TABLE IF EXISTS ${table}`);
    if (existing.has("secret_salt") || existing.has("wrapped_data_key")) {
      await client.execute("DROP TABLE IF EXISTS installations_next");
      await client.execute(
        `CREATE TABLE installations_next (id TEXT PRIMARY KEY NOT NULL, phase TEXT NOT NULL DEFAULT 'tilde', onboarding_step TEXT NOT NULL DEFAULT 'meet', public_origin TEXT, sandbox_provider_id TEXT, sandbox_instance_id TEXT, sandbox_state TEXT, sandbox_created_at INTEGER, sandbox_checkpoint_id TEXT, configuration_digest TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
      );
      await client.execute(
        `INSERT INTO installations_next (id, phase, onboarding_step, public_origin, sandbox_provider_id, sandbox_instance_id, sandbox_state, sandbox_created_at, sandbox_checkpoint_id, configuration_digest, created_at, updated_at) SELECT id, phase, onboarding_step, public_origin, sandbox_provider_id, sandbox_instance_id, sandbox_state, sandbox_created_at, sandbox_checkpoint_id, configuration_digest, created_at, updated_at FROM installations`,
      );
      await client.execute("DROP TABLE installations");
      await client.execute("ALTER TABLE installations_next RENAME TO installations");
    }
  } finally {
    client.close();
  }
}
