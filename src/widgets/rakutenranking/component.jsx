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

  const { data, error, mutate } = useSWR(url, {
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
