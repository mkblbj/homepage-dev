import { describe, expect, it, vi } from "vitest";

import { buildResponsesBody, deriveOpenAIEndpoint, requestSummaryOnce } from "./responses-client.mjs";

function validSummary() {
  return {
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
        reason: { ja: "優先度を確認してください。", zh: "请确认处理优先级。" },
      },
    ],
    reviewThemes: [],
  };
}

function capturedRequest(fetcher, index = 0) {
  const [input, init = {}] = fetcher.mock.calls[index];
  return input instanceof Request ? input : new Request(input, init);
}

function configuredRequest(fetcher) {
  return requestSummaryOnce({
    config: {
      apiUrl: "https://private-ai.example.test/v1/responses",
      apiKey: "private-secret",
      model: "gpt-5.6-luna",
      reasoningEffort: "xhigh",
      requestTimeout: 100,
    },
    modelInput: {},
    metricKeys: new Set(["performance.traffic.delta_percent", "attention.open_total"]),
    shopNames: new Set(),
    fetcher,
  });
}

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Responses client", () => {
  it("passes custom model and reasoning effort values into the structured-output request", () => {
    const body = buildResponsesBody({
      config: { model: "internal-company-model-v7", reasoningEffort: "custom-effort-level" },
      modelInput: { severity: "attention" },
    });

    expect(body).toMatchObject({
      model: "internal-company-model-v7",
      reasoning: { effort: "custom-effort-level" },
      store: false,
      max_output_tokens: 12000,
      text: {
        verbosity: "low",
        format: { type: "json_schema", name: "uo_executive_summary", strict: true },
      },
    });
  });

  it("derives an SDK baseURL without losing a custom path prefix", () => {
    expect(deriveOpenAIEndpoint("https://ai.example.test/custom/openai/v1/responses")).toEqual({
      baseURL: "https://ai.example.test/custom/openai/v1",
      endpoint: "https://ai.example.test/custom/openai/v1/responses",
    });
  });

  it("posts with no redirects and returns only validated summary plus usage", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "completed",
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: JSON.stringify(validSummary()) }],
            },
          ],
          usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await requestSummaryOnce({
      config: {
        apiUrl: "https://ai.example.test/v1/responses",
        apiKey: "secret",
        model: "gpt-5.6-luna",
        reasoningEffort: "xhigh",
        requestTimeout: 1000,
      },
      modelInput: {},
      metricKeys: new Set(["performance.traffic.delta_percent", "attention.open_total"]),
      shopNames: new Set(),
      fetcher,
    });

    expect(capturedRequest(fetcher).url).toBe("https://ai.example.test/v1/responses");
    expect(capturedRequest(fetcher).method).toBe("POST");
    expect(capturedRequest(fetcher).redirect).toBe("manual");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.usage.total_tokens).toBe(120);
    expect(result.summary.headline.ja).toBeTruthy();
  });

  it.each([
    [302, "model_http", false],
    [400, "model_http", false],
    [401, "configuration", false],
    [403, "configuration", false],
    [408, "model_http", true],
    [409, "model_http", true],
    [429, "model_http", true],
    [500, "model_http", true],
  ])("maps HTTP %i to %s retryable=%s", async (status, code, retryable) => {
    const fetcher = vi.fn(
      async () =>
        new Response("private-response-text", {
          status,
          headers: { location: "https://redirect.example.test" },
        }),
    );

    await expect(configuredRequest(fetcher)).rejects.toMatchObject({ code, retryable });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(capturedRequest(fetcher).redirect).toBe("manual");
    try {
      await configuredRequest(fetcher);
    } catch (error) {
      expect(String(error.message)).not.toMatch(/private-ai|private-secret|private-response-text|redirect/);
    }
  });

  it("maps an abort to a retryable model timeout", async () => {
    const fetcher = vi.fn(
      (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new DOMException("private request details", "AbortError")), {
            once: true,
          });
        }),
    );
    await expect(configuredRequest(fetcher)).rejects.toMatchObject({
      code: "model_timeout",
      retryable: true,
    });
  });

  it.each([
    {
      status: "incomplete",
      output: [],
    },
    {
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "refusal", refusal: "private refusal" }],
        },
      ],
    },
    {
      status: "completed",
      output: [],
    },
    {
      status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text: "{broken" }] }],
    },
  ])("rejects invalid completed payload %#", async (payload) => {
    const fetcher = vi.fn().mockResolvedValue(reply(payload));
    await expect(configuredRequest(fetcher)).rejects.toMatchObject({
      code: "model_schema",
      retryable: false,
    });
  });
});
