# Agents

Each agent lives at `configuration/agents/<id>/`, where the directory name is its ID. `agent.ts` must default-export the request handler returned by Tilde `chatKitEndpoint(...)`; OpenBot mounts it at `/api/agents/<id>`. `instructions.ts` default-exports the system instructions and is explicitly imported by `agent.ts`.

The supported authored tree is `agent.ts`, `instructions.ts`, optional `instrumentation.ts`, `lib/`, `tools/`, `skills/`, and `sandbox/workspace/**`. Configuration-wide `configuration/instrumentation.ts` runs before every agent-local instrumentation hook and before importing the endpoint. Tools must default-export a Vercel AI SDK tool and are explicitly imported by `agent.ts`; skills conform to the agent skill specification but are not loaded automatically yet. Channels, connections, hooks, schedules, and subagents are unsupported.

The directory remains named `sandbox/` only to follow Eve's project layout where practical. OpenBot calls the runtime an OpenBot Computer everywhere else. Every agent contains explicit `await_shell`, `bash`, file, search, and screenshot tool files. Each is a thin default export from `@tryopenbot/computer-provider/tools` with the path-derived agent ID fixed outside the model-visible input schema; agents never call a sandbox provider SDK or untyped endpoint directly.

All agents share one OpenBot Computer, filesystem, and process identity. If an agent's authored `sandbox/workspace/**` contains files, deployment seeds them once into `/workspace/<id>`. The computer service uses the fixed agent ID to choose that default directory, but it is not a security boundary: agents can use absolute paths, see sibling directories, and administer the shared machine. Changes to authored seed files do not update an already deployed agent directory.

Run `pnpm openbot new-agent` and enter the display name to scaffold a complete new directory safely; then edit its ordinary source files in the fork. `openbot init` invokes the same scaffolder for the Hello World example, which includes instructions, empty instrumentation hooks, standard computer tools, a skill, a `lib/` identity helper, and a workspace seed. This is a repository mutation command, not a control-service runtime API, and deployment remains explicit.

Deployment reconciliation is idempotent: missing provider agents are registered and existing agents receive their stable service endpoint. Deleting an authored directory does not currently unregister the remote provider agent; removal remains an explicit provider operation.
