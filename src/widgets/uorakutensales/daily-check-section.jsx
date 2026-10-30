// 「毎日のチェック」: the part of the 楽天 tab read every day. Today, this
// month and the latest visits sit on top, then one table with every shop on
// one line. One metric switch drives all of it; a figure that is unknown reads
// as a dash, never as zero.
import { Fragment, useEffect, useState } from "react";
import { DASH, mdLabel, weekdayJp } from "widgets/uoperformance/performance-model.mjs";

import { deltaTone, historyComparable, METRICS, todayVsAverage } from "./daily-check-model.mjs";
import { FALLBACK_SHOP_COLOR, man } from "./sales-model.mjs";

const NS = "uorakutensales";
const METRIC_LABEL = { sales: "sortSales", units: "sortUnits", orders: "sortOrders" };
const UNIT_KEY = { units: "unitsShort", orders: "ordersUnit" };
const PLATFORM_KEY = { rakuten: "platformRakuten", amazon: "platformAmazon" };

const TONE_CLASS = {
  down: "font-bold text-rose-600 dark:text-rose-300",
  up: "font-bold text-emerald-600 dark:text-emerald-300",
  flat: "text-theme-700 dark:text-theme-200",
  unknown: "text-theme-500 dark:text-theme-400",
};
const MUTED = "text-theme-600 dark:text-theme-300";
const WARN = "text-amber-700 dark:text-amber-300";
const ACCENT_TEXT = "text-[#C6362B] dark:text-[#F0857A]";
// neutral on purpose: a part-day ratio is neither good nor bad
const NEUTRAL_BAR = "bg-slate-500/70 dark:bg-[#8FA6C6]";
const CHART_HEIGHT = 112;

function fmt(t, value) {
  return t("common.number", { value: Number(value) || 0 });
}

// whole yen and whole pieces — a 7-day average must not read ¥752,443.571
export function valueText(metric, value, t) {
  if (value === null || value === undefined) return DASH;
  if (metric === "sales") return `¥${fmt(t, Math.round(value))}`;
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
function todaySubLine(view, metric, t) {
  const parts = METRICS.filter((m) => m !== metric).map((m) => valueText(m, view.values[m], t));
  if (metric !== "units") parts.push(`${t(`${NS}.aov`)} ${view.aov === null ? DASH : `¥${fmt(t, view.aov)}`}`);
  if (metric !== "orders") {
    const perOrder = view.unitsPerOrder;
    parts.push(`${t(`${NS}.unitsPerOrder`)} ${perOrder === null ? DASH : `×${perOrder.toFixed(2)}`}`);
  }
  return parts.join(" · ");
}

// whole 万 once a day passes ¥100,000; one decimal below that, so a quiet day never reads 0万
export function barLabel(metric, value, t) {
  if (metric !== "sales") return fmt(t, value);
  return `${value >= 100000 ? Math.round(value / 10000) : man(value)}${t(`${NS}.manUnit`)}`;
}

// The days every shop has, then today. Today's bar only stands beside them when
// both sides count the same way: 売上 history is after coupons, today before.
function WeekBars({ days, metric, value, avg, t }) {
  const withToday = historyComparable(metric) && value !== null;
  const series = days.map((d) => ({ key: d.date, md: d.md, wd: d.wd, v: d[metric] || 0 }));
  const peak = Math.max(1, withToday ? value : 0, ...series.map((d) => d.v));
  const px = (v) => `${Math.max(3, Math.round((v / peak) * CHART_HEIGHT))}px`;
  const count = series.length;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className={`font-bold ${MUTED}`}>
          {withToday ? t(`${NS}.lastDaysAndToday`, { count }) : t(`${NS}.lastDaysAfterCoupon`, { count })}
        </span>
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
            <span className={`whitespace-nowrap text-xs tabular-nums ${MUTED}`}>{barLabel(metric, d.v, t)}</span>
            <span className="block w-full max-w-[34px] rounded-t bg-[#5F7FAF]" style={{ height: px(d.v) }} />
          </span>
        ))}
        {withToday ? (
          <span className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className={`whitespace-nowrap text-xs font-bold tabular-nums ${ACCENT_TEXT}`}>
              {barLabel(metric, value, t)}
            </span>
            <span
              className="block w-full max-w-[34px] rounded-t border-2 border-dashed border-[#F0857A] bg-[#F0857A]/20"
              style={{ height: px(value) }}
            />
          </span>
        ) : null}
      </div>
      <div className="flex gap-2 text-center text-xs leading-tight">
        {series.map((d) => (
          <span key={d.key} className={`flex-1 ${MUTED}`}>
            {d.md}
            <br />
            {d.wd}
          </span>
        ))}
        {withToday ? <span className={`flex-1 font-bold ${ACCENT_TEXT}`}>{t(`${NS}.todayLabel`)}</span> : null}
      </div>
    </div>
  );
}

function platformLabel(platform, t) {
  return t(`${NS}.${PLATFORM_KEY[platform]}`);
}

// one line per platform, the picked metric first: its own counts and yen, read
// at its own time
function PlatformLines({ platforms, metric, t }) {
  const order = [metric, ...METRICS.filter((m) => m !== metric)];
  return (
    <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 text-sm tabular-nums">
      {platforms.map((p) => (
        <Fragment key={p.platform}>
          <span className="font-bold text-theme-800 dark:text-theme-100">{platformLabel(p.platform, t)}</span>
          <span className="text-theme-700 dark:text-theme-200">
            {order.map((m) => valueText(m, p.values[m], t)).join(" · ")}
            {p.aov !== null ? ` · ${t(`${NS}.aov`)} ¥${fmt(t, p.aov)}` : ""}
            {p.time ? <span className={`ml-2 text-xs ${MUTED}`}>{t(`${NS}.asOf`, { time: p.time })}</span> : null}
          </span>
        </Fragment>
      ))}
    </div>
  );
}

// `view` is buildTodayView's: one platform, or 楽天 and Amazon side by side
export function TodayCard({ view, metric, shopColors, cardCls = "", t }) {
  const { value, avg, pct } = todayVsAverage(view, metric);
  // 売上 across platforms is never one figure: each platform keeps its own
  const split = view.multi && metric === "sales";
  const mix = split ? [] : view.mix.filter((r) => r.values[metric] > 0);
  // today's total adds up fewer shops than the list holds — e.g. one without the order API
  const coverage = view.coverage && view.coverage.covered < view.coverage.total ? view.coverage : null;
  const days = metric === "sales" ? view.salesDays : view.days;
  return (
    <section className={`flex min-w-0 flex-wrap justify-between gap-6 p-5 ${cardCls}`}>
      <div className="flex min-w-[260px] flex-1 flex-col gap-3">
        <span className="flex items-baseline gap-2">
          <span className="text-sm font-bold text-theme-800 dark:text-theme-100">{t(`${NS}.todayLabel`)}</span>
          {view.time || coverage ? (
            <span className={`text-xs ${MUTED}`}>
              {view.time ? t(`${NS}.asOf`, { time: view.time }) : ""}
              {view.time && coverage ? " · " : ""}
              {coverage ? t(`${NS}.shopCoverage`, coverage) : ""}
            </span>
          ) : null}
        </span>
        {split ? (
          <span className="flex flex-col gap-1.5">
            {view.platforms.map((p) => (
              <span key={p.platform} className="flex items-baseline gap-3">
                <span className="w-16 shrink-0 text-sm font-bold text-theme-800 dark:text-theme-100">
                  {platformLabel(p.platform, t)}
                </span>
                <span className={`text-[36px] font-extrabold leading-none tracking-tight tabular-nums ${ACCENT_TEXT}`}>
                  {valueText("sales", p.values.sales, t)}
                </span>
              </span>
            ))}
          </span>
        ) : (
          <span className={`text-[52px] font-extrabold leading-none tracking-tight tabular-nums ${ACCENT_TEXT}`}>
            {valueText(metric, value, t)}
          </span>
        )}
        {view.multi ? (
          <PlatformLines platforms={view.platforms} metric={metric} t={t} />
        ) : (
          <span className="text-sm tabular-nums text-theme-700 dark:text-theme-200">
            {todaySubLine(view, metric, t)}
          </span>
        )}
        {value > 0 && mix.length ? (
          <span className="flex h-2 overflow-hidden rounded-full bg-theme-400/40 dark:bg-white/10">
            {mix.map((r) => (
              <span
                key={r.key}
                className="block h-full"
                title={r.name}
                style={{
                  width: `${(r.values[metric] / value) * 100}%`,
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
            <span className="block h-2 overflow-hidden rounded-full bg-theme-400/40 dark:bg-white/10">
              <span
                className={`block h-full rounded-full ${NEUTRAL_BAR}`}
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </span>
            <span className={`text-xs ${MUTED}`}>{t(`${NS}.todayNoTimeCorrection`)}</span>
          </div>
        ) : null}
        {split ? <span className={`mt-1 text-xs ${MUTED}`}>{t(`${NS}.salesNotSummed`)}</span> : null}
        {days.length && !historyComparable(metric) ? (
          <span className={`text-xs ${MUTED}`}>{t(`${NS}.salesBasisNote`)}</span>
        ) : null}
      </div>
      {days.length ? (
        <div className="min-w-[280px] flex-1 @5xl:max-w-[400px]">
          <WeekBars days={days} metric={metric} value={value} avg={avg} t={t} />
        </div>
      ) : null}
    </section>
  );
}

// `monthly` is buildMonthView's. Across platforms the 売上 metric is null: each
// platform's yen get a line of their own instead of one company figure.
export function MonthCard({ monthly, metric, cardCls = "", t }) {
  if (!monthly) return null;
  const m = monthly.metrics[metric];
  const cur = monthly.current;
  const done = t(`${NS}.monthCompleted`, { count: cur.completedDays });
  // the month (and last month, which is only compared over the same shops)
  // adds up fewer shops than the list holds — e.g. one without the order API
  const coverage = cur.coverage && cur.coverage.covered < cur.coverage.total ? cur.coverage : null;
  return (
    <section className={`flex min-w-0 flex-col gap-2 p-5 ${cardCls}`}>
      <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-bold text-theme-800 dark:text-theme-100">
          {t(`${NS}.thisMonth`)}{" "}
          <span className={`text-xs font-medium ${MUTED}`}>
            {cur.month} · {done}
            {cur.hasLiveDay ? `＋${t(`${NS}.todayLabel`)}` : ""}
            {coverage ? ` · ${t(`${NS}.shopCoverage`, coverage)}` : ""}
          </span>
        </span>
        {m ? (
          <span className={`text-xs ${MUTED}`}>
            {t(`${NS}.prevPaceDelta`)} <Delta value={m.paceDeltaPct} className="ml-1 text-base font-extrabold" />
          </span>
        ) : null}
      </span>
      {m ? (
        <>
          <span className="text-[32px] font-extrabold leading-tight tabular-nums text-theme-900 dark:text-theme-50">
            {shortText(metric, m.current, t)}
          </span>
          <span className="text-sm tabular-nums text-theme-700 dark:text-theme-200">
            {t(`${NS}.dailyAvgVsPrev`, { pace: shortText(metric, m.pace, t), prev: shortText(metric, m.prevPace, t) })}
          </span>
          {m.vsPrevPct !== null ? (
            <>
              <span className="relative mt-1 block h-2 rounded-full bg-theme-400/40 dark:bg-white/10">
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
        </>
      ) : (
        <>
          {monthly.platforms.map(({ platform, metrics }) => {
            const pm = metrics[metric];
            return (
              <span key={platform} className="flex flex-col gap-0.5">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="flex items-baseline gap-3">
                    <span className="w-16 shrink-0 text-sm font-bold text-theme-800 dark:text-theme-100">
                      {platformLabel(platform, t)}
                    </span>
                    <span className="text-[26px] font-extrabold leading-tight tabular-nums text-theme-900 dark:text-theme-50">
                      {shortText(metric, pm.current, t)}
                    </span>
                  </span>
                  <span className={`text-xs ${MUTED}`}>
                    {t(`${NS}.prevPaceDelta`)} <Delta value={pm.paceDeltaPct} className="ml-1 text-sm font-extrabold" />
                  </span>
                </span>
                <span className="pl-[76px] text-xs tabular-nums text-theme-700 dark:text-theme-200">
                  {t(`${NS}.dailyAvgVsPrev`, {
                    pace: shortText(metric, pm.pace, t),
                    prev: shortText(metric, pm.prevPace, t),
                  })}
                </span>
              </span>
            );
          })}
          <span className={`text-xs ${MUTED}`}>{t(`${NS}.salesNotSummed`)}</span>
        </>
      )}
    </section>
  );
}

// What the 7-day figures cannot vouch for: a history that stopped updating, or
// shops still on an older window than the rest.
export function historyNotes(week, t) {
  if (!week) return [];
  const notes = [];
  if (week.behind) notes.push(t(`${NS}.historyStopped`, { md: week.endMd }));
  if (week.lagging.length) {
    notes.push(t(`${NS}.historyLagging`, { names: week.lagging.join("・"), md: week.laggingEndMd }));
  }
  return notes;
}

export function visitDayLabel(dateStr) {
  return dateStr ? `${mdLabel(dateStr)}（${weekdayJp(dateStr)}）` : "";
}

// The server marks the visit source stale when its daily read failed and the
// figures are an older day's — then they are not 確定値 for yesterday.
export function visitsStale(performance) {
  return performance?.sources?.traffic?.stale === true;
}

// `scope` names the platform the visits belong to once the board shows several
export function VisitCard({ performance, scope = "", cardCls = "", t }) {
  if (!performance || performance.visit === null) return null;
  // fewer than 3 same-weekday samples means there is no median to compare with
  const delta = performance.sampleCount >= 3 ? performance.delta : null;
  const stale = visitsStale(performance);
  return (
    <section className={`flex min-w-0 flex-col gap-2 p-5 ${cardCls}`}>
      <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-bold text-theme-800 dark:text-theme-100">
          {scope ? `${scope} ` : ""}
          {t(`${NS}.visitsTitle`)}{" "}
          <span className={`text-xs font-medium ${MUTED}`}>
            {visitDayLabel(performance.dataDateJST)} ·{" "}
            {stale ? <span className={WARN}>{t(`${NS}.visitsStale`)}</span> : t(`${NS}.confirmed`)}
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

// Ten figures side by side only read as four groups when the groups show:
// each one opens with a rule, and every other group sits on a faint band.
const COL_GROUP = [null, "today", "today", "today", "week", "week", "month", "month", "visits", "visits"];
const GROUP_START = { 1: "today", 4: "week", 6: "month", 8: "visits" };
const BANDED = new Set(["week", "visits"]);
// shop, 今日 (takes the rest), share, vs 7-day, avg/day, CVR, to date, vs last month, visits, vs median
const COL_WIDTHS = [176, null, 76, 140, 112, 84, 120, 100, 104, 100];
const BAND = "bg-theme-200/40 dark:bg-white/[0.035]";
const GROUP_BAR = { today: "#F0857A", week: "#7FB2E8", month: "#E8B26A", visits: "#7DDBB0" };

function colProps(i) {
  const group = COL_GROUP[i];
  const start = GROUP_START[i];
  return {
    "data-group-start": start,
    className: `${start ? "border-l border-theme-300/60 pl-4 dark:border-white/10" : ""} ${BANDED.has(group) ? BAND : ""}`,
  };
}

// the figure only; its unit lives in the column header
function bareText(metric, value, t) {
  if (value === null || value === undefined) return DASH;
  return metric === "sales" ? man(value) : fmt(t, Math.round(value));
}

function unitOf(metric, t) {
  return (metric === "sales" ? t(`${NS}.manYen`) : t(`${NS}.${UNIT_KEY[metric]}`)).trim();
}

function withUnit(label, unit) {
  return unit ? `${label}（${unit}）` : label;
}

// a change the reader should notice gets a chip; anything inside ±20% steps back
function DeltaCell({ value }) {
  const tone = deltaTone(value);
  const look = {
    down: "rounded-md bg-rose-500/15 px-1.5 py-0.5 font-bold text-rose-700 dark:bg-rose-400/15 dark:text-rose-300",
    up: "rounded-md bg-emerald-500/15 px-1.5 py-0.5 font-bold text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
    flat: "text-theme-600 dark:text-theme-400",
    unknown: "text-theme-500 dark:text-theme-400",
  };
  return (
    <span data-tone={tone} className={`tabular-nums ${look[tone]}`}>
      {signedPct(value)}
    </span>
  );
}

// per-shop logo with a first-char fallback when the URL is empty or fails to load.
// Rakuten logos vary (some white-bg) → bg-white + object-contain keeps them clean.
export function ShopLogo({ name, url, size = 18 }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        aria-hidden="true"
        loading="lazy"
        onError={() => setFailed(true)}
        className="shrink-0 rounded-[5px] bg-white object-contain"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-[5px] bg-[rgba(198,54,43,.14)] font-bold text-[#C6362B] dark:text-[#F0857A]"
      style={{ width: size, height: size, fontSize: size * 0.58 }}
    >
      {String(name || "?")
        .trim()
        .charAt(0) || "?"}
    </span>
  );
}

// logo, then the shop's colour as a thin bar, then the name — the colour ties
// the row to the shop's bars elsewhere on the page
// names a shop's platform beside it in a list that mixes platforms
export function PlatformTag({ platform, t }) {
  return (
    <span className="shrink-0 rounded border border-amber-500/40 bg-amber-500/10 px-1 py-px text-[10px] font-bold leading-none text-amber-700 dark:text-amber-300">
      {platformLabel(platform, t)}
    </span>
  );
}

// `platform` is named beside a shop that is not 楽天's, so a peer list reads clearly
export function ShopName({ name, color, logoUrl, platform = "rakuten", t }) {
  return (
    <span className="flex items-center gap-2 font-bold text-theme-900 dark:text-theme-50">
      <ShopLogo name={name} url={logoUrl} />
      <span aria-hidden="true" className="block h-3 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: color }} />
      {name}
      {platform !== "rakuten" && t ? <PlatformTag platform={platform} t={t} /> : null}
    </span>
  );
}

function TodayCell({ row, metric, maxToday, color, t }) {
  const { className, ...props } = colProps(1);
  if (!row.today) {
    return (
      <td {...props} className={`${className} px-2 py-2.5 text-sm text-theme-500 dark:text-theme-400`}>
        {DASH}
      </td>
    );
  }
  // the company line has no yen of its own: leave the slot out, not a dash
  const others = METRICS.filter((m) => m !== metric && row.today[m] !== null && row.today[m] !== undefined)
    .map((m) => valueText(m, row.today[m], t))
    .join(" · ");
  return (
    <td {...props} className={`${className} px-2 py-2.5`}>
      {/* a narrow column stacks the bar under the figures; a wide one runs it
          beside them, so the bar fills the gap up to シェア. The figures keep a
          fixed width there, so every row's bar starts at the same x. */}
      <div className="@container/today">
        <div className="flex flex-col gap-1.5 @min-[460px]/today:flex-row @min-[460px]/today:items-center @min-[460px]/today:gap-4">
          <span className="flex items-baseline gap-2.5 @min-[460px]/today:w-[230px] @min-[460px]/today:shrink-0">
            <span className={`text-base font-extrabold tabular-nums ${ACCENT_TEXT}`}>
              {valueText(metric, row.today[metric], t)}
            </span>
            <span className={`whitespace-nowrap text-xs tabular-nums ${MUTED}`}>{others}</span>
          </span>
          {color ? (
            <span className="block h-1.5 w-full overflow-hidden rounded-full bg-theme-400/40 @min-[460px]/today:flex-1 dark:bg-white/10">
              <span
                className="block h-full rounded-full"
                style={{ width: `${Math.max(2, (row.today[metric] / maxToday) * 100)}%`, backgroundColor: color }}
              />
            </span>
          ) : null}
        </div>
      </div>
    </td>
  );
}

function AvgRatioCell({ row, metric }) {
  const avg = row.avg?.[metric];
  const value = row.today?.[metric];
  const comparable = historyComparable(metric, row.platform ?? "rakuten");
  const pct = comparable && avg > 0 && value !== null && value !== undefined ? (value / avg) * 100 : null;
  return (
    <td {...colProps(3)} className={`${colProps(3).className} px-2 py-2.5`}>
      {pct === null ? (
        <span className="block text-right text-sm text-theme-500 dark:text-theme-400">{DASH}</span>
      ) : (
        <span className="flex items-center gap-2">
          <span className="block h-1.5 flex-1 overflow-hidden rounded-full bg-theme-400/40 dark:bg-white/10">
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

// one body cell of column `i`, carrying its group's rule and band
function Cell({ i, className = "", children }) {
  const { className: groupCls, ...props } = colProps(i);
  return (
    <td {...props} className={`${TD} ${groupCls} ${className}`}>
      {children}
    </td>
  );
}

// `shareBase` is what the row's share is of; `label` names a footer row
function ShopRow({ row, metric, shareBase, maxToday, color, logoUrl, t, label = null }) {
  const isTotal = label !== null;
  const value = row.today?.[metric];
  const share =
    shareBase > 0 && value !== null && value !== undefined ? `${((value / shareBase) * 100).toFixed(1)}%` : DASH;
  return (
    <tr
      className={
        isTotal
          ? "border-t-2 border-theme-300/70 font-bold dark:border-white/20"
          : "border-b border-theme-300/30 transition-colors hover:bg-theme-200/40 dark:border-white/[0.07] dark:hover:bg-white/[0.04]"
      }
    >
      <th scope="row" className="px-2 py-2.5 text-left text-sm">
        {isTotal ? (
          <span className="font-bold text-theme-900 dark:text-theme-50">{label}</span>
        ) : (
          <ShopName name={row.name} color={color} logoUrl={logoUrl} platform={row.platform} t={t} />
        )}
      </th>
      <TodayCell row={row} metric={metric} maxToday={maxToday} color={isTotal ? null : color} t={t} />
      <Cell i={2} className={MUTED}>
        {share}
      </Cell>
      <AvgRatioCell row={row} metric={metric} />
      <Cell i={4} className="text-theme-800 dark:text-theme-100">
        {bareText(metric, row.avg?.[metric], t)}
      </Cell>
      <Cell i={5} className={MUTED}>
        {row.cvr === null ? DASH : `${row.cvr.toFixed(2)}%`}
      </Cell>
      <Cell i={6} className="font-bold text-theme-900 dark:text-theme-50">
        {bareText(metric, row.month?.[metric], t)}
      </Cell>
      <Cell i={7}>
        <DeltaCell value={row.monthDelta?.[metric] ?? null} />
      </Cell>
      <Cell i={8} className="text-theme-800 dark:text-theme-100">
        {row.visits === null ? DASH : fmt(t, row.visits)}
      </Cell>
      <Cell i={9} className="pr-3">
        <DeltaCell value={row.visitDelta} />
      </Cell>
    </tr>
  );
}

function IdleRow({ row, color, logoUrl, t }) {
  return (
    <tr className="border-b border-theme-300/30 text-theme-500 dark:border-white/[0.07] dark:text-theme-400">
      <th scope="row" className="px-2 py-2 text-left text-sm">
        <ShopName name={row.name} color={color} logoUrl={logoUrl} platform={row.platform} t={t} />
      </th>
      <td colSpan={7} {...colProps(1)} className={`${colProps(1).className} px-2 py-2 text-xs`}>
        {t(`${NS}.idleNote`)}
      </td>
      <Cell i={8}>{row.visits === null ? DASH : fmt(t, row.visits)}</Cell>
      <Cell i={9} className="pr-3">
        <DeltaCell value={row.visitDelta} />
      </Cell>
    </tr>
  );
}

// `periods` labels the column groups: { today, week, month, visits };
// `notes` are warnings shown under the title, e.g. history that stopped updating
export function ShopTable({
  table,
  metric,
  shopColors,
  logoByName = new Map(),
  periods = {},
  notes = [],
  cardCls = "",
  t,
}) {
  const [showIdle, setShowIdle] = useState(false);
  const colorOf = (name) => shopColors[name] ?? FALLBACK_SHOP_COLOR;
  const maxToday = Math.max(1, ...table.rows.map((r) => r.today?.[metric] ?? 0));
  // one footer row per platform, then the company's once there are several
  const totals = table.totals ?? [table.total];
  const multi = totals.length > 1;
  const companyToday = table.total.today?.[metric] ?? null;
  // a share of the company for counts; 売上 only shares within its own platform
  const shareBaseOf = (platform) =>
    multi && metric === "sales" ? (totals.find((r) => r.platform === platform)?.today?.sales ?? null) : companyToday;
  const footerLabel = (row) => {
    if (!multi) return t(`${NS}.total`);
    return row.platform
      ? t(`${NS}.platformTotal`, { platform: platformLabel(row.platform, t) })
      : t(`${NS}.companyTotal`);
  };
  const unit = unitOf(metric, t);
  // the 7-day yen are R-Karte's, after coupons: the header says so on a line of its own
  const weekAvgLabel = historyComparable(metric) ? (
    withUnit(t(`${NS}.perDayAvg`), unit)
  ) : (
    <>
      {withUnit(t(`${NS}.perDayAvg`), unit)}
      <span className="block text-[10px] font-medium">{t(`${NS}.afterCouponTag`)}</span>
    </>
  );
  // a group's header opens its band: its name and period, underlined in the group's colour
  const group = (key, firstCol, span) => {
    const { className, ...props } = colProps(firstCol);
    return (
      <th
        colSpan={span}
        scope="colgroup"
        {...props}
        className={`${className} px-2 pb-1 pt-2 text-left text-xs font-bold`}
      >
        <span className="text-theme-800 dark:text-theme-100">{t(`${NS}.${key}`)}</span>
        {periods[key] ? <span className={`ml-1.5 font-medium ${MUTED}`}>{periods[key]}</span> : null}
        <span
          aria-hidden="true"
          data-group-line=""
          className="mt-1.5 block h-[3px] rounded-full"
          style={{ backgroundColor: GROUP_BAR[COL_GROUP[firstCol]] }}
        />
      </th>
    );
  };
  const head = (i, label, align = "text-right") => {
    const { className, ...props } = colProps(i);
    return (
      <th scope="col" {...props} className={`${TH} ${className} ${align}`}>
        {label}
      </th>
    );
  };
  return (
    <section className={`flex min-w-0 flex-col gap-3 p-5 ${cardCls}`}>
      <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-base font-extrabold text-theme-900 dark:text-theme-50">{t(`${NS}.shopTable`)}</span>
        <span className={`text-xs ${MUTED}`}>{t(`${NS}.shopTableNote`)}</span>
      </span>
      {notes.map((note) => (
        <span key={note} role="note" className={`text-xs font-semibold ${WARN}`}>
          {note}
        </span>
      ))}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] table-fixed border-collapse">
          {/* figure columns keep their width; any spare width goes to 今日, so a
              group's figures never drift apart on a wide screen */}
          <colgroup>
            {COL_WIDTHS.map((width, i) => (
              <col key={COL_GROUP[i] ? `${COL_GROUP[i]}-${i}` : "shop"} style={width ? { width } : undefined} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th aria-hidden="true" />
              {group("colToday", 1, 3)}
              {group("colWeek", 4, 2)}
              {group("colMonth", 6, 2)}
              {group("colVisits", 8, 2)}
            </tr>
            <tr className="border-b border-theme-300/50 dark:border-white/10">
              <th scope="col" className={`${TH} text-left`}>
                {t(`${NS}.colShop`)}
              </th>
              {head(1, t(`${NS}.${METRIC_LABEL[metric]}`), "text-left")}
              {head(2, t(`${NS}.share`), "text-right")}
              {head(3, t(`${NS}.vsAvg`), "text-left")}
              {head(4, weekAvgLabel, "text-right")}
              {head(5, "CVR", "text-right")}
              {head(6, withUnit(t(`${NS}.cumulative`), unit), "text-right")}
              {head(7, t(`${NS}.vsPrev`), "text-right")}
              {head(8, withUnit(t(`${NS}.visits`), t(`${NS}.peopleUnit`).trim()), "text-right")}
              {head(9, t(`${NS}.vsMedian`), "text-right pr-3")}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <ShopRow
                key={row.key ?? row.name}
                row={row}
                metric={metric}
                shareBase={shareBaseOf(row.platform)}
                maxToday={maxToday}
                color={colorOf(row.name)}
                logoUrl={logoByName.get(row.name)}
                t={t}
              />
            ))}
            {showIdle
              ? table.idle.map((row) => (
                  <IdleRow
                    key={row.key ?? row.name}
                    row={row}
                    color={colorOf(row.name)}
                    logoUrl={logoByName.get(row.name)}
                    t={t}
                  />
                ))
              : null}
          </tbody>
          <tfoot>
            {totals.map((row) => (
              <ShopRow
                key={row.key ?? "total"}
                row={row}
                metric={metric}
                shareBase={row.platform ? shareBaseOf(row.platform) : companyToday}
                maxToday={maxToday}
                t={t}
                label={footerLabel(row)}
              />
            ))}
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
