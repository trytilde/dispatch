---
"@openbot/configuration": minor
"@openbot/desktop": minor
"@openbot/control-service": minor
"@openbot/ui": minor
"@openbot/web": minor
---

Add one fork-owned `configuration/` tree for directly authored Vercel AI SDK-compatible agent endpoints, runtime skills, sandbox setup, and provider integrations, with an interactive terminal CLI for setup and operation. Concrete implementations are grouped under `Configuration({ providers: { ... } })`; repository resources use canonical file locations instead of configurable paths. OpenBot discovers committed agent modules without generating or publishing TypeScript at runtime.
