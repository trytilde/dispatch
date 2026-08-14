import { type Client, type McpServer } from "@trytilde/harness-sdk";
import { TildePlatform, tildePlatform } from "@tryopenbot/platform-integrations";
import { tildeErrorMessage } from "@tryopenbot/platform-integrations/tilde/errors";
import type { ProviderInitialization } from "@tryopenbot/runtime-provider";
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
