# Agents

Each `configuration/agents/<id>.ts` is a Web-standard route module that exports `POST(request)`. Build the handler with Tilde `chatKitEndpoint` and return a Vercel AI SDK response, matching the official TryTilde examples. The filename is the agent ID; optional `displayName`, `description`, and `registration` exports provide reconciliation metadata without wrapping execution in an OpenBot SDK. OpenBot mounts every discovered module at the configured `/api/agents/<id>` prefix.

Create and edit these modules as ordinary source files in the fork. OpenBot does not generate TypeScript, expose a runtime agent-creation API, or publish source-code changes. Deployment reconciliation creates or updates the corresponding Tilde agent and stores its endpoint credentials in `EnvProvider`.

Reconciliation is idempotent and lease-protected. Deleting a file marks its registration orphaned. Only `vp run openbot sync --prune --yes` disables removed remote agents.
