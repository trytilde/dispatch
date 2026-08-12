---
name: vercel
description: Deploy, configure, inspect, or troubleshoot OpenBot on Vercel, including Vercel Functions, project environment variables, Turso Marketplace provisioning, and Vercel Sandbox snapshots. Use for preview or production deployments, Vercel configuration changes, deployment failures, environment setup, or changes involving vercel.json, cli/src/deploy.ts, server.ts, or packages/providers/src/vercel-sandbox.ts.
---

# Operate OpenBot on Vercel

Use OpenBot's coordinated deployment workflow. It owns the coupled Vercel, Turso, Tilde, environment, and Sandbox setup that a generic `vercel deploy` cannot reproduce.

## Inspect before acting

1. Read `README.md` under **Deploy to Vercel**, `vercel.json`, `package.json`, and the relevant section of `cli/src/deploy.ts`.
2. Check `git status --short --branch` and whether `.vercel/project.json` exists. Read linked-project metadata only when needed; do not edit `.vercel/` by hand.
3. Read the installed CLI and SDK versions from `package.json`. Consult the current official Vercel docs before changing an API or configuration shape; do not rely on remembered signatures.
4. Never print, grep into chat, or pass secrets on the command line. Treat `.env.local`, `.openbot-deploy/secrets.enc.env`, Vercel tokens, Tilde credentials, database tokens, and setup codes as secret material.

## Deploy

Default to a preview unless the user explicitly requests production. A deployment is an external write: do not deploy merely to diagnose or review.

### Production

1. Validate the intended diff with `pnpm check` and `pnpm build`; run focused or end-to-end tests proportional to the change.
2. Preview the orchestrated operation with:

   ```bash
   pnpm deploy:prod -- --dry-run --json
   ```

3. When production deployment is explicitly authorized, run:

   ```bash
   pnpm deploy:prod -- --yes
   ```

4. Resume an interrupted deployment with `pnpm deploy:prod -- --yes --resume`; do not restart provisioning blindly.
5. Require the script's health, Tilde ChatKit, Sandbox exec, Cua, and noVNC smoke checks to pass. Report the production origin and redacted resource identifiers only.

The production script creates or reuses the Vercel project, provisions Turso through Marketplace, configures encrypted project variables, deploys the app, imports `tilde.state.yaml`, builds a reusable Sandbox snapshot, and performs the smoke checks. Preserve that ordering.

### Preview

Use the repository-pinned CLI:

```bash
pnpm exec vercel deploy --yes
```

Use the linked project and explicit team scope already established for the checkout. Do not import production Tilde state or overwrite production environment variables for a preview. Inspect the resulting deployment and verify the changed user flow when credentials and authorization permit.

## Preserve OpenBot's Vercel contract

- Keep `api/index.ts` as the Web-standard Function entrypoint and preserve raw request bodies for ConnectRPC and signed Tilde webhooks.
- Keep `/api/*`, `/rpc/*`, `/healthz`, and SPA rewrites aligned with `apps/server` and `apps/web`.
- Keep provider secrets in the control-plane environment provider; never copy them into a Sandbox.
- Keep generated setup codes, deployment state, and decrypted temporary files ignored and mode-restricted.
- Before changing `@vercel/sandbox`, read the current SDK reference and inspect `packages/providers/src/vercel-sandbox.ts` plus `cli/src/deploy.ts`. Export required artifacts before stopping an ephemeral sandbox.
- Treat Marketplace provisioning, environment changes, production promotion, rollback, and resource deletion as external mutations. Obtain the authority required by the user's request and verify the exact target first.

## Diagnose with evidence

Trace the complete boundary: browser or client request -> Vercel rewrite -> `api/index.ts` -> server route -> provider -> persisted state or external service -> response. Check build output, deployment status/logs, environment-variable names (never values), and the actual deployed route. Do not infer production health from a successful local build.

## Current references

- Vercel agent resources: https://vercel.com/docs/agent-resources
- Project configuration: https://vercel.com/docs/project-configuration
- Functions: https://vercel.com/docs/functions
- Environment variables: https://vercel.com/docs/environment-variables
- Vercel Sandbox: https://vercel.com/docs/vercel-sandbox
