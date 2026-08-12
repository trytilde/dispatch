import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import type { Client, SkillRegistry, SkillsClient } from "@trytilde/harness-sdk";
import type { ToolSet } from "ai";
import type {
  PromptRequest,
  ProviderCallContext,
  SkillProvider,
  ToolDefinition,
  ToolProvider,
} from "@openbot/provider-sdk";
import { ProviderError } from "@openbot/provider-sdk";

export class TildeSkillProvider implements SkillProvider {
  readonly descriptor = {
    id: "tilde-skills",
    version: "1.0.0",
    displayName: "Tilde skill registry",
    kind: "skill" as const,
    capabilities: ["summaries", "search-via-mcp", "progressive-read"] as const,
  };
  readonly #registryId: string;
  readonly #skills: SkillsClient;
  #registry: Promise<SkillRegistry> | undefined;

  constructor(skills: SkillsClient, registryId: string) {
    this.#skills = skills;
    this.#registryId = registryId;
  }

  async health(context: ProviderCallContext) {
    try {
      await this.listSkills(context);
      return { healthy: true };
    } catch (error) {
      return { healthy: false, message: error instanceof Error ? error.message : "Tilde skills are unavailable" };
    }
  }

  injectSystemPrompt(request: PromptRequest) {
    if (!request.capabilities.skillRegistry) return undefined;
    return [
      "Tilde skill provider:",
      "- Skill summaries are discovery hints, not blanket instructions. Search for the current task, inspect one promising description, then read the full skill only if it applies.",
      "- Follow loaded skill guidance within the user's request and higher-priority safety constraints. Do not load every skill preemptively.",
    ].join("\n");
  }

  async listSkills(_context: ProviderCallContext) {
    return (await (await this.#getRegistry()).list()).map((skill) => ({
      id: String(skill.id),
      name: skill.name,
      description: skill.description,
      version: skill.version,
    }));
  }

  async readSkill(id: string, _context: ProviderCallContext): Promise<string> {
    return (await (await this.#getRegistry()).find(id)).content;
  }

  #getRegistry() {
    this.#registry ??= this.#skills.registry(this.#registryId);
    return this.#registry;
  }
}

export class TildeRuntimeToolProvider implements ToolProvider {
  readonly descriptor;
  readonly #client: MCPClient;
  readonly #dynamic: boolean;
  #tools: Promise<ToolSet> | undefined;

  private constructor(client: MCPClient, serverId: string, serverName: string, dynamic: boolean) {
    this.#client = client;
    this.#dynamic = dynamic;
    this.descriptor = {
      id: `tilde-mcp-${serverId}`,
      version: "1.0.0",
      displayName: serverName,
      kind: "tool" as const,
      capabilities: dynamic ? ["dynamic-discovery", "invoke", "schemas"] as const : ["invoke", "schemas"] as const,
    };
  }

  static async connect(input: {
    client: Client;
    serverId: string;
    apiKey: string;
    orgId: string;
  }): Promise<TildeRuntimeToolProvider> {
    const server = await input.client.mcp.getServer({ id: input.serverId });
    const client = await createMCPClient({
      clientName: "openbot-runtime",
      version: "0.1.0",
      transport: {
        type: "http",
        url: server.url,
        headers: { "x-api-key": input.apiKey, "x-tilde-org-id": input.orgId },
      },
    });
    return new TildeRuntimeToolProvider(client, server.id, server.name, server.isDynamicToolDiscovery);
  }

  async health(context: ProviderCallContext) {
    try {
      await this.listTools(context);
      return { healthy: true };
    } catch (error) {
      return { healthy: false, message: error instanceof Error ? error.message : "Tilde runtime tools are unavailable" };
    }
  }

  injectSystemPrompt() {
    return this.#dynamic
      ? [
          `Tilde tool provider (${this.descriptor.displayName}):`,
          "- This is a dynamic MCP server. Call SEARCH_TOOLS with the user's intent, inspect the selected schema with GET_TOOL_SCHEMAS when needed, then invoke through MULTI_EXECUTE_TOOL.",
          "- Treat live schemas and tool results as authoritative. Never invent provider identifiers, accounts, parameters, or successful outcomes.",
        ].join("\n")
      : [
          `Tilde tool provider (${this.descriptor.displayName}):`,
          "- Use the exposed MCP functions by their live schemas. Never invent parameters or report success before reading the tool result.",
        ].join("\n");
  }

  async listTools(_context: ProviderCallContext): Promise<readonly ToolDefinition[]> {
    const result = await this.#client.listTools();
    return result.tools.map((tool) => ({ name: tool.name, description: tool.description ?? "", inputSchema: tool.inputSchema }));
  }

  async invoke(name: string, input: unknown, context: ProviderCallContext): Promise<unknown> {
    const tool = (await this.aiTools())[name];
    if (!tool?.execute) throw new ProviderError("not_found", `Tilde runtime tool ${name} is not available`);
    return tool.execute(input, { toolCallId: context.requestId, messages: [], abortSignal: context.signal });
  }

  aiTools(): Promise<ToolSet> {
    this.#tools ??= this.#client.tools();
    return this.#tools;
  }

  close(): Promise<void> {
    return this.#client.close();
  }
}
