// 「毎日のチェック」: the part of the 楽天 tab read every day. Today, this
// month and the latest visits sit on top, then one table with every shop on
// one line. One metric switch drives all of it; a figure that is unknown reads
// as a dash, never as zero.
import { useState } from "react";
import { DASH, mdLabel, weekdayJp } from "widgets/uoperformance/performance-model.mjs";

import { deltaTone, METRICS, todayVsAverage } from "./daily-check-model.mjs";
import { FALLBACK_SHOP_COLOR, man } from "./sales-model.mjs";

const NS = "uorakutensales";
const METRIC_LABEL = { sales: "sortSales", units: "sortUnits", orders: "sortOrders" };
const UNIT_KEY = { units: "unitsShort", orders: "ordersUnit" };
const TODAY_KEY = { sales: "rtTotal", units: "rtUnits", orders: "rtOrders" };
const ROW_TODAY_KEY = { sales: "rtSales", units: "rtUnits", orders: "rtOrders" };

const TONE_CLASS = {
  down: "font-bold text-rose-600 dark:text-rose-300",
  up: "font-bold text-emerald-600 dark:text-emerald-300",
  flat: "text-theme-700 dark:text-theme-200",
  unknown: "text-theme-500 dark:text-theme-400",
};
const MUTED = "text-theme-600 dark:text-theme-300";
const ACCENT_TEXT = "text-[#C6362B] dark:text-[#F0857A]";
// neutral on purpose: a part-day ratio is neither good nor bad
const NEUTRAL_BAR = "bg-slate-500/70 dark:bg-[#8FA6C6]";
const CHART_HEIGHT = 112;

function fmt(t, value) {
  return t("common.number", { value: Number(value) || 0 });
}

function valueText(metric, value, t) {
  if (metric === "sales") return `¥${fmt(t, value)}`;
  return `${fmt(t, Math.round(value))}${t(`${NS}.${UNIT_KEY[metric]}`)}`;
}

// 万 for yen keeps a column of month totals and daily paces short
function shortText(metric, value, t) {
  if (value === null || value === undefined) return DASH;
  if (metric === "sales") return `¥${man(value)}${t(`${NS}.manUnit`)}`;
  return valueText(metric, value, t);
}

function signedPct(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return DASH;
  const sign = value > 0 ? "+" : value < 0 ? "−" : "±";
  return `${sign}${Math.abs(value).toFixed(1)}%`;
}

export function Delta({ value, className = "" }) {
  const tone = deltaTone(value);
  return (
    <span data-tone={tone} className={`tabular-nums ${TONE_CLASS[tone]} ${className}`}>
      {signedPct(value)}
    </span>
  );
}

function stop(e) {
  e.preventDefault();
  e.stopPropagation();
}

export function MetricSwitch({ metric, onChange, t }) {
  return (
    <div
      role="group"
      aria-label={t(`${NS}.metric`)}
      className="flex shrink-0 gap-0.5 rounded-lg border border-theme-300/60 bg-theme-100/50 p-0.5 dark:border-theme-600/60 dark:bg-theme-900/30"
    >
      {METRICS.map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={m === metric}
          onClick={(e) => {
            stop(e);
            onChange(m);
          }}
          className={`min-w-[52px] rounded-md px-3 py-1 text-xs font-bold transition-colors ${
            m === metric
              ? "bg-theme-700 text-white dark:bg-theme-100 dark:text-theme-900"
              : "text-theme-600 hover:bg-theme-200/60 dark:text-theme-300 dark:hover:bg-theme-700/60"
          }`}
        >
          {t(`${NS}.${METRIC_LABEL[m]}`)}
        </button>
      ))}
    </div>
  );
}

// the two metrics the switch is not showing, plus 客単価 / 点数 where they belong
function todaySubLine(model, metric, t) {
  const parts = METRICS.filter((m) => m !== metric).map((m) => valueText(m, model[TODAY_KEY[m]], t));
  if (metric !== "units") parts.push(`${t(`${NS}.aov`)} ¥${fmt(t, model.aov)}`);
  if (metric !== "orders") parts.push(`${t(`${NS}.unitsPerOrder`)} ×${model.rtUnitsPerOrder.toFixed(2)}`);
  return parts.join(" · ");
}

function barLabel(metric, value, t) {
  return metric === "sales" ? `${Math.round(value / 10000)}${t(`${NS}.manUnit`)}` : fmt(t, value);
}

function WeekBars({ model, metric, value, avg, t }) {
  const series = model.days.map((d) => ({ key: d.date, md: d.md, wd: d.wd, v: d[metric] || 0 }));
  const peak = Math.max(1, value, ...series.map((d) => d.v));
  const px = (v) => `${Math.max(3, Math.round((v / peak) * CHART_HEIGHT))}px`;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className={`font-bold ${MUTED}`}>{t(`${NS}.last7AndToday`)}</span>
        {avg ? <span className={MUTED}>{t(`${NS}.avgLine`)}</span> : null}
      </div>
      <div className="relative flex h-[136px] items-end gap-2 pt-5" aria-hidden="true">
        {avg ? (
          <span
            className="absolute inset-x-0 border-t border-dashed border-theme-500 dark:border-theme-400"
            style={{ bottom: px(avg) }}
          />
        ) : null}
        {series.map((d) => (
          <span key={d.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className={`whitespace-nowrap text-[11px] tabular-nums ${MUTED}`}>{barLabel(metric, d.v, t)}</span>
            <span className="block w-full max-w-[34px] rounded-t bg-[#5F7FAF]" style={{ height: px(d.v) }} />
          </span>
        ))}
        <span className="flex h-full flex-1 flex-col items-center justify-end gap-1">
          <span className={`whitespace-nowrap text-[11px] font-bold tabular-nums ${ACCENT_TEXT}`}>
            {barLabel(metric, value, t)}
          </span>
          <span
            className="block w-full max-w-[34px] rounded-t border-2 border-dashed border-[#F0857A] bg-[#F0857A]/20"
            style={{ height: px(value) }}
          />
        </span>
      </div>
      <div className="flex gap-2 text-center text-xs leading-tight">
        {series.map((d) => (
          <span key={d.key} className={`flex-1 ${MUTED}`}>
            {d.md}
            <br />
            {d.wd}
          </span>
        ))}
        <span className={`flex-1 font-bold ${ACCENT_TEXT}`}>{t(`${NS}.todayLabel`)}</span>
      </div>
    </div>
  );
}

export function TodayCard({ model, metric, shopColors, cardCls = "", t }) {
  const { value, avg, pct } = todayVsAverage(model, metric);
  const mix = model.rows.filter((r) => r[ROW_TODAY_KEY[metric]] > 0);
  return (
    <section className={`flex min-w-0 flex-wrap justify-between gap-6 p-5 ${cardCls}`}>
      <div className="flex min-w-[260px] flex-1 flex-col gap-3">
        <span className="flex items-baseline gap-2">
          <span className="text-sm font-bold text-theme-800 dark:text-theme-100">{t(`${NS}.todayLabel`)}</span>
          {model.time ? <span className={`text-xs ${MUTED}`}>{t(`${NS}.asOf`, { time: model.time })}</span> : null}
        </span>
        <span className={`text-[52px] font-extrabold leading-none tracking-tight tabular-nums ${ACCENT_TEXT}`}>
          {valueText(metric, value, t)}
        </span>
        <span className="text-sm tabular-nums text-theme-700 dark:text-theme-200">
          {todaySubLine(model, metric, t)}
        </span>
        {value > 0 ? (
          <span className="flex h-2 overflow-hidden rounded-full bg-theme-300/40 dark:bg-white/10">
            {mix.map((r) => (
              <span
                key={r.name}
                className="block h-full"
                title={r.name}
                style={{
                  width: `${(r[ROW_TODAY_KEY[metric]] / value) * 100}%`,
                  backgroundColor: shopColors[r.name] ?? FALLBACK_SHOP_COLOR,
                }}
              />
            ))}
          </span>
        ) : null}
        {pct !== null ? (
          <div className="mt-1 flex flex-col gap-1.5">
            <span className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-theme-700 dark:text-theme-200">
                {t(`${NS}.vsAvgOf`, { avg: valueText(metric, avg, t) })}
              </span>
              <span className="text-lg font-extrabold tabular-nums text-theme-900 dark:text-theme-50">
                {Math.round(pct)}%
              </span>
            </span>
            <span className="block h-2 overflow-hidden rounded-full bg-theme-300/40 dark:bg-white/10">
              <span
                className={`block h-full rounded-full ${NEUTRAL_BAR}`}
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </span>
            <span className={`text-xs ${MUTED}`}>{t(`${NS}.todayNoTimeCorrection`)}</span>
          </div>
        ) : null}
      </div>
      {model.hasHistory ? (
        <div className="min-w-[280px] flex-1 @5xl:max-w-[400px]">
          <WeekBars model={model} metric={metric} value={value} avg={avg} t={t} />
        </div>
      ) : null}
    </section>
  );
}

export function MonthCard({ monthly, metric, cardCls = "", t }) {
  if (!monthly) return null;
  const m = monthly.metrics[metric];
  const cur = monthly.current;
  const done = t(`${NS}.monthCompleted`, { count: cur.completedDays });
  return (
    <section className={`flex min-w-0 flex-col gap-2 p-5 ${cardCls}`}>
      <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-bold text-theme-800 dark:text-theme-100">
          {t(`${NS}.thisMonth`)}{" "}
          <span className={`text-xs font-medium ${MUTED}`}>
            {cur.month} · {done}
            {cur.hasLiveDay ? `＋${t(`${NS}.todayLabel`)}` : ""}
          </span>
        </span>
        <span className={`text-xs ${MUTED}`}>
          {t(`${NS}.prevPaceDelta`)} <Delta value={m.paceDeltaPct} className="ml-1 text-base font-extrabold" />
        </span>
      </span>
      <span className="text-[32px] font-extrabold leading-tight tabular-nums text-theme-900 dark:text-theme-50">
        {shortText(metric, m.current, t)}
      </span>
      <span className="text-sm tabular-nums text-theme-700 dark:text-theme-200">
        {t(`${NS}.dailyAvgVsPrev`, { pace: shortText(metric, m.pace, t), prev: shortText(metric, m.prevPace, t) })}
      </span>
      {m.vsPrevPct !== null ? (
        <>
          <span className="relative mt-1 block h-2 rounded-full bg-theme-300/45 dark:bg-white/10">
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-amber-500 dark:bg-[#E8B26A]"
              style={{ width: `${Math.min(100, m.vsPrevPct)}%` }}
            />
            <span
              className="absolute -top-1 h-4 w-0.5 rounded-full bg-theme-800 dark:bg-white"
              style={{ left: `calc(${Math.min(100, cur.progressPct)}% - 1px)` }}
            />
          </span>
          <span className={`flex flex-wrap justify-between gap-x-3 text-xs tabular-nums ${MUTED}`}>
            <span>
              {t(`${NS}.reachOfPrev`, { prev: shortText(metric, m.previous, t), pct: m.vsPrevPct.toFixed(1) })}
            </span>
            <span>{t(`${NS}.monthElapsed`, { pct: Math.round(cur.progressPct) })}</span>
          </span>
        </>
      ) : null}
    </section>
  );
}

export function visitDayLabel(dateStr) {
  return dateStr ? `${mdLabel(dateStr)}（${weekdayJp(dateStr)}）` : "";
}

export function VisitCard({ performance, cardCls = "", t }) {
  if (!performance || performance.visit === null) return null;
  // fewer than 3 same-weekday samples means there is no median to compare with
  const delta = performance.sampleCount >= 3 ? performance.delta : null;
  return (
    <section className={`flex min-w-0 flex-col gap-2 p-5 ${cardCls}`}>
      <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-bold text-theme-800 dark:text-theme-100">
          {t(`${NS}.visitsTitle`)}{" "}
          <span className={`text-xs font-medium ${MUTED}`}>
            {visitDayLabel(performance.dataDateJST)} · {t(`${NS}.confirmed`)}
          </span>
        </span>
        <span className={`text-xs ${MUTED}`}>
          {t(`${NS}.medianDelta`)} <Delta value={delta} className="ml-1 text-base font-extrabold" />
        </span>
      </span>
      <span className="text-[32px] font-extrabold leading-tight tabular-nums text-theme-900 dark:text-theme-50">
        {fmt(t, performance.visit)}
        <span className="ml-1 text-lg font-bold">{t(`${NS}.peopleUnit`)}</span>
      </span>
      <span className="text-sm tabular-nums text-theme-700 dark:text-theme-200">
        {t(`${NS}.visitDetail`, {
          median: performance.expected === null ? DASH : fmt(t, Math.round(performance.expected)),
          uu: performance.uu === null ? DASH : fmt(t, performance.uu),
        })}
      </span>
    </section>
  );
}

const TH = "px-2 py-2 text-xs font-semibold text-theme-600 dark:text-theme-300";
const TD = "px-2 py-2.5 text-sm tabular-nums text-right";

function ShopName({ name, color }) {
  return (
    <span className="flex items-center gap-2 font-bold text-theme-900 dark:text-theme-50">
      <span
        aria-hidden="true"
        className="block h-2.5 w-2.5 shrink-0 rounded-[3px]"
        style={{ backgroundColor: color }}
      />
      {name}
    </span>
  );
}

function TodayCell({ row, metric, maxToday, color, t }) {
  const others = METRICS.filter((m) => m !== metric)
    .map((m) => valueText(m, row.today[m], t))
    .join(" · ");
  return (
    <td className="px-2 py-2.5">
      <span className="flex items-baseline justify-between gap-3">
        <span className={`text-base font-extrabold tabular-nums ${ACCENT_TEXT}`}>
          {valueText(metric, row.today[metric], t)}
        </span>
        <span className={`whitespace-nowrap text-xs tabular-nums ${MUTED}`}>{others}</span>
      </span>
      {color ? (
        <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-theme-300/40 dark:bg-white/10">
          <span
            className="block h-full rounded-full"
            style={{ width: `${Math.max(2, (row.today[metric] / maxToday) * 100)}%`, backgroundColor: color }}
          />
        </span>
      ) : null}
    </td>
  );
}

function AvgRatioCell({ row, metric }) {
  const avg = row.avg?.[metric];
  const pct = avg > 0 ? (row.today[metric] / avg) * 100 : null;
  return (
    <td className="px-2 py-2.5">
      {pct === null ? (
        <span className="block text-right text-sm text-theme-500 dark:text-theme-400">{DASH}</span>
      ) : (
        <span className="flex items-center gap-2">
          <span className="block h-1.5 flex-1 overflow-hidden rounded-full bg-theme-300/40 dark:bg-white/10">
            <span className={`block h-full ${NEUTRAL_BAR}`} style={{ width: `${Math.min(100, pct)}%` }} />
          </span>
          <span className="w-10 text-right text-sm font-bold tabular-nums text-theme-900 dark:text-theme-50">
            {Math.round(pct)}%
          </span>
        </span>
      )}
    </td>
  );
}

function ShopRow({ row, metric, total, maxToday, color, t, isTotal = false }) {
  const share = total > 0 ? `${((row.today[metric] / total) * 100).toFixed(1)}%` : DASH;
  return (
    <tr
      className={
        isTotal
          ? "border-t-2 border-theme-300/70 font-bold dark:border-white/20"
          : "border-b border-theme-300/30 dark:border-white/[0.07]"
      }
    >
      <th scope="row" className="px-2 py-2.5 text-left text-sm">
        {isTotal ? (
          <span className="font-bold text-theme-900 dark:text-theme-50">{t(`${NS}.total`)}</span>
        ) : (
          <ShopName name={row.name} color={color} />
        )}
      </th>
      <TodayCell row={row} metric={metric} maxToday={maxToday} color={isTotal ? null : color} t={t} />
      <td className={`${TD} ${MUTED}`}>{share}</td>
      <AvgRatioCell row={row} metric={metric} />
      <td className={`${TD} text-theme-800 dark:text-theme-100`}>{shortText(metric, row.avg?.[metric], t)}</td>
      <td className={`${TD} ${MUTED}`}>{row.cvr === null ? DASH : `${row.cvr.toFixed(2)}%`}</td>
      <td className={`${TD} font-bold text-theme-900 dark:text-theme-50`}>
        {shortText(metric, row.month?.[metric], t)}
      </td>
      <td className={TD}>
        <Delta value={row.monthDelta?.[metric] ?? null} />
      </td>
      <td className={`${TD} text-theme-800 dark:text-theme-100`}>{row.visits === null ? DASH : fmt(t, row.visits)}</td>
      <td className={TD}>
        <Delta value={row.visitDelta} />
      </td>
    </tr>
  );
}

function IdleRow({ row, color, t }) {
  return (
    <tr className="border-b border-theme-300/30 text-theme-500 dark:border-white/[0.07] dark:text-theme-400">
      <th scope="row" className="px-2 py-2 text-left text-sm">
        <ShopName name={row.name} color={color} />
      </th>
      <td colSpan={7} className="px-2 py-2 text-xs">
        {t(`${NS}.idleNote`)}
      </td>
      <td className={TD}>{row.visits === null ? DASH : fmt(t, row.visits)}</td>
      <td className={TD}>
        <Delta value={row.visitDelta} />
      </td>
    </tr>
  );
}

// `periods` labels the column groups: { today, week, month, visits }
export function ShopTable({ table, metric, shopColors, periods = {}, cardCls = "", t }) {
  const [showIdle, setShowIdle] = useState(false);
  const colorOf = (name) => shopColors[name] ?? FALLBACK_SHOP_COLOR;
  const maxToday = Math.max(1, ...table.rows.map((r) => r.today[metric]));
  const total = table.total.today[metric];
  const group = (key, span, border) => (
    <th colSpan={span} scope="colgroup" className={`border-b-2 px-2 pb-1.5 text-left text-xs font-bold ${border}`}>
      <span className="text-theme-800 dark:text-theme-100">{t(`${NS}.${key}`)}</span>
      {periods[key] ? <span className={`ml-1.5 font-medium ${MUTED}`}>{periods[key]}</span> : null}
    </th>
  );
  return (
    <section className={`flex min-w-0 flex-col gap-3 p-5 ${cardCls}`}>
      <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-base font-extrabold text-theme-900 dark:text-theme-50">{t(`${NS}.shopTable`)}</span>
        <span className={`text-xs ${MUTED}`}>{t(`${NS}.shopTableNote`)}</span>
      </span>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] border-collapse">
          <thead>
            <tr>
              <th aria-hidden="true" />
              {group("colToday", 3, "border-rose-400/80")}
              {group("colWeek", 2, "border-sky-400/70")}
              {group("colMonth", 2, "border-amber-400/80")}
              {group("colVisits", 2, "border-emerald-400/70")}
            </tr>
            <tr className="border-b border-theme-300/50 dark:border-white/10">
              <th scope="col" className={`${TH} w-[140px] text-left`}>
                {t(`${NS}.colShop`)}
              </th>
              <th scope="col" className={`${TH} text-left`}>
                {t(`${NS}.${METRIC_LABEL[metric]}`)}
              </th>
              <th scope="col" className={`${TH} w-[72px] text-right`}>
                {t(`${NS}.share`)}
              </th>
              <th scope="col" className={`${TH} w-[132px] text-left`}>
                {t(`${NS}.vsAvg`)}
              </th>
              <th scope="col" className={`${TH} w-[104px] text-right`}>
                {t(`${NS}.perDayAvg`)}
              </th>
              <th scope="col" className={`${TH} w-[76px] text-right`}>
                CVR
              </th>
              <th scope="col" className={`${TH} w-[116px] text-right`}>
                {t(`${NS}.cumulative`)}
              </th>
              <th scope="col" className={`${TH} w-[96px] text-right`}>
                {t(`${NS}.vsPrev`)}
              </th>
              <th scope="col" className={`${TH} w-[88px] text-right`}>
                {t(`${NS}.visits`)}
              </th>
              <th scope="col" className={`${TH} w-[88px] text-right`}>
                {t(`${NS}.vsMedian`)}
              </th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <ShopRow
                key={row.name}
                row={row}
                metric={metric}
                total={total}
                maxToday={maxToday}
                color={colorOf(row.name)}
                t={t}
              />
            ))}
            {showIdle
              ? table.idle.map((row) => <IdleRow key={row.name} row={row} color={colorOf(row.name)} t={t} />)
              : null}
          </tbody>
          <tfoot>
            <ShopRow row={table.total} metric={metric} total={total} maxToday={maxToday} t={t} isTotal />
          </tfoot>
        </table>
      </div>
      {table.idle.length ? (
        <button
          type="button"
          aria-expanded={showIdle}
          onClick={(e) => {
            stop(e);
            setShowIdle((open) => !open);
          }}
          className="self-start rounded-lg border border-dashed border-theme-400/60 px-3 py-1.5 text-xs font-semibold text-theme-600 transition-colors hover:bg-theme-200/50 dark:border-white/20 dark:text-theme-300 dark:hover:bg-white/[0.06]"
        >
          {showIdle
            ? t(`${NS}.idleHide`)
            : t(`${NS}.idleShow`, { count: table.idle.length, names: table.idle.map((r) => r.name).join("・") })}
        </button>
      ) : null}
    </section>
  );
}
