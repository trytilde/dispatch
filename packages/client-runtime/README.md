# @tryopenbot/client-runtime

Framework-neutral client behavior shared by OpenBot web and Electron clients.

## Public API

- The package root exports the transport client, Zustand vanilla runtime, reducers, and all client contracts.
- `contracts/auth` owns the UI-visible owner session and authentication adapter contract.
- `contracts/sidebar` owns agents, sessions, pagination, and sorting.
- `contracts/agents` owns the durable background agent-setup start and status payloads.
- `contracts/messages` owns conversation messages and parts.
- `contracts/events` owns generic one-session SSE envelopes, participant lifecycle activity, and the closed ChatKit realtime event union.
- `contracts/workspace` owns aggregate bootstrap, conversation snapshot, turn-submission,
  and consolidated ChatKit search responses plus the durable event revision used to reconnect the
  team-wide observer.
- `chat/websocket` owns ChatKit realtime ticket use, the awaited `ready` snapshot barrier,
  success-only reconnect cursors, capped jittered backoff, ping, parsing, and abort.
- `contracts/installation` owns control-service health, public native-auth discovery, and the selected installation.
- `contracts/attachments` owns attachment metadata and upload handshakes.
- `contracts/queue` owns queued agent turns.
- `contracts/rooms` owns the durable roster, role, invitation, and departure contract.
  Session controls use native team-person discovery instead of raw user-ID input.
- `contracts/work` owns durable goal, task, and background-job projections. The runtime work slice
  keeps one shared snapshot and polling lifecycle per active agent conversation, including owner
  steer, stop, and resume actions used by both web and packaged Electron rendering.
- `contracts/connectors` owns connector (Tilde tool-provider) configuration: the `configure_connector` tool's `connector_selection` payload, provider and account schemas, `connectorSetupFields` schema-to-form flattening, `connectorAuthorizedReturnUrl`, `waitForConnectorAccountActive` polling, and the structured hand-back message builders.
- `contracts/plugins`, `contracts/routines`, and `contracts/signals` own the client projections of
  native Tilde settings resources. Their transport uses the installation's operation-allowlisted
  `/api/tilde/*` credential bridge; the control service defines no parallel domain APIs. Plugin
  inventory is assembled from Tilde's generated MCP and Skills resource contracts, with every
  native continuation token exhausted rather than relying on an OpenBot-specific aggregate.
  `createTildePluginsClient` accepts `TildePluginsTransport`, resolves relative provider assets
  against the active Tilde origin, coalesces native and managed entries for one provider, and
  caches the assembled read catalogue briefly while invalidating it after mutations.
- `contracts/workspaces` and the workspace registry helpers own persisted public control-service
  origins, display metadata, and active-workspace selection without moving credentials between
  installations.
- `queuedTurnText` normalizes queued ChatKit request text, while runtime actions own
  run-now, reorder, removal, refresh, and error reconciliation for every client.
- `contracts/onboarding` plus `loadOnboarding`, `completeOnboarding`, and
  `resetOnboarding` own persisted first-run state through a platform-supplied storage port.
- `contracts/platform` owns the narrow Electron renderer bridge.

The runtime has no React, DOM, Electron, or Node dependency. Applications provide authentication, fetch, storage, lifecycle, and file capabilities at their platform boundary. Tilde remains authoritative for chat resources; these schemas validate only the resource subset consumed by OpenBot clients.

The runtime maintains one team-wide ChatKit realtime observer so inactive sessions keep their busy,
preview, per-user unread, queue, turn, and streamed-message state current. Platform-supplied `agentSetupPersistence` may
restore an in-progress setup job; the runtime polls it to readiness, refreshes the authoritative
sidebar, and selects the created agent only after it appears there.
The observer retains the last durable revision and resumes from it after a disconnect.
Agent, session, participant, read-state, message, queue, and turn events reduce directly from their
discriminated payloads; participant activity remains separate from messages, and no recursive payload
inspection or event-name substring matching is retained.

Initial load, conversation selection, and turn submission consume server-authored aggregate
responses. Web and Electron therefore reconcile identical authoritative snapshots without
issuing per-session fan-out reads after each user action or realtime event.

`searchChatKit` searches session titles, associated bots, and messages across the workspace, or
messages within one session. Runtime search actions discard stale responses and open results using
the same sidebar and conversation state as ordinary navigation.

## Connection workflows

`createPluginsRuntime(client)` owns catalog snapshots, refresh, optimistic tool
and skill assignments, serialized writes to each assignment, rollback, deletion
reconciliation, and post-creation bot assignment. `createOpenBotRuntime` exposes
one instance as `runtime.plugins`, reset at sign-out and disposal. Consumers
subscribe to its vanilla Zustand store. A standalone consumer can construct the
same controller with the narrow `PluginsClient` transport.

`createConnectionWorkflow(client, platform)` owns an individual Dispatch
account-creation/authorization/completion operation. Pass `openAuthorization`
at the platform boundary and `returnUrl` with the submission. An optional agent
ID preserves Dispatch's automatic chat binding; settings can assign later.
`finish()` retains the existing manual Done behavior. `cancel()`/`dispose()`
invalidate stale completions; the transport must remain scoped to one
installation. UI subscribes directly instead of retaining parallel snapshots.

`createProviderSetupWorkflow(transport)` supports native Tilde provider setup
start/resume through a host-scoped transport. Its validated projection preserves
redirect, form, instruction, credential-configuration, secret-output notification,
and completion actions. Generated Tilde types remain the source of truth.
Output secrets, resource payloads, instruction manifests, and submitted form
values are excluded from the store. No workflow state is persisted. The host
owns navigation, toasts, rendering the next action, and secret-output handling.
Dispose the workflow on tenant changes; transports receive an AbortSignal and
late responses are ignored even when an adapter cannot cancel a request.

## Prompt, session, and transcript contracts

`runtime.prompt` (or `createPromptRuntime`) owns drafts, attachment
upload handshakes, completion proofs, progress, retries and removal. Supply a
`PromptAttachmentPlatform` for file lookup, hashing, byte upload and preview URL
creation/revocation. Browser File, XHR, crypto and object URLs stay in the web
adapter. Removing an attachment aborts its operation, releases its preview, and
cleans up a staged upload, including a late handshake. Successful sends release
local previews without deleting linked server files; failed sends retain drafts.
Context changes invalidate late completions. This state is not persisted.

`runtime.session` (or `createSessionRuntime`) owns scoped find state, title
mutations, participant and invitation operations, source and participation.
`isChatFindShortcut` describes the keyboard contract; the app binds Ctrl/Cmd+F.
Find exhausts native `session_id`-filtered message search pages, rejects foreign
hits, ignores stale responses and steps matches. The application owns focus,
highlighting and scrolling to a returned message.

Session source uses typed native participant inbox providers and the ChatKit
channel catalog. Authenticated identity membership uses `principal_user_id`.
External nonmembers get source-only access; API nonmembers may call `join()`.
Joining uses the native endpoint and rereads the roster before enabling sending;
a submitted identity claim alone is insufficient. Transport and server admission
remain authoritative. Source/access/search state resets with session selection.
`searchParticipants(query)` owns filtering and stale-result suppression over
existing team people and agents. `addParticipant` accepts discovered candidates
and uses the native participant-add endpoint, without an invitation flow.
People candidates come from the native paginated team directory through the
installation's read-only configured-team identity bridge.

`projectChatTranscript` distinguishes message content (text, Markdown, attachments)
from events (reasoning, tools, connector actions, approvals and participant changes).
`ToolSummarySchema` accepts only native projected summary fields. Summary-mode
history never falls back to hidden input/output. Native unscoped `tool.execution`
notifications invalidate authoritative projected history when idle instead of
being guessed into the selected session. These contracts/controllers are all
framework-neutral; applications own rendering and browser capabilities.

`layoutChatTranscript` adds local-calendar day boundaries and consecutive-side
grouping to projected history. Date labels and hover times stay in UI. See the
repository Chat audit for catalog-only components and remaining workflow gaps.

Message-level Reply/Copy/Start-a-thread actions have been removed from Dispatch.
The prompt runtime no longer stores reply targets or prepends quoted messages;
it sends the entered draft. Named-session navigation remains a separate contract.

`toolCallPresentation` normalizes generic full-output and projected-summary parts
for the shared tool event row. Summary projections produce no raw detail fields,
even if a transport accidentally includes input/output alongside the summary.

`formatToolArguments` serializes named input parameters as `$name = value` pairs
for compact chips. `toolCallPresentation` keeps full output in its detail field;
collapsed rows use supplied summary/text or a generic status, not the full output.
Summary-only projections still contain no raw input/output details.

## Connection workflows and resource inventory

`createChatConnectorRuntime` owns setup continuation, cancellation, OAuth polling,
errors and completion. `openRequest` resumes a native pending resource;
`openProvider` starts a provider-only setup without account selection or MCP
assignment. Hosts supply return URLs, browser opening, secret-output download,
and completion callbacks. `createNativeConnectorSetupTransport` coordinates
native provider and credential setup; credential values never enter workflow
snapshots. Platform adapters own File, object URLs and browser downloads.

Catalog refresh uses native team `mcp/tool-providers` and `skills` inventory
endpoints with `scope=all|personal|bots`. Personal ownership is preserved; personal
account deletion uses the user resource namespace and the human credential.
Personal tool availability on bots is inherited from their MCP federation policy.
`createTildeSignalClient` and `createTildeRoutineClient` expose reusable native
transport adapters for hosts with their own authenticated proxy.

Capability proposal contracts have been removed. Agents use existing native
permissions and managed Tilde resource skills. `expandToolBatches` presents inner
calls instead of MULTI_EXECUTE_TOOL; native audience projection remains authoritative.
