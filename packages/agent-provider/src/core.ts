import type { DeployableProvider } from "@tryopenbot/runtime-provider";
import type { AgentPermissions } from "@trytilde/sdk/api";

export type { AgentPermissions };

export type AgentProviderErrorCode =
  | "invalid_configuration"
  | "invalid_request"
  | "not_supported"
  | "not_found"
  | "deadline_exceeded"
  | "provider_unavailable"
  | "permission_denied"
  | "internal";

export class AgentProviderError extends Error {
  constructor(
    readonly code: AgentProviderErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "AgentProviderError";
  }
}

/** Reconciles authored agents and their external runtime endpoints through deployment lifecycle. */
export interface AgentProvider extends DeployableProvider {
  readonly deployable: NonNullable<DeployableProvider["deployable"]>;
}

/**
 * Environment names the shared-resource extension point reads and persists. The primary agent
 * owns every shared resource and records its ID; subagents pin the recorded IDs, so the primary
 * reconciles first. `OPENBOT_OWNER_USER_ID` is an optional override: by default the owner is the
 * user the platform records on the provisioned agent resource bundle.
 */
export const sharedAgentResourceEnvironment = {
  ownerUserId: "OPENBOT_OWNER_USER_ID",
  sharedMemoryBankId: "OPENBOT_SHARED_MEMORY_BANK_ID",
  sharedSkillRegistryId: "OPENBOT_SHARED_SKILL_REGISTRY_ID",
  sharedConnectorsMcpServerId: "OPENBOT_SHARED_CONNECTORS_MCP_SERVER_ID",
} as const;

/**
 * Resources a fork composition root asks the provider to share across every authored agent
 * instead of provisioning one per agent. Each entry is opt-in; an omitted entry keeps the
 * per-agent default.
 */
export interface SharedAgentResources {
  /**
   * One memory bank owned by the primary agent's bundle and bound to every subagent. Subagents
   * disable their own bank. The provider picks no memory mode: the installation must set
   * `OPENBOT_AUTOMATIC_MEMORY_MODE=personal_plus_agent` (or the per-agent override), otherwise
   * reconciliation fails before provisioning.
   */
  memoryBank?: {
    name: string;
    description?: string;
    /** Additional bank IDs bound to every subagent beside the shared bank. */
    additionalBankIds?: readonly string[];
  };
  /**
   * One skill registry owned by the primary agent's bundle whose enabled skills are the union of
   * every authored agent's curated skills; subagents pin the same registry.
   */
  skillRegistry?: { name: string; description?: string };
  /**
   * One dynamic MCP server with personal tool federation `all`, attached to every agent as its
   * personal-tool MCP server. The agent template also connects to it through
   * `OPENBOT_SHARED_CONNECTORS_MCP_SERVER_ID`.
   */
  connectorsMcpServer?: { id: string; name: string };
}

/** The agent under reconciliation, as seen by the permissions resolver. */
export interface ReconciledAgent {
  id: string;
  kind: "primary" | "subagent";
  /** Authored subagent IDs of the primary agent; the memory synthesizer is never included. */
  subagentIds: readonly string[];
  /** `OPENBOT_OWNER_USER_ID` when set, otherwise the owner recorded on the provisioned bundle. */
  ownerUserId?: string;
}

/**
 * Decides the reach of every reconciled agent after its bundle is active. Return `undefined` to
 * leave the platform default untouched. Throw an `AgentProviderError` to fail closed.
 */
export type AgentPermissionsResolver = (agent: ReconciledAgent) => AgentPermissions | undefined;

/** Opt-in provider behavior a fork sets from its `configuration/index.ts` composition root. */
export interface AgentProviderOptions {
  sharedResources?: SharedAgentResources;
  permissions?: AgentPermissionsResolver;
}
