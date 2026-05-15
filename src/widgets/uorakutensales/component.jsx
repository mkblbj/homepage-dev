import Container from "components/services/widget/container";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";

import {
  buildSalesModel,
  REFRESH_INTERVAL_OPTIONS,
  resolveRefreshIntervalOption,
} from "./sales-model.mjs";

import { formatProxyUrl } from "utils/proxy/api-helpers";

const STATUS_TONE_CLASSES = {
  success: "border-emerald-300/30 bg-emerald-500/10 text-emerald-600 dark:border-emerald-400/20 dark:text-emerald-300",
  warning: "border-amber-300/30 bg-amber-500/10 text-amber-600 dark:border-amber-400/20 dark:text-amber-300",
  danger: "border-rose-300/40 bg-rose-500/10 text-rose-600 dark:border-rose-400/25 dark:text-rose-300",
  muted: "border-theme-300/30 bg-theme-200/20 text-theme-500 dark:border-theme-700/40 dark:bg-theme-900/20 dark:text-theme-400",
};

function formatCurrency(value) {
  return `¥${Number(value || 0).toLocaleString("ja-JP")}`;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ja-JP");
}

function getErrorMessage(payload, fallback) {
  if (typeof payload?.error === "string") {
    return payload.error;
  }

  if (typeof payload?.error?.message === "string") {
    return payload.error.message;
  }

  return fallback;
}

function LoadingSkeleton() {
  return (
    <div className="flex w-full min-w-0 flex-col gap-2 p-1.5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="h-3 w-24 animate-pulse rounded bg-theme-200/60 dark:bg-theme-800/50" />
          <div className="mt-2 h-5 w-36 animate-pulse rounded bg-theme-200/50 dark:bg-theme-800/40" />
        </div>
        <div className="h-8 w-8 animate-pulse rounded-md bg-theme-200/50 dark:bg-theme-800/40" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="h-16 animate-pulse rounded-md bg-theme-200/40 dark:bg-theme-900/20" />
        <div className="h-16 animate-pulse rounded-md bg-theme-200/40 dark:bg-theme-900/20" />
      </div>
      <div className="space-y-1.5">
        {[...Array(4)].map((_, index) => (
          <div key={index} className="h-16 animate-pulse rounded-md bg-theme-200/35 dark:bg-theme-900/20" />
        ))}
      </div>
    </div>
  );
}

function RefreshIcon({ spinning = false }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={`h-3.5 w-3.5 ${spinning ? "animate-spin" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

function MetricBlock({ label, value, tone = "default" }) {
  const toneClass = tone === "sales"
    ? "border-emerald-300/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/20 dark:text-emerald-200"
    : "border-sky-300/30 bg-sky-500/10 text-sky-700 dark:border-sky-400/20 dark:text-sky-200";

  return (
    <div className={`min-w-0 rounded-md border px-2.5 py-2 ${toneClass}`}>
      <div className="truncate text-[10px] font-semibold text-theme-500 dark:text-theme-400">{label}</div>
      <div className="mt-1 truncate text-lg font-bold leading-none tabular-nums">{value}</div>
    </div>
  );
}

function RefreshIntervalSelector({ selectedId, onSelect }) {
  return (
    <div className="flex shrink-0 rounded-md border border-theme-200/50 bg-theme-100/50 p-0.5 dark:border-theme-700/50 dark:bg-theme-900/30">
      {REFRESH_INTERVAL_OPTIONS.map((option) => {
        const isSelected = selectedId === option.id;

        return (
          <button
            key={option.id}
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSelect(option);
            }}
            className={`min-w-9 rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
              isSelected
                ? "bg-theme-700 text-white dark:bg-theme-100 dark:text-theme-900"
                : "text-theme-500 hover:bg-theme-200/70 dark:text-theme-400 dark:hover:bg-theme-800/70"
            }`}
            title={`自動更新 ${option.label}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ShopCard({ shop }) {
  return (
    <div className="min-w-0 rounded-md border border-theme-200/45 bg-theme-100/45 px-2 py-1.5 dark:border-theme-700/45 dark:bg-theme-900/20">
      <div className="flex min-w-0 items-start justify-between gap-1.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold leading-tight text-theme-800 dark:text-theme-100">
            {shop.shopName}
          </div>
          <div className="mt-1 flex items-center gap-1">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              shop.statusTone === "success"
                ? "bg-emerald-400"
                : shop.statusTone === "danger"
                  ? "bg-rose-400"
                  : shop.statusTone === "warning"
                    ? "bg-amber-400"
                    : "bg-theme-400"
            }`}
            />
            <span className="truncate text-[9px] font-semibold text-theme-500 dark:text-theme-400">
              {shop.statusLabel}
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-bold leading-tight tabular-nums text-theme-900 dark:text-theme-50">
            {shop.salesDisplay}
          </div>
          <div className="mt-0.5 text-[10px] leading-tight tabular-nums text-theme-500 dark:text-theme-400">
            {shop.orderCountDisplay} 件
          </div>
        </div>
      </div>
      {shop.lastError ? (
        <div className="mt-1.5 border-t border-theme-200/35 pt-1 dark:border-theme-700/35">
          <span className="truncate text-[9px] font-semibold leading-tight text-rose-600 dark:text-rose-300" title={shop.lastError}>
            {shop.lastError}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export default function Component({ service }) {
  const { widget } = service;
  const [refreshOption, setRefreshOption] = useState(() => resolveRefreshIntervalOption(widget.refreshInterval));
  const [queryState, setQueryState] = useState({ status: "idle", message: "" });
  const snapshotUrl = formatProxyUrl(widget, "snapshot");

  const {
    data,
    error,
    isValidating,
    mutate,
  } = useSWR(snapshotUrl, {
    refreshInterval: refreshOption.milliseconds,
    revalidateIfStale: true,
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 5000,
  });

  const model = useMemo(
    () => buildSalesModel({ data, formatCurrency, formatNumber }),
    [data],
  );

  const queryActiveRef = useRef(false);

  useEffect(() => {
    if (!refreshOption.milliseconds) return undefined;

    const id = setInterval(async () => {
      if (queryActiveRef.current) return;
      queryActiveRef.current = true;
      try {
        const response = await fetch(formatProxyUrl(widget, "query"), { method: "POST" });
        if (response.ok) {
          await mutate();
        }
      } catch {
        /* auto-refresh errors are non-critical */
      } finally {
        queryActiveRef.current = false;
      }
    }, refreshOption.milliseconds);

    return () => clearInterval(id);
  }, [refreshOption.milliseconds, widget, mutate]);

  const handleQueryRefresh = useCallback(
    async (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (queryState.status === "loading" || queryActiveRef.current) {
        return;
      }

      queryActiveRef.current = true;
      setQueryState({ status: "loading", message: "売上を更新中" });

      try {
        const response = await fetch(formatProxyUrl(widget, "query"), { method: "POST" });
        const payload = await response.json().catch(() => null);

        if (!response.ok || payload?.error) {
          throw new Error(getErrorMessage(payload, "売上更新に失敗しました"));
        }

        await mutate();
        setQueryState({ status: "success", message: "更新完了" });
      } catch (e) {
        setQueryState({ status: "error", message: e.message || "売上更新に失敗しました" });
      } finally {
        queryActiveRef.current = false;
      }
    },
    [mutate, queryState.status, widget],
  );

  const currentError = data?.error ?? error;
  if (currentError) {
    return <Container service={service} error={currentError} />;
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
      <div className="flex w-full min-w-0 flex-col gap-2.5 p-1.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold tracking-wide text-theme-500 dark:text-theme-400">
              楽天リアルタイム売上
            </div>
            <div className="mt-1 truncate text-xs font-semibold tabular-nums text-theme-800 dark:text-theme-100">
              {model.generatedAt || "スナップショット待機中"}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <RefreshIntervalSelector selectedId={refreshOption.id} onSelect={setRefreshOption} />
            <button
              type="button"
              onClick={handleQueryRefresh}
              disabled={queryState.status === "loading"}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-theme-200/60 bg-theme-100/60 text-theme-600 transition-colors hover:bg-theme-200/70 disabled:cursor-not-allowed disabled:opacity-60 dark:border-theme-700/50 dark:bg-theme-900/30 dark:text-theme-300 dark:hover:bg-theme-800/70"
              title="売上を手動更新"
            >
              <RefreshIcon spinning={queryState.status === "loading" || isValidating} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <MetricBlock label="総売上" value={model.summary.totalSalesDisplay} tone="sales" />
          <MetricBlock label="注文数" value={`${model.summary.totalOrdersDisplay} 件`} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-theme-500 dark:text-theme-400">
          <span className="tabular-nums">店舗更新 {model.summary.shopCoverageDisplay}</span>
          {model.summary.hasErrors ? (
            <span className="font-semibold text-rose-600 dark:text-rose-300">
              確認が必要な店舗があります
            </span>
          ) : (
            <span className="font-semibold text-emerald-600 dark:text-emerald-300">全店舗正常</span>
          )}
        </div>

        {model.lastError ? (
          <div className="rounded-md border border-rose-300/40 bg-rose-500/10 px-2 py-1 text-[10px] text-rose-700 dark:border-rose-400/25 dark:text-rose-300">
            {model.lastError}
          </div>
        ) : null}

        {queryState.message ? (
          <div
            className={`rounded-md border px-2 py-1 text-[10px] ${
              queryState.status === "error"
                ? "border-rose-300/40 bg-rose-500/10 text-rose-700 dark:border-rose-400/25 dark:text-rose-300"
                : "border-theme-200/50 bg-theme-100/50 text-theme-500 dark:border-theme-700/40 dark:bg-theme-900/20 dark:text-theme-400"
            }`}
          >
            {queryState.message}
          </div>
        ) : null}

        {model.shops.length === 0 ? (
          <div className="rounded-md border border-dashed border-theme-300/40 px-3 py-5 text-center text-xs text-theme-500 dark:border-theme-700/50 dark:text-theme-400">
            店舗売上データがありません
          </div>
        ) : (
          <div className="grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-3 xl:grid-cols-4 scrollbar-thin scrollbar-thumb-theme-300/50 scrollbar-track-transparent dark:scrollbar-thumb-theme-600/50">
            {model.shops.map((shop) => (
              <ShopCard key={shop.shopName} shop={shop} />
            ))}
          </div>
        )}
      </div>
    </Container>
  );
}
