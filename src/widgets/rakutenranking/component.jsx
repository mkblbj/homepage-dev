import Container from "components/services/widget/container";
import { useState, useCallback } from "react";
import useSWR from "swr";

import { formatProxyUrl } from "utils/proxy/api-helpers";

function StarRating({ rating }) {
  const num = Number(rating);
  if (!num) return null;
  const full = Math.floor(num);
  const half = num - full >= 0.5;
  return (
    <div className="flex items-center gap-0.5">
      {[...Array(5)].map((_, i) => {
        const key = `star-${i}`;
        if (i < full) {
          return (
            <svg key={key} className="w-3 h-3 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          );
        }
        if (i === full && half) {
          return (
            <svg key={key} className="w-3 h-3 text-yellow-400" viewBox="0 0 20 20">
              <defs>
                <clipPath id={`halfClip${i}`}>
                  <rect x="0" y="0" width="10" height="20" />
                </clipPath>
              </defs>
              <path fill="currentColor" clipPath={`url(#halfClip${i})`} d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              <path fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.3" d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          );
        }
        return (
          <svg key={key} className="w-3 h-3 text-theme-400/30" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        );
      })}
      <span className="text-[10px] text-theme-500 dark:text-theme-400 ml-0.5">{num.toFixed(1)}</span>
    </div>
  );
}

function RankBadge({ rank }) {
  const colors = {
    1: "from-yellow-400 to-yellow-600 text-white",
    2: "from-gray-300 to-gray-500 text-white",
    3: "from-amber-600 to-amber-800 text-white",
  };
  const cls = colors[rank] || "bg-theme-200/60 dark:bg-theme-700/60 text-theme-600 dark:text-theme-300";
  if (rank <= 3) {
    return (
      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br ${cls} text-xs font-bold shrink-0 shadow-sm`}>
        {rank}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${cls} text-[10px] font-semibold shrink-0`}>
      {rank}
    </span>
  );
}

function formatPrice(price) {
  if (!price) return "";
  return `¥${Number(price).toLocaleString("ja-JP")}`;
}

function signalLabel(signal) {
  if (signal.status === "daily_confirmed") return "日榜確認";
  if (signal.status === "watching") return "連続上榜";
  return "实时突入";
}

function signalTone(signal) {
  if (signal.status === "daily_confirmed") {
    return "border-amber-400/70 bg-amber-100/80 text-amber-900 dark:border-amber-300/50 dark:bg-amber-500/20 dark:text-amber-100";
  }
  if (signal.status === "watching") {
    return "border-sky-400/60 bg-sky-100/70 text-sky-900 dark:border-sky-300/40 dark:bg-sky-500/20 dark:text-sky-100";
  }
  return "border-rose-400/60 bg-rose-100/75 text-rose-900 dark:border-rose-300/40 dark:bg-rose-500/20 dark:text-rose-100";
}

function SignalPanel({ data }) {
  const signals = data?.signals || [];
  if (!data?.enabled || data?.warmingUp || signals.length === 0) return null;

  return (
    <div className="mx-2 mt-1.5 mb-1.5 overflow-hidden rounded-lg border border-rose-400/50 bg-gradient-to-r from-rose-50 via-amber-50 to-white shadow-sm dark:border-rose-300/30 dark:from-rose-950/40 dark:via-amber-950/30 dark:to-theme-900/40">
      <div className="flex items-center justify-between gap-2 border-b border-rose-200/70 px-2.5 py-1.5 dark:border-rose-800/40">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="inline-flex h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_0_3px_rgba(244,63,94,0.16)]" />
          <span className="text-xs font-bold text-rose-700 dark:text-rose-200">急浮上</span>
          <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {signals.length}件
          </span>
        </div>
        <span className="shrink-0 text-[10px] text-theme-600 dark:text-theme-300">
          实时前{data.config?.realtimeTop || 50}
        </span>
      </div>
      <div className="flex flex-col divide-y divide-rose-100/80 dark:divide-rose-900/30">
        {signals.map((signal) => (
          <a
            key={`${signal.status}-${signal.itemCode}`}
            href={signal.itemUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-2.5 py-2 transition-colors hover:bg-white/60 dark:hover:bg-white/5"
          >
            {signal.imageUrl && (
              <img
                src={signal.imageUrl}
                alt=""
                className="h-10 w-10 shrink-0 rounded-md bg-white object-contain"
                loading="lazy"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="line-clamp-1 text-xs font-semibold text-theme-800 dark:text-theme-100">
                {signal.itemName}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-theme-600 dark:text-theme-300">
                {signal.realtimeRank && <span>RT #{signal.realtimeRank}</span>}
                {signal.dailyRank && <span>DAY #{signal.dailyRank}</span>}
                {signal.itemPrice && <span>{formatPrice(signal.itemPrice)}</span>}
              </div>
            </div>
            <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${signalTone(signal)}`}>
              {signalLabel(signal)}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

function ItemCard({ item }) {
  return (
    <a
      href={item.itemUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-theme-200/40 dark:hover:bg-theme-700/30 transition-colors group"
    >
      <RankBadge rank={item.rank} />
      {item.imageUrl && (
        <img
          src={item.imageUrl}
          alt=""
          className="w-14 h-14 rounded-md object-contain bg-white shrink-0"
          loading="lazy"
        />
      )}
      <div className="flex flex-col min-w-0 flex-1 gap-0.5">
        <span className="text-xs font-medium text-theme-700 dark:text-theme-200 line-clamp-2 leading-tight group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors">
          {item.itemName}
        </span>
        <span className="text-sm font-bold text-red-600 dark:text-red-400 tabular-nums">
          {formatPrice(item.itemPrice)}
        </span>
        <div className="flex items-center gap-2">
          <StarRating rating={item.reviewAverage} />
          {item.reviewCount > 0 && (
            <span className="text-[10px] text-theme-600 dark:text-theme-300">({item.reviewCount})</span>
          )}
        </div>
        {item.shopName && (
          <span className="text-[10px] text-theme-600 dark:text-theme-300 truncate">{item.shopName}</span>
        )}
      </div>
    </a>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-2">
      {[...Array(3)].map((_, i) => (
        <div key={`skel-${i}`} className="flex items-start gap-2.5 p-2">
          <div className="w-6 h-6 rounded-full bg-theme-200/50 dark:bg-theme-900/20 animate-pulse shrink-0" />
          <div className="w-14 h-14 rounded-md bg-theme-200/50 dark:bg-theme-900/20 animate-pulse shrink-0" />
          <div className="flex flex-col gap-1.5 flex-1">
            <div className="h-3 w-3/4 bg-theme-200/50 dark:bg-theme-900/20 rounded animate-pulse" />
            <div className="h-4 w-20 bg-theme-200/50 dark:bg-theme-900/20 rounded animate-pulse" />
            <div className="h-3 w-24 bg-theme-200/50 dark:bg-theme-900/20 rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

const PERIOD_TABS = [
  { id: "daily", label: "デイリー" },
  { id: "realtime", label: "リアルタイム" },
];

const DEFAULT_GENRES = [{ id: "", label: "総合" }];

export default function Component({ service }) {
  const { widget } = service;
  const genres = widget.genres?.length ? widget.genres : DEFAULT_GENRES;
  const showGenres = genres.length > 1;

  const [activeGenre, setActiveGenre] = useState(widget.defaultGenre ?? genres[0]?.id ?? "");
  const [activeTab, setActiveTab] = useState("daily");

  const refreshInterval = widget.refreshInterval || 900000;
  const endpoint = activeGenre ? `${activeTab}_${activeGenre}` : activeTab;
  const url = formatProxyUrl(widget, endpoint);
  const signalEndpoint = activeGenre ? `signals_${activeGenre}` : "signals";
  const signalUrl = widget.signal?.enabled ? formatProxyUrl(widget, signalEndpoint) : null;

  const { data, error, mutate } = useSWR(url, {
    refreshInterval,
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 60000,
  });

  const { data: signalData } = useSWR(signalUrl, {
    refreshInterval,
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 60000,
  });

  const handleRefresh = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      mutate();
    },
    [mutate],
  );

  const currentError = data?.error ?? error;
  if (currentError) {
    return <Container service={service} error={currentError} />;
  }

  return (
    <Container service={service}>
      <div className="flex flex-col w-full min-w-0">
        <SignalPanel data={signalData} />

        {/* Genre selector */}
        {showGenres && (
          <div className="flex items-center gap-1 px-2 pt-1.5 pb-0.5 overflow-x-auto scrollbar-none">
            {genres.map((genre) => (
              <button
                key={genre.id}
                type="button"
                onClick={() => setActiveGenre(genre.id)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap transition-colors ${
                  activeGenre === genre.id
                    ? "bg-theme-600/80 dark:bg-theme-300/80 text-white dark:text-theme-900 shadow-sm"
                    : "text-theme-500 dark:text-theme-400 hover:bg-theme-200/50 dark:hover:bg-theme-700/40"
                }`}
              >
                {genre.label}
              </button>
            ))}
          </div>
        )}

        {/* Period tabs + controls */}
        <div className="flex items-center justify-between px-2 pt-1 pb-1">
          <div className="flex gap-1">
            {PERIOD_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeTab === tab.id
                    ? "bg-red-500/90 text-white shadow-sm"
                    : "text-theme-500 dark:text-theme-400 hover:bg-theme-200/50 dark:hover:bg-theme-700/40"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {data?.lastBuildDate && (
              <span className="text-[10px] text-theme-600 dark:text-theme-300 tabular-nums">
                {new Date(data.lastBuildDate).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <button
              type="button"
              onClick={handleRefresh}
              className="p-1 rounded hover:bg-theme-200/50 dark:hover:bg-theme-700/50 transition-colors text-theme-400 dark:text-theme-500"
              title="更新"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        {!data ? (
          <LoadingSkeleton />
        ) : (
          <div className="flex flex-col divide-y divide-theme-200/30 dark:divide-theme-700/30 max-h-[480px] overflow-y-auto scrollbar-thin scrollbar-thumb-theme-300/50 dark:scrollbar-thumb-theme-600/50 scrollbar-track-transparent">
            {data.items?.length > 0 ? (
              data.items.map((item) => <ItemCard key={`${endpoint}-${item.rank}`} item={item} />)
            ) : (
              <div className="text-xs text-theme-400 dark:text-theme-500 italic text-center py-4">
                ランキングデータがありません
              </div>
            )}
          </div>
        )}
      </div>
    </Container>
  );
}
