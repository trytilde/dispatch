# Agents

Each `agents/<id>.ts` default-exports `defineAgent(...)`; its ID must match the filename. The module owns its system prompt additions, model call, tools, response, Tilde registration options, and skill selection. OpenBot mounts every discovered module at the configured `/api/agents/<id>` prefix.

```bash
pnpm openbot agent create --id analyst --name "Analyst"
```

Review and commit the generated file. For creation from a running installation, use `--publish` or `POST /api/agent-publications`: the source-control provider creates a branch and pull request. Merge triggers the normal Vercel deployment; deployment reconciliation creates or updates the Tilde agent and stores its endpoint credentials in `EnvProvider`.

Reconciliation is idempotent and lease-protected. Deleting a file marks its registration orphaned. Only `pnpm openbot sync --prune --yes` disables removed remote agents.
