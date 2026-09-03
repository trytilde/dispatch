---
"@trytilde/dispatch-desktop": minor
"@trytilde/cli": minor
---

Name the desktop identity for its publisher too: the Electron `appId` moves from `dev.dispatch.desktop` to `ai.trytilde.dispatch`, matching the mobile identifier, and resolves from the same `DISPATCH_APP_ID` a fork already sets for Expo. Done before the first signed release, after which the identifier is baked into every signed artifact.
