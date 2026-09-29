import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTile,
  dayProgress,
  daySpan,
  diffRosters,
  formatClock,
  formatDuration,
  parseShiftSlot,
  planLayout,
  scheduledSlot,
  summaryRings,
  tileRing,
  tileState,
  toMinutes,
} from "./ring-model.mjs";

const at = (clock) => toMinutes(clock);

// Shaped like attendance-model.mjs output: shiftText / displayTime already derived.
function employee(overrides = {}) {
  return {
    employee: "44",
    employee_name: "温 剛",
    department_category: "Office",
    start_time: "09:00",
    end_time: "18:00",
    shiftText: "9-18",
    attendance_status: "working",
    displayTime: "08:57",
    ...overrides,
  };
}

test("toMinutes reads a clock out of plain and datetime strings", () => {
  assert.equal(toMinutes("08:57"), 537);
  assert.equal(toMinutes("8:05"), 485);
  assert.equal(toMinutes("2026-07-06 08:57:16"), 537);
  assert.equal(toMinutes(""), null);
  assert.equal(toMinutes(null), null);
  assert.equal(toMinutes("予定外"), null);
  assert.equal(toMinutes("25:00"), null);
});

test("parseShiftSlot accepts short and full shift labels and rejects the rest", () => {
  assert.deepEqual(parseShiftSlot("9-18"), { start: 540, end: 1080 });
  assert.deepEqual(parseShiftSlot("13:00-18:30"), { start: 780, end: 1110 });
  assert.equal(parseShiftSlot("予定外"), null);
  assert.equal(parseShiftSlot("未設定"), null);
  assert.equal(parseShiftSlot("18-9"), null);
});

test("scheduledSlot prefers custom times, then start/end, then the shift label", () => {
  assert.deepEqual(scheduledSlot(employee({ custom_start_time: "10:00", custom_end_time: "16:00" })), {
    start: 600,
    end: 960,
  });
  assert.deepEqual(scheduledSlot(employee()), { start: 540, end: 1080 });
  assert.deepEqual(scheduledSlot(employee({ start_time: null, end_time: null, shiftText: "13-18" })), {
    start: 780,
    end: 1080,
  });
  assert.equal(scheduledSlot(employee({ start_time: null, end_time: null, shiftText: "予定外" })), null);
});

test("formatClock pads the hour, formatDuration does not", () => {
  assert.equal(formatClock(485), "08:05");
  assert.equal(formatClock(1065.9), "17:45");
  assert.equal(formatDuration(15), "0:15");
  assert.equal(formatDuration(210), "3:30");
  assert.equal(formatDuration(-5), "0:00");
});

test("tileState maps server attendance onto the six ring states", () => {
  assert.equal(tileState(employee(), at("14:30")).key, "in");
  assert.equal(tileState(employee(), at("18:20")).key, "over");
  assert.equal(tileState(employee({ attendance_status: "off_work" }), at("18:20")).key, "done");

  const missing = employee({ attendance_status: "not_checked_in", displayTime: null });
  assert.equal(tileState(missing, at("08:50")).key, "up");
  assert.equal(tileState(missing, at("09:25")).key, "late");
  assert.equal(tileState(missing, at("18:00")).key, "absent");

  // progress is measured against the scheduled shift, not the punch
  assert.equal(tileState(employee(), at("13:30")).progress, 0.5);

  // walk-ins have no shift to measure against
  const walkIn = employee({ start_time: null, end_time: null, shiftText: "予定外" });
  assert.deepEqual(tileState(walkIn, at("14:30")), { key: "in", slot: null, progress: null });
});

test("buildTile gives a working person their progress, scheduled end and remaining time", () => {
  const tile = buildTile(employee(), at("14:30"));

  assert.equal(tile.state, "in");
  assert.equal(tile.active, true);
  assert.equal(tile.progressText, "61%");
  assert.equal(tile.endLabel, "18:00");
  assert.equal(tile.status, "あと 3:30");
  // the ring's centre stays empty, so the percentage rides in the hover title
  assert.equal(tile.tooltip, "温 剛　09:00–18:00　61%　あと 3:30　出勤 08:57");
  assert.equal("initial" in tile, false);
  assert.equal(tile.ring.size, 70);
  assert.equal(tile.ring.stroke, 9);
});

test("buildTile sizes the ring on request", () => {
  const compact = buildTile(employee(), at("14:30"), { ring: "compact" });
  const large = buildTile(employee(), at("14:30"), { ring: "large" });

  assert.deepEqual([compact.ring.size, compact.ring.stroke], [54, 7]);
  assert.deepEqual([large.ring.size, large.ring.stroke], [88, 11]);
  // the head cap follows the bigger circle
  assert.equal(large.ring.startCap.left, 38.5);
});

test("planLayout keeps the drawn layout until the width is known", () => {
  assert.deepEqual(planLayout(0, [7, 9]), { split: false, ring: "compact", columns: null });
  assert.deepEqual(planLayout(null, [5, 6]), { split: false, ring: "roomy", columns: null });
});

test("planLayout stacks the departments while the widget is narrow", () => {
  // 7 + 9 people: 9 columns of at least 76px do not fit beside the summary yet
  assert.deepEqual(planLayout(900, [7, 9]), { split: false, ring: "compact", columns: null });
  assert.deepEqual(planLayout(1070, [7, 9]), { split: false, ring: "compact", columns: null });
  // below @3xl the summary sits on top, so nothing is set side by side
  assert.equal(planLayout(760, [3, 3]).split, false);
});

test("planLayout sets the departments side by side in two rows once they fit", () => {
  // today's full house on a wide screen: 4 + 5 columns of ~150px → the large ring
  assert.deepEqual(planLayout(1745, [7, 9]), { split: true, ring: "large", columns: [4, 5] });
  // in between, the same arrangement with the regular ring
  assert.deepEqual(planLayout(1150, [7, 9]), { split: true, ring: "roomy", columns: [4, 5] });
  // a one-person department still gets a column of its own
  assert.deepEqual(planLayout(1745, [1, 9]), { split: true, ring: "large", columns: [1, 5] });
});

test("planLayout stays stacked when there is nothing to set beside, or too little to fill it", () => {
  assert.equal(planLayout(1745, [9]).split, false);
  // 3 + 4 people would leave ~345px columns, far wider than any ring needs
  assert.deepEqual(planLayout(1745, [3, 4]), { split: false, ring: "roomy", columns: null });
});

test("buildTile reports overtime past the scheduled end", () => {
  const tile = buildTile(employee(), at("18:45"));

  assert.equal(tile.state, "over");
  assert.equal(tile.status, "残業 +0:45");
  assert.equal(tile.progressText, "108%");
  assert.equal(tile.tooltip, "温 剛　09:00–18:00　108%　残業 +0:45　出勤 08:57");
});

test("buildTile closes the ring and keeps the clock-out time for people who left", () => {
  const tile = buildTile(
    employee({ employee_name: "周 阔", end_time: "17:00", attendance_status: "off_work", displayTime: "17:02" }),
    at("17:45"),
  );

  assert.equal(tile.state, "done");
  assert.equal(tile.active, false);
  assert.equal(tile.status, "退勤済 17:02");
  assert.equal(tile.progressText, null);
  assert.equal(tile.tooltip, "周 阔　09:00–17:00　退勤済 17:02");
  // a closed neutral ring: no department tint, no arc, no caps
  assert.equal(tile.ring.track, "var(--ring-closed)");
  assert.equal(tile.ring.lap1, null);
  assert.equal(tile.ring.endCap, null);
});

test("buildTile words lateness in minutes, then hours", () => {
  const missing = employee({ attendance_status: "not_checked_in", displayTime: null });

  assert.equal(buildTile(missing, at("09:25")).status, "25分遅れ");
  assert.equal(buildTile(missing, at("10:00")).status, "1時間遅れ");
  assert.equal(buildTile(missing, at("14:30")).status, "5時間30分遅れ");
  assert.equal(buildTile(missing, at("14:30")).emphasized, true);
  assert.equal(buildTile(missing, at("18:30")).status, "欠勤");
  assert.equal(buildTile(missing, at("08:30")).status, "09:00 から");
  assert.equal(buildTile(missing, at("08:30")).emphasized, false);
});

test("buildTile shows walk-ins by their shift text with no progress", () => {
  const tile = buildTile(
    employee({
      employee: "999",
      employee_name: "予定外 太郎",
      start_time: null,
      end_time: null,
      shiftText: "予定外",
      displayTime: "10:15",
    }),
    at("14:30"),
  );

  assert.equal(tile.state, "in");
  assert.equal(tile.hasSlot, false);
  assert.equal(tile.endLabel, "予定外");
  assert.equal(tile.progressText, null);
  assert.equal(tile.status, null);
  assert.equal(tile.tooltip, "予定外 太郎　予定外　出勤 10:15");
  assert.equal(tile.ring.lap1, null);
});

test("tileRing draws the shift so far with round caps on the ring's centre line", () => {
  const ring = tileRing("in", 0.25, 70, 9);

  assert.equal(ring.track, "var(--ring-track)");
  assert.equal(ring.lap1, "conic-gradient(var(--ring-start) 0turn, var(--ring-head) 0.25turn, transparent 0.25turn)");
  assert.deepEqual(ring.startCap, { left: 30.5, top: 0, color: "var(--ring-start)" });
  assert.deepEqual(ring.endCap, { left: 61, top: 30.5, color: "var(--ring-head)" });
  assert.equal(ring.lap2, null);
});

test("tileRing stacks overtime as a second lap that never closes", () => {
  const ring = tileRing("over", 1.1, 70, 9);

  assert.equal(ring.lap1, "conic-gradient(var(--ring-start) 0turn, var(--ring-head) 1turn)");
  assert.equal(ring.lap2, "conic-gradient(var(--ring-head) 0turn, var(--ring-lap) 0.1turn, transparent 0.1turn)");
  assert.equal(ring.startCap.color, "var(--ring-head)");
  assert.equal(ring.endCap.color, "var(--ring-lap)");

  assert.match(tileRing("over", 5, 70, 9).lap2, /0\.97turn/);
});

test("tileRing uses the idle and alert tracks for people who have not arrived", () => {
  assert.equal(tileRing("up", null, 70, 9).track, "var(--ring-idle)");
  assert.equal(tileRing("late", null, 70, 9).track, "var(--ring-alert)");
  assert.equal(tileRing("absent", null, 70, 9).track, "var(--ring-alert)");
  // a sliver too thin to see draws nothing rather than two floating caps
  assert.equal(tileRing("in", 0.001, 70, 9).endCap, null);
  assert.equal(tileRing("in", -0.2, 70, 9).lap1, null);
});

test("daySpan runs from the first scheduled start to the last scheduled end", () => {
  const span = daySpan([
    employee({ start_time: "08:30", end_time: "17:30" }),
    employee({ start_time: "10:00", end_time: "18:00" }),
    employee({ start_time: null, end_time: null, shiftText: "予定外" }),
  ]);

  assert.deepEqual(span, { start: 510, end: 1080 });
  assert.deepEqual(daySpan([]), { start: 540, end: 1080 });
  assert.equal(dayProgress(span, at("08:00")), 0);
  assert.equal(dayProgress(span, at("13:15")), 0.5);
  assert.equal(dayProgress(span, at("20:00")), 1);
});

test("summaryRings nests the design's three rings at 188 / 144 / 100", () => {
  const rings = summaryRings([
    { key: "Office", progress: 0.5 },
    { key: "Production", progress: 1.4 },
    { key: "day", progress: 0 },
  ]);

  assert.deepEqual(
    rings.map((ring) => [ring.key, ring.offset, ring.size, ring.stroke]),
    [
      ["Office", 0, 188, 18],
      ["Production", 22, 144, 18],
      ["day", 44, 100, 18],
    ],
  );
  assert.match(rings[0].lap1, /0\.5turn/);
  // clamped to a full circle, head cap back at twelve o'clock
  assert.match(rings[1].lap1, / 1turn/);
  assert.deepEqual(rings[1].endCap, { left: 63, top: 0, color: "var(--ring-head)" });
  assert.equal(rings[2].lap1, null);
  assert.equal(rings[2].endCap, null);
});

test("summaryRings thins the stroke when more rings share the radius", () => {
  const rings = summaryRings([{ key: "a" }, { key: "b" }, { key: "c" }, { key: "day" }]);

  assert.deepEqual(
    rings.map((ring) => ring.stroke),
    [12.5, 12.5, 12.5, 12.5],
  );
  // the innermost ring still leaves the 64px hole for the centre count
  const inner = rings[rings.length - 1];
  assert.equal(inner.size - inner.stroke * 2, 64);
});

test("diffRosters names who joins and who drops out tomorrow", () => {
  const today = [
    { employee: "44", employee_name: "温 剛" },
    { employee: 70, employee_name: "高田 健治" },
    { employee: "83", employee_name: "周 阔" },
    { employee: "83", employee_name: "周 阔" },
  ];
  const tomorrow = [
    { employee: "67", employee_name: "倖田 柚子" },
    { employee: "83", employee_name: "周 阔" },
    { employee: "70", employee_name: "高田 健治" },
  ];

  assert.deepEqual(diffRosters(today, tomorrow), {
    added: [{ id: "67", name: "倖田 柚子" }],
    removed: [{ id: "44", name: "温 剛" }],
  });
  assert.deepEqual(diffRosters([], []), { added: [], removed: [] });
});
