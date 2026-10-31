import assert from "node:assert/strict";
import test from "node:test";

import { aupayKey, buildAupay, withUnrecordedShops } from "./aupay-model.mjs";

const SOURCE = "2026-10-31T04:57:28.128Z"; // 13:57:28 JST

function shop(overrides = {}) {
  return {
    configId: "cfg-1",
    shopName: "3911",
    enabled: true,
    currency: "JPY",
    timezone: "Asia/Tokyo",
    status: "ready",
    includedInTotals: true,
    sourceUpdatedAt: SOURCE,
    lastError: null,
    verification: { ok: true },
    ...overrides,
  };
}

const totals = (salesAmount, unitsSold, orderCount) => ({ salesAmount, unitsSold, orderCount });

function period(rows, jpy) {
  return {
    ok: Boolean(jpy),
    partial: false,
    enabledShopCount: rows.filter((r) => r.enabled).length,
    updatedShopCount: rows.filter((r) => r.includedInTotals).length,
    totals: jpy ?? null,
    totalsByCurrency: jpy ? { JPY: jpy } : {},
    shops: rows,
  };
}

// /api/aupay/sales on 2026-10-31: the last day of a 31-day month
function salesOf(today = shop({ date: "2026-10-31", totals: totals(363, 1, 1) })) {
  const other = shop({ configId: "cfg-2", shopName: "幸田良品" });
  const todayRows = [today, { ...other, date: "2026-10-31", totals: totals(490, 1, 1) }];
  return {
    ok: true,
    partial: false,
    today: period(todayRows, today.includedInTotals ? totals(853, 2, 2) : totals(490, 1, 1)),
    month: period(
      [
        shop({ month: "2026-10", totals: totals(80190, 77, 74) }),
        { ...other, month: "2026-10", totals: totals(60680, 106, 97) },
      ],
      totals(140870, 183, 171),
    ),
  };
}

test("buildAupay has nothing without a snapshot or an enabled shop", () => {
  assert.equal(buildAupay(null), null);
  assert.equal(buildAupay({ error: "Not Found" }), null);
  assert.equal(buildAupay({ today: period([], null), month: period([], null) }), null);
  const disabled = shop({ enabled: false, status: "disabled", includedInTotals: false, totals: null });
  assert.equal(buildAupay({ today: period([disabled], null), month: period([disabled], null) }), null);
});

test("each shop carries today and the month, keyed by its config id", () => {
  const a = buildAupay(salesOf());
  assert.equal(a.platform, "aupay");
  assert.deepEqual(
    a.shops.map((s) => [s.key, s.name, s.today.orders, s.month.orders]),
    [
      ["aupay:cfg-1", "3911", 1, 74],
      ["aupay:cfg-2", "幸田良品", 1, 97],
    ],
  );
  assert.equal(aupayKey({ configId: "x" }), "aupay:x");
  assert.equal(a.shops[0].updatedAt, "2026-10-31 13:57:28 JST");
});

test("what au PAY does not serve stays unknown, never zero", () => {
  const a = buildAupay(salesOf());
  assert.deepEqual(a.provides, { week: false, previous: false });
  const [s] = a.shops;
  assert.equal(s.previous, null);
  assert.equal(s.avg, null);
  assert.equal(s.week, null);
  assert.deepEqual(s.daily, []);
  assert.equal(s.metrics.orders.previous, null);
  assert.equal(s.metrics.orders.prevPace, null);
  assert.equal(s.metrics.orders.paceDeltaPct, null);
  assert.equal(a.company.avg, null);
  assert.equal(a.company.previous, null);
});

test("the month's daily pace leaves today's half-run day out", () => {
  const a = buildAupay(salesOf());
  // (74 − 1) orders over the 30 finished days of October
  assert.equal(a.shops[0].metrics.orders.pace, 73 / 30);
  assert.equal(a.company.metrics.orders.pace, (171 - 2) / 30);
});

test("the company figures are the server's totals and its coverage", () => {
  const { company } = buildAupay(salesOf());
  assert.deepEqual(company.today, { sales: 853, units: 2, orders: 2 });
  assert.deepEqual(company.month, { sales: 140870, units: 183, orders: 171 });
  assert.deepEqual(company.coverage.today, { covered: 2, total: 2 });
  assert.deepEqual(company.missing, []);
  assert.equal(company.updatedAt, "2026-10-31 13:57:28 JST");
});

test("a stale shop's saved figures are not today's; a zero day stays a zero", () => {
  const stale = shop({ date: "2026-10-31", status: "stale", includedInTotals: false, totals: totals(900, 9, 9) });
  const a = buildAupay(salesOf(stale));
  assert.equal(a.shops[0].today, null);
  assert.deepEqual(a.company.missing, ["3911"]);
  assert.deepEqual(a.company.coverage.today, { covered: 1, total: 2 });

  const zero = shop({ date: "2026-10-31", totals: totals(0, 0, 0) });
  assert.deepEqual(buildAupay(salesOf(zero)).shops[0].today, { sales: 0, units: 0, orders: 0 });
});

test("a period with no readable shop has no company figures", () => {
  const notReady = shop({ date: "2026-10-31", status: "not_ready", includedInTotals: false, totals: null });
  const a = buildAupay({
    today: period([notReady], null),
    month: period([shop({ month: "2026-10", totals: totals(1, 1, 1) })], totals(1, 1, 1)),
  });
  assert.equal(a.company.today, null);
  // with today unknown the month cannot be split into finished days
  assert.equal(a.company.metrics.orders.pace, null);
});

test("au PAY's shops take a place on the shop bests as an unknown, after the rest", () => {
  const peaks = { shopBests: { orders: [{ rank: 1, shopName: "3911", value: 600 }] }, records: {} };
  const { shops } = buildAupay(salesOf());
  const merged = withUnrecordedShops(peaks, shops);
  assert.deepEqual(
    merged.shopBests.orders.map((r) => [r.shopName, r.value, r.platform]),
    [
      ["3911", 600, undefined],
      ["3911", null, "aupay"],
      ["幸田良品", null, "aupay"],
    ],
  );
  assert.equal(merged.shopBests.orders[1].noRecord, false);
  assert.equal(withUnrecordedShops(peaks, null), peaks);
  assert.equal(withUnrecordedShops(null, shops), null);
});
