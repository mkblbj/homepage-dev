/*
 * uoperformance — 経営表現（traffic vs same-weekday median + new/repeat contribution）
 *
 * Endpoint: "performance" → GET /api/performance (read-only snapshot, refreshed
 * server-side daily at 07:00 JST). POST /api/admin/performance/refresh is never proxied.
 *
 * Contract rules encoded here — do NOT "simplify" them:
 *   - dataDateJST (RMS business day) and generatedAtJST (fetch time) are DIFFERENT; both are shown.
 *   - sampleCount < 3 → no median comparison. NOT zero traffic, NOT an outage.
 *   - null values are UNKNOWN → "—", never 0 (a null share is not 0%).
 *   - company status follows traffic.status only; customerMix is context and never sets it.
 *   - company visits/UU are NOT de-duplicated across shops.
 *   - expectedVisitCount is a VISIT median: the dashed baseline hides while UU is selected.
 *   - today's sales come from /api/sales, historical sales/CVR from /api/history/sales.
 */
import Container from "components/services/widget/container";
import { useTranslation } from "next-i18next/pages";
import { useCallback, useMemo, useState } from "react";

import { DASH, SPARK_PADDING, buildPerformanceModel, isNil, pctLabel, spark, weekdayJp } from "./performance-model.mjs";

import useWidgetAPI from "utils/proxy/use-widget-api";

const NS = "uoperformance";
// /api/performance refreshes once a day at 07:00 JST → 5–15 min polling is plenty.
const DEFAULT_REFRESH_INTERVAL = 600000;

const ACCENT = "#C6362B";
const BLUE = "#2E7DF6";
const BLUE_SOFT = "#93B9F5";

// Chart geometry lives at module scope so the drawing helpers stay dependency-free.
// The vertical padding comes from the model so the dashed median shares the curve's scale.
const CHART_WIDTH = 600;
const CHART_HEIGHT = 124;

const TONE = {
  critical: {
    pill: "border-rose-400/40 bg-rose-500/10 text-rose-600 dark:text-rose-300",
    dot: "bg-rose-500",
    color: ACCENT,
  },
  attention: {
    pill: "border-amber-400/40 bg-amber-500/10 text-amber-600 dark:text-amber-300",
    dot: "bg-amber-500",
    color: "#B45309",
  },
  normal: {
    pill: "border-emerald-400/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
    dot: "bg-emerald-500",
    color: "#0E9F6E",
  },
  unknown: {
    pill: "border-theme-400/40 bg-theme-500/10 text-theme-500 dark:text-theme-400",
    dot: "bg-theme-400",
    color: "#64748B",
  },
};

const toneOf = (status) => TONE[status] || TONE.unknown;
const trafficLabelOf = (t, status) => t(`${NS}.traffic.${TONE[status] ? status : "unknown"}`);

function fmt(t, value) {
  return t("common.number", { value: Number(value) || 0 });
}

function fmtNullable(t, value) {
  return isNil(value) ? DASH : fmt(t, value);
}

function SparkDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" className="absolute">
      <defs>
        <linearGradient id="uopf-stroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7DB8FB" />
          <stop offset="1" stopColor={BLUE} />
        </linearGradient>
        <linearGradient id="uopf-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(59,130,246,0.30)" />
          <stop offset="1" stopColor="rgba(59,130,246,0)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function ChartIcon() {
  return (
    <span
      className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] border"
      style={{ color: BLUE, backgroundColor: "rgba(46,125,246,.08)", borderColor: "rgba(46,125,246,.22)" }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 19h16" />
        <path d="M6 19v-6" />
        <path d="M11 19V7" />
        <path d="M16 19v-9" />
      </svg>
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
      className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[10px] border border-theme-300/50 text-theme-600 transition-colors hover:bg-theme-200/40 hover:text-theme-900 dark:border-theme-600/50 dark:text-theme-300 dark:hover:bg-theme-700/40 dark:hover:text-theme-50"
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

function SourceChip({ name, source, t }) {
  const ok = source?.ok !== false;
  const stale = source?.stale === true;
  let tone = TONE.normal;
  let state = t(`${NS}.sourceOk`);
  if (!ok) {
    tone = TONE.unknown;
    state = t(`${NS}.sourceUnavailable`);
  } else if (stale) {
    tone = TONE.attention;
    state = t(`${NS}.sourceStale`);
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2 rounded-[9px] border border-theme-300/40 bg-theme-200/30 py-1 pl-2.5 pr-3 dark:border-theme-600/40 dark:bg-white/[0.06]">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
      <span className="text-[11px] font-bold text-theme-700 dark:text-theme-200">{name}</span>
      <span className="text-[10.5px] font-semibold" style={{ color: tone.color }}>
        {state}
      </span>
      <span className="text-[10.5px] font-medium tabular-nums text-theme-500 dark:text-theme-400">
        {t(`${NS}.fetchedAt`)} {source?.updatedAtJST || DASH} · {t(`${NS}.businessDay`)} {source?.dataDateJST || DASH}
        {isNil(source?.coveredShopCount) ? "" : ` · ${source.coveredShopCount}`}
      </span>
      {source?.lastError ? (
        <span className="font-mono text-[10.5px] font-medium text-rose-600 dark:text-rose-300">{source.lastError}</span>
      ) : null}
    </span>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <span className="flex overflow-hidden rounded-lg border border-theme-300/50 dark:border-theme-600/50">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-3 py-1 text-[10.5px] font-bold transition-colors ${
            o.value === value
              ? "bg-theme-900 text-theme-50 dark:bg-theme-50 dark:text-theme-900"
              : "text-theme-600 hover:bg-theme-200/40 dark:text-theme-300 dark:hover:bg-white/10"
          }`}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

/** 7-day traffic chart. The dashed median belongs to the VISIT series only. */
function TrafficChart({ days, series, expected, t }) {
  const [hover, setHover] = useState(null);
  const vals = days.map((d) => (series === "uu" ? d.uu : d.visit));
  const showMedian = series === "visit" && !isNil(expected);
  const lo = Math.min(...vals) * 0.9;
  const hi = Math.max(...vals, showMedian ? expected : 0) * 1.04;
  // At most 7 points — cheap enough to recompute; memoizing on a freshly built array never hits anyway.
  const path = spark(vals, CHART_WIDTH, CHART_HEIGHT, lo, hi);
  const yAt = (v) => SPARK_PADDING + (1 - (v - lo) / (hi - lo || 1)) * (CHART_HEIGHT - SPARK_PADDING * 2);
  const xPct = (i) => (days.length === 1 ? 50 : (i / (days.length - 1)) * 100);
  const tipTx = hover === 0 ? "0%" : hover === days.length - 1 ? "-100%" : "-50%";

  return (
    <>
      <div className="relative h-[124px]">
        {showMedian ? (
          <div
            className="pointer-events-none absolute inset-x-0 z-[3] border-t-[1.5px] border-dashed"
            style={{ bottom: `${CHART_HEIGHT - yAt(expected)}px`, borderColor: "rgba(198,54,43,.7)" }}
          />
        ) : null}
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
          width="100%"
          height={CHART_HEIGHT}
          className="absolute inset-0 block overflow-visible"
        >
          <path d={path.area} fill="url(#uopf-area)" />
          <path
            d={path.line}
            fill="none"
            stroke="url(#uopf-stroke)"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            style={{ filter: "drop-shadow(0 3px 6px rgba(59,130,246,.4))" }}
          />
        </svg>
        <div className="absolute inset-0 z-[5] flex" onMouseLeave={() => setHover(null)}>
          {days.map((d, i) => (
            <div key={d.date} className="flex-1 cursor-crosshair" onMouseEnter={() => setHover(i)} />
          ))}
        </div>
        {hover !== null ? (
          <>
            <div
              className="pointer-events-none absolute inset-y-0 z-[6] w-px"
              style={{ left: `${xPct(hover)}%`, backgroundColor: "rgba(198,54,43,.45)" }}
            />
            <div
              className="pointer-events-none absolute z-[7] h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
              style={{ left: `${xPct(hover)}%`, top: `${yAt(vals[hover])}px`, backgroundColor: ACCENT }}
            />
            <div
              className="pointer-events-none absolute top-[3px] z-[8] whitespace-nowrap rounded-[7px] bg-slate-900 px-2.5 py-1 shadow-lg"
              style={{ left: `${xPct(hover)}%`, transform: `translateX(${tipTx})` }}
            >
              <span className="block text-[9.5px] font-bold text-slate-300">
                {days[hover].md}（{days[hover].wd}）
              </span>
              <span className="block text-[12.5px] font-extrabold tabular-nums text-white">
                {t(`${NS}.visits`)} {fmt(t, days[hover].visit)}
              </span>
              <span className="block text-[9.5px] font-medium tabular-nums text-slate-400">
                UU {fmt(t, days[hover].uu)}
              </span>
            </div>
          </>
        ) : null}
      </div>
      <div className="flex">
        {days.map((d) => (
          <span
            key={d.date}
            className="flex-1 text-center text-[9px] font-medium tabular-nums text-theme-500 dark:text-theme-400"
          >
            {d.md}
          </span>
        ))}
      </div>
    </>
  );
}

function LoadingSkeleton() {
  return (
    <div className="@container flex w-full min-w-0 flex-col gap-3 p-1.5">
      <div className="flex items-center justify-between px-0.5">
        <div className="h-4 w-28 animate-pulse rounded bg-theme-300/30 dark:bg-theme-700/30" />
        <div className="h-6 w-44 animate-pulse rounded bg-theme-300/30 dark:bg-theme-700/30" />
      </div>
      <div className="h-32 w-full animate-pulse rounded-2xl bg-theme-200/30 dark:bg-white/10" />
      <div className="h-24 w-full animate-pulse rounded-2xl bg-theme-200/30 dark:bg-white/10" />
    </div>
  );
}

export default function Component({ service }) {
  const { t } = useTranslation();
  const { widget } = service;
  const refreshInterval = Math.max(60000, Number(widget.refreshInterval) || DEFAULT_REFRESH_INTERVAL);
  const [series, setSeries] = useState("visit");
  const [metric, setMetric] = useState("sales"); // sales | orders

  const { data, error, mutate } = useWidgetAPI(widget, "performance", { refreshInterval });
  const model = useMemo(() => buildPerformanceModel(data), [data]);

  const handleRefresh = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      mutate();
    },
    [mutate],
  );

  if (error) {
    return <Container service={service} error={error} />;
  }

  if (!model) {
    return (
      <Container service={service}>
        <LoadingSkeleton />
      </Container>
    );
  }

  const tone = toneOf(model.trafficStatus);
  const cardCls = "rounded-2xl border border-theme-300/40 bg-theme-200/30 dark:border-theme-600/40 dark:bg-white/10";
  const sampleShort = model.sampleCount < 3;
  const isSales = metric === "sales";
  const mv = (yen, orders) => (isSales ? yen : orders);
  const mLabel = (v) => {
    if (isNil(v)) {
      return DASH;
    }

    return isSales ? `¥${fmt(t, v)}` : `${fmt(t, v)}${t(`${NS}.ordersUnit`)}`;
  };
  const newV = mv(model.mix.newYen, model.mix.newOrders);
  const repV = mv(model.mix.repYen, model.mix.repOrders);
  const newShare = isSales ? model.mix.newSalesShare : model.mix.newOrderShare;
  const repShare = isSales ? model.mix.repSalesShare : model.mix.repOrderShare;
  const rows = [
    { label: t(`${NS}.newCustomers`), color: BLUE, v: newV, sub: isSales ? model.mix.newOrders : model.mix.newYen },
    ...model.mix.buckets.map((b) => ({
      label: t(`${NS}.bucket.${b.key}`),
      color: b.color,
      v: mv(b.yen, b.orders),
      sub: isSales ? b.orders : b.yen,
    })),
  ];
  const maxRow = Math.max(1, ...rows.map((r) => r.v || 0));
  const mixTotal = (newV || 0) + (repV || 0);

  return (
    <Container service={service}>
      <SparkDefs />
      <div className="@container flex w-full min-w-0 flex-col gap-3 p-1.5">
        {/* header */}
        <div className="flex items-center justify-between gap-2 px-0.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <ChartIcon />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-bold text-theme-900 dark:text-theme-50">{t(`${NS}.title`)}</span>
              <span className="text-[10px] font-semibold tracking-[0.06em] text-theme-500 dark:text-theme-400">
                {t(`${NS}.subtitle`, { count: model.shopCount })}
              </span>
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            {model.partial ? (
              <span className="inline-flex items-center rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10.5px] font-bold text-amber-600 dark:text-amber-300">
                {t(`${NS}.partial`)}
              </span>
            ) : null}
            {/* business day ≠ fetch time — both are shown on purpose */}
            <span className="hidden items-center gap-1.5 rounded-[9px] border border-theme-300/50 bg-theme-200/30 px-2.5 py-1 @lg:inline-flex dark:border-theme-600/50 dark:bg-white/[0.06]">
              <span className="text-[9px] font-bold tracking-[0.12em] text-theme-500 dark:text-theme-400">
                {t(`${NS}.businessDay`)}
              </span>
              <span className="text-[12px] font-bold tabular-nums text-theme-900 dark:text-theme-50">
                {model.dataDateJST || DASH}
              </span>
            </span>
            <span className="flex flex-col items-end leading-tight">
              <span className="text-[9px] font-bold tracking-[0.14em] text-theme-500 dark:text-theme-400">
                {t(`${NS}.snapshot`)}
              </span>
              <span className="text-[12px] font-semibold tabular-nums text-theme-700 dark:text-theme-200">
                {model.generatedAtJST || DASH}
              </span>
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${tone.pill}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
              {trafficLabelOf(t, model.trafficStatus)}
            </span>
            <RefreshButton onRefresh={handleRefresh} t={t} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 px-0.5">
          <SourceChip name={t(`${NS}.sourceTraffic`)} source={model.sources.traffic} t={t} />
          <SourceChip name={t(`${NS}.sourceMix`)} source={model.sources.customerMix} t={t} />
        </div>

        {/* traffic hero + 7-day chart */}
        <section className={`grid grid-cols-1 @2xl:grid-cols-[340px_1fr] ${cardCls}`}>
          <div className="flex min-w-0 flex-col justify-center gap-2.5 border-b border-theme-300/30 p-4 @2xl:border-b-0 @2xl:border-r dark:border-white/10">
            <span className="text-[10.5px] font-bold tracking-wide text-theme-600 dark:text-theme-300">
              {t(`${NS}.visits`)} · {model.dataDateJST || DASH}
              {model.dataDateJST ? `（${weekdayJp(model.dataDateJST)}）` : ""}
            </span>
            <span className="flex items-baseline gap-1.5">
              <span className="text-[42px] font-extrabold leading-[0.9] tabular-nums text-theme-900 dark:text-theme-50">
                {fmtNullable(t, model.visit)}
              </span>
              <span className="text-[13px] font-bold text-theme-500 dark:text-theme-400">{t(`${NS}.visitsUnit`)}</span>
            </span>
            <span className="text-[11.5px] font-medium tabular-nums text-theme-600 dark:text-theme-300">
              UU {fmtNullable(t, model.uu)} {t(`${NS}.peopleUnit`)}
              {!isNil(model.visit) && model.uu > 0
                ? ` · ${t(`${NS}.perVisitor`, { n: (model.visit / model.uu).toFixed(2) })}`
                : ""}
            </span>
            <div className="mt-1 flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] font-medium text-theme-500 dark:text-theme-400">
                  {t(`${NS}.vsMedian`, { value: fmtNullable(t, model.expected) })}
                </span>
                <span className="text-[12.5px] font-extrabold tabular-nums" style={{ color: tone.color }}>
                  {pctLabel(model.delta)}
                </span>
              </div>
              <span className="block h-1.5 overflow-hidden rounded-full bg-theme-300/40 dark:bg-white/10">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${isNil(model.delta) ? 0 : Math.max(0, Math.min(100, 100 + Math.max(-100, model.delta)))}%`,
                    backgroundColor: tone.color,
                  }}
                />
              </span>
              <span className="text-[10px] font-semibold" style={{ color: sampleShort ? "#B45309" : undefined }}>
                <span className={sampleShort ? "" : "text-theme-500 dark:text-theme-400"}>
                  {sampleShort
                    ? t(`${NS}.sampleShort`, { n: model.sampleCount })
                    : t(`${NS}.sampleOk`, { n: model.sampleCount })}
                </span>
              </span>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10.5px] font-bold tracking-wide text-theme-600 dark:text-theme-300">
                {t(`${NS}.sevenDay`)}{" "}
                <span className="font-medium text-theme-500 dark:text-theme-400">
                  · {model.period?.startDateJST || DASH} 〜 {model.period?.endDateJST || DASH}
                </span>
              </span>
              <span className="flex items-center gap-2.5">
                {series === "visit" && !isNil(model.expected) ? (
                  <span className="text-[9.5px] font-medium text-theme-500 dark:text-theme-400">
                    <span
                      className="mr-1 inline-block w-3 border-t-[1.5px] border-dashed align-middle"
                      style={{ borderColor: ACCENT }}
                    />
                    {t(`${NS}.medianLegend`)}
                  </span>
                ) : null}
                <Segmented
                  value={series}
                  onChange={setSeries}
                  options={[
                    { value: "visit", label: t(`${NS}.visits`) },
                    { value: "uu", label: "UU" },
                  ]}
                />
              </span>
            </div>
            {model.days.length ? (
              <TrafficChart days={model.days} series={series} expected={model.expected} t={t} />
            ) : null}
          </div>
        </section>

        {/* customer mix */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
          <span className="text-[12px] font-bold text-theme-700 dark:text-theme-200">
            {t(`${NS}.mixTitle`)}{" "}
            <span className="text-[10px] font-medium text-theme-500 dark:text-theme-400">
              · {model.mix.period?.startDateJST || DASH} 〜 {model.mix.period?.endDateJST || DASH} ·{" "}
              {t(`${NS}.mixNote`)}
            </span>
          </span>
          <Segmented
            value={metric}
            onChange={setMetric}
            options={[
              { value: "sales", label: t(`${NS}.sales`) },
              { value: "orders", label: t(`${NS}.orders`) },
            ]}
          />
        </div>
        <section className={`grid grid-cols-1 @2xl:grid-cols-[340px_1fr] ${cardCls}`}>
          <div className="flex min-w-0 flex-col gap-3 border-b border-theme-300/30 p-4 @2xl:border-b-0 @2xl:border-r dark:border-white/10">
            <span className="text-[10.5px] font-bold tracking-wide text-theme-600 dark:text-theme-300">
              {t(`${NS}.mixComposition`)}
            </span>
            {isNil(newShare) || isNil(repShare) ? (
              <span className="rounded-lg border border-dashed border-theme-300/60 px-3 py-4 text-center text-[11px] font-semibold text-theme-500 dark:border-theme-600/60 dark:text-theme-400">
                {t(`${NS}.mixUnavailable`)}
              </span>
            ) : (
              <span className="flex h-[34px] gap-0.5">
                <span
                  className="flex flex-col justify-center rounded-lg px-2.5"
                  style={{ width: `${newShare}%`, backgroundColor: BLUE }}
                >
                  <span className="text-[9.5px] font-bold text-white/80">{t(`${NS}.newCustomers`)}</span>
                  <span className="text-[12px] font-extrabold tabular-nums text-white">{newShare.toFixed(1)}%</span>
                </span>
                <span
                  className="flex flex-col justify-center rounded-lg px-2.5"
                  style={{ width: `${repShare}%`, backgroundColor: BLUE_SOFT }}
                >
                  <span className="text-[9.5px] font-bold text-white/90">{t(`${NS}.repeatCustomers`)}</span>
                  <span className="text-[12px] font-extrabold tabular-nums text-white">{repShare.toFixed(1)}%</span>
                </span>
              </span>
            )}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="flex flex-col gap-0.5 rounded-xl border border-theme-300/30 bg-theme-100/60 p-2.5 dark:border-white/[0.06] dark:bg-white/[0.03]">
                <span className="text-[9.5px] font-bold text-theme-600 dark:text-theme-300">
                  {t(`${NS}.newCustomers`)}
                </span>
                <span className="text-[17px] font-extrabold tabular-nums text-theme-900 dark:text-theme-50">
                  {mLabel(newV)}
                </span>
                <span className="text-[9.5px] font-medium tabular-nums text-theme-500 dark:text-theme-400">
                  {isSales
                    ? `${fmtNullable(t, model.mix.newOrders)}${t(`${NS}.ordersUnit`)}`
                    : `¥${fmtNullable(t, model.mix.newYen)}`}
                </span>
              </div>
              <div className="flex flex-col gap-0.5 rounded-xl border border-theme-300/30 bg-theme-100/60 p-2.5 dark:border-white/[0.06] dark:bg-white/[0.03]">
                <span className="text-[9.5px] font-bold text-theme-600 dark:text-theme-300">
                  {t(`${NS}.repeatTotal`)}
                </span>
                <span className="text-[17px] font-extrabold tabular-nums text-theme-900 dark:text-theme-50">
                  {mLabel(repV)}
                </span>
                <span className="text-[9.5px] font-medium tabular-nums text-theme-500 dark:text-theme-400">
                  {isSales
                    ? `${fmtNullable(t, model.mix.repOrders)}${t(`${NS}.ordersUnit`)}`
                    : `¥${fmtNullable(t, model.mix.repYen)}`}
                </span>
              </div>
            </div>
            <span className="text-[10px] font-medium leading-relaxed text-theme-500 dark:text-theme-400">
              {t(`${NS}.mixCaveat`)}
            </span>
          </div>

          <div className="flex min-w-0 flex-col gap-2.5 p-4">
            <span className="text-[10.5px] font-bold tracking-wide text-theme-600 dark:text-theme-300">
              {t(`${NS}.bucketTitle`)}
            </span>
            {rows.map((r) => (
              <div key={r.label} className="flex items-center gap-3">
                <span className="flex w-[110px] shrink-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: r.color }} />
                  <span className="whitespace-nowrap text-[11.5px] font-bold text-theme-700 dark:text-theme-200">
                    {r.label}
                  </span>
                </span>
                <span className="block h-3.5 min-w-0 flex-1 overflow-hidden rounded-[5px] bg-theme-300/40 dark:bg-white/10">
                  <span
                    className="block h-full rounded-[5px]"
                    style={{ width: `${((r.v || 0) / maxRow) * 100}%`, backgroundColor: r.color }}
                  />
                </span>
                <span className="w-[126px] shrink-0 text-right text-[13px] font-bold tabular-nums text-theme-900 dark:text-theme-50">
                  {mLabel(r.v)}
                </span>
                <span className="w-16 shrink-0 text-right text-[11.5px] font-bold tabular-nums text-theme-600 dark:text-theme-300">
                  {isNil(r.v) || mixTotal <= 0 ? DASH : `${((r.v / mixTotal) * 100).toFixed(1)}%`}
                </span>
                <span className="hidden w-24 shrink-0 text-right text-[10.5px] font-medium tabular-nums text-theme-500 @2xl:inline dark:text-theme-400">
                  {isSales ? `${fmtNullable(t, r.sub)}${t(`${NS}.ordersUnit`)}` : `¥${fmtNullable(t, r.sub)}`}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* per-shop table */}
        <div className="flex items-baseline justify-between gap-2 px-0.5">
          <span className="text-[12px] font-bold text-theme-700 dark:text-theme-200">{t(`${NS}.byShop`)}</span>
          <span className="hidden text-[10px] font-medium text-theme-500 dark:text-theme-400 @lg:inline">
            {t(`${NS}.thresholds`)}
          </span>
        </div>
        <section className={`flex flex-col gap-0.5 px-4 py-3 ${cardCls}`}>
          <div className="hidden items-center gap-3 border-b border-theme-300/40 px-2 pb-2 text-[10px] font-bold tracking-[0.06em] text-theme-500 dark:border-white/10 dark:text-theme-400 @2xl:flex">
            <span className="min-w-0 flex-[1.5]">{t(`${NS}.shop`)}</span>
            <span className="min-w-0 flex-[1]">{t(`${NS}.statusCol`)}</span>
            <span className="min-w-0 flex-[1] text-right">{t(`${NS}.visits`)}</span>
            <span className="min-w-0 flex-[0.9] text-right">UU</span>
            <span className="min-w-0 flex-[1.1] text-right">{t(`${NS}.median`)}</span>
            <span className="min-w-0 flex-[0.85] text-right">{t(`${NS}.vsMedianShort`)}</span>
            <span className="min-w-0 flex-[1.1] text-right">{t(`${NS}.newShare`)}</span>
          </div>
          {model.shops.map((sh) => {
            const unknownSample = sh.sampleCount < 3 || isNil(sh.delta);
            const st = toneOf(unknownSample ? "unknown" : sh.status);
            const label = unknownSample ? t(`${NS}.sampleShortShort`) : trafficLabelOf(t, sh.status);
            const share = isSales ? sh.newSalesShare : sh.newOrderShare;

            return (
              <div
                key={sh.name}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-2 transition-colors hover:bg-theme-300/20 dark:hover:bg-white/[0.04]"
              >
                <span className="flex min-w-0 flex-[1.5] items-center gap-2">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${st.dot}`} />
                  <span className="truncate text-[12.5px] font-semibold text-theme-900 dark:text-theme-50">
                    {sh.name}
                  </span>
                </span>
                <span className="min-w-0 flex-[1]">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${st.pill}`}>
                    {label}
                  </span>
                </span>
                <span className="min-w-0 flex-[1] text-right text-[13px] font-bold tabular-nums text-theme-900 dark:text-theme-50">
                  {fmtNullable(t, sh.visit)}
                </span>
                <span className="min-w-0 flex-[0.9] text-right text-[12.5px] font-semibold tabular-nums text-theme-600 dark:text-theme-300">
                  {fmtNullable(t, sh.uu)}
                </span>
                <span className="min-w-0 flex-[1.1] text-right text-[12.5px] font-semibold tabular-nums text-theme-600 dark:text-theme-300">
                  {fmtNullable(t, sh.expected)}
                </span>
                <span
                  className="min-w-0 flex-[0.85] text-right text-[13px] font-extrabold tabular-nums"
                  style={{ color: st.color }}
                >
                  {pctLabel(sh.delta)}
                </span>
                <span className="min-w-0 flex-[1.1] text-right text-[12.5px] font-bold tabular-nums text-theme-700 dark:text-theme-200">
                  {isNil(share) ? DASH : `${share.toFixed(1)}%`}
                </span>
              </div>
            );
          })}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-theme-300/50 px-2 pt-2.5 dark:border-white/15">
            <span className="min-w-0 flex-[1.5] text-[11.5px] font-bold text-theme-900 dark:text-theme-50">
              {t(`${NS}.total`)}{" "}
              <span className="font-medium text-theme-500 dark:text-theme-400">
                {t(`${NS}.covered`, {
                  covered: model.sources?.traffic?.coveredShopCount ?? model.shops.length,
                  total: model.shopCount,
                })}
              </span>
            </span>
            <span className="min-w-0 flex-[1]" />
            <span className="min-w-0 flex-[1] text-right text-[13.5px] font-extrabold tabular-nums text-theme-900 dark:text-theme-50">
              {fmtNullable(t, model.visit)}
            </span>
            <span className="min-w-0 flex-[0.9] text-right text-[13px] font-bold tabular-nums text-theme-600 dark:text-theme-300">
              {fmtNullable(t, model.uu)}
            </span>
            <span className="min-w-0 flex-[1.1] text-right text-[12.5px] font-semibold tabular-nums text-theme-500 dark:text-theme-400">
              {fmtNullable(t, model.expected)}
            </span>
            <span
              className="min-w-0 flex-[0.85] text-right text-[13.5px] font-extrabold tabular-nums"
              style={{ color: tone.color }}
            >
              {pctLabel(model.delta)}
            </span>
            <span className="min-w-0 flex-[1.1] text-right text-[13px] font-bold tabular-nums text-theme-700 dark:text-theme-200">
              {isNil(newShare) ? DASH : `${newShare.toFixed(1)}%`}
            </span>
          </div>
        </section>

        <span className="px-0.5 text-[10.5px] font-medium leading-relaxed text-theme-500 dark:text-theme-400">
          {t(`${NS}.footnote`)}
        </span>
      </div>
    </Container>
  );
}
