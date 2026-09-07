# @tryopenbot/ui

Shared React presentation used by Dispatch and external consumers.

## Public API

The package root exports the complete workspace surface:

- Shell and navigation: `WorkspaceShell`, `WorkspaceSidebar`, `WorkspaceSelector`,
  `AgentListItem`, `AgentSearchDialog`, `AgentSetupDialog`, `WorkspaceAccount`,
  `BrandedLoadingState`, and `useWorkspaceLayout`. `AgentSearchDialog` accepts consolidated bot,
  conversation-title, and message results through `WorkspaceSearchResult`.
- Chat: `ChatHeader`, `ChatPane`, `ChatPrompt`, `ChatComposer`, `ConversationSurface`,
  `ConversationMessage`, `EmptyConversation`, `MessageContent`,
  `ScrollToLatestButton`, `ThinkingIndicator`, `ChatFindBar`, transcript
  loading and error states, unread and new-message markers, message delivery
  notices, and system-event primitives.
- Connections: `ConnectorEnableCard` presents native pending setup outside chat bubbles.
  `ChatConnectorDialog` renders controlled initial forms, follow-up forms, instructions,
  OAuth waiting, failures and credential downloads. `ConnectorSetupDialog` is the
  lower-level schema form; legacy account-grid exports remain available to explicit consumers.
- Forms/screens: `ControlButton`, `Input`, `Textarea`, `Badge`, `FormDialogContent`,
  `DialogHeader`, `DialogFooter`, `PageHeader`, `Field`, `LoadingRows`, `EmptyState`, and
  `ErrorNotice` are public building blocks. Existing `Button` imports remain compatible.
- Plugins and routines: `PluginsCatalog` renders provider-backed tool and skill assignments;
  `RoutineProvidersSettings` manages user-facing trigger-provider connections; and
  `RoutineSettings` renders searchable, filterable routine management with edit, status, and
  delete actions. Provider cards use explicit or server-authored icons and fall back to local
  monograms rather than synthesizing remote asset URLs.
- Rich content: `MarkdownText`, `JsonBlock`, `ThinkingBlock`, `ToolCallEvent`,
  `ConnectionCard`, `FileCard`, `FileViewer`, `MediaViewer`, `AudioPlayer`,
  `LinkPreviewCard`, `DiagramCard`, `CodeBlock`,
  `DiffBlock`, `CitationLink`, and `InlinePath`.
- Queue and work: `ActivityQueue` and
  `WorkOverview` for durable goals, tasks, and background-agent controls.
- Computer: `AgentWorkspacePanel`, `ComputerStagePlaceholder`,
  `ComputerMonitorStrip`, `ComputerReconnectBanner`, `ComputerRebuildBanner`,
  `ComputerRebuildDialog`, `ComputerFailureDialog`, and the remaining Computer
  lifecycle dialogs.
- Overlays: `DialogSurface`.
- Identity: `AgentAvatar`, `ParticipantAvatar`, `ParticipantAvatarStack`, and `SessionIcon`
  support both people and agents, with packaged agent artwork.
- Controls: `PromptStatusBadge`, `StatusBadge`, `KeyboardKey`, `InputGroup`, and `SelectField`.
- Retained Beautiful UI foundations: `Button`, `GlideMenu`, `Shimmer`, and the
  production reasoning/tool-pattern forks used by `ThinkingBlock`, `ToolCallEvent`
  and `ToolCallChain`. Unused demo components and their root exports were removed.

`@tryopenbot/ui/beautiful-ui.css` retains the theme stylesheet. The removed demo
module export `@tryopenbot/ui/beautiful-ui/*` is no longer supported. Provenance
and the retained MIT license are included in the package.

`@tryopenbot/ui/openbot-ui.css` exports the complete OpenBot workspace palette,
geometry, responsive layout, component states, and motion system. Applications
should consume the package stylesheet instead of maintaining local overrides.

Consumers that need only the avatar can import `AgentAvatar` from
`@tryopenbot/ui/agent-avatar` and its component-scoped layout from
`@tryopenbot/ui/agent-avatar.css`. The standalone entry does not require the
OpenBot global stylesheet, theme tokens, or `@tryopenbot/client-runtime`.

## Storybook

Run the package-owned component catalog from the repository root:

```bash
pnpm --filter @tryopenbot/ui storybook
```

Build its static output with `pnpm --filter @tryopenbot/ui storybook:build`.
The stories cover every public visual component that can run in isolation,
including responsive compositions and loading, error, permission, reconnect,
and deployment lifecycle states.

## Reusable settings and connections

`SettingsShell`, `SettingsNavigation`, `SettingsContent`, and `AppearanceSettings`
export the existing settings presentation. The host supplies routing callbacks,
the selected section, theme preference, and the macOS desktop flag. These
components do not access a router or installation singleton.

`PluginsSettingsView` composes the existing catalog, account setup dialog, and
bot assignment dialog. It accepts controlled snapshots and callbacks; the
runtime owns loading, mutations, rollback, and authorization. Its stories cover
empty/loading/error, setup/submitting/authorization, and assignment states.

The root also exports the existing `Input`, `Textarea`, `Badge`, `Select*`,
`Tooltip*`, and `Separator` primitives. Existing `Button` and `InputGroup`
exports retain their APIs and appearance.

### Installing in another React application

Install both `@tryopenbot/ui` and `@tryopenbot/client-runtime`, with the host's
React 19 and React DOM. React is a peer, so installing the UI kit does not add
another runtime copy. Consume package exports, not workspace source paths.
Build dependencies before building the package-owned Storybook.

For a complete Dispatch surface, import `@tryopenbot/ui/openbot-ui.css` from
the application's Tailwind 4 CSS entry. It includes the vendor utility mapping
and discovers classes relative to the installed package's CSS directory.
It intentionally includes Dispatch's global defaults. Apply host token values
after it; do not modify the vendored Beautiful UI files.

For connector-only consumers, use `@tryopenbot/ui/connectors` and
`@tryopenbot/ui/connectors.css`. This entry avoids importing the workspace's
markdown, media, and diagram components. The component CSS has no page resets,
font loading, theme initialization, or product branding. In the host's Tailwind
entry, add an `@source` pointing to the installed `@tryopenbot/ui/dist/**/*.js`
(relative to that CSS file) and map the semantic utilities used by the controls.
Use the consuming application's client boundary when rendering interactive
components in Next.js.

The connector token contract is `--ink`, `--ink-2`, `--ink-3`, `--canvas`,
`--surface`, `--inset`, `--field`, `--line`, `--line-strong`, `--hover`, `--accent`,
`--red`, `--red-tint`, and `--green`; dialog primitives also use the standard
shadcn background/foreground/border/input/ring tokens. The Tailwind utility
mapping additionally includes `rounded-control`, `shadow-btn`, and
`shadow-inset-field`. Keep theme values in the consuming repository.

`ConnectorSetupDialog.contentClassName` places the host's theme on portal
content, where parent-only CSS variables otherwise cannot reach.
The same host class is applied to the dialog scrim through
`DialogContent.overlayClassName`. Define `--scrim`, `rounded-window` and
`shadow-overlay` alongside the connector controls.
`accountNameDescription` accepts host-owned account copy; omitting it preserves
Dispatch's existing bot-oriented description. `ConnectorGlyph` is public.
No GPU renderer or font assets are bundled with the kit.

### Chat composition

Use `ChatPrompt` for the complete floating prompt: reply preview, centered
scroll-to-bottom, right-aligned actionable status, embedded queue, attachments,
and composer. Normal idle/working/connected states have no status pill. An error
uses the failed status with its custom message. The transparent dock lets the
conversation continue behind its controls and measures its occupied height.
`ChatComposer` remains available as the low-level input. Its rich Markdown editor
uses UI-owned Tiptap state, emits ordinary Markdown, supports undo and formatting
shortcuts, and grows to at most 480px or 55% of the viewport height. `inputRef`
now targets the editable `HTMLElement` rather than a textarea.

`ActivityQueue` always embeds above the composer with square bottom corners.
All rows render without scrolling or a height cap. Text clips before Steer.
During reordering, an inert preview can paint outside the card while the original
row retains its layout slot; dragging cannot resize the card or add scrollbars.
Pass the queue through `ChatPrompt.queue` to preserve shared placement. Replies
replace notices/queue; closing the reply fades those controls back in.

`ChatHeader` accepts people/agent participants, an optional session name and
`SessionSource`. Source appears between participant names and the named thread.
The people control sits beside names. Controlled rename, participant management and header search callbacks connect to
`runtime.session`; the header's height stays fixed while finding. `SessionIcon`
shows the other participant in a direct chat and stacked avatars in groups.

Pass authoritative `SessionAccess` to `ChatPrompt`. External-channel nonmembers
see a disabled source-only notice; API nonmembers get an underlined join action.
Joining and failure states stay controlled by the runtime, and the input becomes
available only after membership is confirmed. Never use the UI gate as a
replacement for server authorization.

## Chat catalog

**Chat / Controls** contains header, find, prompt, status, centered scroll, and
one embedded queue story. Each standalone example can show variants; its complete
chat example shows one realistic state using `ChatPrompt`, without a sidebar.
**Chat / Messages** contains bubbles with text, Markdown and rich attachments.
**Chat / Events** contains unbubbled reasoning, tools, connector setup/selection,
approvals, participant activity, and tool-summary versus full-output examples.
`ChatEventSurface` preserves this distinction in the actual application.
`ToolSummaryEvent` consumes only the sanitized server-projected summary and never
reveals raw arguments/output in summary mode.

**Primitives** contains buttons, inputs, keys, avatars and the former Beautiful UI
patterns. Keyboard keys remain available for ad hoc use outside prompt controls.
Story examples import public package exports and are included in typechecking.

The unused `ActivityTimeline`, `AgentActivity`, `ActivityEmpty`, `TextRoll`,
`VoiceWaveform`, `ModelPicker` and custom `ScrollArea` exports were removed.
The internal scrolling primitive used by suggestions remains in place.

`ChatMessage` composes a text bubble and circular attachment chips immediately
beneath it; attachment-only messages have no bubble. `FileCard.compact` exposes
the chip presentation while retaining the existing preview/download behavior.
`useChatFindHighlight` is the browser port for runtime search: it highlights
matches across rich text nodes and scrolls to the selected loaded message.
The Find in Chat story uses the runtime and demonstrates earlier-history loading.
Participant search opens as a floating autocomplete above the current roster;
consumers supply runtime-owned candidates and `onSearch`, then add existing
people/agents directly. The header uses packaged Slack/GitHub/WhatsApp marks
from theSVG; provenance ships in `assets/channels/NOTICE.md`.

Chat history uses `layoutChatTranscript` from the runtime for day boundaries and
same-side grouping, with `TranscriptTimeSeparator` for Today/Yesterday/date labels.
Message hover timestamps use 24-hour times beneath the bubble on the right.
Sound attachments use the single inline `AudioPlayer`; fullscreen audio and
`LinkHoverPreview` were removed. Link/diagram catalog cards render without bubbles.
See `docs/reusable-chat-audit.md` in the repository for actual Dispatch usage and
remaining catalog/runtime gaps; a story is not a claim that the app uses that surface.

Message-level Reply/Copy/Start-a-thread controls and their action props are removed.
The optional controlled prompt reply presentation remains a UI-only capability.
Audio attachments render inside chat bubbles; other file attachments stay beneath
the bubble. UnknownMessageCard uses the normal message geometry with a warning
background. The composed-content and message-actions stories are removed.

Transcript loading uses `ConversationSkeleton` (`TranscriptLoading` is a compatibility
alias). Load failures use a failed `ChatPrompt.status`; `TranscriptError` and
`TranscriptNotice` were removed. `ChatPrompt.newMessageCount` selects the new-message
variant of its one centered scroll control, without a dismiss action.

`ToolCallEvent` is the single generic execution presentation: grey summary/full text
beside a wrench for summary-only rows, or a persistent left chevron with compact
`$parameter = value` input chips when output is available. Expanding shows the
complete output without Input/Output headers. Consecutive generic tool parts use
`ToolCallChain`, built on the production Beautiful UI tool pattern.
`toolCallPresentation` in the client runtime strips raw details from summary projections.
`ToolCallCard`, `ToolSummaryEvent` and `ToolsBlock` delegate to this renderer. Specialized
connector, capability and media outputs retain their dedicated presentation. Reasoning
uses Beautiful UI's `ThinkingBlock`; the separate `ReasoningCard` has been removed.

The duplicate Primitives/Patterns catalog is removed; Tools and Chained Tool Calls
under Chat/Events show the production renderer. Send notices use the controlled
`ConversationMessage.notice`/`ChatMessage.notice` slot, directly beneath the
message and aligned with its sender. System-event examples use the full chat width.

The unused ComputerHandoffCard, its public types and catalog-only examples are removed.

## Composable settings

The existing Dispatch settings compositions now use public lower-level components:

- Tools/skills: `PluginProviderCard`, `PluginItemRow`, `PluginCategorySection`,
  `PluginSearchField`, `PluginCategoryFilter`, `PluginAgentFilter`, and
  `PluginCatalogSkeleton`. Provider/item icons and descriptions retain the native
  layout. Agent arrays are optional; `PluginItemRow.actions` replaces assignment
  controls with host-owned actions. Provider-card trailing content is non-interactive.
- Routines: `RoutineSettingsHeader`, `RoutineFilters`, `RoutineTable`,
  `RoutineTableRow`, `RoutineSummary`, `RoutineStatusBadge`, `RoutineActionsMenu`,
  `RoutineDeleteDialog`, and `RoutineListItem`. Hide the agent filter/column for a
  single-owner host, or supply custom row actions and descriptions.
- Routine connections: `RoutineProviderCard` and `RoutineConnectionRow`, with
  custom action slots and controlled connection callbacks.
- Existing `RoutineEditor`, `TriggerCard`, `ScheduleEditor`, `EventTriggerEditor`
  and `SignalProviderDialog` remain the shared editor/setup surfaces.

Menu primitives accept `menuClassName` where needed so scoped host tokens reach
portaled menus. Keep host fonts, themes and layout outside these components.
See the repository guide `docs/reusable-settings-kit.md` for composition boundaries.
The unused Agent Exchange/Load Error stories and `ThreadOverlay` were removed.

Tool, reasoning and generic JSON output remain complete. Output areas scroll above
400px; there is no output line cap, and full output is retained alongside errors.
