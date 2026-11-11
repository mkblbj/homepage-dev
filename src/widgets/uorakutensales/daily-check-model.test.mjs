import assert from "node:assert/strict";
import test from "node:test";

import { buildPerformanceModel } from "../uoperformance/performance-model.mjs";

import { buildAmazon } from "./amazon-model.mjs";
import { buildAupay } from "./aupay-model.mjs";
import {
  buildMonthView,
  buildShopTable,
  buildTodayView,
  deltaTone,
  RANKING_DIM_BY_METRIC,
  todayVsAverage,
  visitsFromFreshShops,
} from "./daily-check-model.mjs";
import { buildModel, buildMonthly } from "./sales-model.mjs";
import { buildTemu } from "./temu-model.mjs";

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

test("each row carries last month's actual figures", () => {
  const t = buildShopTable(fixture());
  const a = t.rows.find((r) => r.name === "A");
  assert.equal(a.previous.sales, 3000);
  assert.equal(a.previous.orders, 30);
  assert.equal(t.total.previous.sales, 4500);
});

test("a shop with no line on last month's board reads unknown, not zero", () => {
  const t = buildShopTable(fixture({ prevShops: [shopNow("B", 1500, 15)] }));
  assert.equal(t.rows.find((r) => r.name === "A").previous.sales, null);
  assert.equal(t.rows.find((r) => r.name === "B").previous.sales, 1500);
});

test("without the month board there is no last month either", () => {
  const t = buildShopTable({ ...fixture(), monthly: null });
  assert.equal(t.rows[0].previous, null);
  assert.equal(t.total.previous, null);
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
  const t = buildShopTable({ ...f, others: [amazonOf()] });
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
  const t = buildShopTable({ ...f, others: [amazonOf()] });
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

test("each shop row carries its own seven days; a shop without a counted week has none", () => {
  const t = buildShopTable(fixture());
  const a = t.rows.find((r) => r.name === "A");
  assert.equal(a.days.length, 7);
  assert.deepEqual([a.days[0].date, a.days[0].sales, a.days[0].orders, a.days[0].units], [DATES[0], 100, 1, 1]);
  // an idle shop keeps its days too, for when it is unfolded
  assert.equal(t.idle.find((r) => r.name === "Z").days.length, 7);

  const without = buildShopTable(fixture({ historyShops: [shopWeek("A", 100), shopWeek("Z", 0)] }));
  assert.equal(without.rows.find((r) => r.name === "B").days, null);
});

test("the 楽天 total carries the company's days, alone or beside other platforms", () => {
  const [rakuten] = buildShopTable(fixture()).totals;
  assert.equal(rakuten.days.length, 7);
  assert.deepEqual([rakuten.days[0].sales, rakuten.days[0].orders], [200, 2]);

  const beside = buildShopTable({ ...fixture(), others: [amazonOf()] }).totals[0];
  assert.deepEqual([beside.days[0].sales, beside.days[0].orders], [200, 2]);
});

test("Amazon rows and its total carry their days; the company total adds counts only", () => {
  const t = buildShopTable({ ...fixture(), others: [amazonOf()] });
  const az = t.rows.find((r) => r.platform === "amazon");
  assert.deepEqual([az.days.length, az.days[0].sales, az.days[0].orders], [7, 100, 1]);
  const [, amazon, company] = t.totals;
  assert.deepEqual([amazon.days.length, amazon.days[0].sales], [7, 100]);
  // 楽天's 2 orders and Amazon's 1 each day; the yen are never added across platforms
  assert.equal(company.days.length, 7);
  assert.deepEqual([company.days[0].sales, company.days[0].orders, company.days[0].units], [null, 3, 3]);
});

test("a platform with no daily of its own adds up its shops' days, and has none while a shop lacks them", () => {
  const temu = buildShopTable({ ...fixture(), others: [temuOf(undefined, { history: true })] });
  const temuShop = temu.rows.find((r) => r.key === "temu:UO world");
  assert.deepEqual([temuShop.days[0].sales, temuShop.days[0].orders], [null, 2]);
  const temuTotal = temu.totals.find((r) => r.key === "total:temu");
  assert.equal(temuTotal.days.length, 7);
  assert.deepEqual([temuTotal.days[0].sales, temuTotal.days[0].orders, temuTotal.days[0].units], [null, 2, 3]);
  // TEMU serves no week, so the company's days stay 楽天's counts
  assert.deepEqual([temu.total.days[0].sales, temu.total.days[0].orders], [null, 2]);

  const both = buildShopTable({ ...fixture(), others: [aupayOf({ historyOf: ["1", "2"] })] });
  const aupay = both.totals.find((r) => r.key === "total:aupay");
  assert.deepEqual([aupay.days[0].sales, aupay.days[0].orders, aupay.days[0].units], [400, 2, 4]);

  const one = buildShopTable({ ...fixture(), others: [aupayOf({ historyOf: ["1"] })] });
  assert.equal(one.rows.find((r) => r.key === "aupay:2").days, null);
  assert.equal(one.totals.find((r) => r.key === "total:aupay").days, null);
});

test("the today view adds counts across platforms and keeps each platform's yen apart", () => {
  const { model } = fixture();
  const view = buildTodayView(model, [amazonOf()]);
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
  const view = buildTodayView(model, [stale]);
  assert.deepEqual(view.values, { sales: null, units: 6, orders: 6 });
});

test("the month view adds counts and lists each platform's yen", () => {
  const { monthly } = fixture();
  const view = buildMonthView(monthly, [amazonOf()]);
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
  const alone = buildMonthView(monthly);
  assert.equal(alone.multi, false);
  assert.equal(alone.metrics, monthly.metrics);
});

// two au PAY shops beside the 楽天 fixture; one shares 楽天 shop A's name. By
// default the server is the older one with no last month; `previousMonth` adds it.
// `historyOf` names the config IDs whose seven days the server sends.
function aupayOf({ previousMonth = false, historyOf: withHistory = [] } = {}) {
  const row = (configId, shopName, extra) => ({
    configId,
    shopName,
    currency: "JPY",
    timezone: "Asia/Tokyo",
    enabled: true,
    status: "ready",
    includedInTotals: true,
    sourceUpdatedAt: "2026-10-25T01:15:00.000Z",
    ...extra,
  });
  const period = (rows) => ({
    ok: true,
    enabledShopCount: rows.length,
    updatedShopCount: rows.length,
    totalsByCurrency: {
      JPY: {
        salesAmount: rows.reduce((a, r) => a + r.totals.salesAmount, 0),
        unitsSold: rows.reduce((a, r) => a + r.totals.unitsSold, 0),
        orderCount: rows.reduce((a, r) => a + r.totals.orderCount, 0),
      },
    },
    shops: rows,
  });
  const totals = (salesAmount, unitsSold, orderCount) => ({ salesAmount, unitsSold, orderCount });
  return buildAupay({
    today: period([
      row("1", "A", { date: "2026-10-25", totals: totals(300, 2, 1) }),
      row("2", "幸田良品", { date: "2026-10-25", totals: totals(400, 3, 3) }),
    ]),
    month: period([
      row("1", "A", { month: "2026-10", totals: totals(1300, 20, 13) }),
      row("2", "幸田良品", { month: "2026-10", totals: totals(1600, 30, 27) }),
    ]),
    ...(previousMonth
      ? {
          previousMonth: period([
            row("1", "A", { month: "2026-09", totals: totals(1500, 30, 15) }),
            row("2", "幸田良品", { month: "2026-09", totals: totals(1500, 45, 45) }),
          ]),
        }
      : {}),
    history: {
      dates: DATES,
      shops: withHistory.map((configId) =>
        row(configId, configId === "1" ? "A" : "幸田良品", {
          daily: DATES.map((date) => ({ date, status: "ready", totals: totals(200, 2, 1) })),
        }),
      ),
    },
  });
}

test("an au PAY shop named like a 楽天 shop keeps its own row and its own figures", () => {
  const t = buildShopTable({ ...fixture(), others: [amazonOf(), aupayOf()] });
  const named = t.rows.filter((r) => r.name === "A");
  assert.deepEqual(
    named.map((r) => [r.key, r.platform, r.today.sales]),
    [
      ["rakuten:A", "rakuten", 10],
      ["aupay:1", "aupay", 300],
    ],
  );
  const au = named[1];
  // au PAY serves neither a week, a last month nor visits: unknown, never zero
  assert.equal(au.avg, null);
  assert.equal(au.cvr, null);
  assert.equal(au.visits, null);
  assert.equal(au.monthDelta.orders, null);
  assert.equal(au.month.orders, 13);
});

test("the footer closes with a line per platform and the company adds all their counts", () => {
  const t = buildShopTable({ ...fixture(), others: [amazonOf(), aupayOf()] });
  assert.deepEqual(
    t.totals.map((r) => r.key),
    ["total:rakuten", "total:amazon", "total:aupay", "total:company"],
  );
  // 楽天 6 + Amazon 2 + au PAY 4 orders today; no yen across platforms
  assert.deepEqual(t.total.today, { sales: null, units: 14, orders: 12 });
  assert.equal(t.total.month.orders, 10 + 20 + 40);
  assert.equal(t.total.month.sales, null);
  assert.deepEqual(t.weekExcludes, ["aupay"]);
  assert.deepEqual(t.prevExcludes, ["aupay"]);
});

test("the company's comparisons leave out a platform with no week or last month", () => {
  const f = fixture();
  const withAupay = buildShopTable({ ...f, others: [amazonOf(), aupayOf()] }).total;
  const without = buildShopTable({ ...f, others: [amazonOf()] }).total;
  // the same shops on both sides, so au PAY moves neither comparison
  assert.deepEqual(withAupay.avg, without.avg);
  assert.deepEqual(withAupay.weekToday, without.today);
  assert.equal(withAupay.monthDelta.orders, without.monthDelta.orders);
});

test("the today view counts au PAY but sets only the platforms with a week against it", () => {
  const { model } = fixture();
  const view = buildTodayView(model, [amazonOf(), aupayOf()]);
  assert.deepEqual(
    view.platforms.map((p) => [p.platform, p.values.sales]),
    [
      ["rakuten", 60],
      ["amazon", 700],
      ["aupay", 700],
    ],
  );
  assert.deepEqual(view.values, { sales: null, units: 14, orders: 12 });
  assert.deepEqual(view.coverage, { covered: 6, total: 6 });
  assert.deepEqual(view.weekExcludes, ["aupay"]);
  // 楽天 6 + Amazon 2 against 楽天 2 + Amazon 1 a day; au PAY's 4 stay out
  const orders = todayVsAverage(view, "orders");
  assert.equal(orders.value, 12);
  assert.equal(orders.avg, 3);
  assert.equal(orders.pct, (8 / 3) * 100);
  // au PAY has no history, so the bars are still the two platforms' week
  assert.equal(view.days.length, 7);
  assert.equal(view.days[0].orders, 3);
});

test("with au PAY alone beside 楽天 the week is 楽天's", () => {
  const { model } = fixture();
  const view = buildTodayView(model, [aupayOf()]);
  assert.equal(view.days[0].orders, model.days[0].orders);
  assert.equal(todayVsAverage(view, "orders").pct, (6 / 2) * 100);
});

test("the month view lists au PAY's yen and leaves it out of the comparison", () => {
  const { monthly } = fixture();
  const view = buildMonthView(monthly, [amazonOf(), aupayOf()]);
  const without = buildMonthView(monthly, [amazonOf()]);
  assert.equal(view.metrics.orders.current, 70);
  assert.equal(view.metrics.orders.previous, without.metrics.orders.previous);
  assert.equal(view.metrics.orders.paceDeltaPct, without.metrics.orders.paceDeltaPct);
  assert.equal(view.metrics.orders.vsPrevPct, without.metrics.orders.vsPrevPct);
  // this month's daily pace is every shop's: au PAY's (40 − 4) orders over 24 days
  assert.equal(view.metrics.orders.pace, without.metrics.orders.pace + 36 / 24);
  assert.equal(view.metrics.orders.prevPace, without.metrics.orders.prevPace);
  assert.deepEqual(view.prevExcludes, ["aupay"]);
  assert.deepEqual(
    view.platforms.map((p) => [p.platform, p.metrics.sales.current]),
    [
      ["rakuten", 3660],
      ["amazon", 1800],
      ["aupay", 2900],
    ],
  );
  assert.equal(view.platforms[2].metrics.sales.paceDeltaPct, null);
  assert.deepEqual(view.current.coverage.total, without.current.coverage.total + 2);
});

test("with au PAY's last month the company's comparison covers it too", () => {
  const { monthly } = fixture();
  const view = buildMonthView(monthly, [amazonOf(), aupayOf({ previousMonth: true })]);
  const without = buildMonthView(monthly, [amazonOf()]);
  // September: au PAY's 60 orders join last month's total and its daily pace
  assert.equal(view.metrics.orders.previous, without.metrics.orders.previous + 60);
  assert.equal(view.metrics.orders.prevPace, without.metrics.orders.prevPace + 60 / 30);
  assert.equal(view.metrics.orders.pace, without.metrics.orders.pace + 36 / 24);
  assert.equal(view.metrics.orders.paceDeltaPct, (view.metrics.orders.pace / view.metrics.orders.prevPace - 1) * 100);
  assert.equal(view.metrics.orders.vsPrevPct, (70 / view.metrics.orders.previous) * 100);
  assert.deepEqual(view.prevExcludes, []);
  // and au PAY's own month compares with its own last month
  assert.notEqual(view.platforms[2].metrics.sales.paceDeltaPct, null);

  const t = buildShopTable({ ...fixture(), others: [amazonOf(), aupayOf({ previousMonth: true })] });
  assert.deepEqual(t.weekExcludes, ["aupay"]);
  assert.deepEqual(t.prevExcludes, []);
  const au = t.rows.find((r) => r.key === "aupay:1");
  assert.deepEqual(au.previous, { sales: 1500, units: 30, orders: 15 });
  assert.notEqual(au.monthDelta.orders, null);
  assert.equal(t.total.previous.orders, without.metrics.orders.previous + 60);
});

// TEMU's one shop beside the 楽天 fixture, as it answers without the amount scope;
// `history` adds its seven days
function temuOf(
  today = { status: "ready", totals: { salesAmount: null, unitsSold: 2, orderCount: 2 } },
  { history = false } = {},
) {
  const period = (key, extra) => ({
    key,
    sourceUpdatedAt: "2026-10-25T01:18:00.000Z",
    amountError: "TEMU_AMOUNT_SCOPE_REQUIRED",
    ...extra,
  });
  return buildTemu({
    ok: true,
    shopName: "UO world",
    currency: "JPY",
    timezone: "Asia/Tokyo",
    today: period("2026-10-25", today),
    month: period("2026-10", { status: "ready", totals: { salesAmount: null, unitsSold: 26, orderCount: 25 } }),
    previousMonth: period("2026-09", { status: "ready", totals: { salesAmount: null, unitsSold: 31, orderCount: 30 } }),
    ...(history
      ? {
          history: {
            dates: DATES,
            shops: [
              {
                shopName: "UO world",
                currency: "JPY",
                enabled: true,
                daily: DATES.map((date) => ({
                  date,
                  status: "ready",
                  totals: { salesAmount: null, unitsSold: 3, orderCount: 2 },
                })),
              },
            ],
          },
        }
      : {}),
  });
}

test("TEMU's shop shows its counts while its yen stay a dash", () => {
  const t = buildShopTable({ ...fixture(), others: [amazonOf(), aupayOf(), temuOf()] });
  const temu = t.rows.find((r) => r.key === "temu:UO world");
  assert.equal(temu.platform, "temu");
  assert.equal(temu.unknown, false);
  assert.deepEqual(temu.today, { sales: null, units: 2, orders: 2 });
  assert.deepEqual(temu.month, { sales: null, units: 26, orders: 25 });
  assert.equal(temu.monthDelta.sales, null);
  assert.notEqual(temu.monthDelta.orders, null);
  const total = t.totals.find((r) => r.key === "total:temu");
  assert.deepEqual(total.today, { sales: null, units: 2, orders: 2 });
  // 楽天 6 + Amazon 2 + au PAY 4 + TEMU 2 orders today
  assert.deepEqual(t.total.today, { sales: null, units: 16, orders: 14 });
  assert.equal(t.total.month.orders, 10 + 20 + 40 + 25);
  assert.deepEqual(t.weekExcludes, ["aupay", "temu"]);
  assert.deepEqual(t.prevExcludes, ["aupay"]);
});

test("a TEMU day not collected yet is unknown, not a zero day", () => {
  const t = buildShopTable({ ...fixture(), others: [temuOf({ status: "not_ready", totals: null })] });
  const temu = t.rows.find((r) => r.key === "temu:UO world");
  assert.equal(temu.today, null);
  // the month is still read, so the shop is on the list and not idle
  assert.equal(temu.unknown, false);
  assert.equal(
    t.idle.some((r) => r.key === "temu:UO world"),
    false,
  );
  assert.equal(t.total.today.orders, 6);
});

test("the today and month cards count TEMU and give it a yen line of dashes", () => {
  const { model, monthly } = fixture();
  const today = buildTodayView(model, [aupayOf(), temuOf()]);
  assert.deepEqual(
    today.platforms.map((p) => [p.platform, p.values.sales, p.values.orders]),
    [
      ["rakuten", 60, 6],
      ["aupay", 700, 4],
      ["temu", null, 2],
    ],
  );
  assert.equal(today.platforms[2].aov, null);
  assert.equal(today.values.orders, 12);
  assert.deepEqual(today.weekExcludes, ["aupay", "temu"]);

  const month = buildMonthView(monthly, [aupayOf(), temuOf()]);
  const withoutTemu = buildMonthView(monthly, [aupayOf()]);
  assert.equal(month.metrics.orders.current, withoutTemu.metrics.orders.current + 25);
  // TEMU served last month, so it joins the comparison
  assert.equal(month.metrics.orders.previous, withoutTemu.metrics.orders.previous + 30);
  assert.equal(month.platforms.find((p) => p.platform === "temu").metrics.sales.current, null);
  assert.deepEqual(month.prevExcludes, ["aupay"]);
});

// ---- one shop's visit read failing must not read as every shop stopping ----

function mixOf(newYen, repeatYen) {
  return {
    new: { salesYen: newYen, orderCount: 1 },
    repeat: { salesYen: repeatYen, orderCount: 1 },
    repeatBuckets: {
      repeat1: { salesYen: repeatYen, orderCount: 1 },
      repeat2: { salesYen: 0, orderCount: 0 },
      repeat3: { salesYen: 0, orderCount: 0 },
      repeatOver4: { salesYen: 0, orderCount: 0 },
    },
    period: { startDateJST: "2026-10-27", endDateJST: "2026-11-02" },
  };
}

function trafficShop(shopName, date, stale, visitCount, delta = 5) {
  return {
    shopName,
    traffic: {
      dataDateJST: date,
      visitCount,
      uniqueVisitorCount: visitCount - 10,
      expectedVisitCount: visitCount,
      visitDeltaPercent: delta,
      sampleCount: 4,
    },
    customerMix: mixOf(300, 100),
    sources: { traffic: { ok: true, stale }, customerMix: { ok: true, stale } },
  };
}

// what the server sends with two shops stuck: the company block falls back to
// the last day every shop has, and the company source reads stale
const partlyStopped = () =>
  buildPerformanceModel({
    ok: true,
    partial: true,
    traffic: { dataDateJST: "2026-10-27", visitCount: 22133, uniqueVisitorCount: 20000, sampleCount: 0 },
    customerMix: { ...mixOf(1, 1), period: { startDateJST: "2026-10-27", endDateJST: "2026-10-27" } },
    sources: { traffic: { ok: true, stale: true, dataDateJST: "2026-10-27" }, customerMix: { ok: true, stale: true } },
    shops: [
      trafficShop("A", "2026-11-02", false, 100),
      trafficShop("B", "2026-11-02", false, 50),
      trafficShop("S", "2026-10-27", true, 40, 47.5),
    ],
  });

test("the company visits add up the shops that are up to date, on their own day", () => {
  const v = visitsFromFreshShops(partlyStopped());
  assert.equal(v.dataDateJST, "2026-11-02");
  assert.equal(v.visit, 150);
  assert.equal(v.uu, 130);
  assert.deepEqual(v.coverage, { covered: 2, total: 3 });
  assert.equal(v.sources.traffic.stale, false);
});

test("the company median comparison is unknown while shops are missing from it", () => {
  const v = visitsFromFreshShops(partlyStopped());
  assert.equal(v.expected, null);
  assert.equal(v.delta, null);
});

test("a stopped shop is named with the day it stopped, and keeps no live comparison", () => {
  const v = visitsFromFreshShops(partlyStopped());
  assert.deepEqual(v.stoppedShops, [{ name: "S", date: "2026-10-27" }]);
  const s = v.shops.find((shop) => shop.name === "S");
  assert.equal(s.visit, 40);
  assert.equal(s.stoppedAt, "2026-10-27");
  assert.equal(s.delta, null);
  assert.equal(v.shops.find((shop) => shop.name === "A").stoppedAt, null);
});

test("the customer mix adds up the same shops over their own period", () => {
  const { mix } = visitsFromFreshShops(partlyStopped());
  assert.equal(mix.newYen, 600);
  assert.equal(mix.repYen, 200);
  assert.equal(mix.newSalesShare, 75);
  assert.equal(mix.buckets[0].yen, 200);
  assert.deepEqual(mix.period, { startDateJST: "2026-10-27", endDateJST: "2026-11-02" });
});

test("the shop table totals read the fresh shops and mark the stopped row", () => {
  const f = fixture();
  const performance = visitsFromFreshShops(
    buildPerformanceModel({
      traffic: { dataDateJST: "2026-10-27", visitCount: 999, sampleCount: 0 },
      sources: { traffic: { stale: true } },
      shops: [trafficShop("A", "2026-11-02", false, 100), trafficShop("B", "2026-10-27", true, 40, 47.5)],
    }),
  );
  const t = buildShopTable({ ...f, performance });
  assert.equal(t.total.visits, 100);
  assert.equal(t.total.visitDelta, null);
  const b = t.rows.find((r) => r.name === "B");
  assert.equal(b.visits, 40);
  assert.equal(b.visitDelta, null);
  assert.equal(b.visitsStoppedAt, "2026-10-27");
  assert.equal(t.rows.find((r) => r.name === "A").visitsStoppedAt, null);
});

test("with every shop up to date the server's company figures stand untouched", () => {
  const performance = buildPerformanceModel({
    traffic: {
      dataDateJST: "2026-11-02",
      visitCount: 160,
      expectedVisitCount: 170,
      visitDeltaPercent: -6,
      sampleCount: 4,
    },
    shops: [trafficShop("A", "2026-11-02", false, 100), trafficShop("B", "2026-11-02", false, 50)],
  });
  const v = visitsFromFreshShops(performance);
  assert.equal(v.visit, 160);
  assert.equal(v.expected, 170);
  assert.equal(v.delta, -6);
  assert.deepEqual(v.stoppedShops, []);
  assert.equal(v.coverage, null);
});

test("when every shop has stopped the company still reads as stopped", () => {
  const performance = buildPerformanceModel({
    traffic: { dataDateJST: "2026-10-27", visitCount: 90, sampleCount: 0 },
    sources: { traffic: { stale: true } },
    shops: [trafficShop("A", "2026-10-27", true, 50), trafficShop("B", "2026-10-27", true, 40)],
  });
  const v = visitsFromFreshShops(performance);
  assert.equal(v.visit, 90);
  assert.equal(v.sources.traffic.stale, true);
  assert.deepEqual(v.stoppedShops, []);
});

test("no snapshot stays no snapshot", () => {
  assert.equal(visitsFromFreshShops(null), null);
});
