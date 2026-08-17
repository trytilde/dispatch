---
"@tryopenbot/configuration": minor
"@tryopenbot/desktop": minor
"@tryopenbot/control-service": minor
"@tryopenbot/ui": minor
"@tryopenbot/web": minor
"openbot": minor
"@tryopenbot/agent-service-provider": minor
"@tryopenbot/computer-service-provider": minor
"@tryopenbot/computer-service": minor
"@tryopenbot/computer-service-proto": minor
---

Add one fork-owned `configuration/` tree for directly authored Vercel AI SDK-compatible agent endpoints, agent-scoped skills and workspace seeds, and provider integrations, with an interactive terminal CLI for setup and operation. Concrete implementations are grouped under `Configuration({ providers: { ... } })`; repository resources use canonical file locations instead of configurable paths. OpenBot discovers committed agent modules without generating or publishing TypeScript at runtime.
