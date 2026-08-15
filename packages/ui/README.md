# @tryopenbot/ui

Shared React UI components and the vendored Beautiful UI surface used by OpenBot applications.

## Public API

The package root exports the complete workspace surface:

- Shell and navigation: `WorkspaceShell`, `WorkspaceSidebar`, `AgentListItem`,
  `AgentSearchDialog`, `WorkspaceAccount`, and `useWorkspaceLayout`.
- Chat: `ChatHeader`, `ChatPane`, `ChatComposer`, `ConversationSurface`,
  `ConversationMessage`, `EmptyConversation`, `MessageContent`,
  `ScrollToLatestButton`, and `ThinkingIndicator`.
- Rich content: `MarkdownText`, `JsonBlock`, `ReasoningCard`, `ToolCallCard`,
  `ConnectionCard`, `FileCard`, `FileViewer`, and `MediaViewer`.
- Agent activity: `AgentActivity`, `ActivityQueue`, `ActivityTimeline`,
  `AsyncTasksPanel`, and `ConversationOutlinePanel`.
- Computer: `AgentWorkspacePanel`, `ComputerStagePlaceholder`,
  `ComputerMonitorStrip`, `ComputerReconnectBanner`, `ComputerRebuildBanner`,
  `ComputerRebuildDialog`, `ComputerFailureDialog`, and the remaining Computer
  lifecycle dialogs.
- Overlays: `DialogSurface`, `PermissionRequestCard`,
  `LocalToolPermissionCard`, `LocalToolPermissionDock`, and `ThreadOverlay`.
- Identity: `AgentAvatar` and its packaged avatar artwork.
- Vendored Beautiful UI: `ApprovalCard`, `BeautifulChat`,
  `BeautifulSidebarNav`, `StreamingText`, `TaskRows`, `Thinking`, and
  `ToolChips`.

`@tryopenbot/ui/beautiful-ui.css` exports the upstream stylesheet. `@tryopenbot/ui/beautiful-ui/*` exposes the vendored component modules for consumers that need a specific upstream file. Changes to vendored files must retain provenance in the repository notices.

`@tryopenbot/ui/openbot-ui.css` exports the complete OpenBot workspace palette,
geometry, responsive layout, component states, and motion system. Applications
should consume the package stylesheet instead of maintaining local overrides.
