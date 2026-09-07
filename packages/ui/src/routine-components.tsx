import type { ReactNode } from "react";
import { MoreHorizontalIcon, SearchIcon } from "lucide-react";
import { routineDetail, type Routine, type SignalProvider } from "@tryopenbot/client-runtime";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu.js";
import { relativeRunTime } from "./relative-time.js";
import { DialogSurface } from "./overlay-components.js";
import { cn } from "./lib/utils.js";

export type RoutineStatusFilter = "all" | "enabled" | "paused";
export interface RoutineSettingsHeaderProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  onCreate: () => void;
}
export function RoutineSettingsHeader({
  title = "Routines",
  description = "Tasks your bots run on a schedule or when a connected service changes.",
  actionLabel = "Create routine",
  onCreate,
}: RoutineSettingsHeaderProps) {
  return (
    <div className="flex items-end justify-between gap-4 max-[720px]:items-start">
      <div>
        <h2 className="m-0 text-[15px] font-semibold text-ink">{title}</h2>
        <p className="mt-1 mb-0 text-[12.5px] text-ink-3">{description}</p>
      </div>
      <button
        className="h-9 shrink-0 rounded-control bg-ink px-3.5 text-[12.5px] font-medium text-surface"
        onClick={onCreate}
        type="button"
      >
        {actionLabel}
      </button>
    </div>
  );
}
export interface RoutineFiltersProps {
  query: string;
  status: RoutineStatusFilter;
  onQueryChange: (value: string) => void;
  onStatusChange: (value: RoutineStatusFilter) => void;
  selectedAgent?: string;
  agentNames?: readonly string[];
  onAgentChange?: (value: string) => void;
  showAgentFilter?: boolean;
  agentFilterLabel?: string;
  allAgentsLabel?: string;
}
export function RoutineFilters({
  query,
  status,
  onQueryChange,
  onStatusChange,
  selectedAgent = "all",
  agentNames = [],
  onAgentChange,
  showAgentFilter = true,
  agentFilterLabel = "Routine bot",
  allAgentsLabel = "All bots",
}: RoutineFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex h-9 min-w-[220px] flex-1 items-center gap-2 rounded-control border border-line bg-surface px-3">
        <SearchIcon aria-hidden className="size-4 text-ink-3" />
        <span className="sr-only">Search routines</span>
        <input
          className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none max-[720px]:text-base"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search routines"
          type="search"
          value={query}
        />
      </label>
      <select
        aria-label="Routine status"
        className="h-9 rounded-control border border-line bg-surface px-2.5 text-[12.5px] text-ink"
        onChange={(event) => onStatusChange(event.target.value as RoutineStatusFilter)}
        value={status}
      >
        <option value="all">All statuses</option>
        <option value="enabled">Enabled</option>
        <option value="paused">Paused</option>
      </select>
      {showAgentFilter ? (
        <select
          aria-label={agentFilterLabel}
          className="h-9 rounded-control border border-line bg-surface px-2.5 text-[12.5px] text-ink"
          onChange={(event) => onAgentChange?.(event.target.value)}
          value={selectedAgent}
        >
          <option value="all">{allAgentsLabel}</option>
          {agentNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}
export function RoutineSummary({
  routine,
  onOpen,
}: {
  routine: Routine;
  onOpen: (routine: Routine) => void;
}) {
  return (
    <button className="min-w-0 text-left" onClick={() => onOpen(routine)} type="button">
      <strong className="block truncate text-[13px] font-medium text-ink">{routine.name}</strong>
      <small className="block truncate text-[11.5px] text-ink-3">{routine.instruction}</small>
    </button>
  );
}
export function RoutineStatusBadge({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`w-fit rounded-full px-2 py-0.5 text-[10.5px] font-medium ${enabled ? "bg-green/10 text-green" : "bg-hover text-ink-3"}`}
    >
      {enabled ? "Enabled" : "Paused"}
    </span>
  );
}
export interface RoutineActionsMenuProps {
  menuClassName?: string;
  routine: Routine;
  onEdit: (routine: Routine) => void;
  onToggle: (routine: Routine, enabled: boolean) => void;
  onDelete: (routine: Routine) => void;
}
export function RoutineActionsMenu({
  menuClassName,
  routine,
  onEdit,
  onToggle,
  onDelete,
}: RoutineActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`Actions for ${routine.name}`}
          className="grid size-8 place-items-center rounded-control text-ink-3 hover:bg-hover"
          type="button"
        >
          <MoreHorizontalIcon aria-hidden className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={menuClassName}>
        <DropdownMenuItem onSelect={() => onEdit(routine)}>Edit</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onToggle(routine, !routine.enabled)}>
          {routine.enabled ? "Pause" : "Enable"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-red data-[highlighted]:text-red"
          onSelect={() => onDelete(routine)}
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
export interface RoutineTableRowProps {
  routine: Routine;
  botName?: string;
  providers?: readonly SignalProvider[];
  description?: string;
  showAgentColumn?: boolean;
  onEdit: (routine: Routine) => void;
  actions?: ReactNode;
}
export function RoutineTableRow({
  routine,
  botName,
  providers = [],
  description,
  showAgentColumn = true,
  onEdit,
  actions,
}: RoutineTableRowProps) {
  return (
    <div
      className={cn(
        `grid min-h-14 grid-cols-[minmax(180px,1.5fr)_minmax(110px,.7fr)_minmax(180px,1fr)_90px_110px_40px] items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0 max-[760px]:grid-cols-[1fr_auto] max-[760px]:gap-x-2 max-[760px]:gap-y-1`,
        !showAgentColumn && "grid-cols-[minmax(180px,1.5fr)_minmax(180px,1fr)_90px_110px_40px]",
      )}
    >
      <RoutineSummary routine={routine} onOpen={onEdit} />

      {showAgentColumn ? (
        <span className="truncate text-[12.5px] text-ink-2 max-[760px]:col-start-1 max-[760px]:row-start-2">
          {botName}
        </span>
      ) : null}

      <span className="truncate text-[12px] text-ink-2 max-[760px]:col-start-1">
        {description ?? routineDetail(routine, [...providers])}
      </span>
      <RoutineStatusBadge enabled={routine.enabled} />

      <span className="text-[11.5px] text-ink-3 max-[760px]:hidden">
        {routine.last_run_at ? relativeRunTime(routine.last_run_at) : "Not run"}
      </span>
      {actions}
    </div>
  );
}
export interface RoutineTableProps extends Omit<RoutineActionsMenuProps, "routine"> {
  rows: readonly { routine: Routine; botName?: string }[];
  providers?: readonly SignalProvider[];
  settled?: boolean;
  emptyMessage?: string;
  showAgentColumn?: boolean;
  agentHeading?: string;
  renderActions?: (routine: Routine) => ReactNode;
}
export function RoutineTable({
  menuClassName,
  rows,
  providers = [],
  settled = true,
  emptyMessage = "No routines yet.",
  showAgentColumn = true,
  agentHeading = "Bot",
  onEdit,
  onToggle,
  onDelete,
  renderActions,
}: RoutineTableProps) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
      <div
        className={cn(
          "grid grid-cols-[minmax(180px,1.5fr)_minmax(110px,.7fr)_minmax(180px,1fr)_90px_110px_40px] gap-3 border-b border-line px-4 py-2 text-[10px] font-semibold uppercase tracking-[.06em] text-ink-3 max-[760px]:hidden",
          !showAgentColumn && "grid-cols-[minmax(180px,1.5fr)_minmax(180px,1fr)_90px_110px_40px]",
        )}
      >
        <span>Routine</span>
        {showAgentColumn ? <span>{agentHeading}</span> : null}
        <span>Starts when</span>
        <span>Status</span>
        <span>Last run</span>
        <span />
      </div>
      {rows.map(({ routine, botName }) => (
        <RoutineTableRow
          key={routine.id}
          routine={routine}
          botName={botName}
          providers={providers}
          showAgentColumn={showAgentColumn}
          onEdit={onEdit}
          actions={
            renderActions ? (
              renderActions(routine)
            ) : (
              <RoutineActionsMenu
                menuClassName={menuClassName}
                routine={routine}
                onEdit={onEdit}
                onToggle={onToggle}
                onDelete={onDelete}
              />
            )
          }
        />
      ))}
      {rows.length === 0 && settled ? (
        <div className="px-4 py-8 text-center text-[12.5px] text-ink-3">{emptyMessage}</div>
      ) : null}
    </div>
  );
}
export interface RoutineDeleteDialogProps {
  open: boolean;
  name: string;
  onClose: () => void;
  onConfirm: () => void;
  pending?: boolean;
  error?: string;
}
export function RoutineDeleteDialog({
  open,
  name,
  onClose,
  onConfirm,
  pending = false,
  error,
}: RoutineDeleteDialogProps) {
  return (
    <DialogSurface
      open={open}
      title={`Delete "${name}"?`}
      description="This removes the routine and stops all future runs. This can't be undone."
      onClose={pending ? undefined : onClose}
      actions={
        <>
          <button onClick={onClose} disabled={pending} type="button">
            Cancel
          </button>
          <button
            className="primary destructive"
            disabled={pending}
            onClick={onConfirm}
            type="button"
          >
            Delete
          </button>
        </>
      }
    >
      {error ? (
        <p role="alert" className="text-red">
          {error}
        </p>
      ) : null}
    </DialogSurface>
  );
}
