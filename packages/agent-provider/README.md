# @tryopenbot/agent-provider

Internal agent, session, message, and model-hook boundary with the Tilde Harness SDK implementation. This is a TypeScript application interface, not an RPC service.

## Public API

### Functions

- `pageSize(value, fallback, maximum?)` normalizes provider pagination and rejects invalid limits.
- `providerSignal(context, fallbackMs?)` combines a call context signal and deadline into the signal used by provider requests.

### Classes

- `AgentProviderError` is the normalized adapter-boundary error with an `AgentProviderErrorCode` and retryability flag.
- `TildeAgentProvider` implements `AgentProvider` with the typed Harness SDK. Construct it with `TildeAgentProviderConfig`; no selector factory is provided.

### Critical interfaces

- `AgentProvider` owns agent registration and update, agent/session/session-group/message listing, optional deployment, `registerTools()`, and `injectPromptPart()`.
- `AgentProviderCallContext` carries request identity, cancellation, deadlines, and idempotency.
- `Agent`, `RegisteredAgent`, `AgentSession`, `AgentSessionGroup`, and `AgentMessage` are provider-neutral domain records.
- `ListAgentsRequest`, `ListSessionsRequest`, `ListSessionGroupsRequest`, and `ListMessagesRequest` define bounded listing inputs.
- `RegisterAgentRequest`, `UpdateAgentRequest`, and `AgentPromptRequest` define mutation and model-hook inputs.
- `Page<T>` is the cursor page returned by list methods.
