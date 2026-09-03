# Changesets

Add one Markdown file here for owner-visible behavior or package API changes. Every Dispatch workspace package belongs to one fixed version group, so release versions move together.

```bash
pnpm changeset
pnpm changeset:status
```

Do not edit package versions or generated changelogs directly. GitHub Actions creates or updates the unified version pull request after changes land on `main`. The workflow does not publish packages.
