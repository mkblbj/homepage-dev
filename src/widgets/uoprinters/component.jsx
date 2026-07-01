import Container from "components/services/widget/container";
import { useTranslation } from "next-i18next/pages";

import useWidgetAPI from "utils/proxy/use-widget-api";

const getStatusConfig = (statusClass) => {
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
  const { t } = useTranslation();
  const { widget } = service;

  const refreshInterval = widget.refreshInterval || 30000;

  const { data, error } = useWidgetAPI(widget, null, {
    refreshInterval: Math.max(1000, refreshInterval),
  });

  if (error) {
    return <Container service={service} error={error} />;
  }

  if (!data) {
    return (
      <Container service={service}>
        <div className="flex flex-col w-full">
          <div className="bg-theme-200/50 dark:bg-theme-900/20 rounded-sm m-1 flex-1 flex flex-row items-center justify-between p-1 text-xs animate-pulse">
            <div className="font-thin pl-2">{t("uoprinters.loading")}</div>
          </div>
        </div>
      </Container>
    );
  }

  const printers = data?.printers || [];
  const alerts = data?.alerts || [];

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
      <div className="grid grid-cols-2 gap-2 w-full">
        {printers.map((printer) => {
          const config = getStatusConfig(printer.status_class);
          const printerAlerts = alertsByPrinter[printer.id] || [];

          return (
            <div
              key={printer.id}
              className={`flex flex-col justify-center p-2 rounded-lg border ${config.borderColor} ${config.bgColor} transition-colors`}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span
                  className="text-sm font-bold truncate pr-1 text-gray-900 dark:text-gray-100"
                  title={printer.name}
                >
                  {printer.name}
                </span>
                {config.icon}
              </div>
              <div className="flex items-center justify-between gap-1">
                <span className={`text-xs font-semibold ${config.textColor}`}>
                  {printer.status}
                </span>
                {/* 耗材警告：简洁显示 */}
                {printerAlerts.length > 0 && (
                  <div className="flex items-center gap-1">
                    {printerAlerts.map((alert, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-0.5"
                        title={`${alert.supply_name}: ${alert.level_text}`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${getSupplyColor(alert.color)}`}
                        />
                        <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                          {alert.level}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {printers.length === 0 && (
          <div className="col-span-2 text-xs font-thin opacity-70 text-center py-2">
            {t("uoprinters.noPrinters")}
          </div>
        )}
      </div>
    </Container>
  );
}
