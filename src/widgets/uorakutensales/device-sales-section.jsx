/*
 * 機種別販売 — the device-model board of the uorakutensales widget
 * (Claude Design canvas "A+ 決定案" and "A+ 失速ビュー").
 *
 * Wide (the board at 64rem or more): the 3カテゴリ合計 strip, then ケース /
 * フィルム / ケース+フィルム side by side. Narrower, the strip's legend turns
 * into the category tabs and one category shows at a time. The board follows
 * its own width (@container/devices), not the window's.
 *
 * Three ways to read it: 売れ筋 (most first), 少ない順 (the same ranking from
 * the bottom) and 失速 (this month's daily pace against last month's — this
 * month only).
 */
import { useState } from "react";

import {
  categoryMix,
  DEFAULT_DEVICE_METRIC,
  DEVICE_METRICS,
  DEVICE_STEPS,
  DEVICE_TYPES,
  metricReady,
  rankDeviceBoard,
} from "./device-sales-model.mjs";
import {
  changeText,
  DeviceRow,
  ListHeader,
  metricText,
  MUTED,
  NS,
  paceText,
  press,
  SlowingRow,
} from "./device-sales-row";
import { buildSlowing, SLOWING_MIN_UNITS, slowingTotals, slowingWindow } from "./device-slowing-model.mjs";
import { mdLabel, timeFromJST, weekdayJp } from "./sales-model.mjs";

const ALL = "__all__";
const VIEWS = ["best", "least", "slowing"];
const VIEW_LABEL = { best: "viewBest", least: "viewLeast", slowing: "viewSlowing" };
const PERIOD_LABEL = { today: "periodToday", thisMonth: "thisMonth", lastMonth: "lastMonth" };
const METRIC_LABEL = { units: "sortUnits", sales: "sortSales", orders: "sortOrders" };
const TYPE_LABEL = { case: "typeCase", film: "typeFilm", case_film_set: "typeSet" };
// a narrow tab is a third of a phone wide
const TYPE_SHORT = { case: "typeCase", film: "typeFilm", case_film_set: "typeSetShort" };
// blue / orange / indigo differ in lightness as well as hue
const TYPE_COLOR = { case: "#60A5FA", film: "#FDBA74", case_film_set: "#A5B4FC" };
const SLOWING_REASON = {
  monthStart: "slowingMonthStart",
  lastMonthPending: "slowingLastMonthPending",
  updating: "slowingUpdating",
};

const GROUP =
  "flex max-w-full flex-wrap gap-0.5 rounded-lg border border-theme-300/60 bg-theme-100/50 p-0.5 dark:border-theme-600/60 dark:bg-theme-900/30";
// phone-sized (about 40px) until the board is 36rem wide
const SEGMENT =
  "whitespace-nowrap rounded-md px-3 py-3 text-[12px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 @xl/devices:py-1.5 @xl/devices:text-[11.5px]";
const ON = "bg-theme-700 text-white dark:bg-theme-100 dark:text-theme-900";
const OFF = "text-theme-600 hover:bg-theme-200/60 dark:text-theme-300 dark:hover:bg-theme-700/60";
const PANEL = "rounded-xl border border-theme-300/30 bg-theme-100/40 dark:border-white/[0.06] dark:bg-theme-900/25";
const TAB_ON = "border-theme-700 bg-theme-700 text-white dark:border-theme-100 dark:bg-theme-100 dark:text-theme-900";
const TAB_OFF = "border-theme-300/60 text-theme-800 dark:border-theme-600/60 dark:text-theme-100";
const MORE =
  "rounded-lg border border-theme-300/60 py-3 text-[12px] font-semibold text-theme-600 transition-colors hover:bg-theme-200/50 @xl/devices:py-1.5 @xl/devices:text-[11px] dark:border-theme-600/60 dark:text-theme-300 dark:hover:bg-theme-700/50";
const EMPTY = "py-4 text-center text-[11px] text-theme-500 dark:text-theme-400";
const LOSS = "font-extrabold text-rose-600 dark:text-rose-300";

function Dot({ color }) {
  return <span aria-hidden="true" className="block h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: color }} />;
}

function Segmented({ label, options, active, onPick, disabled = () => false, titleOf = () => undefined }) {
  return (
    <div role="group" aria-label={label} className={GROUP}>
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          aria-pressed={active === key}
          disabled={disabled(key)}
          title={titleOf(key)}
          onClick={press(() => onPick(key))}
          className={`${SEGMENT} ${active === key ? ON : OFF}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

// "2026-10-07" → "10/7（水）"; months stay "2026-10"
function periodText(key, label) {
  return key === "today" && label ? `${mdLabel(label)}（${weekdayJp(label)}）` : label;
}

function boardMeta(board, t) {
  return [
    t(`${NS}.modelCount`, { count: board.modelCount }),
    board.singleModelPercent != null ? t(`${NS}.singleModelShare`, { pct: board.singleModelPercent.toFixed(1) }) : null,
    board.unresolvedUnits > 0 ? t(`${NS}.unresolvedUnits`, { count: board.unresolvedUnits }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

// pace: the 失速 line under the total; notes: per-category text that replaces
// the legend's shares (the 失速 view shows each category's change there)
function SummaryStrip({ totals, types, metric, tab, onTab, t, pace = null, notes = null }) {
  const mix = categoryMix(types, metric);
  const others = DEVICE_METRICS.filter((m) => m !== metric);
  // a share means something only when the bar is cut by the metric on screen
  const shareOf = (part) => (mix.metric === metric ? part.share : null);
  return (
    <div className={`flex flex-col gap-3 p-3.5 @5xl/devices:flex-row @5xl/devices:items-center @5xl/devices:gap-8 ${PANEL}`}>
      <div className="flex min-w-0 flex-col gap-1.5 @5xl/devices:min-w-[240px]">
        <span className={`text-[11px] font-bold ${MUTED}`}>{t(`${NS}.deviceTotal`)}</span>
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span
            data-testid="device-total"
            className="text-[28px] font-extrabold leading-none tabular-nums text-theme-900 @5xl/devices:text-[30px] dark:text-theme-50"
          >
            {metricText(metric, totals?.[metric], t)}
          </span>
          <span className="text-[12.5px] font-bold tabular-nums text-theme-700 dark:text-theme-200">
            {others.map((m) => metricText(m, totals?.[m], t)).join(" · ")}
          </span>
        </span>
        {pace ? (
          <span className="text-[12px] font-semibold tabular-nums text-theme-700 dark:text-theme-200">
            {t(`${NS}.slowingPace`, { pace: paceText(pace.metric, pace.pace, t), prev: paceText(pace.metric, pace.prevPace, t) })}
            {" · "}
            <span className={LOSS}>{changeText(pace.changePct)}</span>
          </span>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span aria-hidden="true" className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-theme-300/30 dark:bg-white/10">
          {mix.parts.map((part) => (
            <span
              key={part.key}
              className="block h-full"
              style={{ flex: `${part.value ?? 0} 1 0px`, backgroundColor: TYPE_COLOR[part.key] }}
            />
          ))}
        </span>
        {/* wide: a legend; narrow: the same three are the category tabs */}
        <span className="hidden flex-wrap gap-x-5 gap-y-1.5 text-[11.5px] @5xl/devices:flex">
          {mix.parts.map((part) => (
            <span key={part.key} className="flex items-center gap-1.5">
              <Dot color={TYPE_COLOR[part.key]} />
              <span className="font-semibold text-theme-700 dark:text-theme-200">{t(`${NS}.${TYPE_LABEL[part.key]}`)}</span>
              {notes ? (
                <span className={`tabular-nums ${LOSS}`}>{notes[part.key]}</span>
              ) : (
                <span className="font-extrabold tabular-nums text-theme-900 dark:text-theme-50">
                  {shareOf(part) != null ? `${shareOf(part).toFixed(1)}%` : metricText(metric, types[part.key][metric], t)}
                </span>
              )}
            </span>
          ))}
        </span>
        <div role="tablist" aria-label={t(`${NS}.deviceTotal`)} className="grid grid-cols-3 gap-2 @5xl/devices:hidden">
          {mix.parts.map((part) => {
            const on = tab === part.key;
            return (
              <button
                key={part.key}
                type="button"
                role="tab"
                aria-selected={on}
                aria-label={t(`${NS}.${TYPE_LABEL[part.key]}`)}
                onClick={press(() => onTab(part.key))}
                className={`flex min-h-12 min-w-0 flex-col items-start gap-0.5 rounded-lg border px-2 py-2 text-left @xl/devices:px-2.5 ${on ? TAB_ON : TAB_OFF}`}
              >
                <span className="flex items-center gap-1.5 whitespace-nowrap text-[12px] font-extrabold @xl/devices:text-[12.5px]">
                  <Dot color={TYPE_COLOR[part.key]} />
                  {t(`${NS}.${TYPE_SHORT[part.key]}`)}
                </span>
                <span className="text-[11px] font-semibold tabular-nums opacity-80">
                  {notes
                    ? notes[part.key]
                    : `${metricText(metric, types[part.key][metric], t)}${shareOf(part) != null ? ` · ${Math.round(shareOf(part))}%` : ""}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MoreLess({ step, nextStep, nextCount, onStep, t }) {
  if (!(nextCount > 0 || step > 0)) return null;
  return (
    <div className="flex gap-2">
      {nextCount > 0 ? (
        <button type="button" onClick={press(() => onStep(nextStep))} className={`flex-1 ${MORE}`}>
          {t(`${NS}.showMore`, { count: nextCount })}
        </button>
      ) : null}
      {step > 0 ? (
        <button type="button" onClick={press(() => onStep(0))} className={`px-3 ${MORE}`}>
          {t(`${NS}.showLess`)}
        </button>
      ) : null}
    </div>
  );
}

// the rows a reveal step shows, and what the next step would add
function reveal(rows, step) {
  const shown = rows.slice(0, DEVICE_STEPS[step]);
  const nextStep = step + 1 < DEVICE_STEPS.length ? step + 1 : null;
  const nextCount = nextStep === null ? 0 : Math.min(DEVICE_STEPS[nextStep], rows.length) - shown.length;
  return { shown, nextStep, nextCount };
}

function ColumnFrame({ type, visible, children }) {
  return (
    <div
      data-testid={`device-column-${type}`}
      className={`${visible ? "flex" : "hidden"} min-w-0 flex-col gap-2 p-3 @5xl/devices:flex ${PANEL}`}
    >
      {children}
    </div>
  );
}

function ColumnName({ type, t }) {
  return (
    <span className="hidden items-center gap-2 @5xl/devices:flex">
      <Dot color={TYPE_COLOR[type]} />
      <span className="text-[13px] font-extrabold text-theme-900 dark:text-theme-50">{t(`${NS}.${TYPE_LABEL[type]}`)}</span>
    </span>
  );
}

function CategoryColumn({ type, board, metric, order, visible, step, onStep, expanded, onExpand, t }) {
  const { shown, nextStep, nextCount } = reveal(rankDeviceBoard(board, metric, order), step);
  // one key per column: a combination can sell as a case and as a film
  const keyOf = (row) => `${type}:${row.fullModel}`;
  return (
    <ColumnFrame type={type} visible={visible}>
      <div className="flex min-w-0 items-center gap-2 px-0.5">
        <ColumnName type={type} t={t} />
        <span className={`min-w-0 truncate text-[10.5px] ${MUTED}`}>{boardMeta(board, t)}</span>
        <span className="ml-auto hidden text-[15px] font-extrabold tabular-nums text-theme-900 @5xl/devices:inline dark:text-theme-50">
          {metricText(metric, board[metric], t)}
        </span>
      </div>
      {shown.length === 0 ? (
        <span className={EMPTY}>{t(`${NS}.noData`)}</span>
      ) : (
        <div className="@container/list flex min-w-0 flex-col">
          <ListHeader metric={metric} order={order} t={t} />
          <ol className="flex flex-col gap-0.5">
            {shown.map((row) => (
              <DeviceRow
                key={row.fullModel}
                row={row}
                metric={metric}
                expanded={expanded === keyOf(row)}
                onToggle={() => onExpand(expanded === keyOf(row) ? null : keyOf(row))}
                t={t}
              />
            ))}
          </ol>
        </div>
      )}
      <MoreLess step={step} nextStep={nextStep} nextCount={nextCount} onStep={onStep} t={t} />
    </ColumnFrame>
  );
}

function SlowingColumn({ type, slowing, visible, step, onStep, expanded, onExpand, t }) {
  const { shown, nextStep, nextCount } = reveal(slowing?.rows ?? [], step);
  const keyOf = (row) => `${type}:${row.fullModel}`;
  return (
    <ColumnFrame type={type} visible={visible}>
      {slowing ? (
        <div className="flex min-w-0 flex-col gap-0.5 px-0.5">
          <div className="flex items-center gap-2">
            <ColumnName type={type} t={t} />
            <span className="ml-auto text-[14px] font-extrabold tabular-nums text-theme-900 dark:text-theme-50">
              {paceText(slowing.metric, slowing.pace, t)}
            </span>
          </div>
          <div className={`flex flex-wrap items-center gap-x-2 text-[10.5px] ${MUTED}`}>
            <span className="min-w-0">{t(`${NS}.slowingEligible`, { min: SLOWING_MIN_UNITS, count: slowing.eligible })}</span>
            <span className="ml-auto tabular-nums">
              {t(`${NS}.lastMonth`)} {paceText(slowing.metric, slowing.prevPace, t)} ·{" "}
              <span className={LOSS}>{changeText(slowing.changePct)}</span>
            </span>
          </div>
        </div>
      ) : null}
      {shown.length === 0 ? (
        <span className={EMPTY}>{t(`${NS}.noData`)}</span>
      ) : (
        <ol className="@container/list flex flex-col gap-0.5">
          {shown.map((row) => (
            <SlowingRow
              key={row.fullModel}
              row={row}
              metric={slowing.metric}
              expanded={expanded === keyOf(row)}
              onToggle={() => onExpand(expanded === keyOf(row) ? null : keyOf(row))}
              t={t}
            />
          ))}
        </ol>
      )}
      <MoreLess step={step} nextStep={nextStep} nextCount={nextCount} onStep={onStep} t={t} />
    </ColumnFrame>
  );
}

export default function DeviceSalesSection({ devices, cardCls, t }) {
  const [period, setPeriod] = useState(devices.available[0]);
  const [view, setView] = useState(VIEWS[0]);
  const [metric, setMetric] = useState(DEFAULT_DEVICE_METRIC);
  const [shop, setShop] = useState(ALL);
  // the one category a narrow board shows
  const [tab, setTab] = useState(DEVICE_TYPES[0]);
  // reveal step per category, so opening one column leaves the others short
  const [steps, setSteps] = useState({});
  // the combination row whose model list is open
  const [expanded, setExpanded] = useState(null);

  const slowingOn = view === "slowing";
  // 失速 lives on this month; a period can also vanish across refreshes
  const wanted = slowingOn ? "thisMonth" : period;
  const activeKey = devices.periods[wanted] ? wanted : devices.available[0];
  const current = devices.periods[activeKey];
  // a chosen shop can lack a board in another period or after a refresh → 全店
  const shopEntry = shop === ALL ? null : current.shops.find((s) => s.name === shop);
  const selectedShop = shopEntry ? shop : ALL;
  const types = shopEntry ? shopEntry.types : current.types;
  const totals = shopEntry ? shopEntry.totals : current.totals;
  // the categories sit side by side, so a metric counts only once all have it
  const metricOk = (key) => Boolean(types) && DEVICE_TYPES.every((type) => metricReady(types[type], key));
  const activeMetric = metricOk(metric) ? metric : "units";
  const moneyPending = Boolean(types) && (!metricOk("sales") || !metricOk("orders"));
  const order = view === "least" ? "asc" : "desc";

  const scopeShop = shopEntry ? shop : null;
  const span = slowingOn ? slowingWindow(devices) : null;
  // the month board fell away under a running 失速 view: say so, never guess
  const slowingReason = slowingOn ? (activeKey === "thisMonth" ? span.reason : "updating") : null;
  const slowing =
    slowingOn && !slowingReason
      ? Object.fromEntries(DEVICE_TYPES.map((type) => [type, buildSlowing(devices, { shop: scopeShop, type, metric: activeMetric })]))
      : null;
  const pace = slowing ? slowingTotals(devices, { shop: scopeShop, metric: activeMetric }) : null;
  const notes = slowing
    ? Object.fromEntries(DEVICE_TYPES.map((type) => [type, changeText(slowing[type]?.changePct ?? null)]))
    : null;

  // whatever changes what the board shows starts every column short again
  const choose = (setter) => (value) => {
    setter(value);
    setSteps({});
    setExpanded(null);
  };
  const lockedPeriod = (key) => slowingOn && key !== "thisMonth";
  const stepOf = (type) => steps[type] ?? 0;
  const setStepOf = (type) => (step) => setSteps((prev) => ({ ...prev, [type]: step }));

  return (
    <section className={`@container/devices flex flex-col gap-3.5 p-4 ${cardCls}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-extrabold text-theme-800 dark:text-theme-100">{t(`${NS}.deviceSales`)}</span>
            {current.shopCount > 0 && current.coveredShopCount < current.shopCount ? (
              <span
                title={t(`${NS}.missingShops`, { names: current.missingShops.join(", ") })}
                className="rounded-full border border-theme-300/60 px-2 py-px text-[10px] font-bold text-theme-600 dark:border-theme-600/60 dark:text-theme-300"
              >
                {t(`${NS}.shopCoverage`, { covered: current.coveredShopCount, total: current.shopCount })}
              </span>
            ) : null}
            {current.staleShops.length > 0 ? (
              <span
                title={current.staleShops.join(", ")}
                className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-px text-[10px] font-bold text-amber-700 dark:text-amber-300"
              >
                {t(`${NS}.staleShops`, { count: current.staleShops.length })}
              </span>
            ) : null}
          </div>
          <span className={`text-[11.5px] tabular-nums ${MUTED}`}>
            {periodText(activeKey, current.label)}
            {/* last month is closed; its source time is only the nightly re-check */}
            {activeKey !== "lastMonth" && current.updatedAt ? ` · ${t(`${NS}.asOf`, { time: timeFromJST(current.updatedAt) })}` : ""}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 @3xl/devices:ml-auto">
          <Segmented
            label={t(`${NS}.viewGroup`)}
            options={VIEWS.map((key) => [key, t(`${NS}.${VIEW_LABEL[key]}`)])}
            active={view}
            onPick={choose(setView)}
            disabled={(key) => key === "slowing" && !devices.periods.thisMonth}
          />
          <Segmented
            label={t(`${NS}.periodGroup`)}
            options={devices.available.map((key) => [key, t(`${NS}.${PERIOD_LABEL[key]}`)])}
            active={activeKey}
            onPick={choose(setPeriod)}
            disabled={lockedPeriod}
            titleOf={(key) => (lockedPeriod(key) ? t(`${NS}.slowingOnlyThisMonth`) : undefined)}
          />
          <Segmented
            label={t(`${NS}.metricGroup`)}
            options={DEVICE_METRICS.map((key) => [key, t(`${NS}.${METRIC_LABEL[key]}`)])}
            active={activeMetric}
            onPick={choose(setMetric)}
            disabled={(key) => !metricOk(key)}
          />
          {current.ready ? (
            <label className={`flex items-center gap-1.5 text-[11.5px] font-semibold ${MUTED}`}>
              {t(`${NS}.shopLabel`)}
              <select
                value={selectedShop}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => choose(setShop)(e.target.value)}
                className="rounded-lg border border-theme-300/60 bg-theme-50 py-2.5 pl-2.5 pr-8 text-[12px] font-bold text-theme-900 @xl/devices:py-1.5 @xl/devices:text-[11.5px] dark:border-theme-600/60 dark:bg-theme-800 dark:text-theme-50"
              >
                <option value={ALL}>{t(`${NS}.allShops`)}</option>
                {current.shops.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {moneyPending ? (
            <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
              {t(`${NS}.deviceMetricsPending`)}
            </span>
          ) : null}
        </div>
      </div>

      {slowingReason ? (
        <span className={EMPTY}>{t(`${NS}.${SLOWING_REASON[slowingReason]}`)}</span>
      ) : types ? (
        <>
          <SummaryStrip
            totals={totals}
            types={types}
            metric={activeMetric}
            tab={tab}
            onTab={choose(setTab)}
            t={t}
            pace={pace}
            notes={notes}
          />
          <div className="grid grid-cols-1 gap-3 @5xl/devices:grid-cols-3">
            {DEVICE_TYPES.map((type) =>
              slowing ? (
                <SlowingColumn
                  key={type}
                  type={type}
                  slowing={slowing[type]}
                  visible={tab === type}
                  step={stepOf(type)}
                  onStep={setStepOf(type)}
                  expanded={expanded}
                  onExpand={setExpanded}
                  t={t}
                />
              ) : (
                <CategoryColumn
                  key={type}
                  type={type}
                  board={types[type]}
                  metric={activeMetric}
                  order={order}
                  visible={tab === type}
                  step={stepOf(type)}
                  onStep={setStepOf(type)}
                  expanded={expanded}
                  onExpand={setExpanded}
                  t={t}
                />
              ),
            )}
          </div>
        </>
      ) : (
        <span className={EMPTY}>{t(`${NS}.deviceNotReady`)}</span>
      )}

      {slowing ? <p className={`text-[10.5px] leading-relaxed ${MUTED}`}>{t(`${NS}.slowingNote`, { min: SLOWING_MIN_UNITS })}</p> : null}
      <p className={`text-[10.5px] leading-relaxed ${MUTED}`}>{t(`${NS}.deviceNote`)}</p>
    </section>
  );
}
