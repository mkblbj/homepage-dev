import { AISummaryError } from "./errors.mjs";

const MAX_REVIEW_COUNT = 10;
const MAX_REVIEW_CHARS = 300;
const MAX_PRODUCT_COUNT = 20;
const VALID_STATES = new Set(["fresh", "delayed"]);

function truncateChars(value, max) {
  return Array.from(String(value ?? ""))
    .slice(0, max)
    .join("");
}

function compactText(value, max) {
  const text = String(value ?? "")
    .normalize("NFKC")
    .replace(/\p{Cf}/gu, "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return truncateChars(text, max);
}

function safeTimestamp(value) {
  const text = String(value || "");
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})? JST$/.test(text) ||
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(text)
    ? text
    : null;
}

export function sanitizeReview(review) {
  const numericRating = Number(review?.rating);
  return {
    shopName: compactText(review?.shopName, 80) || null,
    rating: Number.isInteger(numericRating) && numericRating >= 1 && numericRating <= 5 ? numericRating : null,
    postedAtJST: safeTimestamp(review?.postedAtJST),
    itemManagementNumber: compactText(review?.itemManagementNumber, 80) || null,
    excerpt: compactText(review?.excerpt, MAX_REVIEW_CHARS),
  };
}

function metric(key, source, value, unit, ja, zh, previousMetrics) {
  const candidate = value === null || value === undefined ? null : Number(value);
  const normalized = Number.isFinite(candidate) ? candidate : null;
  const previousCandidate = previousMetrics?.[key];
  const previousValue =
    previousCandidate !== null && previousCandidate !== undefined && Number.isFinite(Number(previousCandidate))
      ? Number(previousCandidate)
      : null;
  const delta = normalized === null || previousValue === null ? null : normalized - previousValue;
  const deltaPercent = delta === null || previousValue === 0 ? null : (delta / Math.abs(previousValue)) * 100;
  return { key, source, value: normalized, unit, ja, zh, previousValue, delta, deltaPercent };
}

function dataQuality(collected, validCount) {
  if (validCount < 2) return "insufficient";
  const anyPartial = Object.values(collected).some((source) => source.partial === true);
  return validCount < 4 || anyPartial ? "partial" : "complete";
}

function severity(collected, validCount) {
  if (validCount < 2) return "unknown";
  const attention = VALID_STATES.has(collected.attention?.state) ? collected.attention?.data?.status : null;
  const performance = VALID_STATES.has(collected.performance?.state)
    ? collected.performance?.data?.traffic?.status
    : null;
  if (attention === "critical" || performance === "critical") return "critical";
  if (
    attention === "attention" ||
    performance === "attention" ||
    Object.values(collected).some((source) => source.state !== "fresh")
  ) {
    return "attention";
  }
  return "normal";
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeText(value, max = 160) {
  const text = compactText(value, max);
  return text || null;
}

function safeDate(value) {
  const text = String(value || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function enumOrNull(value, allowed) {
  return allowed.includes(value) ? value : null;
}

function ratingCounts(value) {
  return {
    1: numberOrNull(value?.[1]),
    2: numberOrNull(value?.[2]),
    3: numberOrNull(value?.[3]),
  };
}

function sumNullable(values) {
  const known = values.map(numberOrNull).filter((value) => value !== null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
}

function tomorrowOutput(data) {
  const actual = numberOrNull(data?.tomorrow_output?.total_quantity) || 0;
  const predicted = numberOrNull(data?.tomorrow_output?.total_predicted_quantity) || 0;
  if (actual > 0) return { mode: "actual", total: actual, source: data.tomorrow_output };
  if (predicted > 0) return { mode: "predicted", total: predicted, source: data.tomorrow_output };
  return {
    mode: "yesterday",
    total: numberOrNull(data?.yesterday_output?.total_quantity),
    source: data?.yesterday_output,
  };
}

const METRIC_DEFINITIONS = [
  ["shipping.today_output.total", "shipping", (d) => d.today_output?.total_quantity, "count", "今日出力", "今日输出"],
  ["shipping.active_shops", "shipping", (d) => d.today_output?.active_shops_count, "count", "稼働店舗", "活跃店铺"],
  ["shipping.shipping.total", "shipping", (d) => d.today_shipping?.total_quantity, "count", "今日出荷", "今日发货"],
  [
    "shipping.shipping.yesterday_total",
    "shipping",
    (d) => d.yesterday_shipping?.total_quantity,
    "count",
    "昨日出荷",
    "昨日发货",
  ],
  [
    "shipping.shipping.vs_yesterday_percent",
    "shipping",
    (d) => {
      const today = numberOrNull(d.today_shipping?.total_quantity);
      const yesterday = numberOrNull(d.yesterday_shipping?.total_quantity);
      return today !== null && yesterday > 0 ? ((today - yesterday) / Math.abs(yesterday)) * 100 : null;
    },
    "percent",
    "昨日出荷比",
    "较昨日发货",
  ],
  ["shipping.tomorrow.total", "shipping", (d) => tomorrowOutput(d).total, "count", "明日予定", "明日计划"],
  [
    "attention.open_total",
    "attention",
    (d) =>
      sumNullable([d.summary?.pendingOrderCount, d.summary?.unansweredInquiryCount, d.summary?.unrepliedReviewCount]),
    "count",
    "未対応合計",
    "未处理合计",
  ],
  ["attention.pending_orders", "attention", (d) => d.summary?.pendingOrderCount, "count", "未確認注文", "待确认订单"],
  [
    "attention.unanswered_inquiries",
    "attention",
    (d) => d.summary?.unansweredInquiryCount,
    "count",
    "未回答問い合わせ",
    "未回复咨询",
  ],
  [
    "attention.overdue_inquiries",
    "attention",
    (d) => d.summary?.overdueInquiryCount,
    "count",
    "期限超過問い合わせ",
    "逾期咨询",
  ],
  [
    "attention.unreplied_reviews",
    "attention",
    (d) => d.summary?.unrepliedReviewCount,
    "count",
    "未返信レビュー",
    "未回复评价",
  ],
  ["attention.rating_1", "attention", (d) => d.summary?.reviewCountByRating?.[1], "count", "星1レビュー", "1星评价"],
  ["attention.rating_2", "attention", (d) => d.summary?.reviewCountByRating?.[2], "count", "星2レビュー", "2星评价"],
  ["attention.rating_3", "attention", (d) => d.summary?.reviewCountByRating?.[3], "count", "星3レビュー", "3星评价"],
  ["sales.realtime_yen", "sales", (d) => d.sales?.totals?.salesYen, "yen", "リアルタイム売上", "实时销售额"],
  ["sales.orders", "sales", (d) => d.sales?.totals?.orderCount, "count", "注文数", "订单数"],
  [
    "sales.aov_yen",
    "sales",
    (d) => {
      const sales = numberOrNull(d.sales?.totals?.salesYen);
      const orders = numberOrNull(d.sales?.totals?.orderCount);
      return orders > 0 && sales !== null ? sales / orders : null;
    },
    "yen",
    "平均注文額",
    "平均订单金额",
  ],
  ["sales.seven_day_total_yen", "sales", (d) => d.history?.totals?.salesYen, "yen", "7日売上", "7日销售额"],
  [
    "sales.seven_day_avg_yen",
    "sales",
    (d) => {
      const total = numberOrNull(d.history?.totals?.salesYen);
      const days = d.history?.range?.dates?.length || 0;
      return total !== null && days > 0 ? total / days : null;
    },
    "yen",
    "7日平均",
    "7日均值",
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
    "7日完全日平均への到達率",
    "相对7日完整日均达成率",
  ],
  ["sales.seven_day_orders", "sales", (d) => d.history?.totals?.orderCount, "count", "7日注文", "7日订单"],
  ["sales.seven_day_cvr", "sales", (d) => d.history?.totals?.conversionRate, "percent", "7日CVR", "7日转化率"],
  ["performance.traffic.visit", "performance", (d) => d.traffic?.visitCount, "count", "訪問数", "访问数"],
  [
    "performance.traffic.unique_visitors",
    "performance",
    (d) => d.traffic?.uniqueVisitorCount,
    "count",
    "ユニーク訪問者",
    "独立访客",
  ],
  [
    "performance.traffic.expected_visit",
    "performance",
    (d) => (Number(d.traffic?.sampleCount) >= 3 ? d.traffic?.expectedVisitCount : null),
    "count",
    "同曜日基準",
    "同星期基准",
  ],
  [
    "performance.traffic.delta_percent",
    "performance",
    (d) => (Number(d.traffic?.sampleCount) >= 3 ? d.traffic?.visitDeltaPercent : null),
    "percent",
    "基準差",
    "基准差异",
  ],
  [
    "performance.mix.new_sales_share",
    "performance",
    (d) => d.customerMix?.new?.salesSharePercent,
    "percent",
    "新規売上比率",
    "新客销售占比",
  ],
  [
    "performance.mix.repeat_sales_share",
    "performance",
    (d) => d.customerMix?.repeat?.salesSharePercent,
    "percent",
    "リピート売上比率",
    "复购销售占比",
  ],
];

function formatValue(value, unit) {
  if (value === null) return "—";
  if (unit === "yen") return "¥" + Math.round(value).toLocaleString("ja-JP");
  if (unit === "percent") return Number(value).toFixed(1) + "%";
  return Math.round(value).toLocaleString("ja-JP") + "件";
}

function displayMetric(entry, comparisonWindow) {
  const delta = entry.delta === null ? null : (entry.delta > 0 ? "+" : "") + formatValue(entry.delta, entry.unit);
  const minutes = comparisonWindow?.elapsedMinutes;
  const jaPeriod = Number.isFinite(minutes) ? "前" + minutes + "分" : "前回";
  const zhPeriod = Number.isFinite(minutes) ? "较" + minutes + "分钟前" : "较上次";
  const jaDelta = delta ? " (" + jaPeriod + " " + delta + ")" : "";
  const zhDelta = delta ? "（" + zhPeriod + " " + delta + "）" : "";
  return {
    rawValue: entry.value,
    ja: entry.ja + " " + formatValue(entry.value, entry.unit) + jaDelta,
    zh: entry.zh + " " + formatValue(entry.value, entry.unit) + zhDelta,
  };
}

function parseJST(value) {
  const parsed = Date.parse(
    String(value || "")
      .replace(" JST", "+09:00")
      .replace(" ", "T"),
  );
  return Number.isFinite(parsed) ? parsed : null;
}

function formatJST(timestamp) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return (
    values.year +
    "-" +
    values.month +
    "-" +
    values.day +
    " " +
    values.hour +
    ":" +
    values.minute +
    ":" +
    values.second +
    " JST"
  );
}

function collectShops(collected) {
  const merged = new Map();
  for (const source of Object.values(collected)) {
    if (!VALID_STATES.has(source?.state)) continue;
    const rows = source.data?.shops || source.data?.sales?.shops || source.data?.today_output?.shops || [];
    for (const shop of rows) {
      const name = safeText(shop.name || shop.shopName || shop.shop_name, 80);
      if (!name) continue;
      const previous = merged.get(name) || {
        name,
        anomaly: false,
        volume: 0,
        sources: [],
      };
      previous.anomaly ||= ["critical", "attention"].includes(shop.status);
      previous.volume += Number(
        shop.salesYen ||
          shop.total_quantity ||
          shop.traffic?.visitCount ||
          sumNullable([shop.pendingOrderCount, shop.unansweredInquiryCount, shop.unrepliedReviewCount]) ||
          0,
      );
      previous.sources.push(source.key);
      merged.set(name, previous);
    }
  }
  const ranked = [...merged.values()].sort(
    (left, right) => Number(right.anomaly) - Number(left.anomaly) || right.volume - left.volume,
  );
  return {
    shops: ranked.slice(0, 20),
    otherShops:
      ranked.length > 20
        ? {
            count: ranked.length - 20,
            aggregateVolume: ranked.slice(20).reduce((sum, shop) => sum + shop.volume, 0),
          }
        : null,
  };
}

function collectProducts(collected) {
  if (!VALID_STATES.has(collected.sales?.state)) return [];
  const ranking = collected.sales?.data?.ranking?.rankings || collected.sales?.data?.ranking || {};
  const merged = new Map();
  const dimensions = ["sales", "orderCount", "units"];
  const itemsByDimension = Object.fromEntries(
    dimensions.map((dimension) => {
      const block = ranking[dimension];
      const items = Array.isArray(block) ? block : block?.overall?.items || block?.overall || [];
      return [dimension, items.slice(0, 10)];
    }),
  );
  for (let index = 0; index < 10 && merged.size < MAX_PRODUCT_COUNT; index += 1) {
    for (const dimension of dimensions) {
      const product = itemsByDimension[dimension][index];
      if (!product) continue;
      const key = safeText(product.itemManagementNumber, 80);
      if (!key) continue;
      const existing = merged.get(key) || {
        itemManagementNumber: key,
        title: safeText(product.title || product.itemName, 160),
        dimensions: [],
      };
      existing.dimensions.push({ dimension, rank: Number(product.rank) || null });
      merged.set(key, existing);
      if (merged.size >= MAX_PRODUCT_COUNT) break;
    }
  }
  return [...merged.values()];
}

function topRows(rows, limit, volumeKeys) {
  return [...(rows || [])]
    .sort(
      (left, right) =>
        volumeKeys.reduce((sum, key) => sum + Number(right?.[key] || 0), 0) -
        volumeKeys.reduce((sum, key) => sum + Number(left?.[key] || 0), 0),
    )
    .slice(0, limit);
}

function keepAllowedShops(rows, allowedShopNames) {
  return (rows || []).filter((shop) =>
    allowedShopNames.has(String(shop.shopName || shop.shop_name || shop.name || "").trim()),
  );
}

function compactSourceStates(sources, keys) {
  return Object.fromEntries(
    keys.map((key) => {
      const source = sources?.[key];
      return [
        key,
        {
          stale: Boolean(source?.stale),
          error: source?.error || source?.lastError ? "source_unavailable" : null,
        },
      ];
    }),
  );
}

function aggregateSalesDaily(history) {
  return (history?.range?.dates || []).slice(-7).map((date) => {
    const rows = (history?.shops || []).flatMap((shop) => shop.daily || []).filter((entry) => entry?.date === date);
    return {
      date: safeDate(date),
      salesYen: sumNullable(rows.map((entry) => entry.salesYen)),
      orderCount: sumNullable(rows.map((entry) => entry.orderCount)),
    };
  });
}

function compactSalesShops(sales, allowedShopNames) {
  const realtimeTotal = numberOrNull(sales.sales?.totals?.salesYen);
  const sevenDayTotal = numberOrNull(sales.history?.totals?.salesYen);
  const historyByName = new Map((sales.history?.shops || []).map((shop) => [String(shop.shopName || "").trim(), shop]));
  return topRows(keepAllowedShops(sales.sales?.shops, allowedShopNames), 20, ["salesYen", "orderCount"]).map((shop) => {
    const shopName = safeText(shop.shopName, 80);
    const salesYen = numberOrNull(shop.salesYen);
    const history = historyByName.get(String(shop.shopName || "").trim());
    const sevenDaySalesYen = numberOrNull(history?.totals?.salesYen);
    return {
      shopName,
      salesYen,
      orderCount: numberOrNull(shop.orderCount),
      realtimeSharePercent: salesYen !== null && realtimeTotal > 0 ? (salesYen / realtimeTotal) * 100 : null,
      sevenDaySalesYen,
      sevenDayOrderCount: numberOrNull(history?.totals?.orderCount),
      sevenDaySharePercent:
        sevenDaySalesYen !== null && sevenDayTotal > 0 ? (sevenDaySalesYen / sevenDayTotal) * 100 : null,
    };
  });
}

function compactModules(collected, allowedShopNames) {
  const shipping = collected.shipping?.data || {};
  const attention = collected.attention?.data || {};
  const sales = collected.sales?.data || {};
  const performance = collected.performance?.data || {};
  const rankingBlocks = sales.ranking?.rankings || sales.ranking || {};
  return {
    shipping: VALID_STATES.has(collected.shipping?.state)
      ? {
          updatedAtJST: collected.shipping.updatedAtJST,
          businessDateJST: shipping.today_output?.date || shipping.today_shipping?.date || null,
          todayOutput: shipping.today_output?.total_quantity ?? null,
          yesterdayShipping: shipping.yesterday_shipping?.total_quantity ?? null,
          todayShipping: shipping.today_shipping?.total_quantity ?? null,
          tomorrow: {
            mode: tomorrowOutput(shipping).mode,
            total: tomorrowOutput(shipping).total,
          },
          activeShopCount: shipping.today_output?.active_shops_count ?? null,
          topShops: topRows(keepAllowedShops(shipping.today_output?.shops, allowedShopNames), 10, [
            "total_quantity",
          ]).map((shop) => ({
            shopName: safeText(shop.shop_name || shop.shopName, 80),
            totalQuantity: numberOrNull(shop.total_quantity),
          })),
          topCouriers: topRows(shipping.today_shipping?.couriers || shipping.couriers, 10, ["total_quantity"]).map(
            (courier) => ({
              courierName: safeText(courier.courier_name, 80),
              totalQuantity: numberOrNull(courier.total_quantity),
            }),
          ),
        }
      : null,
    attention: VALID_STATES.has(collected.attention?.state)
      ? {
          generatedAtJST: collected.attention.updatedAtJST,
          status: attention.status || null,
          partial: Boolean(attention.partial),
          summary: {
            pendingOrderCount: numberOrNull(attention.summary?.pendingOrderCount),
            unansweredInquiryCount: numberOrNull(attention.summary?.unansweredInquiryCount),
            overdueInquiryCount: numberOrNull(attention.summary?.overdueInquiryCount),
            unrepliedReviewCount: numberOrNull(attention.summary?.unrepliedReviewCount),
            reviewCountByRating: ratingCounts(attention.summary?.reviewCountByRating),
          },
          topShops: topRows(keepAllowedShops(attention.shops, allowedShopNames), 20, [
            "pendingOrderCount",
            "unansweredInquiryCount",
            "unrepliedReviewCount",
          ]).map((shop) => ({
            shopName: safeText(shop.shopName, 80),
            status: enumOrNull(shop.status, ["normal", "attention", "critical"]),
            pendingOrderCount: numberOrNull(shop.pendingOrderCount),
            unansweredInquiryCount: numberOrNull(shop.unansweredInquiryCount),
            overdueInquiryCount: numberOrNull(shop.overdueInquiryCount),
            unrepliedReviewCount: numberOrNull(shop.unrepliedReviewCount),
            reviewCountByRating: ratingCounts(shop.reviewCountByRating),
          })),
          sources: compactSourceStates(attention.sources, ["mainMenu", "reviews"]),
        }
      : null,
    sales: VALID_STATES.has(collected.sales?.state)
      ? {
          generatedAtJST: collected.sales.updatedAtJST,
          realtime: {
            salesYen: numberOrNull(sales.sales?.totals?.salesYen),
            orderCount: numberOrNull(sales.sales?.totals?.orderCount),
            averageOrderValueYen: numberOrNull(sales.sales?.totals?.averageOrderValueYen),
          },
          shops: compactSalesShops(sales, allowedShopNames),
          sevenDay: {
            totals: {
              salesYen: numberOrNull(sales.history?.totals?.salesYen),
              orderCount: numberOrNull(sales.history?.totals?.orderCount),
              conversionRate: numberOrNull(sales.history?.totals?.conversionRate),
            },
            dailyTrend: aggregateSalesDaily(sales.history),
          },
          ranking: {
            generatedAtJST: sales.ranking?.generatedAtJST || null,
            partial: Boolean(sales.ranking?.partial),
            failedShopCount: Object.values(rankingBlocks).reduce(
              (sum, block) => sum + Number(block?.failedShopCount || 0),
              0,
            ),
          },
        }
      : null,
    performance: VALID_STATES.has(collected.performance?.state)
      ? {
          generatedAtJST: collected.performance.updatedAtJST,
          businessDateJST: performance.traffic?.dataDateJST || null,
          status: performance.status || performance.traffic?.status || null,
          partial: Boolean(performance.partial),
          traffic: {
            status: enumOrNull(performance.traffic?.status, ["normal", "attention", "critical"]),
            dataDateJST: safeDate(performance.traffic?.dataDateJST),
            visitCount: numberOrNull(performance.traffic?.visitCount),
            uniqueVisitorCount: numberOrNull(performance.traffic?.uniqueVisitorCount),
            expectedVisitCount:
              Number(performance.traffic?.sampleCount) >= 3
                ? numberOrNull(performance.traffic?.expectedVisitCount)
                : null,
            visitDeltaPercent:
              Number(performance.traffic?.sampleCount) >= 3
                ? numberOrNull(performance.traffic?.visitDeltaPercent)
                : null,
            sampleCount: numberOrNull(performance.traffic?.sampleCount),
            sevenDayTrend: (performance.traffic?.daily || []).slice(-7).map((entry) => ({
              dateJST: safeDate(entry?.dateJST),
              visitCount: numberOrNull(entry?.visitCount),
              uniqueVisitorCount: numberOrNull(entry?.uniqueVisitorCount),
            })),
          },
          customerMix: {
            new: {
              salesYen: numberOrNull(performance.customerMix?.new?.salesYen),
              orderCount: numberOrNull(performance.customerMix?.new?.orderCount),
              salesSharePercent: numberOrNull(performance.customerMix?.new?.salesSharePercent),
              orderSharePercent: numberOrNull(performance.customerMix?.new?.orderSharePercent),
            },
            repeat: {
              salesYen: numberOrNull(performance.customerMix?.repeat?.salesYen),
              orderCount: numberOrNull(performance.customerMix?.repeat?.orderCount),
              salesSharePercent: numberOrNull(performance.customerMix?.repeat?.salesSharePercent),
              orderSharePercent: numberOrNull(performance.customerMix?.repeat?.orderSharePercent),
            },
          },
          shops: keepAllowedShops(performance.shops, allowedShopNames)
            .sort((left, right) => Number(right.traffic?.visitCount || 0) - Number(left.traffic?.visitCount || 0))
            .slice(0, 20)
            .map((shop) => ({
              shopName: safeText(shop.shopName, 80),
              status: enumOrNull(shop.status, ["normal", "attention", "critical"]),
              traffic: {
                status: enumOrNull(shop.traffic?.status, ["normal", "attention", "critical"]),
                visitCount: numberOrNull(shop.traffic?.visitCount),
                uniqueVisitorCount: numberOrNull(shop.traffic?.uniqueVisitorCount),
                expectedVisitCount:
                  Number(shop.traffic?.sampleCount) >= 3 ? numberOrNull(shop.traffic?.expectedVisitCount) : null,
                visitDeltaPercent:
                  Number(shop.traffic?.sampleCount) >= 3 ? numberOrNull(shop.traffic?.visitDeltaPercent) : null,
                sampleCount: numberOrNull(shop.traffic?.sampleCount),
              },
              newSalesSharePercent: numberOrNull(shop.customerMix?.new?.salesSharePercent),
            })),
          sources: compactSourceStates(performance.sources, ["traffic", "customerMix"]),
        }
      : null,
  };
}

function byteLength(value) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

export function buildAnalysisInput(collected, { previousSnapshot, nowTs }) {
  const previousMetrics = previousSnapshot?.metrics || {};
  const sourceFreshness = Object.fromEntries(
    ["shipping", "attention", "sales", "performance"].map((key) => [
      key,
      {
        state: collected[key]?.state || "unavailable",
        updatedAtJST: collected[key]?.updatedAtJST || null,
      },
    ]),
  );
  const validCount = Object.values(collected).filter((source) => VALID_STATES.has(source?.state)).length;
  const metrics = Object.fromEntries(
    METRIC_DEFINITIONS.filter(([, source]) => VALID_STATES.has(collected[source]?.state)).map(
      ([key, source, read, unit, ja, zh]) => [
        key,
        metric(key, source, read(collected[source].data), unit, ja, zh, previousMetrics),
      ],
    ),
  );
  const previousTs = parseJST(previousSnapshot?.capturedAtJST);
  const comparisonWindow =
    previousTs === null
      ? null
      : {
          previousCapturedAtJST: previousSnapshot.capturedAtJST,
          elapsedMinutes: Math.max(0, Math.round((nowTs - previousTs) / 60000)),
          isHourly: Math.abs(nowTs - previousTs - 3600000) <= 15 * 60000,
        };
  const metricDisplay = Object.fromEntries(
    Object.entries(metrics).map(([key, entry]) => [key, displayMetric(entry, comparisonWindow)]),
  );
  const shopData = collectShops(collected);
  const reviewSamples = (
    VALID_STATES.has(collected.attention?.state) ? collected.attention?.data?.recentReviews || [] : []
  )
    .filter((review) => {
      const rating = Number(review.rating);
      return Number.isInteger(rating) && rating >= 1 && rating <= 3;
    })
    .sort(
      (left, right) =>
        Number(left.rating) - Number(right.rating) || String(right.postedAtJST).localeCompare(String(left.postedAtJST)),
    )
    .slice(0, MAX_REVIEW_COUNT)
    .map(sanitizeReview);
  const sourceCoverage = { valid: validCount, total: 4 };
  const quality = dataQuality(collected, validCount);
  const level = severity(collected, validCount);
  const modelInput = {
    capturedAtJST: formatJST(nowTs),
    severity: level,
    dataQuality: quality,
    sourceCoverage,
    sourceFreshness,
    modules: compactModules(collected, new Set(shopData.shops.map((shop) => shop.name))),
    metrics: Object.values(metrics),
    comparisonWindow,
    shops: shopData.shops,
    otherShops: shopData.otherShops,
    rankedProducts: collectProducts(collected),
    reviewSamples,
    caveats: ["NO_INTRADAY_SALES_BASELINE"],
  };
  if (comparisonWindow && !comparisonWindow.isHourly) {
    modelInput.caveats.push("PREVIOUS_SNAPSHOT_INTERVAL_IS_NOT_ONE_HOUR");
  }

  while (byteLength(modelInput) > 50000 && modelInput.rankedProducts.length > 5) {
    modelInput.rankedProducts.pop();
  }
  while (byteLength(modelInput) > 50000 && modelInput.reviewSamples.length > 3) {
    modelInput.reviewSamples.pop();
  }
  if (byteLength(modelInput) > 50000) {
    throw new AISummaryError("source_unavailable", "Normalized AI input exceeds safe size");
  }

  const snapshot = {
    capturedAtJST: modelInput.capturedAtJST,
    metrics: Object.fromEntries(Object.entries(metrics).map(([key, entry]) => [key, entry.value])),
  };
  return {
    severity: level,
    dataQuality: quality,
    sourceCoverage,
    sourceFreshness,
    comparisonWindow,
    metrics,
    metricDisplay,
    modelInput,
    snapshot,
  };
}
