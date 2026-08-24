import { z } from "zod";
import type { SignalProvider } from "./signals.js";

/**
 * Unified routine contracts shared by every client surface. A routine groups
 * 1..MAX_ROUTINE_TRIGGERS OR'd triggers — schedule triggers backed by Tilde
 * ChatKit routines and event triggers backed by Tilde signal rules — behind
 * the control-service `/api/routines` routes.
 */

export const MAX_ROUTINE_TRIGGERS = 8;

export const RoutineTriggerFilterSchema = z
  .object({
    path: z.string(),
    value: z.unknown(),
  })
  .passthrough();
export type RoutineTriggerFilter = z.infer<typeof RoutineTriggerFilterSchema>;

export const RoutineScheduleTriggerSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal("schedule"),
    schedule: z.string(),
    /** Server-rendered Tilde schedule_description, passthrough. */
    description: z.string().optional(),
    next_run_at: z.string().nullable().optional(),
    routine_id: z.string(),
  })
  .passthrough();
export type RoutineScheduleTrigger = z.infer<typeof RoutineScheduleTriggerSchema>;

export const RoutineEventTriggerSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal("event"),
    instance_id: z.string(),
    provider_type: z.string(),
    signal_type: z.string(),
    filters: z.array(RoutineTriggerFilterSchema).optional(),
    rule_id: z.string(),
  })
  .passthrough();
export type RoutineEventTrigger = z.infer<typeof RoutineEventTriggerSchema>;

export const RoutineTriggerSchema = z.discriminatedUnion("kind", [
  RoutineScheduleTriggerSchema,
  RoutineEventTriggerSchema,
]);
export type RoutineTrigger = z.infer<typeof RoutineTriggerSchema>;

export const RoutineSchema = z
  .object({
    id: z.string().min(1),
    agent_id: z.string(),
    name: z.string(),
    instruction: z.string(),
    enabled: z.boolean(),
    triggers: z.array(RoutineTriggerSchema),
    last_run_at: z.string().nullable().optional(),
    last_session_id: z.string().nullable().optional(),
    last_error: z.string().nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .passthrough();
export type Routine = z.infer<typeof RoutineSchema>;

export const RoutineListSchema = z.object({ items: z.array(RoutineSchema) });
export const RunRoutineResponseSchema = z.object({ session_id: z.string() });

export type RoutineTriggerSpec =
  | { kind: "schedule"; id?: string; schedule: string }
  | {
      kind: "event";
      id?: string;
      instanceId: string;
      signalType: string;
      filters?: RoutineTriggerFilter[];
    };

export interface CreateRoutineInput {
  agentId: string;
  name: string;
  instruction: string;
  enabled?: boolean;
  triggers: RoutineTriggerSpec[];
}

export interface UpdateRoutineInput {
  name?: string;
  instruction?: string;
  enabled?: boolean;
  triggers?: RoutineTriggerSpec[];
}

export const SCHEDULE_PRESETS = [
  { id: "hourly", label: "Every hour" },
  { id: "daily", label: "Every day" },
  { id: "weekdays", label: "Weekdays" },
  { id: "weekly", label: "Every week" },
  { id: "monthly", label: "Every month" },
] as const;
export type SchedulePresetId = (typeof SCHEDULE_PRESETS)[number]["id"];

export interface SchedulePresetOptions {
  /** Minute of the hour, 0-59. Defaults to 0. */
  minute?: number;
  /** UTC hour of the day, 0-23. Defaults to 9 (ignored by "hourly"). */
  hour?: number;
  /** Day of week 0-6 (Sunday=0) for "weekly". Defaults to 1 (Monday). */
  dayOfWeek?: number;
  /** Day of month 1-31 for "monthly". Defaults to 1. */
  dayOfMonth?: number;
}

/** Produce a Tilde-valid 5-field UTC cron expression for a schedule preset. */
export function cronForPreset(
  preset: SchedulePresetId,
  options: SchedulePresetOptions = {},
): string {
  const minute = options.minute ?? 0;
  const hour = options.hour ?? 9;
  switch (preset) {
    case "hourly":
      return `${minute} * * * *`;
    case "daily":
      return `${minute} ${hour} * * *`;
    case "weekdays":
      return `${minute} ${hour} * * 1-5`;
    case "weekly":
      return `${minute} ${hour} * * ${options.dayOfWeek ?? 1}`;
    case "monthly":
      return `${minute} ${hour} ${options.dayOfMonth ?? 1} * *`;
  }
}

const cronFieldPattern = /^[\d*,/-]+$/;

/**
 * Tilde accepts 5-field cron, or 6/7-field cron whose seconds field is the
 * literal `0`. `@`-macros and `CRON_TZ=` prefixes are rejected.
 */
export function isValidTildeSchedule(expression: string): boolean {
  const trimmed = expression.trim();
  if (!trimmed || trimmed.startsWith("@") || trimmed.includes("CRON_TZ")) return false;
  const fields = trimmed.split(/\s+/);
  if (fields.length < 5 || fields.length > 7) return false;
  if (fields.length > 5 && fields[0] !== "0") return false;
  const cronFields = fields.length > 5 ? fields.slice(1) : fields;
  return cronFields.every((field) => cronFieldPattern.test(field));
}

export interface TriggerSentence {
  lead: string;
  rest: string;
}

/**
 * Split the server-rendered schedule description into grokbot's lead/rest
 * sentence pair ("Every" + "day at 07:00 UTC"). Falls back to the raw cron
 * expression when no description was rendered.
 */
export function scheduleTriggerSentence(trigger: RoutineScheduleTrigger): TriggerSentence {
  const description = trigger.description?.trim();
  if (!description) return { lead: "Cron", rest: trigger.schedule };
  const [lead = "", ...rest] = description.split(/\s+/);
  return { lead, rest: rest.join(" ") };
}

/**
 * Describe an event trigger as a lead/rest sentence pair: the provider display
 * name plus the signal type name and a summary of any filters.
 */
export function describeEventTrigger(
  trigger: RoutineEventTrigger,
  providers: SignalProvider[],
): TriggerSentence {
  const provider = providers.find((candidate) => candidate.type_id === trigger.provider_type);
  const signalType = provider?.signal_types.find(
    (candidate) => candidate.type_id === trigger.signal_type,
  );
  const lead = provider?.name ?? trigger.provider_type;
  const filters = trigger.filters ?? [];
  const filterSummary =
    filters.length > 0
      ? ` in ${filters.map((filter) => filterValueText(filter.value)).join(", ")}`
      : "";
  return { lead, rest: `${signalType?.name ?? trigger.signal_type}${filterSummary}` };
}

function filterValueText(value: unknown): string {
  if (typeof value === "string") return value;
  return value === undefined ? "" : JSON.stringify(value);
}

/**
 * The routine list row's second line: joined trigger sentences OR'd together,
 * or "Paused" when the routine is disabled.
 */
export function routineDetail(routine: Routine, providers: SignalProvider[]): string {
  if (!routine.enabled) return "Paused";
  return routine.triggers
    .map((trigger) => {
      const sentence =
        trigger.kind === "schedule"
          ? scheduleTriggerSentence(trigger)
          : describeEventTrigger(trigger, providers);
      return `${sentence.lead} ${sentence.rest}`.trim();
    })
    .join(" or ");
}
