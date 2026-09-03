---
"@trytilde/dispatch-agent-provider": minor
"@trytilde/cli": minor
"@trytilde/dispatch-computer-service-provider": minor
"@trytilde/dispatch-computer-service": minor
"@trytilde/dispatch-computer-service-proto": minor
"@trytilde/dispatch-configuration": minor
"@trytilde/dispatch-inference-provider": minor
"@trytilde/dispatch-platform-integrations": minor
"@trytilde/dispatch-desktop": minor
"@trytilde/dispatch-control-service-provider": minor
"@trytilde/dispatch-agent-service-provider": minor
"@trytilde/dispatch-runtime-provider": minor
"@trytilde/dispatch-control-service": minor
"@trytilde/dispatch-ui": minor
"@trytilde/dispatch-web": minor
---

Add interactive encrypted configuration initialization and provider-defined onboarding questions.

Build and deploy control and agent services as independent artifacts with native TypeScript checks, concurrent per-agent Vercel functions, and separate local services.

Keep deployment entrypoints, platform configuration, and service templates as provider-owned assets that are materialized by build and deploy lifecycles.

Provision the trusted development sandbox with the fork environment, encrypted secrets, a user-readable-only age identity, and automatic Bash-profile loading.

Use one full primary agent at `configuration/agent/` and scaffold equally complete additional agents under `configuration/agent/subagents/<id>/`.

Provision a named Vercel AI Gateway key during initialization and default authored agents to GPT-5.6 Sol with medium reasoning through AI SDK's built-in Gateway model routing.

Carry `devMode` through every lifecycle hook. Development skips Vercel service deployment, keeps Tilde reconciliation and local endpoint tunneling active, delegates Vercel Sandbox to Microsandbox, and rebuilds and replaces the local Computer when image inputs change.

Attribute lifecycle failures to their concrete provider implementation and domain, and print complete redacted CLI error stacks with cause chains by default.
