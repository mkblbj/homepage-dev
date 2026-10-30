// View model for the 楽天 tab's daily check: one row per shop with today, the
// last 7 days, this month and yesterday's visits side by side. Unknown stays
// null all the way to the screen — a missing board is never drawn as zero.

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
  return values !== null && values.sales !== null && values.orders !== null;
}

function isZero(values) {
  return !values || (!(values.sales > 0) && !(values.orders > 0));
}

// The 7-day history still comes from R-Karte, whose yen are after coupons;
// today and the month come from the order API, before coupons. Counts mean the
// same on both sides, so only 売上 is never set against the history.
export function historyComparable(metric) {
  return metric !== "sales";
}

function monthOf(shop) {
  if (!shop) return { month: null, monthDelta: null };
  const m = shop.metrics;
  return {
    month: triple(m.sales.current, m.units.current, m.orders.current),
    monthDelta: triple(m.sales.paceDeltaPct, m.units.paceDeltaPct, m.orders.paceDeltaPct),
  };
}

// Rows in a fixed order for the whole month — this month's sales, largest
// first — so a shop keeps its line while today's figures move. Shops the month
// board does not know yet follow, by today's sales.
export function buildShopTable({ model, monthly, performance }) {
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

  const rows = [];
  const idle = [];
  [...monthOrder, ...rest].forEach((name) => {
    const live = todayByName.get(name);
    const visits = visitsByName.get(name);
    const today = live ? triple(live.rtSales, live.rtUnits, live.rtOrders) : null;
    const row = {
      name,
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
    const week = live ? { sales: live.h7Total, orders: live.h7Orders } : null;
    // "no sales today, this week or this month" is only said with every figure in hand
    const isIdle = isKnown(row.today) && isKnown(row.month) && isZero(row.today) && isZero(week) && isZero(row.month);
    (isIdle ? idle : rows).push(row);
  });

  const m = monthly?.metrics;
  const companyToday = model ? triple(model.rtTotal, model.rtUnits, model.rtOrders) : null;
  const total = {
    name: null,
    today: isKnown(companyToday) ? companyToday : null,
    avg: hasHistory ? triple(model.avg, model.avgUnits, model.avgOrders) : null,
    cvr: hasHistory ? model.grandCvr : null,
    month: m ? triple(m.sales.current, m.units.current, m.orders.current) : null,
    monthDelta: m ? triple(m.sales.paceDeltaPct, m.units.paceDeltaPct, m.orders.paceDeltaPct) : null,
    visits: performance?.visit ?? null,
    visitDelta: medianDelta(performance),
  };

  return { rows, idle, total };
}

const TODAY_KEY = { sales: "rtTotal", units: "rtUnits", orders: "rtOrders" };
const AVG_KEY = { sales: "avg", units: "avgUnits", orders: "avgOrders" };

// today against the trailing 7-day daily average — a raw ratio with no
// time-of-day correction, so the UI never colours it as good or bad
export function todayVsAverage(model, metric) {
  const value = model?.[TODAY_KEY[metric]] ?? null;
  const avg = model?.hasHistory ? (model[AVG_KEY[metric]] ?? null) : null;
  const comparable = value !== null && historyComparable(metric);
  return { value, avg, pct: comparable && avg > 0 ? (value / avg) * 100 : null };
}
