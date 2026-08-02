import { formatMetricValue } from "./metric-strip";

const PRIORITY_CLASS = {
  high: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  medium: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  low: "bg-theme-500/10 text-theme-700 dark:text-theme-200",
};

export default function ActionList({ actions, language, metricsByKey, t }) {
  return (
    <ul className="mt-4 flex flex-col">
      {actions.map((action, index) => {
        const referenced = action.metricKey ? metricsByKey[action.metricKey] : null;

        return (
          <li
            key={`${action.module}-${index}`}
            className="flex gap-2.5 border-t border-theme-300/30 py-3 dark:border-white/[0.06]"
          >
            <span
              className={`h-fit shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-bold ${
                PRIORITY_CLASS[action.priority] || PRIORITY_CLASS.low
              }`}
            >
              {t(`uoaisummary.priority.${action.priority}`)}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-theme-900 dark:text-theme-50">{action.title[language]}</p>
              <p className="mt-1 text-xs leading-5 text-theme-700 dark:text-theme-200">
                {action.reason[language]}
                {referenced ? (
                  <span className="ml-1.5 text-theme-500 dark:text-theme-400">
                    {t(`uoaisummary.metric.${referenced.key}`)} {formatMetricValue(referenced.value, referenced.unit)}
                  </span>
                ) : null}
                {action.shopName ? (
                  <span className="ml-1.5 text-theme-500 dark:text-theme-400">{action.shopName}</span>
                ) : null}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
