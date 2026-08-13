---
name: pre-commit-checks
description: Run OpenBot's TypeScript, protobuf, Vitest, build, browser, database, and desktop checks before committing, pushing, opening a PR, or handing off work. Use risk-based focused checks first, then repository gates.
---

# Pre-Commit Checks

Use repository-pinned Node.js 24 and pnpm 10 tooling. Start narrow, then run the gates required by the changed surface.

## First Guard

Inspect the worktree and secret-bearing paths before broad checks:

```bash
git status --short --branch
git diff -- .env .env.* '*.env' '*.local'
git check-ignore -v .env.local .data .vercel .openbot-deploy
```

Never stage credentials, setup codes, browser profiles, local databases, Vercel metadata, decrypted deployment files, or test artifacts.

## Required Gates

For non-trivial code changes:

```bash
pnpm check
pnpm build
```

`pnpm check` regenerates protobuf contracts, type-checks scripts and packages, and runs package lint/test tasks plus deployment-script tests. Run focused tests first while iterating:

```bash
pnpm --filter @openbot/control-service test
pnpm --filter @openbot/providers test
pnpm --filter @openbot/db test
pnpm --filter @openbot/desktop test
```

Run `pnpm test:e2e` when browser behavior changed or the user requested end-to-end proof. Run `pnpm --filter @openbot/desktop package` when packaging, preload, Electron startup, or bundled-resource behavior changed.

## TypeScript Fix Policy

Fix strict TypeScript failures at the owning seam. Do not hide them with broad `any`, unchecked double casts, disabled compiler options, or copied provider response types.

Prefer:

- schema validation for untyped external payloads
- exhaustive unions for provider states and errors
- shared contracts in the owning `*-provider-core` package or protobuf
- request cancellation through `AbortSignal`
- focused compatibility adapters at external boundaries

Avoid unrelated formatting or dependency churn; no repository-wide formatter is configured.

## Generated Files

After protobuf changes:

```bash
pnpm contracts:generate
git diff -- packages/contracts/proto packages/contracts/src/gen
```

Edit the `.proto` source, never generated TypeScript. Do not commit `apps/web/src/routeTree.gen.ts` unless the project intentionally begins tracking it.

## Database Changes

Follow `add-db-changes`. At minimum:

```bash
pnpm --filter @openbot/db test
pnpm --filter @openbot/control-service test
```

Use an isolated local database for manual migration checks. Never test migrations against shared Turso production data.

## Release Notes

OpenBot uses Changesets with one fixed group for every workspace package. Follow `add-changeset` for owner-visible behavior or package API changes. Do not edit versions or changelogs directly. Documentation-only, test-only, CI-only, and internal refactors need no placeholder changeset.

## Fix Before Commit

- Required focused tests pass.
- `pnpm check` and `pnpm build` pass for non-trivial code changes.
- E2E or desktop packaging was run when relevant, or the handoff names what was not run.
- Generated contracts match protobuf sources.
- Diff contains no secrets, local state, generated noise, or unrelated edits.
- A valid changeset is present when release impact requires one, or the handoff explains why none is needed.
