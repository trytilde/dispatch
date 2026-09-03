# @trytilde/dispatch-agent-provider

Provisioning and reconciliation boundary for the complete external footprint of
an authored agent. It is used by development and deployment lifecycles, not by
authored agent code and not as a chat API.

`AgentProvider` exposes only an idempotent `Deployable` lifecycle. The Tilde
implementation discovers authored agents; creates or repairs ChatKit agents;
 synchronizes authored skills and registry membership; adds the Dispatch computer-use overlay and the trusted managed canonical Cua skill without removing user-owned skills; and reconciles the
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

Reconciliation now submits one typed Tilde Agent Resource Bundle and polls its
durable status. Tilde owns the agent, dynamic MCP server, control-plane toolkit,
exact managed/custom skill registry, memory bank, credential rotation, and
cleanup. A reported `memory bindings are still synchronizing` checkpoint remains
pollable within the existing bounded provisioning deadline, including Tilde's
`service unavailable` display prefix; every other reported error fails immediately.
Ordinary Dispatch bots default automatic memory to `none`.
`DISPATCH_AUTOMATIC_MEMORY_MODE` and the per-agent
`AGENT_<ID>_AUTOMATIC_MEMORY_MODE` override select an explicit mode;
`personal_plus_agent` alone provisions one agent-owned bank. The synthesis-only
Memory Catcher deploys with mode `none` and no bank, preventing recursive
synthesis. Dispatch claims endpoint secrets once and
uploads a deterministic canonical avatar to the stable machine-user profile,
then retains its ChatKit realtime channel plus credential-bearing
deployment-platform integrations.

`DISPATCH_PERSONAL_TOOL_FEDERATION_MODE` configures each reconciled MCP server as
`none` (default), `selected`, or `all`. Tilde still resolves the verified speaker
and brokers personal credentials per request; Dispatch persists no user identity,
account selection, or delegated capability in repository configuration.
