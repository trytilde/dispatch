---
name: customize-openbot
description: Customize a fork of OpenBot through configuration/index.ts or the configuration tree. Use when changing repository-owned behavior without modifying upstream core unnecessarily.
---

# Customize OpenBot

1. Read `configuration/index.ts`, then inspect only the selected area under `configuration/agents/`, `configuration/skills/`, `configuration/sandbox/`, or `configuration/providers/`.
2. Prefer repository configuration and provider interfaces over imports from application internals.
3. Configure concrete implementations only under `Configuration({ providers: { ... } })`, using the domain keys `controlService`, `agentService`, `agent`, `computer`, `inferenceModel`, `skills`, and `tools`. Do not add configurable repository paths.
4. Keep agent prompt and execution logic in `configuration/agents/<id>.ts`; export a Tilde `chatKitEndpoint`-backed `POST` handler compatible with the Vercel AI SDK. Agent routes always live below `/api/agents`.
5. Put reusable runtime instructions in `configuration/skills/<name>/SKILL.md`. Put sandbox files under `configuration/sandbox/assets/`; make `configuration/sandbox/bootstrap.sh` idempotent. Custom provider source always lives under `configuration/providers/`.
6. Never commit `configuration/sandbox/secrets.yaml` or provider credentials. Declare sandbox-only names in `configuration/sandbox/secrets.example.yaml`.
7. Run `pnpm openbot check`, focused tests, and `pnpm typecheck` before handing off.
