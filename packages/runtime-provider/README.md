# @tryopenbot/runtime-provider

Shared provider build, initialization, and phased deployment contracts. It coordinates artifacts first, deploys ordinary providers next, gives the trusted development sandbox its sandbox-only inputs, and deploys the control runtime last.

## Public API

### Functions

- `buildProviders(participants, options)` checks and builds every participant that exposes `buildable`, in registration order, and returns accumulated `DeploymentOutputs`.
- `deployProviders(participants, options)` plans all deployable participants, runs optional configuration, then deploys provider, sandbox, and runtime roles in that order.
- `sandboxDeploymentEnvironment(inputs)` creates the trusted sandbox environment from runtime environment variables, runtime secrets, deployment credentials, and sandbox-only secrets. It fails on conflicting values.

### Classes

- `DeploymentOutputs` stores named deployment outputs and the three secret classes in memory. `merge`, `get`, `require`, the category accessors, and `result` are its public operations; conflicting or invalid names fail.

### Critical interfaces

- `Buildable` defines `check()` and `build()` for software artifacts.
- `Deployable` defines read-only `plan()`, optional `configure()`, and `deploy()`.
- `DeployableProvider` lets a domain provider opt into `buildable` and/or `deployable`; absent lifecycles are skipped.
- `ProviderInitialization` and `ProviderInitializationQuestion` describe GUI-agnostic onboarding questions and value destinations.
- `Platform` represents an external platform shared by domain providers. `collectProviderInitializations(providers)` combines provider-owned questions with shared `platforms`, rejecting conflicting definitions and returning each stable initialization ID once.
- `DeploymentParticipant` assigns a stable ID and optional `provider`, `sandbox`, or `runtime` role.
- `DeploymentContext`, `DeploymentResult`, and `DeploymentRunOptions` carry repository paths, accumulated values, reporting, and dry-run state.

Secret values must never be written to deployment events. `deploymentSecrets` are for deployers, `sandboxSecrets` are only for the trusted development sandbox, and neither belongs in the final runtime environment.
