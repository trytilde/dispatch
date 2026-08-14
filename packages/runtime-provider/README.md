# @tryopenbot/runtime-provider

Shared provider build, initialization, persistence, and phased deployment contracts. It coordinates artifacts first, deploys ordinary providers next, deploys the trusted development sandbox, and deploys the control runtime last.

## Public API

### Functions

- `buildProviders(participants, options)` checks and builds every participant that exposes `buildable`, in registration order, and returns accumulated `DeploymentOutputs`.
- `deployProviders(participants, options)` plans all deployable participants, runs optional configuration, then deploys provider, sandbox, and runtime roles in that order.
- `persistEnvironment`, `persistSecret`, `unsetEnvironment`, and `unsetSecret` let the provider that owns a resource update repository configuration and the shared in-memory environment.

### Classes

- `DeploymentOutputs` stores named handoff outputs in memory. `merge`, `get`, `require`, `outputs`, and `result` are its public operations; conflicting or invalid names fail.

### Critical interfaces

- `Buildable` defines `check()` and `build()` for software artifacts.
- `Deployable` defines read-only `plan()`, optional `configure()`, and `deploy()`.
- `DeployableProvider` lets a domain provider opt into `buildable` and/or `deployable`; absent lifecycles are skipped.
- `ProviderInitialization` and `ProviderInitializationQuestion` describe GUI-agnostic onboarding questions and value destinations.
- `Platform` represents an external platform shared by domain providers. `collectProviderInitializations(providers)` combines provider-owned questions with shared `platforms`, rejecting conflicting definitions and returning each stable initialization ID once.
- `DeploymentParticipant` assigns a stable ID and optional `provider`, `sandbox`, or `runtime` role.
- `DeploymentContext`, `DeploymentResult`, and `DeploymentRunOptions` carry repository paths, one mutable provider environment map, named outputs, persistence, reporting, and dry-run state.

Secret values must never be written to deployment events. Providers receive values from `configuration/.env` and decrypted `configuration/secrets.enc.yaml` in one map. Final service installers remain responsible for excluding control-plane credentials.
