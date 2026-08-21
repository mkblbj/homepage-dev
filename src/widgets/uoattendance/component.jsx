import Container from "components/services/widget/container";
import { useCallback, useEffect, useMemo, useState } from "react";

import { buildTodayAttendanceModel, buildTomorrowScheduleModel, formatScheduledFte } from "./attendance-model.mjs";
import { getNextTakadaManualStatus, isTakadaEmployee } from "./takada-manual-status.mjs";

import useWidgetAPI from "utils/proxy/use-widget-api";

/*
 * uoattendance — タイムライン表示
 *
 * データ層は attendance-model.mjs をそのまま利用し(サーバ側で算出した
 * attendance_status: working / off_work / not_checked_in が正)、ここでは
 * 見た目だけをタイムラインに刷新する。
 *
 * 各行は「予定(薄)＋実績(濃)」の二層バー。打刻は1人1件(last_checkin_time)
 * しか無いため、確実に言える範囲だけを濃いバーで描く:
 *   working       → 濃: 出勤打刻 → 現在。予定より遅い出勤は左側の薄い帯で可視化。
 *   off_work      → 濃: 予定開始 → 退勤打刻。早退は右側の薄い帯で可視化。
 *                    (出勤打刻は残らないため、退勤済の「遅い出勤」は再現不可)
 *   not_checked_in → 薄い破線の予定帯のみ(右ラベルで これから / 未打刻 を区別)
 * 緑(emerald)は「現在」を示すシグナル専用: 出勤中の人数 / LIVE / 現在ライン。
 */

// ---- palette (accent hex used inline; neutrals via theme tokens) ----
const GREEN = "#34C98E";
// GREEN at low alpha — the vertical "now" spine that runs down through every row.
const NOW_LINE = "rgba(52,201,142,0.45)";
const DEPT_STYLES = {
  Office: {
    solid: "#5EB3E4",
    bar: "rgba(94,179,228,0.6)",
    dot: "#5EB3E4",
    soft: "rgba(94,179,228,0.12)",
    softBorder: "rgba(94,179,228,0.34)",
    seg: "#5EB3E4",
    plan: "rgba(94,179,228,0.2)",
  },
  Production: {
    solid: "#E8A868",
    bar: "rgba(232,168,104,0.6)",
    dot: "#E8A868",
    soft: "rgba(232,168,104,0.12)",
    softBorder: "rgba(232,168,104,0.34)",
    seg: "#E8A868",
    plan: "rgba(232,168,104,0.22)",
  },
};
const FALLBACK_DEPT = {
  solid: "#8A94A0",
  bar: "rgba(138,148,160,0.55)",
  dot: "#8A94A0",
  soft: "rgba(138,148,160,0.12)",
  softBorder: "rgba(138,148,160,0.34)",
  seg: "#8A94A0",
  plan: "rgba(138,148,160,0.2)",
};
const NEUTRAL_SEG = "#8A94A0";
const DONE_SEG = "#66757F";
const DONE_BAR = "rgba(102,117,127,0.82)";
const DONE_BAR_BORDER = "1px solid rgba(226,232,240,0.28)";
// 予定(薄い下地)— scheduled window drawn faint behind the solid "actual" bar.
const PLAN_DASH_BORDER = "1.5px dashed rgba(148,163,175,0.5)";
const DONE_PLAN = "rgba(102,117,127,0.2)";

function deptStyle(key) {
  return DEPT_STYLES[key] || FALLBACK_DEPT;
}

// ---- time helpers ----
function hm(str) {
  if (!str) {
    return null;
  }
  const [h, m] = String(str).split(":");
  const hh = Number(h);
  const mm = Number(m) || 0;
  if (Number.isNaN(hh)) {
    return null;
  }
  return hh + mm / 60;
}

// "9-18" / "09:00-18:00" / "13:00-18:00" → { start, end } (decimal hours)
function parseShiftBounds(text) {
  if (!text) {
    return null;
  }
  const match = String(text).match(/(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?/);
  if (!match) {
    return null;
  }
  const [, startHour, startMinute = "0", endHour, endMinute = "0"] = match;
  const start = Number(startHour) + Number(startMinute) / 60;
  const end = Number(endHour) + Number(endMinute) / 60;
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return null;
  }
  return { start, end };
}

// scheduled start/end (decimal hours) from the richest source available.
function scheduledBounds(employee) {
  let start = hm(employee.custom_start_time || employee.start_time);
  let end = hm(employee.custom_end_time || employee.end_time);
  if (start == null || end == null) {
    const parsed = parseShiftBounds(employee.shiftText);
    if (parsed) {
      if (start == null) {
        start = parsed.start;
      }
      if (end == null) {
        end = parsed.end;
      }
    }
  }
  return { start, end };
}

function fmtClock(dec) {
  if (dec == null) {
    return "";
  }
  const h = Math.floor(dec);
  const m = Math.round((dec - h) * 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

function formatShortDate(dateString) {
  if (!dateString) {
    return null;
  }
  const [, month, day] = dateString.split("-");
  if (!month || !day) {
    return dateString;
  }
  return `${Number(month)}/${Number(day)}`;
}

const WEEKDAY_JP = ["日", "月", "火", "水", "木", "金", "土"];
function weekdayJp(dateString) {
  if (!dateString) {
    return "";
  }
  const date = new Date(`${dateString}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "" : WEEKDAY_JP[date.getDay()];
}

// live clock (updates every 30s — enough for a home-board)
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// shared time axis from the day's rostered shifts (unscheduled walk-ins don't widen it).
function buildDomain(employees) {
  let rawMin = 24;
  let rawMax = 0;
  employees.forEach((employee) => {
    const { start, end } = scheduledBounds(employee);
    if (start != null) {
      rawMin = Math.min(rawMin, start);
    }
    if (end != null) {
      rawMax = Math.max(rawMax, end);
    }
  });
  if (rawMin >= rawMax) {
    rawMin = 9;
    rawMax = 18;
  }
  const start = Math.floor(rawMin * 2) / 2 - 0.5;
  const end = Math.ceil(rawMax * 2) / 2 + 0.5;
  const ticks = [];
  for (let h = Math.ceil(start); h <= Math.floor(end); h += 1) {
    if (h % 3 === 0) {
      ticks.push({ h, label: `${h}:00`, pct: ((h - start) / (end - start)) * 100 });
    }
  }
  return { start, end, ticks };
}

// ---- one person's timeline row (fed by an attendance-model employee) ----
const ROW_STYLE = {
  working: {
    border: "none",
    nameCls: "text-theme-900 dark:text-theme-50",
    rightCls: "text-theme-600 dark:text-theme-300",
  },
  upcoming: {
    bg: "transparent",
    border: "1.5px dashed rgba(148,163,175,0.45)",
    dot: NEUTRAL_SEG,
    nameCls: "text-theme-700 dark:text-theme-200",
    rightCls: "text-theme-600 dark:text-theme-300",
  },
  missing: {
    bg: "transparent",
    border: "1.5px dashed rgba(148,163,175,0.45)",
    dot: NEUTRAL_SEG,
    nameCls: "text-theme-700 dark:text-theme-200",
    rightCls: "text-theme-600 dark:text-theme-300",
  },
  done: {
    bg: DONE_BAR,
    border: DONE_BAR_BORDER,
    dot: DONE_SEG,
    nameCls: "text-theme-500 dark:text-theme-400",
    rightCls: "text-theme-500 dark:text-theme-400",
  },
};

function buildRow(employee, dept, domain, nowH) {
  const { start: schedStart, end: schedEnd } = scheduledBounds(employee);
  const hasSchedule = schedStart != null && schedEnd != null;
  const unscheduled = employee.shiftText === "予定外";
  // one punch per person: IN time when working, OUT time when off_work.
  const punch = hm(employee.displayTime);

  let state;
  if (employee.attendance_status === "working") {
    state = "working";
  } else if (employee.attendance_status === "off_work") {
    state = "done";
  } else {
    const scheduleStartH = schedStart ?? domain.start;
    state = nowH < scheduleStartH ? "upcoming" : "missing";
  }

  const base = ROW_STYLE[state];

  const clamp = (h) => Math.max(domain.start, Math.min(domain.end, h));
  const pct = (h) => ((clamp(h) - domain.start) / (domain.end - domain.start)) * 100;
  const band = (s, e) => {
    if (s == null || e == null || e <= s) {
      return null;
    }
    const left = pct(s);
    return { left, width: Math.max(1.5, pct(e) - left) };
  };

  // 予定(薄い下地): rostered window. Walk-ins have no roster window.
  const plannedGeom = hasSchedule ? band(schedStart, schedEnd) : null;

  // 実績(濃いバー): only the span the single punch can actually prove.
  let actualGeom = null;
  let rightLabel;
  if (state === "working") {
    const s = punch ?? schedStart ?? domain.start; // 出勤打刻(なければ予定開始で代用)
    const e = Math.max(s + 1 / 12, Math.min(nowH, domain.end)); // 〜現在(ライブに伸びる)
    actualGeom = band(s, e);
    rightLabel = employee.displayTime || fmtClock(s);
  } else if (state === "done") {
    const e = punch ?? schedEnd ?? domain.end; // 退勤打刻
    const s = schedStart ?? Math.max(domain.start, e - 1 / 12); // 出勤打刻は残らない→予定開始で代用
    actualGeom = band(Math.min(s, e), e);
    rightLabel = "退勤済";
  } else {
    rightLabel = state === "upcoming" ? `${fmtClock(schedStart ?? domain.start)}〜` : "未打刻";
  }

  const style = {
    ...base,
    dot: state === "working" ? dept.dot : base.dot,
    plannedFill: state === "working" ? dept.plan : state === "done" ? DONE_PLAN : "transparent",
    plannedBorder: state === "upcoming" || state === "missing" ? PLAN_DASH_BORDER : "none",
    actualFill: state === "working" ? dept.bar : state === "done" ? DONE_BAR : "none",
    actualBorder: state === "done" ? DONE_BAR_BORDER : "none",
  };

  return {
    id: employee.employee,
    name: employee.employee_name,
    unscheduled,
    state,
    attendanceStatus: employee.attendance_status,
    canManualToggle: isTakadaEmployee(employee),
    plannedGeom,
    actualGeom,
    style,
    rightLabel,
    title: [
      employee.employee_name,
      employee.shiftText,
      employee.attendance_status_label,
      employee.displayTime ? `${employee.last_log_type || "IN"} ${employee.displayTime}` : null,
      unscheduled ? "予定外" : null,
    ]
      .filter(Boolean)
      .join(" / "),
  };
}

// ---- department timeline card ----
function DeptTimeline({ dept, label, working, scheduled, fteText, rows, domain, nowH, onTakadaManualToggle }) {
  const nowPct = Math.max(0, Math.min(100, ((nowH - domain.start) / (domain.end - domain.start)) * 100));

  return (
    <div
      className="flex min-w-0 flex-col gap-1.5 rounded-xl border p-2.5 px-3.5"
      style={{ backgroundColor: dept.soft, borderColor: dept.softBorder }}
    >
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ backgroundColor: dept.solid }} />
        <span className="text-[12px] font-bold text-theme-800 dark:text-theme-100">{label}</span>
        <span className="text-[11.5px] font-bold tabular-nums" style={{ color: dept.solid }}>
          {working}/{scheduled}
        </span>
        {fteText ? (
          <span className="ml-auto text-[10px] font-medium tabular-nums text-theme-600 dark:text-theme-300">
            換算 {fteText}人
          </span>
        ) : null}
      </div>

      {/* time axis — a single line of hour ticks. "Now" is a green playhead: a
          small triangle here plus a line continuing down through every row, so it
          costs no extra line and never collides with a tick label (the exact time
          already lives in the header "現在 HH:MM"). */}
      <div className="grid" style={{ gridTemplateColumns: "104px 1fr 64px", columnGap: "10px", height: "16px" }}>
        <span />
        <span className="relative block h-full">
          {domain.ticks.map((tick) => (
            <span
              key={tick.h}
              className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[9.5px] font-bold tabular-nums text-theme-600 dark:text-theme-200"
              style={{ left: `${tick.pct}%` }}
            >
              {tick.label}
            </span>
          ))}
          <span
            className="absolute bottom-0 h-0 w-0"
            style={{
              left: `${nowPct}%`,
              marginLeft: "-3.5px",
              borderLeft: "3.5px solid transparent",
              borderRight: "3.5px solid transparent",
              borderTop: `5px solid ${GREEN}`,
            }}
          />
        </span>
        <span />
      </div>

      {/* rows */}
      <div className="flex flex-col gap-1">
        {rows.map((row) => (
          <div
            key={row.id}
            title={row.title}
            className="grid items-center"
            style={{ gridTemplateColumns: "104px 1fr 64px", columnGap: "10px", height: "18px" }}
          >
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span className="h-[5.5px] w-[5.5px] shrink-0 rounded-full" style={{ backgroundColor: row.style.dot }} />
              <span className="inline-flex min-w-0 max-w-full items-baseline whitespace-nowrap">
                {row.canManualToggle ? (
                  <button
                    type="button"
                    className={`block min-w-0 max-w-full cursor-pointer appearance-none truncate rounded-sm border-0 bg-transparent p-0 text-left text-[11.5px] font-semibold transition-colors hover:text-amber-500 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${row.style.nameCls}`}
                    title="表示打刻を切り替え"
                    aria-label={`${row.name}の表示打刻を切り替え`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onTakadaManualToggle(row);
                    }}
                  >
                    {row.name}
                  </button>
                ) : (
                  <span className={`block min-w-0 max-w-full truncate text-[11.5px] font-semibold ${row.style.nameCls}`}>
                    {row.name}
                  </span>
                )}
                {row.unscheduled ? (
                  <span className="ml-1 shrink-0 text-[8.5px] font-bold text-theme-500 dark:text-theme-400">予定外</span>
                ) : null}
              </span>
            </span>
            <span className="relative block h-[9px] rounded-full bg-theme-300/40 dark:bg-white/[0.06]">
              {/* 実績(濃): keep first in the DOM so it stays the row's primary bar; z-index lifts it above 予定. */}
              {row.actualGeom ? (
                <span
                  className="absolute inset-y-0 z-10 box-border rounded-full"
                  style={{
                    left: `${row.actualGeom.left}%`,
                    width: `${row.actualGeom.width}%`,
                    background: row.style.actualFill,
                    border: row.style.actualBorder,
                  }}
                />
              ) : null}
              {/* 予定(薄): scheduled window behind the actual bar; the exposed part = 予定なのに未稼働(遅刻/早退)。 */}
              {row.plannedGeom ? (
                <span
                  className="absolute inset-y-0 z-0 box-border rounded-full"
                  style={{
                    left: `${row.plannedGeom.left}%`,
                    width: `${row.plannedGeom.width}%`,
                    background: row.style.plannedFill,
                    border: row.style.plannedBorder,
                  }}
                />
              ) : null}
              <span className="absolute -inset-y-0.5 z-20 w-px" style={{ left: `${nowPct}%`, backgroundColor: NOW_LINE }} />
            </span>
            <span
              className={`whitespace-nowrap text-right text-[10px] font-semibold tabular-nums ${row.style.rightCls}`}
            >
              {row.rightLabel}
            </span>
          </div>
        ))}
        {rows.length === 0 ? (
          <div className="py-1 text-center text-[10px] text-theme-500 dark:text-theme-400">予定なし</div>
        ) : null}
      </div>
    </div>
  );
}

// ---- roster calendar: month-view entry points, one per department ----
// Border/icon colour reuses DEPT_STYLES so the buttons read as the same two
// departments drawn in the timelines below.
function RosterCalendarLink({ department, label, title }) {
  const { solid } = deptStyle(department);

  return (
    <a
      href={`/api/uoroster/calendar?department=${department}`}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      aria-label={title}
      className="inline-flex items-center gap-1 rounded-lg border px-1.5 py-1 text-[10.5px] font-bold transition-colors hover:bg-theme-200/40 dark:hover:bg-theme-700/40"
      style={{ borderColor: `${solid}66`, color: solid }}
    >
      <svg
        className="h-3 w-3"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </svg>
      {label}
    </a>
  );
}

// ---- summary: big count + segment bar + legend ----
function SummaryBar({ workingTotal, scheduledTotal, segments }) {
  const denom = scheduledTotal > 0 ? scheduledTotal : segments.reduce((sum, seg) => sum + seg.n, 0) || 1;

  return (
    <>
      <span className="flex shrink-0 items-baseline gap-1.5 pl-1">
        <span className="text-[23px] font-extrabold leading-none tracking-tight tabular-nums" style={{ color: GREEN }}>
          {workingTotal}
        </span>
        <span className="text-[11.5px] font-bold text-theme-800 dark:text-theme-100">名出勤中</span>
        {scheduledTotal > 0 ? (
          <span className="text-[10.5px] font-medium tabular-nums text-theme-600 dark:text-theme-300">
            / {scheduledTotal} 名予定
          </span>
        ) : null}
      </span>
      {segments.length > 0 ? (
        <span className="flex min-w-[210px] flex-1 flex-col gap-1 self-center px-0.5">
          <span className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
            {segments.map((seg) => (
              <span
                key={seg.label}
                className="block h-full"
                style={{ width: `${(seg.n / denom) * 100}%`, backgroundColor: seg.color }}
              />
            ))}
          </span>
          <span className="flex flex-wrap gap-x-3 gap-y-0.5">
            {segments.map((seg) => (
              <span
                key={seg.label}
                className="inline-flex items-center gap-1.5 text-[10px] font-medium text-theme-700 dark:text-theme-200"
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: seg.color }} />
                {seg.label}
                <span className="tabular-nums text-theme-600 dark:text-theme-300">{seg.count}</span>
              </span>
            ))}
          </span>
        </span>
      ) : null}
    </>
  );
}

// ---- tomorrow: collapsed line + expandable per-shift detail ----
function TomorrowPanel({ model, error, loading }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="flex flex-col gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/[0.09] px-3.5 py-2">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-[10px] font-semibold tracking-wide text-amber-600 dark:text-amber-400">明日予定</span>
        {model.date ? (
          <span className="text-[11px] font-medium tabular-nums text-theme-600 dark:text-theme-300">
            {formatShortDate(model.date)} ({weekdayJp(model.date)})
          </span>
        ) : null}
        {error ? (
          <span className="text-[10px] text-theme-500 dark:text-theme-400">取得できませんでした</span>
        ) : loading ? (
          <span className="h-4 w-10 animate-pulse rounded bg-amber-200/40 dark:bg-amber-900/30" />
        ) : (
          <>
            <span className="text-[12.5px] font-bold tabular-nums text-theme-800 dark:text-theme-100">
              {model.count} 名
            </span>
            {model.groups.length > 0 ? (
              <span className="text-[10.5px] font-medium tabular-nums text-theme-600 dark:text-theme-300">
                {model.groups.map((group) => `${group.label} ${group.count}`).join(" ・ ")}
                {model.fteText ? ` ・ 換算 ${model.fteText}人` : ""}
              </span>
            ) : null}
            {model.diff && (model.diff.added > 0 || model.diff.removed > 0) ? (
              <span className="text-[10.5px] font-medium tabular-nums text-theme-600 dark:text-theme-300">
                今日比 {/* green stays reserved for the "now" signal — schedule deltas use neutral emphasis */}
                {model.diff.added > 0 ? (
                  <span className="font-semibold text-theme-700 dark:text-theme-200">＋{model.diff.added}</span>
                ) : null}
                {model.diff.added > 0 && model.diff.removed > 0 ? " / " : ""}
                {model.diff.removed > 0 ? <span>−{model.diff.removed}</span> : null}
              </span>
            ) : null}
            {model.groups.length > 0 ? (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen((v) => !v);
                }}
                className="ml-auto inline-flex items-center gap-1 rounded-full border border-theme-300/50 px-2.5 py-0.5 text-[10px] font-semibold text-theme-600 transition-colors hover:bg-theme-200/40 dark:border-theme-600/50 dark:text-theme-300 dark:hover:bg-theme-700/40"
              >
                {open ? "閉じる" : "詳細"}
              </button>
            ) : null}
          </>
        )}
      </div>

      {open && !error && model.groups.length > 0 ? (
        <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
          {model.groups.map((group) => (
            <div
              key={group.key}
              className="flex flex-col gap-1.5 rounded-lg border border-theme-300/40 bg-theme-100/70 px-3 py-2 dark:border-white/[0.08] dark:bg-white/[0.05]"
            >
              <span className="text-[10px] font-semibold text-theme-600 dark:text-theme-300">
                {group.label} <span className="text-amber-600 dark:text-amber-400">{group.count}</span>
                {group.fteText ? (
                  <span className="text-theme-500 dark:text-theme-400"> ｜ 換算 {group.fteText}人</span>
                ) : null}
              </span>
              <div className="grid items-baseline gap-x-2.5 gap-y-1" style={{ gridTemplateColumns: "auto 1fr" }}>
                {group.slots.map((slot) => (
                  <div key={slot.label} className="contents">
                    <span className="rounded bg-theme-200/70 px-1.5 py-px text-center font-mono text-[9px] font-bold tabular-nums text-theme-600 dark:bg-white/10 dark:text-theme-300">
                      {slot.label}
                    </span>
                    <span className="text-[11.5px] font-medium text-theme-800 dark:text-theme-100">
                      {slot.names.join(" ・ ")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function LoadingSkeleton() {
  return (
    <div className="@container flex w-full flex-col gap-2.5 p-1">
      <div className="flex items-center gap-2.5">
        <div className="h-6 w-24 animate-pulse rounded bg-theme-300/40 dark:bg-theme-700/30" />
        <div className="h-2 flex-1 animate-pulse rounded-full bg-theme-300/30 dark:bg-theme-700/25" />
      </div>
      <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))" }}>
        {[0, 1].map((i) => (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-xl border border-theme-300/30 bg-theme-200/25 p-3 dark:border-white/10 dark:bg-white/[0.04]"
          >
            <div className="h-3 w-16 animate-pulse rounded bg-theme-300/40 dark:bg-theme-700/40" />
            {[0, 1, 2, 3, 4].map((r) => (
              <div key={r} className="h-2.5 w-full animate-pulse rounded bg-theme-300/25 dark:bg-theme-700/25" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function buildTomorrowView(tomorrowModel, todayRosterIds, tomorrowSnapshot) {
  const groups = (tomorrowModel.groups || []).map((group) => {
    const slotMap = new Map();
    group.employees.forEach((employee) => {
      const label = employee.shiftText || "-";
      if (!slotMap.has(label)) {
        slotMap.set(label, []);
      }
      slotMap.get(label).push(employee.employee_name);
    });
    const slots = [...slotMap.entries()]
      .map(([label, names]) => ({ label, names, startH: parseShiftBounds(label)?.start ?? 0 }))
      .sort((a, b) => a.startH - b.startH);

    return {
      key: group.key,
      label: group.label,
      count: group.count,
      fteText: group.key === "Production" ? formatScheduledFte(group.scheduledFte) : null,
      slots,
    };
  });

  let diff = null;
  const tomorrowIds = tomorrowSnapshot?.employees?.map((employee) => String(employee.employee));
  if (tomorrowIds && todayRosterIds && todayRosterIds.size > 0) {
    const tomorrowSet = new Set(tomorrowIds);
    let added = 0;
    let removed = 0;
    tomorrowSet.forEach((id) => {
      if (!todayRosterIds.has(id)) {
        added += 1;
      }
    });
    todayRosterIds.forEach((id) => {
      if (!tomorrowSet.has(id)) {
        removed += 1;
      }
    });
    diff = { added, removed };
  }

  const production = groups.find((group) => group.key === "Production");

  return {
    date: tomorrowModel.date,
    count: tomorrowModel.count,
    groups,
    diff,
    fteText: production?.fteText ?? null,
  };
}

export default function Component({ service }) {
  const { widget } = service;
  const [refreshKey, setRefreshKey] = useState(0);
  const [takadaManualStatus, setTakadaManualStatus] = useState(null);
  const now = useNow();
  const nowH = now.getHours() + now.getMinutes() / 60;

  const refreshInterval = Math.max(1000, widget.refreshInterval || 3600000);

  const {
    data: actualData,
    error: actualError,
    mutate: mutateActual,
  } = useWidgetAPI(widget, "actual", {
    refreshKey,
    refreshInterval,
  });

  const {
    data: todayScheduleData,
    error: todayScheduleError,
    mutate: mutateTodaySchedule,
  } = useWidgetAPI(widget, widget.scheduleUrl ? "schedule" : "", {
    day: "today",
    refreshKey,
    refreshInterval,
  });

  const {
    data: tomorrowScheduleData,
    error: tomorrowScheduleError,
    mutate: mutateTomorrowSchedule,
  } = useWidgetAPI(widget, widget.scheduleUrl ? "schedule" : "", {
    day: "tomorrow",
    refreshKey,
    refreshInterval,
  });

  const actualEmployees = useMemo(() => actualData?.message?.employees || [], [actualData]);

  useEffect(() => {
    let cancelled = false;

    async function loadTakadaManualStatus() {
      try {
        const response = await fetch("/api/uoattendance/takada");
        if (!response.ok) {
          return;
        }
        const payload = await response.json();
        if (!cancelled) {
          setTakadaManualStatus(payload?.status || null);
        }
      } catch (e) {
        // The widget still works from HRMS data if local display state is unavailable.
      }
    }

    loadTakadaManualStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  const todaySnapshot = useMemo(
    () => todayScheduleData?.message?.today ?? todayScheduleData?.message ?? null,
    [todayScheduleData],
  );
  const tomorrowSnapshot = useMemo(
    () => tomorrowScheduleData?.message?.tomorrow ?? tomorrowScheduleData?.message ?? null,
    [tomorrowScheduleData],
  );

  const todayModel = useMemo(
    () => buildTodayAttendanceModel({ todaySnapshot, actualEmployees, takadaManualStatus }),
    [todaySnapshot, actualEmployees, takadaManualStatus],
  );
  const tomorrowModel = useMemo(() => buildTomorrowScheduleModel(tomorrowSnapshot), [tomorrowSnapshot]);

  const domain = useMemo(() => buildDomain(todayModel.groups.flatMap((group) => group.employees)), [todayModel]);

  // Per-department rows + a running state tally for the summary bar.
  const view = useMemo(() => {
    const groups = todayModel.groups.map((group) => {
      const dept = deptStyle(group.key);
      const rows = group.employees.map((employee) => buildRow(employee, dept, domain, nowH));
      const working = rows.filter((row) => row.state === "working").length;
      return {
        key: group.key,
        label: group.label,
        dept,
        rows,
        working,
        total: group.totalCount ?? group.count ?? rows.length,
        fteText: group.key === "Production" ? formatScheduledFte(group.scheduledFte) : null,
      };
    });

    const workingTotal = groups.reduce((sum, group) => sum + group.working, 0);
    const notWorkingTotal = groups.reduce(
      (sum, group) => sum + group.rows.filter((row) => row.state === "upcoming" || row.state === "missing").length,
      0,
    );
    const doneTotal = groups.reduce((sum, group) => sum + group.rows.filter((row) => row.state === "done").length, 0);

    const segments = [
      ...groups
        .filter((group) => group.working > 0)
        .map((group) => ({
          label: group.label,
          n: group.working,
          count: `${group.working}/${group.total}`,
          color: group.dept.seg,
        })),
      ...(notWorkingTotal > 0
        ? [{ label: "未出勤", n: notWorkingTotal, count: notWorkingTotal, color: NEUTRAL_SEG }]
        : []),
      ...(doneTotal > 0 ? [{ label: "退勤済", n: doneTotal, count: doneTotal, color: DONE_SEG }] : []),
    ];

    return { groups, workingTotal, segments };
  }, [todayModel, domain, nowH]);

  const tomorrowView = useMemo(() => {
    const todayRosterIds = new Set((todaySnapshot?.employees || []).map((employee) => String(employee.employee)));
    return buildTomorrowView(tomorrowModel, todayRosterIds, tomorrowSnapshot);
  }, [tomorrowModel, todaySnapshot, tomorrowSnapshot]);

  const handleRefresh = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setRefreshKey((prev) => prev + 1);
      mutateActual();
      if (widget.scheduleUrl) {
        mutateTodaySchedule();
        mutateTomorrowSchedule();
      }
    },
    [mutateActual, mutateTodaySchedule, mutateTomorrowSchedule, widget.scheduleUrl],
  );

  const handleTakadaManualToggle = useCallback(
    async (row) => {
      const nextStatus = getNextTakadaManualStatus(row.attendanceStatus, new Date(), todayModel.date || undefined);

      try {
        if (!nextStatus) {
          const response = await fetch("/api/uoattendance/takada", { method: "DELETE" });
          if (response.ok) {
            setTakadaManualStatus(null);
          }
          return;
        }

        const response = await fetch("/api/uoattendance/takada", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(nextStatus),
        });
        if (!response.ok) {
          return;
        }
        const payload = await response.json();
        setTakadaManualStatus(payload?.status || nextStatus);
      } catch (e) {
        // Keep the current display rather than surfacing a dashboard-level error.
      }
    },
    [todayModel.date],
  );

  if (actualError) {
    return <Container service={service} error={actualError} />;
  }

  if (!actualData) {
    return (
      <Container service={service}>
        <LoadingSkeleton />
      </Container>
    );
  }

  const todayDate = formatShortDate(todayModel.date);
  const nothingToShow = view.groups.length === 0 || view.groups.every((group) => group.rows.length === 0);

  return (
    <Container service={service}>
      <div className="@container flex w-full min-w-0 flex-col gap-2.5">
        {/* header + summary */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 px-0.5">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-theme-300/40 bg-theme-200/40 text-theme-600 dark:border-white/10 dark:bg-white/[0.06] dark:text-theme-200">
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="9" cy="8" r="3.2" />
              <path d="M3.4 19.5c.7-3.2 2.8-4.8 5.6-4.8s4.9 1.6 5.6 4.8" />
              <circle cx="16.5" cy="9" r="2.4" />
              <path d="M16.8 14.6c2.2.2 3.6 1.6 4.1 4.2" />
            </svg>
          </span>
          <span className="text-[13px] font-bold text-theme-900 dark:text-theme-50">今日出勤中</span>
          {todayDate ? (
            <span className="text-[11px] font-medium tabular-nums text-theme-600 dark:text-theme-300">
              {todayDate}
              {todayModel.date ? ` (${weekdayJp(todayModel.date)})` : ""}
            </span>
          ) : null}

          <SummaryBar
            workingTotal={view.workingTotal}
            scheduledTotal={todayModel.hasRoster ? todayModel.summary.scheduledCount : 0}
            segments={view.segments}
          />

          <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {widget.rosterCalendar ? (
              <>
                <RosterCalendarLink department="Production" label="生産" title="生産シフトカレンダー（今月）" />
                <RosterCalendarLink department="Office" label="オフィス" title="オフィスシフトカレンダー（今月）" />
              </>
            ) : null}
            <span className="text-[12px] font-medium tabular-nums text-theme-700 dark:text-theme-200">
              現在 {fmtClock(nowH)}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-emerald-600 dark:text-emerald-300">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              LIVE
            </span>
            <button
              type="button"
              onClick={handleRefresh}
              className="rounded-lg border border-theme-300/50 p-1.5 text-theme-600 transition-colors hover:bg-theme-200/40 hover:text-theme-900 dark:border-theme-600/50 dark:text-theme-300 dark:hover:bg-theme-700/40 dark:hover:text-theme-50"
              title="更新"
              aria-label="更新"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          </span>
        </div>

        {widget.scheduleUrl && todayScheduleError ? (
          <div className="px-1 text-[10px] text-theme-500 dark:text-theme-400">
            今日予定を取得できませんでした。現在出勤中のみ表示しています。
          </div>
        ) : null}

        {/* timelines: side-by-side wide, single column narrow/portrait */}
        {nothingToShow ? (
          <div className="py-3 text-center text-xs italic text-theme-500 dark:text-theme-400">
            {todayModel.hasRoster ? "本日の予定はありません" : "現在、出勤者はいません"}
          </div>
        ) : (
          <section className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))" }}>
            {view.groups.map((group) => (
              <DeptTimeline
                key={group.key}
                dept={group.dept}
                label={group.label}
                working={group.working}
                scheduled={group.total}
                fteText={group.fteText}
                rows={group.rows}
                domain={domain}
                nowH={nowH}
                onTakadaManualToggle={handleTakadaManualToggle}
              />
            ))}
          </section>
        )}

        {/* tomorrow */}
        {widget.scheduleUrl ? (
          <TomorrowPanel
            model={tomorrowView}
            error={tomorrowScheduleError}
            loading={!tomorrowScheduleData && !tomorrowScheduleError}
          />
        ) : null}
      </div>
    </Container>
  );
}
