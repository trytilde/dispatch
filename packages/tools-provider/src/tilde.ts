import {
  GET_TOOL_SCHEMAS_NAME,
  MULTI_EXECUTE_TOOL_NAME,
  SEARCH_TOOLS_NAME,
  type Client,
  type JsonObject as TildeJsonObject,
  type McpServer,
  type ToolResult,
} from "@trytilde/harness-sdk";
import { createMCPClient, type TildeMCPClient } from "@trytilde/harness-sdk-vercel-ai-node";
import type {
  JsonObject,
  JsonValue,
  RegisteredTool,
  ToolSummary,
  ToolsPromptContext,
  ToolsProvider,
  ToolsProviderCallContext,
} from "@openbot/tools-provider-core";
import {
  asRegisteredTool,
  providerSignal,
  ToolsProviderError,
} from "@openbot/tools-provider-core";

export interface TildeToolsProviderConnectInput {
  client: Client;
  serverId: string;
}

export class TildeToolsProvider implements ToolsProvider {
  readonly descriptor;
  readonly #mcp: TildeMCPClient;
  readonly #server: McpServer;
  readonly #closeMcp: () => Promise<void>;
  #registeredTools: Promise<readonly RegisteredTool[]> | undefined;

  private constructor(server: McpServer, mcp: TildeMCPClient, closeMcp: () => Promise<void>) {
    this.#server = server;
    this.#mcp = mcp;
    this.#closeMcp = closeMcp;
    this.descriptor = {
      id: "tilde",
      version: "1.0.0",
      displayName: server.name,
      capabilities: [
        "tools:list",
        "tools:invoke",
        ...(server.isDynamicToolDiscovery ? ["tools:dynamic-discovery" as const] : []),
        "model:tools",
        "model:prompt",
      ] as const,
    };
  }

  static async connect(input: TildeToolsProviderConnectInput): Promise<TildeToolsProvider> {
    const server = await input.client.mcp.getServer({ id: input.serverId });
    const { mcp, closeMcp } = await createMCPClient({
      client: input.client,
      serverId: server.id,
    });
    return new TildeToolsProvider(server, mcp, closeMcp);
  }

  async health(context: ToolsProviderCallContext) {
    try {
      await this.registerTools(context);
      return { healthy: true };
    } catch (error) {
      return { healthy: false, message: error instanceof Error ? error.message : "Tilde tools are unavailable" };
    }
  }

  async listTools(context: ToolsProviderCallContext): Promise<readonly ToolSummary[]> {
    return (await this.registerTools(context)).map((registered) => {
      const inputSchema = jsonObject((registered as { inputSchema?: unknown }).inputSchema);
      const outputSchema = jsonObject((registered as { outputSchema?: unknown }).outputSchema);
      return {
        name: registered.name,
        description: registered.description ?? "",
        ...(inputSchema ? { inputSchema } : {}),
        ...(outputSchema ? { outputSchema } : {}),
      };
    });
  }

  async invoke(name: string, input: JsonObject, context: ToolsProviderCallContext): Promise<JsonValue> {
    providerSignal(context);
    try {
      const result = await this.#mcp.callTool(name, input as TildeJsonObject);
      if (!isJsonValue(result)) throw new ToolsProviderError("provider_unavailable", `Tilde tool ${name} returned a non-JSON result`);
      return result;
    } catch (error) {
      if (error instanceof ToolsProviderError) throw error;
      throw new ToolsProviderError("provider_unavailable", `Unable to invoke Tilde tool ${name}: ${errorMessage(error)}`, true);
    }
  }

  registerTools(context: ToolsProviderCallContext): Promise<readonly RegisteredTool[]> {
    providerSignal(context);
    this.#registeredTools ??= this.#loadTools();
    return this.#registeredTools;
  }

  injectPromptPart(_context: ToolsPromptContext, _callContext: ToolsProviderCallContext) {
    return this.#server.isDynamicToolDiscovery
      ? [
          `Tilde tool provider (${this.descriptor.displayName}):`,
          `- This is a dynamic MCP server. Call ${SEARCH_TOOLS_NAME} with the user's intent, inspect selected schemas with ${GET_TOOL_SCHEMAS_NAME} when needed, then invoke through ${MULTI_EXECUTE_TOOL_NAME}.`,
          "- Treat live schemas and tool results as authoritative. Never invent provider identifiers, accounts, parameters, or successful outcomes.",
        ].join("\n")
      : [
          `Tilde tool provider (${this.descriptor.displayName}):`,
          "- Use the exposed tools by their live schemas. Never invent parameters or report success before reading the tool result.",
        ].join("\n");
  }

  close(): Promise<void> {
    return this.#closeMcp();
  }

  async #loadTools(): Promise<readonly RegisteredTool[]> {
    try {
      const tools = await this.#mcp.tools();
      return Object.entries(tools).map(([name, aiTool]) => asRegisteredTool(name, aiTool));
    } catch (error) {
      throw new ToolsProviderError("provider_unavailable", `Unable to load Tilde tools: ${errorMessage(error)}`, true);
    }
  }
}

function jsonObject(value: unknown): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : undefined;
}

function isJsonValue(value: ToolResult): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.every((item) => isJsonValue(item as ToolResult));
  return typeof value === "object" && Object.values(value).every((item) => isJsonValue(item as ToolResult));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === "string" ? error : "unknown error";
}
