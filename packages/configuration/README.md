# @openbot/configuration

Typed composition for repository-owned OpenBot configuration. A generated `configuration/index.ts` explicitly constructs provider implementations; filesystem locations for agents, skills, providers, and sandbox assets are conventions, not configurable paths.

## Public API

### Functions

- `Configuration(configuration)` is an identity helper that checks an `OpenBotConfiguration` object without hiding the selected provider constructors.
- `repositoryDigest(files)` returns a stable SHA-256 digest over a path-to-content mapping.

### Critical interfaces

- `OpenBotConfiguration` contains a single `providers` object.
- `OpenBotProviders` requires control-service and agent-service providers and optionally selects agent, computer, inference-model, skills, and tools providers.
- `ServiceProvider` combines `Buildable`, `Deployable`, and `InitializableProvider` for independently deployed services.
- `ProviderPluginManifest` and `RepositoryManifest` describe discovered repository configuration without introducing a selector factory.
