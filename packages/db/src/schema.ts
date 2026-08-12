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
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const deploymentSteps = sqliteTable("deployment_steps", {
  id: text("id").primaryKey(),
  status: text("status").notNull(),
  outputJson: text("output_json").notNull().default("{}"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
