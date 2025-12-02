import Container from "components/services/widget/container";
import { useTranslation } from "next-i18next";
import { useCallback, useState } from "react";

import useWidgetAPI from "utils/proxy/use-widget-api";

export default function Component({ service }) {
  const { t } = useTranslation();
  const { widget } = service;
  const [refreshKey, setRefreshKey] = useState(0);

  // Default 1 hour refresh interval
  const refreshInterval = widget.refreshInterval || 3600000;

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

  const count = data?.message?.count || 0;
  const employees = data?.message?.employees || [];

  return (
    <Container service={service}>
      <div className="flex flex-wrap gap-1 w-full items-center content-start">
        {/* Stats and Refresh Badge */}
        <div className="bg-emerald-500/20 dark:bg-emerald-700/30 rounded-md px-2 py-1 flex flex-row items-center text-xs border border-emerald-500/20 shrink-0">
          <span className="font-bold text-emerald-600 dark:text-emerald-400 mr-1.5">
            {count}人
          </span>
          <button
            type="button"
            onClick={handleRefresh}
            className="p-0.5 rounded-full hover:bg-emerald-500/30 transition-colors text-emerald-600 dark:text-emerald-400 -mr-1"
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

        {/* Employee Badges */}
        {employees.map((employee, index) => (
          <div
            key={`${employee.employee}-${index}`}
            className="bg-theme-200/50 dark:bg-theme-900/20 rounded-md px-2 py-1 text-xs font-medium text-theme-700 dark:text-theme-300 border border-theme-200 dark:border-theme-700/50 shrink-0"
          >
            {employee.employee_name}
          </div>
        ))}
        
        {employees.length === 0 && (
           <div className="text-xs font-thin opacity-70 ml-1">出勤者なし</div>
        )}
      </div>
    </Container>
  );
}
