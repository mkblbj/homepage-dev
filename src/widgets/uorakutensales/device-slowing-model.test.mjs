import assert from "node:assert/strict";
import test from "node:test";

import { buildDeviceSales } from "./device-sales-model.mjs";
import { slowingDeviceSales } from "./device-sales.fixtures.mjs";
import { buildSlowing, SLOWING_MIN_UNITS, slowingTotals, slowingWindow } from "./device-slowing-model.mjs";

function devicesFrom(bend = () => {}) {
  const { daily, monthly } = slowingDeviceSales();
  bend(daily, monthly);
  return buildDeviceSales(daily, monthly);
}

test("slowing ranks established models by the pace they lost per day", () => {
  const slowing = buildSlowing(devicesFrom(), { type: "case", metric: "units" });

  assert.equal(SLOWING_MIN_UNITS, 30);
  assert.equal(slowing.metric, "units");
  assert.equal(slowing.completedDays, 6); // 10/1–10/6; today (10/7) is still running
  assert.equal(slowing.eligible, 4); // Tiny sold 20 last month, under the bar
  // Rising sped up, so it is not on the list at all
  assert.deepEqual(
    slowing.rows.map((r) => [r.rank, r.model, r.prevRank, r.prevPace, r.pace, r.loss]),
    [
      [1, "arrows We3", 2, 10, 3, 7],
      [2, "Galaxy A25", 1, 14, 9, 5],
      [3, "DIGNO BX3", 4, 2, 0, 2],
    ],
  );
  assert.equal(Math.round(slowing.rows[0].changePct), -70);
  assert.equal(slowing.rows[0].ratio, 30);
  // sold last month, nothing yet this month
  assert.equal(slowing.rows[2].ratio, 0);
  assert.equal(slowing.pace, 17);
  assert.equal(Math.round(slowing.changePct * 10) / 10, -42.7);
});

test("slowing reads money the same way once every board has it", () => {
  const slowing = buildSlowing(devicesFrom(), { type: "case", metric: "sales" });

  assert.equal(slowing.metric, "sales");
  assert.deepEqual(
    slowing.rows.map((r) => [r.model, r.loss]),
    [
      ["arrows We3", 8400],
      ["Galaxy A25", 6000],
      ["DIGNO BX3", 2400],
    ],
  );

  const pending = buildSlowing(
    devicesFrom((daily, monthly) => {
      const before = monthly.previousMonth.types.case;
      Object.assign(before, { metricsReady: false, salesYen: null, orderCount: null });
      before.ranks = before.ranks.map((r) => ({ ...r, salesYen: null, orderCount: null }));
    }),
    { type: "case", metric: "sales" },
  );
  assert.equal(pending.metric, "units");
});

test("slowing waits for a finished day, last month and one consistent build", () => {
  assert.equal(slowingWindow(devicesFrom()).reason, null);

  const monthStart = devicesFrom((daily, monthly) => {
    daily.sourceDateJST = "2026-10-01";
    monthly.currentMonth.endDate = "2026-10-01";
  });
  assert.equal(slowingWindow(monthStart).reason, "monthStart");
  assert.equal(buildSlowing(monthStart, { type: "case", metric: "units" }), null);

  const pending = devicesFrom((daily, monthly) => {
    Object.assign(monthly.previousMonth, { ok: false, status: "not_ready", types: null });
  });
  assert.equal(slowingWindow(pending).reason, "lastMonthPending");

  // the daily board was rebuilt after the month board was read: their numbers
  // cannot be subtracted until the next poll brings both from one build
  const apart = devicesFrom((daily) => {
    daily.generatedAtJST = "2026-10-07 17:14:03 JST";
  });
  assert.equal(slowingWindow(apart).reason, "updating");
});

test("a shop is compared only with its own boards", () => {
  const devices = devicesFrom();

  // 松武 was not read for last month
  assert.equal(buildSlowing(devices, { shop: "松武", type: "case", metric: "units" }), null);
  const own = buildSlowing(devices, { shop: "3911", type: "case", metric: "units" });
  assert.equal(own.eligible, 1);
  assert.deepEqual(own.rows, []); // Galaxy A25 kept its pace there
});

test("the 3カテゴリ合計 pace uses the same finished days", () => {
  const totals = slowingTotals(devicesFrom(), { metric: "units" });

  assert.equal(totals.pace, 17);
  assert.equal(Math.round(totals.prevPace * 100) / 100, 29.67);
  assert.equal(Math.round(totals.changePct * 10) / 10, -42.7);
});
