# Agents

Each agent lives at `configuration/agents/<id>/`, where the directory name is its ID. `agent.ts` must default-export the request handler returned by Tilde `chatKitEndpoint(...)`; OpenBot mounts it at `/api/agents/<id>`. `instructions.ts` default-exports the system instructions and is explicitly imported by `agent.ts`.

The supported authored tree is `agent.ts`, `instructions.ts`, optional `instrumentation.ts`, `lib/`, `tools/`, `skills/`, and `sandbox/workspace/**`. Configuration-wide `configuration/instrumentation.ts` runs before every agent-local instrumentation hook and before importing the endpoint. Tools must default-export a Vercel AI SDK tool and are explicitly imported by `agent.ts`; skills conform to the agent skill specification but are not loaded automatically yet. Channels, connections, hooks, schedules, and subagents are unsupported.

The directory remains named `sandbox/` only to follow Eve's project layout where practical. OpenBot calls the runtime an OpenBot Computer everywhere else. Every agent must contain `tools/computer-exec.ts`, `computer-read-file.ts`, `computer-write-file.ts`, `computer-screenshot.ts`, and `computer-input.ts`. These tools call the typed internal computer-service RPC with that agent's fixed ID; they never call a sandbox provider SDK or untyped endpoint directly.

All agents share one OpenBot Computer, but deployment registers a separate Linux user and persistent workspace for each ID. The computer service maps each tool request's agent ID to that user, mounts its private directory as `/workspace`, and executes command, file, screenshot, and input operations with that OS identity. Authored `sandbox/workspace/**` files seed only a newly registered agent. Changes to those files do not update an already deployed agent workspace.

Create and edit these directories as ordinary source files in the fork. `openbot init` creates a hello-world example with instructions, empty instrumentation hooks, a tool, a skill, a `lib/` helper, and a workspace seed. OpenBot does not expose a runtime agent-creation API or publish source-code changes.

Reconciliation is idempotent and lease-protected. Deleting a file marks its registration orphaned. Only `vp run openbot sync --prune --yes` disables removed remote agents.
