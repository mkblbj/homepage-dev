import { buildTomorrowScheduleModel } from "../../widgets/uoattendance/attendance-model.mjs";
import { formatClock, scheduledSlot, tileState, toMinutes } from "../../widgets/uoattendance/ring-model.mjs";

const PRODUCTION = "Production";
const DEFAULT_AXIS = { start: 9 * 60, end: 19 * 60 };
const TICK_STEP = 120;

// Unscheduled walk-ins and people already gone sink below everyone still on a shift.
const KIND_ORDER = { in: 0, over: 0, late: 0, absent: 0, up: 0, extra: 1, done: 2 };

export function surnameOf(name) {
  const text = String(name ?? "").trim();
  return text ? text.split(/\s+/)[0] : "";
}

// "09:30-17:00" → "9:30-17": the TV has room for six people across, not for zeros.
export function compactShift(text) {
  return String(text ?? "").replace(/\b0?(\d{1,2})(?::(\d{2}))?\b/g, (match, hour, minute) =>
    minute && minute !== "00" ? `${Number(hour)}:${minute}` : String(Number(hour)),
  );
}

export function initialOf(name) {
  return Array.from(surnameOf(name))[0] || "";
}

function productionEmployees(groups) {
  const production = (groups || []).find((group) => group.key === PRODUCTION);
  if (production) return production.employees;
  // No roster today: the model falls back to one "current-working" group without departments.
  return (groups || []).find((group) => group.key === "current-working")?.employees || [];
}

function labelFor(kind, end) {
  switch (kind) {
    case "over":
      return "残業";
    case "done":
      return "退勤済";
    case "late":
      return "未打刻";
    case "absent":
      return "欠勤";
    case "extra":
      return "予定外";
    default:
      return end == null ? "" : formatClock(end);
  }
}

function toRow(employee, nowMinutes) {
  const state = tileState(employee, nowMinutes);
  const slot = state.slot || scheduledSlot(employee);
  const unscheduled = !slot;
  let kind = state.key;
  let start = slot?.start ?? null;
  let end = slot?.end ?? null;

  if (unscheduled && employee.attendance_status === "working") {
    kind = "extra";
    start = toMinutes(employee.last_checkin_time) ?? nowMinutes;
    end = nowMinutes;
  }

  return {
    id: String(employee.employee ?? employee.employee_name ?? ""),
    name: surnameOf(employee.employee_name),
    initial: initialOf(employee.employee_name),
    image: employee.image || null,
    kind,
    start,
    end,
    label: labelFor(kind, end),
  };
}

function buildAxis(rows, nowMinutes) {
  let start = DEFAULT_AXIS.start;
  let end = DEFAULT_AXIS.end;
  [...rows.flatMap((row) => [row.start, row.end]), nowMinutes].forEach((minutes) => {
    if (minutes == null) return;
    start = Math.min(start, Math.floor(minutes / 60) * 60);
    end = Math.max(end, Math.ceil(minutes / 60) * 60);
  });
  const ticks = [];
  for (let tick = start; tick <= end; tick += TICK_STEP) ticks.push(tick);
  return { start, end, ticks };
}

export function buildShiftTimeline({ todayModel, nowMinutes }) {
  const rows = productionEmployees(todayModel?.groups)
    .map((employee) => toRow(employee, nowMinutes))
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const kind = KIND_ORDER[a.row.kind] - KIND_ORDER[b.row.kind];
      if (kind) return kind;
      const end = (a.row.end ?? Infinity) - (b.row.end ?? Infinity);
      return end || a.index - b.index;
    })
    .map(({ row }) => row);

  return {
    working: rows.filter((row) => row.kind === "in" || row.kind === "over" || row.kind === "extra").length,
    scheduled: rows.filter((row) => row.kind !== "extra").length,
    axis: buildAxis(rows, nowMinutes),
    rows,
  };
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function barGeometry(row, axis, nowMinutes) {
  const span = axis.end - axis.start;
  if (!(span > 0) || row.start == null || row.end == null) {
    return { leftPct: 0, widthPct: 0, pastPct: 0, overPct: 0 };
  }
  const leftPct = ((row.start - axis.start) / span) * 100;
  const widthPct = (Math.max(0, row.end - row.start) / span) * 100;
  let pastPct = 0;
  if (row.kind === "in") pastPct = clamp((nowMinutes - row.start) / (row.end - row.start), 0, 1) * 100;
  else if (row.kind === "over" || row.kind === "done" || row.kind === "extra") pastPct = 100;
  const overPct = row.kind === "over" ? (Math.max(0, nowMinutes - row.end) / span) * 100 : 0;
  return { leftPct, widthPct, pastPct, overPct };
}

// The rows area holds 500px (right column 904 − tomorrow 250 − gap 24 − padding 52 − header 78):
// 48px rows, squeezed down to 34px, and only then split into pages.
export function layoutRows(count, { available = 500, maxRow = 48, minRow = 34 } = {}) {
  if (count <= 0) return { rowHeight: maxRow, perPage: 1, pages: 1 };
  if (count * maxRow <= available) return { rowHeight: maxRow, perPage: count, pages: 1 };
  const squeezed = Math.floor(available / count);
  if (squeezed >= minRow) return { rowHeight: squeezed, perPage: count, pages: 1 };
  const perPage = Math.floor(available / minRow);
  return { rowHeight: minRow, perPage, pages: Math.ceil(count / perPage) };
}

export function buildTomorrowShifts(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return { date: null, count: null, people: [] };
  const model = buildTomorrowScheduleModel(snapshot);
  const production = model.groups.find((group) => group.key === PRODUCTION);
  const employees = production?.employees || [];
  return {
    date: model.date,
    count: production ? production.count : 0,
    people: employees.map((employee) => ({
      id: String(employee.employee ?? employee.employee_name ?? ""),
      name: surnameOf(employee.employee_name),
      initial: initialOf(employee.employee_name),
      image: employee.image || null,
      shift: compactShift(employee.shiftText),
    })),
  };
}
