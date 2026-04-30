import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSalesModel,
  REFRESH_INTERVAL_OPTIONS,
  resolveRefreshIntervalOption,
} from "./sales-model.mjs";

const formatCurrency = (value) => `¥${Number(value || 0).toLocaleString("ja-JP")}`;
const formatNumber = (value) => Number(value || 0).toLocaleString("ja-JP");

const fixture = {
  ok: true,
  generatedAtJST: "2026-04-30 16:18 JST",
  shopCount: 7,
  updatedShopCount: 7,
  totals: {
    salesYen: 533044,
    orderCount: 514,
  },
  shops: [
    {
      shopName: "0406",
      status: "authenticated",
      salesYen: 132344,
      orderCount: 164,
      updated: "2026/04/30 16:00",
      lastQueryJST: "2026-04-30 15:43 JST",
      lastHeartbeatJST: "2026-04-30 16:00 JST",
      lastError: null,
    },
    {
      shopName: "3911",
      status: "authenticated",
      salesYen: 216300,
      orderCount: 184,
      updated: "2026/04/30 16:01",
      lastQueryJST: "2026-04-30 15:43 JST",
      lastHeartbeatJST: "2026-04-30 16:02 JST",
      lastError: null,
    },
    {
      shopName: "松田",
      status: "authenticated",
      salesYen: 20438,
      orderCount: 13,
      updated: "2026/04/30 16:02",
      lastQueryJST: "2026-04-30 15:43 JST",
      lastHeartbeatJST: "2026-04-30 16:02 JST",
      lastError: null,
    },
    {
      shopName: "松武",
      status: "authenticated",
      salesYen: 111851,
      orderCount: 102,
      updated: "2026/04/30 16:05",
      lastQueryJST: "2026-04-30 15:43 JST",
      lastHeartbeatJST: "2026-04-30 16:06 JST",
      lastError: null,
    },
    {
      shopName: "天海",
      status: "authenticated",
      salesYen: 35615,
      orderCount: 38,
      updated: "2026/04/30 16:00",
      lastQueryJST: "2026-04-30 15:43 JST",
      lastHeartbeatJST: "2026-04-30 16:00 JST",
      lastError: null,
    },
    {
      shopName: "allcase",
      status: "authenticated",
      salesYen: 0,
      orderCount: 0,
      updated: "2026/04/30 16:07",
      lastQueryJST: "2026-04-30 15:43 JST",
      lastHeartbeatJST: "2026-04-30 16:07 JST",
      lastError: null,
    },
    {
      shopName: "hagumi",
      status: "authenticated",
      salesYen: 16496,
      orderCount: 13,
      updated: "2026/04/30 16:07",
      lastQueryJST: "2026-04-30 15:43 JST",
      lastHeartbeatJST: "2026-04-30 16:07 JST",
      lastError: null,
    },
  ],
  lastError: null,
};

test("buildSalesModel formats summary totals and snapshot metadata", () => {
  const model = buildSalesModel({ data: fixture, formatCurrency, formatNumber });

  assert.equal(model.ok, true);
  assert.equal(model.generatedAt, "2026-04-30 16:18 JST");
  assert.equal(model.summary.totalSalesDisplay, "¥533,044");
  assert.equal(model.summary.totalOrdersDisplay, "514");
  assert.equal(model.summary.shopCoverageDisplay, "7/7");
  assert.equal(model.summary.hasErrors, false);
});

test("buildSalesModel sorts shops by sales descending then shop name", () => {
  const data = {
    ...fixture,
    shops: [
      ...fixture.shops,
      {
        shopName: "A-shop",
        status: "authenticated",
        salesYen: 111851,
        orderCount: 1,
        updated: "2026/04/30 16:05",
        lastError: null,
      },
    ],
  };

  const model = buildSalesModel({ data, formatCurrency, formatNumber });

  assert.deepEqual(
    model.shops.map((shop) => shop.shopName),
    ["3911", "0406", "A-shop", "松武", "天海", "松田", "hagumi", "allcase"],
  );
});

test("buildSalesModel surfaces shop and snapshot errors without dropping rows", () => {
  const data = {
    ...fixture,
    lastError: "snapshot stale",
    shops: [
      ...fixture.shops,
      {
        shopName: "要確認",
        status: "error",
        salesYen: 0,
        orderCount: 0,
        updated: null,
        lastError: "ログイン失敗",
      },
    ],
  };

  const model = buildSalesModel({ data, formatCurrency, formatNumber });
  const errorShop = model.shops.find((shop) => shop.shopName === "要確認");

  assert.equal(model.summary.hasErrors, true);
  assert.equal(model.lastError, "snapshot stale");
  assert.equal(errorShop.lastError, "ログイン失敗");
  assert.equal(errorShop.statusLabel, "要確認");
  assert.equal(errorShop.statusTone, "danger");
});

test("buildSalesModel prepares compact shop card display fields", () => {
  const model = buildSalesModel({ data: fixture, formatCurrency, formatNumber });
  const topShop = model.shops[0];

  assert.equal(topShop.shopName, "3911");
  assert.equal(topShop.salesDisplay, "¥216,300");
  assert.equal(topShop.orderCountDisplay, "184");
  assert.equal(topShop.updatedDisplay, "更新 2026/04/30 16:01");
  assert.equal(topShop.activityDisplay, "2026-04-30 16:02 JST");
});

test("refresh interval options are fixed and default to 15 minutes", () => {
  assert.deepEqual(
    REFRESH_INTERVAL_OPTIONS.map(({ id, label, milliseconds }) => [id, label, milliseconds]),
    [
      ["5m", "5分", 300000],
      ["10m", "10分", 600000],
      ["15m", "15分", 900000],
    ],
  );

  assert.equal(resolveRefreshIntervalOption().id, "15m");
  assert.equal(resolveRefreshIntervalOption(900000).id, "15m");
  assert.equal(resolveRefreshIntervalOption("600000").id, "10m");
  assert.equal(resolveRefreshIntervalOption(300000).id, "5m");
  assert.equal(resolveRefreshIntervalOption(12345).id, "15m");
});
