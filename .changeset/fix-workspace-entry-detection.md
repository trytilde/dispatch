---
"@trytilde/cli": patch
---

Detect an unbuilt workspace dependency by its runtime export condition rather than the first one listed. A package whose `exports` map starts with `types` and `development` pointing at TypeScript source looked built even when its `dist` was missing, so `tilde mobile expo` skipped the build and Metro failed with `While trying to resolve module @trytilde/dispatch-client-runtime ... specifies a main module field that could not be resolved`.
