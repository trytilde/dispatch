---
name: caveman-stats
description: Show measured Caveman token usage and estimated savings only when the active runtime provides the Caveman mode-tracker and stats hooks. Use for `/caveman-stats`; never invent or model-estimate missing measurements.
---

# Caveman Stats

This skill depends on external `caveman-mode-tracker` and `caveman-stats` hooks. They are not included in this repository's copied skill folder.

When invoked:

1. Use hook-provided output when the active runtime exposes it.
2. Report the measured token totals, estimated rule overhead, and net savings exactly as returned.
3. If hooks or session logs are unavailable, say measurement is unavailable. Do not estimate from conversation length or model output.
4. Distinguish gross savings from net savings after rule overhead.
