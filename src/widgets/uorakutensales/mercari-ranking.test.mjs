import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import {
  clearMercariRankingCache,
  jstDate,
  previousMonthOf,
  rankShop,
  readMercariRankings,
} from "./mercari-ranking.mjs";

const BASE = "http://ec.test";
const SHOP = { configId: "cfg-1", shopName: "3911", status: "ready", sourceUpdatedAt: "2026-11-19T06:28:18.514Z" };
// 15:30 JST on 2026-11-19
const NOW = new Date("2026-11-19T06:30:00.000Z");

function item(productId, unitPrice, netQuantity, name = `[${productId}] Galaxy A25 ケース`) {
  return { productId, name, unitPrice, netQuantity, purchasedQuantity: netQuantity, canceledQuantity: 0 };
}

function order(id, date, items, includedInSales = true) {
  return { id, date, status: includedInSales ? "COMPLETED" : "CANCELED", includedInSales, items };
}

const ORDERS = [
  order("o1", "2026-11-19", [item("A", 748, 1)]),
  order("o2", "2026-11-19", [item("B", 500, 2), item("A", 748, 1)]),
  // a canceled order adds nothing
  order("o3", "2026-11-19", [item("C", 9999, 5)], false),
  // a fully canceled line in a kept order adds nothing either
  order("o4", "2026-11-18", [item("A", 748, 2), item("C", 9999, 0)]),
  order("o5", "2026-10-31", [item("B", 500, 1)]),
  order("o6", "2026-09-30", [item("A", 748, 9)]),
];

test("jstDate reads the day in Japan time and previousMonthOf crosses the year", () => {
  assert.equal(jstDate(new Date("2026-11-30T15:30:00.000Z")), "2026-12-01");
  assert.equal(previousMonthOf("2026-11"), "2026-10");
  assert.equal(previousMonthOf("2027-01"), "2026-12");
});

test("rankShop adds up each product's kept quantity and price, by JST order day", () => {
  const boards = rankShop(SHOP, ORDERS, new Map([["A", "https://img.test/a.jpg"]]), "2026-11-19");
  const today = boards.today;
  assert.equal(today.itemCount, 2);
  assert.equal(today.status, "ready");
  const [first, second] = today.rankings.sales;
  // A: ¥748 in each of two orders; B: 2 × ¥500 in one; the canceled order's C not at all
  assert.deepEqual(
    [first.rank, first.sku, first.salesAmount, first.unitsSold, first.orderCount],
    [1, "[A] Galaxy A25 ケース", 1496, 2, 2],
  );
  assert.deepEqual(
    [second.rank, second.sku, second.salesAmount, second.unitsSold, second.orderCount],
    [2, "[B] Galaxy A25 ケース", 1000, 2, 1],
  );
  assert.equal(first.imageUrl, "https://img.test/a.jpg");
  assert.equal(second.imageUrl, null);
  assert.equal(first.itemUrl, "https://jp.mercari.com/shops/product/A");
  assert.equal(first.currency, "JPY");

  // this month: A 1 + 1 + 2 = 4 units over three orders; October holds B alone
  const month = boards.currentMonth.rankings.units[0];
  assert.deepEqual(
    [month.sku, month.unitsSold, month.orderCount, month.salesAmount],
    ["[A] Galaxy A25 ケース", 4, 3, 2992],
  );
  assert.deepEqual(
    boards.previousMonth.rankings.units.map((it) => [it.sku, it.unitsSold]),
    [["[B] Galaxy A25 ケース", 1]],
  );
});

test("rankShop ranks by the picked figure and settles a tie by the others", () => {
  const orders = [order("o1", "2026-11-19", [item("X", 100, 1)]), order("o2", "2026-11-19", [item("Y", 300, 1)])];
  const { today } = rankShop(SHOP, orders, new Map(), "2026-11-19");
  // one order each: the yen decide
  assert.deepEqual(
    today.rankings.orderCount.map((it) => it.sku.slice(1, 2)),
    ["Y", "X"],
  );
});

test("rankShop keeps the title short and the board to a hundred rows", () => {
  const long = "[LONG] " + "あ".repeat(200);
  const orders = Array.from({ length: 120 }, (_, i) => order(`o${i}`, "2026-11-19", [item(`P${i}`, 100 + i, 1, long)]));
  const { today } = rankShop(SHOP, orders, new Map(), "2026-11-19");
  assert.equal(today.itemCount, 120);
  assert.equal(today.rankings.sales.length, 100);
  assert.equal(today.rankings.sales[0].sku.length, 60);
});

// a fake server: the status, then its orders and products in pages of `size`
function server({
  orders = ORDERS,
  products = [{ id: "A", imageUrl: "https://img.test/a.jpg" }],
  size = 2,
  stamp = SHOP.sourceUpdatedAt,
  status = "ready",
} = {}) {
  const calls = [];
  const state = { orders, stamp, status, failProducts: false, stampOnPage: null };
  const pageOf = (rows, url) => {
    const page = Number(url.searchParams.get("page"));
    const slice = rows.slice((page - 1) * size, page * size);
    const sourceUpdatedAt = state.stampOnPage?.[page] ?? state.stamp;
    return {
      ok: true,
      status: state.status,
      sourceUpdatedAt,
      page,
      total: rows.length,
      nextPage: page * size < rows.length ? page + 1 : null,
      items: slice,
    };
  };
  const fetchJson = async (url) => {
    calls.push(`${url.pathname}${url.searchParams.get("page") ? `#${url.searchParams.get("page")}` : ""}`);
    if (url.pathname === "/api/mercari/status") {
      return {
        ok: true,
        shops: [
          { configId: "cfg-1", shopName: "3911", enabled: true },
          { configId: "cfg-2", shopName: "off", enabled: false },
        ],
      };
    }
    if (url.pathname === "/api/mercari/orders") return pageOf(state.orders, url);
    if (url.pathname === "/api/mercari/products") {
      if (state.failProducts) throw new Error("HTTP 500");
      return pageOf(products, url);
    }
    throw new Error(`unexpected ${url}`);
  };
  return { fetchJson, calls, state };
}

beforeEach(() => clearMercariRankingCache());

test("readMercariRankings reads every page of the enabled shops", async () => {
  const s = server();
  const boards = await readMercariRankings(s.fetchJson, BASE, NOW);
  assert.equal(boards.enabled, true);
  assert.equal(boards.today.key, "2026-11-19");
  assert.equal(boards.currentMonth.key, "2026-11");
  assert.equal(boards.previousMonth.key, "2026-10");
  assert.deepEqual(
    boards.today.shops.map((shop) => shop.shopName),
    ["3911"],
  );
  assert.equal(boards.currentMonth.shops[0].rankings.units[0].unitsSold, 4);
  assert.equal(boards.today.shops[0].rankings.orderCount[0].imageUrl, "https://img.test/a.jpg");
  // 6 orders in pages of 2, and 1 product
  assert.deepEqual(s.calls, [
    "/api/mercari/status",
    "/api/mercari/orders#1",
    "/api/mercari/orders#2",
    "/api/mercari/orders#3",
    "/api/mercari/products#1",
  ]);
});

test("readMercariRankings reads one page while the server's orders have not moved on", async () => {
  const s = server();
  await readMercariRankings(s.fetchJson, BASE, NOW);
  s.calls.length = 0;
  const again = await readMercariRankings(s.fetchJson, BASE, NOW);
  assert.deepEqual(s.calls, ["/api/mercari/status", "/api/mercari/orders#1"]);
  assert.equal(again.today.shops[0].itemCount, 2);

  // a new snapshot is read in full
  s.state.stamp = "2026-11-19T06:43:20.089Z";
  s.state.orders = [...ORDERS, order("o7", "2026-11-19", [item("D", 100, 1)])];
  s.calls.length = 0;
  const fresh = await readMercariRankings(s.fetchJson, BASE, NOW);
  assert.equal(fresh.today.shops[0].itemCount, 3);
  assert.ok(s.calls.length > 2);
});

test("readMercariRankings starts over when a refresh moves the pages under it", async () => {
  const s = server();
  s.state.stampOnPage = { 2: "2026-11-19T06:43:20.089Z" };
  const read = readMercariRankings(s.fetchJson, BASE, NOW);
  await assert.rejects(read, /changed while it was read/);

  // once the server is done refreshing, the read goes through
  clearMercariRankingCache();
  s.state.stampOnPage = null;
  const boards = await readMercariRankings(s.fetchJson, BASE, NOW);
  assert.equal(boards.today.shops[0].itemCount, 2);
});

test("readMercariRankings keeps the boards without images when the products cannot be read", async () => {
  const s = server();
  s.state.failProducts = true;
  const boards = await readMercariRankings(s.fetchJson, BASE, NOW);
  assert.equal(boards.today.shops[0].itemCount, 2);
  assert.equal(boards.today.shops[0].rankings.orderCount[0].imageUrl, null);
});

test("a shop the server has not read stays on the list with nothing ranked", async () => {
  const s = server({ status: "not_ready", orders: [] });
  const boards = await readMercariRankings(s.fetchJson, BASE, NOW);
  const [shop] = boards.today.shops;
  assert.equal(shop.status, "not_ready");
  assert.equal(shop.itemCount, 0);
  assert.deepEqual(shop.rankings.sales, []);
  assert.deepEqual(s.calls, ["/api/mercari/status", "/api/mercari/orders#1"]);
});

test("two reads at once share one trip to the server", async () => {
  const s = server();
  const [a, b] = await Promise.all([
    readMercariRankings(s.fetchJson, BASE, NOW),
    readMercariRankings(s.fetchJson, BASE, NOW),
  ]);
  assert.equal(a, b);
  assert.equal(s.calls.filter((call) => call === "/api/mercari/status").length, 1);
});
