# openbot

The React Ink repository CLI for OpenBot initialization, development supervision, encrypted secret maintenance, service execution, and provider-coordinated deployment. Commands are parsed with `arg`; command entrypoints live under `src/commands/`.

## Install

```bash
npm install --global openbot
openbot --help
```

The CLI operates on the OpenBot repository in the current working directory. For a new installation, run `openbot init` from a completely empty destination directory; it verifies canonical OpenBot, creates an owned GitHub repository, clones the verified revision, and writes configuration. Running `openbot init` again from that initialized repository revisits the active platform and provider questions with stored values pre-populated. It does not recreate the repository or replace the existing SOPS ownership configuration. The CLI can also run without a global install using `npx openbot`.

## Commands

- For a new installation, `openbot init` rejects any non-empty destination before prompts or network mutation, verifies Git and authenticated GitHub CLI/SSH access, then accepts either a bare repository name for the authenticated account or `owner/name` for an authorized organization. It creates either a public fork or independent private mirror. After cloning it creates `configuration/.env`, `configuration/index.ts`, SOPS recipients and encrypted secrets, then scaffolds the Hello World agent. It removes the exact upstream `configuration/.gitignore` sentinel so fork-owned files can be committed and generates the described `COMPUTER_SERVICE_API_KEY` SOPS entry for runtime computer-service authentication.
- In an already initialized OpenBot repository, `openbot init` decrypts the current values, uses them as prompt defaults, updates only active platform/provider destinations, preserves unrelated environment and secret entries, re-encrypts with the existing SOPS recipients, and runs `vp install` again.
- `openbot init --non-interactive --json` runs the same path from a JSON object on standard input. This is the supported automation and AI-agent interface: secrets do not appear in process arguments, missing core answers fail before repository creation, and success or failure is machine-readable JSON.
- `openbot init --help` prints the complete JSON Schema for that stdin object. It includes field names, human-readable descriptions, allowed values, conditional required fields, validation patterns, secret markers, and questions contributed dynamically by the selected runtime providers.
- `openbot new-agent` asks for an agent name, derives its kebab-case ID, and creates the complete authored tree under `configuration/agents/<id>/` without overwriting an existing agent. Agents use `openbot new-agent "Research Agent" --json` for a machine-readable result.
- `openbot dev` generates contracts and supervises the combined control, agent, web, and optional Electron development processes.
- `openbot deploy` builds selected providers, optionally stops with `--skip-deploy`, or plans and deploys providers with the runtime last.
- `openbot secrets set NAME --description TEXT` and `openbot secrets unset NAME` maintain described `configuration/secrets.enc.yaml` entries without putting plaintext values in command arguments. SOPS encrypts only each entry's `value`; its `description` stays readable. Agents pipe values with `--stdin`; descriptions are mandatory.
- `openbot env set NAME VALUE --description TEXT` and `openbot env unset NAME` maintain `configuration/.env`. Descriptions are mandatory and appear as plaintext comments above quoted values.
- `openbot check`, `openbot build`, and `openbot test` delegate to the matching repository scripts.

## Public API

This package is an application and declares no importable package exports. Its internal command functions are implementation details; invoke the installed `openbot` executable, `npx openbot`, or the repository-local `pnpm openbot` script.

## Non-interactive initialization

Run from the completely empty destination directory and pipe answers on standard input:

```bash
openbot init --non-interactive --json < openbot-answers.json
```

For a private Vercel installation using AWS KMS, the answer object is:

```json
{
  "repository-name": "my-openbot",
  "repository-visibility": "private",
  "owner-identity": "aws-kms",
  "aws-kms-key-arn": "arn:aws:kms:us-east-1:123456789012:alias/openbot-sops",
  "aws-profile": "admin",
  "runtime": "vercel",
  "vercel-token": "secret",
  "vercel-control-project": "my-openbot-control",
  "vercel-agent-project": "my-openbot-agents"
}
```

`aws-profile` is optional and uses the default AWS credential chain when omitted. Other owner identity values are `gcp-kms`, `azure-key-vault`, `vault-transit`, `onepassword`, and `native-age`. Provider questions use their provider-defined question IDs, so custom providers remain automatable through the same input object. Missing-answer errors identify the exact stable ID required.

Other agent-safe mutations follow the same stdout JSON and nonzero-exit convention:

```bash
openbot new-agent "Research Agent" --json
printf '%s' "$SECRET_VALUE" | openbot secrets set API_TOKEN --stdin --json
openbot secrets unset API_TOKEN --json
openbot deploy --dry-run --json
```
