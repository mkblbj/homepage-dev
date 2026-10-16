import assert from "node:assert/strict";
import test from "node:test";

import { buildShippingView, cleanCourierName } from "./shipping-model.mjs";

// Shape of /api/dashboard/homepage at 2026-10-16 13:14 (trimmed).
const live = {
  date: "2026-10-16",
  updated_at: "2026-10-16 13:14:32",
  today_output: { date: "2026-10-16", total_quantity: 1100, shops_count: 20, shops: [] },
  yesterday_output: { date: "2026-10-15", total_quantity: 844 },
  tomorrow_output: {
    date: "2026-10-17",
    total_quantity: 0,
    total_predicted_quantity: 0,
    shops_count: 20,
    shops: [{ has_data: false }],
  },
  today_shipping: { date: "2026-10-16", total_quantity: 0, record_count: 0, couriers: [], records: [] },
  yesterday_shipping: {
    date: "2026-10-15",
    total_quantity: 817,
    record_count: 5,
    couriers: [
      { courier_name: "ゆうパケット 3CM)", total_quantity: 28 },
      { courier_name: "ゆうパケット (2CM)", total_quantity: 587 },
    ],
    records: [{ created_at: "2026-10-15T07:14:00.000Z" }, { created_at: "2026-10-15T07:13:01.000Z" }],
  },
};

test("daytime: output known, today's shipping not yet tallied, tomorrow undecided", () => {
  const v = buildShippingView(live);
  assert.equal(v.updatedAt, "2026-10-16 13:14:32");
  assert.equal(v.output.total, 1100);
  assert.equal(v.output.yesterdayTotal, 844);
  assert.equal(v.output.yesterdayDate, "2026-10-15");
  assert.equal(v.output.date, "2026-10-16");
  assert.equal(v.shipping.state, "pending");
  assert.equal(v.shipping.total, null);
  assert.equal(v.shipping.yesterday.total, 817);
  assert.equal(v.shipping.yesterday.recorded, true);
  assert.equal(v.shipping.yesterday.recordedAt, "16:13");
  assert.equal(v.tomorrow.stage, "undecided");
  assert.equal(v.tomorrow.date, "2026-10-17");
  assert.equal(v.couriers.scope, "yesterday");
  assert.equal(v.couriers.date, "2026-10-15");
  assert.equal(v.couriers.total, 817);
  assert.deepEqual(
    v.couriers.items.map((c) => c.name),
    ["ゆうパケット (2CM)", "ゆうパケット (3CM)"],
  );
});

test("tomorrow moves from predicted to accruing, never to confirmed", () => {
  const predicted = buildShippingView({
    ...live,
    tomorrow_output: { ...live.tomorrow_output, total_predicted_quantity: 900 },
  });
  assert.equal(predicted.tomorrow.stage, "predicted");
  assert.equal(predicted.tomorrow.predicted, 900);
  assert.equal(predicted.tomorrow.total, null);

  const accruing = buildShippingView({
    ...live,
    tomorrow_output: {
      ...live.tomorrow_output,
      total_quantity: 640,
      shops: [{ has_data: true }, { has_data: true }, { has_data: false }],
    },
  });
  assert.equal(accruing.tomorrow.stage, "accruing");
  assert.equal(accruing.tomorrow.total, 640);
  assert.equal(accruing.tomorrow.enteredShops, 2);
  assert.equal(accruing.tomorrow.shopsCount, 20);
});

test("once today is tallied the courier mix switches to today", () => {
  const v = buildShippingView({
    ...live,
    today_shipping: {
      date: "2026-10-16",
      total_quantity: 812,
      record_count: 5,
      couriers: [{ courier_name: "佐川急便", total_quantity: 3 }],
      records: [{ created_at: "2026-10-16T07:13:00.000Z" }],
    },
  });
  assert.equal(v.shipping.state, "accruing");
  assert.equal(v.shipping.total, 812);
  assert.equal(v.shipping.firstAt, "16:13");
  assert.equal(v.couriers.scope, "today");
  assert.equal(v.couriers.date, "2026-10-16");
});

test("a day with no shipping records is 'no record', not zero", () => {
  const v = buildShippingView({
    ...live,
    yesterday_shipping: { date: "2026-10-15", total_quantity: 0, record_count: 0, couriers: [], records: [] },
  });
  assert.equal(v.shipping.yesterday.recorded, false);
  assert.equal(v.shipping.yesterday.total, null);
  assert.equal(v.couriers.recorded, false);
  assert.equal(v.couriers.total, null);
});

test("no data or a proxy error is unknown, never 0", () => {
  for (const bad of [null, undefined, { error: "x" }]) {
    const v = buildShippingView(bad);
    assert.equal(v.output.total, null);
    assert.equal(v.output.yesterdayTotal, null);
    assert.equal(v.shipping.state, "unknown");
    assert.equal(v.tomorrow.stage, "unknown");
    assert.deepEqual(v.couriers.items, []);
  }
});

test("courier names keep the API's words, only the missing bracket is fixed", () => {
  assert.equal(cleanCourierName("ゆうパケット 3CM)"), "ゆうパケット (3CM)");
  assert.equal(cleanCourierName("佐川急便"), "佐川急便");
  assert.equal(cleanCourierName("ゆうパケット (1CM)"), "ゆうパケット (1CM)");
});
