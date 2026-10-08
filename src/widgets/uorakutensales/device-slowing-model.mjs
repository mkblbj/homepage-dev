/*
 * 失速 — the models selling slower this month than last month.
 *
 * 失速 is a stall: a model that kept a daily pace last month and has lost speed
 * since. Pace is a metric per day —
 *   this month: finished days only. Today's half-run day comes out by
 *               subtracting today's board, which the server builds from the same
 *               cache as the month board (equal generatedAtJST).
 *   last month: the whole month over its own length.
 * Only models that sold at least SLOWING_MIN_UNITS last month take part, so a
 * one-off sale cannot top the list, and rows rank by the pace lost per day, so
 * a big seller slipping outranks a small one fading.
 */
import { metricReady, rankDeviceBoard } from "./device-sales-model.mjs";

export const SLOWING_MIN_UNITS = 30;

// "2026-10-08" → 8
function dayOf(date) {
  const day = Number(String(date || "").slice(8, 10));
  return Number.isFinite(day) ? day : 0;
}

// "2026-09" → 30; day 0 of the next month is the last of this one (UTC, so the
// runtime's timezone cannot shift it)
function daysInMonth(month) {
  const [y, m] = String(month || "")
    .split("-")
    .map(Number);
  return y && m ? new Date(Date.UTC(y, m, 0)).getUTCDate() : 0;
}

// Whether the view can run now, and over how many days on each side.
export function slowingWindow(devices) {
  const { today, thisMonth, lastMonth } = devices?.periods || {};
  if (!lastMonth?.ready) return { reason: "lastMonthPending" };
  if (!thisMonth?.ready) return { reason: "updating" };
  const completedDays = dayOf(thisMonth.endDate) - 1;
  // on the 1st nothing has finished yet — a running day is no pace
  if (completedDays < 1) return { reason: "monthStart" };
  const builds = devices.builds || {};
  const sameBuild = Boolean(builds.daily) && builds.daily === builds.monthly;
  if (!today?.ready || today.label !== thisMonth.endDate || !sameBuild) return { reason: "updating" };
  return { reason: null, completedDays, lastMonthDays: daysInMonth(lastMonth.label) };
}

// a period's boards for the company (shop null) or one shop
function scopeOf(period, shop) {
  if (!period?.ready) return null;
  if (!shop) return { types: period.types, totals: period.totals };
  const entry = period.shops.find((s) => s.name === shop);
  return entry ? { types: entry.types, totals: entry.totals } : null;
}

function paceOf(monthValue, todayValue, days) {
  return Math.max(0, (monthValue ?? 0) - (todayValue ?? 0)) / days;
}

function changeOf(pace, prevPace) {
  return prevPace > 0 ? (pace / prevPace - 1) * 100 : null;
}

// One category's slowing list for a scope: the whole category ("all"), or one
// case style read from the style boards on all three sides. Null when the
// window is closed or the scope has no such board in one of the three periods.
export function buildSlowing(devices, { shop = null, type, metric, style = "all" }) {
  const span = slowingWindow(devices);
  if (span.reason) return null;
  const today = scopeOf(devices.periods.today, shop);
  const now = scopeOf(devices.periods.thisMonth, shop);
  const before = scopeOf(devices.periods.lastMonth, shop);
  if (!today || !now || !before) return null;

  // a style one side cannot split gives no list rather than mixing in the whole category
  const pick = (board) => (style === "all" ? board : (board?.styles?.[style] ?? null));
  const todayBoard = pick(today.types[type]);
  const nowBoard = pick(now.types[type]);
  const beforeBoard = pick(before.types[type]);
  if (!todayBoard || !nowBoard || !beforeBoard) return null;
  // money compares only when all three boards have it; units always do
  const m = [todayBoard, nowBoard, beforeBoard].every((board) => metricReady(board, metric)) ? metric : "units";
  const { completedDays, lastMonthDays } = span;
  const byModel = (board) => new Map(board.rows.map((r) => [r.fullModel, r]));
  const nowRows = byModel(nowBoard);
  const todayRows = byModel(todayBoard);
  const prevRank = new Map(rankDeviceBoard(beforeBoard, m).map((r) => [r.fullModel, r.rank]));
  const eligible = beforeBoard.rows.filter((r) => (r.units ?? 0) >= SLOWING_MIN_UNITS);

  const rows = eligible
    .map((r) => {
      // a model missing from this month sold nothing yet: pace 0
      const pace = paceOf(nowRows.get(r.fullModel)?.[m], todayRows.get(r.fullModel)?.[m], completedDays);
      const prevPace = (r[m] ?? 0) / lastMonthDays;
      return {
        model: r.model,
        fullModel: r.fullModel,
        compat: r.compat,
        models: r.models,
        prevRank: prevRank.get(r.fullModel) ?? r.rank,
        pace,
        prevPace,
        loss: prevPace - pace,
        changePct: changeOf(pace, prevPace),
        // this month's pace as a share of last month's, for the bar
        ratio: prevPace > 0 ? Math.min(100, (pace / prevPace) * 100) : 0,
      };
    })
    .filter((r) => r.loss > 0)
    .sort((a, b) => b.loss - a.loss || a.prevRank - b.prevRank)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  const pace = paceOf(nowBoard[m], todayBoard[m], completedDays);
  const prevPace = (beforeBoard[m] ?? 0) / lastMonthDays;
  return {
    metric: m,
    completedDays,
    eligible: eligible.length,
    pace,
    prevPace,
    changePct: changeOf(pace, prevPace),
    rows,
  };
}

// The 3カテゴリ合計 pace for a scope, over the same finished days.
export function slowingTotals(devices, { shop = null, metric }) {
  const span = slowingWindow(devices);
  if (span.reason) return null;
  const today = scopeOf(devices.periods.today, shop)?.totals;
  const now = scopeOf(devices.periods.thisMonth, shop)?.totals;
  const before = scopeOf(devices.periods.lastMonth, shop)?.totals;
  if (!today || !now || !before) return null;
  const m = [today, now, before].every((totals) => totals[metric] != null) ? metric : "units";
  const pace = paceOf(now[m], today[m], span.completedDays);
  const prevPace = (before[m] ?? 0) / span.lastMonthDays;
  return { metric: m, pace, prevPace, changePct: changeOf(pace, prevPace) };
}
