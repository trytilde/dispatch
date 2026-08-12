---
name: customize-openbot
description: Customize a fork of OpenBot through openbot.config.ts, agents, skills, sandbox assets, or provider plugins. Use when changing repository-owned behavior without modifying upstream core unnecessarily.
---

# Customize OpenBot

1. Read `openbot.config.ts`, then inspect only the selected `agents/`, `configuration/skills/`, `sandbox/`, or `providers/` area.
2. Prefer repository configuration and provider interfaces over imports from application internals.
3. Keep agent prompt and execution logic in `agents/<id>.ts`; keep one endpoint identity per file and match the filename to the agent ID.
4. Put reusable runtime instructions in `configuration/skills/<name>/SKILL.md`. Put sandbox files under `sandbox/assets/`; make `sandbox/bootstrap.sh` idempotent.
5. Never commit `sandbox/secrets.yaml` or provider credentials. Declare sandbox-only names in `sandbox/secrets.example.yaml`.
6. Run `pnpm openbot check`, focused tests, and `pnpm typecheck` before handing off.
