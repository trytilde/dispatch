import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import type { Routine, SignalInstance, UpdateRoutineInput } from "@tryopenbot/client-runtime";
import {
  AgentDetailsPane,
  RoutineEditor,
  type RoutineDraftCommit,
  RoutinesSection,
  SignalProviderDialog,
  type SignalTestStatus,
} from "@tryopenbot/ui";
import { errorMessage, signalProviderById } from "@tryopenbot/client-runtime";
import { openBotRuntime } from "../runtime.js";

/**
 * Wires the agent details pane (routines + drill-in editor) and the signal
 * provider connect dialog to the client runtime store. Presentation lives in
 * @tryopenbot/ui; this container owns data and dispatch (ADR-0023).
 */

export interface AgentDetailsContainerProps {
  agentId: string;
  open: boolean;
  /** `undefined` = overview, `"new"` = draft, otherwise a routine group id. */
  routineParam: string | undefined;
  onClose: () => void;
  onOpenRoutine: (routineId: string | undefined) => void;
}

export function AgentDetailsContainer({
  agentId,
  open,
  routineParam,
  onClose,
  onOpenRoutine,
}: AgentDetailsContainerProps) {
  const routinesState = useStore(openBotRuntime.store, (state) => state.routines);
  const signals = useStore(openBotRuntime.store, (state) => state.signals);
  const sidebar = useStore(openBotRuntime.store, (state) => state.sidebar);
  const [saveFailed, setSaveFailed] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const [running, setRunning] = useState(false);
  const [togglePending, setTogglePending] = useState(false);
  const [connectProviderId, setConnectProviderId] = useState("");
  const [connectedInstance, setConnectedInstance] = useState<
    { instance: SignalInstance; nonce: number } | undefined
  >(undefined);
  const settledRef = useRef(false);
  const creatingRef = useRef(false);

  const routines = useMemo(
    () => routinesState.byAgentId[agentId] ?? [],
    [agentId, routinesState.byAgentId],
  );
  const settled = agentId in routinesState.byAgentId;
  if (settled) settledRef.current = true;

  useEffect(() => {
    if (!open || !agentId) return;
    openBotRuntime.actions.startRoutinePolling(agentId);
    void openBotRuntime.actions.refreshSignalProviders().catch(() => undefined);
    void openBotRuntime.actions.refreshSignalInstances().catch(() => undefined);
    return () => openBotRuntime.actions.stopRoutinePolling();
  }, [agentId, open]);

  const routine =
    routineParam && routineParam !== "new"
      ? routines.find((candidate) => candidate.id === routineParam)
      : undefined;
  const isDraft = routineParam === "new";
  const routineLevel = isDraft || Boolean(routine);

  // A deep link to a routine that no longer exists lands on the overview.
  useEffect(() => {
    if (routineParam && routineParam !== "new" && settled && !routine) onOpenRoutine(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to list settles
  }, [routine, routineParam, settled]);

  // Load run-history deliveries for the open routine's event triggers.
  const eventInstanceIds = (routine?.triggers ?? [])
    .flatMap((trigger) => (trigger.kind === "event" ? [trigger.instance_id] : []))
    .join(",");
  useEffect(() => {
    if (!eventInstanceIds) return;
    for (const instanceId of eventInstanceIds.split(",")) {
      void openBotRuntime.actions.refreshSignalDeliveries(instanceId).catch(() => undefined);
    }
  }, [eventInstanceIds]);

  // Reset transient editor state when the target changes.
  useEffect(() => {
    setSaveFailed(false);
    setDeleteFailed(false);
    setRunning(false);
  }, [routineParam]);

  async function updateRoutine(input: UpdateRoutineInput): Promise<void> {
    if (!routine) return;
    const toggling = input.enabled !== undefined;
    if (toggling) setTogglePending(true);
    try {
      await openBotRuntime.actions.updateRoutine(routine.id, agentId, input);
      setSaveFailed(false);
    } catch {
      setSaveFailed(true);
    } finally {
      if (toggling) setTogglePending(false);
    }
  }

  async function createDraft(input: RoutineDraftCommit): Promise<void> {
    if (creatingRef.current) return;
    creatingRef.current = true;
    const priorIds = new Set(routines.map((candidate) => candidate.id));
    try {
      await openBotRuntime.actions.createRoutine({
        agentId,
        name: input.name,
        instruction: input.instruction,
        enabled: input.enabled,
        triggers: input.triggers,
      });
      setSaveFailed(false);
      const created = (openBotRuntime.store.getState().routines.byAgentId[agentId] ?? []).find(
        (candidate: Routine) => !priorIds.has(candidate.id),
      );
      if (created) onOpenRoutine(created.id);
    } catch {
      setSaveFailed(true);
    } finally {
      creatingRef.current = false;
    }
  }

  async function deleteRoutine(): Promise<void> {
    if (!routine) {
      onOpenRoutine(undefined);
      return;
    }
    try {
      await openBotRuntime.actions.deleteRoutine(routine.id, agentId);
      setDeleteFailed(false);
      onOpenRoutine(undefined);
    } catch {
      setDeleteFailed(true);
    }
  }

  async function testRun(): Promise<void> {
    if (!routine || running) return;
    setRunning(true);
    try {
      await openBotRuntime.actions.runRoutine(routine.id, agentId);
    } catch {
      setSaveFailed(true);
    } finally {
      setRunning(false);
    }
  }

  function selectSession(sessionId: string): void {
    const agent = sidebar.agents.find((candidate) => candidate.id === agentId);
    const session = agent?.sessions.items.find((candidate) => candidate.id === sessionId);
    if (session) void openBotRuntime.actions.selectSession(agentId, session);
  }

  const connectProvider = connectProviderId
    ? signalProviderById(signals.providers, connectProviderId)
    : undefined;

  return (
    <>
      <AgentDetailsPane
        {...(routineLevel
          ? { backLabel: "Back to Routines", onBack: () => onOpenRoutine(undefined) }
          : {})}
        onClose={onClose}
        open={open}
        title={routineLevel ? "Routine" : "Details"}
      >
        {routineLevel ? (
          <RoutineEditor
            connectedInstance={connectedInstance}
            deliveriesByInstanceId={signals.deliveriesByInstanceId}
            deleteFailed={deleteFailed}
            instances={signals.instances}
            onConnectProvider={setConnectProviderId}
            onCreateDraft={(input) => void createDraft(input)}
            onDelete={() => void deleteRoutine()}
            onSelectSession={selectSession}
            onTestRun={() => void testRun()}
            onUpdate={(input) => void updateRoutine(input)}
            providers={signals.providers}
            routine={routine ?? null}
            running={running}
            saveFailed={saveFailed}
            togglePending={togglePending}
          />
        ) : (
          <RoutinesSection
            onCreate={() => onOpenRoutine("new")}
            onOpen={onOpenRoutine}
            providers={signals.providers}
            routines={routines}
            settled={settledRef.current}
          />
        )}
      </AgentDetailsPane>
      {connectProvider ? (
        <SignalConnectContainer
          onClose={() => setConnectProviderId("")}
          onConnected={(instance) =>
            setConnectedInstance((current) => ({ instance, nonce: (current?.nonce ?? 0) + 1 }))
          }
          providerTypeId={connectProvider.type_id}
        />
      ) : null}
    </>
  );
}

export interface SignalConnectContainerProps {
  providerTypeId: string;
  onClose: () => void;
  /** Fires when the dialog closes after a connection was created. */
  onConnected?: (instance: SignalInstance) => void;
}

export function SignalConnectContainer({
  providerTypeId,
  onClose,
  onConnected,
}: SignalConnectContainerProps) {
  const signals = useStore(openBotRuntime.store, (state) => state.signals);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [instance, setInstance] = useState<SignalInstance | undefined>(undefined);
  const [testStatus, setTestStatus] = useState<SignalTestStatus>("idle");
  const [testError, setTestError] = useState("");

  useEffect(() => {
    if (signals.providers.length === 0) {
      void openBotRuntime.actions.refreshSignalProviders().catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recover the catalog once
  }, []);

  const provider = signalProviderById(signals.providers, providerTypeId);
  if (!provider) return null;

  async function create(input: { displayName: string; signingSecret?: string }): Promise<void> {
    setCreating(true);
    setError("");
    try {
      const created = await openBotRuntime.actions.createSignalInstance({
        providerType: providerTypeId,
        displayName: input.displayName,
        ...(input.signingSecret ? { signingSecret: input.signingSecret } : {}),
      });
      setInstance(created);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setCreating(false);
    }
  }

  async function test(): Promise<void> {
    if (!instance) return;
    setTestStatus("sending");
    setTestError("");
    try {
      await openBotRuntime.actions.testSignalInstance(instance.id);
      setTestStatus("delivered");
    } catch (reason) {
      setTestStatus("failed");
      setTestError(errorMessage(reason));
    }
  }

  function close(): void {
    if (instance) onConnected?.(instance);
    onClose();
  }

  return (
    <SignalProviderDialog
      creating={creating}
      {...(error ? { error } : {})}
      instance={instance}
      onClose={close}
      onCreate={(input) => void create(input)}
      onTest={() => void test()}
      open
      provider={provider}
      testError={testError}
      testStatus={testStatus}
    />
  );
}
