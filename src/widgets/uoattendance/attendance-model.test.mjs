import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTodayAttendanceModel,
  buildTomorrowScheduleModel,
  formatScheduledShift,
  getStatusMeta,
} from "./attendance-model.mjs";

const todaySnapshot = {
  date: "2026-04-25",
  count: 3,
  attendance_status_basis: "employee_checkin_last_log",
  employees: [
    {
      employee: "EMP-001",
      employee_name: "田中",
      department_category: "Office",
      shift_label: "9-18",
      scheduled_time: "09:00-18:00",
      attendance_status: "working",
      attendance_status_label: "出勤中",
      last_log_type: "IN",
      last_checkin_time: "09:03",
    },
    {
      employee: "EMP-002",
      employee_name: "佐藤",
      department_category: "Production",
      shift_label: "9-17",
      scheduled_time: "09:00-17:00",
      attendance_status: "off_work",
      attendance_status_label: "退勤済",
      last_log_type: "OUT",
      last_checkin_time: "17:02",
    },
    {
      employee: "EMP-003",
      employee_name: "鈴木",
      department_category: "Production",
      shift_label: "13-18",
      scheduled_time: "13:00-18:00",
      attendance_status: "not_checked_in",
      attendance_status_label: "未打刻",
      last_log_type: null,
      last_checkin_time: null,
    },
  ],
  departments: {
    Office: { count: 1, employees: [] },
    Production: { count: 2, employees: [] },
  },
};

const actualEmployees = [
  {
    employee: "EMP-001",
    employee_name: "田中",
    department: "オフィス - UO",
    checkin_time: "09:03:00",
    location: "office-10F",
  },
  {
    employee: "EMP-999",
    employee_name: "予定外 太郎",
    department: "オフィス - UO",
    checkin_time: "10:15:00",
    location: "office-10F",
  },
];

test("formatScheduledShift prefers shift_label then scheduled_time then start/end", () => {
  assert.equal(formatScheduledShift({ shift_label: "9-18", scheduled_time: "09:00-18:00" }), "9-18");
  assert.equal(formatScheduledShift({ scheduled_time: "09:00-18:00" }), "09:00-18:00");
  assert.equal(formatScheduledShift({ start_time: "10:00", end_time: "16:00" }), "10:00-16:00");
  assert.equal(formatScheduledShift({}), "未設定");
});

test("getStatusMeta returns stable copy and tone classes for all three states", () => {
  assert.deepEqual(getStatusMeta("working"), {
    label: "出勤中",
    tone: "working",
    chipClass:
      "border-emerald-300/80 bg-emerald-100/85 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/15 dark:text-emerald-100",
    dotClass: "bg-emerald-500 dark:bg-emerald-300",
  });

  assert.equal(getStatusMeta("off_work").label, "退勤済");
  assert.equal(getStatusMeta("not_checked_in").label, "未打刻");
  assert.equal(getStatusMeta("unknown").label, "未打刻");
});

test("buildTodayAttendanceModel groups scheduled employees and counts three states", () => {
  const model = buildTodayAttendanceModel({
    todaySnapshot,
    actualEmployees,
  });

  assert.equal(model.hasRoster, true);
  assert.equal(model.date, "2026-04-25");
  assert.deepEqual(model.summary, {
    scheduledCount: 3,
    workingCount: 1,
    offWorkCount: 1,
    notCheckedInCount: 1,
    unscheduledWorkingCount: 1,
  });
  assert.deepEqual(
    model.groups.map((group) => [group.key, group.count, group.employees.map((employee) => employee.employee)]),
    [
      ["Office", 2, ["EMP-001", "EMP-999"]],
      ["Production", 2, ["EMP-002", "EMP-003"]],
    ],
  );
  assert.equal(model.groups[0].employees[0].statusMeta.label, "出勤中");
  assert.equal(model.groups[0].employees[1].shiftText, "予定外");
  assert.equal(model.groups[1].employees[0].statusMeta.label, "退勤済");
  assert.equal(model.groups[1].employees[1].statusMeta.label, "未打刻");
});

test("buildTodayAttendanceModel exposes visible time only for off-work employees", () => {
  const model = buildTodayAttendanceModel({
    todaySnapshot,
    actualEmployees,
  });

  assert.equal(model.groups[0].employees[0].displayTime, null);
  assert.equal(model.groups[0].employees[1].displayTime, null);
  assert.equal(model.groups[1].employees[0].displayTime, "17:02");
  assert.equal(model.groups[1].employees[1].displayTime, null);
});

test("buildTodayAttendanceModel groups unrecognized unscheduled employees by their department label", () => {
  const model = buildTodayAttendanceModel({
    todaySnapshot,
    actualEmployees: [
      {
        employee: "EMP-999",
        employee_name: "予定外 太郎",
        department: "臨時",
        checkin_time: "10:15:00",
      },
    ],
  });

  assert.deepEqual(
    model.groups.map((group) => [group.key, group.label, group.count, group.employees.map((employee) => employee.employee)]),
    [
      ["Office", "オフィス", 1, ["EMP-001"]],
      ["Production", "生産", 2, ["EMP-002", "EMP-003"]],
      ["臨時", "臨時", 1, ["EMP-999"]],
    ],
  );
  assert.equal(model.groups[2].employees[0].shiftText, "予定外");
});

test("buildTodayAttendanceModel falls back to current-at-work rows when today roster is unavailable", () => {
  const model = buildTodayAttendanceModel({
    todaySnapshot: null,
    actualEmployees,
  });

  assert.equal(model.hasRoster, false);
  assert.equal(model.summary.scheduledCount, 0);
  assert.equal(model.summary.workingCount, 2);
  assert.deepEqual(
    model.groups.map((group) => [group.key, group.count]),
    [
      ["current-working", 2],
    ],
  );
  assert.equal(model.groups[0].employees[0].statusMeta.label, "出勤中");
});

test("buildTomorrowScheduleModel keeps schedule-only grouping", () => {
  const model = buildTomorrowScheduleModel({
    date: "2026-04-26",
    count: 2,
    employees: [
      { employee: "EMP-004", employee_name: "山田", department_category: "Office", shift_label: "9-18" },
      { employee: "EMP-005", employee_name: "林", department_category: "Production", shift_label: "10-17" },
    ],
    departments: {
      Office: { count: 1, employees: [] },
      Production: { count: 1, employees: [] },
    },
  });

  assert.equal(model.date, "2026-04-26");
  assert.equal(model.count, 2);
  assert.deepEqual(
    model.groups.map((group) => [group.key, group.label, group.count]),
    [
      ["Office", "オフィス", 1],
      ["Production", "生産", 1],
    ],
  );
});
