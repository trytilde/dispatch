# @tryopenbot/skills-provider

Startup provisioning boundary for external skill registries. It can find,
create, or update the registry assigned to an authored agent. It does not expose
model tools, prompts, skill contents, or asset installation to agent code.

## Public API

`SkillProvider` exposes only the shared deployment lifecycle. Concrete adapters
may retain registry lookup and reconciliation helpers for their own lifecycle
implementation, but those helpers are not part of the provider contract.
