# @tryopenbot/agent-provider

Provisioning and reconciliation boundary for externally registered agent
endpoints. It is used by development and deployment lifecycles, not by authored
agent code and not as a chat API.

`AgentProvider` exposes only an idempotent `Deployable` lifecycle. The Tilde
implementation discovers authored agents, creates or repairs missing ChatKit
agents, compares their Vercel AI SDK endpoint URL and enabled state before
writing, and turns on local-runtime tunneling during development. Repeated
deployments converge without duplicate agents or unnecessary updates. It does
not expose vendor CRUD
methods to the CLI. Conversation listing and mutation belong to
`@tryopenbot/chat-provider`.

## Public API

- `AgentProvider`: deployment-only contract for authored-agent endpoint reconciliation.
- `AgentProviderError` and `AgentProviderErrorCode`: normalized provider failure surface.
- `TildeAgentProvider` and `TildeAgentProviderConfig`: typed Tilde implementation and configuration.
