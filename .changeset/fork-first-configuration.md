---
"@trytilde/dispatch-configuration": minor
"@trytilde/dispatch-desktop": minor
"@trytilde/dispatch-control-service": minor
"@trytilde/dispatch-ui": minor
"@trytilde/dispatch-web": minor
"@trytilde/cli": minor
"@trytilde/dispatch-agent-service-provider": minor
"@trytilde/dispatch-computer-service-provider": minor
"@trytilde/dispatch-computer-service": minor
"@trytilde/dispatch-computer-service-proto": minor
---

Add one fork-owned `configuration/` tree for directly authored Vercel AI SDK-compatible agent endpoints, agent-scoped skills and workspace seeds, and provider integrations, with an interactive terminal CLI for setup and operation. Concrete implementations are grouped under `Configuration({ providers: { ... } })`; repository resources use canonical file locations instead of configurable paths. Dispatch discovers committed agent modules without generating or publishing TypeScript at runtime.
