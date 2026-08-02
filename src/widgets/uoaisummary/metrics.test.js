import { describe, expect, it } from "vitest";

import { METRIC_DEFINITIONS, metric, numberOrNull, sumNullable, tomorrowOutput } from "./metrics.mjs";

const KEYS = METRIC_DEFINITIONS.map(([key]) => key);

describe("METRIC_DEFINITIONS", () => {
  it("keeps exactly the fifteen approved metric keys", () => {
    expect(KEYS).toEqual([
      "output.today.total",
      "output.active_shops",
      "output.tomorrow.total",
      "attention.open_total",
      "attention.pending_orders",
      "attention.unanswered_inquiries",
      "attention.overdue_inquiries",
      "attention.unreplied_reviews",
      "sales.realtime_yen",
      "sales.orders",
      "sales.aov_yen",
      "sales.realtime_vs_seven_day_avg_percent",
      "performance.traffic.visit",
      "performance.traffic.delta_percent",
      "performance.mix.new_sales_share",
    ]);
  });

  it("drops every shipping metric that describes 出荷", () => {
    expect(KEYS.filter((key) => key.startsWith("shipping.shipping."))).toEqual([]);
  });

  it("uses only the three approved units", () => {
    expect([...new Set(METRIC_DEFINITIONS.map(([, , , unit]) => unit))].sort()).toEqual(["count", "percent", "yen"]);
  });

  it("attaches a note reader only to tomorrow output", () => {
    expect(METRIC_DEFINITIONS.filter(([, , , , noteRead]) => noteRead).map(([key]) => key)).toEqual([
      "output.tomorrow.total",
    ]);
  });
});

describe("tomorrowOutput", () => {
  it("prefers the confirmed quantity", () => {
    expect(tomorrowOutput({ tomorrow_output: { total_quantity: 90, total_predicted_quantity: 40 } })).toEqual({
      mode: "actual",
      total: 90,
    });
  });

  it("falls back to the predicted quantity", () => {
    expect(tomorrowOutput({ tomorrow_output: { total_quantity: 0, total_predicted_quantity: 40 } })).toEqual({
      mode: "predicted",
      total: 40,
    });
  });

  it("falls back to yesterday output when tomorrow is empty", () => {
    expect(tomorrowOutput({ tomorrow_output: {}, yesterday_output: { total_quantity: 55 } })).toEqual({
      mode: "yesterday",
      total: 55,
    });
  });
});

describe("metric", () => {
  it("computes the delta against the previous snapshot", () => {
    expect(metric("sales.orders", "sales", 12, "count", { "sales.orders": 10 })).toEqual({
      key: "sales.orders",
      source: "sales",
      value: 12,
      unit: "count",
      previousValue: 10,
      delta: 2,
      deltaPercent: 20,
      note: null,
    });
  });

  it("keeps null values null instead of treating them as zero", () => {
    const result = metric("sales.orders", "sales", null, "count", { "sales.orders": 10 });
    expect(result.value).toBeNull();
    expect(result.delta).toBeNull();
    expect(result.deltaPercent).toBeNull();
  });

  it("carries the note through", () => {
    expect(metric("output.tomorrow.total", "shipping", 5, "count", {}, "predicted").note).toBe("predicted");
  });
});

describe("helpers", () => {
  it("treats empty strings as null", () => {
    expect(numberOrNull("")).toBeNull();
    expect(numberOrNull("7")).toBe(7);
  });

  it("returns null when every summand is unknown", () => {
    expect(sumNullable([null, undefined])).toBeNull();
    expect(sumNullable([null, 3, 4])).toBe(7);
  });
});
