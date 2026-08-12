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

The CLI validates once and coordinates deployment providers through `prepare`, `configure`, and `release` phases. The Vercel runtime provider prepares a stable project origin and deploys the control service plus web UI once during release. Future Tilde deployment participates in the same command between those phases; it does not require a second operator command or a Vercel redeploy.

The production build stages the web app in `public/` for Vercel's static CDN and deploys the bare Hono server for `/healthz` and `/rpc`.

## Current application boundary

- `cli` owns the React Ink repository CLI, development process supervision, and provider deployment coordination.
- `packages/runtime-provider-core` owns the optional provider deployment contract and phased coordinator.
- `packages/runtime-provider` owns runtime implementations; Vercel deploys the control service and web UI.
- `apps/web` owns the UX shell and frontend routes.
- `apps/server` owns the portable Hono application, built web UI fallback, `/healthz`, and ConnectRPC federation under `/rpc`; it does not bind a port.
- `packages/control-service-proto` is the future owner-facing API contract and is intentionally empty.
- Domain packages remain available but are not wired into the application yet.

```bash
pnpm check
pnpm build
pnpm test:e2e
```

OpenBot is MIT licensed. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [PROVENANCE.md](PROVENANCE.md).
