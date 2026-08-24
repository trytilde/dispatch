import { describe, expect, it } from "vite-plus/test";
import {
  cronForPreset,
  describeEventTrigger,
  isValidTildeSchedule,
  MAX_ROUTINE_TRIGGERS,
  routineDetail,
  RoutineListSchema,
  RoutineSchema,
  RoutineTriggerSchema,
  RunRoutineResponseSchema,
  SCHEDULE_PRESETS,
  scheduleTriggerSentence,
  type Routine,
  type RoutineEventTrigger,
  type RoutineScheduleTrigger,
} from "./routines.js";
import type { SignalProvider } from "./signals.js";

const scheduleTrigger = {
  id: "11111111-1111-4111-8111-111111111111",
  kind: "schedule",
  schedule: "0 7 * * *",
  description: "Daily at 07:00 UTC",
  next_run_at: "2026-08-25T07:00:00Z",
  routine_id: "rt-1",
} satisfies RoutineScheduleTrigger;

const eventTrigger = {
  id: "22222222-2222-4222-8222-222222222222",
  kind: "event",
  instance_id: "spi_1",
  provider_type: "github",
  signal_type: "github.pull_request.opened",
  filters: [{ path: "repository.full_name", value: "acme/web" }],
  rule_id: "rule-1",
} satisfies RoutineEventTrigger;

const routine = {
  id: "33333333-3333-4333-8333-333333333333",
  agent_id: "agent-one",
  name: "Deploy watchdog",
  instruction: "Check deploy health",
  enabled: true,
  triggers: [scheduleTrigger, eventTrigger],
  last_run_at: null,
  last_session_id: null,
  last_error: null,
  created_at: "2026-08-24T00:00:00Z",
  updated_at: "2026-08-24T00:00:00Z",
} satisfies Routine;

const providers: SignalProvider[] = [
  {
    type_id: "github",
    name: "GitHub",
    requires_signing_key: true,
    signal_types: [
      {
        type_id: "github.pull_request.opened",
        name: "Pull request opened",
        default_session_key_template: "{{repository.full_name}}",
      },
    ],
  },
];

describe("routine contracts", () => {
  it("parses the wire routine shape and preserves unknown fields", () => {
    const parsed = RoutineSchema.parse({ ...routine, extra: "kept" });
    expect(parsed.triggers).toHaveLength(2);
    expect((parsed as Record<string, unknown>).extra).toBe("kept");
    expect(RoutineListSchema.parse({ items: [routine] }).items[0]?.name).toBe("Deploy watchdog");
    expect(RunRoutineResponseSchema.parse({ session_id: "s-1" }).session_id).toBe("s-1");
  });

  it("discriminates triggers on kind and rejects unknown kinds", () => {
    const parsed = RoutineTriggerSchema.parse(eventTrigger);
    expect(parsed.kind).toBe("event");
    expect(RoutineTriggerSchema.safeParse({ ...scheduleTrigger, kind: "cron" }).success).toBe(
      false,
    );
    expect(RoutineTriggerSchema.safeParse({ id: "x", kind: "schedule" }).success).toBe(false);
  });

  it("caps routines at eight triggers", () => {
    expect(MAX_ROUTINE_TRIGGERS).toBe(8);
  });
});

describe("cronForPreset", () => {
  it("produces Tilde-valid 5-field UTC cron for every preset", () => {
    expect(cronForPreset("hourly")).toBe("0 * * * *");
    expect(cronForPreset("hourly", { minute: 15 })).toBe("15 * * * *");
    expect(cronForPreset("daily", { minute: 30, hour: 7 })).toBe("30 7 * * *");
    expect(cronForPreset("weekdays", { minute: 0, hour: 9 })).toBe("0 9 * * 1-5");
    expect(cronForPreset("weekly", { minute: 0, hour: 8, dayOfWeek: 5 })).toBe("0 8 * * 5");
    expect(cronForPreset("monthly", { minute: 0, hour: 6, dayOfMonth: 15 })).toBe("0 6 15 * *");
    for (const preset of SCHEDULE_PRESETS)
      expect(isValidTildeSchedule(cronForPreset(preset.id))).toBe(true);
  });
});

describe("isValidTildeSchedule", () => {
  it("accepts 5-field cron and 6/7-field cron with literal zero seconds", () => {
    expect(isValidTildeSchedule("0 7 * * *")).toBe(true);
    expect(isValidTildeSchedule("*/15 * * * *")).toBe(true);
    expect(isValidTildeSchedule("0 0 7 * * *")).toBe(true);
    expect(isValidTildeSchedule("0 30 7 1 * * 2026")).toBe(true);
  });

  it("rejects macros, CRON_TZ, wrong field counts, and nonzero seconds", () => {
    expect(isValidTildeSchedule("@hourly")).toBe(false);
    expect(isValidTildeSchedule("CRON_TZ=UTC 0 7 * * *")).toBe(false);
    expect(isValidTildeSchedule("0 7 * *")).toBe(false);
    expect(isValidTildeSchedule("0 0 7 * * * * *")).toBe(false);
    expect(isValidTildeSchedule("30 0 7 * * *")).toBe(false);
    expect(isValidTildeSchedule("")).toBe(false);
    expect(isValidTildeSchedule("0 7 * * mon")).toBe(false);
  });
});

describe("trigger sentences", () => {
  it("splits the server-rendered schedule description into lead and rest", () => {
    expect(scheduleTriggerSentence(scheduleTrigger)).toEqual({
      lead: "Daily",
      rest: "at 07:00 UTC",
    });
    expect(
      scheduleTriggerSentence({ ...scheduleTrigger, description: "Every day at 09:00 UTC" }),
    ).toEqual({ lead: "Every", rest: "day at 09:00 UTC" });
  });

  it("falls back to the raw cron expression without a description", () => {
    const { description: _description, ...bare } = scheduleTrigger;
    expect(scheduleTriggerSentence(bare)).toEqual({ lead: "Cron", rest: "0 7 * * *" });
  });

  it("describes event triggers from the provider catalog with a filter summary", () => {
    expect(describeEventTrigger(eventTrigger, providers)).toEqual({
      lead: "GitHub",
      rest: "Pull request opened in acme/web",
    });
  });

  it("falls back to raw type ids when the catalog misses the provider", () => {
    expect(describeEventTrigger({ ...eventTrigger, filters: [] }, [])).toEqual({
      lead: "github",
      rest: "github.pull_request.opened",
    });
  });

  it("joins non-string filter values generically", () => {
    const trigger = {
      ...eventTrigger,
      filters: [
        { path: "action", value: "opened" },
        { path: "draft", value: false },
      ],
    };
    expect(describeEventTrigger(trigger, providers).rest).toBe(
      "Pull request opened in opened, false",
    );
  });
});

describe("routineDetail", () => {
  it("joins trigger sentences with or", () => {
    expect(routineDetail(routine, providers)).toBe(
      "Daily at 07:00 UTC or GitHub Pull request opened in acme/web",
    );
  });

  it("shows Paused for disabled routines", () => {
    expect(routineDetail({ ...routine, enabled: false }, providers)).toBe("Paused");
  });
});
