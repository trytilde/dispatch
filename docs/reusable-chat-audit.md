# Dispatch Chat catalog and runtime audit

Audited 2026-09-07 against the working reusable-kit implementation in
`codex/reusable-design-kit`. A catalog story demonstrates a public UI component;
it does not mean Dispatch uses that component or that its demonstration callbacks
are backed by an actual server. Storybook fixtures remain local demonstrations.

## Used by Dispatch

- `ChatHeader`, participant/session avatars, source badges, participant dialog,
  `ChatFindBar`, and `ChatPrompt` consume `runtime.session` / `runtime.prompt`.
  Session-only search pages older history; a UI hook handles rich-text ranges,
  scrolling and focus. Native team-person discovery and direct participant-add
  transport live in the runtime. The companion Tilde backend change is local and
  requires rollout before its new direct-admission semantics are available live.
- Queue controls call runtime queue actions. Draft/upload/removal state is
  runtime-owned, while rich editing, files, hashing, byte transfer and object URL
  capabilities stay in UI/platform adapters.
- `ChatMessage`, `MessageContent`, `ChatEventSurface`, Markdown/code/diff/citation
  rendering, attachment chips, file/media viewers, and the inline `AudioPlayer`
  are on the actual message rendering path. `layoutChatTranscript` supplies day
  boundaries and same-side grouping; UI owns date labels and hover time display.
- Reasoning uses Beautiful UI's `ThinkingBlock`. Generic tool calls now use one
  `ToolCallEvent` through `MessageContent`, including server-projected summaries.
  Legacy `ToolCallCard`, `ToolSummaryEvent` and `ToolsBlock` entry points delegate
  to the same row; specialized connector/media renderers take priority.
  The consolidated Tool Call story shows summary-only and expandable detail states.
- Native connector brokering outputs render `ConnectorEnableCard` outside bubbles.
  `createChatConnectorRuntime` resumes the pending resource in controlled setup
  modals, preserves follow-up forms and redirects, and leaves the chosen user/bot
  mapping to the native agent workflow. Legacy account selection remains a
  compatibility controller, not a preliminary step in the new managed process.
- The app uses `ConversationSkeleton` and `ThinkingIndicator`; added explicit
  loading-conversation/working stories because the previous catalog showed
  different generic loading primitives instead.

## Catalog-only surfaces

No actual Dispatch JSX rendering path currently uses these exported components:

- `LinkPreviewCard`, `DiagramCard`: the stories provide link metadata and diagram
  artwork. The app does not fetch link-preview metadata or render these diagram
  cards. Markdown fenced diagram source currently follows the code-block path.
  Their examples now render outside bubbles, but that is not runtime integration.
- `UnreadDivider`, `QueuedSendNotice`, `SentWhileOfflineNotice`,
  `FailedSendActions`, `UnknownMessageCard`, and the `SystemEvent*` primitives:
  these are reusable presentations, not connected Dispatch states. Unknown parts
  currently fall back to `JsonBlock`, not `UnknownMessageCard`.
The catalog-only `ComputerHandoffCard` and its types/styles/stories were removed
after confirming there are no app-renderer consumers.

Capability proposal APIs, cards, transport helpers, SDK methods and factory tools
have been removed from this branch and the companion backend changes. Native
permissions govern direct operations. Every provisioned agent receives Tilde
resource skills, including the managed `enable-connections` process. Historical
proposal records are retired by unapplied backend migrations; existing created
resources are preserved.

Transcript loading now aliases the actual conversation skeleton. Separate transcript
error/notice and generic reasoning components were removed. Prompt load errors use
its failed status. `NewMessagesPill` aliases the shared scroll control; ChatPrompt
accepts a caller-owned `newMessageCount`, but the current app does not yet supply
viewport-specific new-message counts.

Removed the unwanted `LinkHoverPreview` source/export/story and fullscreen audio
variant. Sound attachments now use the single inline player.
The unused generic permission-request and local-tool permission components,
associated types, styles and four approval stories were subsequently removed.

## Remaining reusable composition and runtime gaps

The unused `ThreadOverlay` and both Agent Exchange examples were subsequently
removed after confirming they had no remaining app consumers.

1. **Full transcript composition:** basic visuals and projections are packaged,
   but the app still assembles rows and contextual rendering.
   A controlled full transcript component would reduce copying for Heyash.
2. **Message-action removal:** Reply/Copy/Start-a-thread controls and the app's
   thread overlay entry point have been removed. The runtime no longer stores
   quoted-reply state. Controlled reply/overlay UI primitives remain reusable,
   but there is no native reply-to/child-session creation workflow to advertise.
3. **Native connection continuation:** now shared by chat, settings and Heyash's
   provider-only setup. Capability proposal transport has been removed.
4. **Legacy account selection:** retained only for explicit old connector payloads;
   the managed workflow discovers accounts through native tools and resumes the
   pending resource directly.
5. **Gallery coordination:** `ChatMessage` opens image/video attachments in one
   shared gallery, retaining the selected file, skipping unavailable peers and
   cancelling stale preview results. The gallery story now uses that actual path;
   documents retain their direct file viewer.
6. **Coverage of real interaction states:** some catalog callbacks are
   illustrative or no-ops. The app browser tests cover real
   search, sending/uploads, queueing, connectors and participant changes, but a
   static story is not an end-to-end contract test. Loading older pages, history
   fetch failures and unread-jump policies do not yet have a
   complete shared transcript composition and story matrix.

Routing, focus, scroll position, menus, media playback and editor selection are
presentation/platform state and should stay outside the framework-neutral
runtime. No additional backend resources or special payload shapes are inferred
from unused stories.

## Tool-chain and pattern pruning follow-up

All 18 unused upstream Beautiful UI demo components and the unused StreamText
reconstruction are removed, along with their exports, the wildcard demo entry,
Patterns stories and glimm dependency. Production Button/GlideMenu/Shimmer, loading,
reasoning and tool-pattern forks remain. Tools now live only under Chat/Events.

Consecutive generic tool parts render as a ToolCallChain; specialized outputs break
the chain and retain their own UI. The production pattern uses persistent leading
chevrons, content-sized parameter chips, and output-only expansion. Summary-only
rows have no chips or expansion. No demo file-edit footer or horizontal rule remains.

Queued/sent-offline/failed-send story states now use the controlled message notice
slot and align beneath the corresponding bubble; this is presentation wiring, not
a new native delivery-state producer. System-event story centering is measured
against the complete chat body instead of a narrower inner demo wrapper.

Long tool, reasoning and generic JSON output now scrolls at 400px without truncating
the content. Tool failures retain both the available output and error text.

## Current cross-repository validation

The new resource inventories expose All/Personal/Bots through one endpoint per
resource crate. Native personal accounts retain ownership metadata; deletion uses
the personal namespace and owner credentials. Inherited personal-tool assignments
are displayed without pretending they are editable team account mappings.

ChatKit adds session-scoped `chatkit_search_history` with authenticated agent and
active human/agent membership checks. MULTI_EXECUTE_TOOL expands before per-tool
visibility projection. The new history membership regression and four projection
unit tests pass. One pre-existing session-tool permission test requires an
unavailable local PostgreSQL service; that database-backed run remains pending.

Heyash now imports shared controls, form-dialog composition and screen states,
with Dispatch's neutral application theme and its own paper/GPU overrides. Its
production build passed after the initial package adoption; all nine panel tests
also pass after the subsequent form/screen composition adoption. Final rebuilt
artifact checks, complete screen/workflow adoption and cross-repository PR/merge
work remain in progress. This audit does not claim those remaining items complete.
