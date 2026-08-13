# @tryopenbot/ui

Shared React UI components and the vendored Beautiful UI surface used by OpenBot applications.

## Public API

The package root exports these React components:

- `ApprovalCard`
- `BeautifulChat`
- `BeautifulSidebarNav`
- `StreamingText`
- `TaskRows`
- `Thinking`
- `ToolChips`

`@tryopenbot/ui/beautiful-ui.css` exports the upstream stylesheet. `@tryopenbot/ui/beautiful-ui/*` exposes the vendored component modules for consumers that need a specific upstream file. Changes to vendored files must retain provenance in the repository notices.
