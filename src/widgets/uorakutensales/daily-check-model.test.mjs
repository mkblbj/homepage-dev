import assert from "node:assert/strict";
import test from "node:test";

import { buildPerformanceModel } from "../uoperformance/performance-model.mjs";

import { buildShopTable, deltaTone, RANKING_DIM_BY_METRIC, todayVsAverage } from "./daily-check-model.mjs";
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
    totals: { salesYen: sum("salesYen"), orderCount: sum("orderCount"), unitsSold: sum("unitsSold") },
    shops,
  };
}

function historyOf(shops) {
  return {
    range: { dates: DATES },
    totals: {
      salesYen: shops.reduce((a, s) => a + s.totals.salesYen, 0),
      orderCount: 14,
      unitsSold: 14,
      conversionRate: 1.9,
    },
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

test("todayVsAverage compares today with the 7-day daily average", () => {
  const { model } = fixture();
  assert.deepEqual(todayVsAverage(model, "sales"), { value: 60, avg: 200, pct: 30 });
  assert.deepEqual(todayVsAverage(model, "orders"), { value: 6, avg: 2, pct: 300 });
});

test("todayVsAverage has no ratio without history", () => {
  const { model } = fixture();
  assert.deepEqual(todayVsAverage({ ...model, hasHistory: false }, "sales"), { value: 60, avg: null, pct: null });
});

test("each module metric maps onto the ranking board it sorts by", () => {
  assert.deepEqual(RANKING_DIM_BY_METRIC, { sales: "sales", units: "units", orders: "orderCount" });
});
