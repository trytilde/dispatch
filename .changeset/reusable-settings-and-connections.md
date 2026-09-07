---
"@tryopenbot/agent-provider": minor
"@tryopenbot/agent-service-provider": minor
"@tryopenbot/auth-provider": minor
"openbot": minor
"@tryopenbot/computer-service-provider": minor
"@tryopenbot/client-runtime": minor
"@tryopenbot/computer-tools": minor
"@tryopenbot/computer-service": minor
"@tryopenbot/computer-service-proto": minor
"@tryopenbot/configuration": minor
"@tryopenbot/desktop": minor
"@tryopenbot/utilities": minor
"@tryopenbot/platform-integrations": minor
"@tryopenbot/control-service-provider": minor
"@tryopenbot/runtime-provider": minor
"@tryopenbot/control-service": minor
"@tryopenbot/ui": minor
"@tryopenbot/web": minor
"@tryopenbot/git-provider": minor
---

Expose reusable settings, form primitives, controlled connections, and host-themed connector consumption. Add framework-neutral plugin, provider setup, prompt/attachment, session search, participation and transcript controllers.

Compose chat controls through `ChatPrompt`: transparent floating dock, embedded non-scrolling queue, floating replies, centered scroll, actionable statuses, and circular attachment controls. Add participant avatars, editable session headers, source badges and native roster and existing-identity addition controls. Gate nonmember messaging by session source and confirm native API joins through the authoritative roster.

Separate bubbled messages from unbubbled events and respect native tool-summary projection. Match dialog action heights and increase body bottom spacing. Organize Storybook into Chat Controls, Messages, Events and Primitives with paired isolated and full-chat examples. Remove unused timeline/combined activity, voice, rolling text, model picker and custom scrolling exports.

Refine prompt overflow and badge shadows, crossfade replies with queue/notices, move people controls beside names, and show source brand icons. Add rich Markdown prompt editing with responsive growth and circular attachment chips outside message bubbles. Search highlights rich text and loads earlier matches; participant search uses a floating autocomplete and direct native addition of existing identities.

Keep attachment chips directly beneath their own message with a tighter gap, flowing left-to-right for agents and right-to-left for users.

Open document and gallery story examples from actual attachment chips, and allow FileCard previews to delegate to a shared gallery.

Use a single inline audio player for sound attachments, remove fullscreen audio and link-hover previews, and keep link/diagram examples outside bubbles. Add shared transcript day grouping, centered date labels, tighter consecutive messages and 24-hour hover timestamps. Audit actual Chat catalog adoption and remaining runtime workflow gaps.

Flash the focused search-result bubble blue three times instead of outlining its row, with a runtime focus token to replay deliberate result navigation without retriggering on unrelated history updates.

Remove message action controls and quoted-reply runtime state, align source-only prompt typography, render sound attachments inside bubbles, and use warning-styled ordinary unknown messages. Remove redundant composed-content/message-actions stories and tighten follow-on spacing across story wrappers.

Remove unused generic permission-request and local-tool permission cards, their dock, public types, styles and approval stories. Keep the capability-approval renderer and stories.

Consolidate transcript loading/errors and the scroll/new-message prompt control. Remove transcript notices and generic reasoning cards. Use one unboxed generic tool-call row for summaries and expandable full details, preserving specialized tool presentations.

Prune unused Beautiful UI demos, StreamText and glimm. Remove their exports and
Patterns catalog; use the retained production Tools pattern for chained calls,
with persistent leading chevrons, content-sized parameter chips and output-only
expansion. Anchor send notices beneath their message and center system events.

Remove unused ComputerHandoffCard source, types, styling and Storybook examples.

Expose reusable settings provider cards, tool/skill rows, filters, routine list/
table/status/action/delete and provider-connection components. Keep Dispatch's
existing compositions and permit host-owned actions, descriptions and agent-free
layouts. Remove unused Agent Exchange overlays. Preserve full tool/reasoning
output in scroll areas capped at 400px.

Retire capability proposals and default account-picker tools. Provision native
Tilde resource skills and the managed connection process for every agent. Render
native pending connector setup as an event card with controlled continuation
modals. Add scoped resource inventories and inner-call rendering for tool batches.
Expose form-dialog and screen-state compositions for external application reuse.
