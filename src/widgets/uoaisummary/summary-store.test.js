import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { HASHED_CONFIGS } from "../../pages/api/hash-configs.mjs";
import { appendSnapshot, createSummaryStore, emptySummaryState, getSummaryStorePath } from "./summary-store.mjs";

let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "uo-ai-summary-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function persistedLatest() {
  return {
    severity: "attention",
    dataQuality: "partial",
    generatedAtJST: "2026-08-01 10:00:00 JST",
    sourceCoverage: { valid: 3, total: 4 },
    sourceFreshness: {
      shipping: { state: "fresh", updatedAtJST: "2026-08-01 09:59:00+09:00" },
      attention: { state: "delayed", updatedAtJST: "2026-08-01 09:50:00 JST" },
      sales: { state: "stale", updatedAtJST: "2026-08-01 09:45:00 JST" },
      performance: { state: "unavailable", updatedAtJST: null },
    },
    summary: {
      headline: { ja: "対応を確認してください。", zh: "请确认待办。" },
      assessment: { ja: "優先順を確認してください。", zh: "请确认优先级。" },
      evidence: [
        { metricKey: "attention.open_total", interpretation: { ja: "滞留があります。", zh: "存在积压。" } },
        { metricKey: "sales.orders", interpretation: { ja: "件数を確認してください。", zh: "请确认件数。" } },
      ],
      actions: [
        {
          priority: "high",
          module: "attention",
          shopName: null,
          title: { ja: "未対応を整理", zh: "梳理待办" },
          reason: { ja: "優先度を確認してください。", zh: "请确认优先级。" },
        },
      ],
      reviewThemes: [
        {
          theme: { ja: "配送", zh: "配送" },
          impact: { ja: "確認が必要", zh: "需要确认" },
          suggestion: { ja: "担当を確認", zh: "确认负责人" },
        },
      ],
    },
    metricDisplay: {
      "attention.open_total": { rawValue: 1, ja: "未対応 1件", zh: "待办 1件" },
      "sales.orders": { rawValue: 20, ja: "注文 20件", zh: "订单 20件" },
    },
  };
}

describe("summary store", () => {
  it("returns an empty versioned state when the cache is missing", () => {
    expect(createSummaryStore({ configDir: dir }).read()).toEqual(emptySummaryState());
  });

  it("isolates corrupt JSON and starts clean", () => {
    writeFileSync(getSummaryStorePath(dir), "{broken", "utf8");

    const state = createSummaryStore({ configDir: dir, now: () => 123 }).read();

    expect(state).toEqual(emptySummaryState());
    expect(readdirSync(dir)).toContain("uo-ai-summary.json.corrupt-123");
  });

  it("isolates structurally invalid latest data and resets its future deadline", () => {
    writeFileSync(
      getSummaryStorePath(dir),
      JSON.stringify({
        ...emptySummaryState(),
        latest: {
          severity: "normal",
          dataQuality: "complete",
          generatedAtJST: "2026-08-01 10:00:00 JST",
          sourceCoverage: { valid: 4, total: 4 },
          sourceFreshness: {},
          summary: { headline: null },
          metricDisplay: {},
        },
        nextScheduledAtJST: "2026-08-01 11:00:00 JST",
      }),
      "utf8",
    );

    const state = createSummaryStore({ configDir: dir, now: () => 456 }).read();

    expect(state).toEqual(emptySummaryState());
    expect(readdirSync(dir)).toContain("uo-ai-summary.json.corrupt-456");
  });

  it("atomically writes readable state without persisting running", () => {
    const store = createSummaryStore({ configDir: dir, now: () => 123 });
    store.write({ ...emptySummaryState(), running: true, lastAttemptAtJST: "2026-08-01 10:00:00 JST" });

    expect(store.read()).toMatchObject({ lastAttemptAtJST: "2026-08-01 10:00:00 JST" });
    expect(store.read()).not.toHaveProperty("running");
    expect(readdirSync(dir).some((name) => name.endsWith(".tmp"))).toBe(false);
  });

  it("keeps only the newest 24 compact snapshots", () => {
    let state = emptySummaryState();
    for (let index = 0; index < 30; index += 1) {
      state = appendSnapshot(state, {
        capturedAtJST: "2026-08-01 " + String(index).padStart(2, "0") + ":00:00 JST",
        metrics: { "sales.realtime_yen": index },
      });
    }

    expect(state.snapshots).toHaveLength(24);
    expect(state.snapshots[0].metrics["sales.realtime_yen"]).toBe(6);
    expect(state.snapshots[23].metrics["sales.realtime_yen"]).toBe(29);
  });

  it("does not serialize an Error as lastError", () => {
    const store = createSummaryStore({ configDir: dir });
    store.write({ ...emptySummaryState(), lastError: new Error("private failure") });

    expect(store.read().lastError).toBeNull();
  });

  it("writes only whitelisted nested summary, snapshot, and usage fields", () => {
    const store = createSummaryStore({ configDir: dir });
    const latest = persistedLatest();
    const nestedError = Object.assign(new Error("synthetic-error-message"), {
      details: "synthetic-error-details",
      apiKey: "synthetic-api-key",
    });
    latest.reviewSamples = [{ excerpt: "synthetic-review-text" }];
    latest.apiUrl = "https://synthetic.invalid/private";
    latest.modelInput = { request: "synthetic-model-request" };
    latest.rawResponse = { response: "synthetic-model-response", nestedError };
    latest.sourceFreshness.sales.url = "https://synthetic.invalid/source";
    latest.summary.evidence[0].review = "synthetic-review-text";
    latest.metricDisplay["sales.orders"].modelOutput = "synthetic-model-response";

    const snapshot = {
      capturedAtJST: "2026-08-01 10:00:00 JST",
      metrics: { "sales.orders": 20, "attention.open_total": 1, private_metric: "synthetic-review-text" },
      reviews: [{ excerpt: "synthetic-review-text" }],
      error: nestedError,
    };
    const usage = {
      input_tokens: 100,
      output_tokens: 20,
      total_tokens: 120,
      apiKey: "synthetic-api-key",
      rawRequest: "synthetic-model-request",
      rawResponse: "synthetic-model-response",
      error: nestedError,
    };

    store.write({ ...emptySummaryState(), latest, snapshots: [snapshot], usage });

    const onDisk = JSON.parse(readFileSync(getSummaryStorePath(dir), "utf8"));
    expect(onDisk.latest).toEqual(persistedLatest());
    expect(onDisk.snapshots).toEqual([
      { capturedAtJST: "2026-08-01 10:00:00 JST", metrics: { "sales.orders": 20, "attention.open_total": 1 } },
    ]);
    expect(onDisk.usage).toEqual({ input_tokens: 100, output_tokens: 20, total_tokens: 120 });
    expect(store.read()).toMatchObject({ latest: persistedLatest(), snapshots: onDisk.snapshots, usage: onDisk.usage });
    expect(JSON.stringify(onDisk)).not.toMatch(/synthetic-(?:api-key|error|model|review)|https:\/\/synthetic\.invalid/);
  });

  it("does not include the generated cache in the browser config hash", () => {
    expect(HASHED_CONFIGS).not.toContain("uo-ai-summary.json");
  });
});
