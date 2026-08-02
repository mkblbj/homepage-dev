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

export const METRIC_LABELS = {
  "shipping.today_output.total": { ja: "今日出力", zh: "今日输出" },
  "shipping.active_shops": { ja: "稼働店舗", zh: "活跃店铺" },
  "shipping.tomorrow.total": { ja: "明日予定", zh: "明日计划" },
  "attention.open_total": { ja: "未対応合計", zh: "未处理合计" },
  "attention.pending_orders": { ja: "未確認注文", zh: "待确认订单" },
  "attention.unanswered_inquiries": { ja: "未回答問い合わせ", zh: "未回复咨询" },
  "attention.overdue_inquiries": { ja: "期限超過問い合わせ", zh: "逾期咨询" },
  "attention.unreplied_reviews": { ja: "未返信レビュー", zh: "未回复评价" },
  "sales.realtime_yen": { ja: "リアルタイム売上", zh: "实时销售额" },
  "sales.orders": { ja: "注文数", zh: "订单数" },
  "sales.aov_yen": { ja: "平均注文額", zh: "平均订单金额" },
  "sales.realtime_vs_seven_day_avg_percent": { ja: "7日完全日平均への到達率", zh: "相对7日完整日均达成率" },
  "performance.traffic.visit": { ja: "訪問数", zh: "访问数" },
  "performance.traffic.delta_percent": { ja: "基準差", zh: "基准差异" },
  "performance.mix.new_sales_share": { ja: "新規売上比率", zh: "新客销售占比" },
};
