# ADR-0014: Owner chat through a Tilde REST and SSE bridge

## In brief

- Web, desktop, and mobile preserve Tilde ChatKit's native REST and SSE contracts.
- The control service exposes an allowlisted same-origin bridge and injects server credentials.
- Team-wide background activity is adapted from Tilde Mission Control WebSocket events to SSE.
- No Chat Provider or owner-facing protobuf contract is retained.
- Agent execution remains behind the independently deployed agent endpoint.

## Context

Tilde owns agents, ChatKit sessions, messages, and agent execution, while OpenBot owns the
owner-facing workspace. The original reset shell had no chat transport, so a running or deployed
installation could provision an agent without letting its owner converse with it.

## Decision

OpenBot clients call `/api/chat/*` using Tilde's resource shapes directly. Web and packaged desktop use the same-origin route; mobile uses the installation's absolute HTTPS origin. Hono maps only the ChatKit team subtree, the configured organization/team root attachment subtree, and validated signed attachment uploads. It forwards raw request bodies and response streams, removes browser-supplied credentials and hop-by-hop headers, injects the configured Tilde credentials, disables caching, and preserves upstream status codes and content types.

The bridge does not accept tenant overrides and cannot proxy arbitrary Tilde control-plane APIs. Tilde remains authoritative for agents, sessions, messages, attachments, queues, events, and interruption. OpenBot keeps no duplicate conversation contract or state. Local Vite, packaged desktop, local production, and the Vercel control Function all route the same `/api/*` surface to Hono.

Agent responses still execute through the Agent Provider-managed endpoint, whether that endpoint is a development tunnel or the deployed agent service.

OpenBot also needs owner-visible activity for agents whose conversations are not currently open. The
control service therefore opens the fixed Tilde Mission Control WebSocket endpoint for the configured
team and adapts its event stream to `/api/chat/background` SSE. Credentials, team identity, WebSocket
heartbeats, and reconnection remain server-side; clients receive only the same allowlisted activity
events used to reconcile sidebar previews, unread state, and busy indicators. This is not an arbitrary
WebSocket proxy.

Tilde publishes the Mission Control WebSocket contract as AsyncAPI generated from the same Rust event
types used at runtime. The team-scoped socket is one system channel rather than one channel per chat:
every connected owner client needs background activity for all accessible conversations. AsyncAPI
separates client ping, server control frames, and typed domain events into distinct operations while
retaining the single physical channel. The SSE bridge forwards the browser's last applied durable
revision as `after_revision`, so a reconnect replays events produced while the client was offline.

```mermaid
flowchart LR
  O["Owner in web, desktop, or mobile"] --> C["REST and SSE bridge"]
  C --> T["Tilde ChatKit API"]
  T --> A["Local tunnel or deployed agent endpoint"]
  A --> T
  T --> C
  C --> O
  T -. "Mission Control WebSocket" .-> B["Background SSE adapter"]
  B --> O
```

## Consequences

- Conversation state remains authoritative in the Tilde Team.
- Control deployments route `/api/*` to the Hono Function and keep credentials server-side.
- Tilde status codes, JSON bodies, attachment bytes, and SSE frames cross without an OpenBot projection layer.
- The bridge is intentionally Tilde-specific; a second chat backend requires a new product decision rather than a generic provider contract in advance.
- The Mission Control dependency is narrow, server-only, reconnecting, and checked against Tilde's
  generated AsyncAPI contract at one adapter boundary.

## Updates

- 2026-08-16T15:08:39+02:00: Replaced the initial ConnectRPC and Chat Provider projection with the allowlisted Tilde REST/SSE bridge, removed `control-service-proto`, and made the browser's existing ChatKit client the sole owner-chat contract.
- 2026-08-17T18:00:00+02:00: Added mobile as an owner client and moved parsing, transport, and live-state reconciliation into a shared framework-neutral client runtime without introducing a second server contract.
- 2026-08-21T12:00:00+01:00: Added the server-side Mission Control WebSocket to background SSE adapter for team-wide agent activity, with the undocumented dependency isolated behind one allowlisted control-service boundary.
- 2026-08-25T12:00:00+02:00: Replaced the undocumented event dependency with Tilde's Rust-derived AsyncAPI contract, retained one team-wide physical channel, and adopted durable event revisions plus aggregate REST snapshots for reconnect convergence.
