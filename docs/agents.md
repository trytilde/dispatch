# Agents

Each agent lives at `configuration/agents/<id>/`, where the directory name is its ID. `agent.ts` must default-export the request handler returned by Tilde `chatKitEndpoint(...)`; OpenBot mounts it at `/api/agents/<id>`. `instructions.ts` default-exports the system instructions and is explicitly imported by `agent.ts`.

The supported authored tree is `agent.ts`, `instructions.ts`, optional `instrumentation.ts`, `lib/`, `tools/`, `skills/`, and `sandbox/workspace/**`. Configuration-wide `configuration/instrumentation.ts` runs before every agent-local instrumentation hook and before importing the endpoint. Tools must default-export a Vercel AI SDK tool and skills must conform to the agent skill specification, but neither slot is loaded automatically yet. Channels, connections, hooks, schedules, and subagents are unsupported.

All agents share one OpenBot Computer, but deployment registers a separate Linux user and persistent workspace for each ID. Provider tools present that private directory as `/workspace`. Authored `sandbox/workspace/**` files seed only a newly registered agent. Changes to those files do not update an already deployed agent workspace.

Create and edit these directories as ordinary source files in the fork. `openbot init` creates a hello-world example with instructions, empty instrumentation hooks, a tool, a skill, a `lib/` helper, and a workspace seed. OpenBot does not expose a runtime agent-creation API or publish source-code changes.

Reconciliation is idempotent and lease-protected. Deleting a file marks its registration orphaned. Only `vp run openbot sync --prune --yes` disables removed remote agents.
