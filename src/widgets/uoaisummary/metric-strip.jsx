const STRIP_KEYS = [
  "sales.realtime_yen",
  "sales.orders",
  "sales.realtime_vs_seven_day_avg_percent",
  "performance.traffic.visit",
  "attention.open_total",
  "shipping.today_output.total",
  "shipping.tomorrow.total",
];

const SOURCE_ORDER = ["shipping", "attention", "sales", "performance"];
const STATE_WEIGHT = { fresh: 0, delayed: 1, stale: 2, unavailable: 3 };

export function formatMetricValue(value, unit) {
  if (value === null || value === undefined) return "—";
  if (unit === "yen") return `¥${Math.round(value).toLocaleString("ja-JP")}`;
  if (unit === "percent") return `${Number(value).toFixed(1)}%`;
  return Math.round(value).toLocaleString("ja-JP");
}

function deltaText(entry) {
  if (!entry || entry.delta === null || entry.delta === undefined) return null;
  return `${entry.delta > 0 ? "+" : ""}${formatMetricValue(entry.delta, entry.unit)}`;
}

function secondaryLine(key, entry, metricsByKey, t) {
  if (key === "sales.realtime_vs_seven_day_avg_percent") return t("uoaisummary.baseline");
  if (key === "performance.traffic.visit") {
    const baseline = metricsByKey["performance.traffic.delta_percent"];
    return baseline && baseline.value !== null ? formatMetricValue(baseline.value, baseline.unit) : null;
  }
  if (key === "shipping.tomorrow.total" && entry?.note === "predicted") return t("uoaisummary.metricNote.predicted");
  return deltaText(entry);
}

export function sourceSummary({ sourceCoverage, sourceFreshness, t }) {
  const valid = sourceCoverage?.valid ?? 0;
  const total = sourceCoverage?.total ?? 4;
  const abnormal = SOURCE_ORDER.map((key) => [key, sourceFreshness?.[key]?.state || "unavailable"]).filter(
    ([, state]) => state !== "fresh",
  );
  if (!abnormal.length) return t("uoaisummary.sourceAllFresh", { valid, total });

  const worst = abnormal.reduce((left, right) => (STATE_WEIGHT[right[1]] > STATE_WEIGHT[left[1]] ? right : left));
  const params = {
    valid,
    total,
    source: t(`uoaisummary.source.${worst[0]}`),
    state: t(`uoaisummary.sourceState.${worst[1]}`),
    count: abnormal.length - 1,
  };
  return abnormal.length > 1 ? t("uoaisummary.sourceWorstMore", params) : t("uoaisummary.sourceWorst", params);
}

export default function MetricStrip({ metricsByKey, onToggle, open, sourceCoverage, sourceFreshness, t }) {
  return (
    <>
      <div className="flex items-center justify-between border-t border-theme-300/30 pt-3 dark:border-white/[0.06]">
        <button
          type="button"
          aria-controls="uoaisummary-metrics"
          aria-expanded={open}
          onClick={onToggle}
          className="rounded-lg border border-theme-300/60 px-2.5 py-1 text-xs font-bold text-theme-700 transition-colors hover:bg-theme-200/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-theme-600/60 dark:text-theme-200 dark:hover:bg-theme-700/50"
        >
          {t("uoaisummary.metrics")} {open ? "▲" : "▼"}
        </button>
        <span className="text-xs text-theme-500 dark:text-theme-400">
          {sourceSummary({ sourceCoverage, sourceFreshness, t })}
        </span>
      </div>
      {open ? (
        <dl id="uoaisummary-metrics" className="mt-3 grid grid-cols-2 gap-2.5 @2xl:grid-cols-4 @5xl:grid-cols-7">
          {STRIP_KEYS.map((key) => {
            const entry = metricsByKey[key];
            const secondary = secondaryLine(key, entry, metricsByKey, t);

            return (
              <div key={key} className="rounded-lg bg-theme-200/30 p-2.5 dark:bg-white/[0.04]">
                <dt className="text-[11px] text-theme-500 dark:text-theme-400">{t(`uoaisummary.metric.${key}`)}</dt>
                <dd className="mt-0.5 text-base font-bold tabular-nums text-theme-900 dark:text-theme-50">
                  {formatMetricValue(entry?.value ?? null, entry?.unit)}
                </dd>
                {secondary ? (
                  <dd className="mt-0.5 text-[11px] text-theme-500 dark:text-theme-400">{secondary}</dd>
                ) : null}
              </div>
            );
          })}
        </dl>
      ) : null}
    </>
  );
}
