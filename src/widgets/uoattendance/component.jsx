import Container from "components/services/widget/container";
import { useCallback, useState, useMemo } from "react";

import {
  buildTodayAttendanceModel,
  buildTomorrowScheduleModel,
  formatScheduledFte,
} from "./attendance-model.mjs";

import useWidgetAPI from "utils/proxy/use-widget-api";

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

const SHIFT_BADGE_BASE =
  "shrink-0 whitespace-nowrap rounded px-1 py-px text-[9px] font-bold leading-tight tabular-nums";

const TOMORROW_CHIP_CLASS =
  "border-theme-200/40 bg-theme-100/60 text-theme-700 hover:bg-theme-200/70 dark:border-theme-700/30 dark:bg-theme-800/50 dark:text-theme-200 dark:hover:bg-theme-700/60";

function AttendanceChip({ employee, variant, showShift }) {
  const isToday = variant === "today";
  const chipClass = isToday ? employee.statusMeta.chipClass : TOMORROW_CHIP_CLASS;
  // 出勤中已由色块表达,状态文字仅在例外状态(未打刻/退勤済)才显示。
  const showStatusLabel = isToday && employee.statusMeta?.tone !== "working";
  const showTime = isToday && Boolean(employee.displayTime);

  return (
    <div
      className={`inline-flex min-h-7 items-center gap-1 rounded border px-1.5 py-0.5 text-xs transition-colors ${chipClass}`}
      title={
        isToday
          ? [
              employee.employee_name,
              employee.shiftText,
              employee.attendance_status_label,
              employee.displayTime ? `${employee.last_log_type} ${employee.displayTime}` : "",
            ]
              .filter(Boolean)
              .join(" / ")
          : undefined
      }
    >
      {isToday ? (
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${employee.statusMeta.dotClass}`} />
      ) : null}
      <span className="leading-tight">{employee.employee_name}</span>
      {showShift ? (
        <span className={`${SHIFT_BADGE_BASE} ${employee.shiftBadgeClass}`}>{employee.shiftText}</span>
      ) : null}
      {showStatusLabel ? (
        <span className="shrink-0 whitespace-nowrap text-[10px] font-semibold leading-tight">
          {employee.attendance_status_label}
        </span>
      ) : null}
      {showTime ? (
        <span className="shrink-0 whitespace-nowrap text-[10px] leading-tight tabular-nums">
          {employee.displayTime}
        </span>
      ) : null}
    </div>
  );
}

export default function Component({ service }) {
  const { widget } = service;
  const [refreshKey, setRefreshKey] = useState(0);

  const refreshInterval = Math.max(1000, widget.refreshInterval || 3600000);

  const { data: actualData, error: actualError, mutate: mutateActual } = useWidgetAPI(widget, "actual", {
    refreshKey,
    refreshInterval,
  });

  const {
    data: todayScheduleData,
    error: todayScheduleError,
    mutate: mutateTodaySchedule,
  } = useWidgetAPI(
    widget,
    widget.scheduleUrl ? "schedule" : "",
    {
      day: "today",
      refreshKey,
      refreshInterval,
    },
  );

  const {
    data: tomorrowScheduleData,
    error: tomorrowScheduleError,
    mutate: mutateTomorrowSchedule,
  } = useWidgetAPI(
    widget,
    widget.scheduleUrl ? "schedule" : "",
    {
      day: "tomorrow",
      refreshKey,
      refreshInterval,
    },
  );

  const actualEmployees = useMemo(() => actualData?.message?.employees || [], [actualData]);

  const todaySnapshot = useMemo(
    () => todayScheduleData?.message?.today ?? todayScheduleData?.message ?? null,
    [todayScheduleData],
  );
  const tomorrowSnapshot = useMemo(
    () => tomorrowScheduleData?.message?.tomorrow ?? tomorrowScheduleData?.message ?? null,
    [tomorrowScheduleData],
  );

  const todayModel = useMemo(
    () => buildTodayAttendanceModel({ todaySnapshot, actualEmployees }),
    [todaySnapshot, actualEmployees],
  );
  const tomorrowModel = useMemo(
    () => buildTomorrowScheduleModel(tomorrowSnapshot),
    [tomorrowSnapshot],
  );

  const todayDate = formatShortDate(todayModel.date);
  const tomorrowDate = formatShortDate(tomorrowModel.date);
  const actualUpdatedTime = formatCurrentTime(new Date());

  const handleRefresh = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setRefreshKey((prev) => prev + 1);
    mutateActual();
    if (widget.scheduleUrl) {
      mutateTodaySchedule();
      mutateTomorrowSchedule();
    }
  }, [mutateActual, mutateTodaySchedule, mutateTomorrowSchedule, widget.scheduleUrl]);

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
      <div className="@container flex flex-col w-full gap-2.5">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-[10px] font-semibold tracking-wide text-theme-500 dark:text-theme-400">
              現在
            </span>
            <span className="text-[13px] font-bold text-theme-700 dark:text-theme-100 tabular-nums">
              {actualUpdatedTime}
            </span>
            {todayDate ? (
              <span className="text-[11px] font-semibold text-theme-500 dark:text-theme-400 tabular-nums">
                {todayDate}
              </span>
            ) : null}
            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {todayModel.summary.workingCount + todayModel.summary.unscheduledWorkingCount} 名出勤中
            </span>
            {todayModel.hasRoster ? (
              <span className="text-[11px] font-bold text-theme-600 dark:text-theme-300 tabular-nums">
                / {todayModel.summary.scheduledCount} 名予定
              </span>
            ) : null}
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

        {widget.scheduleUrl && todayScheduleError ? (
          <div className="text-[10px] text-theme-400 dark:text-theme-500">
            今日予定を取得できませんでした。現在出勤中のみ表示しています。
          </div>
        ) : null}

        {todayModel.groups.length === 0 ? (
          <div className="text-xs text-theme-400 dark:text-theme-500 italic text-center py-2">
            {todayModel.hasRoster ? "本日の予定はありません" : "現在、出勤者はいません"}
          </div>
        ) : (
          <div className="grid grid-cols-1 @sm:grid-cols-2 gap-x-3 gap-y-2">
            {todayModel.groups.map(({ key, label, count, workingCount, totalCount, scheduledFte, employees }) => {
              const showAttendanceRatio = todayModel.hasRoster && (key === "Office" || key === "Production");
              const scheduledFteText = key === "Production" ? formatScheduledFte(scheduledFte) : null;

              return (
                <div key={key} className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 border-b border-theme-200/50 dark:border-theme-700/40 pb-0.5">
                    <span className="text-[10px] font-semibold text-theme-500 dark:text-theme-400">
                      {label.replace(" - UO", "")}
                    </span>
                    <span className="text-[10px] font-bold text-orange-500 dark:text-orange-400 tabular-nums">
                      {showAttendanceRatio ? `${workingCount ?? 0}/${totalCount ?? count}` : count}
                    </span>
                    {scheduledFteText ? (
                      <span className="text-[10px] font-bold text-orange-500 dark:text-orange-400 tabular-nums">
                        ｜ 換算 {scheduledFteText}人
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {employees.map((employee, index) => (
                      <AttendanceChip
                        key={`${key}-${employee.employee}-${index}`}
                        employee={employee}
                        variant="today"
                        showShift={todayModel.hasRoster}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {widget.scheduleUrl && (
          <div className="rounded-lg border border-orange-200/50 dark:border-orange-900/30 bg-orange-500/5 px-2 py-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-[10px] font-semibold tracking-wide text-orange-600 dark:text-orange-400">
                明日予定
              </span>
              {tomorrowDate ? (
                <span className="text-[13px] font-bold text-theme-700 dark:text-theme-100 tabular-nums">
                  {tomorrowDate}
                </span>
              ) : null}
              {tomorrowScheduleError ? (
                <span className="text-[10px] text-theme-400 dark:text-theme-500">
                  --
                </span>
              ) : tomorrowScheduleData ? (
                <span className="text-sm font-bold text-orange-500 dark:text-orange-400 tabular-nums">
                  {tomorrowModel.count} 名
                </span>
              ) : (
                <div className="h-4 w-10 rounded bg-orange-200/40 dark:bg-orange-900/30 animate-pulse" />
              )}
            </div>

            {tomorrowScheduleError ? (
              <div className="mt-1.5 text-[10px] text-theme-400 dark:text-theme-500">
                明日予定を取得できませんでした
              </div>
            ) : !tomorrowScheduleData ? (
              <div className="mt-1.5 grid grid-cols-1 @sm:grid-cols-2 gap-2">
                <div className="h-9 rounded-md bg-theme-100/60 dark:bg-theme-900/20 animate-pulse" />
                <div className="h-9 rounded-md bg-theme-100/60 dark:bg-theme-900/20 animate-pulse" />
              </div>
            ) : tomorrowModel.groups.length === 0 ? (
              <div className="mt-1.5 text-[10px] text-theme-400 dark:text-theme-500">
                明日の予定はありません
              </div>
            ) : (
              <div className="mt-1.5 grid grid-cols-1 @sm:grid-cols-2 gap-2">
                {tomorrowModel.groups.map(({ key, label, count, scheduledFte, employees }) => {
                  const scheduledFteText = key === "Production" ? formatScheduledFte(scheduledFte) : null;

                  return (
                    <div
                      key={key}
                      className="rounded-md border border-orange-200/40 dark:border-orange-900/20 bg-theme-100/60 dark:bg-theme-900/20 px-2 py-1.5"
                    >
                      <div className="flex items-center gap-1.5 border-b border-theme-200/40 dark:border-theme-700/30 pb-0.5">
                        <span className="text-[10px] font-semibold text-theme-600 dark:text-theme-300">
                          {label}
                        </span>
                        <span className="text-[11px] font-bold text-orange-500 dark:text-orange-400 tabular-nums">
                          {count}
                        </span>
                        {scheduledFteText ? (
                          <span className="text-[11px] font-bold text-orange-500 dark:text-orange-400 tabular-nums">
                            ｜ 換算 {scheduledFteText}人
                          </span>
                        ) : null}
                      </div>

                      {employees.length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {employees.map((employee, index) => (
                            <AttendanceChip
                              key={`${key}-${employee.employee}-${index}`}
                              employee={employee}
                              variant="tomorrow"
                              showShift
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="mt-1.5 text-[10px] text-theme-400 dark:text-theme-500">
                          {count === 0 ? "予定なし" : "明細なし"}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </Container>
  );
}
