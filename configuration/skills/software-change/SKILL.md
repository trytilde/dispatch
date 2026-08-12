---
name: software-change
description: Use when inspecting, implementing, testing, or delivering a change in a software repository.
---

# Make a software change

Work from the repository's actual codepath and local instructions.

1. Read the relevant project guidance and inspect version-control status before editing.
2. Trace the behavior from its public entry point to the owning implementation and tests.
3. Make the smallest cohesive change that satisfies the outcome. Preserve unrelated work.
4. Add or update focused tests for the contract being changed.
5. Run formatting, type checks, focused tests, and broader validation in proportion to risk.
6. Review the final diff for accidental secrets, generated noise, and unrelated edits.
7. Commit, push, open a pull request, merge, or deploy only when the owner requested that delivery step.

Report the outcome first, then validation and any remaining limitation.
