---
"@tryopenbot/agent-provider": minor
"@tryopenbot/agent-service-provider": minor
"openbot": minor
"@tryopenbot/computer-provider": minor
"@tryopenbot/computer-service": minor
"@tryopenbot/computer-service-proto": minor
"@tryopenbot/configuration": minor
"@tryopenbot/control-service-proto": minor
"@tryopenbot/desktop": minor
"@tryopenbot/utilities": minor
"@tryopenbot/inference-model-provider": minor
"@tryopenbot/control-service-provider": minor
"@tryopenbot/runtime-provider": minor
"@tryopenbot/control-service": minor
"@tryopenbot/skills-provider": minor
"@tryopenbot/tools-provider": minor
"@tryopenbot/ui": minor
"@tryopenbot/web": minor
"@tryopenbot/platform-integrations": minor
---

Represent shared Tilde and Vercel access as concrete platform implementations, centralize their common request and deployment helpers, initialize each once across its dependent providers, and allow init to revisit existing provider configuration with stored prompt defaults. Load fork-owned TypeScript configuration through the standalone CLI's TypeScript loader so generated `.js` specifiers resolve their `.ts` sources.
