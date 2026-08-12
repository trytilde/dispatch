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

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ftrytilde%2Fopenbot&project-name=openbot&repository-name=openbot)

```bash
pnpm deploy:prod -- --dry-run --json
pnpm deploy:prod -- --yes
```

The production workflow validates and builds the monorepo, deploys the static frontend and bare Hono API, then verifies `/healthz`.

## Current application boundary

- `apps/web` owns the UX shell and frontend routes.
- `apps/server` owns a bare Hono server, `/healthz`, and ConnectRPC federation under `/rpc`.
- `packages/control-service-proto` is the future owner-facing API contract and is intentionally empty.
- Domain packages remain available but are not wired into the application yet.

```bash
pnpm check
pnpm build
pnpm test:e2e
```

OpenBot is MIT licensed. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [PROVENANCE.md](PROVENANCE.md).
