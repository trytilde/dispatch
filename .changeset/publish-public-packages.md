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
---

Publish all Dispatch workspace packages publicly with runnable JavaScript artifacts and declarations, and provide `dispatch` as an installable standalone CLI.

Refresh selected AWS profile credentials through AWS CLI before SOPS operations so IAM Identity Center sessions work during initialization and later secret access.

Support AI agents and automation with non-interactive initialization through stable JSON answers on stdin and machine-readable JSON results.

Migration:

- Replace the internal package name `@trytilde/dispatch-cli` with the public `dispatch` package.
- Invoke the installed CLI with `tilde <command>` or `npx @trytilde/cli <command>`.
