---
"openbot": minor
"@tryopenbot/desktop": minor
---

Add `openbot desktop release` and manually triggered release workflows for the desktop and Expo apps. Desktop artifacts publish to the shared updates bucket under a fork-guarded prefix with a `version.json` update manifest, and macOS builds are signed and notarized when credentials are present.
