---
"@tryopenbot/agent-provider": minor
"openbot": minor
"@tryopenbot/computer-provider": minor
"@tryopenbot/computer-service": minor
"@tryopenbot/computer-service-proto": minor
"@tryopenbot/configuration": minor
"@tryopenbot/inference-provider": minor
"@tryopenbot/platform-integrations": minor
"@tryopenbot/control-service-proto": minor
"@tryopenbot/desktop": minor
"@tryopenbot/control-service-provider": minor
"@tryopenbot/agent-service-provider": minor
"@tryopenbot/runtime-provider": minor
"@tryopenbot/control-service": minor
"@tryopenbot/skills-provider": minor
"@tryopenbot/tools-provider": minor
"@tryopenbot/ui": minor
"@tryopenbot/web": minor
---

Add interactive encrypted configuration initialization and provider-defined onboarding questions.

Build and deploy control and agent services as independent artifacts with native TypeScript checks, concurrent per-agent Vercel functions, and separate local services.

Keep deployment entrypoints, platform configuration, and service templates as provider-owned assets that are materialized by build and deploy lifecycles.

Provision the trusted development sandbox with the fork environment, encrypted secrets, a user-readable-only age identity, and automatic Bash-profile loading.

Use one full primary agent at `configuration/agent/` and scaffold equally complete additional agents under `configuration/agent/subagents/<id>/`.

Provision a named Vercel AI Gateway key during initialization and default authored agents to GPT-5.6 Sol with medium reasoning through AI SDK's built-in Gateway model routing.
