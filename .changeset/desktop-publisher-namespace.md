---
"@tryopenbot/desktop": minor
"openbot": minor
---

Name the desktop identity for its publisher too: the Electron `appId` moves from `dev.openbot.desktop` to `ai.trytilde.openbot`, matching the mobile identifier, and resolves from the same `OPENBOT_APP_ID` a fork already sets for Expo. Done before the first signed release, after which the identifier is baked into every signed artifact.
