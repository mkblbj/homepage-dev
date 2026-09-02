// Pure data shaping for the 経営表現 widget. Every rule here comes from the
// /api/performance contract: null means UNKNOWN and must never become 0, a
// sampleCount below 3 means "no median comparison" (not zero traffic, not an
// outage), and the company status is decided server-side from traffic alone.

export const DASH = "—";

// Vertical breathing room the curve keeps at both ends. The component reuses this to place
// the dashed median on the same scale as the curve — keep them from drifting apart.
export const SPARK_PADDING = 7;

const WEEKDAY_JP = ["日", "月", "火", "水", "木", "金", "土"];
const BUCKET_KEYS = ["repeat1", "repeat2", "repeat3", "repeatOver4"];
const BUCKET_COLORS = ["#5B9BF8", "#7FB2FA", "#A6C9FB", "#C6DBFD"];
const TREND_STATUSES = new Set(["surge", "increase", "stable", "decrease", "sharp_decrease", "unknown"]);

export function isNil(value) {
  return value === null || value === undefined;
}

function toNullableNumber(value) {
  return isNil(value) ? null : Number(value);
}

function normalizeTrendStatus(value) {
  return TREND_STATUSES.has(value) ? value : "unknown";
}

function resolveTrendStatus(value, source, sampleCount, delta) {
  const normalized = normalizeTrendStatus(value);
  if (normalized !== "unknown" || value !== "unknown") {
    return normalized;
  }

  const numericDelta = Number(delta);
  const numericSampleCount = Number(sampleCount);
  if (
    source?.ok !== true ||
    source.stale !== true ||
    !Number.isInteger(numericSampleCount) ||
    numericSampleCount < 3 ||
    isNil(delta) ||
    !Number.isFinite(numericDelta)
  ) {
    return "unknown";
  }

  if (numericDelta >= 35) return "surge";
  if (numericDelta >= 20) return "increase";
  if (numericDelta <= -35) return "sharp_decrease";
  if (numericDelta <= -20) return "decrease";
  return "stable";
}

export function pctLabel(value) {
  return isNil(value) ? DASH : `${value > 0 ? "+" : ""}${Number(value).toFixed(1)}%`;
}

// The per-shop delta bar diverges from a centre line: the track spans ±50%, so a delta
// past that is clamped instead of running off the end. An unknown delta draws nothing.
export const DELTA_BAR_RANGE = 50;

export function deltaBar(delta) {
  if (isNil(delta)) {
    return { left: 50, width: 0 };
  }

  const clamped = Math.max(-DELTA_BAR_RANGE, Math.min(DELTA_BAR_RANGE, Number(delta)));

  return { left: clamped < 0 ? 50 + clamped : 50, width: Math.abs(clamped) };
}

export function mdLabel(dateStr) {
  if (!dateStr) {
    return "";
  }

  const [, month, day] = String(dateStr).split("-");

  return month && day ? `${Number(month)}/${Number(day)}` : dateStr;
}

export function weekdayJp(dateStr) {
  if (!dateStr) {
    return "";
  }

  const date = new Date(`${dateStr}T00:00:00`);

  return Number.isNaN(date.getTime()) ? "" : WEEKDAY_JP[date.getDay()];
}

/** Catmull-Rom → cubic bezier, with an explicit value window so the median line shares the scale. */
export function spark(values, width, height, min, max, horizontalPadding = 0) {
  const count = values.length;
  if (!count) {
    return { line: "", area: "" };
  }

  const usable = height - SPARK_PADDING * 2;
  const usableWidth = Math.max(0, width - horizontalPadding * 2);
  const span = max - min || 1;
  const points = values.map((value, index) => ({
    x: count === 1 ? width / 2 : horizontalPadding + index * (usableWidth / (count - 1)),
    y: SPARK_PADDING + (1 - (value - min) / span) * usable,
  }));

  let line = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < count - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1x = (p1.x + (p2.x - p0.x) / 6).toFixed(2);
    const c1y = (p1.y + (p2.y - p0.y) / 6).toFixed(2);
    const c2x = (p2.x - (p3.x - p1.x) / 6).toFixed(2);
    const c2y = (p2.y - (p3.y - p1.y) / 6).toFixed(2);
    line += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }

  return { line, area: `${line} L ${width.toFixed(2)} ${height.toFixed(2)} L 0 ${height.toFixed(2)} Z` };
}

function buildMix(customerMix) {
  const mix = customerMix || {};
  const buckets = mix.repeatBuckets || {};

  return {
    dataDateJST: mix.dataDateJST || null,
    period: mix.period || {},
    newYen: toNullableNumber(mix.new?.salesYen),
    newOrders: toNullableNumber(mix.new?.orderCount),
    newSalesShare: toNullableNumber(mix.new?.salesSharePercent),
    newOrderShare: toNullableNumber(mix.new?.orderSharePercent),
    repYen: toNullableNumber(mix.repeat?.salesYen),
    repOrders: toNullableNumber(mix.repeat?.orderCount),
    repSalesShare: toNullableNumber(mix.repeat?.salesSharePercent),
    repOrderShare: toNullableNumber(mix.repeat?.orderSharePercent),
    buckets: BUCKET_KEYS.map((key, index) => ({
      key,
      color: BUCKET_COLORS[index],
      yen: toNullableNumber(buckets[key]?.salesYen),
      orders: toNullableNumber(buckets[key]?.orderCount),
    })),
  };
}

// Logos are optional context merged by shopName; a missing entry just falls back to an initial.
function toLogoMap(logos) {
  return new Map((logos?.shops || []).map((shop) => [shop.shopName, shop.logoUrl || null]));
}

export function buildPerformanceModel(data, logos) {
  if (!data) {
    return null;
  }

  const traffic = data.traffic || {};
  const logoByName = toLogoMap(logos);

  return {
    generatedAtJST: data.generatedAtJST || "",
    status: data.status || "unknown",
    partial: data.partial === true,
    shopCount: Number(data.shopCount || (data.shops || []).length),
    trafficStatus: traffic.status || "unknown",
    trendStatus: resolveTrendStatus(
      traffic.trendStatus,
      data.sources?.traffic,
      traffic.sampleCount,
      traffic.visitDeltaPercent,
    ),
    // The RMS business day is NOT the snapshot fetch time — both are surfaced separately.
    dataDateJST: traffic.dataDateJST || null,
    visit: toNullableNumber(traffic.visitCount),
    uu: toNullableNumber(traffic.uniqueVisitorCount),
    expected: toNullableNumber(traffic.expectedVisitCount),
    delta: toNullableNumber(traffic.visitDeltaPercent),
    sampleCount: Number(traffic.sampleCount || 0),
    period: traffic.period || {},
    days: (traffic.daily || []).map((day) => ({
      date: day.dateJST,
      md: mdLabel(day.dateJST),
      wd: weekdayJp(day.dateJST),
      visit: Number(day.visitCount || 0),
      uu: Number(day.uniqueVisitorCount || 0),
    })),
    mix: buildMix(data.customerMix),
    shops: (data.shops || []).map((shop) => {
      const shopTraffic = shop.traffic || {};
      const shopMix = shop.customerMix || {};

      return {
        name: shop.shopName,
        logoUrl: logoByName.get(shop.shopName) || null,
        status: shopTraffic.status || shop.status || "unknown",
        trendStatus: resolveTrendStatus(
          shopTraffic.trendStatus,
          shop.sources?.traffic,
          shopTraffic.sampleCount,
          shopTraffic.visitDeltaPercent,
        ),
        sampleCount: Number(shopTraffic.sampleCount || 0),
        visit: toNullableNumber(shopTraffic.visitCount),
        uu: toNullableNumber(shopTraffic.uniqueVisitorCount),
        expected: toNullableNumber(shopTraffic.expectedVisitCount),
        delta: toNullableNumber(shopTraffic.visitDeltaPercent),
        newSalesShare: toNullableNumber(shopMix.new?.salesSharePercent),
        newOrderShare: toNullableNumber(shopMix.new?.orderSharePercent),
      };
    }),
    sources: data.sources || {},
    lastError: data.lastError || null,
  };
}
