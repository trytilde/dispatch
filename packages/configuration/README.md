# @openbot/configuration

Typed composition for repository-owned OpenBot configuration. A generated `configuration/index.ts` explicitly constructs provider implementations; agent skills and workspace seeds remain inside their agent directory, and filesystem locations are conventions rather than configurable paths.

## Public API

### Functions

- `Configuration(configuration)` is an identity helper that checks an `OpenBotConfiguration` object without hiding the selected provider constructors.
- `RuntimeProviders(providers)` checks the five providers safe to import inside agent artifacts without pulling service deployment compilers into each bundle.
- `repositoryDigest(files)` returns a stable SHA-256 digest over a path-to-content mapping.

### Critical interfaces

- `OpenBotConfiguration` contains a single `providers` object.
- `OpenBotProviders` requires all seven provider roles: control service, agent service, agent, computer, inference model, skills, and tools.
- `AgentRuntimeProviders` is the agent, computer, inference-model, skills, and tools subset stored in `configuration/runtime-providers.ts`.
- `ServiceProvider` combines `Buildable`, `Deployable`, and `InitializableProvider` for independently deployed services.
- `ProviderPluginManifest` and `RepositoryManifest` describe discovered repository configuration without introducing a selector factory.
