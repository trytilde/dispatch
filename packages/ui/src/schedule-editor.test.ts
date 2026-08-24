import { describe, expect, it } from "vite-plus/test";
import {
  buildSchedule,
  parseSchedule,
  scheduleSpecSentence,
  toggleDay,
  toggleMonth,
} from "./schedule-editor.js";

describe("parseSchedule", () => {
  it("recognizes the preset modes", () => {
    expect(parseSchedule("30 * * * *")).toMatchObject({ mode: "hourly", minute: 30 });
    expect(parseSchedule("0 7 * * *")).toMatchObject({ mode: "daily", minute: 0, hour: 7 });
    expect(parseSchedule("15 9 * * 1-5")).toMatchObject({ mode: "weekdays", minute: 15, hour: 9 });
    expect(parseSchedule("0 9 * * 3")).toMatchObject({ mode: "weekly", dayOfWeek: 3 });
    expect(parseSchedule("0 9 15 * *")).toMatchObject({ mode: "monthly", dayOfMonth: 15 });
  });

  it("maps list fields to advanced and keeps them round-trippable", () => {
    const parsed = parseSchedule("0 7 * 1,6 2,4");
    expect(parsed.mode).toBe("advanced");
    expect(parsed.months).toEqual([1, 6]);
    expect(parsed.days).toEqual({ kind: "days-of-week", days: [2, 4] });
    expect(buildSchedule(parsed)).toBe("0 7 * 1,6 2,4");
  });

  it("lands unrepresentable expressions in custom", () => {
    expect(parseSchedule("*/5 * * * *").mode).toBe("custom");
    expect(parseSchedule("0 7 1 * 1").mode).toBe("custom");
    expect(parseSchedule("0 7 * * *  extra").mode).toBe("custom");
  });
});

describe("buildSchedule", () => {
  it("renders each preset mode", () => {
    expect(buildSchedule(parseSchedule("0 * * * *"))).toBe("0 * * * *");
    expect(buildSchedule(parseSchedule("45 18 * * 1-5"))).toBe("45 18 * * 1-5");
    expect(buildSchedule(parseSchedule("0 9 1 * *"))).toBe("0 9 1 * *");
  });
});

describe("scheduleSpecSentence", () => {
  it("reads as a lead/rest sentence in UTC", () => {
    expect(scheduleSpecSentence("0 7 * * *")).toEqual({
      lead: "Every",
      rest: "day at 7:00 AM UTC",
    });
    expect(scheduleSpecSentence("0 13 * * 1")).toEqual({
      lead: "Every",
      rest: "Monday at 1:00 PM UTC",
    });
    expect(scheduleSpecSentence("*/7 * * * *")).toEqual({ lead: "Cron", rest: "*/7 * * * *" });
  });
});

describe("toggleDay", () => {
  it("keeps the last selection so an advanced schedule never means every day", () => {
    expect(toggleDay([2, 4], 4)).toEqual([2]);
    expect(toggleDay([4], 4)).toEqual([4]);
    expect(toggleDay([4], 2)).toEqual([4, 2]);
    expect(
      buildSchedule({
        ...parseSchedule("0 7 * * 4"),
        mode: "advanced",
        days: { kind: "days-of-week", days: toggleDay([4], 4) },
      }),
    ).toBe("0 7 * * 4");
  });
});

describe("toggleMonth", () => {
  it("allows clearing every month back to any month", () => {
    expect(toggleMonth([6], 6)).toEqual([]);
  });
});
