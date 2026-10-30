import assert from "node:assert/strict";
import test from "node:test";

import { buildOrdersView } from "./rakuten-model.mjs";

// /api/sales since the 2026-10-30 switch to the RMS order API: shop status is a data state
// (ready / stale / not_ready / unconfigured) and the company total is computed by the server.
const sales = {
  ok: true,
  partial: false,
  source: "rakuten-order-api",
  generatedAtJST: "2026-10-30 11:49:57 JST",
  sourceUpdatedAtJST: "2026-10-30 11:49:55 JST",
  shopCount: 3,
  updatedShopCount: 3,
  totals: { salesYen: 160000, orderCount: 159, unitsSold: 172 },
  shops: [
    { shopName: "松武", status: "ready", includedInTotals: true, orderCount: 47, lastError: null },
    { shopName: "3911", status: "ready", includedInTotals: true, orderCount: 112, lastError: null },
    { shopName: "aiashop", status: "ready", includedInTotals: true, orderCount: 0, lastError: null },
  ],
};

test("today's orders are the server's company total, stamped with the source time", () => {
  const v = buildOrdersView({ sales });
  assert.equal(v.generatedAt, "2026-10-30 11:49:55 JST");
  assert.equal(v.orders, 159);
  assert.equal(v.shopCount, 3);
  assert.equal(v.missing, 0);
});

test("shops the server left out of the total are counted as missing", () => {
  const v = buildOrdersView({
    sales: {
      ...sales,
      partial: true,
      shopCount: 4,
      updatedShopCount: 3,
      shops: [
        ...sales.shops,
        {
          shopName: "kurumu",
          status: "unconfigured",
          includedInTotals: false,
          orderCount: null,
          lastError: "RMS_API_NOT_CONFIGURED",
        },
      ],
    },
  });
  assert.equal(v.orders, 159);
  assert.equal(v.shopCount, 4);
  assert.equal(v.missing, 1);
});

test("a stale shop keeps its old number but is not part of the total", () => {
  const v = buildOrdersView({
    sales: {
      ...sales,
      partial: true,
      shopCount: 4,
      updatedShopCount: 3,
      shops: [
        ...sales.shops,
        { shopName: "hagumi", status: "stale", includedInTotals: false, orderCount: 9, lastError: "timeout" },
      ],
    },
  });
  assert.equal(v.orders, 159);
  assert.equal(v.missing, 1);
});

test("without the coverage counts, shops are counted from includedInTotals", () => {
  const { shopCount, updatedShopCount, ...rest } = sales;
  const v = buildOrdersView({
    sales: {
      ...rest,
      shops: [
        ...sales.shops,
        { shopName: "kurumu", status: "unconfigured", includedInTotals: false, orderCount: null },
      ],
    },
  });
  assert.equal(v.shopCount, 4);
  assert.equal(v.missing, 1);
});

test("an unreadable sales payload is unknown, not zero", () => {
  for (const bad of [null, { error: "x" }, { ok: false, totals: null, shopCount: 9, updatedShopCount: 0, shops: [] }]) {
    const v = buildOrdersView({ sales: bad });
    assert.equal(v.orders, null);
    assert.equal(v.shopCount, 0);
    assert.equal(v.missing, 0);
  }
  assert.equal(buildOrdersView({ sales: { ...sales, totals: null } }).orders, null);
});
