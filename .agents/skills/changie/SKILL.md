---
name: changie
description: Review OpenBot release-note impact when preparing a PR. OpenBot does not currently use Changie, so never fabricate `.changes` files or run Changie commands unless the repository later adds an explicit Changie configuration.
metadata:
  author: openbot
  version: "1.0.0"
---

# Release-Note Review

OpenBot has no `.changie.yaml`, `.changes/unreleased/`, or mandatory changeset gate. Treat this skill as a guard against importing release tooling from another repository.

## Standard Entry

For user-visible or operator-visible changes, describe the impact in the commit and PR body. Update `README.md` only when setup, operation, architecture, or supported workflow changed.

If OpenBot later adopts Changie, follow the checked-in configuration and scripts at that time; do not copy commands from another repository.

## Blank Acknowledgement

Do not create blank changeset files. Internal tests, agent documentation, and CI maintenance need no placeholder release artifact unless repository policy changes.

## Verification

Before handoff, confirm the diff does not introduce accidental `.changes/` files and record whether release documentation changed:

```bash
git status --short
find . -maxdepth 2 -name '.changie.yaml' -o -path './.changes/*'
```
