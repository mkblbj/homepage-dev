/*
 * uorakutensales — 楽天売上 board (design "1b").
 *
 * BODY = realtime (今日) sales; CONTEXT = trailing 7 days (excl. today).
 *
 * Read-only endpoints (all defined in the widget proxy mapping):
 *   "sales"   → GET /api/sales          realtime snapshot (main body)
 *   "history" → GET /api/history/sales  trailing-7d snapshot (context)
 *   "ranking" → GET /api/item-rankings  today's item boards
 *   "monthly" → GET /api/sales/monthly  this month so far + last month complete
 *   "devices"        → GET /api/device-sales          today's device-model boards
 *   "devicesMonthly" → GET /api/device-sales/monthly  this month + last month device boards
 *   "peaks"   → GET /api/history/peaks  all-time record boards
 *   "logos"   → GET /api/shops/logos    shop logo urls
 *   "amazonSales"   → GET /api/amazon/sales          Amazon today, this month, last month
 *   "amazonHistory" → GET /api/amazon/history/sales  Amazon's last seven finished days
 *   "amazonRanking" → GET /api/amazon/item-rankings  Amazon's item boards, per shop
 *
 * Amazon shops sit beside 楽天's as peers. Counts add up across platforms;
 * yen never do, since each platform measures its amounts its own way.
 *
 * Realtime has NO conversionRate → per-row CVR comes from the 7-day history.
 * Freshness pill (LIVE / 遅延 / 停止) is derived from sales.sourceUpdatedAtJST (the
 * order-API read time; generatedAtJST moves even when a refresh failed).
 * Pure view-model + geometry helpers live in ./sales-model.mjs.
 */
import Container from "components/services/widget/container";
import { useTranslation } from "next-i18next/pages";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { buildPerformanceModel, DASH } from "widgets/uoperformance/performance-model.mjs";

import { buildAmazon, buildAmazonBoards } from "./amazon-model.mjs";
import { buildMonthView, buildShopTable, buildTodayView, RANKING_DIM_BY_METRIC } from "./daily-check-model.mjs";
import {
  historyNotes,
  MetricSwitch,
  MonthCard,
  ShopTable,
  TodayCard,
  VisitCard,
  visitDayLabel,
  visitsStale,
} from "./daily-check-section";
import { buildDeviceEvidence } from "./device-evidence-model.mjs";
import { buildMarketEvidence, buildMarketReference, MARKET_REFRESH_INTERVAL } from "./device-market-model.mjs";
import { buildDeviceSales } from "./device-sales-model.mjs";
import DeviceSalesSection from "./device-sales-section";
import { CustomerMixCard, ShopVisitsTable } from "./insight-section";
import {
  ACCENT,
  buildModel,
  buildMonthly,
  buildPeaks,
  buildRanking,
  buildShopColors,
  computeFreshness,
  DEFAULT_PEAK_DIM,
  DEFAULT_REFRESH_INTERVAL,
  FALLBACK_SHOP_COLOR,
  man,
  PEAK_DIMS,
  RANKING_STEPS,
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
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${STATUS_TONE[state]}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {state === "live" ? (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${STATUS_DOT.live}`}
          />
        ) : null}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${STATUS_DOT[state]}`} />
      </span>
      {label}
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
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
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
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
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
// A dashed line marks the shop's daily average; the ⌀ tag (hover) reveals the
// average sales / orders / CVR. cvr is the shop's trailing-7d conversion rate.
function ShopMiniChart({ points, mode, cvr = 0, t, height = 32 }) {
  const [hover, setHover] = useState(null);
  const [avgHover, setAvgHover] = useState(false);
  const n = points.length;
  const vals = useMemo(() => points.map((p) => p.sales), [points]);
  const minV = n ? Math.min(...vals) : 0;
  const maxV = n ? Math.max(...vals) : 0;
  const span = maxV - minV || 1;
  const barMax = Math.max(1, maxV);
  const { line, area } = useMemo(() => spark(vals, 100, height, false, true), [vals, height]);

  const avgSales = n ? vals.reduce((s, v) => s + v, 0) / n : 0;
  const avgOrders = n ? points.reduce((s, p) => s + p.orders, 0) / n : 0;
  // avg line y matches the active scale: sparkline is min..max, bars are 0..max
  const avgTopPct =
    mode === "bar"
      ? (1 - avgSales / barMax) * 100
      : ((5 + (1 - (avgSales - minV) / span) * (height - 10)) / height) * 100;

  const hp = hover != null && !avgHover ? points[hover] : null;
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
              style={{
                height: `${Math.max(10, (p.sales / barMax) * 100)}%`,
                backgroundColor: DOT,
                opacity: on ? (i === hover ? 1 : 0.3) : 0.7,
              }}
            />
          ))}
        </div>
      ) : (
        <svg
          viewBox={`0 0 100 ${height}`}
          preserveAspectRatio="none"
          width="100%"
          height="100%"
          className="block overflow-visible"
        >
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

      {/* daily-average line */}
      <span
        className="pointer-events-none absolute inset-x-0 z-[2] border-t border-dashed"
        style={{ top: `${avgTopPct}%`, borderColor: "rgba(198,54,43,.55)" }}
      />

      {/* hover zones (per day) */}
      <div className="absolute inset-0 z-[3] flex" onMouseLeave={() => setHover(null)}>
        {points.map((p, i) => (
          <div key={p.date ?? i} className="flex-1 cursor-crosshair" onMouseEnter={() => setHover(i)} />
        ))}
      </div>

      {/* ⌀ average tag — always shows daily avg; hover reveals full averages */}
      <span
        className="absolute right-0 z-[4] flex -translate-y-1/2 cursor-help items-center rounded-[3px] bg-slate-900/75 px-1 text-[7px] font-bold leading-[1.4] text-white/90 tabular-nums"
        style={{ top: `${avgTopPct}%` }}
        onMouseEnter={() => setAvgHover(true)}
        onMouseLeave={() => setAvgHover(false)}
      >
        ⌀{man(avgSales)}
        {t(`${NS}.manUnit`)}
      </span>

      {avgHover ? (
        <div className="pointer-events-none absolute bottom-full right-0 z-20 mb-1 whitespace-nowrap rounded-[6px] bg-slate-900 px-2 py-1 text-right shadow-lg">
          <span className="block text-[8.5px] font-bold text-slate-300">{t(`${NS}.avgLabel`)}</span>
          <span className="block text-[11px] font-extrabold tabular-nums text-white">
            ¥{fmt(t, Math.round(avgSales))}
            {t(`${NS}.perDay`)}
          </span>
          <span className="block text-[8.5px] font-medium tabular-nums text-slate-400">
            {fmt(t, Math.round(avgOrders))}
            {t(`${NS}.ordersUnit`)}
            {t(`${NS}.perDay`)} · CVR {cvr.toFixed(2)}%
          </span>
        </div>
      ) : null}

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
              {t(`${NS}.ordersUnit`)} · {fmt(t, hp.units)}
              {t(`${NS}.unitsShort`)}
              {hp.cvr > 0 ? ` · CVR ${hp.cvr.toFixed(2)}%` : ""}
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}

// ---- daily area chart with hover (aggregate across shops) ----
function DailyChart({ model, mode, onModeChange, t }) {
  const [hover, setHover] = useState(null);
  const [avgHover, setAvgHover] = useState(false);
  // hover is an index into model.days; a background refresh can shrink model.days
  // below a stale index, so guard on the resolved element, not just the index.
  // Suppressed while hovering the ⌀ average tag (mutually exclusive tooltips).
  const hd = hover != null && !avgHover ? model.days[hover] : null;
  const on = hd != null;
  const tipTx = hover === 0 ? "0%" : hover === model.days.length - 1 ? "-100%" : "-50%";
  const avgTopPct = ((5 + (1 - model.avg / model.maxDaily) * 30) / 40) * 100;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[10.5px] font-bold tracking-wide text-theme-600 dark:text-theme-300">
          {t(`${NS}.dailyTrend`)}{" "}
          <span className="text-[9px] font-medium text-theme-500 dark:text-theme-400">
            · {t(`${NS}.excludesToday`)}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-[9.5px] font-medium text-theme-600 dark:text-theme-300">
            <span
              className="mr-1 inline-block w-3 border-t-[1.5px] border-dashed align-middle"
              style={{ borderColor: ACCENT }}
            />
            {t(`${NS}.avgLabel`)}
          </span>
          {/* drives both this chart and the per-shop mini charts */}
          <ChartModeToggle mode={mode} onChange={onModeChange} t={t} />
        </span>
      </div>
      <div className="relative h-[112px]">
        <div
          className="pointer-events-none absolute inset-x-0 z-[3] border-t-[1.5px] border-dashed"
          style={{ top: `${avgTopPct}%`, borderColor: "rgba(198,54,43,.7)" }}
        />
        {/* ⌀ average tag on the line — same affordance as the per-shop mini charts */}
        <span
          className="absolute right-0 z-[9] flex -translate-y-1/2 cursor-help items-center rounded-[3px] bg-slate-900/75 px-1.5 text-[8px] font-bold leading-[1.5] tabular-nums text-white/90"
          style={{ top: `${avgTopPct}%` }}
          onMouseEnter={() => setAvgHover(true)}
          onMouseLeave={() => setAvgHover(false)}
        >
          ⌀{man(model.avg)}
          {t(`${NS}.manUnit`)}
          {avgHover ? (
            <span className="pointer-events-none absolute bottom-full right-0 z-20 mb-1 whitespace-nowrap rounded-[6px] bg-slate-900 px-2 py-1 text-right shadow-lg">
              <span className="block text-[8.5px] font-bold text-slate-300">{t(`${NS}.avgLabel`)}</span>
              <span className="block text-[11px] font-extrabold tabular-nums text-white">
                ¥{fmt(t, Math.round(model.avg))}
                {t(`${NS}.perDay`)}
              </span>
              <span className="block text-[8.5px] font-medium tabular-nums text-slate-400">
                {fmt(t, Math.round(model.avgOrders))}
                {t(`${NS}.ordersUnit`)}
                {t(`${NS}.perDay`)} · CVR {model.grandCvr.toFixed(2)}%
              </span>
            </span>
          ) : null}
        </span>
        {mode === "bar" ? (
          <div className="absolute inset-0 flex items-end gap-[5px]">
            {model.days.map((d, i) => (
              <span
                key={d.date}
                className="block flex-1 rounded-[3px] transition-opacity"
                style={{
                  height: `${Math.max(2, (d.sales / model.maxDaily) * 100)}%`,
                  backgroundColor: DOT,
                  opacity: on ? (i === hover ? 1 : 0.32) : 0.72,
                }}
              />
            ))}
          </div>
        ) : (
          <svg
            viewBox="0 0 100 40"
            preserveAspectRatio="none"
            width="100%"
            height="100%"
            className="absolute inset-0 block overflow-visible"
          >
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
        )}

        {/* hover zones */}
        <div className="absolute inset-0 z-[5] flex" onMouseLeave={() => setHover(null)}>
          {model.days.map((d, i) => (
            <div key={d.date} className="flex-1 cursor-crosshair" onMouseEnter={() => setHover(i)} />
          ))}
        </div>

        {on ? (
          <>
            <div
              className="pointer-events-none absolute inset-y-0 z-[6] w-px"
              style={{ left: `${hd.xPct}%`, backgroundColor: "rgba(198,54,43,.45)" }}
            />
            <div
              className={`pointer-events-none absolute z-[7] h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ${
                mode === "bar" ? "hidden" : ""
              }`}
              style={{
                left: `${hd.xPct}%`,
                top: `${hd.yPct}%`,
                backgroundColor: ACCENT,
                boxShadow: "0 0 0 1px rgba(198,54,43,.4)",
              }}
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
                {t(`${NS}.ordersUnit`)} · {fmt(t, hd.units)}
                {t(`${NS}.unitsShort`)}
                {hd.cvr > 0 ? ` · CVR ${hd.cvr.toFixed(2)}%` : ""}
              </span>
            </div>
          </>
        ) : null}
      </div>
      <div className="flex">
        {model.days.map((d) => (
          <span
            key={d.date}
            className="flex-1 text-center text-[9px] font-medium tabular-nums text-theme-600 dark:text-theme-300"
          >
            {d.md}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---- item ranking: two columns of compact rows, per shop or aggregated ----

const PREVIEW_WIDTH = 186;
// Horizontal anchors. The widget shell (components/services/widget/container)
// wraps every widget in `overflow-hidden`, so a centred preview gets clipped for
// thumbnails near either edge — the hovered thumb picks the side that keeps the
// whole preview inside that clipping box.
const PREVIEW_ALIGN = {
  center: "left-1/2 -translate-x-1/2",
  left: "left-0",
  right: "right-0",
};
const PREVIEW_CLIP_SELECTOR = ".service-container";

// product thumbnail — same white-bg/contain treatment as the shop logos.
// Hovering pops a large preview (thumbnails alone are too small to identify a case).
// `preview` picks the vertical side it opens on so it stays inside the card.
function ItemThumb({ item, size, preview = "below" }) {
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState(false);
  const [align, setAlign] = useState("center");
  const anchorRef = useRef(null);
  useEffect(() => {
    setFailed(false);
    setHover(false);
  }, [item.imageUrl]);

  const openPreview = useCallback(() => {
    const anchor = anchorRef.current;
    const rect = anchor?.getBoundingClientRect();
    if (rect) {
      // measure against the element that actually clips us, not the viewport
      const clip = anchor.closest(PREVIEW_CLIP_SELECTOR)?.getBoundingClientRect();
      const min = clip ? clip.left : 0;
      const max = clip ? clip.right : window.innerWidth;
      const centre = rect.left + rect.width / 2;
      const half = PREVIEW_WIDTH / 2;
      const margin = 6;
      if (centre - half < min + margin) setAlign("left");
      else if (centre + half > max - margin) setAlign("right");
      else setAlign("center");
    }
    setHover(true);
  }, []);

  if (!item.imageUrl || failed) {
    return (
      <span
        aria-hidden="true"
        className="block shrink-0 rounded-[7px] bg-theme-300/40 dark:bg-white/10"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      ref={anchorRef}
      className="relative block shrink-0"
      style={{ width: size, height: size }}
      onMouseEnter={openPreview}
      onMouseLeave={() => setHover(false)}
    >
      <img
        src={item.imageUrl}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-full w-full rounded-[7px] bg-white object-contain"
      />
      {hover ? (
        <span
          // explicit width: an absolutely positioned box shrink-fits to the 40px
          // thumbnail otherwise, and the base `img{max-width:100%}` then squashes
          // the preview into a sliver. max-w-none defeats that rule as well.
          className={`pointer-events-none absolute z-30 block w-[186px] rounded-xl border border-theme-300/60 bg-white p-2 shadow-2xl dark:border-white/20 ${
            PREVIEW_ALIGN[align]
          } ${preview === "above" ? "bottom-full mb-2" : "top-full mt-2"}`}
        >
          <img
            src={item.imageUrl}
            alt=""
            loading="lazy"
            className="block h-[170px] w-[170px] max-w-none object-contain"
          />
        </span>
      ) : null}
    </span>
  );
}

// neutral chip — the accent red washed out against the dark card
function ShopBadge({ name }) {
  if (!name) return null;
  return (
    <span className="ml-1.5 inline-block shrink-0 rounded border border-theme-400/40 bg-theme-300/40 px-1.5 py-px align-[1px] text-[9.5px] font-bold text-theme-700 dark:border-white/15 dark:bg-white/10 dark:text-theme-100">
      {name}
    </span>
  );
}

// wraps in an <a> only when the API gave us an item URL
function ItemLink({ item, className, children }) {
  if (!item.url) return <div className={className}>{children}</div>;
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </a>
  );
}

// an Amazon item on a pending order can carry units before its amount: that
// amount reads as a dash, never ¥0
function yenText(value, t) {
  return value === null || value === undefined ? DASH : `¥${fmt(t, value)}`;
}

// the metric the board is ranked by leads; the other two trail as context
function primaryMetric(item, dim, t) {
  if (dim === "units") return `${fmt(t, item.unitsSold)}${t(`${NS}.unitsShort`)}`;
  if (dim === "orderCount") return `${fmt(t, item.orderCount)}${t(`${NS}.ordersUnit`)}`;
  return yenText(item.salesYen, t);
}

function secondaryMetrics(item, dim, t) {
  const sales = yenText(item.salesYen, t);
  const units = `${fmt(t, item.unitsSold)}${t(`${NS}.unitsShort`)}`;
  const orders = `${fmt(t, item.orderCount)}${t(`${NS}.ordersUnit`)}`;
  const price = item.avgPrice === null || item.avgPrice === undefined ? null : `@¥${fmt(t, item.avgPrice)}`;
  const parts =
    dim === "units" ? [sales, orders, price] : dim === "orderCount" ? [sales, units, price] : [units, orders, price];
  return parts.filter(Boolean);
}

// compact row — two columns of these on a wide container; the top three keep a
// warm rank number so the podium still reads without its own row of cards
function RankRow({ item, showShop, dim, t }) {
  return (
    <ItemLink
      item={item}
      className="flex items-center gap-3 border-b border-theme-300/30 py-2 transition-colors hover:bg-theme-200/40 dark:border-white/[0.07] dark:hover:bg-white/[0.05]"
    >
      <span
        className={`w-6 shrink-0 text-center text-base font-extrabold tabular-nums ${
          item.rank <= 3 ? "text-amber-600 dark:text-amber-300" : "text-theme-500 dark:text-theme-400"
        }`}
      >
        {item.rank}
      </span>
      <ItemThumb item={item} size={44} preview="above" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center">
          <span className="truncate text-sm font-semibold text-theme-900 dark:text-theme-50">{item.mno}</span>
          {showShop ? <ShopBadge name={item.shopName} /> : null}
        </span>
        <span className="text-xs tabular-nums text-theme-600 dark:text-theme-300">
          {secondaryMetrics(item, dim, t).join(" · ")}
        </span>
      </span>
      <span className={`shrink-0 text-base font-extrabold tabular-nums ${ACCENT_TEXT}`}>
        {primaryMetric(item, dim, t)}
      </span>
    </ItemLink>
  );
}

const DIM_LABEL = { orderCount: "sortOrders", sales: "sortSales", units: "sortUnits" };

// The metric comes from the daily check's switch. Six rows until opened; the
// shop chips only appear once the reader asks for more, and closing the board
// goes back to every shop.
function RankingSection({ ranking, dim, cardCls, t }) {
  const [shop, setShop] = useState("__all__");
  // index into RANKING_STEPS — progressive reveal (6 → 20 → 50 → 100)
  const [step, setStep] = useState(0);

  // a dimension can vanish across refreshes → fall back to the first available
  const activeDim = ranking.dims[dim] ? dim : ranking.available[0];
  const board = ranking.dims[activeDim];

  const open = step > 0;
  // Amazon boards carry a platform-qualified key, so a shop name shared across
  // platforms never picks the wrong board
  const keyOf = (s) => s.key ?? s.shopName;
  const active = open && shop !== "__all__" ? board.shops.find((s) => keyOf(s) === shop) : null;
  // a shop chip can outlive its data across refreshes → fall back to the overall board
  const selectedShop = active ? shop : "__all__";
  const isAll = selectedShop === "__all__";
  const items = isAll ? board.overall : (active?.items ?? []);
  const shown = items.slice(0, RANKING_STEPS[step]);
  // how many more the NEXT step would reveal (0 when this board has no more rows)
  const nextStep = step + 1 < RANKING_STEPS.length ? step + 1 : null;
  const nextCount = nextStep === null ? 0 : Math.min(RANKING_STEPS[nextStep], items.length) - shown.length;

  // a shop without the order API is on the list but adds no items
  const covered = board.updatedShopCount;
  const aggregated =
    covered !== null && covered < board.shopCount
      ? t(`${NS}.shopsAggregatedPartial`, { covered, total: board.shopCount })
      : t(`${NS}.shopsAggregated`, { count: board.shopCount });
  // with Amazon's shop boards on offer, the company board says it is 楽天's
  const rakutenPrefix = ranking.hasAmazon ? `${t(`${NS}.platformRakuten`)} · ` : "";
  const meta = isAll ? `${rakutenPrefix}${aggregated}` : t(`${NS}.itemsCount`, { count: active?.itemCount ?? 0 });

  const chip = (key, label) => (
    <button
      key={key}
      type="button"
      aria-pressed={selectedShop === key}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setShop(key);
      }}
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
        selectedShop === key
          ? "border-theme-700 bg-theme-700 text-white dark:border-theme-100 dark:bg-theme-100 dark:text-theme-900"
          : "border-theme-300/60 text-theme-600 hover:bg-theme-200/50 dark:border-theme-600/60 dark:text-theme-300 dark:hover:bg-theme-700/50"
      }`}
    >
      {label}
    </button>
  );

  const action =
    "rounded-lg border border-theme-300/60 px-4 py-1.5 text-xs font-semibold text-theme-600 transition-colors hover:bg-theme-200/50 dark:border-theme-600/60 dark:text-theme-300 dark:hover:bg-theme-700/50";

  return (
    <section className={`flex flex-col gap-3 p-5 ${cardCls}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-base font-extrabold text-theme-900 dark:text-theme-50">{t(`${NS}.bestSellers`)}</span>
        <span className="text-xs tabular-nums text-theme-600 dark:text-theme-300">
          {ranking.sourceDate} · {meta} · {t(`${NS}.rankedBy`, { metric: t(`${NS}.${DIM_LABEL[activeDim]}`) })}
        </span>
        {ranking.partial || board.failedShopCount > 0 ? (
          <span className="rounded border border-amber-400/40 bg-amber-500/10 px-1.5 py-px text-xs font-bold text-amber-600 dark:text-amber-300">
            {t(`${NS}.partialData`)}
          </span>
        ) : null}
        {open ? (
          <div className="ml-auto flex flex-wrap gap-1.5">
            {chip("__all__", `${rakutenPrefix ? `${t(`${NS}.platformRakuten`)} ` : ""}${t(`${NS}.allShops`)}`)}
            {board.shops.map((s) =>
              chip(keyOf(s), s.platform === "amazon" ? `${s.shopName}（${t(`${NS}.platformAmazon`)}）` : s.shopName),
            )}
          </div>
        ) : null}
      </div>

      {shown.length === 0 ? (
        <span className="py-4 text-center text-xs text-theme-500 dark:text-theme-400">{t(`${NS}.noData`)}</span>
      ) : (
        <div className="grid grid-cols-1 gap-x-8 @3xl:grid-cols-2">
          {shown.map((it) => (
            <RankRow key={`${it.rank}-${it.mno}`} item={it} showShop={isAll} dim={activeDim} t={t} />
          ))}
        </div>
      )}
      {nextCount > 0 || open ? (
        <div className="flex justify-center gap-2">
          {nextCount > 0 ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setStep(nextStep);
              }}
              className={action}
            >
              {t(`${NS}.showMore`, { count: nextCount })}
            </button>
          ) : null}
          {open ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setStep(0);
                setShop("__all__");
              }}
              className={action}
            >
              {t(`${NS}.showLessTop`, { count: RANKING_STEPS[0] })}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

// ---- all-time records (GET /api/history/peaks) ----

// Record cards read as a trophy case, so they carry their own warm accents
// rather than the daily-operations palette.
const PEAK_TONE = {
  sales: {
    card: "border-amber-300/40 bg-gradient-to-br from-amber-400/[0.13] to-[rgba(214,72,61,0.07)] dark:border-amber-300/35",
    label: "text-amber-700 dark:text-amber-300",
    value: "text-amber-800 dark:text-amber-200",
  },
  units: {
    card: "border-emerald-300/35 bg-gradient-to-br from-emerald-400/[0.13] to-[rgba(60,150,120,0.06)] dark:border-emerald-300/30",
    label: "text-emerald-700 dark:text-emerald-300",
    value: "text-emerald-800 dark:text-emerald-200",
  },
  orders: {
    card: "border-sky-300/35 bg-gradient-to-br from-sky-400/[0.13] to-[rgba(90,120,200,0.06)] dark:border-sky-300/30",
    label: "text-sky-700 dark:text-sky-300",
    value: "text-sky-800 dark:text-sky-200",
  },
};

// label + toggle text differ per record dimension
const PEAK_LABEL_KEY = { sales: "recordSales", units: "recordUnits", orders: "recordOrders" };
const PEAK_DIM_TOGGLE_KEY = { sales: "sortSales", units: "sortUnits", orders: "sortOrders" };

function peakValueText(dim, value, t) {
  if (dim === "orders") return `${fmt(t, value)}${t(`${NS}.ordersUnit`)}`;
  if (dim === "units") return `${fmt(t, value)}${t(`${NS}.unitsShort`)}`;
  return `¥${fmt(t, value)}`;
}

// company record + the stacked shop contribution for that single day
function RecordCard({ dim, record, shopColors, sinceYear, t }) {
  const tone = PEAK_TONE[dim] ?? PEAK_TONE.sales;
  return (
    <div className={`flex min-w-0 flex-col gap-1 rounded-xl border p-3 ${tone.card}`}>
      <span className={`text-[9.5px] font-extrabold uppercase tracking-[0.1em] ${tone.label}`}>
        {t(`${NS}.${PEAK_LABEL_KEY[dim] ?? "recordSales"}`)}
      </span>
      <span className={`text-[22px] font-extrabold leading-none tabular-nums ${tone.value}`}>
        {peakValueText(dim, record.value, t)}
      </span>
      <span className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-[11.5px] font-bold tabular-nums text-theme-800 dark:text-theme-50">
          {record.year}.{record.md}（{record.wd}）
        </span>
        {/* units were backfilled later than sales/orders — say so rather than
            implying this record spans the same years */}
        {sinceYear ? (
          <span className="text-[9px] font-medium tabular-nums text-theme-600 dark:text-theme-300">
            {t(`${NS}.unitsSince`, { year: sinceYear })}
          </span>
        ) : null}
      </span>
      {record.contributions.length ? (
        <span className="mt-1 flex h-[7px] overflow-hidden rounded-full bg-theme-300/40 dark:bg-white/10">
          {record.contributions.map((c) => (
            <span
              key={c.shopName}
              className="block h-full"
              style={{ width: `${c.pct}%`, backgroundColor: shopColors[c.shopName] ?? FALLBACK_SHOP_COLOR }}
              title={`${c.shopName} ${c.pct.toFixed(1)}%`}
            />
          ))}
        </span>
      ) : null}
    </div>
  );
}

function PeaksSection({ peaks, shopColors, cardCls, t }) {
  const [dim, setDim] = useState(DEFAULT_PEAK_DIM);
  // a dimension can disappear across refreshes → fall back to what is present
  const activeDim = peaks.shopBests[dim] ? dim : peaks.available.find((d) => peaks.shopBests[d]);
  const bests = activeDim ? peaks.shopBests[activeDim] : [];
  const hasRecordDay = bests.some((b) => b.onRecordDay);

  const dimChip = (key) => (
    <button
      key={key}
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDim(key);
      }}
      className={`rounded px-2 py-0.5 text-[10px] font-bold transition-colors ${
        activeDim === key
          ? "bg-theme-700 text-white dark:bg-theme-100 dark:text-theme-900"
          : "text-theme-600 hover:bg-theme-200/60 dark:text-theme-300 dark:hover:bg-theme-700/60"
      }`}
    >
      {t(`${NS}.${PEAK_DIM_TOGGLE_KEY[key] ?? "sortSales"}`)}
    </button>
  );

  return (
    <section className={`flex flex-col gap-2.5 p-4 ${cardCls}`}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="text-[12px] font-bold text-theme-700 dark:text-theme-200">{t(`${NS}.allTimeRecords`)}</span>
        <span className="text-[10px] font-semibold tabular-nums text-theme-700 dark:text-theme-200">
          {t(`${NS}.peaksCoverage`, { year: peaks.coverage.startYear, count: peaks.coverage.shopCount })}
        </span>
      </div>

      {/* the record cards leave a lot of horizontal room, so the shop chips share
          the row once there is space: 1 column on phones, records paired at @lg,
          all three side by side at @4xl. */}
      {/* three record cards share a row once there is width; the shop chips get
          their own full-width row so they never squeeze the records */}
      <div className="grid grid-cols-1 gap-2.5 @lg:grid-cols-3">
        {PEAK_DIMS.filter((d) => peaks.records[d]).map((d) => (
          <RecordCard
            key={d}
            dim={d}
            record={peaks.records[d]}
            shopColors={shopColors}
            sinceYear={
              d === "units" &&
              peaks.coverage.unitsStartYear &&
              peaks.coverage.unitsStartYear !== peaks.coverage.startYear
                ? peaks.coverage.unitsStartYear
                : null
            }
            t={t}
          />
        ))}

        {bests.length ? (
          <div className="flex min-w-0 flex-col gap-1.5 @lg:col-span-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[10.5px] font-bold tracking-wide text-theme-600 dark:text-theme-300">
                {t(`${NS}.shopBest`)}
              </span>
              {/* the chips double as the stacked bars' legend, so their colours match */}
              <div className="ml-auto flex shrink-0 gap-0.5 rounded-md border border-theme-300/60 bg-theme-100/50 p-0.5 dark:border-theme-600/60 dark:bg-theme-900/30">
                {peaks.available.filter((d) => peaks.shopBests[d]).map(dimChip)}
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {bests.map((b) => (
                <span
                  key={b.shopName}
                  className="inline-flex min-w-0 items-center gap-1 rounded-full border border-theme-300/70 bg-theme-100/60 px-1.5 py-0.5 text-[10px] tabular-nums dark:border-white/[0.18] dark:bg-white/[0.06]"
                >
                  <span
                    className="block h-[7px] w-[7px] shrink-0 rounded-sm"
                    style={{ backgroundColor: shopColors[b.shopName] ?? FALLBACK_SHOP_COLOR }}
                  />
                  <span className="truncate font-semibold text-theme-800 dark:text-theme-100">{b.shopName}</span>
                  {b.noRecord ? (
                    <span className="text-[9.5px] font-medium text-theme-500 dark:text-theme-400">
                      {t(`${NS}.noRecord`)}
                    </span>
                  ) : (
                    <>
                      <span className="font-bold text-theme-900 dark:text-theme-50">
                        {peakValueText(activeDim, b.value, t)}
                      </span>
                      <span className="hidden text-[9.5px] font-semibold text-theme-700 @md:inline dark:text-theme-200">
                        {b.year}.{b.md}
                      </span>
                      {b.onRecordDay ? (
                        <span className="text-[9px] leading-none text-amber-600 dark:text-amber-300">★</span>
                      ) : null}
                    </>
                  )}
                </span>
              ))}
            </div>
            {hasRecordDay ? (
              <span className="text-[9.5px] font-medium text-theme-600 dark:text-theme-300">
                <span className="text-amber-600 dark:text-amber-300">★</span> {t(`${NS}.recordDayMark`)}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

// ---- monthly rollup (今月 vs 先月) ----

// solid bar colours matching PEAK_TONE, readable on both the light and dark track
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

// one shop's last 7 days: total, a mini chart, orders · units · CVR
function ShopTrendCard({ row: r, mode, t }) {
  return (
    <div className="relative flex min-w-0 flex-col rounded-xl border border-theme-300/30 bg-theme-100/60 p-2.5 dark:border-white/[0.06] dark:bg-white/[0.03]">
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
          <span className="text-[15px] font-bold leading-none tabular-nums text-theme-900 dark:text-theme-50">
            {man(r.h7Total)}
          </span>
          <span className="text-[9px] font-medium text-theme-600 dark:text-theme-300">{t(`${NS}.manUnit`)}</span>
        </span>
        <ShopMiniChart points={r.daily} mode={mode} cvr={r.cvr} t={t} />
        <span className="border-t border-theme-300/30 pt-1.5 text-[9px] font-medium tabular-nums text-theme-600 dark:border-white/10 dark:text-theme-300">
          {fmt(t, r.h7Orders)}
          {t(`${NS}.ordersUnit`)} · {fmt(t, r.h7Units)}
          {t(`${NS}.unitsShort`)} · CVR {r.cvr.toFixed(2)}%
        </span>
      </div>
    </div>
  );
}

const ANALYSIS_OPEN_KEY = "uorakutensales.analysisOpen";
const DAILY_ID = "uorakutensales-daily";
const ANALYSIS_ID = "uorakutensales-analysis";

// A remembered fold is a per-viewer convenience: storage can be missing or
// blocked, and the module then simply starts open.
function readAnalysisOpen() {
  try {
    return window.localStorage.getItem(ANALYSIS_OPEN_KEY) !== "false";
  } catch {
    return true;
  }
}

function writeAnalysisOpen(open) {
  try {
    window.localStorage.setItem(ANALYSIS_OPEN_KEY, String(open));
  } catch {
    // the fold just won't be remembered
  }
}

// The tabs live in the URL hash, so moving between the modules scrolls
// instead of following a #link that would switch the tab.
function JumpButton({ target, index, label, t }) {
  return (
    <button
      type="button"
      aria-label={`${t(`${NS}.jumpTo`)} ${label}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        document.getElementById(target)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      }}
      className="inline-flex items-center gap-1.5 rounded-full border border-theme-300/60 px-2.5 py-1 text-xs font-bold text-theme-700 transition-colors hover:bg-theme-200/50 dark:border-theme-600/60 dark:text-theme-200 dark:hover:bg-theme-700/50"
    >
      <span aria-hidden="true" className="tabular-nums text-theme-500 dark:text-theme-400">
        {index}
      </span>
      <span aria-hidden="true">{label}</span>
    </button>
  );
}

function ModuleHeader({ id, index, title, note, badge, children }) {
  return (
    <div id={id} className="flex scroll-mt-4 flex-wrap items-center gap-x-3 gap-y-2 px-0.5 pt-3">
      <span
        aria-hidden="true"
        className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-extrabold text-white ${badge}`}
      >
        {index}
      </span>
      <h2 className="text-lg font-extrabold text-theme-900 dark:text-theme-50">{title}</h2>
      <span className="text-xs text-theme-600 dark:text-theme-300">{note}</span>
      <span aria-hidden="true" className="h-px min-w-[24px] flex-1 bg-theme-300/60 dark:bg-white/10" />
      {children}
    </div>
  );
}

export default function Component({ service }) {
  const { t } = useTranslation();
  const { widget } = service;
  const refreshInterval = Math.max(1000, Number(widget.refreshInterval) || DEFAULT_REFRESH_INTERVAL);
  const [chartMode, setChartMode] = useState("line");
  // the daily check's metric: today, the month, the shop table and the best sellers — 件数 first
  const [metric, setMetric] = useState("orders");
  // read after mount so the server render and the first client render agree
  const [analysisOpen, setAnalysisOpen] = useState(true);
  useEffect(() => {
    setAnalysisOpen(readAnalysisOpen());
  }, []);

  const { data: sales, error: salesError, mutate: mutateSales } = useWidgetAPI(widget, "sales", { refreshInterval });
  // uo-ec-manager owns the refresh schedule; each board just re-reads its own
  // snapshot on the single configured interval.
  const { data: history, mutate: mutateHistory } = useWidgetAPI(widget, "history", { refreshInterval });
  const { data: logos } = useWidgetAPI(widget, "logos", { refreshInterval });
  const { data: rankingData, mutate: mutateRanking } = useWidgetAPI(widget, "ranking", { refreshInterval });
  const { data: devicesData, mutate: mutateDevices } = useWidgetAPI(widget, "devices", { refreshInterval });
  const { data: monthlyData, mutate: mutateMonthly } = useWidgetAPI(widget, "monthly", { refreshInterval });
  // the device month boards are read in the same round as the monthly sales
  const { data: devicesMonthlyData, mutate: mutateDevicesMonthly } = useWidgetAPI(widget, "devicesMonthly", {
    refreshInterval,
  });
  const { data: peaksData } = useWidgetAPI(widget, "peaks", { refreshInterval });
  // yesterday's visits and the new / repeat mix — a morning snapshot
  const { data: performanceData, mutate: mutatePerformance } = useWidgetAPI(widget, "performance", {
    refreshInterval,
  });
  // Amazon's shops, read on the same interval; an older server answers 404,
  // which simply leaves the board 楽天-only
  const { data: amazonSalesData, mutate: mutateAmazonSales } = useWidgetAPI(widget, "amazonSales", {
    refreshInterval,
  });
  const { data: amazonHistoryData, mutate: mutateAmazonHistory } = useWidgetAPI(widget, "amazonHistory", {
    refreshInterval,
  });
  const { data: amazonRankingData, mutate: mutateAmazonRanking } = useWidgetAPI(widget, "amazonRanking", {
    refreshInterval,
  });
  // the market reference changes once a day: never read it more than hourly
  const { data: marketData, mutate: mutateMarket } = useWidgetAPI(widget, "market", {
    refreshInterval: Math.max(refreshInterval, MARKET_REFRESH_INTERVAL),
  });
  // the market model whose 根拠 is open; its evidence is read only while it is
  const [evidenceModel, setEvidenceModel] = useState(null);
  const { data: evidenceData } = useWidgetAPI(widget, evidenceModel ? "marketEvidence" : "", {
    model: evidenceModel,
  });
  // the board row whose 内訳 is open, with the scope its products are read in
  const [deviceEvidenceQuery, setDeviceEvidenceQuery] = useState(null);
  const { key: deviceEvidenceKey = null, ...deviceEvidenceSearch } = deviceEvidenceQuery ?? {};
  const { data: deviceEvidenceData } = useWidgetAPI(
    widget,
    deviceEvidenceQuery ? "devicesEvidence" : "",
    deviceEvidenceSearch,
  );

  const freshness = useFreshness(sales?.sourceUpdatedAtJST || sales?.generatedAtJST, refreshInterval);
  const model = useMemo(() => buildModel(sales, history, logos), [sales, history, logos]);
  const amazon = useMemo(() => buildAmazon(amazonSalesData, amazonHistoryData), [amazonSalesData, amazonHistoryData]);
  const ranking = useMemo(
    () => buildRanking(rankingData, buildAmazonBoards(amazonRankingData)),
    [rankingData, amazonRankingData],
  );
  const peaks = useMemo(() => buildPeaks(peaksData), [peaksData]);
  const devices = useMemo(() => buildDeviceSales(devicesData, devicesMonthlyData), [devicesData, devicesMonthlyData]);
  const market = useMemo(() => buildMarketReference(marketData), [marketData]);
  const evidence = useMemo(
    () => (evidenceModel ? { model: evidenceModel, ...buildMarketEvidence(evidenceData) } : null),
    [evidenceModel, evidenceData],
  );
  const deviceEvidence = useMemo(
    () => (deviceEvidenceKey ? { key: deviceEvidenceKey, ...buildDeviceEvidence(deviceEvidenceData) } : null),
    [deviceEvidenceKey, deviceEvidenceData],
  );
  // the month total still carries today, so the realtime snapshot is what lets
  // the completed-day pace be measured without a half-run day in it
  const monthly = useMemo(() => buildMonthly(monthlyData, sales), [monthlyData, sales]);
  // an older server answers 404, relayed as { error }: that is no snapshot, not an empty one
  const performance = useMemo(
    () => (performanceData && !performanceData.error ? buildPerformanceModel(performanceData, logos) : null),
    [performanceData, logos],
  );
  const table = useMemo(
    () => (model ? buildShopTable({ model, monthly, performance, amazon }) : null),
    [model, monthly, performance, amazon],
  );
  const todayView = useMemo(() => (model ? buildTodayView(model, amazon) : null), [model, amazon]);
  const monthView = useMemo(() => buildMonthView(monthly, amazon), [monthly, amazon]);
  // shop logos sit beside the names in both shop tables
  const logoByName = useMemo(
    () => new Map((logos?.shops || []).map((shop) => [shop.shopName, shop.logoUrl || null])),
    [logos],
  );
  // one palette for the whole widget, built from every shop either board draws —
  // assigning per board would let the two disagree when their shop sets differ
  const shopColors = useMemo(
    () =>
      buildShopColors([
        ...(model?.rows || []).map((r) => r.name),
        ...(monthly?.shopNames || []),
        ...(peaks?.shopNames || []),
        ...(amazon?.shops || []).map((s) => s.name),
      ]),
    [model, monthly, peaks, amazon],
  );

  const handleRefresh = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      mutateSales();
      mutateHistory();
      mutateRanking();
      mutateDevices();
      mutateMonthly();
      mutateDevicesMonthly();
      mutateMarket();
      mutatePerformance();
      mutateAmazonSales();
      mutateAmazonHistory();
      mutateAmazonRanking();
    },
    [
      mutateSales,
      mutateHistory,
      mutateRanking,
      mutateDevices,
      mutateMonthly,
      mutateDevicesMonthly,
      mutateMarket,
      mutatePerformance,
      mutateAmazonSales,
      mutateAmazonHistory,
      mutateAmazonRanking,
    ],
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
  const activeNames = new Set(table.rows.map((r) => r.name));
  const idleNames = table.idle.map((r) => r.name).join("・");
  const hasSide = Boolean(monthView) || (performance && performance.visit !== null);
  // a shop on the list whose today and month are both unknown is not counted as 稼働
  const activeCount = table.rows.filter((r) => !r.unknown).length;
  const amazonCount = amazon?.shops.length ?? 0;
  const missing = [...model.missing, ...(amazon?.company.missing ?? [])];
  // with Amazon beside it, 楽天-only figures say whose they are
  const rakutenScope = amazon ? t(`${NS}.platformRakuten`) : "";
  const notes = historyNotes(model.week, t);
  const periods = {
    colToday: model.time ? t(`${NS}.asOf`, { time: model.time }) : "",
    colWeek: model.week?.label ?? "",
    colMonth: monthly
      ? `${t(`${NS}.monthCompleted`, { count: monthly.current.completedDays })}${
          monthly.current.hasLiveDay ? `＋${t(`${NS}.todayLabel`)}` : ""
        }`
      : "",
    colVisits: performance
      ? `${visitDayLabel(performance.dataDateJST)}${visitsStale(performance) ? ` · ${t(`${NS}.visitsStale`)}` : ""}`
      : "",
  };
  const toggleAnalysis = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !analysisOpen;
    setAnalysisOpen(next);
    writeAnalysisOpen(next);
  };

  return (
    <Container service={service}>
      <SparkDefs />
      <div className="@container flex w-full min-w-0 flex-col gap-3 p-1.5">
        {/* header — the service card above already names the widget */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="text-xs font-semibold text-theme-600 dark:text-theme-300">
              {t(`${NS}.subtitle`, { count: model.rows.length + amazonCount })}
              {amazon
                ? `（${t(`${NS}.platformSplit`, { rakuten: model.rows.length, amazon: amazonCount })}）`
                : ""} · {t(`${NS}.activeShops`, { count: activeCount })}
              {missing.length ? (
                <span className="text-amber-700 dark:text-amber-300">
                  {" "}
                  · {t(`${NS}.notFetched`, { names: missing.join("・") })}
                </span>
              ) : null}
            </span>
            <JumpButton target={DAILY_ID} index="1" label={t(`${NS}.dailyCheck`)} t={t} />
            <JumpButton target={ANALYSIS_ID} index="2" label={t(`${NS}.analysis`)} t={t} />
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <span className="flex flex-col items-end leading-tight">
              <span className="text-[9px] font-bold tracking-[0.14em] text-theme-600 dark:text-theme-300">
                {t(`${NS}.updatedAt`)}
              </span>
              <span className="text-[12px] font-semibold tabular-nums text-theme-800 dark:text-theme-100">
                {model.updatedAtJST || "-"}
              </span>
            </span>
            <FreshnessPill freshness={freshness} t={t} />
            <RefreshButton onRefresh={handleRefresh} t={t} />
          </div>
        </div>

        {/* 1 毎日のチェック — one basis, one metric switch */}
        <ModuleHeader
          id={DAILY_ID}
          index="1"
          title={t(`${NS}.dailyCheck`)}
          note={t(`${NS}.dailyCheckNote`)}
          badge="bg-[#D9584C]"
        >
          <MetricSwitch metric={metric} onChange={setMetric} t={t} />
        </ModuleHeader>
        <div className={`grid grid-cols-1 gap-3 ${hasSide ? "@5xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]" : ""}`}>
          <TodayCard view={todayView} metric={metric} shopColors={shopColors} cardCls={cardCls} t={t} />
          {hasSide ? (
            <div className="flex min-w-0 flex-col gap-3">
              <MonthCard monthly={monthView} metric={metric} cardCls={cardCls} t={t} />
              <VisitCard performance={performance} scope={rakutenScope} cardCls={cardCls} t={t} />
            </div>
          ) : null}
        </div>
        <ShopTable
          table={table}
          metric={metric}
          shopColors={shopColors}
          logoByName={logoByName}
          periods={periods}
          notes={notes}
          cardCls={cardCls}
          t={t}
        />
        {ranking ? (
          <RankingSection ranking={ranking} dim={RANKING_DIM_BY_METRIC[metric]} cardCls={cardCls} t={t} />
        ) : null}

        {/* 2 分析・深掘り — figures that need not be read every day */}
        <ModuleHeader
          id={ANALYSIS_ID}
          index="2"
          title={t(`${NS}.analysis`)}
          note={t(`${NS}.analysisNote`)}
          badge="bg-[#5F7FAF]"
        >
          <button
            type="button"
            aria-expanded={analysisOpen}
            onClick={toggleAnalysis}
            className="inline-flex items-center gap-1.5 rounded-lg border border-theme-300/60 px-3 py-1 text-xs font-bold text-theme-700 transition-colors hover:bg-theme-200/50 dark:border-theme-600/60 dark:text-theme-200 dark:hover:bg-theme-700/50"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className={analysisOpen ? "rotate-180" : ""}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
            {analysisOpen ? t(`${NS}.collapse`) : t(`${NS}.expand`)}
          </button>
        </ModuleHeader>

        {analysisOpen ? (
          <>
            {/* device-model boards: today, this month and last month in one place */}
            {devices ? (
              <DeviceSalesSection
                devices={devices}
                market={market}
                evidence={evidence}
                onEvidence={setEvidenceModel}
                deviceEvidence={deviceEvidence}
                onDeviceEvidence={setDeviceEvidenceQuery}
                shopColors={shopColors}
                cardCls={cardCls}
                t={t}
              />
            ) : null}

            {model.hasHistory && model.days.length ? (
              <section className={`grid grid-cols-1 gap-x-5 gap-y-4 p-4 @4xl:grid-cols-[300px_1fr] ${cardCls}`}>
                <div className="min-w-0 @4xl:border-r @4xl:border-theme-300/30 dark:@4xl:border-white/10 @4xl:pr-5">
                  <DailyChart model={model} mode={chartMode} onModeChange={setChartMode} t={t} />
                </div>
                <div className="flex min-w-0 flex-col gap-2.5">
                  <span className="min-w-0 text-xs font-bold tracking-wide text-theme-600 dark:text-theme-300">
                    {rakutenScope ? `${rakutenScope} ` : ""}
                    {t(`${NS}.shopTrend`)}{" "}
                    <span className="font-medium text-theme-500 dark:text-theme-400">
                      · {t(`${NS}.excludesToday`)} · {t(`${NS}.afterCoupon`)}
                      {idleNames ? ` · ${t(`${NS}.idleLeftOut`, { names: idleNames })}` : ""}
                    </span>
                  </span>
                  {notes.map((note) => (
                    <span key={note} role="note" className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                      {note}
                    </span>
                  ))}
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(104px,1fr))] gap-2.5">
                    {model.rows
                      .filter((r) => activeNames.has(r.name))
                      .map((r) => (
                        <ShopTrendCard key={r.name} row={r} mode={chartMode} t={t} />
                      ))}
                  </div>
                </div>
              </section>
            ) : null}

            {performance ? (
              <div className="grid grid-cols-1 gap-3 @5xl:grid-cols-2">
                <CustomerMixCard performance={performance} cardCls={cardCls} t={t} />
                <ShopVisitsTable
                  performance={performance}
                  names={table.rows.map((r) => r.name)}
                  shopColors={shopColors}
                  logoByName={logoByName}
                  cardCls={cardCls}
                  t={t}
                />
              </div>
            ) : null}

            {peaks ? <PeaksSection peaks={peaks} shopColors={shopColors} cardCls={cardCls} t={t} /> : null}
          </>
        ) : null}
      </div>
    </Container>
  );
}
