---
"@trytilde/dispatch-agent-provider": minor
"@trytilde/dispatch-agent-service-provider": minor
"@trytilde/cli": minor
"@trytilde/dispatch-computer-service-provider": minor
"@trytilde/dispatch-computer-service": minor
"@trytilde/dispatch-computer-service-proto": minor
"@trytilde/dispatch-configuration": minor
"@trytilde/dispatch-desktop": minor
"@trytilde/dispatch-utilities": minor
"@trytilde/dispatch-control-service-provider": minor
"@trytilde/dispatch-runtime-provider": minor
"@trytilde/dispatch-control-service": minor
"@trytilde/dispatch-ui": minor
"@trytilde/dispatch-web": minor
"@trytilde/dispatch-platform-integrations": minor
---

Represent shared Tilde and Vercel access as concrete platform implementations, centralize their common request and deployment helpers, initialize each once across its dependent providers, and allow init to revisit existing provider configuration with stored prompt defaults. Load fork-owned TypeScript configuration through the standalone CLI's TypeScript loader so generated `.js` specifiers resolve their `.ts` sources.
