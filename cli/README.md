# @openbot/cli

The React Ink repository CLI for OpenBot initialization, development supervision, encrypted secret maintenance, service execution, and provider-coordinated deployment. Commands are parsed with `arg`; command entrypoints live under `src/commands/`.

## Commands

- `openbot init` interactively creates `configuration/.env`, `configuration/index.ts`, SOPS recipients and encrypted secrets, then uses the agent scaffolder to create the Hello World agent. After successful scaffolding it removes the exact upstream `configuration/.gitignore` sentinel so fork-owned files can be committed; a custom fork ignore file is preserved and blocks initialization. It generates `OPENBOT_COMPUTER_SERVICE_API_KEY` directly into SOPS-encrypted runtime secrets.
- `openbot new-agent` asks for an agent name, derives its kebab-case ID, and creates the complete authored tree under `configuration/agents/<id>/` without overwriting an existing agent. Non-interactive callers use `openbot new-agent "Research Agent"`.
- `openbot dev` generates contracts and supervises the combined control, agent, web, and optional Electron development processes.
- `openbot deploy` builds selected providers, optionally stops with `--skip-deploy`, or plans and deploys providers with the runtime last.
- `openbot secrets set NAME` and `openbot secrets unset NAME` maintain encrypted `configuration/secrets.enc.yaml` values without putting plaintext in command arguments.
- `openbot check`, `openbot build`, and `openbot test` delegate to the matching repository scripts.

## Public API

This package is an application and declares no importable package exports. Its internal command functions are implementation details; invoke it through `pnpm openbot <command>` and documented flags.
