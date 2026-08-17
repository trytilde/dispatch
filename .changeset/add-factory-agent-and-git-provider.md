---
"@tryopenbot/git-provider": minor
"@tryopenbot/agent-provider": minor
"@tryopenbot/agent-service-provider": minor
"openbot": minor
"@tryopenbot/computer-provider": minor
"@tryopenbot/configuration": minor
"@tryopenbot/runtime-provider": minor
"@tryopenbot/ui": minor
"@tryopenbot/web": minor
---

Replace the Hello World primary agent with the Factory agent and give it an end-to-end build/test/deploy loop. A new `@tryopenbot/git-provider` brokers a GitHub App credential through Tilde and reconciles GitHub REST and git-over-HTTPS reverse-proxy profiles; the trusted development sandbox attaches its seeded source tree to the owner's fork through that proxy so the factory agent has an authenticated git client without holding a token. The factory agent's computer tools target the development sandbox, its skills cover creating, locally testing (Tilde local-runtime tunnel), and deploying agents, and the primary agent additionally receives the brokered GitHub toolkit on its MCP server. The web workspace adds a New Agent entry, a floating Build/Test tab navigation for subagents, and a Deploy action that appears while an agent still serves from the local tunnel and asks the factory agent to commit, push, open a pull request, and deploy.
