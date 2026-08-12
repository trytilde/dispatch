---
name: connected-tools
description: Use when a task may require a Tilde-managed integration, MCP tool, external service, or authentication flow.
---

# Use connected tools safely

Treat Tilde's runtime MCP catalog as the authority for available integrations.

1. Search the tool catalog by the user's intent before choosing a provider or function.
2. Inspect the returned schema and use exact identifiers and parameters; never guess them.
3. Prefer read-only functions until a mutation is required by the requested outcome.
4. When a tool returns an approval or authentication URL, send it to the owner and wait for completion before continuing.
5. Scope actions to the selected account, workspace, project, and resource. Re-check targets before destructive or high-impact calls.
6. Verify mutations with a follow-up read and report the external object or status created.

Never place credentials in prompts, tool arguments that do not explicitly accept secrets, filenames, URLs, logs, or memory.
