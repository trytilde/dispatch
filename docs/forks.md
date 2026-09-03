# Maintain a fork

Public forks can use the Vercel clone flow directly. Private installations should mirror the repository into a private Git host and connect that repository to Vercel. Dispatch never writes source changes back to either repository at runtime.

Keep the upstream project as a second remote:

```bash
git remote add upstream https://github.com/trytilde/dispatch.git
git fetch upstream
git switch -c update/dispatch
git merge upstream/main
pnpm install
pnpm tilde check
pnpm tilde build
```

A fork's own development hosts live in `configuration/dev-hosts.json`, so they survive an upstream merge untouched. Treat `configuration/index.ts` and the complete `configuration/` tree as fork-owned during conflict resolution. The `.agents/skills/update-dispatch` workflow gives coding agents the same rule. Put generally useful contracts and implementations in a focused upstream pull request; keep business-specific agents and secrets in the fork.
