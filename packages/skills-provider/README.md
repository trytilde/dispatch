# @tryopenbot/skills-provider

Startup provisioning boundary for external skill registries. The Tilde adapter
idempotently reconciles one registry per authored agent and synchronizes the
agent's `skills/*/SKILL.md` files by stable repository-relative source path.
Missing skills are created, changed skills are updated, stale agent-owned skills
are removed, and registry membership is made exact.

It does not expose model tools, prompts, skill contents, or asset installation
to agent code.

## Public API

`SkillProvider` exposes only the shared deployment lifecycle. Concrete adapters
may retain registry lookup and reconciliation helpers for their own lifecycle
implementation, but those helpers are not part of the provider contract.
