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
  ToolProvider,
  ToolsProviderCallContext,
} from "./core.js";
import {
  asRegisteredTool,
  providerSignal,
  ToolsProviderError,
} from "./core.js";

export interface TildeToolProviderConfig {
  client: Client;
  serverId: string;
}

interface TildeToolsConnection {
  server: McpServer;
  mcp: TildeMCPClient;
  closeMcp: () => Promise<void>;
}

export class TildeToolProvider implements ToolProvider {
  readonly #config: TildeToolProviderConfig;
  #connection: Promise<TildeToolsConnection> | undefined;
  #registeredTools: Promise<readonly RegisteredTool[]> | undefined;

  constructor(config: TildeToolProviderConfig) {
    this.#config = config;
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
      const { mcp } = await this.#connect();
      const result = await mcp.callTool(name, input as TildeJsonObject);
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

  async injectPromptPart(_context: ToolsPromptContext, callContext: ToolsProviderCallContext) {
    providerSignal(callContext);
    const { server } = await this.#connect();
    return server.isDynamicToolDiscovery
      ? [
          `Tilde tool provider (${server.name}):`,
          `- This is a dynamic MCP server. Call ${SEARCH_TOOLS_NAME} with the user's intent, inspect selected schemas with ${GET_TOOL_SCHEMAS_NAME} when needed, then invoke through ${MULTI_EXECUTE_TOOL_NAME}.`,
          "- Treat live schemas and tool results as authoritative. Never invent provider identifiers, accounts, parameters, or successful outcomes.",
        ].join("\n")
      : [
          `Tilde tool provider (${server.name}):`,
          "- Use the exposed tools by their live schemas. Never invent parameters or report success before reading the tool result.",
        ].join("\n");
  }

  async close(): Promise<void> {
    if (this.#connection) await (await this.#connection).closeMcp();
  }

  async #loadTools(): Promise<readonly RegisteredTool[]> {
    try {
      const { mcp } = await this.#connect();
      const tools = await mcp.tools();
      return Object.entries(tools).map(([name, aiTool]) => asRegisteredTool(name, aiTool));
    } catch (error) {
      throw new ToolsProviderError("provider_unavailable", `Unable to load Tilde tools: ${errorMessage(error)}`, true);
    }
  }

  #connect(): Promise<TildeToolsConnection> {
    this.#connection ??= (async () => {
      const server = await this.#config.client.mcp.getServer({ id: this.#config.serverId });
      return { server, ...await createMCPClient({ client: this.#config.client, serverId: server.id }) };
    })();
    return this.#connection;
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
