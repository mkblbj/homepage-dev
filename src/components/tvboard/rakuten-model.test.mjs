import assert from "node:assert/strict";
import test from "node:test";

import { buildOrdersView } from "./rakuten-model.mjs";

const sales = {
  ok: true,
  generatedAtJST: "2026-10-16 13:47 JST",
  shops: [
    { shopName: "松武", status: "authenticated", orderCount: 47, unitsSold: 49, lastError: null },
    { shopName: "3911", status: "authenticated", orderCount: 112, unitsSold: 123, lastError: null },
    { shopName: "kurumu", status: "authenticated", orderCount: 0, unitsSold: 0, lastError: null },
  ],
};

test("today's orders sum the shops it could read", () => {
  const v = buildOrdersView({ sales });
  assert.equal(v.generatedAt, "2026-10-16 13:47 JST");
  assert.equal(v.orders, 159);
  assert.equal(v.shopCount, 3);
  assert.equal(v.missing, 0);
});

test("a shop that failed is left out of the total and counted as missing", () => {
  const v = buildOrdersView({
    sales: {
      ...sales,
      shops: [...sales.shops, { shopName: "aiashop", status: "error", orderCount: 0, unitsSold: 0, lastError: "timeout" }],
    },
  });
  assert.equal(v.missing, 1);
  assert.equal(v.orders, 159);
  assert.equal(v.shopCount, 4);
});

test("a shop with no order count is missing too, not zero", () => {
  const v = buildOrdersView({
    sales: { ...sales, shops: [...sales.shops, { shopName: "hagumi", status: "authenticated", orderCount: null }] },
  });
  assert.equal(v.missing, 1);
  assert.equal(v.orders, 159);
});

test("an unreadable sales payload is unknown, not zero", () => {
  for (const bad of [null, { error: "x" }, { ok: false }]) {
    const v = buildOrdersView({ sales: bad });
    assert.equal(v.orders, null);
    assert.equal(v.shopCount, 0);
    assert.equal(v.missing, 0);
  }
  assert.equal(buildOrdersView({ sales: { ok: true, shops: [] } }).orders, null);
});
