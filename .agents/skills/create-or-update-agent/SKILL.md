---
name: create-or-update-agent
description: Create or modify an OpenBot authored agent under configuration/agents, including its ChatKit endpoint, instructions, instrumentation, tools, skills, library code, and sandbox workspace seed. Use whenever adding an agent, changing an agent's filesystem layout or entrypoint, or updating agent build and deployment discovery.
---

# Create Or Update Agent

## Read the contract

Read `docs/adrs/0011-eve-compatible-agent-layout.md`, `docs/agents.md`, the target agent directory, and the agent-service provider discovery and build code. Preserve the Eve-shaped authored layout without claiming Eve runtime compatibility.

## Preserve the canonical tree

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

- Derive the agent ID from its directory name. Use lowercase kebab-case matching `^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$`.
- Require `agent.ts` and `instructions.ts`.
- Default-export the Tilde `chatKitEndpoint(...)` request handler from `agent.ts`. Import `instructions.ts` explicitly and pass it into the endpoint's system prompt.
- Default-export TypeScript instructions from `instructions.ts`. Do not add `instructions.md`.
- Keep reusable import-only TypeScript in `lib/`.
- Default-export one Vercel AI SDK tool from each file in `tools/`.
- Store specification-conformant skill Markdown files or skill folders under `skills/`.
- Keep skills and sandbox workspace seeds inside their owning agent directory. Never create, read, or migrate content to global `configuration/skills/` or `configuration/sandbox/` directories; those paths are unsupported.
- Do not add channels, connections, hooks, schedules, or subagents.
- Treat `tools/` and `skills/` as authored structure only until their loading semantics are explicitly implemented. Do not auto-register them while making an unrelated agent change.

## Instrument startup

Use `defineInstrumentation({ setup })` from `@openbot/agent-service-provider`. Keep `configuration/instrumentation.ts` installation-wide and `configuration/agents/<id>/instrumentation.ts` agent-specific. Both are optional at runtime; an empty `setup` function is valid.

Run global instrumentation first, agent instrumentation second, and import `agent.ts` only afterward. Supply the path-derived `agentName`. Instrumentation is a server startup hook, not an agent tool or request hook.

## Preserve build and deployment behavior

Treat each `agent.ts` as an independently buildable agent-service entrypoint. Keep local development's combined server and production's separate agent artifacts aligned. Vercel builds must remain concurrent across agents.

All agents share one OpenBot Computer, but deployment registers a stable Linux user and private persistent workspace for each agent. Provider operations scoped to an agent present that directory as logical `/workspace` and run as that agent's user.

Seed `sandbox/workspace/**` only when registering a new agent workspace. Never overwrite an existing deployed workspace during an ordinary agent deployment. State clearly when changing seed files that already-deployed agents will not receive those changes without explicit future reconciliation or computer replacement. Reject symlinks in agent source and workspace seeds.

## Initialize examples

Keep `openbot init` capable of generating a hello-world agent with:

- `agent.ts` importing `instructions.ts`
- an empty global and agent instrumentation hook
- one example tool and one specification-conformant skill
- a `lib/` helper
- a sandbox workspace seed

Generate source files from Handlebars assets through `@openbot/utilities`; do not embed whole generated files in TypeScript strings.

## Verify

Run focused agent-service provider discovery, build, and initialization tests when implementation changes are in scope. Check that every agent is discoverable by directory, imports its instructions, and preserves the supported tree. Do not claim tools or skills load automatically.
