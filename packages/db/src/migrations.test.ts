import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { createClient } from "@libsql/client";
import { closeDatabase } from "./client.js";
import { migrate } from "./migrations.js";

afterEach(() => { closeDatabase(); delete process.env.DATABASE_URL; });

test("migrations are idempotent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "openbot-db-"));
  const url = `file:${join(directory, "openbot.db")}`;
  process.env.DATABASE_URL = url;
  await migrate(); await migrate();
  const client = createClient({ url });
  const rows = await client.execute("SELECT name FROM sqlite_master WHERE type='table'");
  const tables = rows.rows.map((row) => row.name);
  expect(tables).toContain("installations");
  expect(tables).toContain("deployment_steps");
  expect(tables).not.toContain("agents");
  expect(tables).not.toContain("chat_sessions");
  expect(tables).not.toContain("sandboxes");
  expect(tables).not.toContain("encrypted_secrets");
  client.close();
});

test("migrates the prototype schema to control-plane-only state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "openbot-db-legacy-"));
  const url = `file:${join(directory, "openbot.db")}`;
  const legacy = createClient({ url });
  await legacy.execute("CREATE TABLE installations (id TEXT PRIMARY KEY NOT NULL, phase TEXT NOT NULL, onboarding_step TEXT NOT NULL, public_origin TEXT, secret_salt TEXT, wrapped_data_key TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)");
  await legacy.execute("CREATE TABLE agents (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, tools_json TEXT NOT NULL, created_at INTEGER NOT NULL)");
  await legacy.execute({ sql: "INSERT INTO installations VALUES (?, ?, ?, ?, ?, ?, ?, ?)", args: ["default", "onboarding", "jobs", "https://openbot.test", "obsolete", "obsolete", 1, 2] });
  legacy.close();

  process.env.DATABASE_URL = url;
  await migrate();
  const client = createClient({ url });
  const tables = await client.execute("SELECT name FROM sqlite_master WHERE type='table'");
  expect(tables.rows.map((row) => row.name)).not.toContain("agents");
  const columns = await client.execute("PRAGMA table_info(installations)");
  expect(columns.rows.map((row) => row.name)).not.toContain("secret_salt");
  const installation = await client.execute("SELECT id, phase, onboarding_step FROM installations");
  expect(installation.rows[0]).toMatchObject({ id: "default", phase: "onboarding", onboarding_step: "jobs" });
  client.close();
});
