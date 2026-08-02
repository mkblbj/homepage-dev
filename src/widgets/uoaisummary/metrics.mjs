export function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function sumNullable(values) {
  const known = values.map(numberOrNull).filter((value) => value !== null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
}

export function tomorrowOutput(data) {
  const actual = numberOrNull(data?.tomorrow_output?.total_quantity) || 0;
  const predicted = numberOrNull(data?.tomorrow_output?.total_predicted_quantity) || 0;
  if (actual > 0) return { mode: "actual", total: actual };
  if (predicted > 0) return { mode: "predicted", total: predicted };
  return { mode: "yesterday", total: numberOrNull(data?.yesterday_output?.total_quantity) };
}

export function metric(key, source, value, unit, previousMetrics, note = null) {
  const candidate = value === null || value === undefined ? null : Number(value);
  const normalized = Number.isFinite(candidate) ? candidate : null;
  const previousCandidate = previousMetrics?.[key];
  const previousValue =
    previousCandidate !== null && previousCandidate !== undefined && Number.isFinite(Number(previousCandidate))
      ? Number(previousCandidate)
      : null;
  const delta = normalized === null || previousValue === null ? null : normalized - previousValue;
  const deltaPercent = delta === null || previousValue === 0 ? null : (delta / Math.abs(previousValue)) * 100;
  return { key, source, value: normalized, unit, previousValue, delta, deltaPercent, note };
}

export const METRIC_DEFINITIONS = [
  ["shipping.today_output.total", "shipping", (d) => d.today_output?.total_quantity, "count"],
  ["shipping.active_shops", "shipping", (d) => d.today_output?.active_shops_count, "count"],
  ["shipping.tomorrow.total", "shipping", (d) => tomorrowOutput(d).total, "count", (d) => tomorrowOutput(d).mode],
  [
    "attention.open_total",
    "attention",
    (d) =>
      sumNullable([d.summary?.pendingOrderCount, d.summary?.unansweredInquiryCount, d.summary?.unrepliedReviewCount]),
    "count",
  ],
  ["attention.pending_orders", "attention", (d) => d.summary?.pendingOrderCount, "count"],
  ["attention.unanswered_inquiries", "attention", (d) => d.summary?.unansweredInquiryCount, "count"],
  ["attention.overdue_inquiries", "attention", (d) => d.summary?.overdueInquiryCount, "count"],
  ["attention.unreplied_reviews", "attention", (d) => d.summary?.unrepliedReviewCount, "count"],
  ["sales.realtime_yen", "sales", (d) => d.sales?.totals?.salesYen, "yen"],
  ["sales.orders", "sales", (d) => d.sales?.totals?.orderCount, "count"],
  [
    "sales.aov_yen",
    "sales",
    (d) => {
      const sales = numberOrNull(d.sales?.totals?.salesYen);
      const orders = numberOrNull(d.sales?.totals?.orderCount);
      return orders > 0 && sales !== null ? sales / orders : null;
    },
    "yen",
  ],
  [
    "sales.realtime_vs_seven_day_avg_percent",
    "sales",
    (d) => {
      const realtime = numberOrNull(d.sales?.totals?.salesYen);
      const total = numberOrNull(d.history?.totals?.salesYen);
      const days = d.history?.range?.dates?.length || 0;
      const average = total !== null && days > 0 ? total / days : null;
      return realtime !== null && average > 0 ? (realtime / average) * 100 : null;
    },
    "percent",
  ],
  ["performance.traffic.visit", "performance", (d) => d.traffic?.visitCount, "count"],
  [
    "performance.traffic.delta_percent",
    "performance",
    (d) => (Number(d.traffic?.sampleCount) >= 3 ? d.traffic?.visitDeltaPercent : null),
    "percent",
  ],
  ["performance.mix.new_sales_share", "performance", (d) => d.customerMix?.new?.salesSharePercent, "percent"],
];
