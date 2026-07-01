import Container from "components/services/widget/container";
import { useTranslation } from "next-i18next/pages";
import { useCallback, useState } from "react";

import useWidgetAPI from "utils/proxy/use-widget-api";

export default function Component({ service }) {
  const { t } = useTranslation();
  const { widget } = service;
  const [refreshKey, setRefreshKey] = useState(0);

  const refreshInterval = widget.refreshInterval || 900000; // Default 15 minutes

  const { data, error, mutate } = useWidgetAPI(widget, null, {
    refreshInterval: Math.max(1000, refreshInterval),
    refreshKey,
  });

  const handleRefresh = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setRefreshKey((prev) => prev + 1);
    mutate();
  }, [mutate]);

  if (error) {
    return <Container service={service} error={error} />;
  }

  if (!data) {
    return (
      <Container service={service}>
        <div className="flex flex-col w-full">
          <div className="bg-theme-200/50 dark:bg-theme-900/20 rounded-sm m-1 flex-1 flex flex-row items-center justify-between p-1 text-xs animate-pulse">
            <div className="font-thin pl-2">読み込み中...</div>
          </div>
        </div>
      </Container>
    );
  }

  const items = data?.items || [];

  return (
    <Container service={service}>
      <div className="flex flex-col w-full">
        {/* Header with refresh button */}
        <div className="flex justify-end px-1 mb-1">
          <button
            type="button"
            onClick={handleRefresh}
            className="p-1 rounded hover:bg-theme-200 dark:hover:bg-theme-700 transition-colors text-theme-500 dark:text-theme-400"
            title="更新"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-3 w-3"
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
          </button>
        </div>

        {/* News list */}
        {items.length === 0 ? (
          <div className="bg-theme-200/50 dark:bg-theme-900/20 rounded-sm m-1 flex-1 flex flex-row items-center justify-center p-2 text-xs">
            <div className="font-thin">ニュースがありません</div>
          </div>
        ) : (
          items.map((item, index) => (
            <a
              key={`${item.title}-${index}`}
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-theme-200/50 dark:bg-theme-900/20 hover:bg-theme-300/50 dark:hover:bg-theme-800/30 rounded-sm mx-1 mb-1 p-1.5 text-xs transition-colors"
            >
              <div className="font-medium text-theme-700 dark:text-theme-300 line-clamp-2">
                {item.title}
              </div>
            </a>
          ))
        )}
      </div>
    </Container>
  );
}
