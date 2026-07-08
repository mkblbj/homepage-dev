/*
 * uorakutensales — 楽天売上 board (design "1b").
 *
 * BODY = realtime (今日) sales; CONTEXT = trailing 7 days (excl. today).
 *
 * Two read-only endpoints (both defined in the widget proxy mapping):
 *   "sales"   → GET /api/sales          realtime snapshot (main body)
 *   "history" → GET /api/history/sales  trailing-7d snapshot (context)
 *
 * Realtime has NO conversionRate → per-row CVR comes from the 7-day history.
 * Freshness pill (LIVE / 遅延 / 停止) is derived from sales.generatedAtJST.
 * Pure view-model + geometry helpers live in ./sales-model.mjs.
 */
import Container from "components/services/widget/container";
import { useTranslation } from "next-i18next/pages";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ACCENT,
  buildModel,
  computeFreshness,
  DEFAULT_REFRESH_INTERVAL,
  HISTORY_MIN_INTERVAL,
  LOGO_MIN_INTERVAL,
  man,
  spark,
} from "./sales-model.mjs";

import useWidgetAPI from "utils/proxy/use-widget-api";

const NS = "uorakutensales";

// data-viz blue for the trend lines/bars.
const SPARK_STROKE_FROM = "#7DB8FB";
const SPARK_STROKE_TO = "#2E7DF6";
const SPARK_AREA = "rgba(59,130,246,";
const DOT = "#2E7DF6";

// 楽天アクセント緋 as text — brightened in dark mode so it stays legible on a dark card.
const ACCENT_TEXT = "text-[#C6362B] dark:text-[#F0857A]";

function fmt(t, value) {
  return t("common.number", { value: Number(value) || 0 });
}

// Shared gradient defs for every sparkline (referenced by id across the widget).
function SparkDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" className="absolute">
      <defs>
        <linearGradient id="uors-stroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={SPARK_STROKE_FROM} />
          <stop offset="1" stopColor={SPARK_STROKE_TO} />
        </linearGradient>
        <linearGradient id="uors-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={`${SPARK_AREA}0.30)`} />
          <stop offset="1" stopColor={`${SPARK_AREA}0)`} />
        </linearGradient>
      </defs>
    </svg>
  );
}

// updatedAt vs now → live / delayed / stale (ticks once a second)
function useFreshness(jst, refreshInterval) {
  const [nowTs, setNowTs] = useState(null);
  useEffect(() => {
    setNowTs(Date.now());
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return useMemo(() => computeFreshness(jst, nowTs, refreshInterval), [jst, nowTs, refreshInterval]);
}

const STATUS_TONE = {
  live: "border-emerald-400/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  delayed: "border-amber-400/40 bg-amber-500/10 text-amber-600 dark:text-amber-300",
  stale: "border-rose-400/40 bg-rose-500/10 text-rose-600 dark:text-rose-300",
};
const STATUS_DOT = { live: "bg-emerald-500", delayed: "bg-amber-500", stale: "bg-rose-500" };

function FreshnessPill({ freshness, t }) {
  const state = freshness?.state ?? "live";
  const label =
    state === "live" ? t(`${NS}.statusLive`) : state === "delayed" ? t(`${NS}.statusDelayed`) : t(`${NS}.statusStale`);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${STATUS_TONE[state]}`}>
      <span className="relative flex h-1.5 w-1.5">
        {state === "live" ? <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${STATUS_DOT.live}`} /> : null}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${STATUS_DOT[state]}`} />
      </span>
      {label}
    </span>
  );
}

function ShopIcon() {
  return (
    <span
      className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] border"
      style={{ color: ACCENT, backgroundColor: "rgba(198,54,43,.12)", borderColor: "rgba(198,54,43,.3)" }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9.5 5 4h14l2 5.5" />
        <path d="M4 9.5h16v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5Z" />
        <path d="M9 13h6" />
      </svg>
    </span>
  );
}

// per-shop logo with a first-char fallback when the URL is empty or fails to load.
// Rakuten logos vary (some white-bg) → bg-white + object-contain keeps them clean.
function ShopLogo({ name, url, size = 16 }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (url && !failed) {
    return (
      <img
        src={url}
        alt={name}
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
      className="inline-flex shrink-0 items-center justify-center rounded-[5px] font-bold"
      style={{ width: size, height: size, fontSize: size * 0.58, color: ACCENT, backgroundColor: "rgba(198,54,43,.14)" }}
    >
      {String(name || "?").trim().charAt(0) || "?"}
    </span>
  );
}

function RefreshButton({ onRefresh, t }) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      title={t(`${NS}.refresh`)}
      aria-label={t(`${NS}.refresh`)}
      className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[10px] border border-theme-300/60 text-theme-600 transition-colors hover:bg-theme-200/50 hover:text-theme-900 dark:border-theme-600/60 dark:text-theme-300 dark:hover:bg-theme-700/50 dark:hover:text-theme-50"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 12a8 8 0 1 1-2.35-5.65" />
        <path d="M20 3v4h-4" />
      </svg>
    </button>
  );
}

// line ↔ bar toggle for the per-shop 7-day mini charts
function ChartModeToggle({ mode, onChange, t }) {
  const button = (m, label, children) => (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onChange(m);
      }}
      title={label}
      aria-label={label}
      aria-pressed={mode === m}
      className={`inline-flex h-5 w-6 items-center justify-center rounded transition-colors ${
        mode === m
          ? "bg-theme-700 text-white dark:bg-theme-100 dark:text-theme-900"
          : "text-theme-500 hover:bg-theme-200/70 dark:text-theme-400 dark:hover:bg-theme-700/60"
      }`}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
  return (
    <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-theme-300/60 bg-theme-100/50 p-0.5 dark:border-theme-600/60 dark:bg-theme-900/30">
      {button("line", t(`${NS}.chartLine`), <path d="M4 15l5-5 4 3 7-8" />)}
      {button(
        "bar",
        t(`${NS}.chartBar`),
        <>
          <path d="M6 20V10" />
          <path d="M12 20V4" />
          <path d="M18 20v-6" />
        </>,
      )}
    </div>
  );
}

// per-shop 7-day mini chart: line (sparkline) or bars, both with hover detail.
// points = [{ md, wd, sales, orders }]. x uses segment centers so the hover dot
// / highlighted bar / tooltip all line up with the equal-width hover zones.
function ShopMiniChart({ points, mode, t, height = 32 }) {
  const [hover, setHover] = useState(null);
  const n = points.length;
  const vals = useMemo(() => points.map((p) => p.sales), [points]);
  const minV = n ? Math.min(...vals) : 0;
  const maxV = n ? Math.max(...vals) : 0;
  const span = maxV - minV || 1;
  const barMax = Math.max(1, maxV);
  const { line, area } = useMemo(() => spark(vals, 100, height, false, true), [vals, height]);

  const hp = hover != null ? points[hover] : null;
  const on = hp != null;
  const xPct = on ? ((hover + 0.5) / n) * 100 : 0;
  const dotYPct = on ? ((5 + (1 - (hp.sales - minV) / span) * (height - 10)) / height) * 100 : 0;
  const tipTx = hover === 0 ? "0%" : hover === n - 1 ? "-100%" : "-50%";

  if (!n) {
    return <span className="block w-full rounded bg-theme-200/40 dark:bg-white/[0.04]" style={{ height }} />;
  }

  return (
    <div className="relative w-full" style={{ height }}>
      {mode === "bar" ? (
        <div className="absolute inset-0 flex items-end gap-[3px]">
          {points.map((p, i) => (
            <span
              key={p.date ?? i}
              className="block flex-1 rounded-[2px] transition-opacity"
              style={{ height: `${Math.max(10, (p.sales / barMax) * 100)}%`, backgroundColor: DOT, opacity: on ? (i === hover ? 1 : 0.3) : 0.7 }}
            />
          ))}
        </div>
      ) : (
        <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" width="100%" height="100%" className="block overflow-visible">
          <path d={area} fill="url(#uors-area)" />
          <path
            d={line}
            fill="none"
            stroke="url(#uors-stroke)"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            style={{ filter: "drop-shadow(0 1px 3px rgba(59,130,246,.35))" }}
          />
        </svg>
      )}

      {/* hover zones */}
      <div className="absolute inset-0 flex" onMouseLeave={() => setHover(null)}>
        {points.map((p, i) => (
          <div key={p.date ?? i} className="flex-1 cursor-crosshair" onMouseEnter={() => setHover(i)} />
        ))}
      </div>

      {on ? (
        <>
          {mode === "line" ? (
            <span
              className="pointer-events-none absolute h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
              style={{ left: `${xPct}%`, top: `${dotYPct}%`, backgroundColor: DOT }}
            />
          ) : null}
          <div
            className="pointer-events-none absolute bottom-full z-20 mb-1 whitespace-nowrap rounded-[6px] bg-slate-900 px-2 py-1 text-center shadow-lg"
            style={{ left: `${xPct}%`, transform: `translateX(${tipTx})` }}
          >
            <span className="block text-[9px] font-bold text-slate-300">
              {hp.md}（{hp.wd}）
            </span>
            <span className="block text-[11px] font-extrabold tabular-nums text-white">¥{fmt(t, hp.sales)}</span>
            <span className="block text-[8.5px] font-medium tabular-nums text-slate-400">
              {fmt(t, hp.orders)}
              {t(`${NS}.ordersUnit`)}
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}

// ---- daily area chart with hover (aggregate across shops) ----
function DailyChart({ model, t }) {
  const [hover, setHover] = useState(null);
  // hover is an index into model.days; a background refresh can shrink model.days
  // below a stale index, so guard on the resolved element, not just the index.
  const hd = hover != null ? model.days[hover] : null;
  const on = hd != null;
  const tipTx = hover === 0 ? "0%" : hover === model.nDays - 1 ? "-100%" : "-50%";
  const avgTopPct = ((5 + (1 - model.avg / model.maxDaily) * 30) / 40) * 100;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-[10.5px] font-bold tracking-wide text-theme-600 dark:text-theme-300">
          {t(`${NS}.dailyTrend`)} <span className="text-[9px] font-medium text-theme-500 dark:text-theme-400">· {t(`${NS}.excludesToday`)}</span>
        </span>
        <span className="shrink-0 text-[9.5px] font-medium text-theme-600 dark:text-theme-300">
          <span className="mr-1 inline-block w-3 border-t-[1.5px] border-dashed align-middle" style={{ borderColor: ACCENT }} />
          {t(`${NS}.avgLabel`)}
        </span>
      </div>
      <div className="relative h-[112px]">
        <div className="pointer-events-none absolute inset-x-0 z-[3] border-t-[1.5px] border-dashed" style={{ top: `${avgTopPct}%`, borderColor: "rgba(198,54,43,.7)" }} />
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" width="100%" height="100%" className="absolute inset-0 block overflow-visible">
          <path d={model.heroChart.area} fill="url(#uors-area)" />
          <path
            d={model.heroChart.line}
            fill="none"
            stroke="url(#uors-stroke)"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            style={{ filter: "drop-shadow(0 3px 6px rgba(59,130,246,.4))" }}
          />
        </svg>

        {/* hover zones */}
        <div className="absolute inset-0 z-[5] flex" onMouseLeave={() => setHover(null)}>
          {model.days.map((d, i) => (
            <div key={d.date} className="flex-1 cursor-crosshair" onMouseEnter={() => setHover(i)} />
          ))}
        </div>

        {on ? (
          <>
            <div className="pointer-events-none absolute inset-y-0 z-[6] w-px" style={{ left: `${hd.xPct}%`, backgroundColor: "rgba(198,54,43,.45)" }} />
            <div
              className="pointer-events-none absolute z-[7] h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
              style={{ left: `${hd.xPct}%`, top: `${hd.yPct}%`, backgroundColor: ACCENT, boxShadow: "0 0 0 1px rgba(198,54,43,.4)" }}
            />
            <div
              className="pointer-events-none absolute top-[3px] z-[8] whitespace-nowrap rounded-[7px] bg-slate-900 px-2.5 py-1 shadow-lg"
              style={{ left: `${hd.xPct}%`, transform: `translateX(${tipTx})` }}
            >
              <span className="block text-[9.5px] font-bold text-slate-300">
                {hd.md}（{hd.wd}）
              </span>
              <span className="block text-[12.5px] font-extrabold tabular-nums text-white">¥{fmt(t, hd.sales)}</span>
              <span className="block text-[9px] font-medium tabular-nums text-slate-400">
                {fmt(t, hd.orders)}
                {t(`${NS}.ordersUnit`)}
              </span>
            </div>
          </>
        ) : null}
      </div>
      <div className="flex">
        {model.days.map((d) => (
          <span key={d.date} className="flex-1 text-center text-[9px] font-medium tabular-nums text-theme-600 dark:text-theme-300">
            {d.md}
          </span>
        ))}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="@container flex w-full min-w-0 flex-col gap-3 p-1.5">
      <div className="flex items-center justify-between px-0.5">
        <div className="h-4 w-28 animate-pulse rounded bg-theme-300/30 dark:bg-theme-700/30" />
        <div className="h-6 w-40 animate-pulse rounded bg-theme-300/30 dark:bg-theme-700/30" />
      </div>
      <div className="flex flex-col gap-3 rounded-2xl border border-theme-300/40 bg-theme-200/30 p-4 dark:border-theme-600/40 dark:bg-white/10">
        <div className="h-3 w-20 animate-pulse rounded bg-theme-300/40 dark:bg-theme-700/40" />
        <div className="h-10 w-40 animate-pulse rounded bg-theme-300/40 dark:bg-theme-700/40" />
        <div className="h-2 w-full animate-pulse rounded bg-theme-300/30 dark:bg-theme-700/30" />
      </div>
      <div className="h-24 w-full animate-pulse rounded-2xl bg-theme-200/30 dark:bg-white/10" />
    </div>
  );
}

export default function Component({ service }) {
  const { t } = useTranslation();
  const { widget } = service;
  const refreshInterval = Math.max(1000, Number(widget.refreshInterval) || DEFAULT_REFRESH_INTERVAL);
  const [chartMode, setChartMode] = useState("line");

  const { data: sales, error: salesError, mutate: mutateSales } = useWidgetAPI(widget, "sales", { refreshInterval });
  const { data: history, mutate: mutateHistory } = useWidgetAPI(widget, "history", {
    refreshInterval: Math.max(refreshInterval, HISTORY_MIN_INTERVAL),
  });
  const { data: logos } = useWidgetAPI(widget, "logos", {
    refreshInterval: Math.max(refreshInterval, LOGO_MIN_INTERVAL),
  });

  const freshness = useFreshness(sales?.generatedAtJST, refreshInterval);
  const model = useMemo(() => buildModel(sales, history, logos), [sales, history, logos]);

  const handleRefresh = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      mutateSales();
      mutateHistory();
    },
    [mutateSales, mutateHistory],
  );

  if (salesError) return <Container service={service} error={salesError} />;
  if (!model) {
    return (
      <Container service={service}>
        <LoadingSkeleton />
      </Container>
    );
  }

  const cardCls = "rounded-2xl border border-theme-300/40 bg-theme-200/30 dark:border-theme-600/40 dark:bg-white/10";

  return (
    <Container service={service}>
      <SparkDefs />
      <div className="@container flex w-full min-w-0 flex-col gap-3 p-1.5">
        {/* header */}
        <div className="flex items-center justify-between gap-2 px-0.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <ShopIcon />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-bold text-theme-900 dark:text-theme-50">{t(`${NS}.title`)}</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-theme-600 dark:text-theme-300">
                {t(`${NS}.subtitle`, { count: model.rows.length })}
              </span>
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <span className="flex flex-col items-end leading-tight">
              <span className="text-[9px] font-bold tracking-[0.14em] text-theme-600 dark:text-theme-300">{t(`${NS}.updatedAt`)}</span>
              <span className="text-[12px] font-semibold tabular-nums text-theme-800 dark:text-theme-100">{model.generatedAtJST || "-"}</span>
            </span>
            <FreshnessPill freshness={freshness} t={t} />
            <RefreshButton onRefresh={handleRefresh} t={t} />
          </div>
        </div>

        {/* hero: realtime (main) + today shop breakdown.
            Two columns only once there's room for BOTH (≥ @4xl); below that the hero
            takes the full row and the breakdown drops beneath it — no cramped middle zone. */}
        <section className={`grid grid-cols-1 @4xl:grid-cols-[minmax(360px,1fr)_1.7fr] ${cardCls}`}>
          <div className="flex min-w-0 flex-col gap-2.5 border-b border-theme-300/30 p-5 @4xl:border-b-0 @4xl:border-r dark:border-white/10">
            <span className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold tracking-wide text-theme-600 dark:text-theme-300">{t(`${NS}.todaySales`)}</span>
              <span className="inline-flex items-center gap-1 text-[9.5px] font-extrabold tracking-wide text-emerald-600 dark:text-emerald-300">
                <span className="h-[5px] w-[5px] rounded-full bg-emerald-500" />
                {t(`${NS}.statusLive`)}
              </span>
            </span>
            <span className="flex items-baseline gap-1">
              <span className="text-[19px] font-bold text-theme-600 dark:text-theme-300">¥</span>
              <span className="text-[54px] font-extrabold leading-[0.85] tracking-tight tabular-nums text-theme-900 dark:text-theme-50">{fmt(t, model.rtTotal)}</span>
            </span>
            <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
              <span className="text-[22px] font-extrabold leading-none tabular-nums text-theme-800 dark:text-theme-100">
                {fmt(t, model.rtOrders)}
                <span className="ml-0.5 text-[12px] font-semibold text-theme-600 dark:text-theme-300">{t(`${NS}.ordersUnit`)}</span>
              </span>
              <span className="text-[12.5px] font-medium tabular-nums text-theme-600 dark:text-theme-300">
                {t(`${NS}.aov`)} ¥{fmt(t, model.aov)}
                {model.time ? ` · ${t(`${NS}.asOf`, { time: model.time })}` : ""}
              </span>
            </span>
            {/* pace vs 7-day avg */}
            <div className="mt-1.5 flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-medium text-theme-600 dark:text-theme-300">{t(`${NS}.vsSevenDayAvg`, { avg: fmt(t, Math.round(model.avg)) })}</span>
                <span className={`text-[13px] font-bold tabular-nums ${ACCENT_TEXT}`}>
                  {model.avg > 0 ? Math.round((model.rtTotal / model.avg) * 100) : 0}%
                </span>
              </div>
              <span className="block h-2 overflow-hidden rounded-full bg-theme-300/40 dark:bg-white/10">
                <span className="block h-full rounded-full" style={{ width: `${model.avg > 0 ? Math.min(100, (model.rtTotal / model.avg) * 100) : 0}%`, backgroundColor: ACCENT }} />
              </span>
            </div>
            {/* 7-day context summary — fills the hero's spare height, anchors the pace bar */}
            {model.hasHistory ? (
              <div className="mt-auto flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-theme-300/30 pt-3 dark:border-white/10">
                <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-theme-600 dark:text-theme-300">{t(`${NS}.sevenDay`)}</span>
                <span className="text-[13px] font-bold tabular-nums text-theme-800 dark:text-theme-100">¥{fmt(t, model.grandTotal)}</span>
                <span className="text-[12px] font-medium tabular-nums text-theme-600 dark:text-theme-300">
                  {fmt(t, model.grandOrders)}
                  {t(`${NS}.ordersUnit`)}
                </span>
                <span className="text-[12px] font-medium tabular-nums text-theme-600 dark:text-theme-300">CVR {model.grandCvr.toFixed(2)}%</span>
              </div>
            ) : null}
          </div>

          {/* today shop breakdown — bullet column trails right (today share vs 7-day share) */}
          <div className="flex min-w-0 flex-col gap-2.5 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-theme-700 dark:text-theme-200">{t(`${NS}.shopBreakdownLive`)}</span>
              {model.hasHistory ? (
                <span className="flex items-center gap-1 text-[9px] font-medium text-theme-500 dark:text-theme-400">
                  <span className="inline-block h-2.5 w-0.5 rounded-full bg-theme-700 dark:bg-theme-50" />
                  {t(`${NS}.sevenDayAvgShare`)}
                </span>
              ) : null}
            </div>
            {/* name + numbers cluster on the left (no cross-row eye travel); bullet trails right */}
            <div className="grid grid-cols-[minmax(0,120px)_100px_48px_46px_minmax(56px,1fr)] items-center gap-x-2.5 gap-y-2">
              {model.rows.map((r) => {
                const overIndex = r.rtShare >= r.h7Share;
                return (
                  <div key={r.name} className="contents">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <ShopLogo name={r.name} url={r.logoUrl} size={16} />
                      <span className="truncate text-[12.5px] font-semibold text-theme-900 dark:text-theme-50">{r.name}</span>
                    </span>
                    <span className={`text-right text-[13px] font-bold tabular-nums ${r.rtSales > 0 ? ACCENT_TEXT : "text-theme-400 dark:text-theme-500"}`}>
                      {r.rtSales > 0 ? `¥${fmt(t, r.rtSales)}` : "¥0"}
                    </span>
                    <span className="text-right text-[11px] font-medium tabular-nums text-theme-600 dark:text-theme-300">
                      {fmt(t, r.rtOrders)}
                      {t(`${NS}.ordersUnit`)}
                    </span>
                    <span className="text-right text-[10.5px] font-medium tabular-nums text-theme-500 dark:text-theme-400">{r.rtShare.toFixed(1)}%</span>
                    {/* bullet: fill = today share, tick = this shop's 7-day share; red when today ≥ normal */}
                    <span className="relative block h-2 rounded-full bg-theme-300/40 dark:bg-white/10">
                      <span
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{
                          width: `${Math.min(100, (r.rtShare / model.shareScale) * 100)}%`,
                          backgroundColor: overIndex ? ACCENT : "rgba(148,163,184,0.75)",
                          opacity: overIndex ? 0.9 : 1,
                        }}
                      />
                      {r.h7Share > 0 ? (
                        <span
                          className="absolute top-1/2 h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-theme-700 dark:bg-theme-50"
                          style={{ left: `${Math.min(100, (r.h7Share / model.shareScale) * 100)}%` }}
                        />
                      ) : null}
                    </span>
                  </div>
                );
              })}
              {/* one continuous divider across every column, then the aligned totals row */}
              <span className="col-span-full mt-1 h-px bg-theme-300/60 dark:bg-white/15" />
              <span className="text-[12px] font-bold text-theme-900 dark:text-theme-50">{t(`${NS}.total`)}</span>
              <span className={`text-right text-[13px] font-extrabold tabular-nums ${ACCENT_TEXT}`}>¥{fmt(t, model.rtTotal)}</span>
              <span className="text-right text-[11px] font-bold tabular-nums text-theme-700 dark:text-theme-200">
                {fmt(t, model.rtOrders)}
                {t(`${NS}.ordersUnit`)}
              </span>
              <span />
              <span />
            </div>
          </div>
        </section>

        {model.hasHistory ? (
          <section className={`grid grid-cols-1 gap-x-5 gap-y-4 p-4 @4xl:grid-cols-[300px_1fr] ${cardCls}`}>
            <div className="min-w-0 @4xl:border-r @4xl:border-theme-300/30 dark:@4xl:border-white/10 @4xl:pr-5">
              <DailyChart model={model} t={t} />
            </div>
            <div className="flex min-w-0 flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[10.5px] font-bold tracking-wide text-theme-600 dark:text-theme-300">
                  {t(`${NS}.shopTrend`)} <span className="text-[9px] font-medium text-theme-500 dark:text-theme-400">· {t(`${NS}.excludesToday`)}</span>
                </span>
                <ChartModeToggle mode={chartMode} onChange={setChartMode} t={t} />
              </div>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(104px,1fr))] gap-2.5">
                {model.rows.map((r) => (
                  <div key={r.name} className="relative flex min-w-0 flex-col rounded-xl border border-theme-300/30 bg-theme-100/60 p-2.5 dark:border-white/[0.06] dark:bg-white/[0.03]">
                    {/* corner-bleed logo watermark — clipped by its OWN layer so the mini-chart
                        hover tooltip can still escape the (unclipped) card */}
                    {r.logoUrl ? (
                      <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
                        <img
                          src={r.logoUrl}
                          alt=""
                          aria-hidden="true"
                          loading="lazy"
                          className="absolute -top-2 -right-2 h-[68px] w-[68px] object-contain opacity-[0.12] blur-[4px] dark:opacity-[0.15]"
                        />
                      </span>
                    ) : null}
                    <div className="relative flex min-w-0 flex-col gap-1.5">
                      <span className="truncate text-[11px] font-semibold text-theme-900 dark:text-theme-50">{r.name}</span>
                      <span className="flex items-baseline gap-0.5">
                        <span className="text-[9px] font-bold text-theme-600 dark:text-theme-300">¥</span>
                        <span className="text-[15px] font-bold leading-none tabular-nums text-theme-900 dark:text-theme-50">{man(r.h7Total)}</span>
                        <span className="text-[9px] font-medium text-theme-600 dark:text-theme-300">{t(`${NS}.manUnit`)}</span>
                      </span>
                      <ShopMiniChart points={r.daily} mode={chartMode} t={t} />
                      <span className="border-t border-theme-300/30 pt-1.5 text-[9px] font-medium tabular-nums text-theme-600 dark:border-white/10 dark:text-theme-300">
                        {fmt(t, r.h7Orders)}
                        {t(`${NS}.ordersUnit`)} · CVR {r.cvr.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </Container>
  );
}
