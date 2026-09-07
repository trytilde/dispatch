---
name: expose-api-change
description: Self-refresh loop for exposing intentional Tilde API changes through the SDK.
---

# Expose API Change

## Repository documentation requirements

Follow [docs/README.md](../../../docs/README.md) for every change in this workflow. Create or update
ADRs for resolved durable decisions, keep affected README/setup/public docs current,
and maintain the complete pending or PR-numbered update record after every revision.
Use the shared templates and section names. Missing or stale required documentation
blocks completion. Document already authorized decisions without asking again; ask
only about unresolved choices. These requirements govern documentation instructions
elsewhere in this skill; preserve its repository-specific implementation and checks.

## Process

1. Run `pnpm openbot sdk refresh`.
2. Inspect OpenAPI operation and schema diffs.
3. Confirm every Tilde-owned value is an explicit schema field. Do not accept
   message/session metadata as a substitute for typed identity, audience,
   routing, execution, memory, model, budget, retry, or lifecycle context.
4. Decide whether each changed operation belongs in the public SDK.
5. For supported changes, use `add-sdk-wrapper`.
6. Do not expose raw generated OpenAPI paths as the public SDK.
7. Run `pnpm check`.
8. Summarize public API changes and migration notes.

## Defaults

- Prefer small, stable wrappers over broad generated clients.
- Use camelCase in TypeScript APIs.
- Preserve existing public names unless the user explicitly asks for a breaking change.
- When the upstream API lacks a typed core field, fix the upstream contract;
  do not add a hand-authored metadata parser in OpenBot.
