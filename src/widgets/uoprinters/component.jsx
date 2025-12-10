import Container from "components/services/widget/container";
import { useCallback, useState } from "react";

import useWidgetAPI from "utils/proxy/use-widget-api";

const getStatusConfig = (statusClass, hasAlert) => {
  // 如果有报警，优先显示警告样式
  if (hasAlert) {
    return {
      icon: (
        <svg
          className="w-4 h-4 text-amber-500 animate-pulse"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      ),
      textColor: "text-amber-700 dark:text-amber-300",
      borderColor: "border-amber-500/50",
      bgColor: "bg-amber-500/20",
    };
  }

  switch (statusClass) {
    case "printing":
      return {
        icon: (
          <svg
            className="w-4 h-4 animate-pulse text-blue-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
            />
          </svg>
        ),
        textColor: "text-blue-700 dark:text-blue-300",
        borderColor: "border-blue-500/50",
        bgColor: "bg-blue-500/20",
      };
    case "error":
    case "offline":
      return {
        icon: (
          <svg
            className="w-4 h-4 text-red-500 animate-bounce"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        ),
        textColor: "text-red-700 dark:text-red-300",
        borderColor: "border-red-500/50",
        bgColor: "bg-red-500/20",
      };
    case "idle":
      return {
        icon: (
          <svg
            className="w-4 h-4 text-emerald-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        ),
        textColor: "text-emerald-700 dark:text-emerald-300",
        borderColor: "border-emerald-500/30",
        bgColor: "bg-emerald-500/20",
      };
    case "sleeping":
    default:
      return {
        icon: (
          <svg
            className="w-4 h-4 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
            />
          </svg>
        ),
        textColor: "text-gray-700 dark:text-gray-300",
        borderColor: "border-gray-500/20",
        bgColor: "bg-gray-500/20",
      };
  }
};

// 墨水颜色映射
const getSupplyColor = (color) => {
  const colorMap = {
    black: "bg-gray-800",
    cyan: "bg-cyan-500",
    magenta: "bg-pink-500",
    yellow: "bg-yellow-400",
    red: "bg-red-500",
    blue: "bg-blue-500",
    green: "bg-green-500",
  };
  return colorMap[color?.toLowerCase()] || "bg-gray-500";
};

export default function Component({ service }) {
  const { widget } = service;
  const [refreshKey, setRefreshKey] = useState(0);

  const refreshInterval = widget.refreshInterval || 30000;

  const { data, error, mutate } = useWidgetAPI(widget, null, {
    refreshInterval: Math.max(1000, refreshInterval),
    refreshKey,
  });

  const handleRefresh = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setRefreshKey((prev) => prev + 1);
      mutate();
    },
    [mutate]
  );

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

  const printers = data?.printers || [];
  const alerts = data?.alerts || [];
  const alertCount = data?.alert_count || 0;

  // 按 printer_id 分组 alerts
  const alertsByPrinter = alerts.reduce((acc, alert) => {
    if (!acc[alert.printer_id]) {
      acc[alert.printer_id] = [];
    }
    acc[alert.printer_id].push(alert);
    return acc;
  }, {});

  return (
    <Container service={service}>
      <div className="flex flex-col gap-2 w-full">
        {/* 耗材报警区域 */}
        {alertCount > 0 && (
          <div className="flex flex-wrap gap-1 p-2 rounded-lg bg-amber-500/20 border border-amber-500/50">
            <div className="w-full flex items-center gap-1 mb-1">
              <svg
                className="w-4 h-4 text-amber-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <span className="text-xs font-bold text-amber-700 dark:text-amber-300">
                耗材警告 ({alertCount})
              </span>
            </div>
            {alerts.map((alert, idx) => (
              <div
                key={`${alert.printer_id}-${alert.supply_name}-${idx}`}
                className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/50 dark:bg-black/20 text-xs"
                title={`${alert.printer_name}: ${alert.supply_name} ${alert.level_text}`}
              >
                <span className={`w-3 h-3 rounded-full ${getSupplyColor(alert.color)}`} />
                <span className="font-medium text-gray-800 dark:text-gray-200 truncate max-w-[80px]">
                  {alert.printer_name}
                </span>
                <span className="text-amber-700 dark:text-amber-300 font-bold">
                  {alert.level_text}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 打印机状态网格 */}
        <div className="grid grid-cols-2 gap-2">
          {printers.map((printer) => {
            const hasAlert = printer.alert_count > 0;
            const config = getStatusConfig(printer.status_class, hasAlert);
            const printerAlerts = alertsByPrinter[printer.id] || [];

            return (
              <div
                key={printer.id}
                className={`flex flex-col justify-center p-2 rounded-lg border ${config.borderColor} ${config.bgColor} transition-colors min-h-[50px]`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className="text-sm font-bold truncate pr-1 text-gray-900 dark:text-gray-100"
                    title={printer.name}
                  >
                    {printer.name}
                  </span>
                  {config.icon}
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold ${config.textColor}`}>
                    {printer.status}
                  </span>
                  {/* 显示该打印机的耗材警告小圆点 */}
                  {printerAlerts.length > 0 && (
                    <div className="flex gap-0.5">
                      {printerAlerts.map((alert, idx) => (
                        <span
                          key={idx}
                          className={`w-2.5 h-2.5 rounded-full ${getSupplyColor(alert.color)} ring-1 ring-white/50`}
                          title={`${alert.supply_name}: ${alert.level_text}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {printers.length === 0 && (
            <div className="col-span-2 text-xs font-thin opacity-70 text-center py-2">
              プリンターなし
            </div>
          )}
        </div>
      </div>
    </Container>
  );
}
