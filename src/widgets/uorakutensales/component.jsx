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
 *   "peaks"   → GET /api/history/peaks  all-time record boards
 *   "logos"   → GET /api/shops/logos    shop logo urls
 *
 * Realtime has NO conversionRate → per-row CVR comes from the 7-day history.
 * Freshness pill (LIVE / 遅延 / 停止) is derived from sales.generatedAtJST.
 * Pure view-model + geometry helpers live in ./sales-model.mjs.
 */
import Container from "components/services/widget/container";
import { useTranslation } from "next-i18next/pages";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ACCENT,
  buildModel,
  buildMonthly,
  buildPeaks,
  buildRanking,
  buildShopColors,
  computeFreshness,
  DEFAULT_MONTH_DIM,
  DEFAULT_PEAK_DIM,
  DEFAULT_RANKING_DIM,
  DEFAULT_REFRESH_INTERVAL,
  FALLBACK_SHOP_COLOR,
  man,
  MONTH_DIMS,
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

      {/* daily-average line */}
      <span className="pointer-events-none absolute inset-x-0 z-[2] border-t border-dashed" style={{ top: `${avgTopPct}%`, borderColor: "rgba(198,54,43,.55)" }} />

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
  const tipTx = hover === 0 ? "0%" : hover === model.nDays - 1 ? "-100%" : "-50%";
  const avgTopPct = ((5 + (1 - model.avg / model.maxDaily) * 30) / 40) * 100;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[10.5px] font-bold tracking-wide text-theme-600 dark:text-theme-300">
          {t(`${NS}.dailyTrend`)} <span className="text-[9px] font-medium text-theme-500 dark:text-theme-400">· {t(`${NS}.excludesToday`)}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-[9.5px] font-medium text-theme-600 dark:text-theme-300">
            <span className="mr-1 inline-block w-3 border-t-[1.5px] border-dashed align-middle" style={{ borderColor: ACCENT }} />
            {t(`${NS}.avgLabel`)}
          </span>
          {/* drives both this chart and the per-shop mini charts */}
          <ChartModeToggle mode={mode} onChange={onModeChange} t={t} />
        </span>
      </div>
      <div className="relative h-[112px]">
        <div className="pointer-events-none absolute inset-x-0 z-[3] border-t-[1.5px] border-dashed" style={{ top: `${avgTopPct}%`, borderColor: "rgba(198,54,43,.7)" }} />
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
        )}

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
              className={`pointer-events-none absolute z-[7] h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ${
                mode === "bar" ? "hidden" : ""
              }`}
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
          <span key={d.date} className="flex-1 text-center text-[9px] font-medium tabular-nums text-theme-600 dark:text-theme-300">
            {d.md}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---- item ranking: podium (top 3) + list, per shop or aggregated ----

// gold / silver / bronze get genuinely different weight, not just a number
const MEDAL = {
  1: {
    card: "border-amber-300/45 bg-gradient-to-br from-amber-400/[0.16] to-[rgba(214,72,61,0.10)] dark:border-amber-300/40",
    crown: "text-[19px] text-amber-500 dark:text-amber-300",
    amount: "text-[20px] text-amber-700 dark:text-amber-200",
    mno: "text-[12px]",
    img: 76,
  },
  2: {
    card: "border-slate-400/35 bg-slate-400/[0.10] dark:border-slate-300/30 dark:bg-slate-300/[0.09]",
    crown: "text-[16px] text-slate-500 dark:text-slate-300",
    amount: "text-[17px] text-slate-700 dark:text-slate-200",
    mno: "text-[11.5px]",
    img: 62,
  },
  3: {
    card: "border-orange-700/35 bg-orange-700/[0.10] dark:border-orange-400/30 dark:bg-orange-400/[0.09]",
    crown: "text-[16px] text-orange-700 dark:text-orange-300",
    amount: "text-[17px] text-orange-800 dark:text-orange-200",
    mno: "text-[11.5px]",
    img: 62,
  },
};

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
    return <span aria-hidden="true" className="block shrink-0 rounded-[7px] bg-theme-300/40 dark:bg-white/10" style={{ width: size, height: size }} />;
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
          <img src={item.imageUrl} alt="" loading="lazy" className="block h-[170px] w-[170px] max-w-none object-contain" />
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
    <a href={item.url} target="_blank" rel="noopener noreferrer" className={className} onClick={(e) => e.stopPropagation()}>
      {children}
    </a>
  );
}

// the metric the board is ranked by leads; the other two trail as context
function primaryMetric(item, dim, t) {
  if (dim === "units") return `${fmt(t, item.unitsSold)}${t(`${NS}.unitsShort`)}`;
  if (dim === "orderCount") return `${fmt(t, item.orderCount)}${t(`${NS}.ordersUnit`)}`;
  return `¥${fmt(t, item.salesYen)}`;
}

function secondaryMetrics(item, dim, t) {
  const sales = `¥${fmt(t, item.salesYen)}`;
  const units = `${fmt(t, item.unitsSold)}${t(`${NS}.unitsShort`)}`;
  const orders = `${fmt(t, item.orderCount)}${t(`${NS}.ordersUnit`)}`;
  const price = `@¥${fmt(t, item.avgPrice)}`;
  if (dim === "units") return [sales, orders, price];
  if (dim === "orderCount") return [sales, units, price];
  return [units, orders, price];
}

function PodiumCard({ item, showShop, dim, t }) {
  const m = MEDAL[item.rank] ?? MEDAL[3];
  return (
    <ItemLink
      item={item}
      className={`relative flex min-w-0 items-center gap-3 rounded-xl border p-3 transition-colors hover:brightness-110 ${m.card}`}
    >
      <span className={`absolute right-2.5 top-2 font-extrabold leading-none tabular-nums ${m.crown}`}>{item.rank}</span>
      <ItemThumb item={item} size={m.img} preview="below" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={`flex min-w-0 items-center pr-4 font-bold ${m.mno}`}>
          <span className="truncate text-theme-900 dark:text-theme-50">{item.mno}</span>
          {showShop ? <ShopBadge name={item.shopName} /> : null}
        </span>
        <span className={`font-extrabold leading-none tabular-nums ${m.amount}`}>{primaryMetric(item, dim, t)}</span>
        <span className="text-[9.5px] font-medium tabular-nums text-theme-600 dark:text-theme-300">
          {secondaryMetrics(item, dim, t).join(" · ")}
        </span>
      </span>
    </ItemLink>
  );
}

// compact card — two of these sit side by side on a wide container
function RankRow({ item, showShop, dim, t }) {
  return (
    <ItemLink
      item={item}
      className="flex items-center gap-2.5 rounded-lg border border-theme-300/25 bg-theme-100/40 p-1.5 transition-colors hover:bg-theme-200/50 dark:border-white/[0.06] dark:bg-white/[0.02] dark:hover:bg-white/[0.06]"
    >
      <span className="w-[18px] shrink-0 text-center text-[11.5px] font-extrabold tabular-nums text-theme-500 dark:text-theme-400">{item.rank}</span>
      <ItemThumb item={item} size={40} preview="above" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center">
          <span className="truncate text-[11.5px] font-semibold text-theme-900 dark:text-theme-50">{item.mno}</span>
          {showShop ? <ShopBadge name={item.shopName} /> : null}
        </span>
        <span className="text-[9.5px] font-medium tabular-nums text-theme-600 dark:text-theme-300">
          {secondaryMetrics(item, dim, t).join(" · ")}
        </span>
      </span>
      <span className={`shrink-0 text-[12.5px] font-bold tabular-nums ${ACCENT_TEXT}`}>{primaryMetric(item, dim, t)}</span>
    </ItemLink>
  );
}

const DIM_LABEL = { orderCount: "sortOrders", sales: "sortSales", units: "sortUnits" };

function RankingSection({ ranking, cardCls, t }) {
  const [dim, setDim] = useState(DEFAULT_RANKING_DIM);
  const [shop, setShop] = useState("__all__");
  // index into RANKING_STEPS — progressive reveal (11 → 20 → 50 → 100)
  const [step, setStep] = useState(0);

  // a dimension can vanish across refreshes → fall back to the first available
  const activeDim = ranking.dims[dim] ? dim : ranking.available[0];
  const board = ranking.dims[activeDim];

  const active = shop === "__all__" ? null : board.shops.find((s) => s.shopName === shop);
  // a shop chip can outlive its data across refreshes → fall back to the overall board
  const selectedShop = active ? shop : "__all__";
  const isAll = selectedShop === "__all__";
  const items = isAll ? board.overall : active?.items ?? [];
  const shown = items.slice(0, RANKING_STEPS[step]);
  // how many more the NEXT step would reveal (0 when this board has no more rows)
  const nextStep = step + 1 < RANKING_STEPS.length ? step + 1 : null;
  const nextCount = nextStep === null ? 0 : Math.min(RANKING_STEPS[nextStep], items.length) - shown.length;

  const meta = isAll
    ? t(`${NS}.shopsAggregated`, { count: board.shopCount })
    : t(`${NS}.itemsCount`, { count: active?.itemCount ?? 0 });

  const dimChip = (key) => (
    <button
      key={key}
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDim(key);
        setStep(0);
      }}
      className={`rounded px-2 py-0.5 text-[10px] font-bold transition-colors ${
        activeDim === key
          ? "bg-theme-700 text-white dark:bg-theme-100 dark:text-theme-900"
          : "text-theme-600 hover:bg-theme-200/60 dark:text-theme-300 dark:hover:bg-theme-700/60"
      }`}
    >
      {t(`${NS}.${DIM_LABEL[key]}`)}
    </button>
  );

  const chip = (key, label) => (
    <button
      key={key}
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setShop(key);
        setStep(0);
      }}
      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
        selectedShop === key
          ? "border-theme-700 bg-theme-700 text-white dark:border-theme-100 dark:bg-theme-100 dark:text-theme-900"
          : "border-theme-300/60 text-theme-600 hover:bg-theme-200/50 dark:border-theme-600/60 dark:text-theme-300 dark:hover:bg-theme-700/50"
      }`}
    >
      {label}
    </button>
  );

  return (
    <section className={`flex flex-col gap-3 p-4 ${cardCls}`}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span className="text-[12px] font-bold text-theme-700 dark:text-theme-200">{t(`${NS}.bestSellers`)}</span>
        <span className="text-[10px] font-medium tabular-nums text-theme-600 dark:text-theme-300">
          {ranking.sourceDate} · {meta}
        </span>
        {ranking.partial || board.failedShopCount > 0 ? (
          <span className="rounded border border-amber-400/40 bg-amber-500/10 px-1.5 py-px text-[9px] font-bold text-amber-600 dark:text-amber-300">
            {t(`${NS}.partialData`)}
          </span>
        ) : null}
        {/* which metric the board is ranked by */}
        <div className="flex shrink-0 gap-0.5 rounded-md border border-theme-300/60 bg-theme-100/50 p-0.5 dark:border-theme-600/60 dark:bg-theme-900/30">
          {ranking.available.map(dimChip)}
        </div>
        <div className="ml-auto flex flex-wrap gap-1">
          {chip("__all__", t(`${NS}.allShops`))}
          {board.shops.map((s) => chip(s.shopName, s.shopName))}
        </div>
      </div>

      {shown.length === 0 ? (
        <span className="py-4 text-center text-[11px] text-theme-500 dark:text-theme-400">{t(`${NS}.noData`)}</span>
      ) : (
        <>
          <div className="grid grid-cols-1 items-end gap-2 @lg:grid-cols-[1.25fr_1fr_1fr]">
            {shown.slice(0, 3).map((it) => (
              <PodiumCard key={`${it.rank}-${it.mno}`} item={it} showShop={isAll} dim={activeDim} t={t} />
            ))}
          </div>
          {shown.length > 3 ? (
            <div className="grid grid-cols-1 gap-1.5 @2xl:grid-cols-2 @2xl:gap-x-3">
              {shown.slice(3).map((it) => (
                <RankRow key={`${it.rank}-${it.mno}`} item={it} showShop={isAll} dim={activeDim} t={t} />
              ))}
            </div>
          ) : null}
          {nextCount > 0 || step > 0 ? (
            <div className="flex gap-2">
              {nextCount > 0 ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setStep(nextStep);
                  }}
                  className="flex-1 rounded-lg border border-theme-300/60 py-1.5 text-[11px] font-semibold text-theme-600 transition-colors hover:bg-theme-200/50 dark:border-theme-600/60 dark:text-theme-300 dark:hover:bg-theme-700/50"
                >
                  {t(`${NS}.showMore`, { count: nextCount })}
                </button>
              ) : null}
              {step > 0 ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setStep(0);
                  }}
                  className="rounded-lg border border-theme-300/60 px-3 py-1.5 text-[11px] font-semibold text-theme-600 transition-colors hover:bg-theme-200/50 dark:border-theme-600/60 dark:text-theme-300 dark:hover:bg-theme-700/50"
                >
                  {t(`${NS}.showLess`)}
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
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
              d === "units" && peaks.coverage.unitsStartYear && peaks.coverage.unitsStartYear !== peaks.coverage.startYear
                ? peaks.coverage.unitsStartYear
                : null
            }
            t={t}
          />
        ))}

        {bests.length ? (
          <div className="flex min-w-0 flex-col gap-1.5 @lg:col-span-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[10.5px] font-bold tracking-wide text-theme-600 dark:text-theme-300">{t(`${NS}.shopBest`)}</span>
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
                  <span className="block h-[7px] w-[7px] shrink-0 rounded-sm" style={{ backgroundColor: shopColors[b.shopName] ?? FALLBACK_SHOP_COLOR }} />
                  <span className="truncate font-semibold text-theme-800 dark:text-theme-100">{b.shopName}</span>
                  {b.noRecord ? (
                    <span className="text-[9.5px] font-medium text-theme-500 dark:text-theme-400">{t(`${NS}.noRecord`)}</span>
                  ) : (
                    <>
                      <span className="font-bold text-theme-900 dark:text-theme-50">{peakValueText(activeDim, b.value, t)}</span>
                      <span className="hidden text-[9.5px] font-semibold text-theme-700 @md:inline dark:text-theme-200">
                        {b.year}.{b.md}
                      </span>
                      {b.onRecordDay ? <span className="text-[9px] leading-none text-amber-600 dark:text-amber-300">★</span> : null}
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
const MONTH_BAR = { sales: "#D97706", units: "#059669", orders: "#0284C7" };

function monthValueText(dim, value, t) {
  // 万 already carries one decimal; counts are whole things, so a derived
  // daily average like 759.33 rounds before it reaches the reader
  if (dim === "sales") return `¥${man(value)}${t(`${NS}.manUnit`)}`;
  return peakValueText(dim, Math.round(value), t);
}

// signed percentage — ahead of last month's pace reads green, behind reads rose
function Delta({ value, className = "" }) {
  if (value == null) return <span className={`tabular-nums text-theme-500 dark:text-theme-400 ${className}`}>—</span>;
  const up = value >= 0;
  return (
    <span className={`tabular-nums ${up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"} ${className}`}>
      {up ? "+" : "−"}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

// A bullet: the fill is how much of last month this month has already matched,
// the tick is how far the finished days carry us into the month. Fill reaching
// past the tick is exactly what "ahead of last month's pace" means, so the
// comparison is readable without doing any arithmetic.
function PaceBar({ fillPct, markerPct, color, height = 8 }) {
  const fill = Math.max(0, Math.min(100, fillPct ?? 0));
  const marker = Math.max(0, Math.min(100, markerPct ?? 0));
  return (
    <span className="relative block w-full overflow-hidden rounded-full bg-theme-300/45 dark:bg-white/10" style={{ height }}>
      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${fill}%`, backgroundColor: color }} />
      <span
        className="absolute inset-y-0 w-[2px] rounded-full bg-theme-800/70 dark:bg-white/85"
        style={{ left: `calc(${marker}% - 1px)` }}
      />
    </span>
  );
}

// The two metrics the toggle is NOT showing. Sales, orders and units are all
// headline figures; leaving two of the three behind a control the reader may
// never notice hides most of the board's data.
function OtherMetrics({ metrics, dim, field, className = "", t }) {
  const others = MONTH_DIMS.filter((d) => d !== dim && metrics[d] && metrics[d][field] != null);
  if (!others.length) return null;
  return (
    <span className={`tabular-nums ${className}`}>
      {others.map((d, i) => (
        <span key={d}>
          {i > 0 ? " · " : ""}
          {monthValueText(d, metrics[d][field], t)}
        </span>
      ))}
    </span>
  );
}

function MonthShopRow({ shop, dim, markerPct, logoUrl, color, t }) {
  const m = shop.metrics[dim];
  // quiet on both sides is dormant, not a −100% collapse
  const dormant = !shop.hasCurrent && !shop.hasPrevious;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-1 @md:grid-cols-[minmax(0,116px)_auto_minmax(56px,1fr)_auto]">
      <span className="col-start-1 row-start-1 flex min-w-0 items-center gap-1.5">
        <ShopLogo name={shop.name} url={logoUrl} size={14} />
        <span className="truncate text-[11px] font-semibold text-theme-800 dark:text-theme-100">{shop.name}</span>
      </span>

      {dormant ? (
        <span className="col-start-2 row-start-1 shrink-0 text-[9.5px] font-medium text-theme-500 @md:col-span-3 dark:text-theme-400">
          {t(`${NS}.noActivity`)}
        </span>
      ) : (
        <>
          <span className="col-start-2 row-start-1 shrink-0 text-right text-[11.5px] font-bold tabular-nums text-theme-900 dark:text-theme-50">
            {monthValueText(dim, m.current, t)}
          </span>
          <span className="col-span-3 row-start-2 @md:col-span-1 @md:col-start-3 @md:row-start-1">
            {/* a bar with no baseline would read as "sold nothing" rather than
                "nothing to compare against" — leave the track out entirely */}
            {m.vsPrevPct != null ? (
              <PaceBar fillPct={m.vsPrevPct} markerPct={markerPct} color={color} height={6} />
            ) : null}
          </span>
          <span
            className="col-start-3 row-start-1 w-[50px] shrink-0 text-right text-[11px] font-bold @md:col-start-4"
            title={t(`${NS}.paceNote`)}
          >
            <Delta value={m.paceDeltaPct} />
          </span>
          {/* both months in full: the headline carries the toggled metric, this
              line carries everything the toggle would otherwise have hidden */}
          <span className="col-span-3 row-start-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-[9px] font-medium tabular-nums text-theme-600 @md:col-span-2 @md:col-start-3 @md:row-start-2 dark:text-theme-300">
            <OtherMetrics metrics={shop.metrics} dim={dim} field="current" t={t} className="shrink-0" />
            {m.previous != null ? (
              <span className="ml-auto shrink-0 text-right">
                {t(`${NS}.lastMonth`)}{" "}
                <span className="font-bold text-theme-800 dark:text-theme-100">{monthValueText(dim, m.previous, t)}</span>
                <OtherMetrics metrics={shop.metrics} dim={dim} field="previous" t={t} className="before:content-['_·_']" />
              </span>
            ) : null}
          </span>
        </>
      )}
    </div>
  );
}

// This month against last, in actuals only. No month-end projection: 楽天's
// campaign days make the intra-month rhythm far too uneven for a straight line
// through it to be honest.
function MonthlySection({ monthly, logoByName, shopColors, cardCls, t }) {
  const [dim, setDim] = useState(DEFAULT_MONTH_DIM);
  const cur = monthly.current;
  const m = monthly.metrics[dim];
  const tone = PEAK_TONE[dim] ?? PEAK_TONE.sales;
  // the toggle re-ranks the board so the leaders are always the leaders of the
  // metric on screen
  const shops = useMemo(
    () => [...monthly.shops].sort((a, b) => b.metrics[dim].current - a.metrics[dim].current),
    [monthly, dim],
  );

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
        dim === key
          ? "bg-theme-700 text-white dark:bg-theme-100 dark:text-theme-900"
          : "text-theme-600 hover:bg-theme-200/60 dark:text-theme-300 dark:hover:bg-theme-700/60"
      }`}
    >
      {t(`${NS}.${PEAK_DIM_TOGGLE_KEY[key] ?? "sortSales"}`)}
    </button>
  );

  return (
    <section className={`flex flex-col gap-3 p-4 ${cardCls}`}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="text-[12px] font-bold text-theme-700 dark:text-theme-200">{t(`${NS}.monthly`)}</span>
        <div className="flex shrink-0 gap-0.5 rounded-md border border-theme-300/60 bg-theme-100/50 p-0.5 dark:border-theme-600/60 dark:bg-theme-900/30">
          {MONTH_DIMS.map(dimChip)}
        </div>
        {/* the snapshot says so itself when a day is still landing — never let a
            running total read as a settled one */}
        {cur.status === "provisional" || monthly.partial ? (
          <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[9.5px] font-bold text-amber-700 dark:text-amber-300">
            {t(`${NS}.monthProvisional`)}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-x-5 gap-y-3.5 @4xl:grid-cols-[minmax(300px,1fr)_2fr]">
        <div className="flex min-w-0 flex-col gap-2">
          <div className={`flex min-w-0 flex-col gap-2 rounded-xl border p-3 ${tone.card}`}>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className={`text-[9.5px] font-extrabold uppercase tracking-[0.1em] ${tone.label}`}>
                {t(`${NS}.thisMonth`)}
              </span>
              <span className="text-[10px] font-semibold tabular-nums text-theme-700 dark:text-theme-200">{cur.month}</span>
              <span className="ml-auto text-[9.5px] font-medium tabular-nums text-theme-600 dark:text-theme-300">
                {t(`${NS}.monthCompleted`, { count: cur.completedDays })}
                {cur.hasLiveDay ? ` ${t(`${NS}.plusToday`)}` : ""}
              </span>
            </div>

            <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
              <span className={`text-[24px] font-extrabold leading-none tabular-nums @6xl:text-[34px] ${tone.value}`}>
                {monthValueText(dim, m.current, t)}
              </span>
              <OtherMetrics
                metrics={monthly.metrics}
                dim={dim}
                field="current"
                t={t}
                className="text-[11px] font-bold text-theme-700 dark:text-theme-200"
              />
            </span>

            {/* the bullet only means anything against a complete month; without
                one the row below says so instead of drawing an empty track */}
            {m.vsPrevPct != null ? (
              <div className="flex flex-col gap-1">
                <PaceBar fillPct={m.vsPrevPct} markerPct={cur.progressPct} color={MONTH_BAR[dim]} />
                <div className="flex items-baseline justify-between gap-2 text-[9.5px] font-medium tabular-nums text-theme-600 dark:text-theme-300">
                  <span>{t(`${NS}.monthProgress`, { pct: cur.progressPct.toFixed(1) })}</span>
                  <span className="font-bold text-theme-800 dark:text-theme-100">{m.vsPrevPct.toFixed(1)}%</span>
                </div>
              </div>
            ) : null}

            {m.pace != null ? (
              <div
                className="grid grid-cols-3 gap-x-2 border-t border-theme-300/40 pt-2 dark:border-white/10"
                title={t(`${NS}.paceNote`)}
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[9px] font-bold text-theme-600 dark:text-theme-300">
                    {t(`${NS}.thisMonth`)} {t(`${NS}.dailyPace`)}
                  </span>
                  <span className="text-[13px] font-bold tabular-nums text-theme-900 dark:text-theme-50">
                    {monthValueText(dim, m.pace, t)}
                    <span className="text-[9px] font-medium text-theme-600 dark:text-theme-300">{t(`${NS}.perDay`)}</span>
                  </span>
                </span>
                {m.prevPace != null ? (
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-[9px] font-bold text-theme-600 dark:text-theme-300">
                      {t(`${NS}.lastMonth`)} {t(`${NS}.dailyPace`)}
                    </span>
                    <span className="text-[13px] font-bold tabular-nums text-theme-700 dark:text-theme-200">
                      {monthValueText(dim, m.prevPace, t)}
                      <span className="text-[9px] font-medium text-theme-600 dark:text-theme-300">{t(`${NS}.perDay`)}</span>
                    </span>
                  </span>
                ) : null}
                {m.paceDeltaPct != null ? (
                  <span className="flex min-w-0 flex-col items-end gap-0.5">
                    <span className="truncate text-[9px] font-bold text-theme-600 dark:text-theme-300">{t(`${NS}.vsLastMonth`)}</span>
                    <Delta value={m.paceDeltaPct} className="text-[15px] font-extrabold" />
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-xl border border-theme-300/30 bg-theme-100/50 px-3 py-2 dark:border-white/[0.08] dark:bg-white/[0.03]">
            <span className="text-[9.5px] font-extrabold uppercase tracking-[0.1em] text-theme-600 dark:text-theme-300">
              {t(`${NS}.lastMonth`)}
            </span>
            {monthly.previous ? (
              <>
                <span className="text-[10px] font-semibold tabular-nums text-theme-700 dark:text-theme-200">
                  {monthly.previous.month}
                </span>
                <span className="text-[9px] font-medium text-theme-500 dark:text-theme-400">{t(`${NS}.monthBaseline`)}</span>
                <span className="ml-auto flex items-baseline gap-x-2">
                  <span className="text-[14px] font-bold tabular-nums text-theme-900 dark:text-theme-50">
                    {monthValueText(dim, m.previous, t)}
                  </span>
                  <OtherMetrics
                    metrics={monthly.metrics}
                    dim={dim}
                    field="previous"
                    t={t}
                    className="text-[10px] font-semibold text-theme-600 dark:text-theme-300"
                  />
                </span>
              </>
            ) : (
              // a partial month is never dressed up as a baseline
              <span className="ml-auto text-[10px] font-medium text-theme-600 dark:text-theme-300">
                {t(`${NS}.lastMonthPending`)}
              </span>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2.5">
          <span className="min-w-0 truncate text-[10.5px] font-bold tracking-wide text-theme-600 dark:text-theme-300">
            {t(`${NS}.monthShops`)}{" "}
            <span className="text-[9px] font-medium text-theme-500 dark:text-theme-400">· {t(`${NS}.paceNote`)}</span>
          </span>
          <div className="grid grid-cols-1 gap-x-8 gap-y-2 @6xl:grid-cols-none @6xl:grid-flow-col @6xl:grid-rows-4 @6xl:auto-cols-fr @6xl:gap-y-4">
            {shops.map((s) => (
              <MonthShopRow
                key={s.name}
                shop={s}
                dim={dim}
                markerPct={cur.progressPct}
                logoUrl={logoByName.get(s.name) || null}
                color={shopColors[s.name] ?? FALLBACK_SHOP_COLOR}
                t={t}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
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
  // uo-ec-manager owns the refresh schedule; each board just re-reads its own
  // snapshot on the single configured interval.
  const { data: history, mutate: mutateHistory } = useWidgetAPI(widget, "history", { refreshInterval });
  const { data: logos } = useWidgetAPI(widget, "logos", { refreshInterval });
  const { data: rankingData, mutate: mutateRanking } = useWidgetAPI(widget, "ranking", { refreshInterval });
  const { data: monthlyData, mutate: mutateMonthly } = useWidgetAPI(widget, "monthly", { refreshInterval });
  const { data: peaksData } = useWidgetAPI(widget, "peaks", { refreshInterval });

  const freshness = useFreshness(sales?.generatedAtJST, refreshInterval);
  const model = useMemo(() => buildModel(sales, history, logos), [sales, history, logos]);
  const ranking = useMemo(() => buildRanking(rankingData), [rankingData]);
  const peaks = useMemo(() => buildPeaks(peaksData), [peaksData]);
  // the month total still carries today, so the realtime snapshot is what lets
  // the completed-day pace be measured without a half-run day in it
  const monthly = useMemo(() => buildMonthly(monthlyData, sales), [monthlyData, sales]);
  const logoByName = useMemo(() => new Map((model?.rows || []).map((r) => [r.name, r.logoUrl])), [model]);
  // one palette for the whole widget, built from every shop either board draws —
  // assigning per board would let the two disagree when their shop sets differ
  const shopColors = useMemo(
    () =>
      buildShopColors([
        ...(model?.rows || []).map((r) => r.name),
        ...(monthly?.shopNames || []),
        ...(peaks?.shopNames || []),
      ]),
    [model, monthly, peaks],
  );

  const handleRefresh = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      mutateSales();
      mutateHistory();
      mutateRanking();
      mutateMonthly();
    },
    [mutateSales, mutateHistory, mutateRanking, mutateMonthly],
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
              <span className="text-[15px] font-bold leading-none tabular-nums text-theme-700 dark:text-theme-200">
                {fmt(t, model.rtUnits)}
                <span className="ml-0.5 text-[10px] font-semibold text-theme-600 dark:text-theme-300">{t(`${NS}.unitsShort`)}</span>
              </span>
              <span className="text-[12.5px] font-medium tabular-nums text-theme-600 dark:text-theme-300">
                {t(`${NS}.aov`)} ¥{fmt(t, model.aov)} · {t(`${NS}.unitsPerOrder`)} ×{model.rtUnitsPerOrder.toFixed(2)}
                {model.time ? ` · ${t(`${NS}.asOf`, { time: model.time })}` : ""}
              </span>
            </span>
            {/* pace vs 7-day avg */}
            {/* today's shop mix — same hues as the rows beside it and the record
                board below, so one colour always means one shop */}
            {model.rtTotal > 0 ? (
              <span className="mt-0.5 flex h-[7px] overflow-hidden rounded-full bg-theme-300/40 dark:bg-white/10">
                {model.rows
                  .filter((r) => r.rtSales > 0)
                  .map((r) => (
                    <span
                      key={r.name}
                      className="block h-full"
                      style={{ width: `${r.rtShare}%`, backgroundColor: shopColors[r.name] ?? FALLBACK_SHOP_COLOR }}
                      title={`${r.name} ${r.rtShare.toFixed(1)}%`}
                    />
                  ))}
              </span>
            ) : null}
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
            {/* 7-day context summary — totals + per-day averages fill the hero's spare height */}
            {model.hasHistory ? (
              <div className="mt-auto flex flex-col gap-1.5 border-t border-theme-300/30 pt-3 dark:border-white/10">
                <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-theme-600 dark:text-theme-300">{t(`${NS}.sevenDay`)}</span>
                <div className="grid grid-cols-[max-content_1fr] items-baseline gap-x-3 gap-y-1">
                  <span className="text-[10px] font-medium text-theme-500 dark:text-theme-400">{t(`${NS}.total`)}</span>
                  <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                    <span className="text-[13px] font-bold tabular-nums text-theme-800 dark:text-theme-100">¥{fmt(t, model.grandTotal)}</span>
                    <span className="text-[11.5px] font-medium tabular-nums text-theme-600 dark:text-theme-300">
                      {fmt(t, model.grandOrders)}
                      {t(`${NS}.ordersUnit`)}
                    </span>
                    <span className="text-[11.5px] font-medium tabular-nums text-theme-600 dark:text-theme-300">
                      {fmt(t, model.grandUnits)}
                      {t(`${NS}.unitsShort`)}
                    </span>
                    <span className="text-[11.5px] font-medium tabular-nums text-theme-600 dark:text-theme-300">
                      ×{model.unitsPerOrder.toFixed(2)}
                    </span>
                  </span>
                  <span className="text-[10px] font-medium text-theme-500 dark:text-theme-400">{t(`${NS}.avgLabel`)}</span>
                  <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                    <span className="text-[13px] font-bold tabular-nums text-theme-800 dark:text-theme-100">
                      ¥{fmt(t, Math.round(model.avg))}
                      <span className="text-[10px] font-medium text-theme-500 dark:text-theme-400">{t(`${NS}.perDay`)}</span>
                    </span>
                    <span className="text-[11.5px] font-medium tabular-nums text-theme-600 dark:text-theme-300">
                      {fmt(t, Math.round(model.avgOrders))}
                      {t(`${NS}.ordersUnit`)}
                      {t(`${NS}.perDay`)}
                    </span>
                    <span className="text-[11.5px] font-medium tabular-nums text-theme-600 dark:text-theme-300">
                      {fmt(t, Math.round(model.avgUnits))}
                      {t(`${NS}.unitsShort`)}
                      {t(`${NS}.perDay`)}
                    </span>
                    <span className="text-[11.5px] font-medium tabular-nums text-theme-600 dark:text-theme-300">CVR {model.grandCvr.toFixed(2)}%</span>
                  </span>
                </div>
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
            <div className="grid grid-cols-[minmax(0,120px)_100px_44px_minmax(0,52px)_44px_minmax(56px,1fr)] items-center gap-x-2 gap-y-2">
              {model.rows.map((r) => {
                const overIndex = r.rtShare >= r.h7Share;
                return (
                  <div key={r.name} className="contents">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <ShopLogo name={r.name} url={r.logoUrl} size={16} />
                      <span
                        aria-hidden="true"
                        className="block h-[9px] w-[3px] shrink-0 rounded-full"
                        style={{ backgroundColor: shopColors[r.name] ?? FALLBACK_SHOP_COLOR }}
                      />
                      <span className="truncate text-[12.5px] font-semibold text-theme-900 dark:text-theme-50">{r.name}</span>
                    </span>
                    <span className={`text-right text-[13px] font-bold tabular-nums ${r.rtSales > 0 ? ACCENT_TEXT : "text-theme-400 dark:text-theme-500"}`}>
                      {r.rtSales > 0 ? `¥${fmt(t, r.rtSales)}` : "¥0"}
                    </span>
                    <span className="text-right text-[11px] font-medium tabular-nums text-theme-600 dark:text-theme-300">
                      {fmt(t, r.rtOrders)}
                      {t(`${NS}.ordersUnit`)}
                    </span>
                    <span className="flex min-w-0 flex-col items-end leading-tight">
                      <span className="truncate text-[11px] font-medium tabular-nums text-theme-600 dark:text-theme-300">
                        {fmt(t, r.rtUnits)}
                        {t(`${NS}.unitsShort`)}
                      </span>
                      {/* pieces per order — a high ratio marks wholesale-style buying */}
                      {r.rtUnitsPerOrder > 0 ? (
                        <span
                          className={`text-[9px] tabular-nums ${
                            r.rtUnitsPerOrder >= 2 ? "font-bold text-amber-600 dark:text-amber-300" : "text-theme-500 dark:text-theme-400"
                          }`}
                          title={t(`${NS}.unitsPerOrder`)}
                        >
                          ×{r.rtUnitsPerOrder.toFixed(2)}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-right text-[10.5px] font-medium tabular-nums text-theme-500 dark:text-theme-400">{r.rtShare.toFixed(1)}%</span>
                    {/* bullet: fill = today share, tick = this shop's 7-day share; red when today ≥ normal */}
                    <span className="relative block h-2 rounded-full bg-theme-300/40 dark:bg-white/10">
                      <span
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{
                          width: `${Math.min(100, (r.rtShare / model.shareScale) * 100)}%`,
                          backgroundColor: shopColors[r.name] ?? FALLBACK_SHOP_COLOR,
                          // above its own 7-day norm reads solid; below it dims.
                          // The tick still marks the baseline, so the comparison
                          // stays readable from the geometry alone.
                          opacity: overIndex ? 1 : 0.42,
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
              <span className="truncate text-right text-[11px] font-bold tabular-nums text-theme-700 dark:text-theme-200">
                {fmt(t, model.rtUnits)}
                {t(`${NS}.unitsShort`)}
              </span>
              <span />
              <span />
            </div>
          </div>
        </section>

        {ranking ? <RankingSection ranking={ranking} cardCls={cardCls} t={t} /> : null}

        {model.hasHistory ? (
          <section className={`grid grid-cols-1 gap-x-5 gap-y-4 p-4 @4xl:grid-cols-[300px_1fr] ${cardCls}`}>
            <div className="min-w-0 @4xl:border-r @4xl:border-theme-300/30 dark:@4xl:border-white/10 @4xl:pr-5">
              <DailyChart model={model} mode={chartMode} onModeChange={setChartMode} t={t} />
            </div>
            <div className="flex min-w-0 flex-col gap-2.5">
              <span className="min-w-0 truncate text-[10.5px] font-bold tracking-wide text-theme-600 dark:text-theme-300">
                {t(`${NS}.shopTrend`)} <span className="text-[9px] font-medium text-theme-500 dark:text-theme-400">· {t(`${NS}.excludesToday`)}</span>
              </span>
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
                      <ShopMiniChart points={r.daily} mode={chartMode} cvr={r.cvr} t={t} />
                      <span className="border-t border-theme-300/30 pt-1.5 text-[9px] font-medium tabular-nums text-theme-600 dark:border-white/10 dark:text-theme-300">
                        {fmt(t, r.h7Orders)}
                        {t(`${NS}.ordersUnit`)} · {fmt(t, r.h7Units)}
                        {t(`${NS}.unitsShort`)} · CVR {r.cvr.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {monthly ? (
          <MonthlySection monthly={monthly} logoByName={logoByName} shopColors={shopColors} cardCls={cardCls} t={t} />
        ) : null}

        {peaks ? <PeaksSection peaks={peaks} shopColors={shopColors} cardCls={cardCls} t={t} /> : null}
      </div>
    </Container>
  );
}
