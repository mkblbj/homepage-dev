import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, it, vi } from "vitest";

import { buildAnalysisInput } from "./analysis-input.mjs";
import { requestSummaryOnce } from "./responses-client.mjs";
import { collectBusinessSources } from "./source-client.mjs";
import { createSummaryService } from "./summary-service.mjs";
import { createSummaryStore } from "./summary-store.mjs";

const FIXED_NOW = Date.parse("2026-08-01T10:00:00+09:00");
const directories = [];

afterEach(() => {
  vi.restoreAllMocks();
  directories.splice(0).forEach((directory) => {
    rmSync(directory, { recursive: true, force: true });
  });
});

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function validBilingualSummary() {
  return {
    headline: { ja: "運営対応に注意が必要です。", zh: "运营事项需要关注。" },
    assessment: { ja: "待機案件を優先してください。", zh: "请优先处理待办。" },
    actions: [
      {
        priority: "high",
        module: "attention",
        shopName: null,
        metricKey: "attention.open_total",
        title: { ja: "待機案件を整理", zh: "梳理待办" },
        reason: { ja: "優先順を確認してください。", zh: "请确认优先级。" },
      },
    ],
  };
}

function completedModelResponse() {
  return reply({
    status: "completed",
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify(validBilingualSummary()),
          },
        ],
      },
    ],
    usage: { input_tokens: 100, output_tokens: 30, total_tokens: 130 },
  });
}

function integrationConfiguration(overrides = {}) {
  return {
    ai: {
      apiUrl: "https://synthetic-ai.invalid/v1/responses",
      apiKey: "synthetic-integration-key",
      model: "gpt-5.6-luna",
      reasoningEffort: "xhigh",
      generationInterval: 3600000,
      manualCooldown: 600000,
      requestTimeout: 180000,
      ...overrides,
    },
    sources: {
      shipping: {
        widget: {
          type: "uoshippingdashboard",
          url: "https://synthetic-shipping.invalid/api/dashboard/homepage",
        },
        error: null,
      },
      attention: {
        widget: { type: "uoattention", url: "https://synthetic-commerce.invalid" },
        error: null,
      },
      sales: {
        widget: { type: "uorakutensales", url: "https://synthetic-commerce.invalid" },
        error: null,
      },
      performance: {
        widget: { type: "uoperformance", url: "https://synthetic-commerce.invalid" },
        error: null,
      },
    },
  };
}

function shippingFixture() {
  return {
    updated_at: "2026-08-01T09:59:00+09:00",
    today_output: {
      total_quantity: 749,
      shops_count: 7,
      active_shops_count: 6,
      shops: [{ shop_name: "3911", total_quantity: 317 }],
    },
    yesterday_output: { date: "2026-07-31", total_quantity: 962, shops: [] },
    yesterday_shipping: {
      date: "2026-07-31",
      total_quantity: 898,
      couriers: [],
    },
    today_shipping: { date: "2026-08-01", total_quantity: 898, couriers: [] },
    tomorrow_output: {
      date: "2026-08-02",
      total_quantity: 962,
      total_predicted_quantity: 0,
      shops: [],
    },
  };
}

function attentionFixtureWithPrivateReview() {
  return {
    generatedAtJST: "2026-08-01 09:50:00 JST",
    status: "attention",
    partial: false,
    summary: {
      pendingOrderCount: 0,
      unansweredInquiryCount: 32,
      overdueInquiryCount: 0,
      unrepliedReviewCount: 32,
      reviewCountByRating: { 1: 4, 2: 8, 3: 20 },
    },
    shops: [{ shopName: "3911", unrepliedReviewCount: 30, status: "critical" }],
    recentReviews: [
      {
        reviewId: "synthetic-private-review-id",
        shopName: "3911",
        rating: 1,
        postedAtJST: "2026-08-01 09:00 JST",
        itemManagementNumber: "safe-item-id",
        excerpt: "buyer@synthetic.invalid 090-0000-0000 注文番号 TEST-12345 https://review.synthetic.invalid/private",
        reviewUrl: "https://review.synthetic.invalid/synthetic-private-review-id",
      },
    ],
  };
}

function salesFixture() {
  return {
    generatedAtJST: "2026-08-01 09:45:00 JST",
    totals: { salesYen: 100000, orderCount: 20, averageOrderValueYen: 5000 },
    shops: [{ shopName: "3911", salesYen: 70000, orderCount: 14 }],
  };
}

function historyFixture() {
  return {
    totals: { salesYen: 700000, orderCount: 140, conversionRate: 3.2 },
    shops: [],
    range: { dates: ["2026-07-25", "2026-08-01"] },
  };
}

function rankingFixture() {
  return {
    generatedAtJST: "2026-08-01 09:45:00 JST",
    rankings: {
      sales: [{ itemManagementNumber: "item-a", title: "A", rank: 1 }],
      orderCount: [{ itemManagementNumber: "item-a", title: "A", rank: 1 }],
      units: [{ itemManagementNumber: "item-b", title: "B", rank: 1 }],
    },
  };
}

function performanceFixture() {
  return {
    generatedAtJST: "2026-08-01 09:40:00 JST",
    partial: false,
    traffic: {
      status: "attention",
      dataDateJST: "2026-07-31",
      visitCount: 15658,
      uniqueVisitorCount: 14624,
      expectedVisitCount: 22696.5,
      visitDeltaPercent: -31.8,
      sampleCount: 4,
      daily: [],
    },
    customerMix: {
      new: { salesYen: 1000, orderCount: 10, salesSharePercent: 85.8 },
      repeat: { salesYen: 200, orderCount: 2, salesSharePercent: 14.2 },
    },
    shops: [
      {
        shopName: "3911",
        status: "critical",
        traffic: { visitCount: 4771, visitDeltaPercent: -20, sampleCount: 4 },
        customerMix: { new: { salesSharePercent: 80 } },
      },
    ],
  };
}

function persistedReadyState() {
  return {
    version: 1,
    latest: {
      severity: "normal",
      dataQuality: "complete",
      generatedAtJST: "2026-08-01 09:00:00 JST",
      sourceCoverage: { valid: 4, total: 4 },
      sourceFreshness: {
        shipping: { state: "fresh", updatedAtJST: "2026-08-01 09:59:00 JST" },
        attention: { state: "fresh", updatedAtJST: "2026-08-01 09:50:00 JST" },
        sales: { state: "fresh", updatedAtJST: "2026-08-01 09:45:00 JST" },
        performance: { state: "fresh", updatedAtJST: "2026-08-01 09:40:00 JST" },
      },
      summary: validBilingualSummary(),
      metrics: [],
    },
    snapshots: [],
    lastAttemptAtJST: "2026-08-01 09:00:00 JST",
    manualCooldownUntilJST: null,
    nextScheduledAtJST: "2026-08-01 09:00:00 JST",
    lastError: null,
    usage: null,
  };
}

function toJST(timestamp) {
  if (timestamp === FIXED_NOW + 3600000) return "2026-08-01 11:00:00 JST";
  if (timestamp === FIXED_NOW + 600000) return "2026-08-01 10:10:00 JST";
  return "2026-08-01 10:00:00 JST";
}

function requestFrom(input, init) {
  return input instanceof Request ? input : new Request(input, init);
}

function sourceName(url) {
  if (url.includes("synthetic-shipping.invalid")) return "shipping";
  if (url.endsWith("/api/attention")) return "attention";
  if (url.endsWith("/api/performance")) return "performance";
  return "sales";
}

function integrationDependencies({ configuration, store, fetcher }) {
  const handles = new Set();
  return {
    loadConfiguration: vi.fn(async () => configuration),
    collectSources: (sources, options) => collectBusinessSources(sources, { ...options, fetcher }),
    buildAnalysisInput,
    requestSummaryOnce: (options) => requestSummaryOnce({ ...options, fetcher }),
    store,
    clock: { now: () => FIXED_NOW, toJST },
    timers: {
      setTimeout: vi.fn((callback) => {
        const handle = { callback, unref: vi.fn() };
        handles.add(handle);
        return handle;
      }),
      clearTimeout: vi.fn((handle) => handles.delete(handle)),
    },
    logger: { error: vi.fn(), info: vi.fn() },
  };
}

function integrationHarness({ failedSources = {}, persisted = null, modelResponses = [], ai = {} } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "uo-ai-summary-integration-"));
  directories.push(directory);
  const configuration = integrationConfiguration(ai);
  const queuedModelResponses = [...modelResponses];
  const modelRequestBodies = [];
  let modelRequestCount = 0;

  const fetcher = vi.fn(async (input, init) => {
    const request = requestFrom(input, init);
    if (request.url === configuration.ai.apiUrl) {
      modelRequestCount += 1;
      modelRequestBodies.push(await request.clone().json());
      const planned = queuedModelResponses.shift();
      if (planned === "timeout") {
        return new Promise((_resolve, reject) => {
          const abort = () => reject(new DOMException("synthetic timeout", "AbortError"));
          if (request.signal.aborted) abort();
          else request.signal.addEventListener("abort", abort, { once: true });
        });
      }
      return planned || completedModelResponse();
    }

    const source = sourceName(request.url);
    if (failedSources[source] === "timeout") {
      throw new DOMException("synthetic timeout", "AbortError");
    }
    if (failedSources[source]) {
      throw new TypeError("synthetic source failure");
    }
    if (source === "shipping") return reply(shippingFixture());
    if (source === "attention") return reply(attentionFixtureWithPrivateReview());
    if (source === "performance") return reply(performanceFixture());
    if (request.url.endsWith("/api/history/sales")) return reply(historyFixture());
    if (request.url.endsWith("/api/item-rankings")) return reply(rankingFixture());
    return reply(salesFixture());
  });

  const store = createSummaryStore({ configDir: directory });
  if (persisted) store.write(persisted);
  const dependencies = integrationDependencies({ configuration, store, fetcher });
  const service = createSummaryService(dependencies);

  return {
    configuration,
    fetcher,
    modelRequestBodies,
    service,
    store,
    modelRequestCount: () => modelRequestCount,
  };
}

async function waitForState(service, expected) {
  await vi.waitFor(() => {
    expect(service.getPublicState().state).toBe(expected);
  });
}

it("collects, compacts, validates, persists, restores, and exposes only public state", async () => {
  const externalFetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected external request"));
  const harness = integrationHarness();

  await harness.service.initialize();
  await waitForState(harness.service, "ready");

  const publicState = harness.service.getPublicState();
  const publicJson = JSON.stringify(publicState);
  const cacheJson = JSON.stringify(harness.store.read());
  const modelInput = JSON.parse(harness.modelRequestBodies[0].input);
  const privateMarkers = [
    "synthetic-integration-key",
    "https://synthetic-ai.invalid/v1/responses",
    "synthetic-private-review-id",
    "buyer@synthetic.invalid",
    "090-0000-0000",
    "TEST-12345",
    "https://review.synthetic.invalid/private",
  ];

  expect(publicState).toMatchObject({
    state: "ready",
    severity: "attention",
    dataQuality: "complete",
    sourceCoverage: { valid: 4, total: 4 },
    summary: validBilingualSummary(),
  });
  expect(modelInput.reviewSamples[0].excerpt).toContain("buyer@synthetic.invalid");
  expect(modelInput.reviewSamples[0].excerpt).toContain("090-0000-0000");
  expect(modelInput.reviewSamples[0].excerpt).toContain("TEST-12345");
  expect(modelInput.reviewSamples[0].excerpt).toContain("https://review.synthetic.invalid/private");
  for (const marker of privateMarkers) {
    expect(publicJson).not.toContain(marker);
    expect(cacheJson).not.toContain(marker);
  }
  expect(publicJson).not.toMatch(/apiKey|apiUrl|model|reasoningEffort|gpt-5\.6-luna/);
  expect(externalFetch).not.toHaveBeenCalled();

  const requestCountBeforeRestore = harness.fetcher.mock.calls.length;
  const restoredService = createSummaryService(
    integrationDependencies({
      configuration: harness.configuration,
      store: harness.store,
      fetcher: harness.fetcher,
    }),
  );
  await restoredService.initialize();

  expect(restoredService.getPublicState()).toMatchObject({
    state: "ready",
    summary: publicState.summary,
    nextScheduledAtJST: "2026-08-01 11:00:00 JST",
  });
  expect(harness.fetcher).toHaveBeenCalledTimes(requestCountBeforeRestore);
  restoredService.stop();
  harness.service.stop();
});

it("keeps a partial summary when one source times out", async () => {
  const externalFetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected external request"));
  const harness = integrationHarness({ failedSources: { shipping: "timeout" } });

  await harness.service.initialize();
  await waitForState(harness.service, "partial");

  expect(harness.service.getPublicState()).toMatchObject({
    state: "partial",
    dataQuality: "partial",
    sourceCoverage: { valid: 3, total: 4 },
    sourceFreshness: { shipping: { state: "unavailable", updatedAtJST: null } },
  });
  expect(harness.modelRequestCount()).toBe(1);
  expect(externalFetch).not.toHaveBeenCalled();
  harness.service.stop();
});

it("skips the model when fewer than two sources remain", async () => {
  const externalFetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected external request"));
  const harness = integrationHarness({
    failedSources: { attention: "failed", sales: "failed", performance: "failed" },
  });

  await harness.service.initialize();
  await waitForState(harness.service, "error");

  expect(harness.service.getPublicState()).toMatchObject({
    state: "error",
    dataQuality: "insufficient",
    sourceCoverage: { valid: 1, total: 4 },
    summary: null,
    lastError: "source_unavailable",
  });
  expect(harness.modelRequestCount()).toBe(0);
  expect(externalFetch).not.toHaveBeenCalled();
  harness.service.stop();
});

it("retries one model timeout and publishes the successful response", async () => {
  const externalFetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected external request"));
  const harness = integrationHarness({
    ai: { requestTimeout: 20 },
    modelResponses: ["timeout", completedModelResponse()],
  });

  await harness.service.initialize();
  await waitForState(harness.service, "ready");

  expect(harness.modelRequestCount()).toBe(2);
  expect(harness.service.getPublicState()).toMatchObject({
    state: "ready",
    lastError: null,
    summary: validBilingualSummary(),
  });
  expect(externalFetch).not.toHaveBeenCalled();
  harness.service.stop();
});

it("keeps the last good summary stale after two retryable model failures", async () => {
  const externalFetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected external request"));
  const harness = integrationHarness({
    persisted: persistedReadyState(),
    modelResponses: [reply({}, 500), reply({}, 500)],
  });

  await harness.service.initialize();
  await waitForState(harness.service, "stale");

  expect(harness.service.getPublicState()).toMatchObject({
    state: "stale",
    dataQuality: "stale",
    summary: persistedReadyState().latest.summary,
    lastError: "model_http",
  });
  expect(harness.modelRequestCount()).toBe(2);
  expect(externalFetch).not.toHaveBeenCalled();
  harness.service.stop();
});
