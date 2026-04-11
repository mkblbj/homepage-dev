import assert from "node:assert/strict";
import test from "node:test";

import { buildDashboardModel, normalizeCouriers, normalizeShops } from "./dashboard-model.mjs";

const labels = {
  activeShops: "稼働店舗",
  courierCount: "配送種別",
  todayOutput: "今日出力",
  yesterdayShipping: "昨日出荷",
  todayShipping: "今日出荷",
  tomorrowOutput: "明日予定",
};

const formatNumber = (value) => new Intl.NumberFormat("en-US").format(Number(value || 0));

const fixture = {
  updated_at: "2026-04-11 10:57:18",
  today_output: {
    date: "2026-04-11",
    total_quantity: 1190,
    active_shops_count: 8,
    shops_count: 19,
    shops: [
      { shop_id: 2, shop_name: "3911", category_name: "楽天", total_quantity: 363 },
      { shop_id: 1, shop_name: "十色生活", category_name: "楽天", total_quantity: 424 },
      { shop_id: 3, shop_name: "松武商店", category_name: "auShop", total_quantity: 273 },
      { shop_id: 4, shop_name: "在庫ゼロ", category_name: "auShop", total_quantity: 0 },
    ],
  },
  tomorrow_output: {
    date: "2026-04-12",
    total_quantity: 0,
    active_shops_count: 0,
    shops_count: 19,
    shops: [],
  },
  today_shipping: {
    date: "2026-04-11",
    total_quantity: 0,
    couriers_count: 0,
    couriers: [],
  },
  yesterday_shipping: {
    date: "2026-04-10",
    total_quantity: 898,
    couriers_count: 4,
    couriers: [
      { courier_id: 1, courier_name: "ゆうパケット (2CM)", total_quantity: 579 },
      { courier_id: 2, courier_name: "ゆうパケット (1CM)", total_quantity: 271 },
      { courier_id: 3, courier_name: "クリップポスト (3CM)", total_quantity: 42 },
    ],
  },
};

test("normalizeShops filters zero rows and sorts by quantity desc then name", () => {
  assert.deepEqual(
    normalizeShops(fixture.today_output).map((item) => item.shop_name),
    ["十色生活", "3911", "松武商店"],
  );
});

test("normalizeCouriers filters zero rows and sorts by quantity desc", () => {
  assert.deepEqual(
    normalizeCouriers(fixture.yesterday_shipping).map((item) => item.courier_name),
    ["ゆうパケット (2CM)", "ゆうパケット (1CM)", "クリップポスト (3CM)"],
  );
});

test("buildDashboardModel orders metrics and sections by the approved D/B layout", () => {
  const model = buildDashboardModel({ data: fixture, formatNumber, labels });

  assert.equal(model.updatedAt, "2026-04-11 10:57:18");
  assert.deepEqual(
    model.metrics.map((metric) => metric.id),
    ["today-output", "yesterday-shipping", "today-shipping", "tomorrow-output"],
  );
  assert.deepEqual(
    model.sections.map((section) => section.id),
    ["today-output", "yesterday-shipping", "today-shipping", "tomorrow-output"],
  );
  assert.equal(model.sections[0].statValue, "8/19");
  assert.equal(model.sections[1].statValue, "4");
});

test("buildDashboardModel marks the usually-empty panels as compact empty cards", () => {
  const model = buildDashboardModel({ data: fixture, formatNumber, labels });

  assert.equal(model.sections[2].id, "today-shipping");
  assert.equal(model.sections[2].emptyVariant, "compact");
  assert.equal(model.sections[2].emptyMessageKey, "noTodayShippingYet");
  assert.equal(model.sections[2].emptyHintKey, "waitingForUpdate");

  assert.equal(model.sections[3].id, "tomorrow-output");
  assert.equal(model.sections[3].emptyVariant, "compact");
  assert.equal(model.sections[3].emptyMessageKey, "noTomorrowScheduleYet");
  assert.equal(model.sections[3].emptyHintKey, "willAppearNextRefresh");

  assert.equal(model.sections[0].emptyVariant, "default");
  assert.equal(model.sections[1].emptyVariant, "default");
});

test("buildDashboardModel exposes one primary hero metric and three secondary hero metrics", () => {
  const model = buildDashboardModel({ data: fixture, formatNumber, labels });

  assert.equal(model.hero.primaryMetric.id, "today-output");
  assert.deepEqual(
    model.hero.secondaryMetrics.map((metric) => metric.id),
    ["yesterday-shipping", "today-shipping", "tomorrow-output"],
  );
  assert.equal(model.hero.primaryMetric.value, "1,190");
  assert.equal(model.hero.secondaryMetrics[0].value, "898");
});
