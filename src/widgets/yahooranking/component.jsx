import Container from "components/services/widget/container";
import { useState, useCallback } from "react";
import useSWR from "swr";

import { formatProxyUrl } from "utils/proxy/api-helpers";

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

function VectorIndicator({ vector, preRank, rank }) {
  const diff = preRank && rank ? preRank - rank : 0;

  if (vector === "up") {
    return (
      <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 shrink-0">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
        {diff > 0 && <span className="text-[10px] font-medium">{diff}</span>}
      </span>
    );
  }
  if (vector === "down") {
    return (
      <span className="inline-flex items-center gap-0.5 text-rose-500 dark:text-rose-400 shrink-0">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
        {diff < 0 && <span className="text-[10px] font-medium">{Math.abs(diff)}</span>}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-theme-400 dark:text-theme-500 shrink-0">
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
      </svg>
    </span>
  );
}

function KeywordItem({ item }) {
  const hasRelational = item.relational?.length > 0;

  return (
    <div className="relative group">
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-theme-200/40 dark:hover:bg-theme-700/30 transition-colors min-w-0">
        <RankBadge rank={item.rank} />
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-theme-700 dark:text-theme-200 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors truncate flex-1 min-w-0"
        >
          {item.query}
        </a>
        <VectorIndicator vector={item.vector} preRank={item.preRank} rank={item.rank} />
        {hasRelational && (
          <span className="text-[9px] text-theme-400 dark:text-theme-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            +{item.relational.length}
          </span>
        )}
      </div>

      {hasRelational && (
        <div className="absolute left-0 top-full z-20 hidden group-hover:block pt-0.5" style={{ minWidth: "max-content", maxWidth: "320px" }}>
          <div className="flex flex-wrap gap-1 px-2 py-1.5 rounded-lg bg-white/95 dark:bg-theme-800/95 shadow-lg ring-1 ring-theme-200/50 dark:ring-theme-700/50 backdrop-blur-sm">
            {item.relational.map((rel) => (
              <a
                key={rel.query}
                href={rel.url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-1.5 py-0.5 rounded text-[11px] bg-theme-100 dark:bg-theme-700/60 text-theme-600 dark:text-theme-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:text-blue-600 dark:hover:text-blue-400 transition-colors whitespace-nowrap"
              >
                {rel.query}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 p-2">
      {[...Array(10)].map((_, i) => (
        <div key={`skel-${i}`} className="flex items-center gap-2 px-2 py-1.5">
          <div className="w-6 h-6 rounded-full bg-theme-200/50 dark:bg-theme-900/20 animate-pulse shrink-0" />
          <div className="h-4 flex-1 bg-theme-200/50 dark:bg-theme-900/20 rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}

const TYPE_TABS = [
  { id: "ranking", label: "キーワードランキング" },
  { id: "up", label: "急上昇キーワード" },
];

export default function Component({ service }) {
  const { widget } = service;
  const [activeTab, setActiveTab] = useState("ranking");

  const refreshInterval = widget.refreshInterval || 900000;
  const url = formatProxyUrl(widget, activeTab);

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
        {/* Type tabs + controls */}
        <div className="flex items-center justify-between px-2 pt-1 pb-1">
          <div className="flex gap-1">
            {TYPE_TABS.map((tab) => (
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
            {data?.lastModified && (
              <span className="text-[10px] text-theme-600 dark:text-theme-300 tabular-nums">
                {data.lastModified}
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
          <div className="max-h-[540px] overflow-y-auto scrollbar-thin scrollbar-thumb-theme-300/50 dark:scrollbar-thumb-theme-600/50 scrollbar-track-transparent">
            {data.items?.length > 0 ? (
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 p-1.5">
                {data.items.map((item) => <KeywordItem key={`${activeTab}-${item.rank}`} item={item} />)}
              </div>
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
