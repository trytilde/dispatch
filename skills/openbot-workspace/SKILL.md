---
name: openbot-workspace
description: Use when a task needs the OpenBot computer, terminal, files, screenshots, or desktop applications.
---

# Work in the OpenBot workspace

Use the active OpenBot computer as a bounded execution environment.

1. Inspect the current state before changing it. Use file reads and focused listings before broad searches.
2. Prefer command and file tools for precise work. Use the visual desktop only when the application has no reliable programmatic surface.
3. Keep commands scoped to explicit paths. Preserve unrelated files and running processes.
4. Explain consequential desktop or external actions before taking them. Ask before destructive changes, purchases, account changes, or publishing.
5. Verify the result in the same surface the owner will use: file contents, command output, screenshot, or application state.

Never expose control-plane credentials to the workspace. If a capability is unavailable, report that directly instead of simulating success.
