import { useMemo, useState } from "react";
import type { Routine, SignalProvider } from "@tryopenbot/client-runtime";
import {
  RoutineSettingsHeader,
  RoutineFilters,
  RoutineTable,
  RoutineDeleteDialog,
  type RoutineStatusFilter,
} from "./routine-components.js";

export interface RoutineSettingsRow {
  routine: Routine;
  botName: string;
}

export interface RoutineSettingsProps {
  rows: readonly RoutineSettingsRow[];
  providers: readonly SignalProvider[];
  settled: boolean;
  error?: string;
  onCreate: () => void;
  onEdit: (routine: Routine) => void;
  onToggle: (routine: Routine, enabled: boolean) => void;
  onDelete: (routine: Routine) => void;
}

export function RoutineSettings({
  rows,
  providers,
  settled,
  error,
  onCreate,
  onEdit,
  onToggle,
  onDelete,
}: RoutineSettingsProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<RoutineStatusFilter>("all");
  const [bot, setBot] = useState("all");
  const [deleting, setDeleting] = useState<Routine | null>(null);
  const bots = useMemo(
    () => [...new Set(rows.map((row) => row.botName))].sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(({ routine, botName }) => {
      if (status === "enabled" && !routine.enabled) return false;
      if (status === "paused" && routine.enabled) return false;
      if (bot !== "all" && botName !== bot) return false;
      return (
        !needle ||
        `${routine.name} ${routine.instruction} ${botName}`.toLowerCase().includes(needle)
      );
    });
  }, [bot, query, rows, status]);

  return (
    <section aria-label="Routines" className="mt-10 flex flex-col gap-4">
      <RoutineSettingsHeader onCreate={onCreate} />
      <RoutineFilters
        query={query}
        status={status}
        selectedAgent={bot}
        agentNames={bots}
        onQueryChange={setQuery}
        onStatusChange={setStatus}
        onAgentChange={setBot}
      />
      {error ? <p className="m-0 text-[12px] text-red">{error}</p> : null}
      <RoutineTable
        rows={filtered}
        providers={providers}
        settled={settled}
        emptyMessage={rows.length === 0 ? "No routines yet." : "No routines match these filters."}
        onEdit={onEdit}
        onToggle={onToggle}
        onDelete={setDeleting}
      />
      <RoutineDeleteDialog
        open={deleting !== null}
        name={deleting?.name ?? ""}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) onDelete(deleting);
          setDeleting(null);
        }}
      />
    </section>
  );
}
