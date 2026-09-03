---
"@trytilde/dispatch-agent-provider": minor
"@trytilde/dispatch-agent-service-provider": minor
"@trytilde/dispatch-auth-provider": minor
"@trytilde/cli": minor
"@trytilde/dispatch-computer-service-provider": minor
"@trytilde/dispatch-client-runtime": minor
"@trytilde/dispatch-computer-tools": minor
"@trytilde/dispatch-computer-service": minor
"@trytilde/dispatch-computer-service-proto": minor
"@trytilde/dispatch-configuration": minor
"@trytilde/dispatch-desktop": minor
"@trytilde/dispatch-utilities": minor
"@trytilde/dispatch-platform-integrations": minor
"@trytilde/dispatch-control-service-provider": minor
"@trytilde/dispatch-runtime-provider": minor
"@trytilde/dispatch-control-service": minor
"@trytilde/dispatch-ui": minor
"@trytilde/dispatch-web": minor
"@trytilde/dispatch-git-provider": minor
"@trytilde/api-client": minor
"@trytilde/sdk": minor
"@trytilde/sdk-vercel-ai-node": minor
---

Rename the product to Dispatch, publish its packages under `@trytilde/dispatch-*`, and replace the product-named CLI with `@trytilde/cli` and the `tilde` executable.

Migration:
- Replace previous product-package imports and dependencies with their matching `@trytilde/dispatch-*` names.
- Install `@trytilde/cli` and invoke commands through `tilde`.
- Adopt the `DISPATCH_*` environment namespace and `.dispatch` state paths.
