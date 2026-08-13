# ADR-0013: Repository bootstrap and fork updates

## In brief

- Init owns GitHub repository bootstrap. Empty directory only. No partial in-place setup.
- Public means GitHub fork. Private means independent mirror. Never claim private fork-network membership.
- Every upstream PR ships caveman update metadata. No undocumented fork impact.
- `openbot update` merges upstream, then hands review to coding agent. Never declare fork behavior preserved automatically.
- Future code-forge provider replaces direct `gh` orchestration. Manual GitHub flow is temporary.

## Context

OpenBot is designed to be customized in a user-owned repository. The current `pnpm openbot init` assumes the repository already exists, which leaves repository ownership, visibility, upstream remotes, and future upgrades as manual steps. Private GitHub repositories cannot be members of the public upstream's fork network, so public and private bootstrap paths are necessarily different.

Forks may change any package and cannot safely consume upstream releases from a package boundary alone. Upstream changes therefore need durable, machine-readable-enough human guidance, and updating a fork must explicitly hand semantic verification to the user's coding agent.

## Decision

### Bootstrap an owned repository before configuration

`openbot init` becomes a standalone bootstrap command that runs from the intended, completely empty destination directory. Any entry, including hidden files, makes init fail before prompts or network mutation. The command must be distributable independently of a cloned OpenBot workspace; the existing repository-local `pnpm openbot init` invocation is transitional and cannot implement this decision by itself.

Init checks that `git` and authenticated GitHub CLI access are available. It resolves canonical OpenBot's HEAD, verifies that revision has the workspace contract required by the installed CLI, and later verifies that the owned clone is at the same revision. Missing `gh`, failed `gh auth status`, unavailable SSH access, an incompatible canonical revision, an existing destination repository, or any Git operation failure aborts repository bootstrap and prevents repository creation or configuration initialization.

The user chooses a repository owner/name and visibility. A bare name defaults to the account reported by the authenticated GitHub CLI; an explicit `owner/name` may target a GitHub organization where that account has repository-creation permission. Visibility defaults to private.

- Public: use `gh repo fork` with the requested name, clone it into the current empty directory, and retain the canonical OpenBot repository as `upstream`.
- Private: create a new private GitHub repository, make a temporary bare clone of canonical OpenBot, mirror its refs to the new repository, remove the temporary bare repository, clone the private repository into the current directory, and add canonical OpenBot as `upstream`. This is an independent repository copy, not a GitHub fork.

Temporary mirror state lives in a securely created temporary directory and is always cleaned up. The implementation must not use a predictable repository-local seed directory. `origin` always names the user repository; `upstream` always names canonical OpenBot. Only after clone and remote verification succeed does init continue with SOPS, provider configuration, instrumentation, and initial-agent scaffolding inside the new repository.

The first implementation may invoke `gh` and `git` through typed command-runner boundaries. Follow-up work will introduce a code-forge or `GitProvider` domain and replace these direct GitHub operations with provider calls without changing the bootstrap contract.

That provider follow-up owns forge account discovery, repository creation or fork/mirror provisioning, visibility, clone URLs, default-branch metadata, authentication handoff, and remote configuration. Local Git history and merge mechanics remain CLI/application workflow; the provider must not become a generic filesystem or shell abstraction. GitHub is the first implementation, with other forges added only after their real differences are known.

```mermaid
flowchart TD
  E["Empty destination"] --> G["Validate git and authenticated gh"]
  G --> V{"Visibility"}
  V -->|"public"| F["GitHub fork"]
  V -->|"private"| M["Private mirrored repository"]
  F --> C["Clone into current directory"]
  M --> C
  C --> U["origin=user repository; upstream=OpenBot"]
  U --> I["Configuration and SOPS init"]
```

### Ship one fork-update record with every PR

Every upstream PR that changes repository contents must add `docs/updates/<pr-number>.md`. PR preparation must first push the initial implementation and open a draft PR, then use the stable GitHub PR number for the record. The same file is refreshed after every later implementation, documentation, rebase, conflict-resolution, or accepted-review change until it describes the complete current PR.

Generating or refreshing the record must analyze the full PR diff, commit history, review discussion, and every thread in the coding agent's database on the current machine rather than relying on the current chat alone. This inspection is read-only. Only PR-relevant conclusions enter the record; unrelated private conversation, credentials, secrets, personal data, and raw transcripts never do. If the local thread set cannot be inspected completely, PR preparation reports the limitation and cannot claim the record is complete.

Each record is detailed but written in caveman style and contains these exact sections:

1. `Intent of the change`
2. `Architecture changes`, including a Mermaid diagram even when the diagram only confirms an unchanged boundary
3. `Summarized package changes`
4. `Critical to apply to forks`, with exactly `yes` or `no` followed by the reason and required fork action

PR preparation and CI treat a missing, stale, wrongly numbered, or malformed update record as a blocking defect. These records describe the complete PR rather than individual minor commits. They must contain no secrets, generated deployment state, fork-specific configuration, or unrelated thread material.

### Update a customized fork and require semantic review

`openbot update` requires a clean worktree, an `upstream` remote pointing to canonical OpenBot, and the user's current branch. It fetches `upstream/main`, identifies the upstream range since the current merge base, and runs a normal merge. Git fast-forwards when possible and creates a merge commit when the fork has diverged. The command does not rebase, force-reset, discard fork commits, auto-resolve conflicts, push, or deploy.

Before attempting the merge, the command always creates `configuration/docs/update-notes/<upstream-head>.md`. Init seeds `configuration/docs/update-notes/README.md` explaining that these are fork-owned verification notes rather than upstream release notes.

- No upstream commits: write exactly `no updates` to the note.
- Merge success: write the upstream range, consumed `docs/updates/` records, merge result, and a pending coding-agent review checklist.
- Merge conflict or other merge failure: retain the note with the attempted range, failure state, discovered update records, and unresolved paths when available.

On both success and failure, the CLI prints a ready-to-copy prompt telling the user to launch their default coding agent, read every upstream update record in the range, inspect the fork's customizations and conflicts, preserve all critical and intended functionality, run appropriate checks, and replace or extend `configuration/docs/update-notes/<upstream-head>.md` with its conclusions. A successful Git merge is never presented as proof that the customized fork still behaves correctly.

A follow-up will automatically launch the user's configured default coding agent with that prompt after writing the update note. Agent detection and invocation must be explicit configuration or a verified installed-agent integration, never a guessed shell command. Automatic launch happens for success, conflict, and no-update results; an unavailable or failed coding-agent launch is non-destructive, leaves the note intact, and falls back to printing the complete prompt and manual command. The CLI never grants extra permissions, bypasses the agent's approval model, or treats process launch as completed review.

```mermaid
flowchart LR
  P["Draft upstream PR"] --> D["docs/updates/PR-number.md"]
  D --> F["Fork openbot update"]
  F --> N["configuration/docs/update-notes/upstream-hash.md"]
  F --> M{"Merge result"}
  M -->|"success"| A["Coding-agent semantic review"]
  M -->|"failure"| A
  A --> N
```

## Consequences

- Fresh users receive a repository they own before any credentials or fork configuration exist.
- Public repositories preserve GitHub fork relationships; private repositories sacrifice fork-network metadata for actual privacy.
- The independently installable `openbot` CLI owns empty-directory repository bootstrap and configuration initialization.
- Update notes require the draft PR to exist first and must be refreshed as its implementation or review outcome changes.
- Merge automation handles Git history only. Coding-agent review owns semantic preservation of arbitrary fork customizations.
- Direct GitHub CLI orchestration is accepted temporary coupling until the code-forge provider exists.

## Updates

- 2026-08-13T16:59:19+02:00: Added follow-up boundaries for a forge-specific repository provider and automatic default coding-agent launch after every update result, with safe manual fallback and no implied review completion.
- 2026-08-13T17:08:19+02:00: Replaced commit-hash update records with stable PR-number records, required draft-PR creation before generation, required continuous refresh, and expanded evidence gathering to every local coding-agent thread with strict privacy filtering.
- 2026-08-13T17:50:21+02:00: Added the public standalone `openbot` package and executable entrypoint; empty-directory repository provisioning remains separate implementation work.
- 2026-08-13T18:15:10+02:00: Added an early cloned-repository guard so transitional init cannot write partial configuration outside an OpenBot checkout while empty-directory bootstrap remains unimplemented.
- 2026-08-13T18:24:38+02:00: Replaced transitional in-clone init with empty-directory-only GitHub bootstrap for public forks and private mirrors, including preflight checks and verified origin/upstream remotes.
- 2026-08-13T18:27:43+02:00: Added stdin JSON answers and JSON results for non-interactive init, using stable core and provider question IDs so AI agents execute the same validated bootstrap path without a TTY or secrets in arguments; agent scaffolding and secret mutations also expose explicit JSON/stdin modes.
- 2026-08-13T18:29:50+02:00: Allowed repository bootstrap to target an authorized GitHub organization through explicit `owner/name` input while preserving bare-name account defaults.
- 2026-08-13T18:33:45+02:00: Required init to verify canonical HEAD's workspace compatibility before prompts or repository mutation and to verify the owned clone remains pinned to that checked revision.
