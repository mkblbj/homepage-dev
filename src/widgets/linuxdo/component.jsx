import Container from "components/services/widget/container";
import { useTranslation } from "next-i18next/pages";
import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";

import { formatProxyUrl } from "utils/proxy/api-helpers";

const defaultRefreshInterval = 900000;
const defaultFeeds = [
  { id: "latest", label: "最新" },
  { id: "ai", label: "AI" },
];

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-2">
      {[...Array(4)].map((_, index) => (
        <div
          key={`linuxdo-skeleton-${index}`}
          className="rounded-lg border border-theme-200/40 bg-theme-200/30 p-2.5 dark:border-theme-700/40 dark:bg-theme-900/20"
        >
          <div className="mb-2 h-3.5 w-4/5 animate-pulse rounded bg-theme-300/50 dark:bg-theme-700/50" />
          <div className="mb-2 h-3 w-2/3 animate-pulse rounded bg-theme-300/40 dark:bg-theme-700/40" />
          <div className="h-3 w-full animate-pulse rounded bg-theme-300/30 dark:bg-theme-700/30" />
        </div>
      ))}
    </div>
  );
}

function formatRelativeDate(t, value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return t("common.relativeDate", { value: date });
}

function formatBuildDate(value, locale) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function TopicCard({ item, t }) {
  const meta = [item.author, item.category, formatRelativeDate(t, item.pubDate)].filter(Boolean).join(" · ");

  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-lg border border-theme-200/40 bg-theme-200/30 p-2.5 transition-colors hover:bg-theme-300/40 dark:border-theme-700/40 dark:bg-theme-900/20 dark:hover:bg-theme-800/30"
    >
      <div className="mb-1.5 line-clamp-2 text-sm font-medium leading-snug text-theme-800 dark:text-theme-100">
        {item.title}
      </div>
      {meta && <div className="mb-1 text-[11px] text-theme-500 dark:text-theme-400">{meta}</div>}
      {item.excerpt && (
        <div className="line-clamp-1 text-xs leading-relaxed text-theme-600 dark:text-theme-300">{item.excerpt}</div>
      )}
    </a>
  );
}

export default function Component({ service }) {
  const { t, i18n } = useTranslation();
  const { widget } = service;
  const feeds = widget.feeds?.length ? widget.feeds : defaultFeeds;
  const [activeFeed, setActiveFeed] = useState(widget.defaultFeed ?? feeds[0]?.id ?? defaultFeeds[0].id);

  useEffect(() => {
    const feedExists = feeds.some((feed) => feed.id === activeFeed);
    if (!feedExists && feeds[0]?.id) {
      setActiveFeed(feeds[0].id);
    }
  }, [activeFeed, feeds]);

  const refreshInterval = widget.refreshInterval || defaultRefreshInterval;
  const url = activeFeed ? formatProxyUrl(widget, activeFeed) : null;

  const { data, error, mutate } = useSWR(url, {
    refreshInterval,
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 60000,
  });

  const handleRefresh = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
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
      <div className="flex w-full min-w-0 flex-col">
        <div className="flex items-center justify-between px-2 pt-1.5 pb-1">
          <div className="flex gap-1 overflow-x-auto scrollbar-none">
            {feeds.map((feed) => (
              <button
                key={feed.id}
                type="button"
                onClick={() => setActiveFeed(feed.id)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                  activeFeed === feed.id
                    ? "bg-theme-600/80 text-white shadow-sm dark:bg-theme-300/80 dark:text-theme-900"
                    : "text-theme-500 hover:bg-theme-200/50 dark:text-theme-400 dark:hover:bg-theme-700/40"
                }`}
              >
                {feed.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {data?.lastBuildDate && (
              <span className="text-[10px] text-theme-500 dark:text-theme-400 tabular-nums">
                {formatBuildDate(data.lastBuildDate, i18n.language)}
              </span>
            )}

            <button
              type="button"
              onClick={handleRefresh}
              className="rounded p-1 text-theme-400 transition-colors hover:bg-theme-200/50 hover:text-theme-600 dark:text-theme-500 dark:hover:bg-theme-700/50 dark:hover:text-theme-300"
              title="Refresh"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {!data ? (
          <LoadingSkeleton />
        ) : data.items?.length > 0 ? (
          <div className="flex max-h-[480px] flex-col gap-2 overflow-y-auto px-2 pb-2 scrollbar-thin scrollbar-thumb-theme-300/50 scrollbar-track-transparent dark:scrollbar-thumb-theme-600/50">
            {data.items.map((item, index) => (
              <TopicCard key={`${data.feedId}-${item.link || item.title}-${index}`} item={item} t={t} />
            ))}
          </div>
        ) : (
          <div className="px-2 pb-2">
            <div className="rounded-lg border border-dashed border-theme-300/50 px-3 py-6 text-center text-xs text-theme-500 dark:border-theme-700/50 dark:text-theme-400">
              No topics found
            </div>
          </div>
        )}
      </div>
    </Container>
  );
}
