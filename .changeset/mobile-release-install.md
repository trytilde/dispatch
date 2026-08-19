---
"@tryopenbot/mobile": minor
---

Add `openbot mobile release install`, which puts a finished EAS build on a running emulator or a connected device through `eas build:run`, and give the `preview` profile `android.buildType: "apk"` so an internal Android build installs directly. A production Android build stays an AAB for Play, which cannot be installed on a device, so testing the app previously meant waiting on Play account verification and a first manual console upload.
