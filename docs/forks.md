# Maintain a fork

Public forks can use the Vercel clone flow directly. Private installations should mirror the repository into a private Git host and connect that repository to Vercel. OpenBot never writes source changes back to either repository at runtime.

Keep the upstream project as a second remote:

```bash
git remote add upstream https://github.com/trytilde/openbot.git
git fetch upstream
git switch -c update/openbot
git merge upstream/main
vp install
vp run check
vp run build
```

Treat `configuration/index.ts` and the complete `configuration/` tree as fork-owned during conflict resolution. The `.agents/skills/update-openbot` workflow gives coding agents the same rule. Put generally useful contracts and implementations in a focused upstream pull request; keep business-specific agents and secrets in the fork.
