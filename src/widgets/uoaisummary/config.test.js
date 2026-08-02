import { describe, expect, it } from "vitest";

import { AISummaryError } from "./errors.mjs";
import { discoverSummaryConfiguration } from "./config.mjs";

function service(name, type, extra = {}) {
  return { name, widget: { type, url: "http://127.0.0.1", ...extra } };
}

const groups = [
  {
    name: "UO サービス",
    services: [],
    groups: [
      {
        name: "リアルタイム看板",
        services: [
          service("AI 経営サマリー", "uoaisummary", {
            apiUrl: "https://ai.example.test/v1/responses",
            apiKey: "secret",
            model: "gpt-5.6-terra",
            reasoningEffort: "high",
          }),
          service("出荷", "uoshippingdashboard"),
        ],
        groups: [],
      },
      {
        name: "その他",
        services: [
          service("運営", "uoattention"),
          service("売上", "uorakutensales"),
          service("経営", "uoperformance"),
        ],
        groups: [],
      },
    ],
  },
];

describe("discoverSummaryConfiguration", () => {
  it("finds one AI widget and all four source widgets recursively", () => {
    const result = discoverSummaryConfiguration(groups);

    expect(result.ai).toMatchObject({
      apiUrl: "https://ai.example.test/v1/responses",
      model: "gpt-5.6-terra",
      reasoningEffort: "high",
      generationInterval: 3600000,
      manualCooldown: 600000,
      requestTimeout: 180000,
      refreshInterval: 60000,
    });
    expect(result.sources.shipping.widget.type).toBe("uoshippingdashboard");
    expect(result.sources.attention.widget.type).toBe("uoattention");
    expect(result.sources.sales.widget.type).toBe("uorakutensales");
    expect(result.sources.performance.widget.type).toBe("uoperformance");
    expect(Object.keys(result.sources.shipping).sort()).toEqual(["error", "groupName", "serviceName", "widget"]);
  });

  it("marks only a duplicated source invalid", () => {
    const duplicate = structuredClone(groups);
    duplicate[0].groups[1].services.push(service("売上2", "uorakutensales"));

    const result = discoverSummaryConfiguration(duplicate);

    expect(result.sources.sales.widget).toBeNull();
    expect(result.sources.sales.error).toBe("duplicate");
    expect(result.sources.shipping.error).toBeNull();
  });

  it("rejects missing API keys", () => {
    const invalid = structuredClone(groups);
    delete invalid[0].groups[0].services[0].widget.apiKey;

    expect(() => discoverSummaryConfiguration(invalid)).toThrow(AISummaryError);
  });

  it("rejects unresolved API key placeholders", () => {
    const invalid = structuredClone(groups);
    invalid[0].groups[0].services[0].widget.apiKey = "{{HOMEPAGE_FILE_UO_AI_API_KEY}}";

    expect(() => discoverSummaryConfiguration(invalid)).toThrow(AISummaryError);
  });

  it("passes custom model and reasoning effort values through without an allowlist", () => {
    const custom = structuredClone(groups);
    custom[0].groups[0].services[0].widget.model = "  internal-company-model-v7  ";
    custom[0].groups[0].services[0].widget.reasoningEffort = "  custom-effort-level  ";

    expect(discoverSummaryConfiguration(custom).ai).toMatchObject({
      model: "internal-company-model-v7",
      reasoningEffort: "custom-effort-level",
    });
  });

  it.each(["model", "reasoningEffort"])("rejects an empty %s", (field) => {
    const invalid = structuredClone(groups);
    invalid[0].groups[0].services[0].widget[field] = "   ";

    expect(() => discoverSummaryConfiguration(invalid)).toThrow(AISummaryError);
  });

  it("rejects non-HTTP endpoints and non-positive timing values", () => {
    const invalidUrl = structuredClone(groups);
    invalidUrl[0].groups[0].services[0].widget.apiUrl = "file:///tmp/responses";
    expect(() => discoverSummaryConfiguration(invalidUrl)).toThrow(AISummaryError);

    const invalidEndpoint = structuredClone(groups);
    invalidEndpoint[0].groups[0].services[0].widget.apiUrl =
      "https://ai.example.test/v1/responses?tenant=private";
    expect(() => discoverSummaryConfiguration(invalidEndpoint)).toThrow(AISummaryError);

    const invalidTiming = structuredClone(groups);
    invalidTiming[0].groups[0].services[0].widget.generationInterval = -1;
    expect(() => discoverSummaryConfiguration(invalidTiming)).toThrow(AISummaryError);
  });
});
