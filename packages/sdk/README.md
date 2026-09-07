# @trytilde/sdk

Core TypeScript client for Tilde agents, MCP servers, skills, memory banks,
ChatKit sessions, and credential-injecting reverse proxies.

```bash
pnpm add @trytilde/sdk
```

## Public API

- `createConfig(input)` normalizes Tilde team, organization, URL, and authentication settings.
- `createClient(config?)` creates the core client with ChatKit, MCP, messages, skills, billing,
  and human-reviewed self-extension APIs.
- `client.billing.aiCredits` provides idempotent reserve, exact-receipt commit,
  and failure-release operations for hosted model calls.
- `SelfExtensionClient` proposes, inspects, lists, cancels, waits for, or rolls back durable
  capability changes. Human credentials are required by Tilde for approval, output claims, and
  provider setup continuation; model-facing code should expose only `propose`.
- `client.chatkit.reportCompactionEvent(input)` records an active agent's session compaction
  lifecycle without replacing the canonical transcript.
- `client.chatkit.runs` creates, claims, accounts, transitions, and recovers provider-neutral
  durable agent runs and their effect receipts. Effect prepare/finish calls carry the claimed
  run generation and worker ID so stale hosts cannot write receipts into a newer lease.
- `client.chatkit.work({ agentId, sessionId })` binds durable goals, tasks, and child jobs to one
  authenticated agent conversation.
- `client.chatkit.routines(agentId)` binds recurring-work operations to one authenticated agent.
- `createTildeGrpcReverseProxy(options)` exposes a credential-injecting gRPC reverse proxy.
- `wrapMcpClientWithLocalTools(options)` combines remote MCP tools with process-local tools.
- `ChatKitClient.registerAgentTools(input)` reconciles an agent's process-local tool catalog.
- `ChatKitClient.reportToolExecution(input)` records canonical local-tool execution lifecycle events.
- `ChatKitClient.sendSessionMessage(input)` persists a visible message through the provider and
  active turn bound by ChatKit.
- `ChatKitClient.invokeSessionProviderTool(input)` invokes a reaction, thread, or poll action using
  trusted session routing rather than model-supplied provider identifiers.
- `ChatKitClient.rooms` creates rooms, manages durable rosters and invitations, and exposes bounded
  deterministic group-turn orchestration without moving personal credentials into room state.
- `McpClient.addFunctions(input)` and `McpClient.removeFunctions(input)` atomically reconcile up to 500 function mappings from one tool provider instance.
- `SkillPackage` and `SkillsClient` discover, download, verify, and materialize managed skills.
- `recordCodingAgentEvent(options)` records harness-neutral session, message, and tool lifecycle events in canonical ChatKit sessions.
- `ChatKitClient.createAgentSession(input)` idempotently resolves a lookup-key session and its participant routes.
- `ChatKitClient.createMessage(input)` writes a canonical searchable message with caller-selected stable identity metadata.
- `MemoryClient`, `MemoryBankClient`, and `MemorySynthesisSessionClient` expose
  visible-bank discovery, owner-managed documents, synchronous recall/retain,
  source bindings, and bank-free synthesis-session operations. Synthesis
  mutations and completion require the exact current batch, complete evidence
  set, and fresh lease owner; synthesis forget is separate from owner deletion.
  `MemorySynthesisSessionClient.validateBatch(input)` proves that exact digest,
  complete evidence set, and current unexpired lease before external inference.
- `MemoryClient.personalBanks(ownerUserId)` and
  `personalBank(ownerUserId, bankId)` use owner credentials to inspect, edit,
  or delete explicit personal facts; personal synthesizer assignment remains a
  separate operation so a queue can safely wait while none is configured.
- `MemoryClient.bindPersonalSource(ownerUserId, input)` and
  `retryPersonalSource(ownerUserId, sourceKind, sourceId)` keep personal Wiki,
  Skill, Tool, MCP, Signal, and ChatKit ingestion on user-owned routes.
- `ChatKitClient.recallAutomaticMemory(input)` requests a bounded,
  provenance-bearing projection using only a durable triggering message.
- `ChatKitClient.getAgentMemorySettings(agentId)` and
  `updateAgentMemorySettings(agentId, settings)` inspect and replace the bot's
  automatic-memory mode and selected banks.
- `@trytilde/sdk/api` exposes the generated API client when a stable wrapper does not yet exist.
- `@trytilde/sdk/json` exposes the shared JSON types, guards, accessors, and parser.

## Customer-hosted ChatKit providers

The `@trytilde/sdk/chatkit-provider` subpath exports:

- `defineChatKitProvider(definition)` validates configuration, capabilities, and session-tool declarations.
- `chatKitProviderEndpoint(options)` creates signed Fetch discovery and invocation handlers without an AI framework dependency.
- `createProviderRuntimeClient(options)` binds ingestion, conversation creation, participant/identity operations, history, and attachment workflows to one connection token.
- `ChatKitProviderDefinition`, `ProviderContext`, `ProviderSessionTool`, `ProviderSetupResult`, `ProviderDeliveryOptions`, and `ProviderReconciliation` describe the authoring contract. Trusted routing and execution context stays separate from model inputs.

`client.chatkit.customProviders` manages definitions, setup, connections, credential
rotation, and failed-work inspection/retry. `client.chatkit.sessionTools({ sessionId })`
returns currently authorized tools bound to the active turn. Keep each tool-call ID
stable when retrying. `client.chatkit.submitTurn` and `streamSessionEvents` support
custom client protocols using the caller's existing authorization and event cursors.

See [the Linq, AgentMail, and streaming examples](examples/custom-chatkit/README.md).
Deploy the companion API before releasing this SDK. Runtime connection credentials
cannot impersonate Tilde users, and private delivery options must not enter shared logs.

## JSON values

`@trytilde/sdk/json` owns the SDK's shared JSON types, object guards, string-field accessors, and
non-throwing parser. SDK adapters use this subpath instead of redefining local `isRecord`,
`isJsonObject`, or `stringField` helpers.

## Conversation goals and tasks

```ts
const work = tilde.chatkit.work({ agentId, sessionId });
const goal = await work.goals.create({ objective: "Ship the release" });
const task = await work.tasks.create({
  goalId: goal.id,
  summary: "Run the release checks",
});

await work.tasks.progress(task.id, 50, "Core checks passed");
await work.tasks.complete(task.id, "Release checks passed");
await work.goals.complete(goal.id, "Release shipped");
```

The bound agent and session stay in the request path rather than mutation bodies. Tilde validates
the calling agent and its active session participation.

See the
[code review bot example](https://github.com/trytilde/examples/tree/main/code-review-bot)
for a complete Next.js, ChatKit, MCP, and reverse-proxy integration.

## Materialize a managed skill package

Managed skills may include scripts, references, templates, and assets in
addition to `SKILL.md`. The SDK reads the manifest first and lazily requests a
short-lived R2 URL for each file. `materialize` verifies file sizes and SHA-256
checksums, preserves executable bits, and atomically moves the completed tree
into the requested directory.

```ts
import { createClient } from "@trytilde/sdk";

const tilde = createClient();
const skill = await tilde.skills.registry(registryId).then((registry) =>
  registry.find("popular-web-designs"),
);

await tilde.skills
  .package(skill.id)
  .materialize("/workspace/.agents/skills/popular-web-designs");
```

`materialize` is a Node.js API and is suitable for a scoped Modal computer or
another agent filesystem. Browser callers can use `manifest()` and
`download(path)` directly.

## Record a coding-agent event

Harness adapters normalize their native hook payloads before calling the core
recorder. The recorder reuses one ChatKit session per harness session, writes
prompts and final responses as searchable messages, and correlates each tool
lifecycle by its stable execution ID.
Supported sources are Codex, Claude Code, Cursor, OpenCode, and Gemini CLI.

```ts
import { createClient, recordCodingAgentEvent } from "@trytilde/sdk";

await recordCodingAgentEvent({
  client: createClient(),
  agentId: "agent-id",
  source: "codex",
  event: {
    type: "tool_completed",
    sessionId: "codex-thread-id",
    executionId: "tool-call-id",
    toolName: "functions.exec",
    input: { cmd: "pnpm test" },
    output: { exitCode: 0 },
  },
});
```

## Application authentication and organization identities

Use `createClient({ orgId, proxyToken, orgSubdomain: false })` on your server to
provision organization-owned identities with `createIdentity`, resolve optional
unique identifiers with `identities.resolve`, and idempotently create an initial
team with `identities.provisionTeam`. These operations need their corresponding
application capabilities. `forTeam({ teamId, identityId })` returns a new scoped
client without mutating another request.

`@trytilde/sdk/proxy` exports `createTildeProxy({ baseUrl, orgId, proxyToken,
mountPath, resolveSession })`. The session resolver verifies your application's
login and returns `{ identityId, teamIds }` or null. The proxy replaces incoming
credentials/identity headers, validates the selected team, permits runtime routes,
preserves streaming and cancellation, and never exposes the server credential.
Mutating browser requests must be same-origin. Account/billing/provisioning routes
are excluded from this browser transport.

`linkIdentity({ identityId, returnUrl, delivery? })` starts Tilde's hosted account
linking flow. Register exact return URLs on the application token. Linking does
not grant org administration or enroll a subscription. Email identifiers alone
never establish account ownership.


Org application clients also expose `identities.listTeams(identityId, { pageSize?, nextPageToken? })`,
`addTeam(identityId, teamId)`, `removeTeam(identityId, teamId)`, and
`removeIdentifier(identityId, { namespace, value })`. These require unbound
`identities:manage` authority; adding runtime membership never assigns account roles.

Application-token transports reject redirects, snapshot/freeze identity and team
configuration, and replace caller authentication headers. The Fetch proxy adds
sandbox/nosniff protection for navigated upstream content. Org proxy credentials
are not supported by the gRPC reverse proxy and fail explicitly there.

Identity lists use `identities.list({ pageSize?, nextPageToken? })` and return
`{ items, next_page_token }`. Pass the returned cursor unchanged to the next call;
page sizes are clamped to 1–100. Membership lists use the same response shape.

## Realtime voice

Configure speech with agent registration's `audio` option or `client.chatkit.audio.configure()`. Use `audio.start()` for browser media admission and `audio.configureTelnyx()` to bind a phone route; it returns `webhookUrl` and, when supplied by the API, `channelInboxId`. Modes are `pipeline`, `realtime`, and phone-only `telnyx_relay`. Rust runs OpenAI speech for the first two; Telnyx Conversation Relay runs STT/TTS for relay calls. Relay defaults to `language: "en-US"` and `interruptible: true`, with `sttModel: "deepgram/nova-3"` and `voice: "Telnyx.Ultra.Callie"`. It uses the phone route credential rather than an OpenAI speech credential. The normal endpoint callback receives `context.audio` and `context.telnyx` for pipeline/relay turns; native transcripts do not invoke it. `audio.start()` rejects relay agents.

See [the manual voice example](../../examples/realtime-voice/README.md). Deploy the matching voice API before enabling these wrappers. Browser personal-tool federation and native endpoint-tool bridging are outside this initial slice.
