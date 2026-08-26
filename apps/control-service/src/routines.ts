import type { Hono } from "hono";
import {
  pageItems,
  text,
  tildeJson,
  tildeOptionsFromEnvironment,
  tildePages,
  tildeUnavailable,
  tildeUpstreamFailure,
  valueRecord,
  type TildeRouteOptions,
} from "./tilde-upstream.js";

export type RoutineRouteOptions = TildeRouteOptions;

interface JsonEqualsPredicate {
  path: string;
  value: unknown;
}

interface ScheduleTriggerSpec {
  kind: "schedule";
  id?: string;
  schedule: string;
}

interface EventTriggerSpec {
  kind: "event";
  id?: string;
  instanceId: string;
  signalType: string;
  filters?: JsonEqualsPredicate[];
}

type TriggerSpec = ScheduleTriggerSpec | EventTriggerSpec;

interface CreateRoutineBody {
  agentId: string;
  name: string;
  instruction: string;
  enabled: boolean;
  triggers: TriggerSpec[];
}

interface UpdateRoutineBody {
  name?: string;
  instruction?: string;
  enabled?: boolean;
  triggers?: TriggerSpec[];
}

interface SignalTypeCatalogEntry {
  default_session_key_template?: string;
  default_session_title_template?: string | null;
}

interface UpstreamTrigger {
  id: string;
  kind: "schedule" | "event";
  enabled?: boolean;
  schedule?: string;
  schedule_description?: string | null;
  next_run_at?: string | null;
  last_run_at?: string | null;
  last_session_id?: string | null;
  last_error?: string | null;
  signal_provider_instance_id?: string;
  signal_type?: string;
  filter?: { json_equals?: JsonEqualsPredicate[] };
}

interface UpstreamRoutine {
  id: string;
  agent_inbox_id?: string | null;
  title?: string;
  prompt?: string | null;
  enabled?: boolean;
  version?: number;
  triggers?: UpstreamTrigger[];
  created_at?: string;
  updated_at?: string;
}

/** Owner-facing routes backed directly by Tilde's native unified Routine API. */
export function registerRoutineRoutes(app: Hono, configuredOptions?: RoutineRouteOptions): void {
  const options = (): RoutineRouteOptions | undefined =>
    configuredOptions ?? tildeOptionsFromEnvironment();

  app.get("/api/routines", async (context) => {
    const resolved = options();
    if (!resolved) return tildeUnavailable(context, "Routines");
    const agentId = context.req.query("agent_id")?.trim();
    if (!agentId) return context.json({ error: "agent_id is required" }, 400);
    try {
      return context.json({ items: await listRoutines(resolved, agentId) });
    } catch (error) {
      return tildeUpstreamFailure(context, "routines", error);
    }
  });

  app.post("/api/routines", async (context) => {
    const resolved = options();
    if (!resolved) return tildeUnavailable(context, "Routines");
    let body: CreateRoutineBody;
    try {
      body = parseCreateRoutineBody(await context.req.json());
    } catch (error) {
      return context.json({ error: error instanceof Error ? error.message : "Invalid body" }, 400);
    }
    try {
      const catalog = new SignalTypeCatalog(resolved);
      await tildeJson(resolved, "/routines", {
        method: "POST",
        body: {
          agent_inbox_id: body.agentId,
          title: body.name,
          prompt: body.instruction,
          enabled: body.enabled,
          triggers: await Promise.all(
            body.triggers.map((trigger) => upstreamTrigger(catalog, trigger, body)),
          ),
        },
      });
      return context.json({ items: await listRoutines(resolved, body.agentId) }, 201);
    } catch (error) {
      return tildeUpstreamFailure(context, "routines", error);
    }
  });

  app.patch("/api/routines/:routineId", async (context) => {
    const resolved = options();
    if (!resolved) return tildeUnavailable(context, "Routines");
    const agentId = context.req.query("agent_id")?.trim();
    if (!agentId) return context.json({ error: "agent_id is required" }, 400);
    let body: UpdateRoutineBody;
    try {
      body = parseUpdateRoutineBody(await context.req.json());
    } catch (error) {
      return context.json({ error: error instanceof Error ? error.message : "Invalid body" }, 400);
    }
    try {
      const routineId = context.req.param("routineId");
      const current = (await tildeJson(
        resolved,
        `/routines/${encodeURIComponent(routineId)}`,
      )) as UpstreamRoutine;
      if (current.agent_inbox_id !== agentId)
        return context.json({ error: "Routine not found" }, 404);
      const catalog = new SignalTypeCatalog(resolved);
      await tildeJson(resolved, `/routines/${encodeURIComponent(routineId)}`, {
        method: "PATCH",
        body: {
          ...(body.name !== undefined ? { title: body.name } : {}),
          ...(body.instruction !== undefined ? { prompt: body.instruction } : {}),
          ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
          ...(body.triggers !== undefined
            ? {
                triggers: await Promise.all(
                  body.triggers.map((trigger) =>
                    upstreamTrigger(catalog, trigger, {
                      agentId,
                      name: body.name ?? current.title ?? "",
                      instruction: body.instruction ?? current.prompt ?? "",
                      enabled: body.enabled ?? current.enabled ?? true,
                      triggers: body.triggers ?? [],
                    }),
                  ),
                ),
              }
            : {}),
          expected_version: current.version,
        },
      });
      return context.json({ items: await listRoutines(resolved, agentId) });
    } catch (error) {
      return tildeUpstreamFailure(context, "routines", error);
    }
  });

  app.delete("/api/routines/:routineId", async (context) => {
    const resolved = options();
    if (!resolved) return tildeUnavailable(context, "Routines");
    const agentId = context.req.query("agent_id")?.trim();
    if (!agentId) return context.json({ error: "agent_id is required" }, 400);
    try {
      await tildeJson(resolved, `/routines/${encodeURIComponent(context.req.param("routineId"))}`, {
        method: "DELETE",
      });
      return context.json({ items: await listRoutines(resolved, agentId) });
    } catch (error) {
      return tildeUpstreamFailure(context, "routines", error);
    }
  });

  app.post("/api/routines/:routineId/run", async (context) => {
    const resolved = options();
    if (!resolved) return tildeUnavailable(context, "Routines");
    const agentId = context.req.query("agent_id")?.trim();
    if (!agentId) return context.json({ error: "agent_id is required" }, 400);
    try {
      const execution = valueRecord(
        await tildeJson(
          resolved,
          `/routines/${encodeURIComponent(context.req.param("routineId"))}/run`,
          {
            method: "POST",
          },
        ),
      );
      const sessionId = text(execution?.session_id);
      if (!sessionId) return context.json({ error: "Tilde returned no session id" }, 502);
      return context.json({ session_id: sessionId });
    } catch (error) {
      return tildeUpstreamFailure(context, "routines", error);
    }
  });
}

async function listRoutines(options: RoutineRouteOptions, agentId: string) {
  const routines = (await tildePages(options, "/routines", 100)) as UpstreamRoutine[];
  return routines
    .filter((routine) => routine.agent_inbox_id === agentId)
    .map(serializeRoutine)
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
}

function serializeRoutine(routine: UpstreamRoutine) {
  const triggers = routine.triggers ?? [];
  const latest = [...triggers]
    .filter((trigger) => trigger.last_run_at)
    .sort((left, right) => (right.last_run_at ?? "").localeCompare(left.last_run_at ?? ""))[0];
  return {
    id: routine.id,
    agent_id: routine.agent_inbox_id ?? "",
    name: routine.title ?? "",
    instruction: routine.prompt ?? "",
    enabled: routine.enabled === true,
    triggers: triggers.map((trigger) =>
      trigger.kind === "schedule"
        ? {
            id: trigger.id,
            kind: "schedule" as const,
            schedule: trigger.schedule ?? "",
            description: trigger.schedule_description ?? "",
            next_run_at: trigger.next_run_at ?? null,
            routine_id: routine.id,
          }
        : {
            id: trigger.id,
            kind: "event" as const,
            instance_id: trigger.signal_provider_instance_id ?? "",
            provider_type: (trigger.signal_type ?? "").split(".")[0] ?? "",
            signal_type: trigger.signal_type ?? "",
            filters: trigger.filter?.json_equals ?? [],
            rule_id: trigger.id,
          },
    ),
    last_run_at: latest?.last_run_at ?? null,
    last_session_id: latest?.last_session_id ?? null,
    last_error: latest?.last_error ?? null,
    created_at: routine.created_at ?? "",
    updated_at: routine.updated_at ?? "",
  };
}

class SignalTypeCatalog {
  #options: RoutineRouteOptions;
  #entries: Promise<Map<string, SignalTypeCatalogEntry>> | undefined;

  constructor(options: RoutineRouteOptions) {
    this.#options = options;
  }

  async find(signalType: string): Promise<SignalTypeCatalogEntry | undefined> {
    this.#entries ??= this.#load();
    return (await this.#entries).get(signalType);
  }

  async #load(): Promise<Map<string, SignalTypeCatalogEntry>> {
    const page = (await tildeJson(this.#options, "/signals/providers?page_size=100")) as Record<
      string,
      unknown
    >;
    const entries = new Map<string, SignalTypeCatalogEntry>();
    for (const provider of pageItems(page)) {
      const signalTypes = valueRecord(provider)?.signal_types;
      if (!Array.isArray(signalTypes)) continue;
      for (const signalType of signalTypes) {
        const record = valueRecord(signalType);
        const typeId = text(record?.type_id);
        if (typeId) entries.set(typeId, record as SignalTypeCatalogEntry);
      }
    }
    return entries;
  }
}

async function upstreamTrigger(
  catalog: SignalTypeCatalog,
  trigger: TriggerSpec,
  routine: CreateRoutineBody,
): Promise<Record<string, unknown>> {
  if (trigger.kind === "schedule") {
    return {
      ...(trigger.id ? { id: trigger.id } : {}),
      kind: "schedule",
      enabled: routine.enabled,
      schedule: trigger.schedule,
    };
  }
  const entry = await catalog.find(trigger.signalType);
  const template = text(entry?.default_session_key_template);
  const sessionPolicy = template
    ? {
        type: "session_key_template",
        namespace: "openbot",
        template,
        create_if_missing: true,
        title_template: entry?.default_session_title_template ?? routine.name,
      }
    : { type: "new_session_per_delivery", title_template: routine.name };
  return {
    ...(trigger.id ? { id: trigger.id } : {}),
    kind: "event",
    enabled: routine.enabled,
    signal_provider_instance_id: trigger.instanceId,
    signal_type: trigger.signalType,
    filter: { json_equals: trigger.filters ?? [] },
    session_policy: sessionPolicy,
    action: { type: "invoke_chatkit_agent", agent_inbox_id: routine.agentId },
    instruction_policy: "signal_and_instruction",
  };
}

function parseCreateRoutineBody(value: unknown): CreateRoutineBody {
  const record = valueRecord(value);
  if (!record) throw new Error("Invalid routine request");
  const agentId = text(record.agent_id);
  const name = text(record.name);
  const instruction = typeof record.instruction === "string" ? record.instruction : "";
  if (!agentId || !name || !instruction)
    throw new Error("agent_id, name, and instruction are required");
  if (record.enabled !== undefined && typeof record.enabled !== "boolean")
    throw new Error("enabled must be a boolean");
  return {
    agentId,
    name,
    instruction,
    enabled: record.enabled ?? true,
    triggers: parseTriggerSpecs(record.triggers, false),
  };
}

function parseUpdateRoutineBody(value: unknown): UpdateRoutineBody {
  const record = valueRecord(value);
  if (!record) throw new Error("Invalid routine request");
  if (record.name !== undefined && !text(record.name)) throw new Error("name must not be empty");
  if (record.instruction !== undefined && typeof record.instruction !== "string")
    throw new Error("instruction must be a string");
  if (record.enabled !== undefined && typeof record.enabled !== "boolean")
    throw new Error("enabled must be a boolean");
  return {
    ...(record.name !== undefined ? { name: text(record.name) } : {}),
    ...(record.instruction !== undefined ? { instruction: record.instruction as string } : {}),
    ...(record.enabled !== undefined ? { enabled: record.enabled } : {}),
    ...(record.triggers !== undefined
      ? { triggers: parseTriggerSpecs(record.triggers, true) }
      : {}),
  };
}

function parseTriggerSpecs(value: unknown, allowIds: boolean): TriggerSpec[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8)
    throw new Error("triggers must contain between 1 and 8 entries");
  return value.map((entry) => parseTriggerSpec(entry, allowIds));
}

function parseTriggerSpec(value: unknown, allowIds: boolean): TriggerSpec {
  const record = valueRecord(value);
  if (!record) throw new Error("Invalid trigger");
  const id = record.id === undefined ? undefined : text(record.id);
  if (id !== undefined && (!id || !allowIds)) throw new Error("Invalid trigger id");
  if (record.kind === "schedule") {
    const schedule = text(record.schedule);
    if (!schedule) throw new Error("A schedule trigger requires a schedule");
    return { kind: "schedule", schedule, ...(id ? { id } : {}) };
  }
  if (record.kind === "event") {
    const instanceId = text(record.instance_id);
    const signalType = text(record.signal_type);
    if (!instanceId || !signalType)
      throw new Error("An event trigger requires instance_id and signal_type");
    return {
      kind: "event",
      instanceId,
      signalType,
      ...(record.filters !== undefined ? { filters: parseFilters(record.filters) } : {}),
      ...(id ? { id } : {}),
    };
  }
  throw new Error('Trigger kind must be "schedule" or "event"');
}

function parseFilters(value: unknown): JsonEqualsPredicate[] {
  if (!Array.isArray(value)) throw new Error("filters must be an array");
  return value.map((entry) => {
    const record = valueRecord(entry);
    const path = text(record?.path);
    if (!record || !path || !("value" in record)) throw new Error("Invalid trigger filter");
    return { path, value: record.value };
  });
}
