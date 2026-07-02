import Container from "components/services/widget/container";
import { useTranslation } from "next-i18next/pages";
import { useCallback, useEffect, useMemo, useState } from "react";

import { normalizeCategoryName, normalizeCouriers, normalizeShops } from "./dashboard-model.mjs";

import useWidgetAPI from "utils/proxy/use-widget-api";

const DEFAULT_REFRESH_INTERVAL = 30000;
// 狭い幅では店舗リストを6行に畳み、残りはフッターへ(広い幅は全件2列表示)。
const NARROW_SHOP_LIMIT = 6;

// チャンネルはブランド連想色(固定)。
const CHANNEL_COLOR = {
  楽天: "#D4537E",
  Amazon: "#EF9F27",
  メルカリ: "#ED93B1",
  auShop: "#D85A30",
  Q10: "#7F77DD",
  TikTok: "#C7518F",
  TEMU: "#378ADD",
  その他: "#888780",
};
const FALLBACK_CHANNEL_COLOR = "#888780";

// 配送方法は固定マップ(表示順やデータ有無で色が漂流しないように)。
const COURIER_COLOR = {
  "ゆうパケット (2CM)": "#4C93E0",
  "ゆうパケット (1CM)": "#5DCAA5",
  "クリップポスト (3CM)": "#EFA23B",
  ゆうパケットパフ: "#E0688C",
  佐川急便: "#8B7FE8",
  "ゆうパケット-未指定": "#8A94A0",
};
const COURIER_FALLBACK_PALETTE = ["#378ADD", "#5DCAA5", "#EF9F27", "#D4537E", "#7F77DD", "#888780"];

const STATUS_TONE = {
  live: "border-emerald-400/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  delayed: "border-amber-400/40 bg-amber-500/10 text-amber-600 dark:text-amber-300",
  stale: "border-rose-400/40 bg-rose-500/10 text-rose-600 dark:text-rose-300",
};
const STATUS_DOT = {
  live: "bg-emerald-500",
  delayed: "bg-amber-500",
  stale: "bg-rose-500",
};

function formatNumber(t, value) {
  return t("common.number", { value: Number(value) || 0 });
}

function channelColor(name) {
  return CHANNEL_COLOR[name] ?? FALLBACK_CHANNEL_COLOR;
}

function courierColor(name) {
  if (COURIER_COLOR[name]) {
    return COURIER_COLOR[name];
  }
  // 未知の配送方法にも安定した色を割り当てる(名前ハッシュ)。
  let hash = 0;
  for (let i = 0; i < String(name).length; i += 1) {
    hash = (hash * 31 + String(name).charCodeAt(i)) % 997;
  }
  return COURIER_FALLBACK_PALETTE[hash % COURIER_FALLBACK_PALETTE.length];
}

function shopChannel(shop) {
  return normalizeCategoryName(shop.category_name) || "その他";
}

// 全体比のラベル(1%未満は "<1%")。
function shareLabel(value, total) {
  if (!total || total <= 0) {
    return "";
  }
  const pct = (Number(value) / total) * 100;
  return pct >= 1 ? `${Math.round(pct)}%` : "<1%";
}

function buildChannelSegments(shops) {
  const totals = new Map();
  shops.forEach((shop) => {
    const name = shopChannel(shop);
    totals.set(name, (totals.get(name) || 0) + Number(shop.total_quantity || 0));
  });

  return [...totals.entries()]
    .map(([name, total]) => ({ name, total, color: channelColor(name) }))
    .filter((segment) => segment.total > 0)
    .sort((a, b) => b.total - a.total);
}

function relativeLabel(t, ageSec) {
  if (ageSec < 5) {
    return t("uoshippingdashboard.justNow");
  }
  if (ageSec < 60) {
    return t("uoshippingdashboard.secondsAgo", { count: ageSec });
  }
  if (ageSec < 3600) {
    return t("uoshippingdashboard.minutesAgo", { count: Math.floor(ageSec / 60) });
  }
  return t("uoshippingdashboard.hoursAgo", { count: Math.floor(ageSec / 3600) });
}

// updated_at と現在時刻の差から、データが生きているか(LIVE / 遅延 / 停止)を判定する。
function useFreshness(updatedAt, refreshInterval) {
  const [nowTs, setNowTs] = useState(null);

  useEffect(() => {
    setNowTs(Date.now());
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return useMemo(() => {
    if (!updatedAt || nowTs == null) {
      return null;
    }
    const parsed = Date.parse(String(updatedAt).replace(" ", "T"));
    if (Number.isNaN(parsed)) {
      return null;
    }
    const ageSec = Math.max(0, Math.round((nowTs - parsed) / 1000));
    const liveMax = Math.max(60, (refreshInterval / 1000) * 2);
    const staleMax = Math.max(300, (refreshInterval / 1000) * 6);
    const state = ageSec <= liveMax ? "live" : ageSec <= staleMax ? "delayed" : "stale";
    return { ageSec, state };
  }, [updatedAt, nowTs, refreshInterval]);
}

function FreshnessPill({ freshness, t }) {
  if (!freshness) {
    return null;
  }
  const stateLabel =
    freshness.state === "live"
      ? t("uoshippingdashboard.statusLive")
      : freshness.state === "delayed"
        ? t("uoshippingdashboard.statusDelayed")
        : t("uoshippingdashboard.statusStale");

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_TONE[freshness.state]}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {freshness.state === "live" ? (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${STATUS_DOT.live}`} />
        ) : null}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${STATUS_DOT[freshness.state]}`} />
      </span>
      <span>{stateLabel}</span>
      <span className="font-medium tabular-nums opacity-90">· {relativeLabel(t, freshness.ageSec)}</span>
    </span>
  );
}

function Header({ detailUrl, freshness, onRefresh, t, updatedAt }) {
  return (
    <div className="flex items-center justify-between gap-2 px-0.5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-theme-600 dark:text-theme-300">
          {t("uoshippingdashboard.updatedAt")}
        </span>
        <span className="truncate text-sm font-medium tabular-nums text-theme-900 dark:text-theme-50">
          {updatedAt || "-"}
        </span>
        <FreshnessPill freshness={freshness} t={t} />
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {detailUrl ? (
          <a
            href={detailUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-theme-300/50 px-2 py-1 text-[11px] font-medium text-theme-700 transition-colors hover:bg-theme-200/40 hover:text-theme-900 dark:border-theme-600/50 dark:text-theme-200 dark:hover:bg-theme-700/40 dark:hover:text-theme-50"
          >
            {t("uoshippingdashboard.detail")}
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5h5v5m0-5L10 14M9 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-3" />
            </svg>
          </a>
        ) : null}
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-lg border border-theme-300/50 p-1.5 text-theme-700 transition-colors hover:bg-theme-200/40 hover:text-theme-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-400/60 dark:border-theme-600/50 dark:text-theme-200 dark:hover:bg-theme-700/40 dark:hover:text-theme-50"
          title={t("uoshippingdashboard.refresh")}
          aria-label={t("uoshippingdashboard.refresh")}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// KPI セルの小さな見出し(「今日出力 · 07-02」など)。
function CellKicker({ label, scope }) {
  return (
    <span className="text-[11px] font-bold tracking-wide text-theme-700 dark:text-theme-100">
      {label}
      {scope ? <span className="ml-1 font-semibold text-theme-600 dark:text-theme-300"> · {scope}</span> : null}
    </span>
  );
}

// 100%積み上げの構成バー(細い・非対話・title でツールチップ)。
function SegmentBar({ segments, t, total }) {
  if (!total || total <= 0 || segments.length === 0) {
    return null;
  }
  return (
    <div className="flex h-1.5 w-full items-stretch gap-0.5 overflow-hidden rounded-full">
      {segments.map((segment) => (
        <span
          key={segment.name}
          title={`${segment.name} ${formatNumber(t, segment.total)} (${shareLabel(segment.total, total)})`}
          className="block h-full min-w-[6px] first:rounded-l-full last:rounded-r-full"
          style={{ width: `${(segment.total / total) * 100}%`, backgroundColor: segment.color }}
        />
      ))}
    </div>
  );
}

function LegendRow({ segments, t }) {
  if (segments.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-x-3.5 gap-y-1">
      {segments.map((segment) => (
        <span key={segment.name} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-theme-800 dark:text-theme-100">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />
          {segment.name}
          <span className="font-semibold tabular-nums text-theme-700 dark:text-theme-200">{formatNumber(t, segment.total)}</span>
        </span>
      ))}
    </div>
  );
}

function AmberBadge({ children }) {
  return (
    <span className="inline-flex rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-300">
      {children}
    </span>
  );
}

function GreenBadge({ children }) {
  return (
    <span className="inline-flex rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-300">
      {children}
    </span>
  );
}

// ===== KPI ストリップ(3セル) =====
function KpiStrip({ shipping, t, todayOutput, tomorrowOutput }) {
  const shops = useMemo(() => normalizeShops(todayOutput), [todayOutput]);
  const channelSegments = useMemo(() => buildChannelSegments(shops), [shops]);
  const outputTotal = Number(todayOutput?.total_quantity || 0);
  const tomorrowTotal = Number(tomorrowOutput?.total_quantity || 0);

  const tomorrowTop = useMemo(
    () =>
      normalizeShops(tomorrowOutput)
        .filter((shop) => Number(shop.total_quantity || 0) > 0)
        .slice(0, 3),
    [tomorrowOutput],
  );

  const cellBorder = "border-theme-300/30 dark:border-white/10";

  return (
    <section className="grid grid-cols-2 rounded-2xl border border-theme-300/40 bg-theme-200/30 @xl:grid-cols-[1.55fr_1fr_1.25fr] dark:border-theme-600/40 dark:bg-white/10">
      {/* 今日出力 — 主役 */}
      <div className="col-span-2 flex min-w-0 flex-col gap-2.5 p-4 @xl:col-span-1 @xl:p-5">
        <CellKicker label={t("uoshippingdashboard.todayOutput")} scope={todayOutput?.date} />
        <span className="text-[40px] font-extrabold leading-none tracking-tight tabular-nums text-theme-900 @xl:text-[48px] dark:text-theme-50">
          {formatNumber(t, outputTotal)}
        </span>
        <SegmentBar segments={channelSegments} t={t} total={outputTotal} />
        <LegendRow segments={channelSegments} t={t} />
      </div>

      {/* 明日予定 */}
      <div className={`flex min-w-0 flex-col gap-2.5 border-t p-4 @xl:border-l @xl:border-t-0 @xl:p-5 ${cellBorder}`}>
        <CellKicker label={t("uoshippingdashboard.tomorrowOutput")} scope={tomorrowOutput?.date} />
        <span className="text-[26px] font-bold leading-none tracking-tight tabular-nums text-amber-600 @xl:text-[30px] dark:text-amber-400">
          {formatNumber(t, tomorrowTotal)}
        </span>
        {tomorrowTop.length > 0 ? (
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] leading-relaxed">
            {tomorrowTop.map((shop, index) => (
              <span key={shop.shop_id} className="inline-flex items-baseline gap-1">
                {index > 0 ? <span className="mr-1 text-theme-400 dark:text-theme-500">·</span> : null}
                <span className="text-theme-600 dark:text-theme-300">{shop.shop_name}</span>
                <span className="font-semibold tabular-nums text-theme-900 dark:text-theme-50">
                  {formatNumber(t, shop.total_quantity)}
                </span>
              </span>
            ))}
          </span>
        ) : null}
      </div>

      {/* 出荷 — データ駆動で 今日/昨日 を切替 */}
      <div className={`flex min-w-0 flex-col gap-2.5 border-l border-t p-4 @xl:border-t-0 @xl:p-5 ${cellBorder}`}>
        {shipping.showingYesterday ? (
          <>
            <CellKicker
              label={t("uoshippingdashboard.shipping")}
              scope={`${t("uoshippingdashboard.yesterdayActual")} ${shipping.yesterdayDate || ""}`}
            />
            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-[26px] font-bold leading-none tracking-tight tabular-nums text-theme-900 @xl:text-[30px] dark:text-theme-50">
                {formatNumber(t, shipping.yesterdayTotal)}
              </span>
              <span className="text-[11px] font-medium text-theme-600 dark:text-theme-300">
                {t("uoshippingdashboard.yesterdayShipping")}
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-1.5">
              <AmberBadge>{t("uoshippingdashboard.todayNotTallied")}</AmberBadge>
            </span>
          </>
        ) : (
          <>
            <CellKicker label={t("uoshippingdashboard.shipping")} scope={shipping.todayDate} />
            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-[26px] font-bold leading-none tracking-tight tabular-nums text-theme-900 @xl:text-[30px] dark:text-theme-50">
                {formatNumber(t, shipping.todayTotal)}
              </span>
              <span className="text-[11px] font-medium text-theme-600 dark:text-theme-300">
                {t("uoshippingdashboard.todayShipping")}
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-1.5">
              <GreenBadge>{t("uoshippingdashboard.accruing")}</GreenBadge>
              <span className="text-[11px] font-medium tabular-nums text-theme-600 dark:text-theme-300">
                {t("uoshippingdashboard.yesterdayShipping")} {formatNumber(t, shipping.yesterdayTotal)}
              </span>
            </span>
          </>
        )}
      </div>
    </section>
  );
}

// ===== 店舗別出力パネル =====
function ShopPanel({ t, todayOutput }) {
  const shops = useMemo(() => normalizeShops(todayOutput), [todayOutput]);
  const outputTotal = Number(todayOutput?.total_quantity || 0);
  const shopsCount = Number(todayOutput?.shops_count || 0);
  const activeCount = Number(todayOutput?.active_shops_count || 0);

  const rest = shops.slice(NARROW_SHOP_LIMIT);
  const restTotal = rest.reduce((total, shop) => total + Number(shop.total_quantity || 0), 0);

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-2xl border border-theme-300/40 bg-theme-200/30 p-4 dark:border-theme-600/40 dark:bg-white/10">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-bold text-theme-800 dark:text-theme-100">
          {t("uoshippingdashboard.shopBreakdown")}
        </span>
        {shopsCount > 0 ? (
          <span className="text-[10.5px] font-medium tabular-nums text-theme-600 dark:text-theme-300">
            {t("uoshippingdashboard.activeShops")} {formatNumber(t, activeCount)}/{formatNumber(t, shopsCount)}
            {t("uoshippingdashboard.shopsUnit")}
          </span>
        ) : null}
      </div>

      {shops.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-x-8 gap-y-2.5 @xl:grid-cols-2">
            {shops.map((shop, index) => (
              <div
                key={shop.shop_id}
                className={`min-w-0 items-center gap-2 ${index >= NARROW_SHOP_LIMIT ? "hidden @xl:flex" : "flex"}`}
              >
                <span
                  className="h-3.5 w-[3px] shrink-0 rounded-full"
                  style={{ backgroundColor: channelColor(shopChannel(shop)) }}
                />
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-theme-900 dark:text-theme-50">
                  {shop.shop_name}
                </span>
                <span className="text-[13px] font-bold tabular-nums text-theme-900 dark:text-theme-50">
                  {formatNumber(t, shop.total_quantity)}
                </span>
                <span className="min-w-[2.1rem] text-right text-[10.5px] font-medium tabular-nums text-theme-600 dark:text-theme-300">
                  {shareLabel(shop.total_quantity, outputTotal)}
                </span>
              </div>
            ))}
          </div>
          {rest.length > 0 ? (
            <div className="flex items-center justify-between border-t border-theme-300/30 pt-2 text-[11px] font-medium text-theme-600 @xl:hidden dark:border-theme-600/30 dark:text-theme-300">
              <span>{t("uoshippingdashboard.moreShops", { count: rest.length })}</span>
              <span className="tabular-nums">
                {t("uoshippingdashboard.totalShort")} {formatNumber(t, restTotal)}
              </span>
            </div>
          ) : null}
        </>
      ) : (
        <div className="py-3 text-center text-xs text-theme-600 dark:text-theme-300">
          {t("uoshippingdashboard.noOutputData")}
        </div>
      )}
    </section>
  );
}

// ===== 配送方法別パネル =====
function CourierPanel({ shipping, t }) {
  const { couriers, scopeLabel, showingYesterday } = shipping;
  const total = couriers.reduce((sum, courier) => sum + Number(courier.total_quantity || 0), 0);
  const max = couriers.length > 0 ? Number(couriers[0].total_quantity || 0) : 0;

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-2xl border border-theme-300/40 bg-theme-200/30 p-4 dark:border-theme-600/40 dark:bg-white/10">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-bold text-theme-800 dark:text-theme-100">
          {t("uoshippingdashboard.courierBreakdown")}
        </span>
        <span className="shrink-0 rounded-full border border-theme-300/50 bg-theme-200/50 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-theme-600 dark:border-theme-600/50 dark:bg-theme-800/50 dark:text-theme-300">
          {scopeLabel}
        </span>
      </div>

      {couriers.length > 0 ? (
        <div className="grid grid-cols-[minmax(0,max-content)_minmax(2.5rem,1fr)_max-content_max-content] items-center gap-x-2.5 gap-y-2.5">
          {couriers.map((courier) => (
            <div key={courier.courier_id} className="contents">
              <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[12.5px] font-medium text-theme-900 dark:text-theme-50">
                <span className="h-1.5 w-1.5 shrink-0 rounded-sm" style={{ backgroundColor: courierColor(courier.courier_name) }} />
                {courier.courier_name}
              </span>
              <div className="h-1.5 overflow-hidden rounded-full bg-theme-300/40 dark:bg-white/10">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${max > 0 ? Math.max(2, (Number(courier.total_quantity || 0) / max) * 100) : 0}%`,
                    backgroundColor: courierColor(courier.courier_name),
                  }}
                />
              </div>
              <span className="text-right text-[13px] font-bold tabular-nums text-theme-900 dark:text-theme-50">
                {formatNumber(t, courier.total_quantity)}
              </span>
              <span className="min-w-[2.1rem] text-right text-[10.5px] font-medium tabular-nums text-theme-600 dark:text-theme-300">
                {shareLabel(courier.total_quantity, total)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-3 text-center text-xs text-theme-600 dark:text-theme-300">
          {t("uoshippingdashboard.noShippingData")}
        </div>
      )}

      <div className="mt-auto border-t border-theme-300/30 pt-2 text-[10.5px] font-medium text-theme-700 dark:border-theme-600/30 dark:text-theme-200">
        {showingYesterday ? t("uoshippingdashboard.shippingIdleNote") : t("uoshippingdashboard.shippingLiveNote")}
      </div>
    </section>
  );
}

function LoadingSkeleton() {
  return (
    <div className="@container flex w-full min-w-0 flex-col gap-3 p-1.5">
      <div className="flex items-center justify-between px-0.5">
        <div className="h-4 w-40 animate-pulse rounded bg-theme-300/30 dark:bg-theme-700/30" />
        <div className="h-7 w-7 animate-pulse rounded-lg bg-theme-300/30 dark:bg-theme-700/30" />
      </div>
      <div className="flex flex-col gap-3 rounded-2xl border border-theme-300/40 bg-theme-200/30 p-4 dark:border-theme-600/40 dark:bg-white/10">
        <div className="h-3 w-20 animate-pulse rounded bg-theme-300/40 dark:bg-theme-700/40" />
        <div className="h-10 w-32 animate-pulse rounded bg-theme-300/40 dark:bg-theme-700/40" />
        <div className="h-2 w-full animate-pulse rounded bg-theme-300/30 dark:bg-theme-700/30" />
      </div>
      <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2">
        {[...Array(2)].map((_, cardIndex) => (
          <div key={cardIndex} className="flex flex-col gap-3 rounded-2xl border border-theme-300/40 bg-theme-200/30 p-4 dark:border-theme-600/40 dark:bg-white/10">
            <div className="h-3 w-16 animate-pulse rounded bg-theme-300/40 dark:bg-theme-700/40" />
            {[...Array(5)].map((__, rowIndex) => (
              <div key={rowIndex} className="h-2.5 w-full animate-pulse rounded bg-theme-300/25 dark:bg-theme-700/25" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Component({ service }) {
  const { t } = useTranslation();
  const { widget } = service;
  const refreshInterval = Number(widget.refreshInterval) || DEFAULT_REFRESH_INTERVAL;

  const { data, error, mutate } = useWidgetAPI(widget, null, {
    refreshInterval: Math.max(1000, refreshInterval),
  });

  const handleRefresh = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      mutate();
    },
    [mutate],
  );

  const updatedAt = data?.updated_at ?? "";
  const freshness = useFreshness(updatedAt, Math.max(1000, refreshInterval));

  // 出荷の表示ソースをデータ駆動で決定:
  // 今日の計上が1件でも入れば今日、それまでは昨日実績を主役に据える。
  const shipping = useMemo(() => {
    const todayShipping = data?.today_shipping;
    const yesterdayShipping = data?.yesterday_shipping;
    const todayTotal = Number(todayShipping?.total_quantity || 0);
    const yesterdayTotal = Number(yesterdayShipping?.total_quantity || 0);
    const showingYesterday = todayTotal === 0;
    const source = showingYesterday ? yesterdayShipping : todayShipping;
    return {
      showingYesterday,
      todayTotal,
      yesterdayTotal,
      todayDate: todayShipping?.date || "",
      yesterdayDate: yesterdayShipping?.date || "",
      couriers: normalizeCouriers(source),
      scopeLabel: showingYesterday
        ? `${t("uoshippingdashboard.yesterdayActual")} · ${yesterdayShipping?.date || ""}`
        : todayShipping?.date || "",
    };
  }, [data, t]);

  if (error) {
    return <Container service={service} error={error} />;
  }

  if (!data) {
    return (
      <Container service={service}>
        <LoadingSkeleton />
      </Container>
    );
  }

  return (
    <Container service={service}>
      <div className="@container flex w-full min-w-0 flex-col gap-3 p-1.5">
        <Header
          detailUrl={widget.detailUrl}
          freshness={freshness}
          onRefresh={handleRefresh}
          t={t}
          updatedAt={updatedAt}
        />

        <KpiStrip
          shipping={shipping}
          t={t}
          todayOutput={data.today_output}
          tomorrowOutput={data.tomorrow_output}
        />

        <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-[1.55fr_1fr]">
          <ShopPanel t={t} todayOutput={data.today_output} />
          <CourierPanel shipping={shipping} t={t} />
        </div>
      </div>
    </Container>
  );
}
