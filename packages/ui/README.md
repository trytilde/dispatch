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
- `AgentWorkspacePanel`
- `AgentActivity`
- `AgentAvatar`
- `ChatComposer`
- `ChatHeader`
- `ChatPane`
- `ConversationMessage`
- `ConversationSurface`
- `EmptyConversation`
- `MessageContent`
- `ScrollToLatestButton`
- `ThinkingIndicator`
- `WorkspaceShell`
- `WorkspaceSidebar`
- `useWorkspaceLayout`

`@tryopenbot/ui/beautiful-ui.css` exports the upstream stylesheet. `@tryopenbot/ui/beautiful-ui/*` exposes the vendored component modules for consumers that need a specific upstream file. Changes to vendored files must retain provenance in the repository notices.

`@tryopenbot/ui/openbot-ui.css` exports the complete OpenBot workspace palette,
geometry, responsive layout, component states, and motion system. Applications
should consume the package stylesheet instead of maintaining local overrides.
