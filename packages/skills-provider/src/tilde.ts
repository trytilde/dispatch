import { TildePlatform, type TildePlatformConfig } from "@tryopenbot/platform-integrations";
import {
  tildeErrorMessage,
  tildeErrorStatus,
} from "@tryopenbot/platform-integrations/tilde/errors";
import { tildeFetch } from "@tryopenbot/platform-integrations/tilde/fetch";
import {
  omitUndefinedProperties,
  undefinedWhenFalsy,
} from "@tryopenbot/platform-integrations/tilde/request";
import {
  createSkillRegistry,
  createTildeApiClient,
  getSkillRegistry,
  listSkillRegistries,
  updateSkillRegistry,
  type SkillRegistry as TildeSkillRegistry,
} from "@trytilde/api-client";
import type {
  ListSkillRegistriesRequest,
  RegisterSkillsRequest,
  SkillRegistry,
  SkillProvider,
  SkillsProviderCallContext,
} from "./core.js";
import { persistEnvironment, type DeploymentContext } from "@tryopenbot/runtime-provider";
import { providerSignal, SkillsProviderError } from "./core.js";

export interface TildeSkillProviderConfig extends TildePlatformConfig {}

export class TildeSkillProvider implements SkillProvider {
  readonly platform: TildePlatform;
  readonly platforms: readonly TildePlatform[];
  readonly #config: TildePlatformConfig;
  readonly buildable = {
    check: async (context: DeploymentContext) => {
      requireAgent(context);
    },
    build: async (_context: DeploymentContext) => undefined,
  };
  readonly deployable = {
    plan: async (context: DeploymentContext) => ({
      summary: `Reconcile the Tilde skill registry for ${requireAgent(context).id}`,
    }),
    deploy: async (context: DeploymentContext) => this.#deploy(context),
  };

  constructor(platformOrConfig: TildePlatform | TildeSkillProviderConfig) {
    this.platform =
      platformOrConfig instanceof TildePlatform
        ? platformOrConfig
        : new TildePlatform(platformOrConfig);
    this.platforms = [this.platform];
    this.#config = this.platform.connection();
  }

  async listRegistries(
    request: ListSkillRegistriesRequest,
    context: SkillsProviderCallContext,
  ): Promise<readonly SkillRegistry[]> {
    return this.#run(async () => {
      const { data } = await listSkillRegistries({
        client: this.#api(context),
        path: { team_id: this.#config.teamId },
        query: omitUndefinedProperties({
          page_size: 100,
          name_prefix: undefinedWhenFalsy(request.namePrefix),
        }),
        throwOnError: true,
      });
      return data.items.map(registry);
    });
  }

  async getRegistry(id: string, context: SkillsProviderCallContext): Promise<SkillRegistry> {
    return this.#run(async () => {
      const { data } = await getSkillRegistry({
        client: this.#api(context),
        path: { team_id: this.#config.teamId, id },
        throwOnError: true,
      });
      return registry(data);
    });
  }

  async registerSkills(
    request: RegisterSkillsRequest,
    context: SkillsProviderCallContext,
  ): Promise<SkillRegistry> {
    return this.#run(async () => {
      const body = {
        name: request.name,
        description: request.description,
        skill_ids: [...new Set(request.skillIds)],
      };
      const result = request.registryId
        ? await updateSkillRegistry({
            client: this.#api(context),
            path: { team_id: this.#config.teamId, id: request.registryId },
            body,
            throwOnError: true,
          })
        : await createSkillRegistry({
            client: this.#api(context),
            path: { team_id: this.#config.teamId },
            body,
            throwOnError: true,
          });
      return registry(result.data);
    });
  }

  async #deploy(context: DeploymentContext): Promise<void> {
    const { id } = requireAgent(context);
    const prefix = agentPrefix(id);
    const configuredId = context.environment[`${prefix}_SKILL_REGISTRY_ID`]?.trim();
    const call = { requestId: `agent-lifecycle:${id}:skill-registry` };
    let registry: SkillRegistry | undefined;
    if (configuredId) {
      try {
        registry = await this.getRegistry(configuredId, call);
      } catch (error) {
        if (!(error instanceof SkillsProviderError) || error.code !== "not_found") throw error;
      }
    }
    if (!registry) {
      const name = `OpenBot ${id}`;
      const existing = await this.listRegistries({ namePrefix: name }, call);
      registry =
        existing.find((candidate) => candidate.name === name) ??
        (await this.registerSkills(
          {
            name,
            description: `Skills available to the ${id} OpenBot agent.`,
            skillIds: [],
          },
          call,
        ));
    }
    await persistEnvironment(
      context,
      `${prefix}_SKILL_REGISTRY_ID`,
      registry.id,
      `Tilde skill registry ID for ${id}.`,
    );
  }

  #api(context: SkillsProviderCallContext) {
    return createTildeApiClient({
      apiKey: this.#config.apiKey,
      orgId: this.#config.orgId,
      baseUrl: this.#config.baseUrl ?? "https://api.trytilde.ai",
      headers: { "x-api-key": this.#config.apiKey },
      fetch: tildeFetch(providerSignal(context)),
      throwOnError: true,
    });
  }

  async #run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof SkillsProviderError) throw error;
      const status = tildeErrorStatus(error);
      throw new SkillsProviderError(
        status === 404
          ? "not_found"
          : status === 401 || status === 403
            ? "permission_denied"
            : "provider_unavailable",
        tildeErrorMessage(error, "Tilde skills request failed"),
        status === undefined || status >= 500,
      );
    }
  }
}

function requireAgent(context: DeploymentContext): { id: string; path: string } {
  if (!context.agentId || !context.agentPath)
    throw new SkillsProviderError(
      "invalid_configuration",
      "The skills lifecycle requires an agent ID and absolute path",
    );
  return { id: context.agentId, path: context.agentPath };
}

function agentPrefix(id: string): string {
  return `AGENT_${id.replaceAll("-", "_").toUpperCase()}`;
}

function registry(value: TildeSkillRegistry): SkillRegistry {
  return {
    id: value.id,
    name: value.name,
  };
}
