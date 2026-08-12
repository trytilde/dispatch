import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const installations = sqliteTable("installations", {
  id: text("id").primaryKey(),
  phase: text("phase").notNull().default("tilde"),
  onboardingStep: text("onboarding_step").notNull().default("meet"),
  publicOrigin: text("public_origin"),
  sandboxProviderId: text("sandbox_provider_id"),
  sandboxInstanceId: text("sandbox_instance_id"),
  sandboxState: text("sandbox_state"),
  sandboxCreatedAt: integer("sandbox_created_at", { mode: "timestamp" }),
  sandboxCheckpointId: text("sandbox_checkpoint_id"),
  configurationDigest: text("configuration_digest"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const agentRegistrations = sqliteTable("agent_registrations", {
  sourceId: text("source_id").primaryKey(),
  providerId: text("provider_id").notNull(),
  remoteId: text("remote_id"),
  sourceDigest: text("source_digest").notNull(),
  status: text("status").notNull(),
  endpointUrl: text("endpoint_url").notNull(),
  lastError: text("last_error"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const skillRegistrations = sqliteTable("skill_registrations", {
  name: text("name").primaryKey(),
  providerId: text("provider_id").notNull(),
  remoteId: text("remote_id"),
  registryId: text("registry_id"),
  digest: text("digest").notNull(),
  status: text("status").notNull(),
  lastError: text("last_error"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const lifecycleLeases = sqliteTable("lifecycle_leases", {
  id: text("id").primaryKey(),
  holder: text("holder").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});

export const agentPublications = sqliteTable("agent_publications", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  status: text("status").notNull(),
  branch: text("branch").notNull(),
  pullRequestUrl: text("pull_request_url"),
  commitSha: text("commit_sha"),
  lastError: text("last_error"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const deploymentSteps = sqliteTable("deployment_steps", {
  id: text("id").primaryKey(),
  status: text("status").notNull(),
  outputJson: text("output_json").notNull().default("{}"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
