import { createDatabase, eq, installations } from "@openbot/db";
import type { SandboxHandle } from "@openbot/provider-sdk";

export const installationId = "default";

export async function ensureInstallation(origin?: string) {
  const db = createDatabase();
  const [current] = await db.select().from(installations).where(eq(installations.id, installationId));
  if (current) {
    if (origin && current.publicOrigin !== origin) {
      await db.update(installations).set({ publicOrigin: origin, updatedAt: new Date() }).where(eq(installations.id, installationId));
      return { ...current, publicOrigin: origin };
    }
    return current;
  }
  const now = new Date();
  const value = {
    id: installationId,
    phase: "tilde",
    onboardingStep: "meet",
    publicOrigin: origin ?? null,
    sandboxProviderId: null,
    sandboxInstanceId: null,
    sandboxState: null,
    sandboxCreatedAt: null,
    sandboxCheckpointId: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(installations).values(value);
  return value;
}

export async function updateInstallation(patch: Partial<{
  phase: string;
  onboardingStep: string;
  publicOrigin: string;
  sandboxProviderId: string | null;
  sandboxInstanceId: string | null;
  sandboxState: string | null;
  sandboxCreatedAt: Date | null;
  sandboxCheckpointId: string | null;
}>) {
  await ensureInstallation();
  await createDatabase().update(installations).set({ ...patch, updatedAt: new Date() }).where(eq(installations.id, installationId));
}

export async function persistSandbox(handle: SandboxHandle): Promise<void> {
  await updateInstallation({
    sandboxProviderId: handle.providerId,
    sandboxInstanceId: handle.id,
    sandboxState: handle.state,
    sandboxCreatedAt: handle.createdAt,
    sandboxCheckpointId: handle.checkpointId ?? null,
  });
}

export async function clearSandbox(): Promise<void> {
  await updateInstallation({
    sandboxProviderId: null,
    sandboxInstanceId: null,
    sandboxState: null,
    sandboxCreatedAt: null,
    sandboxCheckpointId: null,
  });
}
