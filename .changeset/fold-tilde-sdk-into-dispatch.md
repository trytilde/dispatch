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
---

Move the Tilde TypeScript SDK into the Dispatch monorepo under the `@trytilde/sdk*` package names and add Tilde authentication, state, tunnel, plugin, and SDK workflows to `dispatch`.

Migration:
- Replace `@trytilde/harness-sdk*` imports with the corresponding `@trytilde/sdk*` package.
- Replace `@trytilde/harness-plugins` and coding-agent wrapper binaries with `tilde plugin`.
- Replace `tilde auth|state|tunnel` with `tilde auth|state|tunnel`.
