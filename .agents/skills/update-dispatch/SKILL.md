---
name: update-dispatch
description: Update a fork from the Dispatch upstream repository while preserving fork-owned configuration. Use for upstream syncs, conflict resolution, and compatibility migrations.
---

# Update Dispatch

1. Inspect remotes, branch status, and uncommitted changes. Do not overwrite fork work.
2. Fetch the configured upstream and merge or rebase in a dedicated branch according to the repository convention.
3. Treat `configuration/index.ts` and the complete `configuration/` tree as fork-owned. Resolve conflicts by preserving their intent while adopting updated interfaces.
4. Do not copy upstream secrets or generated deployment state.
5. Regenerate the repository manifest and contracts, then run `pnpm tilde check`, `pnpm check`, and `pnpm build`.
6. Summarize upstream changes, fork conflict decisions, and any required configuration migration.
