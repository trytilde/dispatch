# Reusable kit and direct resource workflows

Status: Accepted
Date: 2026-09-07
Supersedes capability proposal behavior in [ADR 0037](0037-safe-self-extension-proposals.md).

Dispatch owns reusable presentation in `@tryopenbot/ui` and framework-neutral
workflow state in `@tryopenbot/client-runtime`. Storybook imports public exports.
Web and Electron share the web renderer, including prompt, attachment, queue,
search, participants, settings and connection workflows; no separate desktop
presentation port is required. Browser capabilities remain host adapters.

Native Tilde permissions govern agent mutations. Retire capability proposals and
their UI/SDK/CLI routes. Every provisioned agent receives resource skills and the
hosted enable-connections process. Reuse existing accounts first; explicitly
choose personal/user versus bot ownership, asking about shared access when unclear.
Native brokering produces the connector enable event. External channels receive
the returned hosted setup URL through sendMessage. OAuth and managed credentials
retain their secure native steps, without credential values in chat snapshots.

Resource catalogs include personal and bot assignments with All/Personal/Bots
filters. History search runs through authenticated session-scoped Tilde MCP and
requires the agent's active membership plus the verified user for related sessions.
Tool batches render inner calls under their native visibility/summary policy.

Heyash consumes installed artifacts, retains its own sidebar structure, and uses
Dispatch's neutral authenticated theme. Its paper/GPU onboarding, fonts and brand
remain host-owned. No package rename, publication or deployment is part of this change.
