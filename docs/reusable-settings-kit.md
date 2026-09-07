# Composable settings kit

Dispatch and another host can use the same card, row, description and editor
implementations while choosing different page layouts and ownership models.
All components below are public exports of `@tryopenbot/ui`; no new package is added.

| Area | Existing Dispatch composition | Public pieces for alternate layouts |
| --- | --- | --- |
| Tools and skills | PluginsCatalog / PluginsSettingsView | PluginProviderCard, PluginItemRow, PluginCategorySection, PluginSearchField, PluginCategoryFilter, PluginAgentFilter, PluginCatalogSkeleton |
| Routines | RoutineSettings / RoutinesSection | RoutineSettingsHeader, RoutineFilters, RoutineTable, RoutineTableRow, RoutineSummary, RoutineStatusBadge, RoutineActionsMenu, RoutineDeleteDialog, RoutineListItem |
| Routine connections | RoutineProvidersSettings | RoutineProviderCard, RoutineConnectionRow, existing SignalProviderDialog / SignalProviderGlyph |
| Routine editing | RoutineEditor | Existing TriggerCard, ScheduleEditor, EventTriggerEditor and native draft/trigger contracts |

## Using the pieces in Heyash

- Choose the host's page shell, sections, grid and navigation. Existing Dispatch
  compositions remain available and preserve their defaults.
- Supply native runtime data as the existing view models. Provider cards derive
  icon fallbacks and marks when callers omit them; their descriptions can use the
  native copy or a host-supplied description.
- Omit agent arrays/assignment callbacks and supply `PluginItemRow.actions` for a
  whole-Ash connection or skill toggle. `PluginProviderCard.trailing` is intended
  for a badge or other non-interactive content, since the provider card is itself
  an open-details button.
- Set `RoutineFilters.showAgentFilter={false}` and
  `RoutineTable.showAgentColumn={false}` when routines have a single owner. Use
  `renderActions` or `RoutineTableRow.actions` for a different action placement.
  A list can use `RoutineListItem` without the settings table or section wrapper.
- Use `RoutineProviderCard` independently of the searchable provider page, or
  compose its `RoutineConnectionRow` entries in another container. Their actions
  remain controlled through callbacks/slots.
- Reuse the existing routine editor and trigger/setup controls for editing.
  This slice does not duplicate editors or introduce a new network workflow.

## State and styling boundaries

The host/runtime owns catalogs, account operations, assignment mutations, routine
CRUD and provider setup continuation. Cards and rows receive state and callbacks.
Page-local filters, menu visibility and unsubmitted editor fields remain UI state.
Do not copy network orchestration into a visual component.

Menu primitives expose `menuClassName` so a scoped host theme can reach portal
content. Routine delete dialogs remain controlled and support pending/error state.
Use the existing stylesheet/Tailwind token contract; keep Heyash fonts, GPU
backgrounds, theme values and page layout in Heyash. Interactive Next consumers
must render these hooks/controls through an appropriate client boundary.

## Catalog and validation

`Dispatch / Settings / Tools`, `Skills` and `Routines` demonstrate individual
components and alternate compositions with working local callbacks. They do not
perform real account mutations. Default Dispatch compositions use the same public
implementations, rather than separate copies.

Focused tests cover existing rendering and tool/skill assignment behavior. Browser
checks exercise custom actions, filtering, routine toggling/deletion and narrow
layouts. Closed catalog screenshots match the pre-extraction baseline at desktop
and mobile widths. The new source exports need a package build/snapshot update
before an external installed consumer can adopt them; this side task does not
modify Heyash's installed packages.
