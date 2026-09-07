import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useStore } from "zustand";
import { errorMessage, type SignalInstance } from "@tryopenbot/client-runtime";
import {
  connectorAuthorizedReturnUrl,
  createChatConnectorRuntime,
  type ChatAgent,
} from "@tryopenbot/client-runtime";
import {
  BotSelectionDialog,
  PluginsSettingsView,
  ChatConnectorDialog,
  Dialog,
  DialogContent,
  DialogTitle,
  AppearanceSettings,
  SettingsShell,
  SettingsContent,
  type SettingsSection,
  getThemePreference,
  RoutineEditor,
  RoutineProvidersSettings,
  RoutineSettings,
  setThemePreference,
  type ThemePreference,
} from "@tryopenbot/ui";
import { openBotRuntime } from "../runtime.js";
import { SignalConnectContainer } from "./agent-details.js";

export interface SettingsAppProps {
  section?: SettingsSection;
}

function PluginsSettings({
  agents,
  kind,
}: {
  agents: readonly ChatAgent[];
  kind: "tools" | "skills";
}) {
  const plugins = openBotRuntime.plugins;
  const state = useStore(plugins.store);
  const connection = useMemo(
    () =>
      createChatConnectorRuntime(openBotRuntime.client, {
        openAuthorization: (url) => {
          window.open(url, "_blank", "noopener");
        },
        returnUrl: () =>
          connectorAuthorizedReturnUrl(
            window.location.origin,
            navigator.userAgent.includes("Electron") ? "electron" : "web",
          ),
        onProviderComplete: (id) => {
          if (id) plugins.accountCreated(id);
          else void plugins.refresh();
        },
        saveSecretOutputs: (outputs) => {
          const url = URL.createObjectURL(
            new Blob([JSON.stringify(outputs, null, 2)], { type: "application/json" }),
          );
          const link = document.createElement("a");
          link.href = url;
          link.download = "provider-credentials.json";
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        },
      }),
    [plugins],
  );
  const connectionState = useStore(connection.store);
  const setupState = useStore(connection.setup.store);
  const agentIdsKey = agents.map((agent) => agent.id).join("\0");
  useEffect(() => {
    void plugins.refresh(true);
  }, [plugins, agentIdsKey]);
  useEffect(() => () => connection.dispose(), [connection]);
  return (
    <>
      <PluginsSettingsView
        {...state}
        onScopeChange={(scope) => void plugins.setScope(scope)}
        agents={agents}
        kind={kind}
        setup={null}
        onAddToolAccount={(id) => {
          const provider = state.catalog.tools.find(
            (group) => group.provider.type_id === id,
          )?.provider;
          if (provider) connection.openProvider(provider);
        }}
        onDeleteToolAccounts={plugins.deleteAccounts}
        onSetToolAccount={async (...args) => {
          await plugins.setTool(...args);
        }}
        onSetSkill={async (...args) => {
          await plugins.setSkill(...args);
        }}
        onCloseSetup={connection.close}
        onReopenAuthorization={connection.reopenAuthorization}
        onSubmitSetup={(input) => {
          const provider = connectionState.provider;
          if (provider) void connection.submit({ ...input, providerTypeId: provider.type_id });
        }}
        onCloseAssignment={plugins.dismissAssignment}
        onAssignAccount={(id) => void plugins.assignCreatedAccount(id)}
      />
      <ChatConnectorDialog
        state={connectionState}
        setup={setupState}
        onClose={connection.close}
        onRetry={connection.retry}
        onDownloadOutputs={() => void connection.downloadOutputs()}
        onSubmit={(input) => void connection.submit(input)}
        onResume={(input) => void connection.resume(input)}
        onReopenAuthorization={() => connection.reopenAuthorization()}
      />
    </>
  );
}

export function SettingsApp({ section = "general" }: SettingsAppProps = {}) {
  const navigate = useNavigate();
  const [theme, setTheme] = useState<ThemePreference>(() => getThemePreference());
  const agents = useStore(openBotRuntime.store, (state) => state.sidebar.agents);
  const macDesktop = window.openbotDesktop?.platform === "mac";

  return (
    <SettingsShell
      section={section}
      macDesktop={macDesktop}
      onBack={() => void navigate({ to: "/" })}
      onNavigate={(to) => void navigate({ to })}
    >
      {section === "tools" || section === "skills" ? (
        <SettingsContent width="wide">
          <PluginsSettings agents={agents} kind={section} />
        </SettingsContent>
      ) : section === "routines" ? (
        <SettingsContent width="wide">
          <RoutineSettingsContainer agents={agents} />
        </SettingsContent>
      ) : (
        <SettingsContent width="constrained">
          <AppearanceSettings
            theme={theme}
            onThemeChange={(value) => {
              setThemePreference(value);
              setTheme(value);
            }}
          />
        </SettingsContent>
      )}
    </SettingsShell>
  );
}

function RoutineSettingsContainer({ agents }: { agents: readonly ChatAgent[] }) {
  const signals = useStore(openBotRuntime.store, (state) => state.signals);
  const routines = useStore(openBotRuntime.store, (state) => state.routines);
  const [connectProviderId, setConnectProviderId] = useState("");
  const [creatingForBot, setCreatingForBot] = useState(false);
  const [editing, setEditing] = useState<{ agentId: string; routineId: string | null } | null>(
    null,
  );
  const [running, setRunning] = useState(false);
  const creatingRef = useRef(false);
  const [rowNotices, setRowNotices] = useState<
    Record<string, { text: string; tone: "success" | "danger" }>
  >({});
  const noticeTimersRef = useRef<Record<string, number>>({});

  useEffect(() => {
    void openBotRuntime.actions.refreshSignalProviders().catch(() => undefined);
    void openBotRuntime.actions.refreshSignalInstances().catch(() => undefined);
  }, []);

  const agentIdsKey = agents.map((agent) => agent.id).join("\0");
  useEffect(() => {
    void Promise.all(agents.map((agent) => openBotRuntime.actions.refreshRoutines(agent.id))).catch(
      () => undefined,
    );
    // Bot identity, not array identity, controls the remote snapshots.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentIdsKey]);

  const routineRows = agents.flatMap((agent) =>
    (routines.byAgentId[agent.id] ?? []).map((routine) => ({
      routine,
      botName: agent.display_name,
    })),
  );
  const editedRoutine = editing?.routineId
    ? ((routines.byAgentId[editing.agentId] ?? []).find(
        (routine) => routine.id === editing.routineId,
      ) ?? null)
    : null;

  const timers = noticeTimersRef.current;
  useEffect(
    () => () => {
      for (const timer of Object.values(timers)) window.clearTimeout(timer);
    },
    [timers],
  );

  function notice(instanceId: string, text: string, tone: "success" | "danger"): void {
    setRowNotices((current) => ({ ...current, [instanceId]: { text, tone } }));
    window.clearTimeout(timers[instanceId]);
    timers[instanceId] = window.setTimeout(() => {
      delete timers[instanceId];
      setRowNotices((current) => {
        const { [instanceId]: _dropped, ...rest } = current;
        return rest;
      });
    }, 4000);
  }

  async function withNotice(
    instance: SignalInstance,
    operation: () => Promise<void>,
    successText?: string,
  ): Promise<void> {
    try {
      await operation();
      if (successText) notice(instance.id, successText, "success");
    } catch (reason) {
      notice(instance.id, errorMessage(reason), "danger");
    }
  }

  return (
    <>
      <RoutineProvidersSettings
        error={signals.error || undefined}
        instances={signals.instances}
        onConnectProvider={setConnectProviderId}
        onDeleteInstance={(instance) =>
          void withNotice(instance, () => openBotRuntime.actions.deleteSignalInstance(instance.id))
        }
        onToggleInstance={(instance, enabled) =>
          void withNotice(instance, async () => {
            await openBotRuntime.actions.updateSignalInstance(instance.id, {
              status: enabled ? "enabled" : "disabled",
            });
          })
        }
        providers={signals.providers}
        rowNotices={rowNotices}
        settled={signals.status === "ready" || signals.status === "error"}
      />
      <RoutineSettings
        error={routines.error || undefined}
        onCreate={() => setCreatingForBot(true)}
        onDelete={(routine) =>
          void openBotRuntime.actions.deleteRoutine(routine.id, routine.agent_id)
        }
        onEdit={(routine) => setEditing({ agentId: routine.agent_id, routineId: routine.id })}
        onToggle={(routine, enabled) =>
          void openBotRuntime.actions.updateRoutine(routine.id, routine.agent_id, { enabled })
        }
        providers={signals.providers}
        rows={routineRows}
        settled={routines.status === "ready" || routines.status === "error"}
      />
      <BotSelectionDialog
        agents={agents.map((agent) => ({ id: agent.id, name: agent.display_name }))}
        onClose={() => setCreatingForBot(false)}
        onSelect={(agentId) => {
          setCreatingForBot(false);
          setEditing({ agentId, routineId: null });
        }}
        open={creatingForBot}
        title="Choose a bot for this routine"
      />
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="mobile-fullscreen-dialog flex h-[min(820px,calc(100dvh-32px))] max-w-[760px] flex-col overflow-hidden p-0">
          <DialogTitle className="sr-only">
            {editedRoutine ? `Edit ${editedRoutine.name}` : "Create routine"}
          </DialogTitle>
          {editing ? (
            <RoutineEditor
              deleteFailed={false}
              deliveriesByInstanceId={signals.deliveriesByInstanceId}
              instances={signals.instances}
              onConnectProvider={setConnectProviderId}
              onCreateDraft={(input) => {
                if (creatingRef.current) return;
                creatingRef.current = true;
                const prior = new Set(
                  (openBotRuntime.store.getState().routines.byAgentId[editing.agentId] ?? []).map(
                    (routine) => routine.id,
                  ),
                );
                void openBotRuntime.actions
                  .createRoutine({ agentId: editing.agentId, ...input })
                  .then(() => {
                    const created = (
                      openBotRuntime.store.getState().routines.byAgentId[editing.agentId] ?? []
                    ).find((routine) => !prior.has(routine.id));
                    if (created) setEditing({ agentId: editing.agentId, routineId: created.id });
                  })
                  .finally(() => {
                    creatingRef.current = false;
                  });
              }}
              onDelete={() => {
                if (!editedRoutine) return setEditing(null);
                void openBotRuntime.actions
                  .deleteRoutine(editedRoutine.id, editing.agentId)
                  .then(() => setEditing(null));
              }}
              onSelectSession={() => setEditing(null)}
              onTestRun={() => {
                if (!editedRoutine || running) return;
                setRunning(true);
                void openBotRuntime.actions
                  .runRoutine(editedRoutine.id, editing.agentId)
                  .finally(() => setRunning(false));
              }}
              onUpdate={(input) => {
                if (editedRoutine)
                  void openBotRuntime.actions.updateRoutine(
                    editedRoutine.id,
                    editing.agentId,
                    input,
                  );
              }}
              providers={signals.providers}
              routine={editedRoutine}
              running={running}
              saveFailed={false}
              togglePending={false}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      {connectProviderId ? (
        <SignalConnectContainer
          onClose={() => setConnectProviderId("")}
          providerTypeId={connectProviderId}
        />
      ) : null}
    </>
  );
}

export function SettingsGeneralApp() {
  return <SettingsApp section="general" />;
}

export function SettingsPluginsApp() {
  return <SettingsApp section="tools" />;
}

export function SettingsSignalsApp() {
  return <SettingsApp section="routines" />;
}

export function SettingsToolsApp() {
  return <SettingsApp section="tools" />;
}

export function SettingsSkillsApp() {
  return <SettingsApp section="skills" />;
}

export function SettingsRoutinesApp() {
  return <SettingsApp section="routines" />;
}
