import { describe, expect, it } from "vitest";

import { getZonedTimeInfo, parseHourRange, resolveClockState } from "./clock-state";

const JP = { timeZone: "Asia/Tokyo", workHours: "9:00-18:00", dayHours: "6:00-22:00", workdays: [0, 1, 2, 3, 4, 5, 6] };
const UK = {
  timeZone: "Europe/London",
  workHours: "9:00-17:30",
  dayHours: "6:00-22:00",
  workdays: [0, 1, 2, 3, 4, 5, 6],
};

describe("clock-state/parseHourRange", () => {
  it("parses whole and half hours into minutes from local midnight", () => {
    expect(parseHourRange("9:00-18:00")).toEqual({ start: 540, end: 1080 });
    expect(parseHourRange("9:00-17:30")).toEqual({ start: 540, end: 1050 });
  });

  it("throws on malformed input instead of silently defaulting", () => {
    expect(() => parseHourRange("9-18")).toThrow();
    expect(() => parseHourRange("")).toThrow();
  });
});

describe("clock-state/getZonedTimeInfo", () => {
  it("reports minutes from local midnight, not a 24-hour rollover", () => {
    // 午夜 00:30 必须是 30，若引擎把小时给成 24 就会变成 1470
    expect(getZonedTimeInfo(new Date("2026-08-13T00:30:00+09:00"), "Asia/Tokyo").minutes).toBe(30);
  });

  it("resolves weekday in the target zone, not the host zone", () => {
    // 日本 8/13 周四 01:00 时，英国仍是 8/12 周三
    const d = new Date("2026-08-13T01:00:00+09:00");
    expect(getZonedTimeInfo(d, "Asia/Tokyo").weekday).toBe(4);
    expect(getZonedTimeInfo(d, "Europe/London").weekday).toBe(3);
  });

  it("applies daylight saving automatically", () => {
    const summer = getZonedTimeInfo(new Date("2026-08-13T12:00:00Z"), "Europe/London").minutes;
    const winter = getZonedTimeInfo(new Date("2026-01-13T12:00:00Z"), "Europe/London").minutes;
    expect(summer - winter).toBe(60);
  });

  it("returns locale-independent values", () => {
    const d = new Date("2026-08-13T11:15:00+09:00");
    expect(getZonedTimeInfo(d, "Asia/Tokyo")).toEqual({ minutes: 675, weekday: 4 });
  });
});

describe("clock-state/resolveClockState", () => {
  it("reports working inside work hours", () => {
    expect(resolveClockState(new Date("2026-08-13T11:15:00+09:00"), JP)).toBe("working");
    expect(resolveClockState(new Date("2026-08-13T17:59:00+09:00"), JP)).toBe("working");
  });

  it("treats the work-hours end as exclusive", () => {
    expect(resolveClockState(new Date("2026-08-13T18:00:00+09:00"), JP)).toBe("daytime");
    expect(resolveClockState(new Date("2026-08-13T17:29:00+01:00"), UK)).toBe("working");
    expect(resolveClockState(new Date("2026-08-13T17:30:00+01:00"), UK)).toBe("daytime");
  });

  it("reports daytime when awake but off the clock", () => {
    expect(resolveClockState(new Date("2026-08-13T20:40:00+09:00"), JP)).toBe("daytime");
    expect(resolveClockState(new Date("2026-08-13T06:00:00+09:00"), JP)).toBe("daytime");
  });

  it("reports night outside day hours", () => {
    expect(resolveClockState(new Date("2026-08-13T22:00:00+09:00"), JP)).toBe("night");
    expect(resolveClockState(new Date("2026-08-13T00:30:00+09:00"), JP)).toBe("night");
  });

  it("downgrades to daytime on a day excluded from workdays", () => {
    expect(resolveClockState(new Date("2026-08-13T11:15:00+09:00"), { ...JP, workdays: [1, 2, 3, 5] })).toBe("daytime");
  });

  it("defaults to every day being a workday when workdays is omitted", () => {
    const { workdays, ...withoutWorkdays } = JP;
    expect(resolveClockState(new Date("2026-08-13T11:15:00+09:00"), withoutWorkdays)).toBe("working");
  });
});
