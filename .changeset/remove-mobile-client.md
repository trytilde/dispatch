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
---

Remove the paused Expo mobile client, Android/iOS tooling, EAS publication workflow, and `tilde mobile` command group from main. The complete implementation remains preserved on the `codex/mobile-archive` DO NOT MERGE branch.

Migration:
- Stop invoking `tilde mobile`, mobile root scripts, Metro/adb tunnels, or `mobile-v*` releases.
- Use the web workspace or Electron desktop client while the product foundation is stabilized.
