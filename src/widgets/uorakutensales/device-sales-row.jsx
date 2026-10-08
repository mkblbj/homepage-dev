/*
 * Row-level pieces of the 機種別販売 board: number text, the list header and
 * one model row. A row lays itself out by the width of its own list
 * (@container/list): from 20rem up, one line with 個数 / 売上 / 件数 in fixed
 * columns (the active one lit); below that, two lines — the name with the
 * active value, then the other two.
 */
import { BULK_PER_ORDER, DEVICE_METRICS } from "./device-sales-model.mjs";

export const NS = "uorakutensales";
export const MUTED = "text-theme-600 dark:text-[#B4BFCE]";

const METRIC_LABEL = { units: "sortUnits", sales: "sortSales", orders: "sortOrders" };
// gold / silver / bronze on the first three rank numbers
const RANK_TONE = {
  1: "text-amber-500 dark:text-amber-300",
  2: "text-slate-400 dark:text-slate-200",
  3: "text-orange-600 dark:text-orange-400",
};
// the widget's 楽天 red, lifted in dark mode so small figures stay readable
const VALUE_TONE = "text-[#C6362B] dark:text-[#F6A39A]";
// one-line layout: rank · model · 個数 · 売上 · 件数
const WIDE_COLS = "@xs/list:grid-cols-[20px_minmax(0,1fr)_48px_72px_40px]";

export function fmt(t, value) {
  return t("common.number", { value: Number(value) || 0 });
}

// "—" for a figure not measured yet, so a gap never reads as a zero
export function metricText(metric, value, t) {
  if (value == null) return "—";
  if (metric === "sales") return `¥${fmt(t, value)}`;
  if (metric === "orders") return `${fmt(t, value)}${t(`${NS}.ordersUnit`)}`;
  return `${fmt(t, value)}${t(`${NS}.unitsShort`)}`;
}

// the widget sits inside a clickable service card — keep clicks on the controls
export function press(handler) {
  return (e) => {
    e.preventDefault();
    e.stopPropagation();
    handler();
  };
}

export function ListHeader({ metric, order, t }) {
  return (
    <div className={`hidden items-center gap-x-2 px-2 pb-1 text-[10px] font-bold ${MUTED} @xs/list:grid ${WIDE_COLS}`}>
      <span className="text-center">#</span>
      <span>{t(`${NS}.modelHeader`)}</span>
      {DEVICE_METRICS.map((m) => (
        <span key={m} className={`text-right ${m === metric ? "text-theme-900 dark:text-theme-50" : ""}`}>
          {t(`${NS}.${METRIC_LABEL[m]}`)}
          {m === metric ? (order === "asc" ? " ▲" : " ▼") : ""}
        </span>
      ))}
    </div>
  );
}

// many pieces in one order reads as a bulk buy, not as broad demand
function BulkBadge({ row, t, className = "" }) {
  if (!(row.perOrder >= BULK_PER_ORDER)) return null;
  const value = row.perOrder.toFixed(1);
  return (
    <span
      title={t(`${NS}.perOrderTitle`, { value })}
      className={`shrink-0 rounded bg-amber-500/20 px-1 text-[9.5px] font-extrabold text-amber-700 dark:text-amber-300 ${className}`}
    >
      ×{value}
    </span>
  );
}

// A model name is never cut at its end, where Pro / Max / Lite / 5G sit: it
// wraps to two lines instead. A combination of three or more models shows the
// first one and a count; the full list opens under the row on demand.
export function ModelName({ row, expanded, onToggle, t, extra = null }) {
  const folded = row.models.length >= 3;
  return (
    <span className="relative flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5" title={row.models.join(" / ")}>
      <span
        data-testid="device-model"
        className="line-clamp-2 min-w-0 break-words text-[14px] font-semibold leading-snug text-theme-900 @xs/list:text-[12.5px] dark:text-theme-50"
      >
        {folded ? row.models[0] : row.model}
      </span>
      {folded ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={press(onToggle)}
          className="shrink-0 rounded-full border border-sky-500/40 px-1.5 text-[10px] font-bold text-sky-700 dark:text-sky-200"
        >
          {t(`${NS}.moreModels`, { count: row.models.length - 1 })}
        </button>
      ) : null}
      {row.compat ? (
        <span className="shrink-0 rounded bg-sky-500/15 px-1 text-[9.5px] font-bold text-sky-700 dark:text-sky-200">
          {t(`${NS}.compatBadge`)}
        </span>
      ) : null}
      {extra}
    </span>
  );
}

export function ModelList({ row }) {
  return (
    <span className="relative col-span-full rounded-md bg-theme-900/5 px-2 py-1.5 text-[11.5px] leading-relaxed text-theme-800 dark:bg-white/5 dark:text-theme-100">
      {row.models.join(" / ")}
    </span>
  );
}

export function DeviceRow({ row, metric, expanded, onToggle, t }) {
  const others = DEVICE_METRICS.filter((m) => m !== metric);
  return (
    <li
      data-testid="device-row"
      className={`relative grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 overflow-hidden rounded-lg px-2 py-1.5 ${WIDE_COLS} @xs/list:py-1`}
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 rounded-lg bg-[#2E7DF6]/20" style={{ width: `${row.barPct}%` }} />
      <span
        className={`relative row-span-2 text-center text-[13px] font-extrabold tabular-nums @xs/list:row-span-1 @xs/list:text-[12px] ${
          RANK_TONE[row.rank] ?? MUTED
        }`}
      >
        {row.rank}
      </span>
      <ModelName
        row={row}
        expanded={expanded}
        onToggle={onToggle}
        t={t}
        extra={<BulkBadge row={row} t={t} className="hidden @xs/list:inline" />}
      />
      {/* two lines: the active value beside the name, the other two under it */}
      <span className={`relative row-span-2 text-right text-[15px] font-extrabold tabular-nums @xs/list:hidden ${VALUE_TONE}`}>
        {metricText(metric, row[metric], t)}
      </span>
      <span className={`relative col-start-2 flex flex-wrap items-center gap-x-1.5 text-[12px] tabular-nums @xs/list:hidden ${MUTED}`}>
        {others.map((m) => metricText(m, row[m], t)).join(" · ")}
        <BulkBadge row={row} t={t} />
      </span>
      {/* one line: all three metrics in fixed columns, the active one lit */}
      {DEVICE_METRICS.map((m) => (
        <span
          key={m}
          className={`relative hidden whitespace-nowrap text-right tabular-nums @xs/list:block ${
            m === metric ? `text-[13px] font-extrabold ${VALUE_TONE}` : `text-[11px] font-semibold ${MUTED}`
          }`}
        >
          {metricText(m, row[m], t)}
        </span>
      ))}
      {expanded && row.models.length >= 3 ? <ModelList row={row} /> : null}
    </li>
  );
}
