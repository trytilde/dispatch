# @trytilde/dispatch-configuration

Typed composition for repository-owned Dispatch configuration. A generated `configuration/index.ts` explicitly constructs provider implementations; agent skills and workspace seeds remain inside their agent directory, and filesystem locations are conventions rather than configurable paths.

## Public API

### Functions

- `Configuration(configuration)` is an identity helper that checks an `DispatchConfiguration` object without hiding the selected provider constructors.
- `repositoryDigest(files)` returns a stable SHA-256 digest over a path-to-content mapping.
- `defineInstrumentation(instrumentation)` is exported from `@trytilde/dispatch-configuration/instrumentation` for configuration-wide and agent-local startup hooks.

### Critical interfaces

- `DispatchConfiguration` contains a single `providers` object.
- `UserConfiguration` defines user-local root `local-user-config.json` state, including `sops.ownerIdentity`; the file is scoped to one checkout and gitignored.
- `SopsOwnerIdentityConfiguration` describes how the CLI locates the owner's existing SOPS authority without storing the private identity.
- `DispatchProviders` requires control-service, agent-service, aggregate agent-resource, and computer roles; inference provisioning is optional.
- `ServiceProvider` combines `Buildable`, `Deployable`, and `InitializableProvider` for independently deployed services.
- `ProviderPluginManifest` and `RepositoryManifest` describe discovered repository configuration without introducing a selector factory.
