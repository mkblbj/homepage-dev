import Container from "components/services/widget/container";
import { useCallback, useState, useMemo } from "react";

import useWidgetAPI from "utils/proxy/use-widget-api";

const DEPARTMENT_CATEGORY_ORDER = ["Office", "Production"];
const DEPARTMENT_CATEGORY_LABELS = {
  Office: "オフィス",
  Production: "生産",
};
const SHIFT_BADGE_STYLES = {
  "9-12": "border border-cyan-200/80 bg-cyan-100/75 text-cyan-700 dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-200",
  "9-16": "border border-sky-200/80 bg-sky-100/75 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200",
  "9-17": "border border-blue-200/80 bg-blue-100/75 text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200",
  "9-18": "border border-emerald-200/80 bg-emerald-100/75 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200",
  "10-16": "border border-amber-200/80 bg-amber-100/75 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200",
  "10-17": "border border-orange-200/80 bg-orange-100/75 text-orange-700 dark:border-orange-400/20 dark:bg-orange-400/10 dark:text-orange-200",
  "10-18": "border border-rose-200/80 bg-rose-100/75 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200",
  "13-18": "border border-fuchsia-200/80 bg-fuchsia-100/75 text-fuchsia-700 dark:border-fuchsia-400/20 dark:bg-fuchsia-400/10 dark:text-fuchsia-200",
};

function groupEmployeesByDepartment(employees) {
  const groups = {};

  employees.forEach((employee) => {
    const department = employee.department || "未分類";
    if (!groups[department]) {
      groups[department] = [];
    }
    groups[department].push(employee);
  });

  return Object.keys(groups)
    .sort((a, b) => {
      if (a === "未分類") return 1;
      if (b === "未分類") return -1;
      return a.localeCompare(b, "ja");
    })
    .map((department) => ({
      name: department,
      employees: groups[department],
    }));
}

function formatScheduledShift(employee) {
  if (employee?.shift_label) {
    return employee.shift_label;
  }

  if (employee?.scheduled_time) {
    return employee.scheduled_time;
  }

  if (employee?.start_time && employee?.end_time) {
    return `${employee.start_time}-${employee.end_time}`;
  }

  return "未設定";
}

function getTomorrowDepartmentGroups(snapshot) {
  const departmentCounts = {};
  const employeesByCategory = {};

  (snapshot?.employees || []).forEach((employee) => {
    const category = employee.department_category || "Other";
    if (!employeesByCategory[category]) {
      employeesByCategory[category] = [];
    }
    employeesByCategory[category].push(employee);
  });

  if (snapshot?.departments && Object.keys(snapshot.departments).length > 0) {
    Object.entries(snapshot.departments).forEach(([category, department]) => {
      departmentCounts[category] = department?.count ?? employeesByCategory[category]?.length ?? 0;
    });
  }

  Object.keys(employeesByCategory).forEach((category) => {
    if (departmentCounts[category] === undefined) {
      departmentCounts[category] = employeesByCategory[category].length;
    }
  });

  const orderedCategories = [
    ...DEPARTMENT_CATEGORY_ORDER.filter((category) => departmentCounts[category] !== undefined),
    ...Object.keys(departmentCounts)
      .filter((category) => !DEPARTMENT_CATEGORY_ORDER.includes(category))
      .sort((a, b) => a.localeCompare(b, "ja")),
  ];

  return orderedCategories.map((category) => ({
    key: category,
    label: DEPARTMENT_CATEGORY_LABELS[category] || category,
    count: departmentCounts[category] ?? 0,
    employees: (employeesByCategory[category] || []).sort((a, b) => {
      const shiftCompare = formatScheduledShift(a).localeCompare(formatScheduledShift(b), "ja");
      if (shiftCompare !== 0) {
        return shiftCompare;
      }
      return (a.employee_name || "").localeCompare(b.employee_name || "", "ja");
    }),
  }));
}

function formatShortDate(dateString) {
  if (!dateString) {
    return null;
  }

  const [, month, day] = dateString.split("-");
  if (!month || !day) {
    return dateString;
  }

  return `${Number(month)}/${Number(day)}`;
}

function formatCurrentTime(date) {
  if (!(date instanceof Date)) {
    return null;
  }

  return date.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getShiftBadgeClass(shift) {
  return SHIFT_BADGE_STYLES[shift] || "border border-theme-300/70 bg-theme-100/80 text-theme-700 dark:border-theme-600/40 dark:bg-theme-700/30 dark:text-theme-200";
}

export default function Component({ service }) {
  const { widget } = service;
  const [refreshKey, setRefreshKey] = useState(0);

  const refreshInterval = Math.max(1000, widget.refreshInterval || 3600000);

  const { data: actualData, error: actualError, mutate: mutateActual } = useWidgetAPI(widget, "actual", {
    refreshKey,
    refreshInterval,
  });

  const { data: scheduleData, error: scheduleError, mutate: mutateSchedule } = useWidgetAPI(
    widget,
    widget.scheduleUrl ? "schedule" : "",
    {
      day: "tomorrow",
      refreshKey,
      refreshInterval,
    },
  );

  const actualEmployees = actualData?.message?.employees || [];
  const actualCount = actualData?.message?.count || 0;

  const groupedEmployees = useMemo(() => groupEmployeesByDepartment(actualEmployees), [actualEmployees]);

  const tomorrowSnapshot = useMemo(() => scheduleData?.message?.tomorrow ?? scheduleData?.message ?? null, [scheduleData]);
  const tomorrowCount = tomorrowSnapshot?.count ?? 0;
  const tomorrowDate = formatShortDate(tomorrowSnapshot?.date);
  const tomorrowDepartments = useMemo(() => getTomorrowDepartmentGroups(tomorrowSnapshot), [tomorrowSnapshot]);
  const actualUpdatedTime = useMemo(() => formatCurrentTime(new Date()), [actualData, refreshKey]);

  const handleRefresh = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setRefreshKey((prev) => prev + 1);
    mutateActual();
    if (widget.scheduleUrl) {
      mutateSchedule();
    }
  }, [mutateActual, mutateSchedule, widget.scheduleUrl]);

  if (actualError) {
    return <Container service={service} error={actualError} />;
  }

  if (!actualData) {
    return (
      <Container service={service}>
        <div className="flex flex-col w-full gap-2 p-1">
          <div className="h-5 w-20 bg-theme-200/50 dark:bg-theme-900/20 rounded animate-pulse" />
          <div className="flex flex-wrap gap-1">
            <div className="h-5 w-14 bg-theme-200/50 dark:bg-theme-900/20 rounded animate-pulse" />
            <div className="h-5 w-12 bg-theme-200/50 dark:bg-theme-900/20 rounded animate-pulse" />
            <div className="h-5 w-16 bg-theme-200/50 dark:bg-theme-900/20 rounded animate-pulse" />
          </div>
          <div className="h-16 bg-orange-200/20 dark:bg-orange-900/10 rounded-lg animate-pulse" />
        </div>
      </Container>
    );
  }

  return (
    <Container service={service}>
      <div className="flex flex-col w-full gap-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-[10px] font-semibold tracking-wide text-theme-500 dark:text-theme-400">
              現在
            </span>
            <span className="text-[13px] font-bold text-theme-700 dark:text-theme-100 tabular-nums">
              {actualUpdatedTime}
            </span>
            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {actualCount} 名
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

        {groupedEmployees.length === 0 ? (
          <div className="text-xs text-theme-400 dark:text-theme-500 italic text-center py-2">
            現在、出勤者はいません
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {groupedEmployees.map(({ name, employees: deptEmployees }) => (
              <div key={name} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 border-b border-theme-200/50 dark:border-theme-700/40 pb-1">
                  <span className="text-[10px] font-semibold text-theme-500 dark:text-theme-400">
                    {name.replace(" - UO", "")}
                  </span>
                  <span className="text-[10px] font-bold text-orange-500 dark:text-orange-400">
                    {deptEmployees.length}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
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

        {widget.scheduleUrl && (
          <div className="rounded-lg border border-orange-200/50 dark:border-orange-900/30 bg-orange-500/5 px-2 py-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-[10px] font-semibold tracking-wide text-orange-600 dark:text-orange-400">
                明日予定
              </span>
              {tomorrowDate ? (
                <span className="text-[13px] font-bold text-theme-700 dark:text-theme-100 tabular-nums">
                  {tomorrowDate}
                </span>
              ) : null}
              {scheduleError ? (
                <span className="text-[10px] text-theme-400 dark:text-theme-500">
                  --
                </span>
              ) : scheduleData ? (
                <span className="text-sm font-bold text-orange-500 dark:text-orange-400 tabular-nums">
                  {tomorrowCount} 名
                </span>
              ) : (
                <div className="h-4 w-10 rounded bg-orange-200/40 dark:bg-orange-900/30 animate-pulse" />
              )}
            </div>

            {scheduleError ? (
              <div className="mt-2 text-[10px] text-theme-400 dark:text-theme-500">
                明日予定を取得できませんでした
              </div>
            ) : !scheduleData ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="h-11 rounded-md bg-theme-100/60 dark:bg-theme-900/20 animate-pulse" />
                <div className="h-11 rounded-md bg-theme-100/60 dark:bg-theme-900/20 animate-pulse" />
              </div>
            ) : tomorrowDepartments.length === 0 ? (
              <div className="mt-2 text-[10px] text-theme-400 dark:text-theme-500">
                明日の予定はありません
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {tomorrowDepartments.map(({ key, label, count, employees }) => (
                  <div
                    key={key}
                    className="rounded-md border border-orange-200/40 dark:border-orange-900/20 bg-theme-100/60 dark:bg-theme-900/20 px-2 py-2"
                  >
                    <div className="flex items-center gap-1.5 border-b border-theme-200/40 dark:border-theme-700/30 pb-1">
                      <span className="text-[10px] font-semibold text-theme-600 dark:text-theme-300">
                        {label}
                      </span>
                      <span className="text-[11px] font-bold text-orange-500 dark:text-orange-400 tabular-nums">
                        {count}
                      </span>
                    </div>

                    {employees.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {employees.map((employee, index) => (
                          <div
                            key={`${key}-${employee.employee}-${index}`}
                            className="inline-flex items-center gap-1 bg-theme-100/60 dark:bg-theme-800/50 hover:bg-theme-200/70 dark:hover:bg-theme-700/60 transition-colors rounded px-1.5 py-0.5 text-xs text-theme-700 dark:text-theme-200 border border-theme-200/40 dark:border-theme-700/30"
                          >
                            <span className="leading-tight">
                              {employee.employee_name}
                            </span>
                            <span
                              className={`rounded px-1 py-px text-[9px] font-bold leading-tight tabular-nums ${getShiftBadgeClass(
                                formatScheduledShift(employee),
                              )}`}
                            >
                              {formatScheduledShift(employee)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 text-[10px] text-theme-400 dark:text-theme-500">
                        {count === 0 ? "予定なし" : "明細なし"}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Container>
  );
}
