import { describe, expect, it } from "vitest";

import { SUMMARY_JSON_SCHEMA, validateModelSummary } from "./summary-schema.mjs";

const metricKeys = new Set(["sales.orders", "attention.open_total"]);

function validSummary(overrides = {}) {
  return {
    headline: { ja: "全社は平常運転です。", zh: "全社正常运转。" },
    assessment: { ja: "売上と流量は基準内です。", zh: "销售与流量在基准内。" },
    actions: [
      {
        priority: "high",
        module: "attention",
        shopName: "3911",
        metricKey: "attention.open_total",
        title: { ja: "未対応を処理", zh: "处理待办" },
        reason: { ja: "締切に間に合いません。", zh: "赶不上截止时间。" },
      },
    ],
    ...overrides,
  };
}

describe("SUMMARY_JSON_SCHEMA", () => {
  it("requires exactly three top-level blocks", () => {
    expect(SUMMARY_JSON_SCHEMA.required).toEqual(["headline", "assessment", "actions"]);
    expect(Object.keys(SUMMARY_JSON_SCHEMA.properties).sort()).toEqual(["actions", "assessment", "headline"]);
  });

  it("requires every action property so strict mode accepts it", () => {
    expect(SUMMARY_JSON_SCHEMA.properties.actions.items.required).toEqual([
      "priority",
      "module",
      "shopName",
      "metricKey",
      "title",
      "reason",
    ]);
  });
});

describe("validateModelSummary", () => {
  it("accepts a single action", () => {
    expect(validateModelSummary(validSummary(), { metricKeys })).toEqual(validSummary());
  });

  it("accepts a null metric key", () => {
    const summary = validSummary();
    summary.actions[0].metricKey = null;
    expect(validateModelSummary(summary, { metricKeys }).actions[0].metricKey).toBeNull();
  });

  it("rejects a metric key that was not collected", () => {
    const summary = validSummary();
    summary.actions[0].metricKey = "sales.seven_day_cvr";
    expect(() => validateModelSummary(summary, { metricKeys })).toThrow(/action metric is unknown/);
  });

  it("rejects leftover evidence or reviewThemes fields", () => {
    expect(() => validateModelSummary(validSummary({ evidence: [] }), { metricKeys })).toThrow(
      /summary contains unexpected fields/,
    );
    expect(() => validateModelSummary(validSummary({ reviewThemes: [] }), { metricKeys })).toThrow(
      /summary contains unexpected fields/,
    );
  });

  it("rejects an empty action list", () => {
    expect(() => validateModelSummary(validSummary({ actions: [] }), { metricKeys })).toThrow(
      /actions length is invalid/,
    );
  });

  it("rejects a headline longer than the budget", () => {
    const summary = validSummary();
    summary.headline.ja = "あ".repeat(81);
    expect(() => validateModelSummary(summary, { metricKeys })).toThrow(/headline\.ja is invalid/);
  });
});
