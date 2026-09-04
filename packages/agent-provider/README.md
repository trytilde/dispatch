# @tryopenbot/agent-provider

Provisioning and reconciliation boundary for the complete external footprint of
an authored agent. It is used by development and deployment lifecycles, not by
authored agent code and not as a chat API.

`AgentProvider` exposes only an idempotent `Deployable` lifecycle. The Tilde
implementation discovers authored agents; creates or repairs ChatKit agents;
 synchronizes authored skills and registry membership; adds the OpenBot computer-use overlay and the trusted managed canonical Cua skill without removing user-owned skills; and reconciles the
dynamic MCP server, an agent-owned memory bank, Tilde control-plane tools, and deployment-platform MCP
connections. Repeated deployments and retries after partial failure converge
without duplicate resources or unnecessary updates. It exposes no vendor CRUD
to the CLI. Owner conversation traffic uses Tilde's REST/SSE contract through
the control service's allowlisted same-origin bridge.

## Public API

- `AgentProvider`: deployment-only contract for aggregate authored-agent resource reconciliation.
- `AgentProviderError` and `AgentProviderErrorCode`: normalized provider failure surface.
- `TildeAgentProvider` and `TildeAgentProviderConfig`: typed Tilde implementation and configuration.
- `tildeAgentProviderInitialization`: provider-specific initialization metadata collected with the shared Tilde platform.
- `AgentProviderOptions`, `SharedAgentResources`, `ReconciledAgent`, `AgentPermissionsResolver`, and
  `AgentPermissions`: the opt-in contract a fork composition root passes as the second
  `TildeAgentProvider` constructor argument to share resources across agents and decide their reach.
- `sharedAgentResourceEnvironment`: the environment names the shared-resource extension point reads
  (`OPENBOT_OWNER_USER_ID`) and persists (`OPENBOT_SHARED_MEMORY_BANK_ID`,
  `OPENBOT_SHARED_SKILL_REGISTRY_ID`, `OPENBOT_SHARED_CONNECTORS_MCP_SERVER_ID`).

Reconciliation now submits one typed Tilde Agent Resource Bundle and polls its
durable status. Tilde owns the agent, dynamic MCP server, control-plane toolkit,
exact managed/custom skill registry, memory bank, credential rotation, and
cleanup. A reported `memory bindings are still synchronizing` checkpoint remains
pollable within the existing bounded provisioning deadline, including Tilde's
`service unavailable` display prefix; every other reported error fails immediately.
Ordinary OpenBot bots default automatic memory to `none`.
`OPENBOT_AUTOMATIC_MEMORY_MODE` and the per-agent
`AGENT_<ID>_AUTOMATIC_MEMORY_MODE` override select an explicit mode;
`personal_plus_agent` alone provisions one agent-owned bank. The synthesis-only
Memory Catcher deploys with mode `none` and no bank, preventing recursive
synthesis. OpenBot claims endpoint secrets once and
uploads a deterministic canonical avatar to the stable machine-user profile,
then retains its ChatKit realtime channel plus credential-bearing
deployment-platform integrations.

`OPENBOT_PERSONAL_TOOL_FEDERATION_MODE` configures each reconciled MCP server as
`none` (default), `selected`, or `all`. Tilde still resolves the verified speaker
and brokers personal credentials per request; OpenBot persists no user identity,
account selection, or delegated capability in repository configuration.

## Shared resources and permissions (opt-in)

By default every agent keeps its own bank, registry, and connectors server, and the provider never
sets agent permissions. A fork's `configuration/index.ts` opts in (ADR-0039):

```ts
agent: new TildeAgentProvider(tilde, {
  sharedResources: {
    memoryBank: { name: "Team memory", additionalBankIds: [] },
    skillRegistry: { name: "Team skills" },
    connectorsMcpServer: { id: "openbot-connectors", name: "Team connectors" },
  },
  permissions: ({ id, kind, subagentIds, ownerUserId }) =>
    kind === "primary" && ownerUserId
      ? {
          create_multiplayer_sessions: {
            with_users: { mode: "only", ids: [ownerUserId] },
            with_agents: { mode: "none" },
          },
          delegate_to_other_agents: { mode: "only", ids: [...subagentIds] },
        }
      : undefined,
}),
```

Each `sharedResources` entry is independent. `memoryBank` makes the primary agent's bundle own one
bank with Memory Catcher as synthesizer; subagents disable their own bank and are bound to
`[shared bank, ...additionalBankIds]`; the installation must set
`OPENBOT_AUTOMATIC_MEMORY_MODE=personal_plus_agent` (or the per-agent override), otherwise the
provider fails with `invalid_configuration` before provisioning. `skillRegistry` makes the primary bundle own one registry
whose enabled skills are the union of every authored agent's curated skills; subagents pin it.
`connectorsMcpServer` reconciles one dynamic MCP server with `user_tool_federation_mode: all` and
attaches it to every agent as its personal-tool MCP server; the scaffolded agent template connects
to it through `OPENBOT_SHARED_CONNECTORS_MCP_SERVER_ID`. The provider persists
`OPENBOT_SHARED_MEMORY_BANK_ID`, `OPENBOT_SHARED_SKILL_REGISTRY_ID`, and
`OPENBOT_SHARED_CONNECTORS_MCP_SERVER_ID` when the primary reconciles, and a subagent refuses to
deploy before the primary recorded the IDs it needs; the agent lifecycle therefore reconciles the
primary before the remaining agents.

`permissions` runs after every bundle is active with the agent's ID, kind, authored subagent IDs
(never Memory Catcher), and owner: `OPENBOT_OWNER_USER_ID` when set, otherwise the `owner_user_id`
Tilde records on the provisioned bundle, or `undefined` when neither names one. Returning
`undefined` leaves the platform default untouched; throwing an `AgentProviderError` fails closed.
