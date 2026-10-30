import assert from "node:assert/strict";
import test from "node:test";

import { buildPerformanceModel } from "../uoperformance/performance-model.mjs";

import { buildAmazon } from "./amazon-model.mjs";
import {
  buildMonthView,
  buildShopTable,
  buildTodayView,
  deltaTone,
  RANKING_DIM_BY_METRIC,
  todayVsAverage,
} from "./daily-check-model.mjs";
import { buildModel, buildMonthly } from "./sales-model.mjs";

const STAMP = "2026-10-25 10:20 JST";
const DATES = ["2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"];

function shopNow(shopName, salesYen, orderCount = 0, unitsSold = orderCount) {
  return { shopName, salesYen, orderCount, unitsSold };
}

function shopWeek(shopName, perDay, conversionRate = 2) {
  return {
    shopName,
    totals: { salesYen: perDay * 7, orderCount: perDay ? 7 : 0, unitsSold: perDay ? 7 : 0, conversionRate },
    daily: DATES.map((date) => ({ date, salesYen: perDay, orderCount: perDay ? 1 : 0, unitsSold: perDay ? 1 : 0 })),
  };
}

function salesOf(shops) {
  const sum = (k) => shops.reduce((acc, s) => acc + s[k], 0);
  return {
    generatedAtJST: STAMP,
    sourceUpdatedAtJST: STAMP,
    totals: { salesYen: sum("salesYen"), orderCount: sum("orderCount"), unitsSold: sum("unitsSold") },
    shops,
  };
}

// the company's days are the server's own sums, as /api/history/sales sends them
function historyOf(shops) {
  const sumOn = (date, key) => shops.reduce((a, s) => a + (s.daily.find((d) => d.date === date)?.[key] ?? 0), 0);
  return {
    range: { startDate: DATES[0], endDate: DATES[DATES.length - 1], dates: DATES },
    totals: {
      salesYen: shops.reduce((a, s) => a + s.totals.salesYen, 0),
      orderCount: 14,
      unitsSold: 14,
      conversionRate: null,
    },
    daily: DATES.map((date) => ({
      date,
      salesYen: sumOn(date, "salesYen"),
      orderCount: sumOn(date, "orderCount"),
      unitsSold: sumOn(date, "unitsSold"),
      conversionRate: null,
    })),
    shops,
  };
}

// month = 1–24 finished + today live; last month is September (30 days)
function monthlyOf(sales, current, previous) {
  return {
    ok: true,
    currentMonth: {
      month: "2026-10",
      status: "live",
      completedThroughDate: "2026-10-24",
      liveDate: "2026-10-25",
      updatedAtJST: STAMP,
      sourceUpdatedAtJST: STAMP,
      totals: { salesYen: current.reduce((a, s) => a + s.salesYen, 0), orderCount: 10, unitsSold: 10 },
      shops: current,
    },
    previousMonth: {
      month: "2026-09",
      status: "complete",
      totals: { salesYen: previous.reduce((a, s) => a + s.salesYen, 0), orderCount: 10, unitsSold: 10 },
      shops: previous,
    },
  };
}

function performanceOf(shops, sampleCount = 4) {
  return {
    ok: true,
    traffic: { dataDateJST: "2026-10-24", visitCount: 300, visitDeltaPercent: -15.1, sampleCount },
    shops: shops.map(([shopName, visitCount, visitDeltaPercent, shopSamples = sampleCount]) => ({
      shopName,
      traffic: { visitCount, visitDeltaPercent, sampleCount: shopSamples },
    })),
  };
}

// A sells less today but more this month than B; Z has never sold anything
function fixture({ salesShops, historyShops, monthShops, prevShops, perfShops } = {}) {
  const sales = salesOf(salesShops ?? [shopNow("A", 10, 1), shopNow("B", 50, 5), shopNow("Z", 0)]);
  const history = historyOf(historyShops ?? [shopWeek("A", 100), shopWeek("B", 100), shopWeek("Z", 0)]);
  const monthly = monthlyOf(
    sales,
    monthShops ?? [shopNow("A", 2410, 24), shopNow("B", 1250, 12), shopNow("Z", 0)],
    prevShops ?? [shopNow("A", 3000, 30), shopNow("B", 1500, 15), shopNow("Z", 0)],
  );
  return {
    model: buildModel(sales, history),
    monthly: buildMonthly(monthly, sales),
    performance: buildPerformanceModel(
      performanceOf(
        perfShops ?? [
          ["A", 200, -10],
          ["B", 100, -25],
        ],
      ),
    ),
  };
}

test("rows follow this month's sales, idle shops are split off", () => {
  const t = buildShopTable(fixture());
  assert.deepEqual(
    t.rows.map((r) => r.name),
    ["A", "B"],
  );
  assert.deepEqual(
    t.idle.map((r) => r.name),
    ["Z"],
  );
});

test("a shop missing from the month board follows the ranked ones", () => {
  const t = buildShopTable(
    fixture({ salesShops: [shopNow("A", 10, 1), shopNow("B", 50, 5), shopNow("C", 5, 1), shopNow("Z", 0)] }),
  );
  assert.deepEqual(
    t.rows.map((r) => r.name),
    ["A", "B", "C"],
  );
  assert.equal(t.rows[2].month, null);
  assert.equal(t.rows[2].monthDelta, null);
});

test("a shop sold out of the realtime snapshot but active this month is still listed", () => {
  const t = buildShopTable(fixture({ salesShops: [shopNow("B", 50, 5)] }));
  // Z is missing from the live snapshot too, so it is unknown rather than idle
  assert.deepEqual(
    t.rows.map((r) => r.name),
    ["A", "B", "Z"],
  );
  // missing from the live snapshot is unknown today, not a ¥0 day
  assert.equal(t.rows[0].today, null);
  assert.equal(t.rows[0].avg, null);
  assert.equal(t.rows[0].cvr, null);
});

test("a shop missing from the live snapshot is never called idle", () => {
  const t = buildShopTable(fixture({ salesShops: [shopNow("B", 50, 5)] }));
  assert.ok(t.rows.some((r) => r.name === "Z"));
  assert.deepEqual(t.idle, []);
});

test("an unknown month figure is not a zero month", () => {
  const t = buildShopTable(
    fixture({
      salesShops: [shopNow("A", 0), shopNow("B", 50, 5)],
      historyShops: [shopWeek("B", 100)],
      monthShops: [{ shopName: "A", salesYen: null, orderCount: null, unitsSold: null }, shopNow("B", 1250, 12)],
    }),
  );
  const a = t.rows.find((r) => r.name === "A");
  assert.ok(a, "A stays in the rows");
  assert.equal(a.month.sales, null);
  assert.equal(a.monthDelta.sales, null);
});

test("a shop quiet today but active this month is not idle", () => {
  const t = buildShopTable(
    fixture({
      salesShops: [shopNow("A", 0), shopNow("B", 50, 5), shopNow("Z", 0)],
      historyShops: [shopWeek("B", 100)],
    }),
  );
  assert.ok(t.rows.some((r) => r.name === "A"));
  assert.ok(!t.idle.some((r) => r.name === "A"));
});

test("averages are per day over the history span", () => {
  const a = buildShopTable(fixture()).rows.find((r) => r.name === "A");
  assert.deepEqual(a.avg, { sales: 100, units: 1, orders: 1 });
  assert.equal(a.cvr, 2);
});

test("there is no average without history", () => {
  const f = fixture();
  const t = buildShopTable({ ...f, model: { ...f.model, hasHistory: false } });
  assert.equal(t.rows[0].avg, null);
  assert.equal(t.rows[0].cvr, null);
  assert.equal(t.total.avg, null);
});

test("month columns carry this month's total and the pace against last month", () => {
  const t = buildShopTable(fixture());
  const a = t.rows.find((r) => r.name === "A");
  assert.equal(a.month.sales, 2410);
  // (2410 − 10) / 24 = 100 a day against 3000 / 30 = 100 a day
  assert.equal(a.monthDelta.sales, 0);
  assert.equal(t.total.month.sales, 3660);
});

test("month columns stay unknown when pace is unknown", () => {
  const f = fixture();
  const monthly = {
    ...f.monthly,
    shops: f.monthly.shops.map((s) => ({
      ...s,
      metrics: { ...s.metrics, sales: { ...s.metrics.sales, paceDeltaPct: null } },
    })),
  };
  const a = buildShopTable({ ...f, monthly }).rows.find((r) => r.name === "A");
  assert.equal(a.monthDelta.sales, null);
});

test("without the month board the month columns are unknown, not zero", () => {
  const t = buildShopTable({ ...fixture(), monthly: null });
  assert.equal(t.rows[0].month, null);
  assert.equal(t.total.month, null);
  assert.equal(t.total.monthDelta, null);
});

test("visits come from yesterday's performance snapshot", () => {
  const t = buildShopTable(fixture());
  const b = t.rows.find((r) => r.name === "B");
  assert.equal(b.visits, 100);
  assert.equal(b.visitDelta, -25);
  assert.equal(t.total.visits, 300);
  assert.equal(t.total.visitDelta, -15.1);
});

test("visits are unknown without the performance snapshot", () => {
  const t = buildShopTable({ ...fixture(), performance: null });
  assert.equal(t.rows[0].visits, null);
  assert.equal(t.rows[0].visitDelta, null);
  assert.equal(t.total.visits, null);
});

test("a shop the performance snapshot does not cover has unknown visits", () => {
  const t = buildShopTable(fixture({ perfShops: [["B", 100, -25]] }));
  assert.equal(t.rows.find((r) => r.name === "A").visits, null);
});

test("a median comparison needs three same-weekday samples", () => {
  const f = fixture();
  const performance = buildPerformanceModel(
    performanceOf(
      [
        ["A", 200, -30, 2],
        ["B", 100, -25, 4],
      ],
      2,
    ),
  );
  const t = buildShopTable({ ...f, performance });
  assert.equal(t.rows.find((r) => r.name === "A").visits, 200);
  assert.equal(t.rows.find((r) => r.name === "A").visitDelta, null);
  assert.equal(t.rows.find((r) => r.name === "B").visitDelta, -25);
  assert.equal(t.total.visitDelta, null);
});

test("without the month board no shop is called idle", () => {
  const f = fixture({
    salesShops: [shopNow("A", 0), shopNow("B", 50, 5), shopNow("Z", 0)],
    historyShops: [shopWeek("B", 100)],
  });
  const t = buildShopTable({ ...f, monthly: null });
  assert.deepEqual(t.idle, []);
  assert.deepEqual(t.rows.map((r) => r.name).sort(), ["A", "B", "Z"]);
});

test("deltaTone colours only past twenty percent", () => {
  assert.equal(deltaTone(-20), "down");
  assert.equal(deltaTone(-19.9), "flat");
  assert.equal(deltaTone(0), "flat");
  assert.equal(deltaTone(20), "up");
  assert.equal(deltaTone(null), "unknown");
  assert.equal(deltaTone(undefined), "unknown");
  assert.equal(deltaTone(Number.NaN), "unknown");
});

test("todayVsAverage compares today's counts with the 7-day daily average", () => {
  const { model } = fixture();
  assert.deepEqual(todayVsAverage(buildTodayView(model), "orders"), { value: 6, avg: 2, pct: 300 });
});

// since 2026-10-30 楽天's week comes from the order API, like today: one yen basis
test("todayVsAverage sets today's yen against the 7-day average too", () => {
  const { model } = fixture();
  assert.deepEqual(todayVsAverage(buildTodayView(model), "sales"), { value: 60, avg: 200, pct: 30 });
});

test("a shop left out of today's total reads unknown today, never zero", () => {
  const f = fixture({
    salesShops: [shopNow("A", 10, 1), shopNow("B", 50, 5), { ...shopNow("K", null, null), includedInTotals: false }],
    monthShops: [shopNow("A", 2410, 24), shopNow("B", 1250, 12), shopNow("K", null, null)],
  });
  const t = buildShopTable(f);
  const k = t.rows.find((r) => r.name === "K");
  assert.equal(k.today, null);
  assert.equal(k.unknown, true);
  assert.equal(t.rows.find((r) => r.name === "A").unknown, false);
});

test("the total row is unknown when the server has no readable shop today", () => {
  const f = fixture();
  const sales = { ok: false, totals: null, generatedAtJST: STAMP, shops: [] };
  const t = buildShopTable({ ...f, model: buildModel(sales, null) });
  assert.equal(t.total.today, null);
  assert.deepEqual(todayVsAverage(buildTodayView(buildModel(sales, null)), "orders"), {
    value: null,
    avg: null,
    pct: null,
  });
});

test("todayVsAverage has no ratio without history", () => {
  const { model } = fixture();
  assert.deepEqual(todayVsAverage(buildTodayView({ ...model, hasHistory: false }), "sales"), {
    value: 60,
    avg: null,
    pct: null,
  });
});

test("each module metric maps onto the ranking board it sorts by", () => {
  assert.deepEqual(RANKING_DIM_BY_METRIC, { sales: "sales", units: "units", orders: "orderCount" });
});

// one Amazon shop beside the 楽天 fixture: same JST day, same month
function amazonOf({ todayTotals = { salesAmount: 700, unitsSold: 3, orderCount: 2 } } = {}) {
  const row = (extra) => ({
    shopName: "uoworld",
    accountId: "acc",
    marketplaceId: "JP",
    currency: "JPY",
    timezone: "Asia/Tokyo",
    enabled: true,
    status: "ready",
    includedInTotals: true,
    sourceUpdatedAt: "2026-10-25T01:20:00.000Z",
    ...extra,
  });
  const period = (r) => ({
    ok: true,
    enabledShopCount: 1,
    updatedShopCount: 1,
    totalsByCurrency: { JPY: r.totals },
    shops: [r],
  });
  const sales = {
    today: period(row({ date: "2026-10-25", totals: todayTotals })),
    month: period(row({ month: "2026-10", totals: { salesAmount: 1800, unitsSold: 30, orderCount: 20 } })),
    previousMonth: period(row({ month: "2026-09", totals: { salesAmount: 1500, unitsSold: 30, orderCount: 30 } })),
  };
  const history = {
    window: { completeDays: 7 },
    shops: [
      row({
        totals: { salesAmount: 700, unitsSold: 7, orderCount: 7 },
        daily: DATES.map((date) => ({ date, totals: { salesAmount: 100, unitsSold: 1, orderCount: 1 } })),
      }),
    ],
  };
  return buildAmazon(sales, history);
}

test("Amazon shops take their place among 楽天's by this month's sales", () => {
  const f = fixture();
  const t = buildShopTable({ ...f, amazon: amazonOf() });
  // A ¥2,410 · uoworld ¥1,800 · B ¥1,250 this month
  assert.deepEqual(
    t.rows.map((r) => r.name),
    ["A", "uoworld", "B"],
  );
  const az = t.rows[1];
  assert.equal(az.platform, "amazon");
  assert.equal(az.key, "amazon:acc:JP");
  assert.deepEqual(az.today, { sales: 700, units: 3, orders: 2 });
  assert.deepEqual(az.avg, { sales: 100, units: 1, orders: 1 });
  // Amazon reports no visits, so there is no CVR or visit figure to show
  assert.equal(az.cvr, null);
  assert.equal(az.visits, null);
  assert.equal(t.rows[0].platform, "rakuten");
});

test("the footer has a line per platform and a company line that adds only counts", () => {
  const f = fixture();
  const t = buildShopTable({ ...f, amazon: amazonOf() });
  assert.deepEqual(
    t.totals.map((r) => r.key),
    ["total:rakuten", "total:amazon", "total:company"],
  );
  const [rakuten, amazon, company] = t.totals;
  assert.deepEqual(rakuten.today, { sales: 60, units: 6, orders: 6 });
  assert.deepEqual(amazon.today, { sales: 700, units: 3, orders: 2 });
  // the company's yen stay empty: the platforms measure them differently
  assert.deepEqual(company.today, { sales: null, units: 9, orders: 8 });
  assert.equal(company.month.sales, null);
  assert.equal(company.month.orders, 10 + 20);
  // visits are 楽天's alone
  assert.equal(rakuten.visits, 300);
  assert.equal(company.visits, null);
  assert.equal(t.total, company);
});

test("without Amazon the table keeps its single 楽天 total", () => {
  const t = buildShopTable(fixture());
  assert.equal(t.totals.length, 1);
  assert.equal(t.total, t.totals[0]);
});

test("the today view adds counts across platforms and keeps each platform's yen apart", () => {
  const { model } = fixture();
  const view = buildTodayView(model, amazonOf());
  assert.equal(view.multi, true);
  assert.deepEqual(view.values, { sales: null, units: 9, orders: 8 });
  assert.deepEqual(
    view.platforms.map((p) => [p.platform, p.values.sales]),
    [
      ["rakuten", 60],
      ["amazon", 700],
    ],
  );
  assert.deepEqual(view.coverage, { covered: 4, total: 4 });
  // the week: 楽天's 2 orders a day plus Amazon's 1, matched by date
  assert.equal(view.days.length, 7);
  assert.equal(view.days[0].orders, 3);
  assert.equal(view.days[0].sales, null);
  // 売上 bars stay 楽天's
  assert.equal(view.salesDays, model.days);
  const orders = todayVsAverage(view, "orders");
  assert.equal(orders.value, 8);
  assert.equal(orders.avg, 3);
  assert.deepEqual(todayVsAverage(view, "sales"), { value: null, avg: null, pct: null });
});

test("the today view still counts 楽天 when Amazon could not be read today", () => {
  const { model } = fixture();
  const stale = amazonOf({ todayTotals: null });
  const view = buildTodayView(model, stale);
  assert.deepEqual(view.values, { sales: null, units: 6, orders: 6 });
});

test("the month view adds counts and lists each platform's yen", () => {
  const { monthly } = fixture();
  const view = buildMonthView(monthly, amazonOf());
  assert.equal(view.multi, true);
  assert.equal(view.metrics.sales, null);
  assert.equal(view.metrics.orders.current, 30);
  assert.deepEqual(
    view.platforms.map((p) => [p.platform, p.metrics.sales.current]),
    [
      ["rakuten", 3660],
      ["amazon", 1800],
    ],
  );
  // and without Amazon it is the 楽天 month as it was
  const alone = buildMonthView(monthly, null);
  assert.equal(alone.multi, false);
  assert.equal(alone.metrics, monthly.metrics);
});
