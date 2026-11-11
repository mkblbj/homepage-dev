import assert from "node:assert/strict";
import test from "node:test";

import { trendRowOf } from "./amazon-model.mjs";
import { buildTemu, temuKey } from "./temu-model.mjs";

const SOURCE = "2026-11-11T01:18:06.164Z"; // 10:18:06 JST

const period = (key, totals, extra = {}) => ({
  key,
  sourceUpdatedAt: SOURCE,
  status: "ready",
  amountError: "TEMU_AMOUNT_SCOPE_REQUIRED",
  totals,
  ...extra,
});
const totals = (salesAmount, unitsSold, orderCount) => ({ salesAmount, unitsSold, orderCount });

// /api/temu/sales on 2026-11-11, as it answered while the amount scope was missing
function salesOf(overrides = {}) {
  return {
    ok: true,
    shopName: "UO world",
    currency: "JPY",
    timezone: "Asia/Tokyo",
    amountBasis: "customer_paid_total",
    refresh: { state: "idle", lastError: null },
    today: period("2026-11-11", totals(null, 1, 1)),
    month: period("2026-11", totals(null, 36, 33)),
    previousMonth: period("2026-10", totals(null, 103, 101)),
    ...overrides,
  };
}

test("buildTemu has nothing without a snapshot", () => {
  assert.equal(buildTemu(null), null);
  assert.equal(buildTemu({ error: "Not Found" }), null);
  assert.equal(buildTemu({ ok: false }), null);
});

test("the one TEMU shop is keyed by platform and name", () => {
  const temu = buildTemu(salesOf());
  assert.equal(temu.platform, "temu");
  assert.equal(temuKey("UO world"), "temu:UO world");
  assert.deepEqual(
    temu.shops.map((s) => [s.key, s.name, s.platform, s.currency]),
    [["temu:UO world", "UO world", "temu", "JPY"]],
  );
});

test("without the amount scope the counts are read and the yen stay unknown", () => {
  const temu = buildTemu(salesOf());
  const [shop] = temu.shops;
  assert.deepEqual(shop.today, { sales: null, units: 1, orders: 1 });
  assert.deepEqual(shop.month, { sales: null, units: 36, orders: 33 });
  assert.deepEqual(shop.previous, { sales: null, units: 103, orders: 101 });
  assert.deepEqual(temu.company.today, shop.today);
  assert.equal(shop.metrics.sales.current, null);
  assert.equal(shop.metrics.sales.paceDeltaPct, null);
});

test("once the amount scope is granted the yen come through", () => {
  const temu = buildTemu(
    salesOf({
      today: period("2026-11-11", totals(2980, 1, 1), { amountError: null }),
      month: period("2026-11", totals(98000, 36, 33), { amountError: null }),
    }),
  );
  assert.equal(temu.shops[0].today.sales, 2980);
  assert.equal(temu.shops[0].month.sales, 98000);
});

test("TEMU's complete shop trend preserves counts while buyer-paid amounts are unavailable", () => {
  const dates = ["2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10"];
  const data = salesOf({
    history: {
      dates,
      shops: [
        {
          shopName: "UO world",
          currency: "JPY",
          enabled: true,
          daily: dates.map((date) => ({ date, ...period(date, totals(null, 3, 2)) })),
        },
      ],
    },
  });
  const { shops, provides } = buildTemu(data);
  const row = trendRowOf(shops[0]);
  assert.equal(row.key, "temu:UO world");
  assert.deepEqual([row.h7Total, row.h7Orders, row.h7Units], [null, 14, 21]);
  assert.deepEqual([row.daily[0].sales, row.daily[0].orders, row.daily[0].units], [null, 2, 3]);
  assert.equal(provides.week, false);
});

test("yen in another currency are never read as yen", () => {
  const temu = buildTemu(
    salesOf({ currency: "USD", today: period("2026-11-11", totals(20, 1, 1), { amountError: null }) }),
  );
  assert.deepEqual(temu.shops[0].today, { sales: null, units: 1, orders: 1 });
});

test("this month's pace leaves today out and sets it against last month's days", () => {
  const { metrics } = buildTemu(salesOf()).shops[0];
  // 33 orders, 1 of them today, over the 10 finished days of November
  assert.equal(metrics.orders.pace, 3.2);
  // 101 orders over October's 31 days
  assert.equal(metrics.orders.prevPace, 101 / 31);
  assert.equal(Math.round(metrics.orders.paceDeltaPct), Math.round((3.2 / (101 / 31) - 1) * 100));
});

test("TEMU serves no week but a last month, and joins comparisons only once it is read", () => {
  const temu = buildTemu(salesOf());
  assert.deepEqual(temu.provides, { week: false, previous: true });
  assert.equal(temu.shops[0].week, null);
  assert.equal(temu.company.avg, null);
  assert.deepEqual(temu.company.daily, []);
  const noPrevious = buildTemu(salesOf({ previousMonth: { key: "2026-10", status: "not_ready", totals: null } }));
  assert.equal(noPrevious.company.previous, null);
  assert.equal(noPrevious.company.metrics.orders.paceDeltaPct, null);
});

test("a period that is not ready, stale or failed is unknown, never zero", () => {
  const temu = buildTemu(
    salesOf({
      today: { key: "2026-11-11", status: "not_ready", totals: null },
      month: period("2026-11", totals(null, 30, 28), { status: "stale", lastError: "TEMU_REQUEST_FAILED" }),
      previousMonth: { key: "2026-10", status: "error", totals: null, lastError: "TEMU_REQUEST_FAILED" },
    }),
  );
  const [shop] = temu.shops;
  assert.equal(shop.today, null);
  assert.equal(shop.month, null);
  assert.equal(shop.previous, null);
  assert.equal(shop.metrics, null);
  assert.equal(shop.counted, false);
  assert.deepEqual(temu.company.missing, ["UO world"]);
  assert.deepEqual(temu.company.coverage, { today: { covered: 0, total: 1 }, month: { covered: 0, total: 1 } });
  assert.equal(temu.company.updatedAt, "");
});

test("a ready shop is counted, covered and stamped in Japan time", () => {
  const temu = buildTemu(salesOf());
  assert.equal(temu.shops[0].counted, true);
  assert.deepEqual(temu.company.missing, []);
  assert.deepEqual(temu.company.coverage, { today: { covered: 1, total: 1 }, month: { covered: 1, total: 1 } });
  assert.equal(temu.company.updatedAt, "2026-11-11 10:18:06 JST");
  assert.equal(temu.shops[0].updatedAt, "2026-11-11 10:18:06 JST");
});
