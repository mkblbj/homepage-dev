import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMarketReference,
  MARKET_GAP_TOP,
  MARKET_REFRESH_INTERVAL,
  marketRows,
  OWN_STRONG_TO,
  OWN_WEAK_FROM,
} from "./device-market-model.mjs";
import { buildDeviceSales } from "./device-sales-model.mjs";
import { dailyDeviceSales, deviceBoard, marketDeviceModels, monthlyDeviceSales } from "./device-sales.fixtures.mjs";

// this month's company case board: Pixel 10a 74 · Galaxy A25 66 · iPhone 17 e 50
function ownCase(bend = () => {}) {
  const monthly = monthlyDeviceSales();
  bend(monthly);
  return buildDeviceSales(dailyDeviceSales(), monthly).periods.thisMonth.types.case;
}

const pick = (rows) => rows.map((r) => [r.model, r.own && [r.own.rank, r.own.value], r.flag]);

test("buildMarketReference returns null while there is nothing to read", () => {
  assert.equal(buildMarketReference(undefined), null);
  assert.equal(buildMarketReference(null), null);
  // the proxy relays an older server's 404 as { error }
  assert.equal(buildMarketReference({ error: { message: "Rakuten sales service error" } }), null);
  assert.equal(buildMarketReference({ status: "observed" }), null);
});

test("buildMarketReference keeps the ranking, its window and how much of it is recorded", () => {
  const reference = buildMarketReference(marketDeviceModels());

  assert.equal(MARKET_REFRESH_INTERVAL, 3600000);
  assert.equal(reference.ready, true);
  assert.equal(reference.status, "observed");
  assert.equal(reference.partial, true);
  assert.equal(reference.stale, false);
  assert.deepEqual([reference.startDate, reference.endDate], ["2026-09-01", "2026-10-08"]);
  assert.deepEqual([reference.recordedDays, reference.expectedDays], [7, 38]);
  assert.deepEqual(reference.weights, { rakutenProducts: 0.5, yahooSearch: 0.3, yahooProducts: 0.2 });
  assert.equal(reference.rows.length, 5);
  assert.deepEqual(reference.rows[1], {
    rank: 2,
    model: "Galaxy A25",
    score: 85.14,
    sources: { rakutenProducts: 96.09, yahooSearch: 64.72, yahooProducts: 88.4 },
  });
});

test("a reference not collected yet, or a stale source, says so", () => {
  const empty = buildMarketReference({ ...marketDeviceModels(), status: "not_ready", ranks: [] });
  assert.equal(empty.ready, false);
  assert.deepEqual(empty.rows, []);

  const raw = marketDeviceModels();
  raw.sources.yahoo.stale = true;
  assert.equal(buildMarketReference(raw).stale, true);
});

test("marketRows sets each market model against our own case board", () => {
  const rows = marketRows(buildMarketReference(marketDeviceModels()), ownCase(), "units");

  assert.deepEqual(pick(rows), [
    ["iPhone 17", null, "none"],
    ["Galaxy A25", [2, 66], "strong"],
    ["iPhone 18 Pro", null, "none"],
    ["Google Pixel 10a", [1, 74], "strong"],
    ["iPhone Air", null, "none"],
  ]);
});

test("marketRows flags a market top-20 model we rank below 30th, and leaves the middle unmarked", () => {
  assert.deepEqual([MARKET_GAP_TOP, OWN_WEAK_FROM, OWN_STRONG_TO], [20, 30, 10]);
  // 35 models of our own: Galaxy A25 15th, iPhone 18 Pro 33rd
  const filler = Array.from({ length: 35 }, (_, i) => [`Model ${i + 1}`, 100 - i, 1000, 1]);
  filler[14] = ["Galaxy A25", 86, 1000, 1];
  filler[32] = ["iPhone 18 Pro", 68, 1000, 1];
  const rows = marketRows(
    buildMarketReference(marketDeviceModels()),
    ownCase((monthly) => {
      monthly.currentMonth.types.case = deviceBoard(filler);
    }),
    "units",
  );

  assert.deepEqual(pick(rows).slice(1, 3), [
    ["Galaxy A25", [15, 86], null],
    ["iPhone 18 Pro", [33, 68], "weak"],
  ]);
});

test("our ranks follow the metric on screen", () => {
  const rows = marketRows(
    buildMarketReference(marketDeviceModels()),
    ownCase((monthly) => {
      // Galaxy A25 sells more pieces, Pixel 10a more yen
      monthly.currentMonth.types.case = deviceBoard([
        ["Galaxy A25", 80, 60000, 70],
        ["Google Pixel 10a", 60, 90000, 55],
      ]);
    }),
    "sales",
  );

  assert.deepEqual(
    rows.filter((r) => r.own).map((r) => [r.model, r.own.rank, r.own.value]),
    [
      ["Galaxy A25", 2, 60000],
      ["Google Pixel 10a", 1, 90000],
    ],
  );
});

test("a combination row never matches a market model, nor pushes single models down", () => {
  const rows = marketRows(
    buildMarketReference(marketDeviceModels()),
    ownCase((monthly) => {
      monthly.currentMonth.types.case = deviceBoard([
        ["iPhone 17 / iPhone 16（多机型）", 90, 99000, 80, "compatibility"],
        ["Galaxy A25", 66, 79200, 60],
      ]);
    }),
    "units",
  );

  assert.deepEqual(pick(rows).slice(0, 2), [
    ["iPhone 17", null, "none"],
    ["Galaxy A25", [1, 66], "strong"],
  ]);
});

test("without our board for the scope there are no own figures and no flags", () => {
  const rows = marketRows(buildMarketReference(marketDeviceModels()), null, "units");

  assert.ok(rows.every((r) => r.own === null && r.flag === null));
  assert.deepEqual(marketRows(null, ownCase(), "units"), []);
});
