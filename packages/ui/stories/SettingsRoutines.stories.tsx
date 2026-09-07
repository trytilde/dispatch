import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import type { Routine, SignalProvider, SignalInstance } from "@tryopenbot/client-runtime";
import {
  RoutineSettings,
  RoutineProviderCard,
  RoutineSettingsHeader,
  RoutineFilters,
  RoutineTable,
  RoutineListItem,
  RoutineStatusBadge,
  RoutineDeleteDialog,
  type RoutineStatusFilter,
} from "@tryopenbot/ui";
const meta = {
  title: "Dispatch/Settings/Routines",
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 1060, margin: "0 auto", padding: 24 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const initial: Routine[] = [
  {
    id: "morning",
    agent_id: "assistant",
    name: "Morning review",
    instruction: "Summarize overnight changes.",
    enabled: true,
    triggers: [
      {
        id: "morning-trigger",
        kind: "schedule",
        schedule: "0 7 * * *",
        description: "Daily at 07:00 UTC",
        next_run_at: null,
      },
    ],
    created_at: "2026-09-07T10:00:00Z",
    updated_at: "2026-09-07T10:00:00Z",
  },
  {
    id: "weekly",
    agent_id: "assistant",
    name: "Weekly digest",
    instruction: "Collect the important updates from this week.",
    enabled: false,
    triggers: [
      {
        id: "weekly-trigger",
        kind: "schedule",
        schedule: "0 9 * * 1",
        description: "Every Monday at 09:00 UTC",
        next_run_at: null,
      },
    ],
    created_at: "2026-09-07T10:00:00Z",
    updated_at: "2026-09-07T10:00:00Z",
  },
];
function RoutinesExample({ custom = false }: { custom?: boolean }) {
  const [routines, setRoutines] = useState(initial);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<RoutineStatusFilter>("all");
  const [deleting, setDeleting] = useState<Routine | null>(null);
  const [opened, setOpened] = useState("");
  const toggle = (routine: Routine, enabled: boolean) =>
    setRoutines((current) =>
      current.map((item) => (item.id === routine.id ? { ...item, enabled } : item)),
    );
  const visible = routines.filter(
    (item) =>
      `${item.name} ${item.instruction}`.toLowerCase().includes(query.toLowerCase()) &&
      (status === "all" || item.enabled === (status === "enabled")),
  );
  return (
    <>
      {custom ? (
        <div className="grid gap-4">
          <RoutineSettingsHeader
            description="Recurring work for this workspace."
            actionLabel="New recurring task"
            onCreate={() => setOpened("New routine")}
          />
          <RoutineFilters
            query={query}
            status={status}
            onQueryChange={setQuery}
            onStatusChange={setStatus}
            showAgentFilter={false}
          />
          <RoutineTable
            rows={visible.map((routine) => ({ routine }))}
            showAgentColumn={false}
            emptyMessage={routines.length ? "No routines match these filters." : "No routines yet."}
            onEdit={(routine) => setOpened(routine.name)}
            onToggle={toggle}
            onDelete={setDeleting}
          />
          <RoutineDeleteDialog
            open={Boolean(deleting)}
            name={deleting?.name ?? ""}
            onClose={() => setDeleting(null)}
            onConfirm={() => {
              setRoutines((current) => current.filter((item) => item.id !== deleting?.id));
              setDeleting(null);
            }}
          />
        </div>
      ) : (
        <RoutineSettings
          rows={routines.map((routine) => ({ routine, botName: "Assistant" }))}
          providers={[]}
          settled
          onCreate={() => setOpened("New routine")}
          onEdit={(routine) => setOpened(routine.name)}
          onToggle={toggle}
          onDelete={(routine) =>
            setRoutines((current) => current.filter((item) => item.id !== routine.id))
          }
        />
      )}
      {opened ? <p role="status">Opened {opened}</p> : null}
    </>
  );
}
export const DispatchComposition: Story = { render: () => <RoutinesExample /> };
export const CustomComposition: Story = { render: () => <RoutinesExample custom /> };
function CompactRowsExample() {
  const [opened, setOpened] = useState("");
  return (
    <>
      <div className="grid gap-1">
        {initial.map((routine) => (
          <RoutineListItem key={routine.id} routine={routine} onOpen={setOpened} />
        ))}
      </div>
      {opened ? <p role="status">Opened {opened}</p> : null}
    </>
  );
}
export const CompactRows: Story = { render: () => <CompactRowsExample /> };
export const Status: Story = {
  render: () => (
    <div className="flex gap-3">
      <RoutineStatusBadge enabled />
      <RoutineStatusBadge enabled={false} />
    </div>
  ),
};

const provider: SignalProvider = {
  type_id: "github",
  name: "GitHub",
  documentation: "Start a routine when repositories change.",
  instructions: "Connect the repository webhook.",
  auth_methods: ["webhook"],
  requires_signing_key: true,
  signing_key_description: "Webhook signing key",
  route_path: "events",
  signal_types: [],
  credential_sources: [],
  interpolation_variables: [],
};
const connection: SignalInstance = {
  id: "github-connection",
  display_name: "Workspace repository",
  provider_type: "github",
  status: "enabled",
  ingress_mode: "webhook",
  webhook_url: "https://example.test/webhook",
  poll_interval_seconds: null,
  last_error: null,
  created_at: "2026-09-07T10:00:00Z",
  updated_at: "2026-09-07T10:00:00Z",
};
function ProviderCardExample() {
  const [instances, setInstances] = useState<SignalInstance[]>([]);
  return (
    <RoutineProviderCard
      provider={provider}
      instances={instances}
      onConnectProvider={() => setInstances([connection])}
      onToggleInstance={(selected, enabled) =>
        setInstances((current) =>
          current.map((instance) =>
            instance.id === selected.id
              ? { ...instance, status: enabled ? "enabled" : "paused" }
              : instance,
          ),
        )
      }
      onDeleteInstance={(selected) =>
        setInstances((current) => current.filter((instance) => instance.id !== selected.id))
      }
    />
  );
}
export const ProviderCard: Story = { render: () => <ProviderCardExample /> };
