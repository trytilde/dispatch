import { createHash } from "node:crypto";
import { TildeAgentProvider } from "@openbot/agent-provider";
import { agentRegistrations, createDatabase, eq, skillRegistrations } from "@openbot/db";
import type { SkillProvider } from "@openbot/provider-sdk";
import { environmentNames, getEnvironment, providerContext, setEnvironment, tildeEnvironment } from "./environment.js";
import { configuredProvider } from "./provider-registry.js";
import { loadRepository } from "./repository.js";
import { ensureInstallation, updateInstallation, withLifecycleLease } from "./store.js";

export interface ReconcileReport {
  digest: string;
  skipped?: string;
  registryId?: string;
  skills: readonly { name: string; status: string; remoteId?: string }[];
  agents: readonly { id: string; status: string; remoteId?: string; endpointUrl: string }[];
  errors: readonly string[];
}

export async function reconcileRepository(input: { origin?: string; prune?: boolean } = {}): Promise<ReconcileReport> {
  return withLifecycleLease("repository-reconcile", async () => {
    const repository = await loadRepository();
    const installation = await ensureInstallation(input.origin);
    const origin = input.origin ?? installation.publicOrigin ?? process.env.OPENBOT_PUBLIC_ORIGIN;
    await updateInstallation({ configurationDigest: repository.digest });
    if (!origin) return { digest: repository.digest, skipped: "Public origin is not configured", skills: [], agents: [], errors: [] };
    if (!await tildeEnvironment()) return { digest: repository.digest, skipped: "Tilde is not configured", skills: [], agents: [], errors: [] };
    const skills = await reconcileSkills(repository);
    const agents = await reconcileAgents(repository, origin, input.prune ?? false);
    return { digest: repository.digest, registryId: skills.registryId, skills: skills.items, agents, errors: agents.filter((agent) => agent.status === "error").map((agent) => `Agent ${agent.id} failed to reconcile`) };
  });
}

async function reconcileSkills(repository: Awaited<ReturnType<typeof loadRepository>>) {
  const db = createDatabase();
  const existing = await db.select().from(skillRegistrations);
  const existingByName = Object.fromEntries(existing.filter((item) => item.remoteId).map((item) => [item.name, item.remoteId!])) as Record<string, string>;
  const registryId = existing.find((item) => item.registryId)?.registryId
    ?? await getEnvironment(environmentNames.tildeSkillRegistryId);
  const provider = await configuredProvider<SkillProvider>("skill");
  if (!provider.reconcileRegistry) throw new Error(`Skill provider ${provider.descriptor.id} does not implement reconciliation`);
  const result = await provider.reconcileRegistry({
    name: repository.config.skills.registryName,
    description: repository.config.skills.registryDescription ?? "Skills committed with this OpenBot fork.",
    skills: repository.skills,
    ...(registryId ? { existingRegistryId: registryId } : {}),
    existingSkills: existingByName,
  }, providerContext());
  const desired = new Map(repository.skills.map((skill) => [skill.name, skill]));
  for (const remote of result.skills) {
    const local = desired.get(remote.name);
    if (!local) continue;
    await db.insert(skillRegistrations).values({
      name: local.name,
      providerId: provider.descriptor.id,
      remoteId: remote.id,
      registryId: result.id,
      digest: local.digest,
      status: "ready",
      lastError: null,
      updatedAt: new Date(),
    }).onConflictDoUpdate({ target: skillRegistrations.name, set: { remoteId: remote.id, registryId: result.id, digest: local.digest, status: "ready", lastError: null, updatedAt: new Date() } });
  }
  for (const stale of existing.filter((item) => !desired.has(item.name))) {
    await db.update(skillRegistrations).set({ status: "orphaned", updatedAt: new Date() }).where(eq(skillRegistrations.name, stale.name));
  }
  await setEnvironment({ [environmentNames.tildeSkillRegistryId]: result.id });
  return { registryId: result.id, items: [...repository.skills.map((skill) => ({ name: skill.name, status: "ready", remoteId: result.skills.find((item) => item.name === skill.name)?.id })), ...existing.filter((item) => !desired.has(item.name)).map((item) => ({ name: item.name, status: "orphaned", ...(item.remoteId ? { remoteId: item.remoteId } : {}) }))] };
}

async function reconcileAgents(repository: Awaited<ReturnType<typeof loadRepository>>, origin: string, prune: boolean) {
  const db = createDatabase();
  const tilde = await tildeEnvironment();
  if (!tilde) throw new Error("Tilde is not configured");
  const provider = new TildeAgentProvider(tilde);
  const existing = await db.select().from(agentRegistrations);
  const existingById = new Map(existing.map((item) => [item.sourceId, item]));
  const desiredIds = new Set(repository.agents.map((agent) => agent.id));
  const output: { id: string; status: string; remoteId?: string; endpointUrl: string }[] = [];
  for (const agent of repository.agents) {
    const endpointUrl = new URL(`${repository.config.agents.routePrefix}/${agent.id}`, origin).toString();
    const sourceDigest = createHash("sha256").update(repository.digest).update("\0").update(agent.id).digest("hex");
    const prior = existingById.get(agent.id);
    let remoteId = prior?.remoteId
      ?? (agent.id === "openbot" ? tilde.agentId : undefined);
    let status = "ready";
    try {
      if (!remoteId) {
        const registered = await provider.registerAgent({
          id: agent.id,
          displayName: agent.displayName,
          endpointUrl: new URL(endpointUrl),
          streaming: agent.registration?.streaming ?? true,
          timeoutMs: agent.registration?.timeoutMs ?? 300_000,
        }, providerContext());
        remoteId = registered.agent.id;
        const suffix = environmentSuffix(agent.id);
        await setEnvironment({
          [`OPENBOT_AGENT_${suffix}_API_KEY`]: registered.credentials.apiKey,
          [`OPENBOT_AGENT_${suffix}_WEBHOOK_SIGNING_KEY`]: registered.credentials.webhookSigningKey,
        });
      } else if (prior?.sourceDigest !== sourceDigest || prior.endpointUrl !== endpointUrl) {
        await provider.updateAgent(remoteId, { displayName: agent.displayName, endpointUrl: new URL(endpointUrl) }, providerContext());
      } else {
        await provider.getAgent(remoteId, providerContext());
      }
      await db.insert(agentRegistrations).values({ sourceId: agent.id, providerId: provider.descriptor.id, remoteId, sourceDigest, status, endpointUrl, lastError: null, updatedAt: new Date() })
        .onConflictDoUpdate({ target: agentRegistrations.sourceId, set: { providerId: provider.descriptor.id, remoteId, sourceDigest, status, endpointUrl, lastError: null, updatedAt: new Date() } });
    } catch (error) {
      status = "error";
      await db.insert(agentRegistrations).values({ sourceId: agent.id, providerId: provider.descriptor.id, remoteId: remoteId ?? null, sourceDigest, status, endpointUrl, lastError: error instanceof Error ? error.message : "Registration failed", updatedAt: new Date() })
        .onConflictDoUpdate({ target: agentRegistrations.sourceId, set: { status, lastError: error instanceof Error ? error.message : "Registration failed", updatedAt: new Date() } });
    }
    output.push({ id: agent.id, status, ...(remoteId ? { remoteId } : {}), endpointUrl });
  }
  for (const stale of existing.filter((item) => !desiredIds.has(item.sourceId))) {
    let status = "orphaned";
    if (prune && stale.remoteId) {
      await provider.updateAgent(stale.remoteId, { enabled: false }, providerContext());
      status = "disabled";
    }
    await db.update(agentRegistrations).set({ status, updatedAt: new Date() }).where(eq(agentRegistrations.sourceId, stale.sourceId));
    output.push({ id: stale.sourceId, status, ...(stale.remoteId ? { remoteId: stale.remoteId } : {}), endpointUrl: stale.endpointUrl });
  }
  return output;
}

export function environmentSuffix(id: string): string {
  return id.toUpperCase().replace(/[^A-Z0-9]/g, "_");
}
