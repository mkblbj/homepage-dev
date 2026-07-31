/*
 * uoattention — 運営対応（company operations to-do）
 *
 * Endpoint: "attention" → GET /api/attention (read-only snapshot).
 * The refresh button only re-reads the snapshot; POST /api/admin/attention/refresh
 * is never proxied and is not reachable through this widget's mappings.
 *
 * Contract rules encoded here — do NOT "simplify" them:
 *   - null counts are UNKNOWN → rendered as "—", NEVER as 0.
 *   - top-level `status` is decided by the Server; this widget only maps it to a tone.
 *   - `partial` and every sources.* { stale, updatedAtJST, lastError, coveredShopCount } stay visible.
 *   - reviews cover JST today + the previous 6 calendar days (not a rolling 168h).
 *   - reviewUrl is intentionally NOT linked: operators are logged into RMS anyway and
 *     each shop replies there, so the feed is read-only context.
 *   - no buyer-identifying fields exist in the payload and none are displayed.
 */
import Container from "components/services/widget/container";
import { useTranslation } from "next-i18next/pages";
import { useCallback, useMemo, useState } from "react";

import { DASH, buildAttentionModel, isNil, sumNullable } from "./attention-model.mjs";

import useWidgetAPI from "utils/proxy/use-widget-api";

const NS = "uoattention";
// /api/attention refreshes server-side every 10 min (to-dos) / 30 min (reviews);
// polling faster does not make the data fresher.
const DEFAULT_REFRESH_INTERVAL = 60000;

const ACCENT = "#C6362B"; // 楽天アクセント / critical
const WARN = "#D97706"; // attention
const INFO = "#2E7DF6"; // reviews / data-viz blue

const TONE = {
  critical: {
    pill: "border-rose-400/40 bg-rose-500/10 text-rose-600 dark:text-rose-300",
    dot: "bg-rose-500",
    color: ACCENT,
  },
  attention: {
    pill: "border-amber-400/40 bg-amber-500/10 text-amber-600 dark:text-amber-300",
    dot: "bg-amber-500",
    color: WARN,
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

const RATING_TONE = {
  1: "border-rose-400/40 bg-rose-500/10 text-rose-600 dark:text-rose-300",
  2: "border-amber-400/40 bg-amber-500/10 text-amber-600 dark:text-amber-300",
  3: "border-theme-400/30 bg-theme-500/10 text-theme-600 dark:text-theme-300",
};

const toneOf = (status) => TONE[status] || TONE.unknown;
const statusLabel = (t, status) => t(`${NS}.status.${TONE[status] ? status : "unknown"}`);

function fmt(t, value) {
  return t("common.number", { value: Number(value) || 0 });
}

/** null/undefined → "—"; numbers → grouped digits. */
function fmtNullable(t, value) {
  return isNil(value) ? DASH : fmt(t, value);
}

function ClipboardIcon() {
  return (
    <span
      className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] border"
      style={{ color: ACCENT, backgroundColor: "rgba(198,54,43,.08)", borderColor: "rgba(198,54,43,.22)" }}
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
        <path d="M9 4h6v3H9z" />
        <path d="M15 5.5h2.5A1.5 1.5 0 0 1 19 7v12a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19V7a1.5 1.5 0 0 1 1.5-1.5H9" />
        <path d="m8.5 13 2.2 2.2 4.3-4.3" />
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

/** One source freshness chip: stale / lastError / coveredShopCount are all part of the contract. */
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
        {t(`${NS}.fetchedAt`)} {source?.updatedAtJST || DASH}
        {source?.lastAttemptAtJST ? ` · ${t(`${NS}.attemptedAt`)} ${source.lastAttemptAtJST}` : ""}
        {isNil(source?.coveredShopCount) ? "" : ` · ${source.coveredShopCount}`}
      </span>
      {source?.lastError ? (
        <span className="font-mono text-[10.5px] font-medium text-rose-600 dark:text-rose-300">{source.lastError}</span>
      ) : null}
    </span>
  );
}

function KpiCard({ label, hint, value, sub, subTone }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-theme-300/30 bg-theme-100/60 p-3.5 dark:border-white/[0.06] dark:bg-white/[0.03]">
      <span className="flex items-center gap-1.5 text-[11px] font-bold text-theme-700 dark:text-theme-200">
        {label}
        {hint ? <span className="font-medium text-theme-500 dark:text-theme-400">{hint}</span> : null}
      </span>
      <span className="text-[30px] font-extrabold leading-[0.9] tabular-nums text-theme-900 dark:text-theme-50">
        {value}
      </span>
      <span className="text-[10.5px] font-medium tabular-nums" style={subTone ? { color: subTone } : undefined}>
        <span className={subTone ? "" : "text-theme-500 dark:text-theme-400"}>{sub}</span>
      </span>
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
      <div className="h-28 w-full animate-pulse rounded-2xl bg-theme-200/30 dark:bg-white/10" />
      <div className="h-24 w-full animate-pulse rounded-2xl bg-theme-200/30 dark:bg-white/10" />
    </div>
  );
}

export default function Component({ service }) {
  const { t } = useTranslation();
  const { widget } = service;
  const refreshInterval = Math.max(1000, Number(widget.refreshInterval) || DEFAULT_REFRESH_INTERVAL);
  const [ratingFilter, setRatingFilter] = useState(0); // 0 = all

  const { data, error, mutate } = useWidgetAPI(widget, "attention", { refreshInterval });
  const model = useMemo(() => buildAttentionModel(data), [data]);

  const handleRefresh = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      mutate(); // re-reads the snapshot only — never triggers an RMS refresh
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

  const tone = toneOf(model.status);
  const cardCls = "rounded-2xl border border-theme-300/40 bg-theme-200/30 dark:border-theme-600/40 dark:bg-white/10";
  const feed = ratingFilter === 0 ? model.recentReviews : model.recentReviews.filter((r) => r.rating === ratingFilter);
  const totalForBar = Math.max(1, (model.pending || 0) + (model.inquiry || 0) + (model.reviews || 0));
  const pct = (v) => `${((v || 0) / totalForBar) * 100}%`;

  return (
    <Container service={service}>
      <div className="@container flex w-full min-w-0 flex-col gap-3 p-1.5">
        {/* header */}
        <div className="flex items-center justify-between gap-2 px-0.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <ClipboardIcon />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-bold text-theme-900 dark:text-theme-50">{t(`${NS}.title`)}</span>
              <span className="text-[10px] font-semibold tracking-[0.06em] text-theme-500 dark:text-theme-400">
                {t(`${NS}.subtitle`, { count: model.shopCount })}
              </span>
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            {model.partial ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10.5px] font-bold text-amber-600 dark:text-amber-300">
                {t(`${NS}.partial`)}
              </span>
            ) : null}
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
              {statusLabel(t, model.status)}
            </span>
            <RefreshButton onRefresh={handleRefresh} t={t} />
          </div>
        </div>

        {/* source freshness — mainMenu + reviews, always visible */}
        <div className="flex flex-wrap gap-2 px-0.5">
          <SourceChip name={t(`${NS}.sourceMainMenu`)} source={model.sources.mainMenu} t={t} />
          <SourceChip name={t(`${NS}.sourceReviews`)} source={model.sources.reviews} t={t} />
        </div>

        {/* hero + KPI */}
        <section className={`grid grid-cols-1 @2xl:grid-cols-[340px_1fr] ${cardCls}`}>
          <div className="flex min-w-0 flex-col justify-center gap-2.5 border-b border-theme-300/30 p-4 @2xl:border-b-0 @2xl:border-r dark:border-white/10">
            <span className="text-[10.5px] font-bold tracking-wide text-theme-600 dark:text-theme-300">
              {t(`${NS}.openTotal`)}
            </span>
            <span className="flex items-baseline gap-1.5">
              <span className="text-[42px] font-extrabold leading-[0.9] tabular-nums text-theme-900 dark:text-theme-50">
                {fmtNullable(t, model.total)}
              </span>
              <span className="text-[13px] font-bold text-theme-500 dark:text-theme-400">{t(`${NS}.unit`)}</span>
            </span>
            {model.totalPartial ? (
              <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-300">
                {t(`${NS}.totalExcludesUnknown`)}
              </span>
            ) : null}
            <span className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-theme-300/40 dark:bg-white/10">
              <span className="block rounded-full" style={{ width: pct(model.pending), backgroundColor: ACCENT }} />
              <span className="block rounded-full" style={{ width: pct(model.inquiry), backgroundColor: WARN }} />
              <span className="block rounded-full" style={{ width: pct(model.reviews), backgroundColor: INFO }} />
            </span>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-theme-600 dark:text-theme-300">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-[3px]" style={{ backgroundColor: ACCENT }} />
                {t(`${NS}.pendingOrders`)} {fmtNullable(t, model.pending)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-[3px]" style={{ backgroundColor: WARN }} />
                {t(`${NS}.inquiries`)} {fmtNullable(t, model.inquiry)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-[3px]" style={{ backgroundColor: INFO }} />
                {t(`${NS}.reviews`)} {fmtNullable(t, model.reviews)}
              </span>
            </span>
            {model.lastError ? (
              <span className="font-mono text-[10.5px] font-medium text-rose-600 dark:text-rose-300">
                {model.lastError}
              </span>
            ) : null}
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-3 p-4 @lg:grid-cols-3">
            <KpiCard
              label={t(`${NS}.pendingOrders`)}
              value={fmtNullable(t, model.pending)}
              sub={t(`${NS}.spreadOverShops`, { count: model.shops.filter((x) => x.pending > 0).length })}
            />
            <KpiCard
              label={t(`${NS}.inquiries`)}
              value={fmtNullable(t, model.inquiry)}
              sub={`${t(`${NS}.overdue`)} ${fmtNullable(t, model.overdue)} ${t(`${NS}.unit`)}`}
              subTone={model.overdue > 0 ? ACCENT : undefined}
            />
            <KpiCard
              label={t(`${NS}.reviews`)}
              hint={t(`${NS}.reviewsRange`)}
              value={fmtNullable(t, model.reviews)}
              sub={t(`${NS}.reviewSplit`, {
                product: fmtNullable(t, model.productReviews),
                shop: fmtNullable(t, model.shopReviews),
              })}
            />
          </div>
        </section>

        {/* per-shop table */}
        <div className="flex items-baseline justify-between gap-2 px-0.5">
          <span className="text-[12px] font-bold text-theme-700 dark:text-theme-200">{t(`${NS}.byShop`)}</span>
          <span className="hidden text-[10px] font-medium text-theme-500 dark:text-theme-400 @lg:inline">
            {t(`${NS}.statusRule`)}
          </span>
        </div>
        <section className={`flex flex-col gap-0.5 px-4 py-3 ${cardCls}`}>
          <div className="hidden items-center gap-3 border-b border-theme-300/40 px-2 pb-2 text-[10px] font-bold tracking-[0.06em] text-theme-500 dark:border-white/10 dark:text-theme-400 @2xl:flex">
            <span className="min-w-0 flex-[1.5]">{t(`${NS}.shop`)}</span>
            <span className="min-w-0 flex-[0.9]">{t(`${NS}.statusCol`)}</span>
            <span className="min-w-0 flex-[1] text-right">{t(`${NS}.pendingOrders`)}</span>
            <span className="min-w-0 flex-[0.85] text-right">{t(`${NS}.inquiriesShort`)}</span>
            <span className="min-w-0 flex-[0.75] text-right">{t(`${NS}.overdue`)}</span>
            <span className="min-w-0 flex-[1.1] text-right">{t(`${NS}.reviews`)}</span>
            <span className="min-w-0 flex-[1.7] pl-5">{t(`${NS}.starBreakdown`)}</span>
            <span className="min-w-0 flex-[0.75] text-right">{t(`${NS}.total`)}</span>
          </div>

          {model.shops.map((sh) => {
            const st = toneOf(sh.status);
            const rowTotal = sumNullable([sh.pending, sh.inquiry, sh.reviews]);

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
                <span className="min-w-0 flex-[0.9]">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${st.pill}`}>
                    {statusLabel(t, sh.status)}
                  </span>
                </span>
                <span className="min-w-0 flex-[1] text-right text-[13px] font-bold tabular-nums text-theme-900 dark:text-theme-50">
                  {fmtNullable(t, sh.pending)}
                </span>
                <span className="min-w-0 flex-[0.85] text-right text-[13px] font-bold tabular-nums text-theme-900 dark:text-theme-50">
                  {fmtNullable(t, sh.inquiry)}
                </span>
                <span
                  className="min-w-0 flex-[0.75] text-right text-[13px] font-bold tabular-nums"
                  style={sh.overdue > 0 ? { color: ACCENT } : undefined}
                >
                  <span className={sh.overdue > 0 ? "" : "text-theme-400 dark:text-theme-500"}>
                    {fmtNullable(t, sh.overdue)}
                  </span>
                </span>
                <span className="min-w-0 flex-[1.1] text-right text-[13px] font-bold tabular-nums text-theme-900 dark:text-theme-50">
                  {fmtNullable(t, sh.reviews)}
                </span>
                {/* Follows its column header, which is @2xl-only: below that the row's
                    zero-basis cells shrink far enough for the badges to overlap the total. */}
                <span className="hidden min-w-0 flex-[1.7] gap-1.5 @2xl:flex @2xl:pl-5">
                  {sh.stars.map((x) => (
                    <span
                      key={x.star}
                      className={`inline-flex items-center gap-0.5 rounded-md border px-1.5 py-px text-[10px] font-bold tabular-nums ${RATING_TONE[x.star]}`}
                    >
                      {x.star}★{x.n}
                    </span>
                  ))}
                </span>
                <span className="min-w-0 flex-[0.75] text-right text-[13.5px] font-extrabold tabular-nums text-theme-900 dark:text-theme-50">
                  {fmtNullable(t, rowTotal)}
                </span>
              </div>
            );
          })}

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-theme-300/50 px-2 pt-2.5 dark:border-white/15">
            <span className="min-w-0 flex-[1.5] text-[11.5px] font-bold text-theme-900 dark:text-theme-50">
              {t(`${NS}.total`)}{" "}
              <span className="font-medium text-theme-500 dark:text-theme-400">
                {t(`${NS}.covered`, { covered: model.coveredShopCount, total: model.shopCount })}
              </span>
            </span>
            <span className="min-w-0 flex-[0.9]" />
            <span className="min-w-0 flex-[1] text-right text-[13.5px] font-extrabold tabular-nums text-theme-900 dark:text-theme-50">
              {fmtNullable(t, model.pending)}
            </span>
            <span className="min-w-0 flex-[0.85] text-right text-[13.5px] font-extrabold tabular-nums text-theme-900 dark:text-theme-50">
              {fmtNullable(t, model.inquiry)}
            </span>
            <span
              className="min-w-0 flex-[0.75] text-right text-[13.5px] font-extrabold tabular-nums"
              style={{ color: ACCENT }}
            >
              {fmtNullable(t, model.overdue)}
            </span>
            <span className="min-w-0 flex-[1.1] text-right text-[13.5px] font-extrabold tabular-nums text-theme-900 dark:text-theme-50">
              {fmtNullable(t, model.reviews)}
            </span>
            <span className="hidden min-w-0 flex-[1.7] @2xl:block @2xl:pl-5" />
            <span
              className="min-w-0 flex-[0.75] text-right text-[14px] font-extrabold tabular-nums"
              style={{ color: ACCENT }}
            >
              {fmtNullable(t, model.total)}
            </span>
          </div>
        </section>

        {/* low-rating unreplied reviews (read-only; no outbound links by design) */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
          <span className="text-[12px] font-bold text-theme-700 dark:text-theme-200">
            {t(`${NS}.reviewFeed`)}{" "}
            <span className="text-[10px] font-medium text-theme-500 dark:text-theme-400">
              · {t(`${NS}.reviewFeedNote`)}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            {[
              { k: 0, label: `${t(`${NS}.all`)} ${model.recentReviews.length}` },
              ...model.ratings.map((r) => ({ k: r.star, label: `${r.star}★ ${fmtNullable(t, r.n)}` })),
            ].map((c) => (
              <button
                key={c.k}
                type="button"
                onClick={() => setRatingFilter(c.k)}
                className={`rounded-full border px-2.5 py-1 text-[10.5px] font-bold tabular-nums transition-colors ${
                  ratingFilter === c.k
                    ? "border-theme-900 bg-theme-900 text-theme-50 dark:border-theme-50 dark:bg-theme-50 dark:text-theme-900"
                    : "border-theme-300/50 text-theme-600 hover:border-theme-400 dark:border-theme-600/50 dark:text-theme-300"
                }`}
              >
                {c.label}
              </button>
            ))}
          </span>
        </div>
        <section className="grid grid-cols-1 gap-3 @lg:grid-cols-2 @2xl:grid-cols-3">
          {feed.map((rv) => (
            <div
              key={rv.id}
              className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-theme-300/40 bg-theme-200/30 p-3 dark:border-theme-600/40 dark:bg-white/10"
            >
              <span className="flex items-center gap-2">
                <span
                  className={`inline-flex rounded-md border px-1.5 py-px text-[10.5px] font-extrabold tabular-nums ${RATING_TONE[rv.rating]}`}
                >
                  {rv.rating}★
                </span>
                <span className="rounded bg-theme-300/40 px-1.5 py-px text-[9.5px] font-bold text-theme-600 dark:bg-white/10 dark:text-theme-300">
                  {t(`${NS}.reviewType.${rv.type === "product" ? "product" : "shop"}`)}
                </span>
                <span className="truncate text-[11px] font-bold text-theme-700 dark:text-theme-200">{rv.shop}</span>
                <span className="ml-auto shrink-0 text-[9.5px] font-medium tabular-nums text-theme-500 dark:text-theme-400">
                  {rv.postedAtJST}
                </span>
              </span>
              <span className="truncate text-[12px] font-semibold text-theme-900 dark:text-theme-50">
                {rv.itemName || t(`${NS}.noItem`)}
              </span>
              <span className="line-clamp-2 text-[11px] leading-relaxed text-theme-600 dark:text-theme-300">
                {rv.excerpt}
              </span>
            </div>
          ))}
          {feed.length === 0 ? (
            <div className="col-span-full flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-theme-300/60 bg-theme-200/20 p-6 dark:border-theme-600/60 dark:bg-white/[0.03]">
              <span className="text-[12.5px] font-bold text-theme-600 dark:text-theme-300">
                {model.sources?.reviews?.ok === false ? t(`${NS}.reviewsUnavailable`) : t(`${NS}.reviewsNone`)}
              </span>
              <span className="text-[11px] font-medium text-theme-500 dark:text-theme-400">
                {model.sources?.reviews?.ok === false ? t(`${NS}.reviewsUnavailableNote`) : t(`${NS}.reviewsNoneNote`)}
              </span>
            </div>
          ) : null}
        </section>
      </div>
    </Container>
  );
}
