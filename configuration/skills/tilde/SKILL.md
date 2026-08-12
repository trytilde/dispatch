---
name: tilde
description: Build and operate agents with Tilde tools, ChatKit, memory, skills, secure browser sessions, Dev Tunnels, and organisation controls. Use when connecting an agent to Tilde or configuring Tilde resources.
---

# Use Tilde

Read the canonical context at `https://trytilde.ai/llms.txt` before changing
Tilde resources. Use the Global MCP server at `https://api.trytilde.ai/mcp` for
configuration and the Harness SDK for application-side ChatKit, tools, memory,
and skill access.

1. Call `tilde_whoami` before workspace-scoped work and use its `team_id`.
2. Discover provider, credential-source, and tool identifiers; never guess them.
3. Keep API keys, signing keys, OAuth credentials, claim tokens, and PINs out of
   source, logs, chat history, and portable state.
4. Treat `tilde.state.yaml` as portable configuration, not a secret store.
5. Verify signed webhooks server-side and prefer OAuth when acting for a human.
6. Use a runtime MCP server for model-visible tools and a skill registry for
   progressive skill discovery.

References:

- `https://trytilde.ai/docs/chatkit`
- `https://trytilde.ai/docs/skills`
- `https://trytilde.ai/docs/dev-tunnels`
- `https://api.trytilde.ai/openapi.json`
