# ADR-0011: Eve-compatible agent layout

## In brief

- Agent is `configuration/agents/<id>/`. Path owns identity.
- Keep Eve-shaped authored slots where useful. No Eve runtime or loader.
- `agent.ts` default-exports `chatKitEndpoint`. `instructions.ts` feeds its system prompt.
- One shared computer. One Linux user and private persistent workspace per agent.
- Seed workspace once. Never overwrite deployed agent files implicitly.
- Keep Eve's authored `sandbox/` folder and five default tool names; use computer terminology elsewhere.
- Give every agent Eve's five explicit typed computer tools routed through computer-service.

## Context

OpenBot needs a predictable, portable authored-agent layout without inventing vocabulary that already exists in Vercel's Eve SDK. Eve's filesystem model is a useful convention, but OpenBot uses Tilde ChatKit endpoints, its own provider composition, one shared computer, and independently built local or Vercel agent-service artifacts. Blind Eve compatibility would therefore promise runtime behavior OpenBot does not have.

## Decision

Each agent lives under `configuration/agents/<id>/`; the directory name is its ID. OpenBot supports this authored subset:

```text
configuration/
├── instrumentation.ts
└── agents/<id>/
    ├── agent.ts
    ├── instructions.ts
    ├── instrumentation.ts
    ├── lib/
    ├── tools/
    ├── skills/
    └── sandbox/workspace/**
```

`agent.ts` is required and default-exports the request handler returned by Tilde `chatKitEndpoint(...)`. `instructions.ts` is required, default-exports the system instructions, and is imported explicitly by `agent.ts`. OpenBot does not support `instructions.md`.

The optional instrumentation files use Eve's `defineInstrumentation({ setup })` authoring shape. `configuration/instrumentation.ts` runs first for every agent at server startup; an optional agent-local `instrumentation.ts` runs second; only then does OpenBot import `agent.ts`. OpenBot supplies the resolved path-derived `agentName`. Instrumentation is a server startup hook, not an agent tool.

Every file under `tools/` default-exports a Vercel AI SDK tool. Every skill is a spec-conformant Markdown file or skill package. `lib/` is ordinary import-only TypeScript. Skills remain authored structure without automatic loading. Tools are explicitly imported by `agent.ts`; OpenBot does not use a directory loader. Channels, connections, hooks, schedules, and subagents are not supported.

OpenBot terminology calls the runtime a Computer, so new APIs, environment variables, and provider contracts use `computer`. The authored `sandbox/workspace/**` path and Eve's five model-facing default tool names are deliberate compatibility exceptions that keep OpenBot agent repositories structurally familiar without changing the shared-computer model.

Every agent contains Eve's five default sandbox tools as `tools/bash.ts`, `read_file.ts`, `write_file.ts`, `glob.ts`, and `grep.ts`. Each default-exports a Vercel AI SDK tool and calls the typed `ComputerService` Connect client. Agent code does not call Microsandbox, Vercel Sandbox, or an untyped HTTP endpoint directly. Each tool hardcodes the path-derived agent ID outside its model-visible schema. The API-key-protected computer-service validates the request, maps that ID to the stable Linux user, enters the user's private `/workspace` mount, and executes the operation as that user. Desktop screenshot and input remain typed service capabilities but are not implicit model tools.

OpenBot does not reproduce Eve's one-sandbox-per-agent model. One OpenBot Computer is shared by all agents. Agent deployment registers a stable Linux user for each agent and allocates `/workspace/.openbot/agents/<id>/workspace` on the persistent disk. Provider calls scoped to that agent enter a private mount namespace, bind that agent's physical directory over logical `/workspace`, and then execute as its Linux user. The backing workspace tree is mode `0700`, and another agent's physical path is not reachable through its logical workspace view.

Files from `configuration/agents/<id>/sandbox/workspace/**` are copied only when the Linux user and workspace are first registered. Ordinary later agent deployments detect the registration marker and leave the persistent workspace untouched. Consequently, edits to authored workspace seeds do not appear for already deployed agents; applying them requires a future explicit workspace reconciliation or destructive computer replacement operation.

Agent-service discovery, checking, content digests, local federation, and parallel Vercel function builds use `agent.ts` inside each directory as the entrypoint. OpenBot follows Eve's layout where possible, but it does not load these folders with Eve and does not claim behavioral compatibility.

```mermaid
flowchart LR
  G["configuration/instrumentation.ts"] --> H["server startup hooks"]
  A["agents/id/instrumentation.ts"] --> H
  H --> E["agents/id/agent.ts"]
  E --> F["independent agent function"]
  F --> T["agent computer tools"]
  T --> C["typed computer-service RPC"]
  C --> U
  W["agents/id/sandbox/workspace"] --> U["Linux user private workspace"]
  U --> S["one shared OpenBot Computer"]
```

## Consequences

- Fork authors get a familiar Eve-shaped tree without coupling OpenBot deployment to Eve.
- Each agent remains an independently compiled function entrypoint.
- Required computer tools are explicit; arbitrary tools and skills remain author-controlled.
- Persistent agent workspaces are protected from silent seed overwrites.
- Shared desktop and compute resources remain installation-wide; filesystem identity is per agent.
- The Eve-compatible authored folder and default tools retain Eve names; runtime and API language says `computer`.

## Updates

- 2026-08-13T12:53:05+02:00: Strengthened agent filesystem isolation from path translation alone to a private bind-mounted `/workspace` plus Linux-user execution.
- 2026-08-13T14:29:49+02:00: Kept `sandbox/workspace` solely for Eve layout compatibility, required one typed computer tool file per supported operation, and moved agent-to-user execution enforcement into computer-service.
- 2026-08-13T14:49:44+02:00: Standardized required scaffolding on Eve's `bash`, `read_file`, `write_file`, `glob`, and `grep`; each tool fixes its agent ID outside model input and routes through computer-service.
