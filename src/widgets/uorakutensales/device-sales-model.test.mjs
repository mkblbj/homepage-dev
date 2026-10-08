import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDeviceSales,
  categoryMix,
  compatParts,
  DEVICE_TYPES,
  displayModelName,
  metricReady,
  rankDeviceBoard,
  rankMoves,
} from "./device-sales-model.mjs";
import { COMPAT_LONG, COMPAT_SE, dailyDeviceSales, monthlyDeviceSales } from "./device-sales.fixtures.mjs";

const SE_NAME = "iPhone SE（第2代） / iPhone SE（第3代）";

test("buildDeviceSales returns null until some period has a board", () => {
  assert.equal(buildDeviceSales(undefined, undefined), null);
  assert.equal(buildDeviceSales(null, null), null);
});

test("today's board keeps the API order and all three metrics", () => {
  const { periods, available } = buildDeviceSales(dailyDeviceSales(), undefined);
  const today = periods.today;

  assert.deepEqual(available, ["today"]);
  assert.equal(today.ready, true);
  assert.equal(today.label, "2026-10-07");
  assert.equal(today.endDate, "2026-10-07");
  assert.equal(today.updatedAt, "2026-10-07 16:58:59 JST");
  assert.deepEqual(today.totals, { units: 48, sales: 59070, orders: 43 });
  assert.deepEqual(Object.keys(today.types), DEVICE_TYPES);

  const caseBoard = today.types.case;
  assert.deepEqual(
    caseBoard.rows.map((r) => r.fullModel),
    ["iPhone 17", "OPPO Reno13 A", COMPAT_SE],
  );
  assert.deepEqual(caseBoard.rows[0], {
    rank: 1,
    model: "iPhone 17",
    fullModel: "iPhone 17",
    compat: false,
    models: ["iPhone 17"],
    units: 10,
    sales: 11000,
    orders: 7,
    perOrder: 10 / 7,
  });
  assert.equal(caseBoard.rows[2].model, SE_NAME);
  assert.deepEqual(caseBoard.rows[2].models, ["iPhone SE（第2代）", "iPhone SE（第3代）"]);
  assert.equal(caseBoard.rows[2].compat, true);
  assert.equal(caseBoard.units, 16);
  assert.equal(caseBoard.sales, 27390);
  assert.equal(caseBoard.metricsReady, true);
  assert.equal(caseBoard.modelCount, 3);
  assert.equal(caseBoard.singleModelPercent, 87.5);
  // an empty category is a real zero board, not a missing one
  assert.deepEqual(today.types.case_film_set.rows, []);
  assert.equal(today.types.case_film_set.units, 0);
});

test("a category's orders come from the API's distinct count, never from adding rows", () => {
  const daily = dailyDeviceSales();
  daily.types.case.orderCount = 11; // one order bought two of the models

  const caseBoard = buildDeviceSales(daily, null).periods.today.types.case;

  assert.equal(caseBoard.orders, 11);
  assert.equal(
    caseBoard.rows.reduce((sum, r) => sum + r.orders, 0),
    13,
  );
});

test("coverage names the missing shops, and only shops with boards get one", () => {
  const today = buildDeviceSales(dailyDeviceSales(), null).periods.today;

  assert.equal(today.coveredShopCount, 2);
  assert.equal(today.shopCount, 3);
  assert.deepEqual(today.missingShops, ["kurumu"]);
  assert.deepEqual(today.staleShops, ["松武"]);
  assert.deepEqual(
    today.shops.map((s) => s.name),
    ["3911", "松武"],
  );
  assert.deepEqual(today.shops[0].totals, { units: 46, sales: 56870, orders: 41 });
});

test("the monthly payload becomes this month and last month", () => {
  const { periods, available } = buildDeviceSales(null, monthlyDeviceSales());

  assert.deepEqual(available, ["thisMonth", "lastMonth"]);
  assert.equal(periods.thisMonth.label, "2026-10");
  assert.equal(periods.thisMonth.endDate, "2026-10-07");
  assert.equal(periods.lastMonth.label, "2026-09");
  assert.deepEqual(
    periods.thisMonth.types.case.rows.map((r) => r.model),
    ["Google Pixel 10a", "Galaxy A25", "iPhone 17 e"],
  );
  // 松武 has no board for last month yet, so it gets no chip there
  assert.deepEqual(
    periods.lastMonth.shops.map((s) => s.name),
    ["3911"],
  );
  assert.deepEqual(periods.lastMonth.missingShops, ["松武", "kurumu"]);
});

test("a relayed proxy error hides that period instead of reading as not ready", () => {
  const notFound = { error: { message: "Rakuten sales service error", data: { error: "Not Found" } } };

  const built = buildDeviceSales(notFound, monthlyDeviceSales());

  assert.equal(built.periods.today, null);
  assert.deepEqual(built.available, ["thisMonth", "lastMonth"]);
  assert.equal(buildDeviceSales(notFound, notFound), null);
});

test("a period that is still landing stays a tab, with no boards", () => {
  const daily = dailyDeviceSales();
  Object.assign(daily, { ok: false, status: "not_ready", totals: null, types: null });
  daily.shops = daily.shops.map((s) => ({ ...s, totals: null, types: null }));

  const { periods, available } = buildDeviceSales(daily, monthlyDeviceSales());

  assert.deepEqual(available, ["today", "thisMonth", "lastMonth"]);
  assert.equal(periods.today.ready, false);
  assert.equal(periods.today.types, null);
  assert.equal(periods.today.totals, null);
  assert.deepEqual(periods.today.shops, []);

  // nothing readable anywhere → no board at all
  const monthly = monthlyDeviceSales();
  for (const key of ["currentMonth", "previousMonth"]) {
    Object.assign(monthly[key], { ok: false, status: "not_ready", totals: null, types: null });
  }
  assert.equal(buildDeviceSales(daily, monthly), null);
});

test("money still being backfilled stays null and leaves only units ready", () => {
  const daily = dailyDeviceSales();
  const board = daily.types.case;
  Object.assign(board, { metricsReady: false, salesYen: null, orderCount: null });
  board.ranks = board.ranks.map((r) => ({ ...r, salesYen: null, orderCount: null }));

  const caseBoard = buildDeviceSales(daily, null).periods.today.types.case;

  assert.equal(caseBoard.metricsReady, false);
  assert.equal(caseBoard.sales, null);
  assert.equal(caseBoard.rows[0].sales, null);
  assert.equal(caseBoard.rows[0].orders, null);
  assert.equal(caseBoard.rows[0].perOrder, null);
  assert.equal(caseBoard.rows[0].units, 10);
  assert.equal(metricReady(caseBoard, "units"), true);
  assert.equal(metricReady(caseBoard, "sales"), false);
  assert.equal(metricReady(caseBoard, "orders"), false);
});

test("displayModelName drops only the combination tag", () => {
  assert.equal(displayModelName(COMPAT_SE, "compatibility"), SE_NAME);
  assert.equal(
    displayModelName("Galaxy S23 / Galaxy S23 Ultra（多機種）", "compatibility"),
    "Galaxy S23 / Galaxy S23 Ultra",
  );
  assert.equal(displayModelName("iPhone SE（第3代）", "single"), "iPhone SE（第3代）");
  // a name that is nothing but the tag is never blanked
  assert.equal(displayModelName("（多机型）", "compatibility"), "（多机型）");
});

test("compatParts lists every model a combination row covers", () => {
  assert.deepEqual(compatParts(COMPAT_LONG), [
    "BASIO active 3",
    "Google Pixel 9 Pro",
    "Google Pixel 9a",
    "iPhone 16 e",
    "Libero 5G IV",
    "Motorola g24",
    "らくらくスマートフォン F-53E",
  ]);
  assert.deepEqual(compatParts("Galaxy A23 / Galaxy A25（多机型）"), ["Galaxy A23", "Galaxy A25"]);
});

test("rankDeviceBoard re-ranks by the metric on screen", () => {
  const caseBoard = buildDeviceSales(dailyDeviceSales(), null).periods.today.types.case;

  const byUnits = rankDeviceBoard(caseBoard, "units");
  assert.deepEqual(
    byUnits.map((r) => [r.rank, r.fullModel]),
    [
      [1, "iPhone 17"],
      [2, "OPPO Reno13 A"],
      [3, COMPAT_SE],
    ],
  );
  assert.equal(byUnits[0].share, 62.5); // 10 of 16
  assert.equal(byUnits[0].barPct, 100);
  assert.equal(byUnits[1].barPct, 40);

  const bySales = rankDeviceBoard(caseBoard, "sales");
  assert.deepEqual(
    bySales.map((r) => r.fullModel),
    ["OPPO Reno13 A", "iPhone 17", COMPAT_SE],
  );
  assert.equal(bySales[0].rank, 1);
  assert.equal(bySales[0].value, 14190);

  // distinct orders are not slices of the board's distinct orders
  assert.ok(rankDeviceBoard(caseBoard, "orders").every((r) => r.share === null));
});

test("少ない順 reads the same ranking from the bottom, so each model keeps its rank", () => {
  const caseBoard = buildDeviceSales(dailyDeviceSales(), null).periods.today.types.case;

  assert.deepEqual(
    rankDeviceBoard(caseBoard, "units", "asc").map((r) => [r.rank, r.fullModel]),
    [
      [3, COMPAT_SE],
      [2, "OPPO Reno13 A"],
      [1, "iPhone 17"],
    ],
  );
});

test("rankDeviceBoard breaks ties by the API rank and sinks unmeasured rows", () => {
  const board = buildDeviceSales(dailyDeviceSales(), null).periods.today.types.case;
  board.rows[0].sales = null;
  board.rows[1].sales = 2200; // now ties with the combination row

  assert.deepEqual(
    rankDeviceBoard(board, "sales").map((r) => r.fullModel),
    ["OPPO Reno13 A", COMPAT_SE, "iPhone 17"],
  );
});

test("categoryMix splits the active metric, and orders fall back to units", () => {
  const types = buildDeviceSales(dailyDeviceSales(), null).periods.today.types;

  const units = categoryMix(types, "units");
  assert.equal(units.metric, "units");
  assert.deepEqual(
    units.parts.map((p) => [p.key, p.value, Math.round(p.share * 10) / 10]),
    [
      ["case", 16, 33.3],
      ["film", 32, 66.7],
      ["case_film_set", 0, 0],
    ],
  );
  // one order can hold a case and a film, so orders do not add up to a whole
  assert.equal(categoryMix(types, "orders").metric, "units");
  assert.equal(categoryMix(types, "sales").metric, "sales");
  assert.equal(categoryMix(null, "units"), null);
});

test("rankMoves compares this month with last month under the same metric", () => {
  const { periods } = buildDeviceSales(null, monthlyDeviceSales());
  const byUnits = rankDeviceBoard(periods.thisMonth.types.case, "units");

  assert.deepEqual(rankMoves(byUnits, periods.lastMonth.types.case, "units"), [
    { dir: "up", prevRank: 2, delta: 1 }, // Google Pixel 10a
    { dir: "down", prevRank: 1, delta: 1 }, // Galaxy A25
    { dir: "new", prevRank: null, delta: 0 }, // iPhone 17 e
  ]);
});

test("rankMoves leaves no marks without a comparable board", () => {
  const { periods } = buildDeviceSales(null, monthlyDeviceSales());
  const bySales = rankDeviceBoard(periods.thisMonth.types.case, "sales");
  const pending = { ...periods.lastMonth.types.case, metricsReady: false };

  assert.deepEqual(rankMoves(bySales, null, "sales"), [null, null, null]);
  assert.deepEqual(rankMoves(bySales, pending, "sales"), [null, null, null]);
  // units never wait for money
  const byUnits = rankDeviceBoard(periods.thisMonth.types.case, "units");
  assert.equal(rankMoves(byUnits, pending, "units")[0].dir, "up");
});
