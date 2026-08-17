import { TildePlatform } from "@tryopenbot/platform-integrations";
import { tildeErrorMessage } from "@tryopenbot/platform-integrations/tilde/errors";
import type {
  DeploymentContext,
  DeploymentPlan,
  ProviderInitialization,
} from "@tryopenbot/runtime-provider";
import { persistEnvironment } from "@tryopenbot/runtime-provider";
import {
  autoProvisionToolGroupInstance,
  createTildeApiClient,
  listToolGroupInstances,
  reverseProxyCreateProfile,
  reverseProxyListProfiles,
  reverseProxyUpdateProfile,
  startUserCredentialBrokering,
  type ProviderProvisioningNextAction,
  type ReverseProxyProfile,
  type ToolGroupInstanceSerialized,
  type UserCredentialBrokeringResponse,
} from "@trytilde/api-client";
import type { GitProvider } from "../core.js";
import { GitProviderError } from "../core.js";

export const githubRepositoryEnvironmentName = "GIT_GITHUB_REPOSITORY";
export const githubCredentialEnvironmentName = "GIT_GITHUB_CREDENTIAL_ID";
export const githubToolGroupEnvironmentName = "GIT_GITHUB_TOOL_GROUP_ID";
export const githubRestProxyEnvironmentName = "GIT_GITHUB_REST_PROXY_PROFILE_ID";
export const githubGitProxyEnvironmentName = "GIT_GITHUB_GIT_PROXY_PROFILE_ID";

export const githubToolGroupSourceTypeId = "github";
const githubCredentialSourceTypeId = "server_token_exchange";
const githubProviderProvisionerId = "provider_provisioner.github";
const restProxyProfileId = "openbot-github-rest";
const gitProxyProfileId = "openbot-github-git";
const restProxyProviderId = "github";
const gitProxyProviderId = "github_git_https";

export const gitHubGitProviderInitialization: ProviderInitialization = {
  id: "github-git",
  label: "GitHub",
  description: "Connect the GitHub repository that holds this OpenBot fork.",
  questions: [
    {
      id: "github-repository",
      prompt: "GitHub repository (owner/name)",
      description: "Fork or mirror of trytilde/openbot that this installation commits to.",
      input: "text",
      required: true,
      destination: { kind: "environment", key: githubRepositoryEnvironmentName },
      validation: {
        pattern: "^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?/[A-Za-z0-9._-]+$",
        message: "Use the owner/name form, such as acme/openbot.",
      },
    },
  ],
};

/**
 * Reconciles GitHub access through Tilde: a brokered GitHub App credential (no raw token enters
 * the repository or a sandbox) plus reverse-proxy profiles for the REST API and git-over-HTTPS.
 */
export class GitHubGitProvider implements GitProvider {
  readonly platform: TildePlatform;
  readonly platforms: readonly TildePlatform[];
  readonly initialization = gitHubGitProviderInitialization;
  readonly environmentNames = {
    repository: githubRepositoryEnvironmentName,
    restProxyProfileId: githubRestProxyEnvironmentName,
    gitProxyProfileId: githubGitProxyEnvironmentName,
  };
  readonly deployable = {
    plan: (context: DeploymentContext) => this.#plan(context),
    deploy: (context: DeploymentContext) => this.#deploy(context),
  };

  constructor(platform: TildePlatform) {
    this.platform = platform;
    this.platforms = [platform];
  }

  async #plan(_context: DeploymentContext): Promise<DeploymentPlan> {
    return {
      summary: "Reconcile brokered GitHub access through Tilde",
      steps: [
        "Provision the Tilde GitHub tool group and its GitHub App credential when missing",
        "Surface the pending GitHub authorization action to the owner",
        "Reconcile the GitHub REST reverse-proxy profile",
        "Reconcile the GitHub git-over-HTTPS reverse-proxy profile",
      ],
    };
  }

  async #deploy(context: DeploymentContext): Promise<void> {
    const api = this.#api();
    const teamId = this.platform.connection().teamId;
    try {
      let group = await findGitHubToolGroup(api, teamId);
      if (!group) {
        await this.#provisionGitHubApp(context, api, teamId);
        group = await findGitHubToolGroup(api, teamId);
      }
      if (!group) {
        context.report({
          event: "git.github.pending",
          details: { reason: "The Tilde GitHub tool group has not been created yet" },
        });
        return;
      }
      await persistEnvironment(
        context,
        githubToolGroupEnvironmentName,
        group.id,
        "Tilde GitHub tool group instance ID.",
      );
      if (!group.resource_server_credential_id) {
        await this.#startAuthorization(context, api, teamId, group);
        group = await findGitHubToolGroup(api, teamId);
      }
      const credentialId = group?.resource_server_credential_id;
      if (!credentialId) {
        context.report({
          event: "git.github.pending",
          details: { reason: "GitHub authorization has not completed yet" },
        });
        return;
      }
      await persistEnvironment(
        context,
        githubCredentialEnvironmentName,
        credentialId,
        "Tilde resource server credential ID for GitHub.",
      );
      const profiles = await listProfiles(api, teamId);
      const rest = await this.#reconcileProfile(api, teamId, profiles, {
        id: restProxyProfileId,
        providerId: restProxyProviderId,
        credentialId,
      });
      const git = await this.#reconcileProfile(api, teamId, profiles, {
        id: gitProxyProfileId,
        providerId: gitProxyProviderId,
        credentialId,
      });
      await persistEnvironment(
        context,
        githubRestProxyEnvironmentName,
        rest.id,
        "Tilde reverse-proxy profile ID for the GitHub REST API.",
      );
      await persistEnvironment(
        context,
        githubGitProxyEnvironmentName,
        git.id,
        "Tilde reverse-proxy profile ID for GitHub git-over-HTTPS.",
      );
    } catch (error) {
      if (error instanceof GitProviderError) throw error;
      throw gitError("reconcile GitHub access", error);
    }
  }

  async #provisionGitHubApp(
    context: DeploymentContext,
    api: TildeApi,
    teamId: string,
  ): Promise<void> {
    const deploymentName = context.environment.OPENBOT_DEPLOYMENT_NAME?.trim() || "OpenBot";
    const { data } = await autoProvisionToolGroupInstance({
      client: api,
      path: {
        team_id: teamId,
        tool_group_source_type_id: githubToolGroupSourceTypeId,
        credential_source_type_id: githubCredentialSourceTypeId,
      },
      body: {
        app_display_name: `${deploymentName} GitHub`,
        provider_id: githubProviderProvisionerId,
        public_base_url: this.platform.connection().baseUrl,
      },
      throwOnError: true,
    });
    reportProvisioningAction(context, data.provider_provisioning_response.next_action);
    if (data.broker_response) reportBrokerAction(context, data.broker_response);
  }

  async #startAuthorization(
    context: DeploymentContext,
    api: TildeApi,
    teamId: string,
    group: ToolGroupInstanceSerialized,
  ): Promise<void> {
    const { data } = await startUserCredentialBrokering({
      client: api,
      path: { team_id: teamId, credential_source_type_id: githubCredentialSourceTypeId },
      body: { owner_id: group.id, owner_type: "tool_group_instance" },
      throwOnError: true,
    });
    reportBrokerAction(context, data);
  }

  async #reconcileProfile(
    api: TildeApi,
    teamId: string,
    profiles: readonly ReverseProxyProfile[],
    desired: { id: string; providerId: string; credentialId: string },
  ): Promise<ReverseProxyProfile> {
    const existing = profiles.find((profile) => profile.id === desired.id);
    if (!existing) {
      const { data } = await reverseProxyCreateProfile({
        client: api,
        path: { team_id: teamId },
        body: {
          id: desired.id,
          provider_id: desired.providerId,
          resource_server_credential_id: desired.credentialId,
          enabled: true,
        },
        throwOnError: true,
      });
      return data;
    }
    if (existing.enabled && existing.resource_server_credential_id === desired.credentialId)
      return existing;
    const { data } = await reverseProxyUpdateProfile({
      client: api,
      path: { team_id: teamId, profile_id: existing.id },
      body: { enabled: true, resource_server_credential_id: desired.credentialId },
      throwOnError: true,
    });
    return data;
  }

  #api(): TildeApi {
    const connection = this.platform.connection();
    return createTildeApiClient({
      baseUrl: connection.baseUrl,
      apiKey: connection.apiKey,
      orgId: connection.orgId,
      throwOnError: true,
    });
  }
}

type TildeApi = ReturnType<typeof createTildeApiClient>;

async function findGitHubToolGroup(
  api: TildeApi,
  teamId: string,
): Promise<ToolGroupInstanceSerialized | undefined> {
  const { data } = await listToolGroupInstances({
    client: api,
    path: { team_id: teamId },
    query: {
      page_size: 100,
      tool_group_source_type_id: githubToolGroupSourceTypeId,
      include_global: false,
    },
    throwOnError: true,
  });
  return data.items.find((item) => item.tool_group_source_type_id === githubToolGroupSourceTypeId);
}

async function listProfiles(
  api: TildeApi,
  teamId: string,
): Promise<readonly ReverseProxyProfile[]> {
  const { data } = await reverseProxyListProfiles({
    client: api,
    path: { team_id: teamId },
    query: { page_size: 100 },
    throwOnError: true,
  });
  return data.items;
}

function reportProvisioningAction(
  context: DeploymentContext,
  action: ProviderProvisioningNextAction,
): void {
  if (action.type === "redirect")
    context.report({ event: "git.github.authorization.required", details: { url: action.url } });
  else if (action.type === "render_instructions")
    context.report({
      event: "git.github.authorization.required",
      details: { instructions: action.markdown },
    });
  else if (action.type === "render_form_post")
    context.report({
      event: "git.github.authorization.required",
      details: { url: action.action_url },
    });
}

function reportBrokerAction(
  context: DeploymentContext,
  response: UserCredentialBrokeringResponse,
): void {
  if (response.type !== "broker_state") return;
  const action = response.action;
  if (typeof action === "object" && "Redirect" in action)
    context.report({
      event: "git.github.authorization.required",
      details: { url: action.Redirect.url },
    });
}

function gitError(operation: string, error: unknown): GitProviderError {
  return new GitProviderError(
    "provider_unavailable",
    `Unable to ${operation}: ${tildeErrorMessage(error, "unknown error")}`,
    true,
  );
}
