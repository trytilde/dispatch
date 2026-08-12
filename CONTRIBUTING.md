# Contributing

Use the repository's Vite+ toolchain. Work on a focused branch, preserve unrelated fork changes, and run:

```bash
vp install
vp run check
vp run build
```

Provider contracts belong in their domain `packages/*-provider-core` package; implementations belong in the matching provider package. Fork-specific integrations will live in `configuration/providers/` once that runtime boundary is designed. Agent prompts and execution belong in `configuration/agents/`, not the server router. Never commit `.env`, deployment state, or generated credentials.

When contributing from a fork, separate reusable core changes from private configuration. `.agents/skills/upstream-pr` documents the repository workflow for coding agents.

Owner-visible behavior and package API changes require a file under `.changeset/`. Every workspace package is in one fixed version group; never change package versions or generated changelogs independently. Use `vp run changeset` or follow `.agents/skills/add-changeset`.
