# OpenBot

OpenBot is an open-source, provider-oriented agent workspace. One web app hosts
the setup UI, control APIs, signed Tilde endpoints, chat, and sandbox control;
the same renderer is packaged for macOS and Linux with Electron.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ftrytilde%2Fopenbot&project-name=openbot&repository-name=openbot&env=OPENBOT_SETUP_CODE&envDescription=Use%20at%20least%2032%20random%20bytes.%20This%20code%20unlocks%20initial%20setup.&integration-ids=oac_axiehHAX1Zn7QiwRSzDD2j7J)

The Vercel flow requires the Turso Marketplace integration and asks for one
value: `OPENBOT_SETUP_CODE`. Generate it with `openssl rand -base64 32`. After
the deployment opens:

1. Enter that setup code.
2. Select **Deploy with Tilde** and apply the prepared state.
3. Paste the one-time Tilde deployment outputs, an OpenAI API key, and a
   project-scoped Vercel access token. OpenBot uses that token to manage its
   own encrypted project environment variables; it does not store provider
   secrets in Turso.
4. Complete the six short onboarding screens and name the Tilde-managed agent.

[![Deploy with Tilde](https://api.trytilde.ai/deploy-button.svg)](https://api.trytilde.ai/deploy?repository-url=https%3A%2F%2Fgithub.com%2Ftrytilde%2Fopenbot&state-path=tilde.state.yaml)

## Local development

Requirements are Node.js 24, pnpm 10, and either:

- Linux with readable/writable `/dev/kvm`; or
- Apple Silicon macOS.

No Docker, Docker Compose, local Turso daemon, global Tilde CLI, or standalone
Microsandbox daemon is needed.

```bash
pnpm install
pnpm dev
```

`pnpm dev` creates a local SQLite control database, encrypted local environment
store, and persistent setup code under `.data/`, generates contracts, builds the sandbox box host, and starts the
control server, Vite renderer, and Electron when a graphical session is
available. A Microsandbox VM is created only when the first computer starts.

Packaged Electron builds serve the bundled renderer on a random loopback port
and proxy control traffic to `OPENBOT_CONTROL_ORIGIN` (default
`http://127.0.0.1:4100`). This keeps setup cookies and streamed responses
same-origin without exposing Node.js to the renderer.

To connect production Tilde while developing, add `TILDE_API_KEY` (or
`TILDE_BEARER_TOKEN`), `TILDE_ORG_ID`, and `TILDE_TEAM_ID` to `.env.local`.
`pnpm dev` then runs through `tilde tunnel`, which manages the Cloudflare
connector and assigned local port. Without those values, Tilde is shown as
unconfigured.

Intel macOS uses remote Vercel Sandbox. A Linux host without KVM can explicitly
do the same for control/UI development by setting
`OPENBOT_SANDBOX_PROVIDER=vercel-sandbox`; the normal Linux path remains local
Microsandbox.

## Automated production deployment

Set these values in the shell, an uncommitted `.env.local`, or the default
SOPS-encrypted `.openbot-deploy/secrets.enc.env`:

```dotenv
VERCEL_TOKEN=
VERCEL_TEAM_ID=
VERCEL_PROJECT_NAME=openbot
TILDE_BEARER_TOKEN=
TILDE_ORG_ID=
TILDE_TEAM_ID=
OPENAI_API_KEY=
```

When the SOPS file exists, `deploy:prod` decrypts it in memory before checking
credentials. Explicit process environment variables take precedence. The
encrypted deployment bundle remains ignored because it is installation-specific
and should not be published with the open-source repository. Set
`OPENBOT_SOPS_FILE` to use a different encrypted file. For KMS-backed files,
`OPENBOT_SOPS_AWS_PROFILE` selects a named AWS profile and prevents stale
ambient AWS access-key variables from taking precedence.

Then run:

```bash
pnpm deploy:prod -- --dry-run --json
pnpm deploy:prod -- --yes
```

The real command creates or reuses a stable Vercel project, provisions the
Turso `starter` resource through Marketplace, normalizes its database
variables, pins Vercel builds to the repository's pnpm version through
Corepack, disables Vercel's request-body helpers so ConnectRPC and signed
webhooks receive the original byte stream, deploys the app, imports
`tilde.state.yaml`, configures encrypted
application environment, builds a reusable Vercel Sandbox desktop snapshot, and
runs real health, Tilde ChatKit, sandbox exec, Cua action, and noVNC smoke
checks. It can resume an interrupted run:

```bash
pnpm deploy:prod -- --yes --resume
```

Only redacted resource IDs and step state are stored in
`.openbot-deploy/state.json`. The generated setup code is stored separately at
`.openbot-deploy/setup-code`; both files are mode `0600` and ignored by Git.
Temporary Tilde and Vercel secret outputs are deleted after use.

## Architecture

- `apps/web`: React, Vite, TanStack Router, Connect Query-compatible clients.
- `apps/server`: Hono HTTP routes plus official Connect adapters: Node for the
  local server and Web-standard Fetch for Vercel Functions.
- `apps/desktop`: secure Electron main/preload shell for macOS and Linux.
- `apps/box-host`: capability-protected ConnectRPC control inside sandboxes.
- `packages/contracts`: protobuf contracts for setup, Tilde-managed agents and
  chat sessions, providers, the singleton sandbox, and box control.
- `packages/db`: control-plane-only Drizzle state using local SQLite or remote
  Turso through libSQL. It stores installation/onboarding state, the singleton
  sandbox lease, and deployment checkpoints—not agents, chats, or secrets.
- `packages/provider-sdk` and `packages/providers`: versioned provider contracts
  and Tilde Agent/Chat, environment, OpenAI, Microsandbox, and Vercel Sandbox
  implementations.
- `packages/ui`: directly incorporated Beautiful UI component source and the
  OpenBot composition layer.

Tilde ChatKit is authoritative for agents, sessions, and message history. The
control server's `/api/chat` compatibility endpoint and `ChatService` both
delegate to that provider; only the signed Tilde agent callback invokes the
Vercel AI SDK/OpenAI runtime.

### Prompt and capability runtime

System prompts are composed inside OpenBot; they are not stored in Tilde.
`PromptProvider` and `PromptPlugin` in `packages/provider-sdk` define the
pluggable interface. `OpenBotPromptProvider` assembles deterministic,
size-bounded sections for identity, operating policy, Tilde usage, skill
summaries, and turn context. Installations can add plugins without replacing
the base composer, and each result includes a SHA-256 fingerprint for tracing.
AI, tool, skill, memory, sandbox, and workspace providers implement
`injectSystemPrompt()`. The default composer invokes those hooks at stable
insertion points, so swapping a provider changes its instructions without
replacing or branching the base prompt.

Skills remain Tilde-owned. The ChatKit handler reads summary metadata from the
configured Tilde registry, while the model progressively discovers and loads
full skills through the `openbot-runtime` MCP server. Dynamic MCP servers expose
`SEARCH_TOOLS`, `GET_TOOL_SCHEMAS`, and `MULTI_EXECUTE_TOOL`; OpenBot passes
those live AI SDK tools to the model rather than embedding schemas in the
system prompt. A configured Tilde memory bank can use the same MCP boundary,
but no billed bank is provisioned by default.

Protocol-native exceptions are `/api/chat` (Tilde ChatKit compatibility),
`/api/tilde/chatkit`, `/api/tilde/tools/sandbox`, and `/healthz`. Control and box
interfaces use protobuf over Connect, retaining compatibility with future
gRPC-Web/non-TypeScript clients without claiming that every HTTP endpoint is
native gRPC.

Provider credentials stay in the control-plane `EnvProvider`. They are stored
in an AES-GCM encrypted local file during development and Vercel project
environment variables in production. They are never copied into the sandbox.
Browser cookies and site login state do live in the sandbox browser profile and
must be treated as sensitive. If the box later needs application data, it will
use a separate `@openbot/box-db` package and migration set; it must not import
the control database.

## Validation

```bash
pnpm check
pnpm build
pnpm test:e2e
pnpm --filter @openbot/desktop package
```

The desktop package command targets the current host: AppImage and `.deb` on
Linux, and DMG plus ZIP on macOS. The explicit `package:linux` and
`package:mac` commands are also available for platform CI.

OpenBot is MIT licensed. Direct third-party source and clean-room reference
boundaries are recorded in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)
and [PROVENANCE.md](./PROVENANCE.md).
