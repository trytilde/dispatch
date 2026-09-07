---
name: update-openapi-generated-client
description: Refresh the generated OpenAPI TypeScript types and validate the SDK surface after Tilde API changes.
---

# Update OpenAPI Generated Client

## Repository documentation requirements

Follow [docs/README.md](../../../docs/README.md) for every change in this workflow. Create or update
ADRs for resolved durable decisions, keep affected README/setup/public docs current,
and maintain the complete pending or PR-numbered update record after every revision.
Use the shared templates and section names. Missing or stale required documentation
blocks completion. Document already authorized decisions without asking again; ask
only about unresolved choices. These requirements govern documentation instructions
elsewhere in this skill; preserve its repository-specific implementation and checks.

Use this when `/root/tilde-api/openapi.cloud.json` or a worktree OpenAPI file changes.

## Process

1. Run `pnpm openbot sdk refresh`.
2. Run `pnpm openbot sdk validate`.
3. Inspect generated type diffs.
4. Do not manually edit generated files.
5. Update hand-authored wrappers only when operation names or schema shapes changed.
6. Run `pnpm check`.

## Rules

- Generated OpenAPI types stay internal.
- Do not document generated import paths.
- Public SDK names should remain concise: `createClient`, `createConfig`, `chatKitEndpoint`.
