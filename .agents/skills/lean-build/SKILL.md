---
name: lean-build
description: Build feature work with high overbuilding risk. Use for new behavior, product slices, or integrations where repository reuse, strict scope, and an explicit stop condition matter.
---

# Lean build

OpenBot's provider and ownership boundaries remain mandatory. Turn the feature into the narrowest complete outcome that fits the existing system.

- Derive observable acceptance and explicit non-goals from request and repository.
- Trace entry point through layers owning invariants.
- Deliver coherent end-to-end path across responsible layers; never force work into one file, direct expression, or local patch.
- Reuse fitting seam. Refactor when patching duplicates behavior, weakens ownership, or hides root cause.
- Route every major UX surface and state interaction through `packages/client-runtime` contracts: network-crossing, persisted, multi-client, or cross-surface state. Extend the grouped contract before rendering against it. Component-local hover, focus, transition, menu, scroll, draft, and layout state stays in the component.
- Omit modes, providers, config, extensibility, and polish unless acceptance needs them.
- Add surface, dependency, service, config, or migration only for lifecycle design or acceptance; state material tradeoff.
- Keep work runnable; preserve authentication, secret, provider, database, and sandbox safety.

Exercise path. Run focused proof. Stop when acceptance passes. Report only material omissions and trigger.
