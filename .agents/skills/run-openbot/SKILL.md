---
name: run-openbot
description: Set up, validate, run, or diagnose an OpenBot fork locally or on Vercel. Use for first-run setup, provider checks, local startup, production deployment, and reconciliation failures.
---

# Run OpenBot

1. Require Node 24 and pnpm 10, then run `pnpm install` and `pnpm openbot setup`.
2. Run `pnpm openbot doctor`; report missing provider credentials without printing values.
3. Use `pnpm openbot dev` locally. A public Tilde tunnel origin enables agent registration; without it reconciliation is safely skipped.
4. Use `pnpm openbot deploy --yes` for production. Deployment validates, deploys, reconciles skills and agents under a database lease, then runs smoke tests.
5. Use `pnpm openbot sync` for an explicit reconciliation. Only use `--prune --yes` when removed remote agents should be disabled.
6. Keep control-plane credentials out of sandboxes. Only declared `OPENBOT_SANDBOX_SECRET_<NAME>` values may be injected.
