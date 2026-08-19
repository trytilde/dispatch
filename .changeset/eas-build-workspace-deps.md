---
"@tryopenbot/mobile": patch
---

Build `@tryopenbot/client-runtime` during EAS builds through an `eas-build-post-install` hook. EAS runs its own install and calls `pnpm expo export:embed` directly rather than this repository's CLI, so the CLI's existing check could not protect it, and iOS bundling failed with `the package ... specifies a main module field that could not be resolved` for a package whose `dist` had never been built.
