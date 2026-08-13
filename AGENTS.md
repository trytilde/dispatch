# OpenBot — AGENTS.md

OpenBot is a TypeScript monorepo for a local or Vercel-hosted agent workspace. It combines a React/Vite web app, Electron desktop shell, Hono and ConnectRPC control server, provider adapters, SQLite-compatible control data, Tilde ChatKit, and local or Vercel sandboxes.

## Start here

1. Read this file, `README.md`, and `CONTEXT.md`.
2. Inspect `git status --short --branch`; preserve unrelated work.
3. Read the owning package and its tests before editing.
4. Read relevant records under `docs/adrs/` before changing a recorded decision.
5. Use `.agents/skills/<name>/SKILL.md` for repository workflows. Runtime agent skills under `configuration/skills/` serve OpenBot agents, not coding-agent process.

## Toolchain and commands

- Node.js 24, pnpm 10, TypeScript ESM, strict mode.
- Use repository-pinned tools through `pnpm`; do not install global substitutes.
- Do not hand-edit generated files under `packages/contracts/src/gen/`, `packages/control-service-proto/src/gen/`, or `apps/web/src/routeTree.gen.ts`.

```bash
pnpm install
pnpm dev
pnpm check
pnpm build
pnpm test
pnpm test:e2e
pnpm --filter @openbot/desktop package
```

Run focused package tests while iterating:

```bash
pnpm --filter @openbot/cli test
pnpm --filter @openbot/control-service test
pnpm --filter @openbot/db test
```

## Repository map

- `cli`: React Ink repository CLI, dev supervision, and provider deployment coordination.
- `apps/web`: React 19, Vite, TanStack Router, Connect clients.
- `apps/control-service`: Hono HTTP routes, ConnectRPC services, and the local control-service entrypoint.
- `apps/desktop`: Electron main/preload shell and packaged local server.
- `apps/computer-service`: capability-protected ConnectRPC service inside computers.
- `packages/control-service-proto`: browser/Electron control protobuf and generated Connect types.
- `packages/agent-provider-core`: internal agent, session, and message interfaces.
- `packages/agent-provider`: Tilde implementation of the agent provider interface.
- `packages/contracts`: legacy protocol package retained while the new UX and control API are designed.
- `configuration`: fork-owned Vercel AI SDK agent endpoints, runtime skills, sandbox seed, and provider plugins.
- `packages/db`: Drizzle over local SQLite or remote libSQL/Turso.
- `packages/runtime-provider-core`: shared build and phased deployment contracts and coordinator.
- `packages/control-service-provider`, `packages/agent-service-provider`: independent local and Vercel service artifacts and deployment.
- `packages/ui`: shared React UI and vendored Beautiful UI components.
- `server.ts`: portable root Hono entrypoint for Vercel.
- `scripts/`: non-interactive build helpers that do not belong to the operator CLI.
- `docs/adrs`: concise records of durable architecture, code, and product design decisions.
- `tilde.state.yaml`: portable Tilde ChatKit resources; never a secret store.

## Architecture rules

### API and contracts

- Prefer ConnectRPC for authenticated control-plane operations.
- Keep Hono routes for protocol-native HTTP surfaces: setup unlock, ChatKit compatibility, signed Tilde callbacks/tools, and health.
- Edit `packages/control-service-proto/proto/openbot/control/v1/control.proto` for control RPCs, then run `pnpm contracts:generate`. The legacy contracts package continues to own its computer protocol until that domain migrates.
- Keep handlers thin: validate input, authorize, call the owning provider/store, map to protobuf or HTTP response.
- Preserve Web-standard `Request`/`Response` behavior so the same server works locally and in Vercel Functions.
- Preserve raw request bodies and webhook verification on signed Tilde routes.

### Providers

- Define provider contracts in their domain `*-provider-core` package and implementations in the matching provider package. Do not expose internal provider interfaces over RPC by default.
- Pass `ProviderCallContext` through calls so cancellation, deadlines, request IDs, and idempotency remain available.
- Convert provider-specific failures to `ProviderError` at the adapter boundary.
- Keep provider selection in composition code, not UI branches.
- Add focused contract tests for each adapter change.

### Database

- The database stores OpenBot control state only: installation, onboarding, sandbox lease, deployment checkpoints, repository reconciliation mappings, and source-publication progress.
- Tilde remains authoritative for agents, sessions, messages, skills, tools, and memory.
- Secrets belong in `EnvProvider`, never database tables.
- Edit `packages/db/src/schema.ts` and append compatible statements in `packages/db/src/migrations.ts`.
- Migrations must be idempotent and work against local SQLite and remote libSQL/Turso.
- Run `pnpm --filter @openbot/db test` and `pnpm db:migrate` against an isolated database URL when schema changes.

### Web and desktop

- Keep server state behind Connect clients and TanStack Query; avoid duplicating control state in the renderer.
- Reuse `packages/ui`; keep direct Beautiful UI modifications documented in its provenance files.
- Electron renderer must not gain direct Node.js access. Keep privileged work in main/preload with a narrow bridge.
- Preserve same-origin proxying between packaged web assets and the local control server.

### Tilde and AI runtime

- Use the canonical Tilde skill and `https://trytilde.ai/llms.txt` for current Tilde behavior.
- Keep ChatKit webhook verification, history conversion, streaming, and credentials server-side.
- Keep `tilde.state.yaml` portable and variable-driven.
- Do not guess Tilde identifiers or expose one-time API/webhook keys.
- The agent loop uses Vercel AI SDK. Verify current SDK signatures before changing them.

### Sandboxes

- Linux with KVM and Apple Silicon use Microsandbox by default; Intel macOS or explicit remote mode uses Vercel Sandbox.
- Never copy control-plane credentials into a sandbox.
- Preserve capability checks in `apps/computer-service` and provider implementations.
- Treat browser profiles, screenshots, and sandbox files as sensitive user data.

## Local development

`pnpm dev` delegates to `openbot dev`, loads `.env.local`, generates contracts, and starts the watched Hono app, web app, and Electron when available.

- Default web URL: `http://127.0.0.1:4173`.
- Default control server: `http://127.0.0.1:4100`.
- Use `OPENBOT_NO_DESKTOP=1` for headless work.
- Use `OPENBOT_SANDBOX_PROVIDER=vercel-sandbox` when local KVM is unavailable and remote credentials are configured.
- Do not expose generated setup codes or files under `.data/`.

## Security

- Never print, commit, or paste `.env.local`, `.openbot-deploy/`, setup codes, API keys, webhook keys, database tokens, or browser session data.
- Keep tracked environment files as sanitized examples only.
- Validate paths and capabilities before file, process, or desktop operations.
- Ask before destructive actions, external publication, paid changes, production deployment, or resource deletion.

## Validation

Use the narrowest useful check first, then broaden by risk:

1. Focused package test.
2. `pnpm check`.
3. `pnpm build`.
4. `pnpm test:e2e` for changed browser workflows.
5. Desktop packaging for Electron changes.

For browser-visible changes, verify the real route, console, network, and visible state. Store ad hoc artifacts outside the repository. Do not commit Playwright output, screenshots, videos, traces, HAR files, `.data/`, `.vercel/`, or deployment state.

## Deployment and delivery

- Production deployment uses `pnpm deploy:prod -- --dry-run --json`, then `pnpm deploy:prod -- --yes` only when explicitly requested.
- The deploy script coordinates Vercel, Turso, Tilde state, encrypted environment, Sandbox snapshot, and smoke tests. Do not replace it with a raw production deploy.
- Commit, push, open a PR, merge, or deploy only when requested.
- Before creating or updating a PR, always review the full diff for major architecture, strongly opinionated code, or durable code/product design decisions. If found, pause and prompt the user through an ADR under `docs/adrs/`; do not silently invent or skip the decision.
- Keep ADRs concise. Start with caveman-style `In brief` bullets and add a small Mermaid diagram when it clarifies a real relationship or flow.
- Before handoff, review the diff for secrets, generated noise, unrelated changes, and the exact checks run.

## Relevant skills

- `pre-commit-checks`: validation before commit or handoff.
- `create-pr`: commit, push, and draft PR workflow.
- `add-changeset`, `setup-changesets`: unified workspace version notes and release automation.
- `add-api-endpoint`: Hono or ConnectRPC endpoint changes.
- `add-db-changes`: Drizzle/libSQL schema and migrations.
- `e2e-debug-and-qa`: running browser evidence.
- `diagnose`: evidence-led debugging.
- `vercel`, `tilde`, `turso-cloud`: platform-specific work.
- `safe-refactor`, `surgical-patch`, `migration`, `lean-build`, `verify-and-stop`: scope-specific engineering workflows.
