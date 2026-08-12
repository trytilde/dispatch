import { agentPublications, createDatabase, eq } from "@openbot/db";
import type { SourceControlProvider } from "@openbot/provider-sdk";
import { configuredProvider } from "./provider-registry.js";
import { loadRepository } from "./repository.js";
import { providerContext } from "./environment.js";

export interface PublishAgentInput {
  id: string;
  displayName: string;
  description?: string;
}

export async function publishAgent(input: PublishAgentInput, signal?: AbortSignal) {
  if (!/^[a-z][a-z0-9-]{1,62}$/.test(input.id)) throw new Error("Agent id must be 2-63 lowercase letters, numbers, or hyphens");
  if (!input.displayName.trim()) throw new Error("Agent display name is required");
  const repository = await loadRepository();
  if (repository.agents.some((agent) => agent.id === input.id)) throw new Error(`Agent already exists: ${input.id}`);
  const sourceControl = await configuredProvider<SourceControlProvider>("source-control");
  const publicationId = crypto.randomUUID();
  const branch = `openbot/agent-${input.id}-${publicationId.slice(0, 8)}`;
  const now = new Date();
  const db = createDatabase();
  await db.insert(agentPublications).values({ id: publicationId, agentId: input.id, status: "publishing", branch, createdAt: now, updatedAt: now });
  try {
    const result = await sourceControl.publishPullRequest({
      branch,
      baseBranch: repository.config.publishing.deploymentBranch,
      title: `Add ${input.displayName} agent`,
      body: `Adds the repository-owned \`${input.id}\` agent endpoint. Merge this pull request to deploy and register it.`,
      files: [{ path: `${repository.config.agents.directory}/${input.id}.ts`, content: agentSource(input) }],
    }, providerContext(publicationId, signal));
    await db.update(agentPublications).set({ status: result.status, pullRequestUrl: result.url.toString(), updatedAt: new Date() }).where(eq(agentPublications.id, publicationId));
    return { publicationId, agentId: input.id, branch, pullRequestUrl: result.url.toString(), status: result.status };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Publishing failed";
    await db.update(agentPublications).set({ status: "failed", lastError: message, updatedAt: new Date() }).where(eq(agentPublications.id, publicationId));
    throw error;
  }
}

export async function getAgentPublication(id: string) {
  const [publication] = await createDatabase().select().from(agentPublications).where(eq(agentPublications.id, id));
  return publication;
}

export function agentSource(input: PublishAgentInput): string {
  const name = JSON.stringify(input.displayName.trim());
  const description = JSON.stringify(input.description?.trim() || `${input.displayName.trim()} OpenBot agent`);
  return `import { defineAgent } from "@openbot/agent-sdk";\nimport { streamText } from "ai";\n\nexport default defineAgent({\n  id: ${JSON.stringify(input.id)},\n  displayName: ${name},\n  description: ${description},\n  registration: { provider: "tilde-agents", skills: ["*"] },\n  async run(context) {\n    const result = streamText({\n      model: context.model,\n      system: [context.baseSystemPrompt, "You are ${input.displayName.replace(/[\\`$]/g, "")}."].join("\\n\\n"),\n      messages: context.messages,\n      tools: context.tools,\n      onFinish: context.close,\n      onAbort: context.close,\n      onError: context.close,\n    });\n    return result.toUIMessageStreamResponse();\n  },\n});\n`;
}
