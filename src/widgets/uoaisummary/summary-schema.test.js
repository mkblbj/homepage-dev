import { describe, expect, it } from "vitest";

import { SUMMARY_JSON_SCHEMA, validateModelSummary } from "./summary-schema.mjs";

const valid = {
  headline: { ja: "営業面に注意が必要です。", zh: "经营侧需要关注。" },
  assessment: { ja: "集客と運営対応を優先してください。", zh: "应优先改善流量和运营待办。" },
  evidence: [
    {
      metricKey: "performance.traffic.delta_percent",
      interpretation: { ja: "同曜日基準を下回っています。", zh: "低于同星期基准。" },
    },
    {
      metricKey: "attention.open_total",
      interpretation: { ja: "運営対応の滞留があります。", zh: "存在运营待办积压。" },
    },
  ],
  actions: [
    {
      priority: "high",
      module: "attention",
      shopName: null,
      title: { ja: "未対応案件を整理", zh: "梳理未处理事项" },
      reason: { ja: "優先度の高い案件から確認してください。", zh: "请从高优先级事项开始处理。" },
    },
  ],
  reviewThemes: [],
};

function validationContext(overrides = {}) {
  return {
    metricKeys: new Set(["performance.traffic.delta_percent", "attention.open_total"]),
    shopNames: new Set(["3911"]),
    availableModules: new Set(["shipping", "attention", "sales", "performance"]),
    hasReviewSamples: false,
    ...overrides,
  };
}

describe("executive summary schema", () => {
  it("uses a strict closed JSON schema", () => {
    expect(SUMMARY_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(SUMMARY_JSON_SCHEMA.required).toEqual(["headline", "assessment", "evidence", "actions", "reviewThemes"]);
  });

  it("accepts aligned bilingual output with known evidence", () => {
    expect(
      validateModelSummary(valid, {
        ...validationContext(),
      }),
    ).toEqual(valid);
  });

  it("rejects unknown metric keys, unknown shops and business numbers in free text", () => {
    const unknownMetric = structuredClone(valid);
    unknownMetric.evidence[0].metricKey = "invented.value";
    expect(() => validateModelSummary(unknownMetric, { metricKeys: new Set(), shopNames: new Set() })).toThrow();

    const numericClaim = structuredClone(valid);
    numericClaim.headline.ja = "売上は123件です。";
    expect(() =>
      validateModelSummary(numericClaim, {
        metricKeys: new Set(["performance.traffic.delta_percent", "attention.open_total"]),
        shopNames: new Set(),
      }),
    ).toThrow();

    const unknownShop = structuredClone(valid);
    unknownShop.actions[0].shopName = "unknown-shop";
    expect(() =>
      validateModelSummary(unknownShop, {
        metricKeys: new Set(["performance.traffic.delta_percent", "attention.open_total"]),
        shopNames: new Set(["3911"]),
      }),
    ).toThrow();
  });

  it("rejects missing bilingual fields, duplicate evidence, and excess arrays", () => {
    const missingLanguage = structuredClone(valid);
    delete missingLanguage.headline.zh;
    expect(() =>
      validateModelSummary(missingLanguage, {
        metricKeys: new Set(["performance.traffic.delta_percent", "attention.open_total"]),
        shopNames: new Set(),
      }),
    ).toThrow();

    const duplicate = structuredClone(valid);
    duplicate.evidence[1].metricKey = duplicate.evidence[0].metricKey;
    expect(() =>
      validateModelSummary(duplicate, {
        metricKeys: new Set(["performance.traffic.delta_percent"]),
        shopNames: new Set(),
      }),
    ).toThrow();

    const excess = structuredClone(valid);
    excess.actions = Array.from({ length: 4 }, () => valid.actions[0]);
    expect(() =>
      validateModelSummary(excess, {
        metricKeys: new Set(["performance.traffic.delta_percent", "attention.open_total"]),
        shopNames: new Set(),
      }),
    ).toThrow();
  });

  it("rejects actions for unavailable modules and themes without review samples", () => {
    const missingModule = structuredClone(valid);
    expect(() =>
      validateModelSummary(missingModule, validationContext({ availableModules: new Set(["performance"]) })),
    ).toThrow("action module is unavailable");

    const unsupportedTheme = structuredClone(valid);
    unsupportedTheme.reviewThemes = [
      {
        theme: { ja: "配送品質", zh: "配送质量" },
        impact: { ja: "信頼に影響します。", zh: "会影响信任。" },
        suggestion: { ja: "原因を確認してください。", zh: "请检查原因。" },
      },
    ];
    expect(() => validateModelSummary(unsupportedTheme, validationContext({ hasReviewSamples: false }))).toThrow(
      "review themes require review samples",
    );
  });

  it.each([
    ["email", "buyer@synthetic.invalid"],
    ["URL", "https://synthetic.invalid/private"],
    ["order identifier", "注文番号 ABCDE-SECRET"],
    ["review identifier", "review id PRIVATE_TOKEN"],
  ])("rejects %s-shaped text in model prose", (_label, unsafeText) => {
    const output = structuredClone(valid);
    output.assessment.zh = `请联系 ${unsafeText}`;

    expect(() => validateModelSummary(output, validationContext())).toThrow("Sensitive data found in model prose");
  });

  it.each([
    ["Japanese", "未対応は三件あります。"],
    ["Chinese", "待办共有十件。"],
  ])("rejects %s business number words", (_label, numericText) => {
    const output = structuredClone(valid);
    output.headline.zh = numericText;

    expect(() => validateModelSummary(output, validationContext())).toThrow("Business number found in model prose");
  });

  it("allows ordinary Japanese and Chinese prose without a quantity claim", () => {
    const output = structuredClone(valid);
    output.headline = {
      ja: "一方で、物流は安定しています。",
      zh: "另一方面，物流保持稳定。",
    };

    expect(validateModelSummary(output, validationContext())).toEqual(output);
  });
});
