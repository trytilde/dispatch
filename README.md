# OpenBot

OpenBot is being rebuilt from the user experience downward. The current repository intentionally ships a minimal, healthy application shell before agent, provider, and computer behavior is wired back in.

## Run locally

Requirements: Node.js 24 and pnpm 10.

```bash
pnpm install
pnpm dev
```

- Web: `http://127.0.0.1:4173`
- API: `http://127.0.0.1:4100`
- Health: `http://127.0.0.1:4100/healthz`

No setup or pairing code is required. The web app is a disconnected UX shell and `control-service-proto` is intentionally empty while the frontend contract is designed.

## Deploy

```bash
pnpm openbot init
pnpm deploy:prod -- --dry-run --json
pnpm deploy:prod -- --yes
```

`openbot init` creates `configuration/index.ts` and `configuration/.env`, configures SOPS, generates a dedicated age identity for the trusted development sandbox, and asks for an independent owner identity. Managed owner identities support HashiCorp Vault Transit, Azure Key Vault, Google Cloud KMS, and AWS KMS. Local fallbacks store a generated owner age identity in 1Password or the native operating-system keychain. Provider-contributed questions are saved either to `.env` or `configuration/secrets.enc.yaml`; secret input is never written to command arguments. Deployment credentials such as `VERCEL_TOKEN` are available to providers and the trusted development sandbox but are excluded from the final runtime environment.

Use `pnpm openbot secrets set NAME` and `pnpm openbot secrets unset NAME` to maintain encrypted values without learning SOPS commands. Setting a value requires a current SOPS release with `set --value-stdin` support so plaintext never appears in the process list.

Commit `configuration/index.ts`, `.sops.yaml`, `sops.identity.json`, and `secrets.enc.yaml` after initialization. Never commit `configuration/.env`. The sandbox age private key is encrypted at `openbot.sandbox.sops_age_key` and is reserved for the trusted development-sandbox deployment participant.

The CLI checks and builds every selected provider that exposes `buildable`, then plans and deploys providers that expose `deployable`. `openbot deploy --skip-deploy` stops after producing artifacts. `openbot deploy --service agents --yes` builds and deploys the agent project without compiling or redeploying control; `--service control` does the inverse. A configured computer provider builds and publishes its shared OCI image during a full deployment, before agent functions and the control runtime. Provider outputs contribute named outputs, environment variables, and secrets without a second operator command. Sandbox-only secrets remain excluded from service runtimes.

`configuration/index.ts` explicitly constructs selected implementations under its `providers` object. Agents, skills, custom provider source, and sandbox resources always use the canonical paths under `configuration/`; their locations are not configuration options.

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
- `packages/computer-service-proto` owns the capability-protected internal computer API.
- No control database is retained while the reset application has no persisted control state.
- Each domain provider package owns both its TypeScript contract in `src/core.ts` or `src/core/index.ts` and its concrete adapters; provider contract interfaces never live in adapter modules or the package-root entrypoint, and they are not RPC surfaces.

```bash
pnpm check
pnpm build
pnpm test:e2e
```

OpenBot is MIT licensed. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [PROVENANCE.md](PROVENANCE.md).
