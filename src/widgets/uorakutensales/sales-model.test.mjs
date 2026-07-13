import assert from "node:assert/strict";
import test from "node:test";

import {
  buildModel,
  computeFreshness,
  DEFAULT_REFRESH_INTERVAL,
  man,
  mdLabel,
  pointX,
  spark,
  timeFromJST,
  weekdayJp,
} from "./sales-model.mjs";

const sales = {
  generatedAtJST: "2026-07-07 13:30 JST",
  totals: { salesYen: 30000, orderCount: 12 },
  shops: [
    { shopName: "3911", salesYen: 20000, orderCount: 8, status: "authenticated" },
    { shopName: "0406", salesYen: 10000, orderCount: 4, status: "authenticated" },
    { shopName: "allcase", salesYen: 0, orderCount: 0, status: "authenticated" },
  ],
};

const history = {
  generatedAtJST: "2026-07-07 06:30 JST",
  range: { dates: ["2026-06-30", "2026-07-01", "2026-07-02"] },
  totals: { salesYen: 90000, orderCount: 60, conversionRate: 2.35 },
  shops: [
    {
      shopName: "3911",
      totals: { salesYen: 60000, orderCount: 40, conversionRate: 2.1 },
      daily: [
        { date: "2026-06-30", salesYen: 10000, orderCount: 6 },
        { date: "2026-07-01", salesYen: 20000, orderCount: 14 },
        { date: "2026-07-02", salesYen: 30000, orderCount: 20 },
      ],
    },
    {
      shopName: "0406",
      totals: { salesYen: 30000, orderCount: 20, conversionRate: 1.8 },
      daily: [
        { date: "2026-06-30", salesYen: 5000, orderCount: 3 },
        { date: "2026-07-01", salesYen: 10000, orderCount: 7 },
        { date: "2026-07-02", salesYen: 15000, orderCount: 10 },
      ],
    },
  ],
};

test("buildModel returns null without a realtime snapshot", () => {
  assert.equal(buildModel(null, history), null);
  assert.equal(buildModel(undefined, undefined), null);
});

test("buildModel derives realtime totals, AOV and freshness timestamp", () => {
  const model = buildModel(sales, history);
  assert.equal(model.rtTotal, 30000);
  assert.equal(model.rtOrders, 12);
  assert.equal(model.aov, Math.round(30000 / 12));
  assert.equal(model.generatedAtJST, "2026-07-07 13:30 JST");
  assert.equal(model.time, "13:30");
});

test("buildModel sorts rows by today's sales and merges 7-day context", () => {
  const model = buildModel(sales, history);
  assert.deepEqual(model.rows.map((r) => r.name), ["3911", "0406", "allcase"]);

  const top = model.rows[0];
  assert.equal(top.rtSales, 20000);
  assert.equal(top.rtBarPct, 100); // biggest realtime shop → full bar
  assert.equal(Math.round(top.rtShare), 67); // 20000 / 30000
  assert.equal(top.h7Total, 60000);
  assert.equal(top.h7Orders, 40);
  assert.equal(top.cvr, 2.1);
  // per-shop daily is now enriched with date/md/wd/orders for the hover mini chart
  assert.deepEqual(top.daily.map((d) => d.sales), [10000, 20000, 30000]);
  assert.equal(top.daily[0].md, "6/30");
  assert.equal(top.daily[0].orders, 6);
  assert.equal(top.daily[0].wd, "火"); // 2026-06-30 is a Tuesday

  const idle = model.rows[2];
  assert.equal(idle.name, "allcase");
  assert.equal(idle.rtSales, 0);
  assert.equal(idle.rtShare, 0);
  assert.deepEqual(idle.daily, []); // no history row → empty context
});

test("buildModel computes the 7-day share baseline and a shared bullet scale", () => {
  const model = buildModel(sales, history);
  assert.equal(Math.round(model.rows[0].h7Share), 67); // 3911: 60000 / 90000
  assert.equal(Math.round(model.rows[1].h7Share), 33); // 0406: 30000 / 90000
  assert.equal(model.rows[2].h7Share, 0); // allcase: no history row
  // scale is the largest share across today/7-day so bullet lengths stay comparable
  assert.equal(Number(model.shareScale.toFixed(2)), 66.67);
});

test("buildModel falls back to a safe bullet scale without history", () => {
  const model = buildModel(sales, null);
  assert.equal(model.rows[0].h7Share, 0); // no baseline → tick is hidden by the component
  assert.ok(model.shareScale >= 1); // never divides by zero
});

test("buildModel merges shop logos by shopName, null when absent", () => {
  const logos = {
    shops: [
      { shopName: "3911", logoUrl: "https://cdn.example/3911.jpg" },
      { shopName: "0406", logoUrl: "" }, // empty → treated as no logo
    ],
  };
  const model = buildModel(sales, history, logos);
  assert.equal(model.rows[0].logoUrl, "https://cdn.example/3911.jpg"); // 3911
  assert.equal(model.rows[1].logoUrl, null); // 0406 — empty string normalized to null
  assert.equal(model.rows[2].logoUrl, null); // allcase — not in logos payload

  // logos are optional — model still builds without them
  assert.equal(buildModel(sales, history).rows[0].logoUrl, null);
});

test("buildModel aggregates daily totals across shops for the trend chart", () => {
  const model = buildModel(sales, history);
  assert.equal(model.nDays, 3);
  assert.deepEqual(model.days.map((d) => d.sales), [15000, 30000, 45000]);
  assert.deepEqual(model.days.map((d) => d.md), ["6/30", "7/1", "7/2"]);
  assert.equal(model.maxDaily, 45000);
  assert.equal(model.avg, 90000 / 3);
  assert.equal(model.avgOrders, 60 / 3); // per-day average orders
  assert.equal(model.grandTotal, 90000);
  assert.equal(model.grandCvr, 2.35);
  assert.equal(model.hasHistory, true);
  // xPct uses segment centers (i+0.5)/n so the chart, hover zones and axis
  // labels (equal-width flex tracks) all line up. For 3 days: 16.67 / 50 / 83.33.
  assert.equal(Number(model.days[0].xPct.toFixed(2)), 16.67);
  assert.equal(model.days[1].xPct, 50);
  assert.equal(Number(model.days[2].xPct.toFixed(2)), 83.33);
});

test("buildModel tolerates a missing history snapshot", () => {
  const model = buildModel(sales, null);
  assert.equal(model.hasHistory, false);
  assert.equal(model.grandTotal, 0);
  assert.equal(model.nDays, 7); // falls back to a week when no dates
  assert.equal(model.rows.length, 3);
  assert.equal(model.rows[0].h7Total, 0);
});

test("weekdayJp is timezone-stable (UTC based)", () => {
  assert.equal(weekdayJp("2026-07-07"), "火"); // Tuesday
  assert.equal(weekdayJp("2026-07-05"), "日"); // Sunday
  assert.equal(weekdayJp(""), "");
  assert.equal(weekdayJp("not-a-date"), "");
});

test("mdLabel and timeFromJST format compact labels", () => {
  assert.equal(mdLabel("2026-07-06"), "7/6");
  assert.equal(mdLabel(""), "");
  assert.equal(timeFromJST("2026-07-07 13:30 JST"), "13:30");
  assert.equal(timeFromJST(""), "");
});

test("man converts yen to a 万 figure with one decimal", () => {
  assert.equal(man(123456), "12.3");
  assert.equal(man(0), "0.0");
  assert.equal(man(null), "0.0");
});

test("spark produces a smooth path and a closed area, empty for no data", () => {
  const { line, area } = spark([1, 5, 3, 8], 100, 40, true);
  assert.match(line, /^M /);
  assert.match(line, / C /);
  assert.ok(area.endsWith("Z"));
  assert.deepEqual(spark([], 100, 40, true), { line: "", area: "" });
});

test("pointX places points edge-to-edge or at segment centers", () => {
  // edge-to-edge: first at 0, last at w
  assert.equal(pointX(0, 4, 100, false), 0);
  assert.equal(pointX(3, 4, 100, false), 100);
  // centered: each at the middle of its 1/n-wide track (aligns with flex zones/labels)
  assert.equal(pointX(0, 4, 100, true), 12.5);
  assert.equal(pointX(3, 4, 100, true), 87.5);
  // single point → centered regardless
  assert.equal(pointX(0, 1, 100, false), 50);
});

test("computeFreshness classifies live / delayed / stale by snapshot age", () => {
  const base = Date.parse("2026-07-07T13:30:00+09:00");
  const ri = DEFAULT_REFRESH_INTERVAL; // 60s → liveMax 180s, staleMax 1800s

  assert.equal(computeFreshness("2026-07-07 13:30 JST", base + 60_000, ri).state, "live");
  assert.equal(computeFreshness("2026-07-07 13:30 JST", base + 600_000, ri).state, "delayed");
  assert.equal(computeFreshness("2026-07-07 13:30 JST", base + 3_600_000, ri).state, "stale");
  assert.equal(computeFreshness(null, base, ri), null);
  assert.equal(computeFreshness("2026-07-07 13:30 JST", null, ri), null);
});
