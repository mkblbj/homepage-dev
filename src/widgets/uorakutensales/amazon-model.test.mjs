import assert from "node:assert/strict";
import test from "node:test";

import {
  amazonKey,
  amazonTrendRow,
  buildAmazon,
  buildAmazonBoards,
  jstStamp,
  withAmazonPeaks,
} from "./amazon-model.mjs";

const SOURCE = "2026-10-30T04:55:45.603Z"; // 13:55:45 JST

function shop(overrides = {}) {
  return {
    shopName: "uoworld",
    accountId: "account-1",
    marketplaceId: "A1VC38T7YXB528",
    currency: "JPY",
    timezone: "Asia/Tokyo",
    enabled: true,
    status: "ready",
    includedInTotals: true,
    sourceUpdatedAt: SOURCE,
    lastError: null,
    ...overrides,
  };
}

const totals = (salesAmount, unitsSold, orderCount) => ({ salesAmount, unitsSold, orderCount });

function period(rows, jpy) {
  return {
    ok: true,
    partial: false,
    enabledShopCount: rows.length,
    updatedShopCount: rows.filter((r) => r.includedInTotals).length,
    totalsByCurrency: jpy ? { JPY: jpy } : {},
    shops: rows,
  };
}

// /api/amazon/sales on 2026-10-30: 29 finished days and today in the month
function salesOf({ today = shop({ date: "2026-10-30", totals: totals(7897, 9, 6) }) } = {}) {
  return {
    ok: true,
    partial: false,
    today: period([today], today.includedInTotals ? today.totals : null),
    month: period([shop({ month: "2026-10", totals: totals(472523, 456, 362) })], totals(472523, 456, 362)),
    previousMonth: period([shop({ month: "2026-09", totals: totals(461273, 470, 301) })], totals(461273, 470, 301)),
  };
}

const day = (date, salesAmount, unitsSold, orderCount) => ({
  date,
  totals: { salesAmount, unitsSold, orderCount, currency: "JPY" },
});

const history = {
  ok: true,
  window: { completeDays: 7, excludesToday: true },
  shops: [
    shop({
      totals: totals(70000, 70, 63),
      daily: [
        day("2026-10-23", 9306, 12, 12),
        day("2026-10-24", 22089, 28, 8),
        day("2026-10-25", 10000, 10, 9),
        day("2026-10-26", 8000, 6, 6),
        day("2026-10-27", 7000, 5, 9),
        day("2026-10-28", 4115, 3, 8),
        day("2026-10-29", 9490, 6, 11),
      ],
    }),
  ],
};

test("buildAmazon has nothing without a snapshot or an enabled shop", () => {
  assert.equal(buildAmazon(null, history), null);
  assert.equal(buildAmazon({ error: "Not Found" }, history), null);
  const none = { today: period([], null), month: period([], null), previousMonth: period([], null) };
  assert.equal(buildAmazon(none, null), null);
});

test("each shop carries today, the month and last month in the 楽天 metric names", () => {
  const { shops } = buildAmazon(salesOf(), history);
  assert.equal(shops.length, 1);
  const s = shops[0];
  assert.equal(s.key, "amazon:account-1:A1VC38T7YXB528");
  assert.equal(s.name, "uoworld");
  assert.equal(s.platform, "amazon");
  assert.deepEqual(s.today, { sales: 7897, units: 9, orders: 6 });
  assert.deepEqual(s.month, { sales: 472523, units: 456, orders: 362 });
  assert.deepEqual(s.previous, { sales: 461273, units: 470, orders: 301 });
  assert.equal(s.updatedAt, "2026-10-30 13:55:45 JST");
});

test("the month pace leaves today out and compares with last month's daily average", () => {
  const { metrics } = buildAmazon(salesOf(), history).shops[0];
  // (362 − 6) orders over 29 finished days, against 301 over September's 30
  assert.equal(metrics.orders.pace, 356 / 29);
  assert.equal(metrics.orders.prevPace, 301 / 30);
  assert.equal(Number(metrics.orders.paceDeltaPct.toFixed(2)), Number(((356 / 29 / (301 / 30) - 1) * 100).toFixed(2)));
});

test("a stale shop keeps its last values on the server but reads unknown today", () => {
  const stale = shop({ date: "2026-10-30", status: "stale", includedInTotals: false, totals: totals(900, 1, 1) });
  const a = buildAmazon(salesOf({ today: stale }), history);
  assert.equal(a.shops[0].today, null);
  // with today unknown the month cannot be split into finished days
  assert.equal(a.shops[0].metrics.orders.pace, null);
  assert.equal(a.company.today, null);
  assert.deepEqual(a.company.missing, ["uoworld"]);
  assert.deepEqual(a.company.coverage.today, { covered: 0, total: 1 });
});

test("the week average and days come from the shop's own history", () => {
  const a = buildAmazon(salesOf(), history);
  assert.deepEqual(a.shops[0].avg, { sales: 10000, units: 10, orders: 9 });
  assert.deepEqual(a.company.avg, { sales: 10000, units: 10, orders: 9 });
  assert.equal(a.company.daily.length, 7);
  assert.deepEqual(a.company.daily[0], {
    date: "2026-10-23",
    md: "10/23",
    wd: "金",
    sales: 9306,
    units: 12,
    orders: 12,
  });
});

test("the company figures are the server's JPY totals", () => {
  const { company } = buildAmazon(salesOf(), history);
  assert.deepEqual(company.today, { sales: 7897, units: 9, orders: 6 });
  assert.deepEqual(company.month, { sales: 472523, units: 456, orders: 362 });
  assert.equal(company.metrics.orders.current, 362);
  assert.equal(company.updatedAt, "2026-10-30 13:55:45 JST");
});

test("a shop in another currency has counts but no yen", () => {
  const usd = shop({ currency: "USD", date: "2026-10-30", totals: totals(120, 3, 2) });
  const { shops } = buildAmazon(salesOf({ today: usd }), null);
  assert.deepEqual(shops[0].today, { sales: null, units: 3, orders: 2 });
});

test("jstStamp writes an ISO time the way the 楽天 snapshots stamp theirs", () => {
  assert.equal(jstStamp("2026-10-30T15:30:00.000Z"), "2026-10-31 00:30:00 JST");
  assert.equal(jstStamp(""), "");
  assert.equal(jstStamp("not a time"), "");
});

test("buildAmazonBoards gives each shop a board per dimension in the 楽天 item shape", () => {
  const ranking = {
    ok: true,
    shops: [
      shop({
        status: "partial",
        itemCount: 6,
        rankings: {
          sales: [
            { rank: 1, sku: "rs-q1c213", asin: "B0F", currency: "JPY", salesAmount: 2200, unitsSold: 2, orderCount: 1 },
          ],
          units: [
            { rank: 1, sku: "rs-q1c213", asin: "B0F", currency: "JPY", salesAmount: 2200, unitsSold: 2, orderCount: 1 },
          ],
          // a pending order: units known, amount not yet
          orderCount: [{ rank: 1, asin: "B0G", currency: "JPY", salesAmount: null, unitsSold: 1, orderCount: 1 }],
        },
      }),
    ],
  };
  const boards = buildAmazonBoards(ranking);
  assert.deepEqual(Object.keys(boards), ["orderCount", "sales", "units"]);
  const [board] = boards.sales;
  assert.equal(board.key, amazonKey(ranking.shops[0]));
  assert.equal(board.platform, "amazon");
  assert.equal(board.itemCount, 6);
  assert.equal(board.ok, true);
  assert.equal(board.items[0].mno, "rs-q1c213");
  assert.equal(board.items[0].avgPrice, 1100);
  const pending = boards.orderCount[0].items[0];
  assert.equal(pending.mno, "B0G"); // no SKU → the ASIN
  assert.equal(pending.salesYen, null);
  assert.equal(pending.avgPrice, null);
  assert.equal(buildAmazonBoards(null), null);
  assert.equal(buildAmazonBoards({ error: "x" }), null);
});

test("an Amazon shop's 7-day card has its week and no CVR", () => {
  const row = amazonTrendRow(buildAmazon(salesOf(), history).shops[0]);
  assert.equal(row.platform, "amazon");
  assert.equal(row.h7Total, 70000);
  assert.equal(row.h7Orders, 63);
  assert.equal(row.cvr, null);
  assert.equal(row.daily.length, 7);
  assert.deepEqual(row.daily[0], {
    date: "2026-10-23",
    md: "10/23",
    wd: "金",
    sales: 9306,
    units: 12,
    orders: 12,
    cvr: null,
  });
});

test("Amazon shops join 楽天's shop bests, ranked by value; the company records stay 楽天's", () => {
  const peaks = {
    records: { orders: { value: 1500 } },
    shopBests: {
      orders: [
        { rank: 1, shopName: "3911", value: 600, date: "2025-11-11" },
        { rank: 2, shopName: "hagumi", value: 40, date: "2025-11-11" },
      ],
    },
    available: ["orders"],
  };
  const amazonPeaks = {
    ok: true,
    shops: [
      shop({
        coverage: { startDate: "2024-10-31" },
        records: {
          salesAmount: { value: 246023, date: "2025-09-10" },
          orderCount: { value: 115, date: "2025-02-22" },
          unitsSold: { value: 176, date: "2025-01-28" },
        },
      }),
    ],
  };
  const merged = withAmazonPeaks(peaks, amazonPeaks);
  assert.deepEqual(
    merged.shopBests.orders.map((r) => [r.rank, r.shopName, r.value]),
    [
      [1, "3911", 600],
      [2, "uoworld", 115],
      [3, "hagumi", 40],
    ],
  );
  const az = merged.shopBests.orders[1];
  assert.equal(az.platform, "amazon");
  assert.equal(az.md, "2/22");
  assert.equal(az.year, 2025);
  assert.equal(az.onRecordDay, false);
  assert.equal(merged.records, peaks.records);
  assert.equal(merged.amazonSince, "2024-10-31");
  // nothing to add: the 楽天 board as it was
  assert.equal(withAmazonPeaks(peaks, null), peaks);
  assert.equal(withAmazonPeaks(null, amazonPeaks), null);
});
