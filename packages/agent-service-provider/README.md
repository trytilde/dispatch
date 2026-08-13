# @openbot/agent-service-provider

Build and deployment providers for independently compiled agent entrypoints. It discovers Eve-shaped agent folders, runs instrumentation hooks, builds one fast function per agent for Vercel, or federates all agents in one local Hono service.

## Public API

### Functions

- `createAgentServiceApp(repositoryRoot, options?)` creates the development/local Hono app and mounts discovered `agent.ts` endpoints.
- `discoverAgents(repositoryRoot)` finds and validates `configuration/agents/<id>/agent.ts` entrypoints.
- `discoverAgentWorkspaces(repositoryRoot)` reads each agent's `sandbox/workspace/**` seed files for computer deployment.
- `defineInstrumentation(instrumentation)` is exported from `@openbot/agent-service-provider/instrumentation` and type-checks Eve-shaped server instrumentation.

### Classes

- `LocalAgentServiceProvider` implements the build and deploy lifecycle for one local Hono server and accepts `LocalAgentServiceProviderOptions`.
- `VercelAgentServiceProvider` builds agents concurrently into separate Vercel Functions and accepts `VercelAgentServiceProviderOptions`.

### Critical interfaces

- `AgentServiceProvider` combines `Buildable`, `Deployable`, and `InitializableProvider`.
- `AgentInstrumentation` defines optional async `setup(context)`; `AgentInstrumentationContext.agentName` is the path-derived agent ID.

Each agent must default-export `chatKitEndpoint(...)` from `agent.ts`. Global instrumentation runs before optional agent-local instrumentation and before the endpoint import. Each agent must also contain the five required Eve-compatible tool files: `bash.ts`, `read_file.ts`, `write_file.ts`, `glob.ts`, and `grep.ts`. Those Vercel AI SDK tools are explicitly imported by `agent.ts`, use the typed computer-service transport, and hide their fixed agent ID from model input; arbitrary authored tools and skills are not directory-loaded.
