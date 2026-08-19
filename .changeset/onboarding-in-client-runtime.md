---
"@tryopenbot/client-runtime": minor
"@tryopenbot/web": patch
"@tryopenbot/ui": patch
---

Move onboarding state into `@tryopenbot/client-runtime`. Completion and the resulting agent description are persisted, survive reload, and decide whether a client shows first-run at all, so per ADR-0017 they are runtime state rather than renderer state. The runtime owns the contract, validation, and read/write, and the platform supplies key/value storage — `localStorage` on web, and the same interface accepts Expo SecureStore or the Electron bridge unchanged. `OnboardingResult` now has one definition, re-exported by `@tryopenbot/ui` so callers keep a single type.
