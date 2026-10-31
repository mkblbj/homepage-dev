// View model for the sales tab's daily check: one row per shop — 楽天, Amazon and
// au PAY side by side — with today, the last 7 days, this month and yesterday's
// visits. Unknown stays null all the way to the screen — a missing board is
// never drawn as zero.
//
// Order and unit counts add up across platforms; yen never do. Each platform
// counts its amounts its own way, so 売上 stays per platform and the company row
// leaves it empty. Comparisons need the same shops on both sides: a platform
// without a week or a last month (au PAY) counts in the company's figures but
// stays out of its 7-day and last-month comparisons.

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

const sumAll = (values) => (values.every(known) ? values.reduce((a, b) => a + b, 0) : null);

// One company month metric (counts only). This month's total and daily pace add up
// every platform. Last month and the comparisons add up only `comparable`, the
// platforms that serve a last month, so both sides cover the same shops. Each
// side's pace already leaves its own today out, so the paces add up; a platform
// whose today could not be read just adds no pace of its own.
function combineMonth(parts, comparable) {
  if (parts.some((part) => !part)) return null;
  const pick = (list, key) => sumAll(list.map((part) => part[key]));
  const current = pick(parts, "current");
  const comparableCurrent = pick(comparable, "current");
  const previous = pick(comparable, "previous");
  const comparablePace = pick(comparable, "pace");
  const prevPace = pick(comparable, "prevPace");
  const canCompare = comparablePace !== null && prevPace > 0;
  const extraPace = parts
    .filter((part) => !comparable.includes(part))
    .reduce((total, part) => total + (part.pace ?? 0), 0);
  return {
    current,
    previous,
    vsPrevPct: previous > 0 && comparableCurrent !== null ? (comparableCurrent / previous) * 100 : null,
    pace: comparablePace === null ? null : comparablePace + extraPace,
    prevPace,
    paceDeltaPct: canCompare ? (comparablePace / prevPace - 1) * 100 : null,
    ahead: canCompare ? comparablePace >= prevPace : null,
  };
}

// The company's unit and order metrics: 楽天 plus each platform with a month to add.
function companyMonth(rakutenMetrics, others) {
  const present = others.filter((o) => o.company.metrics);
  const comparable = present.filter((o) => o.provides.previous);
  const dim = (key) =>
    rakutenMetrics
      ? combineMonth(
          [rakutenMetrics[key], ...present.map((o) => o.company.metrics[key])],
          [rakutenMetrics[key], ...comparable.map((o) => o.company.metrics[key])],
        )
      : null;
  return { units: dim("units"), orders: dim("orders"), present };
}

function otherShopRow(shop) {
  const row = {
    key: shop.key,
    name: shop.name,
    platform: shop.platform,
    today: isKnown(shop.today) ? shop.today : null,
    avg: shop.avg,
    // no other platform reports visits, so no CVR either
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
// board does not know yet follow. Other platforms' shops take their place among
// 楽天's by the same measure. The footer carries one total per platform and, with
// more than one platform, the company's. `others` are the other platforms' view
// models (amazon-model, aupay-model).
export function buildShopTable({ model, monthly, performance, others = [] }) {
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
      // a shop whose week the server could not count has no average, not a zero one
      avg:
        hasHistory && live && live.h7Total !== null
          ? triple(live.h7Total / nDays, live.h7Units / nDays, live.h7Orders / nDays)
          : null,
      cvr: hasHistory && live ? live.cvr : null,
      ...monthOf(monthByName.get(name)),
      visits: visits?.visit ?? null,
      visitDelta: medianDelta(visits),
    };
    // nothing known for today or the month: the shop is on the list but not read
    row.unknown = !isKnown(row.today) && !isKnown(row.month);
    all.push({ row, week: live ? { sales: live.h7Total, orders: live.h7Orders } : null });
  });
  others.forEach((other) => {
    other.shops.forEach((shop) => all.push({ row: otherShopRow(shop), week: shop.week }));
  });
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
  if (!others.length) return { rows, idle, total: rakuten, totals: [rakuten] };

  const otherTotals = others.map((other) => {
    const a = other.company;
    return {
      key: `total:${other.platform}`,
      name: null,
      platform: other.platform,
      today: isKnown(a.today) ? a.today : null,
      avg: a.avg,
      cvr: null,
      month: a.month,
      monthDelta: deltasOf(a.metrics),
      visits: null,
      visitDelta: null,
    };
  });
  const { units, orders } = companyMonth(m, others);
  const withWeek = otherTotals.filter((_, i) => others[i].provides.week);
  const company = {
    key: "total:company",
    name: null,
    platform: null,
    today: addCounts([rakuten.today, ...otherTotals.map((o) => o.today)]),
    // Today's figure against the week: only the platforms that serve a week, on
    // both sides, and only when each of those counted today has one.
    weekToday: addCounts([rakuten.today, ...withWeek.map((o) => o.today)]),
    avg:
      rakuten.avg && withWeek.every((o) => o.avg || !o.today)
        ? addCounts([rakuten.avg, ...withWeek.map((o) => o.avg)])
        : null,
    cvr: null,
    month: units && orders ? triple(null, units.current, orders.current) : null,
    monthDelta: units && orders ? triple(null, units.paceDeltaPct, orders.paceDeltaPct) : null,
    // visits are 楽天's alone and sit on its own line
    visits: null,
    visitDelta: null,
  };
  return {
    rows,
    idle,
    total: company,
    totals: [rakuten, ...otherTotals, company],
    // the platforms the company's 7-day and last-month comparisons leave out
    compareExcludes: others.filter((o) => !o.provides.week || !o.provides.previous).map((o) => o.platform),
  };
}

// Today across platforms, for the today card. With other platforms present the
// company figures are counts only; each platform keeps its own line with its yen.
export function buildTodayView(model, others = []) {
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
  if (!others.length) {
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

  const rakutenValues = model.rtTotal === null ? null : rakuten.values;
  const withWeek = others.filter((o) => o.provides.week);
  // the days every history holds; a platform counted today without its week
  // leaves no honest bars, while one with nothing today adds nothing to them
  const histories = withWeek.filter((o) => o.company.daily.length);
  const missingWeek = withWeek.some((o) => !o.company.daily.length && o.company.today);
  const days = missingWeek
    ? []
    : model.days
        .map((d) => {
          const matches = histories.map((o) => o.company.daily.find((day) => day.date === d.date));
          if (matches.some((day) => !day)) return null;
          if (!histories.length) return d;
          const add = (key) => matches.reduce((total, day) => total + (day[key] ?? 0), d[key]);
          return { ...d, sales: null, units: add("units"), orders: add("orders") };
        })
        .filter(Boolean);
  return {
    multi: true,
    platforms: [
      rakuten,
      ...others.map((o) => {
        const values = o.company.today ?? triple(null, null, null);
        return {
          platform: o.platform,
          values,
          aov: known(values.sales) && values.orders > 0 ? Math.round(values.sales / values.orders) : null,
          time: o.company.updatedAt ? o.company.updatedAt.slice(11, 16) : "",
        };
      }),
    ],
    values: addCounts([rakutenValues, ...others.map((o) => o.company.today)]) ?? triple(null, null, null),
    // what stands against the week: only the platforms that serve one, on both sides
    weekValues: addCounts([rakutenValues, ...withWeek.map((o) => o.company.today)]),
    avg:
      rakutenAvg && withWeek.every((o) => o.company.avg || !o.company.today)
        ? addCounts([rakutenAvg, ...withWeek.map((o) => o.company.avg)])
        : null,
    weekExcludes: others.filter((o) => !o.provides.week).map((o) => o.platform),
    days,
    // 売上 bars stay 楽天's: no other platform's yen are added to them
    salesDays: model.days,
    coverage: others.reduce((coverage, o) => addCoverage(coverage, o.company.coverage.today), model.coverage),
    time: model.time,
    mix: [
      ...mix,
      ...others.flatMap((o) =>
        o.shops.map((s) => ({ key: s.key, name: s.name, values: s.today ?? triple(null, null, null) })),
      ),
    ],
  };
}

// The month across platforms, for the month card: company counts, and each
// platform's own figures for the yen.
export function buildMonthView(monthly, others = []) {
  if (!monthly) return null;
  const { units, orders, present } = companyMonth(monthly.metrics, others);
  if (!present.length)
    return { ...monthly, multi: false, platforms: [{ platform: "rakuten", metrics: monthly.metrics }] };
  return {
    ...monthly,
    multi: true,
    current: {
      ...monthly.current,
      coverage: present.reduce(
        (coverage, o) => addCoverage(coverage, o.company.coverage.month),
        monthly.current.coverage,
      ),
    },
    metrics: { sales: null, units, orders },
    platforms: [
      { platform: "rakuten", metrics: monthly.metrics },
      ...present.map((o) => ({ platform: o.platform, metrics: o.company.metrics })),
    ],
    // the platforms with no last month, left out of the comparison
    prevExcludes: present.filter((o) => !o.provides.previous).map((o) => o.platform),
  };
}

// today against the trailing 7-day daily average — a raw ratio with no
// time-of-day correction, so the UI never colours it as good or bad
export function todayVsAverage(view, metric) {
  const value = view?.values?.[metric] ?? null;
  const avg = view?.avg?.[metric] ?? null;
  const compared = view?.weekValues ? (view.weekValues[metric] ?? null) : value;
  return { value, avg, pct: compared !== null && avg > 0 ? (compared / avg) * 100 : null };
}
