import Container from "components/services/widget/container";
import { useCallback, useState, useMemo } from "react";

import useWidgetAPI from "utils/proxy/use-widget-api";

export default function Component({ service }) {
  const { widget } = service;
  const [refreshKey, setRefreshKey] = useState(0);

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

  const employees = data?.message?.employees || [];
  const count = data?.message?.count || 0;

  // Group employees by department
  const groupedEmployees = useMemo(() => {
    const groups = {};
    employees.forEach((emp) => {
      const dept = emp.department || "未分類";
      if (!groups[dept]) {
        groups[dept] = [];
      }
      groups[dept].push(emp);
    });
    
    // Sort: 未分類 at the end
    const sorted = Object.keys(groups).sort((a, b) => {
      if (a === "未分類") return 1;
      if (b === "未分類") return -1;
      return a.localeCompare(b, "ja");
    });
    
    return sorted.map((dept) => ({
      name: dept,
      employees: groups[dept],
    }));
  }, [employees]);

  if (error) {
    return <Container service={service} error={error} />;
  }

  if (!data) {
    return (
      <Container service={service}>
        <div className="flex flex-col w-full gap-2 p-1">
          <div className="h-5 w-20 bg-theme-200/50 dark:bg-theme-900/20 rounded animate-pulse" />
          <div className="flex flex-wrap gap-1">
            <div className="h-5 w-14 bg-theme-200/50 dark:bg-theme-900/20 rounded animate-pulse" />
            <div className="h-5 w-12 bg-theme-200/50 dark:bg-theme-900/20 rounded animate-pulse" />
            <div className="h-5 w-16 bg-theme-200/50 dark:bg-theme-900/20 rounded animate-pulse" />
          </div>
        </div>
      </Container>
    );
  }

  return (
    <Container service={service}>
      <div className="flex flex-col w-full gap-2">
        {/* Header */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="text-emerald-600 dark:text-emerald-400 font-bold text-sm tabular-nums">
              {count}
            </span>
            <span className="text-[10px] text-theme-500 dark:text-theme-400 opacity-70">
              名出勤中
            </span>
          </div>
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

        {/* Departments */}
        {groupedEmployees.length === 0 ? (
          <div className="text-xs text-theme-400 dark:text-theme-500 italic text-center py-2">
            現在、出勤者はいません
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 max-h-[280px] overflow-y-auto scrollbar-thin scrollbar-thumb-theme-300 dark:scrollbar-thumb-theme-700">
            {groupedEmployees.map(({ name, employees: deptEmployees }) => (
              <div key={name} className="flex flex-col gap-1">
                {/* Department Header */}
                <div className="flex items-center gap-1.5 px-1">
                  <span className="text-[10px] font-semibold text-theme-500 dark:text-theme-400 whitespace-nowrap">
                    {name.replace(" - UO", "")}
                  </span>
                  <span className="text-[9px] text-theme-400 dark:text-theme-500 opacity-60">
                    ({deptEmployees.length})
                  </span>
                  <div className="flex-1 h-px bg-theme-200/50 dark:bg-theme-700/40" />
                </div>
                {/* Employee Badges */}
                <div className="flex flex-wrap gap-1 px-1">
                  {deptEmployees.map((emp, idx) => (
                    <div
                      key={`${emp.employee}-${idx}`}
                      className="bg-theme-100/60 dark:bg-theme-800/50 hover:bg-theme-200/70 dark:hover:bg-theme-700/60 transition-colors rounded px-1.5 py-0.5 text-xs text-theme-700 dark:text-theme-200 border border-theme-200/40 dark:border-theme-700/30"
                    >
                      {emp.employee_name}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Container>
  );
}
