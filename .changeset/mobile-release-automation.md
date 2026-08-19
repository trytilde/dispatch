---
"@tryopenbot/mobile": minor
---

Automate mobile releases from a tag. Pushing `mobile-v*` builds both platforms on EAS and submits them through `.github/workflows/mobile-release.yml`, which runs `openbot check` first and then the same `openbot mobile release build` command a maintainer would run by hand, so CI and a human share one guard. A manual dispatch selects a single platform, the `preview` profile, or a build without submission. CI holds only `EXPO_TOKEN`; signing credentials and store API keys stay in EAS. Recorded in ADR-0027.
