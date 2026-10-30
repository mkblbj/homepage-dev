// View model for the sales tab's daily check: one row per shop — 楽天 and
// Amazon side by side — with today, the last 7 days, this month and
// yesterday's visits. Unknown stays null all the way to the screen — a missing
// board is never drawn as zero.
//
// Order and unit counts add up across platforms; yen never do. Each platform
// counts its amounts its own way (楽天's order API before coupons, Amazon's
// Sales API), so 売上 stays per platform and the company row leaves it empty.

export const METRICS = Object.freeze(["sales", "units", "orders"]);

// the item boards key their dimensions by the API's own names
export const RANKING_DIM_BY_METRIC = Object.freeze({ sales: "sales", units: "units", orders: "orderCount" });

// a change only earns a colour once it passes ±20% — the same thresholds the
// performance snapshot uses for 増加 / 低下
const TONE_THRESHOLD = 20;

export function deltaTone(delta) {
  if (delta === null || delta === undefined || !Number.isFinite(Number(delta))) return "unknown";
  if (delta <= -TONE_THRESHOLD) return "down";
  if (delta >= TONE_THRESHOLD) return "up";
  return "flat";
}

function triple(sales, units, orders) {
  return { sales, units, orders };
}

// fewer than 3 same-weekday samples means there is no median to compare with
const MIN_MEDIAN_SAMPLES = 3;

function medianDelta(source) {
  return source && source.sampleCount >= MIN_MEDIAN_SAMPLES ? source.delta : null;
}

function isKnown(values) {
  return Boolean(values) && values.sales !== null && values.orders !== null;
}

function isZero(values) {
  return !values || (!(values.sales > 0) && !(values.orders > 0));
}

const known = (v) => v !== null && v !== undefined;

// The 7-day 売上 only stands against today when both come from one source.
// 楽天's history is R-Karte's after-coupon yen while today is the order API's,
// before coupons; Amazon's history and today both come from its Sales API.
// Counts mean the same on every side.
export function historyComparable(metric, platform = "rakuten") {
  return metric !== "sales" || platform === "amazon";
}

// Counts of several platforms added up: a platform the server could not read
// at all adds nothing (the coverage says so), and the yen slot stays empty.
function addCounts(list) {
  const present = list.filter(Boolean);
  if (!present.length) return null;
  const sum = (key) => {
    const values = present.map((v) => v[key]).filter(known);
    return values.length ? values.reduce((a, b) => a + b, 0) : null;
  };
  return triple(null, sum("units"), sum("orders"));
}

function addCoverage(a, b) {
  if (!a || !b) return a || b || null;
  return { covered: a.covered + b.covered, total: a.total + b.total };
}

function deltasOf(metrics) {
  return metrics ? triple(metrics.sales.paceDeltaPct, metrics.units.paceDeltaPct, metrics.orders.paceDeltaPct) : null;
}

function monthOf(shop) {
  if (!shop) return { month: null, monthDelta: null };
  const m = shop.metrics;
  return { month: triple(m.sales.current, m.units.current, m.orders.current), monthDelta: deltasOf(m) };
}

// One company month metric from two platforms' (counts only): each side's
// pace already leaves its own today out, so the paces add up.
function combineMonth(a, b) {
  if (!a || !b) return null;
  const sum = (x, y) => (known(x) && known(y) ? x + y : null);
  const current = sum(a.current, b.current);
  const previous = sum(a.previous, b.previous);
  const pace = sum(a.pace, b.pace);
  const prevPace = sum(a.prevPace, b.prevPace);
  const comparable = pace !== null && prevPace > 0;
  return {
    current,
    previous,
    vsPrevPct: previous > 0 && current !== null ? (current / previous) * 100 : null,
    pace,
    prevPace,
    paceDeltaPct: comparable ? (pace / prevPace - 1) * 100 : null,
    ahead: comparable ? pace >= prevPace : null,
  };
}

function amazonRow(shop) {
  const row = {
    key: shop.key,
    name: shop.name,
    platform: "amazon",
    today: isKnown(shop.today) ? shop.today : null,
    avg: shop.avg,
    // Amazon reports no visits, so no CVR either
    cvr: null,
    month: shop.month,
    monthDelta: deltasOf(shop.metrics),
    visits: null,
    visitDelta: null,
  };
  row.unknown = !isKnown(row.today) && !isKnown(row.month);
  return row;
}

// Rows in a fixed order for the whole month — this month's sales, largest
// first — so a shop keeps its line while today's figures move. Shops the month
// board does not know yet follow. Amazon shops take their place among 楽天's by
// the same measure. The footer carries one total per platform and, with more
// than one platform, the company's.
export function buildShopTable({ model, monthly, performance, amazon = null }) {
  const hasHistory = Boolean(model?.hasHistory);
  const nDays = model?.nDays || 7;
  const todayByName = new Map((model?.rows || []).map((r) => [r.name, r]));
  const monthByName = new Map((monthly?.shops || []).map((s) => [s.name, s]));
  const visitsByName = new Map((performance?.shops || []).map((s) => [s.name, s]));

  const monthOrder = (monthly?.shops || []).map((s) => s.name);
  const rest = (model?.rows || [])
    .filter((r) => !monthByName.has(r.name))
    .sort((a, b) => (b.rtSales ?? -1) - (a.rtSales ?? -1))
    .map((r) => r.name);

  const all = [];
  [...monthOrder, ...rest].forEach((name) => {
    const live = todayByName.get(name);
    const visits = visitsByName.get(name);
    const today = live ? triple(live.rtSales, live.rtUnits, live.rtOrders) : null;
    const row = {
      key: `rakuten:${name}`,
      name,
      platform: "rakuten",
      // a shop missing from the live snapshot, or left out of today's total, is
      // unknown today, not a ¥0 day
      today: isKnown(today) ? today : null,
      avg: hasHistory && live ? triple(live.h7Total / nDays, live.h7Units / nDays, live.h7Orders / nDays) : null,
      cvr: hasHistory && live ? live.cvr : null,
      ...monthOf(monthByName.get(name)),
      visits: visits?.visit ?? null,
      visitDelta: medianDelta(visits),
    };
    // nothing known for today or the month: the shop is on the list but not read
    row.unknown = !isKnown(row.today) && !isKnown(row.month);
    all.push({ row, week: live ? { sales: live.h7Total, orders: live.h7Orders } : null });
  });
  (amazon?.shops || []).forEach((shop) => all.push({ row: amazonRow(shop), week: shop.week }));
  // stable: 楽天's month order is kept, and shops without a month stay last
  all.sort((a, b) => (b.row.month?.sales ?? -1) - (a.row.month?.sales ?? -1));

  const rows = [];
  const idle = [];
  all.forEach(({ row, week }) => {
    // "no sales today, this week or this month" is only said with every figure in hand
    const isIdle = isKnown(row.today) && isKnown(row.month) && isZero(row.today) && isZero(week) && isZero(row.month);
    (isIdle ? idle : rows).push(row);
  });

  const m = monthly?.metrics;
  const rakutenToday = model ? triple(model.rtTotal, model.rtUnits, model.rtOrders) : null;
  const rakuten = {
    key: "total:rakuten",
    name: null,
    platform: "rakuten",
    today: isKnown(rakutenToday) ? rakutenToday : null,
    avg: hasHistory ? triple(model.avg, model.avgUnits, model.avgOrders) : null,
    cvr: hasHistory ? model.grandCvr : null,
    month: m ? triple(m.sales.current, m.units.current, m.orders.current) : null,
    monthDelta: deltasOf(m),
    visits: performance?.visit ?? null,
    visitDelta: medianDelta(performance),
  };
  const a = amazon?.company;
  if (!a) return { rows, idle, total: rakuten, totals: [rakuten] };

  const amazonTotal = {
    key: "total:amazon",
    name: null,
    platform: "amazon",
    today: isKnown(a.today) ? a.today : null,
    avg: a.avg,
    cvr: null,
    month: a.month,
    monthDelta: deltasOf(a.metrics),
    visits: null,
    visitDelta: null,
  };
  const units = combineMonth(m?.units, a.metrics?.units);
  const orders = combineMonth(m?.orders, a.metrics?.orders);
  const company = {
    key: "total:company",
    name: null,
    platform: null,
    today: addCounts([rakuten.today, amazonTotal.today]),
    // a week average only when every platform counted today has one
    avg: rakuten.avg && (amazonTotal.avg || !amazonTotal.today) ? addCounts([rakuten.avg, amazonTotal.avg]) : null,
    cvr: null,
    month: units && orders ? triple(null, units.current, orders.current) : null,
    monthDelta: units && orders ? triple(null, units.paceDeltaPct, orders.paceDeltaPct) : null,
    // visits are 楽天's alone and sit on its own line
    visits: null,
    visitDelta: null,
  };
  return { rows, idle, total: company, totals: [rakuten, amazonTotal, company] };
}

// Today across platforms, for the today card. With Amazon present the company
// figures are counts only; each platform keeps its own line with its yen.
export function buildTodayView(model, amazon = null) {
  const rakuten = {
    platform: "rakuten",
    values: triple(model.rtTotal, model.rtUnits, model.rtOrders),
    aov: model.aov,
    time: model.time,
  };
  const rakutenAvg = model.hasHistory ? triple(model.avg, model.avgUnits, model.avgOrders) : null;
  const mix = model.rows.map((r) => ({
    key: `rakuten:${r.name}`,
    name: r.name,
    values: triple(r.rtSales, r.rtUnits, r.rtOrders),
  }));
  const a = amazon?.company;
  if (!a) {
    return {
      multi: false,
      platforms: [rakuten],
      values: rakuten.values,
      aov: model.aov,
      unitsPerOrder: model.rtUnitsPerOrder,
      avg: rakutenAvg,
      days: model.days,
      salesDays: model.days,
      coverage: model.coverage,
      time: model.time,
      mix,
    };
  }

  const amazonToday = a.today ?? triple(null, null, null);
  const byDate = new Map(a.daily.map((d) => [d.date, d]));
  // the days both histories hold; without Amazon's week only 楽天's days are
  // honest, and only while Amazon adds nothing to today either
  let days = [];
  if (a.daily.length) {
    days = model.days
      .filter((d) => byDate.has(d.date))
      .map((d) => {
        const other = byDate.get(d.date);
        return { ...d, sales: null, units: d.units + (other.units ?? 0), orders: d.orders + (other.orders ?? 0) };
      });
  } else if (!a.today) {
    days = model.days;
  }
  return {
    multi: true,
    platforms: [
      rakuten,
      {
        platform: "amazon",
        values: amazonToday,
        aov:
          known(amazonToday.sales) && amazonToday.orders > 0
            ? Math.round(amazonToday.sales / amazonToday.orders)
            : null,
        time: a.updatedAt ? a.updatedAt.slice(11, 16) : "",
      },
    ],
    values: addCounts([model.rtTotal === null ? null : rakuten.values, a.today]) ?? triple(null, null, null),
    avg: rakutenAvg && (a.avg || !a.today) ? addCounts([rakutenAvg, a.avg]) : null,
    days,
    // 売上 bars stay 楽天's: no other platform's yen are added to them
    salesDays: model.days,
    coverage: addCoverage(model.coverage, a.coverage.today),
    time: model.time,
    mix: [
      ...mix,
      ...amazon.shops.map((s) => ({ key: s.key, name: s.name, values: s.today ?? triple(null, null, null) })),
    ],
  };
}

// The month across platforms, for the month card: company counts, and each
// platform's own figures for the yen.
export function buildMonthView(monthly, amazon = null) {
  if (!monthly) return null;
  const a = amazon?.company;
  if (!a?.metrics) return { ...monthly, multi: false, platforms: [{ platform: "rakuten", metrics: monthly.metrics }] };
  return {
    ...monthly,
    multi: true,
    current: { ...monthly.current, coverage: addCoverage(monthly.current.coverage, a.coverage.month) },
    metrics: {
      sales: null,
      units: combineMonth(monthly.metrics.units, a.metrics.units),
      orders: combineMonth(monthly.metrics.orders, a.metrics.orders),
    },
    platforms: [
      { platform: "rakuten", metrics: monthly.metrics },
      { platform: "amazon", metrics: a.metrics },
    ],
  };
}

// today against the trailing 7-day daily average — a raw ratio with no
// time-of-day correction, so the UI never colours it as good or bad
export function todayVsAverage(view, metric) {
  const value = view?.values?.[metric] ?? null;
  const avg = view?.avg?.[metric] ?? null;
  const comparable = value !== null && historyComparable(metric);
  return { value, avg, pct: comparable && avg > 0 ? (value / avg) * 100 : null };
}
