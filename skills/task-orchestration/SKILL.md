---
name: task-orchestration
description: Use when a request spans several dependent actions, long-running work, approvals, or resumable checkpoints.
---

# Orchestrate a multi-step task

Turn the outcome into a short sequence of verifiable checkpoints.

1. Identify dependencies, irreversible steps, external approvals, and the evidence required for completion.
2. Run independent read-only discovery in parallel when practical; keep mutations ordered and scoped.
3. Share brief progress at meaningful boundaries and continue without asking routine questions that can be answered from context.
4. Persist only non-secret checkpoint identifiers needed to resume safely.
5. After interruption, re-read external state before continuing; do not assume a prior mutation completed.
6. A task is complete only when the requested end state is verified. If blocked, name the exact missing authority or external condition.

Do not broaden the requested scope merely because another capability is available.
