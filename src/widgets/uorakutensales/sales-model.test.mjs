import assert from "node:assert/strict";
import test from "node:test";

import {
  buildModel,
  buildMonthly,
  buildPeaks,
  buildRanking,
  buildShopColors,
  computeFreshness,
  DEFAULT_MONTH_DIM,
  DEFAULT_RANKING_DIM,
  DEFAULT_REFRESH_INTERVAL,
  man,
  mdLabel,
  MONTH_DIMS,
  pointX,
  RANKING_MAX_COUNT,
  RANKING_STEPS,
  spark,
  timeFromJST,
  weekdayJp,
} from "./sales-model.mjs";

const sales = {
  generatedAtJST: "2026-07-07 13:30 JST",
  totals: { salesYen: 30000, orderCount: 12 },
  shops: [
    { shopName: "3911", salesYen: 20000, orderCount: 8, status: "authenticated" },
    { shopName: "0406", salesYen: 10000, orderCount: 4, status: "authenticated" },
    { shopName: "allcase", salesYen: 0, orderCount: 0, status: "authenticated" },
  ],
};

const history = {
  generatedAtJST: "2026-07-07 06:30 JST",
  range: { dates: ["2026-06-30", "2026-07-01", "2026-07-02"] },
  totals: { salesYen: 90000, orderCount: 60, conversionRate: 2.35 },
  shops: [
    {
      shopName: "3911",
      totals: { salesYen: 60000, orderCount: 40, conversionRate: 2.1 },
      daily: [
        { date: "2026-06-30", salesYen: 10000, orderCount: 6 },
        { date: "2026-07-01", salesYen: 20000, orderCount: 14 },
        { date: "2026-07-02", salesYen: 30000, orderCount: 20 },
      ],
    },
    {
      shopName: "0406",
      totals: { salesYen: 30000, orderCount: 20, conversionRate: 1.8 },
      daily: [
        { date: "2026-06-30", salesYen: 5000, orderCount: 3 },
        { date: "2026-07-01", salesYen: 10000, orderCount: 7 },
        { date: "2026-07-02", salesYen: 15000, orderCount: 10 },
      ],
    },
  ],
};

test("buildModel returns null without a realtime snapshot", () => {
  assert.equal(buildModel(null, history), null);
  assert.equal(buildModel(undefined, undefined), null);
});

test("buildModel derives realtime totals, AOV and freshness timestamp", () => {
  const model = buildModel(sales, history);
  assert.equal(model.rtTotal, 30000);
  assert.equal(model.rtOrders, 12);
  assert.equal(model.aov, Math.round(30000 / 12));
  assert.equal(model.generatedAtJST, "2026-07-07 13:30 JST");
  assert.equal(model.time, "13:30");
});

test("buildModel sorts rows by today's sales and merges 7-day context", () => {
  const model = buildModel(sales, history);
  assert.deepEqual(model.rows.map((r) => r.name), ["3911", "0406", "allcase"]);

  const top = model.rows[0];
  assert.equal(top.rtSales, 20000);
  assert.equal(top.rtBarPct, 100); // biggest realtime shop → full bar
  assert.equal(Math.round(top.rtShare), 67); // 20000 / 30000
  assert.equal(top.h7Total, 60000);
  assert.equal(top.h7Orders, 40);
  assert.equal(top.cvr, 2.1);
  // per-shop daily is now enriched with date/md/wd/orders for the hover mini chart
  assert.deepEqual(top.daily.map((d) => d.sales), [10000, 20000, 30000]);
  assert.equal(top.daily[0].md, "6/30");
  assert.equal(top.daily[0].orders, 6);
  assert.equal(top.daily[0].wd, "火"); // 2026-06-30 is a Tuesday

  const idle = model.rows[2];
  assert.equal(idle.name, "allcase");
  assert.equal(idle.rtSales, 0);
  assert.equal(idle.rtShare, 0);
  assert.deepEqual(idle.daily, []); // no history row → empty context
});

test("buildModel computes the 7-day share baseline and a shared bullet scale", () => {
  const model = buildModel(sales, history);
  assert.equal(Math.round(model.rows[0].h7Share), 67); // 3911: 60000 / 90000
  assert.equal(Math.round(model.rows[1].h7Share), 33); // 0406: 30000 / 90000
  assert.equal(model.rows[2].h7Share, 0); // allcase: no history row
  // scale is the largest share across today/7-day so bullet lengths stay comparable
  assert.equal(Number(model.shareScale.toFixed(2)), 66.67);
});

test("buildModel falls back to a safe bullet scale without history", () => {
  const model = buildModel(sales, null);
  assert.equal(model.rows[0].h7Share, 0); // no baseline → tick is hidden by the component
  assert.ok(model.shareScale >= 1); // never divides by zero
});

test("buildModel merges shop logos by shopName, null when absent", () => {
  const logos = {
    shops: [
      { shopName: "3911", logoUrl: "https://cdn.example/3911.jpg" },
      { shopName: "0406", logoUrl: "" }, // empty → treated as no logo
    ],
  };
  const model = buildModel(sales, history, logos);
  assert.equal(model.rows[0].logoUrl, "https://cdn.example/3911.jpg"); // 3911
  assert.equal(model.rows[1].logoUrl, null); // 0406 — empty string normalized to null
  assert.equal(model.rows[2].logoUrl, null); // allcase — not in logos payload

  // logos are optional — model still builds without them
  assert.equal(buildModel(sales, history).rows[0].logoUrl, null);
});

test("buildModel aggregates daily totals across shops for the trend chart", () => {
  const model = buildModel(sales, history);
  assert.equal(model.nDays, 3);
  assert.deepEqual(model.days.map((d) => d.sales), [15000, 30000, 45000]);
  assert.deepEqual(model.days.map((d) => d.md), ["6/30", "7/1", "7/2"]);
  assert.equal(model.maxDaily, 45000);
  assert.equal(model.avg, 90000 / 3);
  assert.equal(model.avgOrders, 60 / 3); // per-day average orders
  assert.equal(model.grandTotal, 90000);
  assert.equal(model.grandCvr, 2.35);
  assert.equal(model.hasHistory, true);
  // xPct uses segment centers (i+0.5)/n so the chart, hover zones and axis
  // labels (equal-width flex tracks) all line up. For 3 days: 16.67 / 50 / 83.33.
  assert.equal(Number(model.days[0].xPct.toFixed(2)), 16.67);
  assert.equal(model.days[1].xPct, 50);
  assert.equal(Number(model.days[2].xPct.toFixed(2)), 83.33);
});

test("buildModel keeps per-shop daily CVR and derives the all-shop one", () => {
  const withCvr = {
    range: { dates: ["2026-07-26"] },
    totals: { salesYen: 0, orderCount: 0, conversionRate: 0 },
    shops: [
      // 100 orders at 5% → 2000 visits
      { shopName: "3911", totals: {}, daily: [{ date: "2026-07-26", salesYen: 1000, orderCount: 100, conversionRate: 5 }] },
      // 20 orders at 2% → 1000 visits
      { shopName: "0406", totals: {}, daily: [{ date: "2026-07-26", salesYen: 500, orderCount: 20, conversionRate: 2 }] },
    ],
  };
  const model = buildModel({ totals: {}, shops: [{ shopName: "3911" }, { shopName: "0406" }] }, withCvr);

  // per-shop rows carry the API's own rate verbatim
  assert.equal(model.rows.find((r) => r.name === "3911").daily[0].cvr, 5);
  assert.equal(model.rows.find((r) => r.name === "0406").daily[0].cvr, 2);

  // all-shop day: 120 orders over 3000 derived visits = 4.00%, not (5+2)/2
  assert.equal(model.days[0].orders, 120);
  assert.equal(Number(model.days[0].cvr.toFixed(2)), 4);
});

test("buildModel reports a zero all-shop CVR when no day has one", () => {
  const noCvr = {
    range: { dates: ["2026-07-26"] },
    totals: {},
    shops: [{ shopName: "3911", totals: {}, daily: [{ date: "2026-07-26", salesYen: 100, orderCount: 5 }] }],
  };
  const model = buildModel({ totals: {}, shops: [{ shopName: "3911" }] }, noCvr);
  assert.equal(model.days[0].cvr, 0); // component hides the CVR segment
  assert.equal(model.rows[0].daily[0].cvr, 0);
});

test("buildModel tolerates a missing history snapshot", () => {
  const model = buildModel(sales, null);
  assert.equal(model.hasHistory, false);
  assert.equal(model.grandTotal, 0);
  assert.equal(model.nDays, 7); // falls back to a week when no dates
  assert.equal(model.rows.length, 3);
  assert.equal(model.rows[0].h7Total, 0);
});

test("weekdayJp is timezone-stable (UTC based)", () => {
  assert.equal(weekdayJp("2026-07-07"), "火"); // Tuesday
  assert.equal(weekdayJp("2026-07-05"), "日"); // Sunday
  assert.equal(weekdayJp(""), "");
  assert.equal(weekdayJp("not-a-date"), "");
});

test("mdLabel and timeFromJST format compact labels", () => {
  assert.equal(mdLabel("2026-07-06"), "7/6");
  assert.equal(mdLabel(""), "");
  assert.equal(timeFromJST("2026-07-07 13:30 JST"), "13:30");
  assert.equal(timeFromJST(""), "");
});

test("man converts yen to a 万 figure with one decimal", () => {
  assert.equal(man(123456), "12.3");
  assert.equal(man(0), "0.0");
  assert.equal(man(null), "0.0");
});

test("spark produces a smooth path and a closed area, empty for no data", () => {
  const { line, area } = spark([1, 5, 3, 8], 100, 40, true);
  assert.match(line, /^M /);
  assert.match(line, / C /);
  assert.ok(area.endsWith("Z"));
  assert.deepEqual(spark([], 100, 40, true), { line: "", area: "" });
});

test("pointX places points edge-to-edge or at segment centers", () => {
  // edge-to-edge: first at 0, last at w
  assert.equal(pointX(0, 4, 100, false), 0);
  assert.equal(pointX(3, 4, 100, false), 100);
  // centered: each at the middle of its 1/n-wide track (aligns with flex zones/labels)
  assert.equal(pointX(0, 4, 100, true), 12.5);
  assert.equal(pointX(3, 4, 100, true), 87.5);
  // single point → centered regardless
  assert.equal(pointX(0, 1, 100, false), 50);
});

test("computeFreshness classifies live / delayed / stale by snapshot age", () => {
  const base = Date.parse("2026-07-07T13:30:00+09:00");
  const ri = DEFAULT_REFRESH_INTERVAL; // 60s → liveMax 180s, staleMax 1800s

  assert.equal(computeFreshness("2026-07-07 13:30 JST", base + 60_000, ri).state, "live");
  assert.equal(computeFreshness("2026-07-07 13:30 JST", base + 600_000, ri).state, "delayed");
  assert.equal(computeFreshness("2026-07-07 13:30 JST", base + 3_600_000, ri).state, "stale");
  assert.equal(computeFreshness(null, base, ri), null);
  assert.equal(computeFreshness("2026-07-07 13:30 JST", null, ri), null);
});

// ---- item ranking ----

// one dimension block as GET /api/item-rankings returns it
const dimBlock = (items, shops = []) => ({
  ok: true,
  partial: false,
  shopCount: shops.length || 2,
  updatedShopCount: shops.length || 2,
  staleShopCount: 0,
  failedShopCount: 0,
  overall: { itemCount: items.length, items },
  shops,
  lastError: null,
});

const salesItems = [
  {
    rank: 1,
    itemManagementNumber: "18crb01-libero5g",
    itemName: "ArrowsWe2 スマホケース",
    itemUrl: "https://item.rakuten.co.jp/0406colors/18crb01-libero5g",
    imageUrl: "https://image.rakuten.co.jp/x.jpg",
    averageUnitPriceYen: 717,
    unitsSold: 12,
    salesYen: 8600,
    orderCount: 1,
    shopCount: 1,
    shopBreakdown: [{ shopName: "0406" }],
  },
  {
    rank: 2,
    itemManagementNumber: "",
    itemNumber: "FALLBACK-NO",
    itemName: "フォールバック商品",
    salesYen: 4000,
    unitsSold: 2,
    orderCount: 1,
    averageUnitPriceYen: 2000,
    shopCount: 2,
    shopBreakdown: [{ shopName: "3911" }, { shopName: "松武" }],
  },
];

// the orderCount board ranks the same catalogue differently
const orderItems = [
  { rank: 1, itemManagementNumber: "hot-seller", salesYen: 3450, unitsSold: 4, orderCount: 4, averageUnitPriceYen: 863, shopCount: 1, shopBreakdown: [{ shopName: "松武" }] },
  { rank: 2, itemManagementNumber: "18crb01-libero5g", salesYen: 8600, unitsSold: 12, orderCount: 1, averageUnitPriceYen: 717, shopCount: 1, shopBreakdown: [{ shopName: "0406" }] },
];

const rankingPayload = {
  ok: true,
  partial: false,
  sourceDateJST: "2026-07-29",
  generatedAtJST: "2026-07-29 16:46 JST",
  sourceLimitPerShop: 100,
  lastError: null,
  rankings: {
    sales: dimBlock(salesItems, [
      { shopName: "3911", itemCount: 100, ok: true, stale: false, items: [{ rank: 1, itemManagementNumber: "a-1", salesYen: 4620, unitsSold: 2, orderCount: 1, averageUnitPriceYen: 2310, shopCount: 1, shopBreakdown: [{ shopName: "3911" }] }] },
      { shopName: "allcase", itemCount: 1, ok: true, stale: true, items: [] },
    ]),
    units: dimBlock(salesItems),
    orderCount: dimBlock(orderItems),
  },
};

test("buildRanking returns null without a payload or when every dimension is empty", () => {
  assert.equal(buildRanking(null), null);
  assert.equal(buildRanking({ rankings: {} }), null);
  assert.equal(buildRanking({ rankings: { sales: dimBlock([]) } }), null);
});

test("buildRanking exposes the three dimensions in UI order", () => {
  const r = buildRanking(rankingPayload);
  assert.equal(r.sourceDate, "2026-07-29");
  assert.equal(r.partial, false);
  // orderCount leads: it is the default dimension
  assert.deepEqual(r.available, ["orderCount", "sales", "units"]);
  assert.equal(r.available[0], DEFAULT_RANKING_DIM);
  assert.deepEqual(Object.keys(r.dims).sort(), ["orderCount", "sales", "units"]);
});

test("buildRanking keeps each dimension's own ordering", () => {
  const r = buildRanking(rankingPayload);
  // the sales board leads with the biggest yen figure...
  assert.equal(r.dims.sales.overall[0].mno, "18crb01-libero5g");
  assert.deepEqual(r.dims.sales.overall.map((i) => i.salesYen), [8600, 4000]);
  // ...while the orderCount board leads with the item most people bought
  assert.equal(r.dims.orderCount.overall[0].mno, "hot-seller");
  assert.deepEqual(r.dims.orderCount.overall.map((i) => i.orderCount), [4, 1]);
});

test("buildRanking normalizes item fields and drops unused bulk", () => {
  const first = buildRanking(rankingPayload).dims.sales.overall[0];
  assert.equal(first.mno, "18crb01-libero5g");
  assert.equal(first.url, "https://item.rakuten.co.jp/0406colors/18crb01-libero5g");
  assert.equal(first.salesYen, 8600);
  assert.equal(first.avgPrice, 717);
  assert.equal(first.shopName, "0406"); // overall rows carry their shop
  // the ~1MB payload's long name / full breakdown are not retained
  assert.equal(first.name, undefined);
  assert.equal(first.shops, undefined);
});

test("buildRanking falls back for a blank management number and missing url", () => {
  const second = buildRanking(rankingPayload).dims.sales.overall[1];
  assert.equal(second.mno, "FALLBACK-NO"); // empty management number → itemNumber
  assert.equal(second.url, null); // no itemUrl → component renders a non-link row
  assert.equal(second.shopCount, 2);
  assert.equal(second.shopName, "3911"); // first shop of the breakdown
});

test("buildRanking exposes per-shop boards including empty ones", () => {
  const sales = buildRanking(rankingPayload).dims.sales;
  assert.deepEqual(sales.shops.map((s) => s.shopName), ["3911", "allcase"]);
  assert.equal(sales.shops[0].items[0].mno, "a-1");
  assert.equal(sales.shops[0].itemCount, 100);
  assert.equal(sales.shops[1].items.length, 0); // empty board → section shows noData
  assert.equal(sales.shops[1].stale, true);
});

test("buildRanking skips a dimension the payload omits", () => {
  const r = buildRanking({ rankings: { orderCount: dimBlock(orderItems) } });
  assert.deepEqual(r.available, ["orderCount"]);
  assert.equal(r.dims.sales, undefined); // toggle only renders available dims
});

test("buildRanking caps each board at 100 items", () => {
  const many = Array.from({ length: 140 }, (_, i) => ({ rank: i + 1, itemManagementNumber: "m" + i, salesYen: 1000 - i }));
  const r = buildRanking({ rankings: { sales: dimBlock(many, [{ shopName: "3911", items: many }]) } });
  assert.equal(r.dims.sales.overall.length, RANKING_MAX_COUNT);
  assert.equal(r.dims.sales.shops[0].items.length, RANKING_MAX_COUNT);
  assert.equal(RANKING_MAX_COUNT, 100);
});

test("RANKING_STEPS reveals progressively and ends at the cap", () => {
  assert.deepEqual([...RANKING_STEPS], [11, 20, 50, 100]);
  // strictly increasing so each click always reveals more
  RANKING_STEPS.forEach((v, i) => i && assert.ok(v > RANKING_STEPS[i - 1]));
  assert.equal(RANKING_STEPS[RANKING_STEPS.length - 1], RANKING_MAX_COUNT);
});

// ---- historical peaks ----

const peaksPayload = {
  ok: true,
  status: "ready",
  generatedAtJST: "2026-08-29 07:16 JST",
  coverage: { startDate: "2018-01-01", endDate: "2026-08-28", shopCount: 7 },
  shopRankings: {
    sales: [
      { rank: 1, shopName: "3911", salesYen: 1684009, date: "2025-10-15" },
      { rank: 2, shopName: "松武", salesYen: 1427527, date: "2023-11-02" },
    ],
    orders: [{ rank: 1, shopName: "松武", orderCount: 741, date: "2022-09-10" }],
  },
  companyRecords: {
    sales: {
      salesYen: 2917505,
      date: "2025-10-15",
      shopContributions: [
        { shopName: "3911", salesYen: 1684009 },
        { shopName: "0406", salesYen: 709754 },
        { shopName: "allcase", salesYen: 0 },
      ],
    },
    orders: { orderCount: 1899, date: "2026-03-05", shopContributions: [{ shopName: "3911", orderCount: 661 }] },
  },
};

test("buildPeaks withholds anything that is not a complete snapshot", () => {
  assert.equal(buildPeaks(null), null);
  assert.equal(buildPeaks({ status: "not_ready", coverage: {} }), null);
  assert.equal(buildPeaks({ status: "ready" }), null); // ready but empty boards
});

test("buildPeaks decorates company records and drops zero contributors", () => {
  const r = buildPeaks(peaksPayload);
  assert.deepEqual(r.available, ["sales", "orders"]);
  assert.equal(r.coverage.startYear, 2018);
  assert.equal(r.coverage.shopCount, 7);

  const sales = r.records.sales;
  assert.equal(sales.value, 2917505);
  assert.equal(sales.md, "10/15");
  assert.equal(sales.wd, "水"); // 2025-10-15 is a Wednesday
  assert.equal(sales.year, 2025);
  // allcase contributed nothing that day → excluded from the stacked bar
  assert.deepEqual(sales.contributions.map((c) => c.shopName), ["3911", "0406"]);
  assert.equal(Number(sales.contributions[0].pct.toFixed(1)), 57.7);
});

test("buildPeaks flags a personal best that landed on a company-record day", () => {
  const r = buildPeaks(peaksPayload);
  // 3911 peaked on the very day the company set its sales record
  assert.equal(r.shopBests.sales[0].onRecordDay, true);
  assert.equal(r.shopBests.sales[1].onRecordDay, false); // 松武 peaked on its own day
});

test("buildShopColors spreads a distinct hue per shop, order-independent", () => {
  const a = buildShopColors(["松武", "3911", "0406"]);
  const b = buildShopColors(["0406", "松武", "3911", "3911"]);
  assert.deepEqual(a, b); // same shops → same hues whatever order they arrive in
  assert.equal(new Set(Object.values(a)).size, 3); // every shop clearly distinguishable
});

test("buildShopColors covers a full shop set without repeating a hue", () => {
  const shops = ["3911", "0406", "松田", "松武", "天海", "hagumi", "allcase"];
  const colors = buildShopColors(shops);
  assert.equal(new Set(Object.values(colors)).size, shops.length);
  // callers union every board's shops, so a board missing one shop must not
  // shift the others — the union assignment is what keeps boards in agreement
  const union = buildShopColors([...shops, "newshop"]);
  assert.equal(union["3911"], colors["3911"] === union["3911"] ? union["3911"] : colors["3911"]);
});

test("buildModel surfaces unitsSold at every level", () => {
  const s = { totals: { salesYen: 300, orderCount: 3, unitsSold: 9 }, shops: [{ shopName: "3911", salesYen: 300, orderCount: 3, unitsSold: 9 }] };
  const h = {
    range: { dates: ["2026-08-31"] },
    totals: { salesYen: 1000, orderCount: 10, unitsSold: 25 },
    shops: [{ shopName: "3911", totals: { salesYen: 1000, orderCount: 10, unitsSold: 25 }, daily: [{ date: "2026-08-31", salesYen: 1000, orderCount: 10, unitsSold: 25 }] }],
  };
  const m = buildModel(s, h);
  assert.equal(m.rtUnits, 9); // today's company total
  assert.equal(m.rows[0].rtUnits, 9); // and per shop
  assert.equal(m.grandUnits, 25); // 7-day total
  assert.equal(m.avgUnits, 25); // per-day average over one day
  assert.equal(m.rows[0].h7Units, 25); // per-shop 7-day total
  assert.equal(m.days[0].units, 25); // aggregated per-day, summable unlike CVR
  assert.equal(m.rows[0].daily[0].units, 25); // per-shop per-day
});

test("buildPeaks exposes the units record board", () => {
  const dim = (key, value) => ({
    overall: { items: [] },
    shops: [],
    shopRankings: undefined,
  });
  const payload = {
    status: "ready",
    coverage: { startDate: "2021-01-01", endDate: "2026-08-31", shopCount: 2 },
    shopRankings: {
      sales: [{ rank: 1, shopName: "3911", salesYen: 500, date: "2026-08-20" }],
      units: [{ rank: 1, shopName: "3911", unitsSold: 620, date: "2026-08-22" }],
      orders: [{ rank: 1, shopName: "0406", orderCount: 90, date: "2026-08-21" }],
    },
    companyRecords: {
      sales: { salesYen: 900, date: "2026-08-20", shopContributions: [{ shopName: "3911", salesYen: 500 }] },
      units: { unitsSold: 1100, date: "2026-08-22", shopContributions: [{ shopName: "3911", unitsSold: 620 }] },
      orders: { orderCount: 150, date: "2026-08-21", shopContributions: [{ shopName: "0406", orderCount: 90 }] },
    },
  };
  const r = buildPeaks(payload);
  assert.deepEqual(r.available, ["sales", "units", "orders"]);
  assert.equal(r.records.units.value, 1100); // reads unitsSold, not salesYen
  assert.equal(r.records.units.md, "8/22");
  assert.equal(r.shopBests.units[0].value, 620);
  assert.equal(r.records.units.contributions[0].pct, (620 / 1100) * 100);
});

test("buildModel exposes units-per-order at company and shop level", () => {
  const s = {
    totals: { salesYen: 300, orderCount: 10, unitsSold: 30 },
    shops: [
      { shopName: "3911", salesYen: 200, orderCount: 2, unitsSold: 24 }, // wholesale-ish
      { shopName: "0406", salesYen: 100, orderCount: 8, unitsSold: 6 },
    ],
  };
  const h = { range: { dates: [] }, totals: { salesYen: 0, orderCount: 4, unitsSold: 10 }, shops: [] };
  const m = buildModel(s, h);
  assert.equal(m.rtUnitsPerOrder, 3); // 30 units / 10 orders
  assert.equal(m.unitsPerOrder, 2.5); // 7-day: 10 / 4
  assert.equal(m.rows.find((r) => r.name === "3911").rtUnitsPerOrder, 12); // 24 / 2
  assert.equal(m.rows.find((r) => r.name === "0406").rtUnitsPerOrder, 0.75);
});

test("buildModel reports zero units-per-order rather than dividing by zero", () => {
  const m = buildModel({ totals: { orderCount: 0, unitsSold: 0 }, shops: [{ shopName: "kurumu", orderCount: 0, unitsSold: 0 }] }, null);
  assert.equal(m.rtUnitsPerOrder, 0);
  assert.equal(m.rows[0].rtUnitsPerOrder, 0); // component hides the ×N badge
});

test("buildPeaks marks a zero peak as no record at all", () => {
  const payload = {
    status: "ready",
    coverage: { startDate: "2018-01-01", endDate: "2026-08-31", unitsStartDate: "2021-01-01", shopCount: 2 },
    shopRankings: {
      sales: [
        { rank: 1, shopName: "3911", salesYen: 500, date: "2026-08-20" },
        // never sold: the API still reports a date (the last day scanned)
        { rank: 2, shopName: "kurumu", salesYen: 0, date: "2026-08-31" },
      ],
    },
    companyRecords: { sales: { salesYen: 500, date: "2026-08-20", shopContributions: [{ shopName: "3911", salesYen: 500 }] } },
  };
  const r = buildPeaks(payload);
  assert.equal(r.shopBests.sales[0].noRecord, false);
  assert.equal(r.shopBests.sales[1].noRecord, true); // → rendered as 記録なし, no date
});

test("buildPeaks keeps the units coverage window separate from sales", () => {
  const r = buildPeaks({
    status: "ready",
    coverage: { startDate: "2018-01-01", endDate: "2026-08-31", unitsStartDate: "2021-01-01", shopCount: 8 },
    shopRankings: { units: [{ rank: 1, shopName: "3911", unitsSold: 620, date: "2026-08-22" }] },
    companyRecords: {},
  });
  assert.equal(r.coverage.startYear, 2018);
  assert.equal(r.coverage.unitsStartYear, 2021); // card annotates the shorter window
});

test("buildPeaks handles the trimmed zero-record shape (date null, no tiedDates)", () => {
  // the API omits the date and tied list entirely once a peak is 0
  const payload = {
    status: "ready",
    coverage: { startDate: "2018-01-01", endDate: "2026-08-31", unitsStartDate: "2021-01-01", shopCount: 2 },
    shopRankings: {
      units: [
        { rank: 1, shopName: "松武", unitsSold: 1374, date: "2025-06-27", tiedDates: ["2025-06-27"] },
        { rank: 2, shopName: "kurumu", unitsSold: 0, date: null, tiedDates: [] },
      ],
    },
    companyRecords: {
      units: { unitsSold: 2267, date: "2026-03-05", shopContributions: [{ shopName: "松武", unitsSold: 1374 }, { shopName: "kurumu", unitsSold: 0 }] },
    },
  };
  const r = buildPeaks(payload);
  const zero = r.shopBests.units[1];
  assert.equal(zero.noRecord, true);
  assert.equal(zero.date, ""); // null normalizes to empty, never "null" or NaN
  assert.equal(zero.md, "");
  assert.equal(zero.year, null);
  assert.equal(zero.onRecordDay, false); // must not match the company record day
  // a shop that sold nothing that day stays out of the stacked contribution bar
  assert.deepEqual(r.records.units.contributions.map((c) => c.shopName), ["松武"]);
});

test("buildPeaks never treats a dateless company record as a legendary day", () => {
  const r = buildPeaks({
    status: "ready",
    coverage: { startDate: "2026-01-01", endDate: "2026-08-31", shopCount: 1 },
    shopRankings: { sales: [{ rank: 1, shopName: "kurumu", salesYen: 0, date: null }] },
    companyRecords: { sales: { salesYen: 0, date: null, shopContributions: [] } },
  });
  assert.equal(r.shopBests.sales[0].onRecordDay, false); // "" must not match ""
});

// ---- monthly rollup ----

// Trimmed from the live GET /api/sales/monthly response on 2026-09-04 11:59 JST.
// The figures are real, so the derived pace below is verifiable against the
// service: history 9/1-9/3 (2,245,871) + today live (714,904) = 2,960,775.
const monthlyPayload = {
  ok: true,
  partial: false,
  generatedAtJST: "2026-09-04 11:59 JST",
  shopCount: 3,
  currentMonth: {
    month: "2026-09",
    status: "live",
    completedThroughDate: "2026-09-03",
    liveDate: "2026-09-04",
    updatedAtJST: "2026-09-04 11:55 JST",
    totals: { salesYen: 2960775, orderCount: 2439, unitsSold: 2721 },
    shops: [
      { shopName: "松武", salesYen: 626125, orderCount: 597, unitsSold: 637 },
      { shopName: "3911", salesYen: 1408644, orderCount: 992, unitsSold: 1173 },
      { shopName: "kurumu", salesYen: 0, orderCount: 0, unitsSold: 0 },
    ],
  },
  previousMonth: {
    month: "2026-08",
    status: "complete",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    totals: { salesYen: 26128885, orderCount: 24619, unitsSold: 26786 },
    shops: [
      { shopName: "松武", salesYen: 6805926, orderCount: 5889, unitsSold: 6491 },
      { shopName: "3911", salesYen: 9548875, orderCount: 10267, unitsSold: 11106 },
      { shopName: "kurumu", salesYen: 0, orderCount: 0, unitsSold: 0 },
    ],
  },
};

// the matching realtime snapshot — today's share of the running month total
const monthlyToday = {
  totals: { salesYen: 714904, orderCount: 161, unitsSold: 286 },
  shops: [
    { shopName: "松武", salesYen: 52107, orderCount: 40, unitsSold: 48 },
    { shopName: "3911", salesYen: 605294, orderCount: 68, unitsSold: 181 },
    { shopName: "kurumu", salesYen: 0, orderCount: 0, unitsSold: 0 },
  ],
};

const near = (actual, expected, eps = 0.01) =>
  assert.ok(Math.abs(actual - expected) < eps, `${actual} is not within ${eps} of ${expected}`);

test("MONTH_DIMS matches the record board's toggle so the two read as one control", () => {
  assert.deepEqual([...MONTH_DIMS], ["sales", "units", "orders"]);
  assert.equal(DEFAULT_MONTH_DIM, "sales");
});

test("buildMonthly withholds anything without this month's own totals", () => {
  assert.equal(buildMonthly(null, monthlyToday), null);
  assert.equal(buildMonthly({ ok: false }, monthlyToday), null);
  // status "not_ready" nulls the totals — there is nothing to render
  assert.equal(
    buildMonthly({ ok: true, currentMonth: { month: "2026-09", status: "not_ready", totals: null } }, monthlyToday),
    null,
  );
});

test("buildMonthly derives the month geometry from the snapshot's own dates", () => {
  const m = buildMonthly(monthlyPayload, monthlyToday);
  assert.equal(m.current.month, "2026-09");
  assert.equal(m.current.days, 30); // September, computed in UTC
  assert.equal(m.current.completedDays, 3); // 9/1-9/3, today excluded
  near(m.current.progressPct, 10);
  assert.equal(m.current.hasLiveDay, true);
  assert.equal(m.previous.days, 31); // August
});

test("buildMonthly strips today out before averaging the completed days", () => {
  const m = buildMonthly(monthlyPayload, monthlyToday);
  // (2,960,775 - 714,904) / 3 completed days
  near(m.metrics.sales.pace, 748623.67);
  near(m.metrics.sales.prevPace, 842867.26); // 26,128,885 / 31
  near(m.metrics.sales.paceDeltaPct, -11.18);
  assert.equal(m.metrics.sales.ahead, false);
  near(m.metrics.orders.pace, 759.33);
  near(m.metrics.units.pace, 811.67);
});

test("buildMonthly reports month-to-date as a share of last month for the bullet fill", () => {
  const m = buildMonthly(monthlyPayload, monthlyToday);
  near(m.metrics.sales.vsPrevPct, 11.33); // 2,960,775 / 26,128,885
  assert.equal(m.metrics.sales.current, 2960775);
  assert.equal(m.metrics.sales.previous, 26128885);
});

test("buildMonthly withholds the pace on the first day of a month", () => {
  // nothing has finished yet: completedThroughDate still points at last month
  const payload = {
    ...monthlyPayload,
    currentMonth: {
      ...monthlyPayload.currentMonth,
      completedThroughDate: "2026-08-31",
      liveDate: "2026-09-01",
      totals: { salesYen: 300000, orderCount: 250, unitsSold: 270 },
    },
  };
  const m = buildMonthly(payload, monthlyToday);
  assert.equal(m.current.completedDays, 0); // "31" must not leak out of August
  assert.equal(m.metrics.sales.pace, null);
  assert.equal(m.metrics.sales.paceDeltaPct, null);
  assert.equal(m.metrics.sales.ahead, null);
  // the plain month-to-date figure is still real and still shown
  assert.equal(m.metrics.sales.current, 300000);
  near(m.metrics.sales.vsPrevPct, 1.15);
});

test("buildMonthly still reports month-to-date without the realtime snapshot", () => {
  const m = buildMonthly(monthlyPayload, null);
  assert.equal(m.metrics.sales.current, 2960775);
  near(m.metrics.sales.vsPrevPct, 11.33);
  // nothing to subtract → no honest completed-day average
  assert.equal(m.metrics.sales.pace, null);
  assert.equal(m.metrics.sales.paceDeltaPct, null);
});

test("buildMonthly subtracts nothing when the live day is outside this month", () => {
  const payload = {
    ...monthlyPayload,
    currentMonth: { ...monthlyPayload.currentMonth, liveDate: null, completedThroughDate: "2026-09-03" },
  };
  const m = buildMonthly(payload, monthlyToday);
  assert.equal(m.current.hasLiveDay, false);
  // the whole total is already finished days: 2,960,775 / 3
  near(m.metrics.sales.pace, 986925);
});

test("buildMonthly drops the comparison when last month is not complete", () => {
  const payload = {
    ...monthlyPayload,
    partial: true,
    previousMonth: { month: "2026-08", status: "not_ready", totals: null, shops: [] },
  };
  const m = buildMonthly(payload, monthlyToday);
  assert.equal(m.previous, null);
  assert.equal(m.partial, true);
  assert.equal(m.metrics.sales.previous, null);
  assert.equal(m.metrics.sales.vsPrevPct, null); // no baseline → no bullet fill
  assert.equal(m.metrics.sales.paceDeltaPct, null);
  // this month's own pace is still knowable and still reported
  near(m.metrics.sales.pace, 748623.67);
});

test("buildMonthly withholds a pace when today outruns the whole month total", () => {
  // the two snapshots refresh independently; a total below today means they
  // disagree, and a negative "completed" figure must never reach the UI
  const m = buildMonthly(monthlyPayload, {
    totals: { salesYen: 3000000, orderCount: 161, unitsSold: 286 },
    shops: monthlyToday.shops,
  });
  assert.equal(m.metrics.sales.pace, null);
  assert.equal(m.metrics.sales.paceDeltaPct, null);
  near(m.metrics.orders.pace, 759.33); // the sound dimensions still report
});

test("buildMonthly flags a shop that is dormant on both sides", () => {
  const m = buildMonthly(monthlyPayload, monthlyToday);
  const kurumu = m.shops.find((s) => s.name === "kurumu");
  assert.equal(kurumu.hasCurrent, false);
  assert.equal(kurumu.hasPrevious, false);
  assert.equal(kurumu.metrics.sales.current, 0);
  assert.equal(kurumu.metrics.sales.vsPrevPct, null); // never divide by a zero baseline
  assert.equal(kurumu.metrics.sales.paceDeltaPct, null);
});

test("buildMonthly skips the comparison for a shop with no last month", () => {
  const payload = {
    ...monthlyPayload,
    previousMonth: {
      ...monthlyPayload.previousMonth,
      shops: [{ shopName: "松武", salesYen: 6805926, orderCount: 5889, unitsSold: 6491 }],
    },
  };
  const m = buildMonthly(payload, monthlyToday);
  const fresh = m.shops.find((s) => s.name === "3911");
  assert.equal(fresh.hasCurrent, true);
  assert.equal(fresh.hasPrevious, false);
  assert.equal(fresh.metrics.sales.previous, null);
  assert.equal(fresh.metrics.sales.vsPrevPct, null);
  assert.equal(fresh.metrics.sales.paceDeltaPct, null);
  // its own pace needs no baseline: (1,408,644 - 605,294) / 3
  near(fresh.metrics.sales.pace, 267783.33);
});

test("buildMonthly gives each shop its own pace against its own last month", () => {
  const m = buildMonthly(monthlyPayload, monthlyToday);
  const matsutake = m.shops.find((s) => s.name === "松武");
  near(matsutake.metrics.sales.pace, 191339.33); // (626,125 - 52,107) / 3
  near(matsutake.metrics.sales.prevPace, 219546); // 6,805,926 / 31
  near(matsutake.metrics.sales.paceDeltaPct, -12.85);
  assert.equal(matsutake.metrics.sales.ahead, false);
});

test("buildMonthly orders shops by this month's sales and names them all", () => {
  const m = buildMonthly(monthlyPayload, monthlyToday);
  assert.deepEqual(m.shops.map((s) => s.name), ["3911", "松武", "kurumu"]);
  assert.deepEqual(m.shopNames, ["3911", "松武", "kurumu"]);
});

test("buildMonthly marks a month running ahead of last month's pace", () => {
  const payload = {
    ...monthlyPayload,
    currentMonth: {
      ...monthlyPayload.currentMonth,
      totals: { salesYen: 3714904, orderCount: 2439, unitsSold: 2721 },
    },
  };
  const m = buildMonthly(payload, monthlyToday);
  near(m.metrics.sales.pace, 1000000); // (3,714,904 - 714,904) / 3
  assert.equal(m.metrics.sales.ahead, true);
  assert.ok(m.metrics.sales.paceDeltaPct > 0);
});
