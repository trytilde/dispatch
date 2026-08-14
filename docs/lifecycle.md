# OpenBot lifecycle

OpenBot uses typed lifecycle hooks. Hooks own work. Events only report progress.

## Initialization

`openbot init` creates or revisits fork-owned configuration. Shared platforms are collected once, even when several providers use them.

```mermaid
flowchart TD
  A["openbot init"] --> B{"Initialized repository?"}
  B -- "No" --> C["Verify canonical revision and GitHub access"]
  C --> D["Create public fork or private mirror"]
  D --> E["Clone and verify owned repository"]
  B -- "Yes" --> F{"Existing SOPS setup?"}
  E --> F
  F -- "No" --> G["Validate repository and configuration sentinel"]
  G --> H["Create owner and sandbox SOPS identities"]
  H --> I["Collect platform and provider initialization metadata"]
  I --> J["Ask unique questions"]
  J --> K["Write configuration/.env and encrypted secrets"]
  K --> L["Render configuration modules"]
  L --> M["Seed configuration/templates/agent if missing"]
  M --> N["Scaffold Hello World from template"]
  N --> Z["Run vp install"]
  F -- "Yes" --> P["Decrypt and load stored values"]
  P --> Q["Collect platform and provider initialization metadata"]
  Q --> R["Revisit questions with existing defaults"]
  R --> S["Update configuration/.env and encrypted secrets"]
  S --> T["Seed agent template if missing"]
  T --> Z
```

### Initialization metadata

`Platform.initialization` describes shared vendor setup. Put account, organization, team, token, and base-URL questions here. Do not create remote resources here.

Provider `initialization` describes provider-only values. Put project names or provider-specific options here. Do not repeat platform questions.

Question destinations decide storage:

- `environment`: non-secret values in `configuration/.env`.
- `secret`: runtime secrets in `configuration/secrets.enc.yaml`.
- `deployment-secret`: deployment authority that must not reach runtime services.

Keep initialization deterministic. It should collect configuration, validate access, render files, and install dependencies. Resource creation belongs to reconciliation or deployment.

## Adding an agent

`openbot new-agent` materializes source, then runs the same idempotent development reconciliation used by `openbot dev`. Production deployment runs that lifecycle again with the deployed agent-service base URL.

```mermaid
flowchart TD
  A["openbot new-agent"] --> B["Normalize display name into agent ID"]
  B --> C{"Agent directory exists?"}
  C -- "Yes" --> D["Stop without overwriting"]
  C -- "No" --> E["Load configuration/templates/agent/**/*.hbs"]
  E --> F["Render source, tools, skills, and workspace seed"]
  F --> G["Load configuration and secrets"]
  G --> H["Run agent provider Deployable"]
  H --> I["Discover every authored agent"]
  I --> J["Get or create Tilde ChatKit agent"]
  J --> K["Reconcile enabled Vercel AI SDK endpoint and local tunnel"]
  K --> L["Create or reuse agent MCP server"]
  L --> M["Create or reuse agent skill registry"]
  M --> N["Persist IDs in configuration/.env"]
  N --> O["Persist new endpoint credentials with SOPS"]
  O --> P["Return scaffolded agent; dev continues to service startup"]
```

### `scaffoldAgentTemplates`

Put the packaged default template here. Seed `configuration/templates/agent/`
only when it is missing; never overwrite fork changes during reconfiguration.
Do not contact a remote platform inside the filesystem scaffolder. The
`new-agent` command invokes provider reconciliation only after scaffolding
finishes.

### `scaffoldAgent`

Load the fork-owned `configuration/templates/agent/**/*.hbs` files here and
render their relative paths without the `.hbs` suffix. Put authored filesystem
creation here: `agent.ts`, instructions, instrumentation, tools, skills,
library code, and workspace seed files. Keep it atomic, require the supported
core files, and never overwrite an existing agent. Do not call Tilde, Vercel,
or another remote platform.

### `reconcileAgentResources`

Use this CLI coordinator only to schedule provider lifecycles and persist their declared outputs, plus the remaining MCP and skill-registry provisioning. Tilde agent get/create/update/status behavior belongs in `TildeAgentProvider.deployable`, never in the CLI. A retry must converge without duplicate agents, endpoints, MCP servers, or registries.

Generated agents read their own `AGENT_<ID>_*` values. Do not use one global MCP server or skill registry for every agent.

## Building

Repository builds and deployment artifact builds are related but distinct.

```mermaid
flowchart TD
  A["openbot build"] --> B["Delegate to pnpm build"]
  B --> C["Generate protobuf contracts"]
  C --> D["Run workspace package builds"]
  D --> E["Type-check and bundle packages and apps"]
  E --> F["Copy package assets"]
  F --> G["Verify published package artifacts and standalone CLI"]

  H["openbot deploy"] --> I["Select deployment participants"]
  I --> J{"Participant exposes buildable?"}
  J -- "Yes" --> K["Buildable.check"]
  K --> L["Buildable.build"]
  L --> M["Merge typed outputs"]
  J -- "No" --> N["Skip build phase"]
```

### `Buildable.check`

Put read-only artifact validation here. Check source shape, required local tools, configuration, and provider-specific build prerequisites. Fail before expensive work. Do not create projects, publish images, or deploy services. Repeated calls must return the same result for unchanged inputs.

### `Buildable.build`

Put reproducible, idempotent artifact creation here. Compile code, render ignored deployment assets, assemble Vercel Build Output, or build a local computer image. Return named outputs such as artifact paths and content digests. Repeated calls may replace the same ignored artifact but must not accumulate state. Do not release the artifact to production.

Package `build` scripts compile publishable workspace packages. They are not provider lifecycle hooks and must not provision infrastructure.

## Deploying

`openbot deploy` builds first, plans every deployable participant, configures prerequisites, then deploys the runtime last.

```mermaid
flowchart TD
  A["openbot deploy"] --> B["Load decrypted deployment configuration"]
  B --> C["Compose selected participants"]
  C --> D["Buildable.check for each buildable participant"]
  D --> E["Buildable.build for each buildable participant"]
  E --> F{"--skip-deploy?"}
  F -- "Yes" --> G["Stop with local artifacts"]
  F -- "No" --> H["Deployable.plan for every deployable participant"]
  H --> I{"--dry-run?"}
  I -- "Yes" --> J["Stop without remote mutation"]
  I -- "No" --> K["Deployable.configure where implemented"]
  K --> L["Merge origins, environment, and secrets"]
  L --> M["Deploy non-runtime providers in registration order"]
  M --> N["Deploy trusted development sandbox"]
  N --> O["Deploy single runtime participant last"]
  O --> P["Run provider smoke checks"]
```

### `Deployable.plan`

Put read-only planning here. Describe intended work and expose useful steps for humans or JSON output. It may inspect current state, but it must not mutate local or remote state. Never include secret values in a plan or event.

### `Deployable.configure`

Put stable prerequisites here. Create or reuse project identities, reserve stable origins, and return values needed by later participants. Make it idempotent. Do not publish the final release here.

### `Deployable.deploy`

Put remote mutation and release work here. Reconcile desired state: push or reuse images, install environment, upload prebuilt artifacts, seed durable workspaces once, reconcile production agent endpoints, start services, and run smoke checks. Return new outputs and secrets through `DeploymentResult`. Every call must be safe to repeat and converge without duplicates.

Non-runtime providers run first. The trusted sandbox runs next. The single runtime participant runs last so it receives all accumulated environment and secrets.

### Deployment events

Use `context.report` for progress only. Report phase, participant ID, summaries, and safe counts. Do not use events to control ordering or pass values. Do not report secrets. Typed results and the coordinator own control flow.

### `DeploymentResult`

Return values through the narrowest channel:

- `outputs`: internal values for later lifecycle hooks.
- `environmentVariables`: non-secret runtime configuration.
- `secrets`: runtime secrets.
- `deploymentSecrets`: deployment-only credentials.
- `sandboxSecrets`: trusted development-sandbox secrets.
- `environmentVariableRemovals`: obsolete persisted non-secret values to unset.
- `secretRemovals`: obsolete persisted secrets to remove with SOPS.

Conflicting values must fail. Never use last-write-wins behavior.
