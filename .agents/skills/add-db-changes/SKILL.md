---
name: add-db-changes
description: Add or alter OpenBot's Drizzle schema, SQLite-compatible migration statements, libSQL/Turso persistence code, and migration tests without moving Tilde-owned data or secrets into the control database.
metadata:
  author: openbot
  version: "1.0.0"
  argument-hint: <change-summary>
---

# Database Schema And Query Changes

OpenBot uses Drizzle over local SQLite or remote libSQL/Turso. The database stores installation, onboarding, sandbox lease, and deployment checkpoint state only. Tilde owns agents, chats, tools, skills, and memory. `EnvProvider` owns secrets.

The source of truth is:

```text
packages/db/src/schema.ts
packages/db/src/migrations.ts
packages/db/src/client.ts
packages/db/src/migrations.test.ts
```

## Process

1. Update the Drizzle schema in `schema.ts`.
2. Append an idempotent migration statement or guarded compatibility step in `migrations.ts`.
3. Preserve existing installations. Never silently drop user data unless the requested migration explicitly requires it and rollback/recovery is understood.
4. Keep SQL compatible with SQLite and libSQL/Turso. Do not add Postgres-only syntax.
5. Update store code in `apps/control-service/src/store.ts` or deployment checkpoint code only when ownership requires it.
6. Add a migration test covering a fresh database, repeated migration, and the prior schema shape affected by the change.
7. Run focused database and server tests.

## SQLite And libSQL Rules

- Use Drizzle column builders from `drizzle-orm/sqlite-core`.
- Store timestamps consistently with existing integer timestamp columns.
- Keep migration execution ordered and idempotent.
- Use a local temporary database for tests; never point migration tests at shared Turso or production data.
- Do not add agent records, chat history, provider credentials, API keys, webhook keys, or browser data to this database.
- Keep `DATABASE_AUTH_TOKEN` and `TURSO_AUTH_TOKEN` in environment providers, never rows or migration output.

## Tests

```bash
pnpm --filter @openbot/db test
pnpm --filter @openbot/control-service test
pnpm check
```

Use an isolated `DATABASE_URL=file:...` when manually running `pnpm db:migrate`.

## Checklist

- [ ] Drizzle schema and migration statements agree.
- [ ] Fresh and upgrade paths are tested.
- [ ] Re-running migration is safe.
- [ ] SQL works for SQLite and libSQL/Turso.
- [ ] Control-plane ownership remains narrow.
- [ ] No secrets or Tilde-owned domain data added.
- [ ] Focused tests and `pnpm check` pass.
