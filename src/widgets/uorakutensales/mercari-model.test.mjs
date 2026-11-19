import assert from "node:assert/strict";
import test from "node:test";

import { buildMercari, mercariKey } from "./mercari-model.mjs";

const SOURCE = "2026-11-19T06:28:18.514Z"; // 15:28:18 JST
const CONFIG = "09ac59f3-a7b7-415f-b8a8-2af9f1ac9967";

const totals = (salesAmount, orderCount, unitsSold = orderCount) => ({ salesAmount, orderCount, unitsSold });

function shop(overrides = {}) {
  return {
    platform: "mercari",
    configId: CONFIG,
    shopId: "DKnSGBVY6VP22ckTF3h444",
    shopName: "3911",
    enabled: true,
    currency: "JPY",
    timezone: "Asia/Tokyo",
    status: "ready",
    includedInTotals: true,
    sourceUpdatedAt: SOURCE,
    lastError: null,
    ...overrides,
  };
}

function period(row, jpy = row.includedInTotals ? row.totals : null) {
  return {
    ok: Boolean(jpy),
    partial: !jpy,
    enabledShopCount: 1,
    updatedShopCount: row.includedInTotals ? 1 : 0,
    totals: jpy,
    totalsByCurrency: jpy ? { JPY: jpy } : {},
    shops: [row],
  };
}

const DATES = ["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18"];
const DAILY = [
  [11485, 14],
  [11044, 12],
  [9529, 11],
  [10824, 11],
  [12356, 14],
  [11341, 14],
  [6218, 7],
];

// /api/mercari/sales as it answered on 2026-11-19
function salesOf(today = shop({ date: "2026-11-19", totals: totals(2871, 4) })) {
  return {
    ok: true,
    enabled: true,
    partial: false,
    schemaVersion: 1,
    source: "mercari-shops-orders",
    salesBasis: "paid_item_amount_before_coupons_excluding_shipping_and_canceled_quantities",
    today: period(today),
    month: period(shop({ month: "2026-11", totals: totals(216303, 239) })),
    previousMonth: period(shop({ month: "2026-10", totals: totals(372571, 399) })),
    history: {
      dates: DATES,
      shops: [
        {
          ...shop(),
          daily: DATES.map((date, i) => ({
            date,
            status: "ready",
            totals: totals(...DAILY[i]),
            sourceUpdatedAt: SOURCE,
          })),
        },
      ],
    },
  };
}

test("buildMercari has nothing without a snapshot", () => {
  assert.equal(buildMercari(null), null);
  assert.equal(buildMercari({ error: "Not Found" }), null);
  assert.equal(buildMercari({ ok: true, enabled: true, today: { shops: [] } }), null);
});

test("buildMercari keys its shop by configId, apart from 楽天's and au PAY's 3911", () => {
  const m = buildMercari(salesOf());
  assert.equal(m.platform, "mercari");
  assert.deepEqual(m.provides, { week: false, previous: true });
  assert.equal(mercariKey({ configId: CONFIG }), `mercari:${CONFIG}`);
  const [s] = m.shops;
  assert.equal(s.key, `mercari:${CONFIG}`);
  assert.equal(s.name, "3911");
  assert.equal(s.platform, "mercari");
  assert.equal(s.counted, true);
  assert.equal(s.updatedAt, "2026-11-19 15:28:18 JST");
});

test("buildMercari reads today, the month and last month in its own yen", () => {
  const { shops, company } = buildMercari(salesOf());
  assert.deepEqual(shops[0].today, { sales: 2871, units: 4, orders: 4 });
  assert.deepEqual(shops[0].month, { sales: 216303, units: 239, orders: 239 });
  assert.deepEqual(shops[0].previous, { sales: 372571, units: 399, orders: 399 });
  assert.deepEqual(company.today, { sales: 2871, units: 4, orders: 4 });
  assert.deepEqual(company.coverage.today, { covered: 1, total: 1 });
  assert.deepEqual(company.missing, []);
  // 18 finished days of November against all 31 of October
  assert.equal(company.metrics.orders.pace, (239 - 4) / 18);
  assert.equal(company.metrics.orders.prevPace, 399 / 31);
});

test("buildMercari draws the last seven finished days in the shop table", () => {
  const [s] = buildMercari(salesOf()).shops;
  assert.deepEqual(
    s.trend.daily.map((day) => day.date),
    DATES,
  );
  const last = s.trend.daily.at(-1);
  assert.deepEqual([last.sales, last.units, last.orders], [6218, 7, 7]);
  assert.deepEqual(s.trend.week, { sales: 72797, units: 83, orders: 83 });
});

test("a stale Mercari shop stays on the board but out of today's totals", () => {
  const stale = shop({
    date: "2026-11-19",
    status: "stale",
    includedInTotals: false,
    totals: totals(1000, 2),
    lastError: "MERCARI_ORDERS_FAILED",
  });
  const m = buildMercari(salesOf(stale));
  assert.equal(m.shops[0].counted, false);
  assert.deepEqual(m.company.missing, ["3911"]);
  assert.equal(m.company.today, null);
});
