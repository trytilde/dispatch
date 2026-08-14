import { type Client, type McpServer } from "@trytilde/harness-sdk";
import { TildePlatform, tildePlatform } from "@tryopenbot/platform-integrations";
import { tildeErrorMessage } from "@tryopenbot/platform-integrations/tilde/errors";
import type { ProviderInitialization } from "@tryopenbot/runtime-provider";
import { persistEnvironment, type DeploymentContext } from "@tryopenbot/runtime-provider";
import type {
  EnsureToolServerRequest,
  ToolProvider,
  ToolServer,
  ToolsProviderCallContext,
} from "./core.js";
import { providerSignal, ToolsProviderError } from "./core.js";

export type TildeToolProviderConfig = { platform: TildePlatform } | { client: Client };

export const tildeToolProviderInitialization: ProviderInitialization = {
  id: "tilde-tools",
  label: "Tilde tools",
  questions: [],
};

export class TildeToolProvider implements ToolProvider {
  readonly platform: TildePlatform;
  readonly platforms: readonly TildePlatform[];
  readonly initialization = tildeToolProviderInitialization;
  readonly #client: Client;
  readonly buildable = {
    check: async (context: DeploymentContext) => {
      requireAgent(context);
    },
    build: async (_context: DeploymentContext) => undefined,
  };
  readonly deployable = {
    plan: async (context: DeploymentContext) => ({
      summary: `Reconcile the Tilde MCP server for ${requireAgent(context).id}`,
    }),
    deploy: async (context: DeploymentContext) => this.#deploy(context),
  };

  constructor(config: TildeToolProviderConfig) {
    this.platform = "platform" in config ? config.platform : tildePlatform;
    this.platforms = [this.platform];
    this.#client = "platform" in config ? config.platform.client() : config.client;
  }

  async ensureServer(
    request: EnsureToolServerRequest,
    context: ToolsProviderCallContext,
  ): Promise<ToolServer> {
    providerSignal(context);
    const dynamicToolDiscovery = request.dynamicToolDiscovery ?? true;
    try {
      const server = await this.#client.mcp.getServer({ id: request.id });
      return toolServer(
        server.name === request.name && server.isDynamicToolDiscovery === dynamicToolDiscovery
          ? server
          : await this.#client.mcp.updateServer({
              id: request.id,
              name: request.name,
              isDynamicToolDiscovery: dynamicToolDiscovery,
            }),
      );
    } catch (error) {
      if (!isNotFound(error)) throw toolsError("reconcile", error);
      try {
        return toolServer(
          await this.#client.mcp.createServer({
            id: request.id,
            name: request.name,
            isDynamicToolDiscovery: dynamicToolDiscovery,
          }),
        );
      } catch (createError) {
        throw toolsError("create", createError);
      }
    }
  }

  async #deploy(context: DeploymentContext): Promise<void> {
    const { id } = requireAgent(context);
    const prefix = `AGENT_${id.replaceAll("-", "_").toUpperCase()}`;
    const server = await this.ensureServer(
      {
        id: context.environment[`${prefix}_MCP_SERVER_ID`]?.trim() || `openbot-${id}`,
        name: `OpenBot ${id}`,
        dynamicToolDiscovery: true,
      },
      {
        requestId: `agent-lifecycle:${id}:mcp-server`,
        idempotencyKey: `openbot:${id}:mcp-server`,
      },
    );
    await persistEnvironment(
      context,
      `${prefix}_MCP_SERVER_ID`,
      server.id,
      `Tilde MCP server ID for ${id}.`,
    );
  }
}

function requireAgent(context: DeploymentContext): { id: string; path: string } {
  if (!context.agentId || !context.agentPath)
    throw new ToolsProviderError(
      "invalid_configuration",
      "The tools lifecycle requires an agent ID and absolute path",
    );
  return { id: context.agentId, path: context.agentPath };
}

function toolServer(server: McpServer): ToolServer {
  return { id: server.id };
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (("status" in error && error.status === 404) ||
      ("response" in error && (error.response as Response | undefined)?.status === 404))
  );
}

function toolsError(operation: string, error: unknown): ToolsProviderError {
  return new ToolsProviderError(
    "provider_unavailable",
    `Unable to ${operation} Tilde MCP server: ${tildeErrorMessage(error, "unknown error")}`,
    true,
  );
}
