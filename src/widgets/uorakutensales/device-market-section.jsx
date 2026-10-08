/*
 * 市場 — the market view of the 機種別販売 board: uo-ec-manager's reference
 * ranking of phone-case models (public Rakuten / Yahoo rankings and searches),
 * each model set against our own case sales for the period, shop and metric
 * chosen above. Under 42rem of list width a model takes two lines.
 */
import { MARKET_GAP_TOP, MARKET_SOURCES, marketRows, OWN_STRONG_TO, OWN_WEAK_FROM } from "./device-market-model.mjs";
import { EMPTY, metricText, MoreLess, MUTED, NS, PANEL, reveal, VALUE_TONE } from "./device-sales-row";
import { mdLabel } from "./sales-model.mjs";

const METRIC_LABEL = { units: "sortUnits", sales: "sortSales", orders: "sortOrders" };
const SOURCE_LABEL = {
  rakutenProducts: "marketRakuten",
  yahooSearch: "marketYahooSearch",
  yahooProducts: "marketYahooProducts",
};
const FLAG = {
  none: { label: "flagNone", tone: "border-rose-400/50 bg-rose-500/10 text-rose-700 dark:text-rose-300" },
  weak: { label: "flagWeak", tone: "border-amber-400/50 bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  strong: {
    label: "flagStrong",
    tone: "border-emerald-400/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
};
const BADGE = "rounded-full border px-2 py-px text-[10px] font-bold";
const WARN_BADGE = `${BADGE} border-amber-400/40 bg-amber-500/10 text-amber-700 dark:text-amber-300`;
// one line from 42rem: # · model · score · 楽天 · Y検索 · Y商品 · our rank · our value · flag
const COLS =
  "grid-cols-[24px_minmax(0,1fr)_auto] @2xl/market:grid-cols-[24px_minmax(0,1.2fr)_minmax(0,1.5fr)_repeat(3,44px)_52px_72px_76px]";

// a score under 10 keeps a decimal, so the tail does not read as a row of zeros
function scoreText(score) {
  return score >= 10 ? score.toFixed(0) : score.toFixed(1);
}

function Flag({ kind, t }) {
  if (!kind) return null;
  return (
    <span
      data-testid="market-flag"
      className={`shrink-0 rounded-md border px-1.5 py-px text-[10px] font-bold ${FLAG[kind].tone}`}
    >
      {t(`${NS}.${FLAG[kind].label}`)}
    </span>
  );
}

function MarketHeader({ reference, t }) {
  const pct = (weight) => (weight == null ? "—" : Math.round(weight * 100));
  return (
    <div className={`flex flex-col gap-1.5 p-3.5 ${PANEL}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[14px] font-extrabold text-theme-900 dark:text-theme-50">{t(`${NS}.marketTitle`)}</span>
        <span className={`${BADGE} border-theme-300/60 text-theme-600 dark:border-theme-600/60 dark:text-theme-300`}>
          {t(`${NS}.marketReference`)}
        </span>
        {reference.partial ? (
          <span className={WARN_BADGE}>
            {t(`${NS}.marketRecorded`, { recorded: reference.recordedDays, expected: reference.expectedDays })}
          </span>
        ) : null}
        {reference.stale ? <span className={WARN_BADGE}>{t(`${NS}.marketStale`)}</span> : null}
      </div>
      <span className={`text-[11.5px] tabular-nums ${MUTED}`}>
        {mdLabel(reference.startDate)}〜{mdLabel(reference.endDate)} ·{" "}
        {t(`${NS}.marketWeights`, {
          rakuten: pct(reference.weights.rakutenProducts),
          yahooSearch: pct(reference.weights.yahooSearch),
          yahooProducts: pct(reference.weights.yahooProducts),
        })}
      </span>
      <span className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] ${MUTED}`}>
        <span className="flex items-center gap-1">
          <Flag kind="none" t={t} />
          {t(`${NS}.flagNoneNote`)}
        </span>
        <span className="flex items-center gap-1">
          <Flag kind="weak" t={t} />
          {t(`${NS}.flagWeakNote`, { top: MARKET_GAP_TOP, from: OWN_WEAK_FROM })}
        </span>
        <span className="flex items-center gap-1">
          <Flag kind="strong" t={t} />
          {t(`${NS}.flagStrongNote`, { to: OWN_STRONG_TO })}
        </span>
      </span>
    </div>
  );
}

function MarketRow({ row, metric, t }) {
  const { own } = row;
  return (
    <li
      data-testid="market-row"
      className={`relative grid items-center gap-x-3 gap-y-0.5 rounded-lg px-2 py-1.5 ${COLS}`}
    >
      <span
        className={`row-span-2 text-center text-[12px] font-extrabold tabular-nums @2xl/market:row-span-1 ${
          row.rank <= 3 ? "text-amber-500 dark:text-amber-300" : MUTED
        }`}
      >
        {row.rank}
      </span>
      <span className="flex min-w-0 items-center gap-1.5">
        <span
          data-testid="market-model"
          className="truncate text-[13px] font-semibold text-theme-900 dark:text-theme-50"
        >
          {row.model}
        </span>
        <span className="@2xl/market:hidden">
          <Flag kind={row.flag} t={t} />
        </span>
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className="relative hidden h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-theme-300/30 @2xl/market:block dark:bg-white/10"
        >
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-[#2E7DF6]"
            style={{ width: `${Math.min(100, Math.max(1, row.score))}%` }}
          />
        </span>
        <span className="w-10 text-right text-[13px] font-extrabold tabular-nums text-theme-900 dark:text-theme-50">
          {scoreText(row.score)}
        </span>
      </span>
      {MARKET_SOURCES.map((key) => (
        <span key={key} className={`hidden text-right text-[11px] tabular-nums @2xl/market:block ${MUTED}`}>
          {row.sources[key] == null ? "—" : row.sources[key].toFixed(0)}
        </span>
      ))}
      <span
        className={`hidden text-right text-[12px] tabular-nums @2xl/market:block ${
          own ? "font-bold text-theme-800 dark:text-theme-100" : MUTED
        }`}
      >
        {own ? `#${own.rank}` : "—"}
      </span>
      <span
        className={`hidden text-right text-[12px] tabular-nums @2xl/market:block ${
          own ? `font-extrabold ${VALUE_TONE}` : MUTED
        }`}
      >
        {own ? metricText(metric, own.value, t) : "—"}
      </span>
      <span className="hidden justify-end @2xl/market:flex">
        <Flag kind={row.flag} t={t} />
      </span>
      {/* narrow: our figures on a line of their own under the name */}
      <span className={`col-start-2 col-end-4 text-[11.5px] tabular-nums @2xl/market:hidden ${MUTED}`}>
        {own ? t(`${NS}.marketOwnRow`, { rank: own.rank, value: metricText(metric, own.value, t) }) : "—"}
      </span>
    </li>
  );
}

export default function MarketView({ reference, ownBoard, metric, step, onStep, t }) {
  const rows = reference.ready ? marketRows(reference, ownBoard, metric) : [];
  const { shown, nextStep, nextCount } = reveal(rows, step);
  return (
    <>
      <MarketHeader reference={reference} t={t} />
      {reference.ready ? (
        <div className={`flex min-w-0 flex-col gap-2 p-3 ${PANEL}`}>
          <div className="@container/market flex min-w-0 flex-col">
            <div
              className={`hidden items-center gap-x-3 px-2 pb-1 text-[10px] font-bold ${MUTED} @2xl/market:grid ${COLS}`}
            >
              <span className="text-center">#</span>
              <span>{t(`${NS}.modelHeader`)}</span>
              <span>{t(`${NS}.marketScore`)}</span>
              {MARKET_SOURCES.map((key) => (
                <span key={key} className="text-right">
                  {t(`${NS}.${SOURCE_LABEL[key]}`)}
                </span>
              ))}
              <span className="text-right">{t(`${NS}.marketOwnRank`)}</span>
              <span className="text-right">
                {t(`${NS}.marketOwnValue`, { metric: t(`${NS}.${METRIC_LABEL[metric]}`) })}
              </span>
              <span />
            </div>
            <ol className="flex flex-col gap-0.5">
              {shown.map((row) => (
                <MarketRow key={row.model} row={row} metric={metric} t={t} />
              ))}
            </ol>
          </div>
          <MoreLess step={step} nextStep={nextStep} nextCount={nextCount} onStep={onStep} t={t} />
        </div>
      ) : (
        <span className={EMPTY}>{t(`${NS}.marketNotReady`)}</span>
      )}
    </>
  );
}
