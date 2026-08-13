# OpenBot

OpenBot is being rebuilt from the user experience downward. The current repository intentionally ships a minimal, healthy application shell before agent, provider, and computer behavior is wired back in.

## Run locally

Requirements: Node.js 24 and pnpm 10.

```bash
pnpm install
pnpm openbot init
pnpm dev
```

- Web: `http://127.0.0.1:4173`
- API: `http://127.0.0.1:4100`
- Health: `http://127.0.0.1:4100/healthz`

A fresh upstream checkout intentionally contains only `configuration/.gitignore`, which hides all configuration contents. Run `pnpm openbot init` after forking; successful initialization removes that exact upstream sentinel so the fork can commit its configuration and initial agent. Commit the deletion with the generated configuration. Ordinary upstream merges preserve the fork's committed deletion while upstream leaves the sentinel unchanged. No setup or pairing code is required.

## Deploy

```bash
pnpm openbot init
pnpm openbot new-agent
pnpm deploy:prod -- --dry-run --json
pnpm deploy:prod -- --yes
```

`openbot init` creates `configuration/index.ts` and `configuration/.env`, configures SOPS, generates a dedicated age identity for the trusted development sandbox, and asks for an independent owner identity. Managed owner identities support HashiCorp Vault Transit, Azure Key Vault, Google Cloud KMS, and AWS KMS. Local fallbacks store a generated owner age identity in 1Password or the native operating-system keychain. Provider-contributed questions are saved either to `.env` or `configuration/secrets.enc.yaml`; secret input is never written to command arguments. Deployment credentials such as `VERCEL_TOKEN` are available to providers and the trusted development sandbox but are excluded from the final runtime environment.

Root `.env`, `.env.local`, and root SOPS files are intentionally unsupported. Fork configuration comes only from `configuration/.env` and `configuration/secrets.enc.yaml`; contributor machines and CI supply repository-maintenance values through their process environment, so contributor configuration cannot silently propagate into forks.

Use `pnpm openbot secrets set NAME` and `pnpm openbot secrets unset NAME` to maintain encrypted values without learning SOPS commands. Setting a value requires a current SOPS release with `set --value-stdin` support so plaintext never appears in the process list.

Commit `configuration/index.ts`, `.sops.yaml`, `sops.identity.json`, and `secrets.enc.yaml` after initialization. Never commit `configuration/.env`. The sandbox age private key is encrypted at `openbot.sandbox.sops_age_key` and is reserved for the trusted development-sandbox deployment participant.

The CLI checks and builds every selected provider that exposes `buildable`, then plans and deploys providers that expose `deployable`. `openbot deploy --skip-deploy` stops after producing artifacts. `openbot deploy --service agents --yes` builds and deploys the agent project without compiling or redeploying control; `--service control` does the inverse. A configured computer provider builds and publishes its shared OCI image during a full deployment, before agent functions and the control runtime. Provider outputs contribute named outputs, environment variables, and secrets without a second operator command. Sandbox-only secrets remain excluded from service runtimes.

`configuration/index.ts` explicitly configures every provider role under its `providers` object. The five providers used inside agent functions are constructed in `configuration/runtime-providers.ts` and referenced explicitly from the composition root, keeping control/agent deployment compilers out of runtime bundles. Init selects the default Tilde agent, skills, and tools providers without asking the owner to choose domain providers. Each agent owns its skills and workspace seed under `configuration/agents/<id>/`; custom provider source lives under `configuration/providers/`. Global `configuration/skills/` and `configuration/sandbox/` directories are unsupported, and filesystem locations are not configuration options.

The agent-local folder remains named `sandbox/workspace/` to stay structurally compatible with Eve where practical; runtime terminology is Computer everywhere else. Run `pnpm openbot new-agent` to create an agent from its display name. Each generated agent explicitly owns thin tool files for shell, background-shell waiting, file access, search, and screenshots. Their shared Zod schemas and typed computer-service implementations live in `@openbot/computer-provider/tools`; every file fixes the path-derived agent ID outside its model-visible schema. Populated seeds initialize `/workspace/<agent-id>` once on the shared computer. That path is the agent's default directory, not a security boundary.

Agent Bash tools run `bash -lc` with `HOME=/workspace/<agent-id>`. Init scaffolds
`configuration/agents/<id>/sandbox/workspace/.profile`, which Bash loads before
each command and which may source an optional `.bashrc`. Like every workspace
seed, the profile is copied only when that agent is first registered; editing
it does not modify an existing deployed workspace.

`openbot init` also generates `OPENBOT_COMPUTER_SERVICE_API_KEY` directly into the SOPS-encrypted runtime secrets. Agent and control services receive it through their normal secret installation, and each computer receives the same value when it is created. Computer-service rejects every RPC without the exact bearer key; the key is never returned as a deployment output or written into a generated public artifact.

- `vercel` builds a control/web project and a separate agent project. Every configured agent is a parallel-built Vercel Function; both projects deploy from prebuilt artifacts.
- `local` builds separate control and agent Hono servers, writes private service environments, and installs two user-level systemd services on Linux or launchd agents on macOS. Development still hosts control and agents in one Hono process.

`--dry-run` performs native checks, writes local build artifacts, and calls the read-only `plan()` lifecycle. It does not link projects, publish Vercel deployments, or start services. Use `--skip-deploy` when only the artifacts are wanted and no deployment plan is needed.

The production build stages the web app in the control provider's `.vercel/output/static` artifact for Vercel's CDN and deploys its provider-owned Hono Function for `/healthz` and `/rpc`.

## Current application boundary

- `cli` owns the React Ink repository CLI, development process supervision, and provider deployment coordination.
- `packages/runtime-provider` owns the optional provider deployment contract and runtime-last coordinator.
- `packages/control-service-provider` owns local and Vercel control/web builds and deployment.
- `packages/agent-service-provider` owns Eve-compatible agent-directory discovery, instrumentation startup, concurrent per-agent Vercel bundles, the local agent server, and deployment.
- `apps/web` owns the UX shell and frontend routes.
- `apps/control-service` owns the portable Hono application, built web UI fallback, `/healthz`, ConnectRPC federation under `/rpc`, and the local control-service entrypoint.
- `packages/control-service-proto` is the future owner-facing API contract and is intentionally empty.
- `packages/computer-service-proto` owns the API-key-protected internal computer API.
- No control database is retained while the reset application has no persisted control state.
- Each domain provider package owns both its TypeScript contract in `src/core.ts` or `src/core/index.ts` and its concrete adapters; provider contract interfaces never live in adapter modules or the package-root entrypoint, and they are not RPC surfaces.

```bash
pnpm check
pnpm build
pnpm test:e2e
```

OpenBot is MIT licensed. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [PROVENANCE.md](PROVENANCE.md).
