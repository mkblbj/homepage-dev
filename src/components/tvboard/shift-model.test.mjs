import assert from "node:assert/strict";
import test from "node:test";

import { buildTodayAttendanceModel } from "../../widgets/uoattendance/attendance-model.mjs";

import { barGeometry, buildShiftTimeline, buildTomorrowShifts, initialOf, layoutRows, surnameOf } from "./shift-model.mjs";

const emp = (name, shift, status) => ({
  employee: name,
  employee_name: name,
  department_category: "Production",
  shift_label: shift,
  attendance_status: status,
});

const todaySnapshot = {
  date: "2026-10-16",
  attendance_status_basis: "server",
  count: 5,
  departments: { Production: { count: 4 }, Office: { count: 1 } },
  employees: [
    emp("鈴木 一郎", "9-16", "working"),
    emp("山本", "9-18", "working"),
    emp("加藤", "13-18", "not_checked_in"),
    emp("高橋", "9-12", "off_work"),
    { ...emp("事務", "9-18", "working"), department_category: "Office" },
  ],
};
const actualEmployees = [
  {
    employee: "李",
    employee_name: "李",
    department: "生産 - UO",
    attendance_status: "working",
    last_log_type: "IN",
    checkin_time: "2026-10-16 09:02:00",
  },
];
const todayModel = buildTodayAttendanceModel({ todaySnapshot, actualEmployees });

test("rows are production only, by leaving time, with unscheduled and gone people last", () => {
  const t = buildShiftTimeline({ todayModel, nowMinutes: 13 * 60 + 15 });
  assert.deepEqual(
    t.rows.map((r) => [r.name, r.kind, r.label]),
    [
      ["鈴木", "in", "16:00"],
      ["山本", "in", "18:00"],
      ["加藤", "late", "未打刻"],
      ["李", "extra", "予定外"],
      ["高橋", "done", "退勤済"],
    ],
  );
  assert.equal(t.working, 3);
  assert.equal(t.scheduled, 4);
  assert.equal(t.rows[3].start, 9 * 60 + 2);
  assert.equal(t.rows[3].end, 13 * 60 + 15);
});

test("the axis is 9–19 by default with a tick every two hours, and stretches to cover now", () => {
  const t = buildShiftTimeline({ todayModel, nowMinutes: 13 * 60 + 15 });
  assert.deepEqual([t.axis.start, t.axis.end], [540, 1140]);
  assert.deepEqual(t.axis.ticks, [540, 660, 780, 900, 1020, 1140]);
  assert.equal(buildShiftTimeline({ todayModel, nowMinutes: 19 * 60 + 40 }).axis.end, 1200);
});

test("overtime and absence read from the shift and the clock", () => {
  const late = buildShiftTimeline({ todayModel, nowMinutes: 18 * 60 + 30 });
  const yamamoto = late.rows.find((r) => r.name === "山本");
  const kato = late.rows.find((r) => r.name === "加藤");
  assert.equal(yamamoto.kind, "over");
  assert.equal(yamamoto.label, "残業");
  assert.equal(kato.kind, "absent");
  assert.equal(kato.label, "欠勤");
});

test("bar geometry is a share of the axis; the past share is within the bar", () => {
  const t = buildShiftTimeline({ todayModel, nowMinutes: 795 });
  const g = barGeometry(t.rows[0], t.axis, 795);
  assert.equal(g.leftPct, 0);
  assert.equal(Math.round(g.widthPct), 70);
  assert.equal(Math.round(g.pastPct), 61);
  assert.equal(g.overPct, 0);

  const over = buildShiftTimeline({ todayModel, nowMinutes: 1110 });
  const yamamoto = over.rows.find((r) => r.name === "山本");
  const og = barGeometry(yamamoto, over.axis, 1110);
  assert.equal(og.pastPct, 100);
  assert.equal(Math.round(og.overPct), 5);
});

test("rows shrink to fit, then page", () => {
  assert.deepEqual(layoutRows(11), { rowHeight: 42, perPage: 11, pages: 1 });
  assert.deepEqual(layoutRows(13), { rowHeight: 37, perPage: 13, pages: 1 });
  assert.deepEqual(layoutRows(20), { rowHeight: 32, perPage: 15, pages: 2 });
  assert.deepEqual(layoutRows(0), { rowHeight: 42, perPage: 1, pages: 1 });
});

test("names show the family name only", () => {
  assert.equal(surnameOf("田中 太郎"), "田中");
  assert.equal(surnameOf("田中　太郎"), "田中");
  assert.equal(surnameOf("王"), "王");
  assert.equal(initialOf("田中 太郎"), "田");
  assert.equal(surnameOf(""), "");
});

test("tomorrow lists production people with their shift; no snapshot is unknown", () => {
  const snapshot = {
    date: "2026-10-17",
    count: 3,
    departments: { Production: { count: 2 }, Office: { count: 1 } },
    employees: [
      { employee: "a", employee_name: "佐藤 花子", department_category: "Production", shift_label: "9-18" },
      { employee: "b", employee_name: "王", department_category: "Production", shift_label: "13-18" },
      { employee: "c", employee_name: "事務", department_category: "Office", shift_label: "9-18" },
    ],
  };
  const v = buildTomorrowShifts(snapshot);
  assert.equal(v.date, "2026-10-17");
  assert.equal(v.count, 2);
  assert.deepEqual(
    v.people.map((p) => [p.name, p.initial, p.shift]),
    [
      ["佐藤", "佐", "9-18"],
      ["王", "王", "13-18"],
    ],
  );
  assert.deepEqual(buildTomorrowShifts(null), { date: null, count: null, people: [] });
});
