import { describe, expect, it, vi } from "vitest";

import { createSummaryService } from "./summary-service.mjs";
import { emptySummaryState } from "./summary-store.mjs";

const FIXED_NOW = Date.parse("2026-08-01T10:00:00+09:00");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function validSummary() {
  return {
    headline: { ja: "対応を確認してください。", zh: "请确认待办。" },
    assessment: { ja: "運営対応を優先してください。", zh: "请优先处理运营事项。" },
    actions: [
      {
        priority: "high",
        module: "attention",
        shopName: null,
        metricKey: "attention.open_total",
        title: { ja: "未対応を整理", zh: "梳理待办" },
        reason: { ja: "優先順を確認してください。", zh: "请确认优先级。" },
      },
    ],
  };
}

function persistedState(overrides = {}) {
  return {
    version: 1,
    latest: {
      severity: "attention",
      dataQuality: "complete",
      generatedAtJST: "2026-08-01 09:00:00 JST",
      sourceCoverage: { valid: 4, total: 4 },
      sourceFreshness: {
        shipping: { state: "fresh", updatedAtJST: "2026-08-01 09:59:00 JST" },
        attention: { state: "fresh", updatedAtJST: "2026-08-01 09:50:00 JST" },
        sales: { state: "fresh", updatedAtJST: "2026-08-01 09:45:00 JST" },
        performance: { state: "fresh", updatedAtJST: "2026-08-01 07:00:00 JST" },
      },
      summary: validSummary(),
      metrics: [],
    },
    snapshots: [],
    lastAttemptAtJST: null,
    manualCooldownUntilJST: null,
    nextScheduledAtJST: "2026-08-01 11:00:00 JST",
    lastError: null,
    usage: null,
    ...overrides,
  };
}

function analysisBundle({ valid = 4, dataQuality = "complete" } = {}) {
  return {
    severity: valid < 2 ? "unknown" : "attention",
    dataQuality,
    sourceCoverage: { valid, total: 4 },
    sourceFreshness: {
      shipping: { state: "fresh", updatedAtJST: "2026-08-01 09:59:00 JST" },
      attention: { state: "fresh", updatedAtJST: "2026-08-01 09:50:00 JST" },
      sales: { state: "fresh", updatedAtJST: "2026-08-01 09:45:00 JST" },
      performance: { state: "fresh", updatedAtJST: "2026-08-01 07:00:00 JST" },
    },
    metrics: {
      "attention.open_total": { value: 1 },
      "performance.traffic.delta_percent": { value: -10 },
    },
    modelInput: { severity: "attention" },
    snapshot: { capturedAtJST: "2026-08-01 10:00:00 JST", metrics: {} },
  };
}

function serviceDependencies(options = {}) {
  let state = structuredClone(options.persisted || persistedState());
  const scheduled = new Set();
  const configuration = {
    ai: {
      apiUrl: "https://ai.example.test/v1/responses",
      apiKey: "secret",
      model: "gpt-5.6-luna",
      reasoningEffort: "xhigh",
      generationInterval: 3600000,
      manualCooldown: 600000,
      requestTimeout: 180000,
    },
    sources: {},
  };
  const deps = {
    loadConfiguration: options.loadConfiguration || vi.fn(async () => configuration),
    collectSources: vi.fn(async () => ({})),
    buildAnalysisInput: vi.fn(() => options.analysis || analysisBundle()),
    requestSummaryOnce: options.requestSummaryOnce || vi.fn(async () => ({ summary: validSummary(), usage: null })),
    store: {
      read: vi.fn(() => structuredClone(state)),
      write: vi.fn((next) => {
        state = structuredClone(next);
        return structuredClone(state);
      }),
    },
    clock: {
      now: () => options.now ?? FIXED_NOW,
      toJST: (timestamp) =>
        timestamp === FIXED_NOW + 600000
          ? "2026-08-01 10:10:00 JST"
          : timestamp === FIXED_NOW + 3600000
            ? "2026-08-01 11:00:00 JST"
            : "2026-08-01 10:00:00 JST",
    },
    timers: {
      setTimeout: vi.fn((callback) => {
        const handle = { callback, unref: vi.fn() };
        scheduled.add(handle);
        return handle;
      }),
      clearTimeout: vi.fn((handle) => scheduled.delete(handle)),
    },
    logger: { error: vi.fn(), info: vi.fn() },
  };
  deps.configuration = configuration;
  deps.flush = async () => {
    for (let turn = 0; turn < 12; turn += 1) await Promise.resolve();
  };
  return deps;
}

describe("summary generation service", () => {
  it("restores cached summary and submits one overdue background generation", async () => {
    const run = deferred();
    const deps = serviceDependencies({
      persisted: persistedState({ nextScheduledAtJST: "2026-08-01 09:00:00 JST" }),
      requestSummaryOnce: vi.fn(() => run.promise),
    });
    const service = createSummaryService(deps);

    await service.initialize();
    await deps.flush();
    expect(service.getPublicState()).toMatchObject({
      state: "running",
      summary: expect.any(Object),
    });
    expect(deps.requestSummaryOnce).toHaveBeenCalledTimes(1);

    run.resolve({ summary: validSummary(), usage: { total_tokens: 100 } });
    await deps.flush();
    expect(service.getPublicState().state).toBe("ready");
  });

  it("generates immediately for a new empty cache despite a future deadline", async () => {
    const run = deferred();
    const deps = serviceDependencies({
      persisted: {
        ...emptySummaryState(),
        nextScheduledAtJST: "2026-08-01 11:00:00 JST",
      },
      requestSummaryOnce: vi.fn(() => run.promise),
    });
    const service = createSummaryService(deps);

    await service.initialize();
    await deps.flush();

    expect(service.getPublicState()).toMatchObject({
      state: "running",
      summary: null,
      lastError: null,
    });
    expect(deps.requestSummaryOnce).toHaveBeenCalledTimes(1);
    expect(deps.timers.setTimeout).not.toHaveBeenCalled();

    run.resolve({ summary: validSummary(), usage: null });
    await deps.flush();
  });

  it("regenerates immediately when a future-dated latest record has no usable summary", async () => {
    const deps = serviceDependencies({
      persisted: persistedState({
        latest: { ...persistedState().latest, summary: null },
        nextScheduledAtJST: "2026-08-01 11:00:00 JST",
      }),
    });
    const service = createSummaryService(deps);

    await service.initialize();
    await deps.flush();

    expect(deps.collectSources).toHaveBeenCalledTimes(1);
    expect(deps.requestSummaryOnce).toHaveBeenCalledTimes(1);
    expect(service.getPublicState().state).toBe("ready");
  });

  it("initializes idempotently and schedules a future automatic refresh", async () => {
    const deps = serviceDependencies();
    const service = createSummaryService(deps);

    await service.initialize();
    await service.initialize();

    expect(deps.loadConfiguration).toHaveBeenCalledTimes(1);
    expect(deps.requestSummaryOnce).not.toHaveBeenCalled();
    expect(deps.timers.setTimeout).toHaveBeenCalledTimes(1);
    expect(deps.timers.setTimeout.mock.calls[0][1]).toBe(3600000);

    deps.timers.setTimeout.mock.calls[0][0]();
    await deps.flush();
    expect(deps.requestSummaryOnce).toHaveBeenCalledTimes(1);
  });

  it("shares one pending initialization promise before allowing refresh", async () => {
    const configurationRun = deferred();
    const deps = serviceDependencies();
    deps.loadConfiguration = vi.fn(() => configurationRun.promise);
    const service = createSummaryService(deps);

    const first = service.initialize();
    const second = service.initialize();
    let secondSettled = false;
    second.then(() => {
      secondSettled = true;
    });

    expect(second).toBe(first);
    await deps.flush();
    expect(secondSettled).toBe(false);

    configurationRun.resolve(deps.configuration);
    await Promise.all([first, second]);
    expect(deps.loadConfiguration).toHaveBeenCalledTimes(1);
    expect(service.requestRefresh({ manual: true }).accepted).toBe(true);
    await deps.flush();
  });

  it("allows initialization to retry after configuration loading fails", async () => {
    const failure = Object.assign(new Error("bad configuration"), {
      code: "configuration",
      retryable: false,
    });
    const deps = serviceDependencies();
    deps.loadConfiguration = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(deps.configuration);
    const service = createSummaryService(deps);

    const first = service.initialize();
    await expect(first).rejects.toBe(failure);

    const second = service.initialize();
    expect(second).not.toBe(first);
    await expect(second).resolves.toBe(deps.configuration);
    expect(deps.loadConfiguration).toHaveBeenCalledTimes(2);
    expect(service.requestRefresh({ manual: true }).accepted).toBe(true);
    await deps.flush();
  });

  it("returns synchronously without waiting for the model", async () => {
    const run = deferred();
    const deps = serviceDependencies({ requestSummaryOnce: vi.fn(() => run.promise) });
    const service = createSummaryService(deps);
    await service.initialize();

    const result = service.requestRefresh({ manual: true });

    expect(result).toEqual({
      accepted: true,
      state: "running",
      cooldownUntilJST: "2026-08-01 10:10:00 JST",
    });
    expect(result).not.toBeInstanceOf(Promise);
    expect(service.getPublicState().state).toBe("running");

    run.resolve({ summary: validSummary(), usage: null });
    await deps.flush();
  });

  it("turns a manual cooldown persistence failure into a safe cache error", async () => {
    const deps = serviceDependencies();
    deps.store.write.mockImplementationOnce(() => {
      throw new Error("synthetic cache write failure");
    });
    const service = createSummaryService(deps);
    await service.initialize();

    let result;
    expect(() => {
      result = service.requestRefresh({ manual: true });
    }).not.toThrow();

    expect(result).toEqual({
      accepted: false,
      state: "error",
      cooldownUntilJST: null,
    });
    expect(deps.requestSummaryOnce).not.toHaveBeenCalled();
    expect(service.getPublicState()).toMatchObject({
      state: "stale",
      cooldownUntilJST: null,
      lastError: "cache",
    });
  });

  it("merges automatic and manual requests into one active promise", async () => {
    const run = deferred();
    const deps = serviceDependencies({ requestSummaryOnce: vi.fn(() => run.promise) });
    const service = createSummaryService(deps);
    await service.initialize();

    const first = service.requestRefresh({ manual: true });
    const second = service.requestRefresh({ manual: false });
    await deps.flush();

    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(false);
    expect(deps.requestSummaryOnce).toHaveBeenCalledTimes(1);

    run.resolve({ summary: validSummary(), usage: null });
    await deps.flush();
  });

  it("keeps the displayed cached summary metadata coherent while a new analysis is running", async () => {
    const run = deferred();
    const oldLatest = {
      ...persistedState().latest,
      severity: "normal",
      dataQuality: "complete",
      sourceCoverage: { valid: 4, total: 4 },
      metrics: [
        {
          key: "attention.open_total",
          unit: "count",
          value: 7,
          previousValue: null,
          delta: null,
          deltaPercent: null,
          note: null,
        },
      ],
    };
    const pendingAnalysis = analysisBundle({ valid: 2, dataQuality: "partial" });
    pendingAnalysis.severity = "critical";
    pendingAnalysis.sourceFreshness = {
      shipping: { state: "unavailable", updatedAtJST: null },
      attention: { state: "unavailable", updatedAtJST: null },
      sales: { state: "fresh", updatedAtJST: "2026-08-01 10:00:00 JST" },
      performance: { state: "fresh", updatedAtJST: "2026-08-01 10:00:00 JST" },
    };
    const deps = serviceDependencies({
      persisted: persistedState({ latest: oldLatest }),
      analysis: pendingAnalysis,
      requestSummaryOnce: vi.fn(() => run.promise),
    });
    const service = createSummaryService(deps);
    await service.initialize();

    service.requestRefresh({ manual: false });
    await deps.flush();

    expect(service.getPublicState()).toMatchObject({
      state: "running",
      severity: "normal",
      dataQuality: "complete",
      sourceCoverage: { valid: 4, total: 4 },
      sourceFreshness: oldLatest.sourceFreshness,
      summary: oldLatest.summary,
      metrics: oldLatest.metrics,
    });

    run.resolve({ summary: validSummary(), usage: null });
    await deps.flush();
  });

  it("enforces persisted manual cooldown with a 429-ready deadline", async () => {
    const deps = serviceDependencies({
      persisted: persistedState({
        manualCooldownUntilJST: "2026-08-01 10:10:00 JST",
      }),
      now: Date.parse("2026-08-01T10:05:00+09:00"),
    });
    const service = createSummaryService(deps);
    await service.initialize();

    expect(service.requestRefresh({ manual: true })).toEqual({
      accepted: false,
      state: "cooldown",
      cooldownUntilJST: "2026-08-01 10:10:00 JST",
    });
  });

  it("does not call the model with fewer than two valid sources", async () => {
    const deps = serviceDependencies({
      persisted: persistedState({ latest: null }),
      analysis: analysisBundle({ valid: 1, dataQuality: "insufficient" }),
    });
    const service = createSummaryService(deps);
    await service.initialize();
    service.requestRefresh({ manual: false });
    await deps.flush();

    expect(deps.requestSummaryOnce).not.toHaveBeenCalled();
    expect(service.getPublicState()).toMatchObject({
      state: "error",
      dataQuality: "insufficient",
      lastError: "source_unavailable",
    });
  });

  it("does not call the model with fewer than two non-null evidence metrics", async () => {
    const analysis = analysisBundle();
    analysis.metrics = {
      "attention.open_total": { value: 3 },
      "performance.traffic.delta_percent": { value: null },
    };
    const deps = serviceDependencies({
      persisted: persistedState({ latest: null }),
      analysis,
    });
    const service = createSummaryService(deps);

    await service.initialize();
    await deps.flush();

    expect(deps.requestSummaryOnce).not.toHaveBeenCalled();
    expect(service.getPublicState()).toMatchObject({
      state: "error",
      lastError: "source_unavailable",
    });
  });

  it("publishes partial state when only three sources are usable", async () => {
    const deps = serviceDependencies({
      analysis: analysisBundle({ valid: 3, dataQuality: "partial" }),
    });
    const service = createSummaryService(deps);
    await service.initialize();

    service.requestRefresh({ manual: false });
    await deps.flush();

    expect(deps.requestSummaryOnce).toHaveBeenCalledTimes(1);
    expect(service.getPublicState()).toMatchObject({
      state: "partial",
      dataQuality: "partial",
      sourceCoverage: { valid: 3, total: 4 },
    });
  });

  it("passes only non-null metric keys required by minimal model validation", async () => {
    const analysis = analysisBundle({ valid: 2, dataQuality: "partial" });
    analysis.modelInput = {
      modules: {
        shipping: null,
        attention: {},
        sales: null,
        performance: {},
      },
      shops: [],
      reviewSamples: [{ excerpt: "synthetic review" }],
    };
    const deps = serviceDependencies({ analysis });
    const service = createSummaryService(deps);

    await service.initialize();
    service.requestRefresh({ manual: false });
    await deps.flush();

    expect(deps.requestSummaryOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        metricKeys: new Set(["attention.open_total", "performance.traffic.delta_percent"]),
      }),
    );
    expect(deps.requestSummaryOnce.mock.calls[0][0]).not.toHaveProperty("availableModules");
    expect(deps.requestSummaryOnce.mock.calls[0][0]).not.toHaveProperty("hasReviewSamples");
  });

  it("retries one retryable model failure and never retries configuration failures", async () => {
    const retryable = Object.assign(new Error("temporary"), {
      code: "model_http",
      retryable: true,
    });
    const requestSummaryOnce = vi
      .fn()
      .mockRejectedValueOnce(retryable)
      .mockResolvedValueOnce({ summary: validSummary(), usage: null });
    const deps = serviceDependencies({ requestSummaryOnce });
    const service = createSummaryService(deps);
    await service.initialize();
    service.requestRefresh({ manual: false });
    await deps.flush();
    expect(requestSummaryOnce).toHaveBeenCalledTimes(2);

    const configuration = Object.assign(new Error("bad key"), {
      code: "configuration",
      retryable: false,
    });
    const nonRetryingRequest = vi.fn().mockRejectedValue(configuration);
    const nonRetryingDeps = serviceDependencies({
      requestSummaryOnce: nonRetryingRequest,
    });
    const nonRetryingService = createSummaryService(nonRetryingDeps);
    await nonRetryingService.initialize();
    nonRetryingService.requestRefresh({ manual: false });
    await nonRetryingDeps.flush();
    expect(nonRetryingRequest).toHaveBeenCalledTimes(1);
  });

  it("stops after the single allowed retry when both model attempts fail", async () => {
    const retryable = Object.assign(new Error("temporary"), {
      code: "model_http",
      retryable: true,
    });
    const requestSummaryOnce = vi.fn().mockRejectedValue(retryable);
    const deps = serviceDependencies({ requestSummaryOnce });
    const service = createSummaryService(deps);
    await service.initialize();

    service.requestRefresh({ manual: false });
    await deps.flush();

    expect(requestSummaryOnce).toHaveBeenCalledTimes(2);
    expect(service.getPublicState()).toMatchObject({
      state: "stale",
      lastError: "model_http",
    });
  });

  it("consumes a final cache write failure, keeps the durable summary stale, and clears single-flight", async () => {
    const deps = serviceDependencies();
    deps.store.write.mockImplementationOnce(() => {
      throw new Error("synthetic cache write failure");
    });
    const service = createSummaryService(deps);
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);

    try {
      await service.initialize();
      service.requestRefresh({ manual: false });
      await deps.flush();
      await new Promise((resolve) => setImmediate(resolve));

      expect(unhandled).not.toHaveBeenCalled();
      expect(service.getPublicState()).toMatchObject({
        state: "stale",
        summary: persistedState().latest.summary,
        lastError: "cache",
      });
      expect(service.requestRefresh({ manual: false })).toMatchObject({
        accepted: true,
        state: "running",
      });
      await deps.flush();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("keeps every stale field from the last good summary after a failed generation", async () => {
    const failure = Object.assign(new Error("bad output"), {
      code: "model_schema",
      retryable: false,
    });
    const oldMetrics = [
      {
        key: "attention.open_total",
        unit: "count",
        value: 7,
        previousValue: null,
        delta: null,
        deltaPercent: null,
        note: null,
      },
    ];
    const oldLatest = {
      ...persistedState().latest,
      severity: "normal",
      sourceCoverage: { valid: 4, total: 4 },
      metrics: oldMetrics,
    };
    const newAnalysis = analysisBundle({ valid: 2, dataQuality: "partial" });
    newAnalysis.severity = "critical";
    newAnalysis.sourceFreshness = {
      shipping: { state: "unavailable", updatedAtJST: null },
      attention: { state: "unavailable", updatedAtJST: null },
      sales: { state: "fresh", updatedAtJST: "2026-08-01 10:00:00 JST" },
      performance: { state: "fresh", updatedAtJST: "2026-08-01 10:00:00 JST" },
    };
    const deps = serviceDependencies({
      persisted: persistedState({ latest: oldLatest }),
      analysis: newAnalysis,
      requestSummaryOnce: vi.fn().mockRejectedValue(failure),
    });
    const service = createSummaryService(deps);
    await service.initialize();

    service.requestRefresh({ manual: false });
    await deps.flush();

    expect(service.getPublicState()).toMatchObject({
      state: "stale",
      severity: "normal",
      dataQuality: "stale",
      generatedAtJST: "2026-08-01 09:00:00 JST",
      sourceCoverage: { valid: 4, total: 4 },
      sourceFreshness: oldLatest.sourceFreshness,
      summary: oldLatest.summary,
      metrics: oldMetrics,
      lastError: "model_schema",
      nextScheduledAtJST: "2026-08-01 11:00:00 JST",
    });
  });

  it("restores a persisted failed summary as stale after restart", async () => {
    const deps = serviceDependencies({
      persisted: persistedState({ lastError: "model_http" }),
    });
    const service = createSummaryService(deps);

    await service.initialize();

    expect(service.getPublicState()).toMatchObject({
      state: "stale",
      dataQuality: "stale",
      summary: validSummary(),
      lastError: "model_http",
    });
  });

  it("restores an error without a summary and respects its future retry deadline", async () => {
    const deps = serviceDependencies({
      persisted: persistedState({
        latest: null,
        lastError: "model_http",
        nextScheduledAtJST: "2026-08-01 11:00:00 JST",
      }),
    });
    const service = createSummaryService(deps);

    await service.initialize();
    await deps.flush();

    expect(service.getPublicState()).toMatchObject({
      state: "error",
      summary: null,
      generatedAtJST: null,
      lastError: "model_http",
      nextScheduledAtJST: "2026-08-01 11:00:00 JST",
    });
    expect(deps.collectSources).not.toHaveBeenCalled();
    expect(deps.requestSummaryOnce).not.toHaveBeenCalled();
    expect(deps.timers.setTimeout).toHaveBeenCalledTimes(1);
    expect(deps.timers.setTimeout.mock.calls[0][1]).toBe(3600000);
  });

  it("resets the hourly schedule after a successful manual refresh", async () => {
    const deps = serviceDependencies({
      persisted: persistedState({ nextScheduledAtJST: "2026-08-01 10:30:00 JST" }),
    });
    const service = createSummaryService(deps);
    await service.initialize();

    service.requestRefresh({ manual: true });
    await deps.flush();

    expect(service.getPublicState()).toMatchObject({
      state: "ready",
      nextScheduledAtJST: "2026-08-01 11:00:00 JST",
      cooldownUntilJST: "2026-08-01 10:10:00 JST",
    });
    expect(deps.timers.clearTimeout).toHaveBeenCalledTimes(1);
    expect(deps.timers.setTimeout.mock.calls.at(-1)[1]).toBe(3600000);
  });

  it("returns a detached public whitelist without configuration or model internals", async () => {
    const analysis = analysisBundle();
    analysis.modelInput.privatePrompt = "MODEL_INPUT_PRIVATE";
    const deps = serviceDependencies({
      analysis,
      requestSummaryOnce: vi.fn(async () => ({
        summary: validSummary(),
        usage: { total_tokens: 100 },
        rawOutput: "RAW_OUTPUT_PRIVATE",
      })),
    });
    const service = createSummaryService(deps);
    await service.initialize();
    service.requestRefresh({ manual: false });
    await deps.flush();

    const first = service.getPublicState();
    expect(Object.keys(first).sort()).toEqual(
      [
        "cooldownUntilJST",
        "dataQuality",
        "generatedAtJST",
        "lastError",
        "metrics",
        "nextScheduledAtJST",
        "severity",
        "sourceCoverage",
        "sourceFreshness",
        "state",
        "summary",
      ].sort(),
    );
    expect(JSON.stringify(first)).not.toContain("secret");
    expect(JSON.stringify(first)).not.toContain("https://ai.example.test");
    expect(JSON.stringify(first)).not.toContain("gpt-5.6-luna");
    expect(JSON.stringify(first)).not.toContain("MODEL_INPUT_PRIVATE");
    expect(JSON.stringify(first)).not.toContain("RAW_OUTPUT_PRIVATE");

    first.summary.headline.zh = "mutated";
    expect(service.getPublicState().summary.headline.zh).toBe("请确认待办。");
  });

  it("clears its timer without cancelling an active request", async () => {
    const run = deferred();
    const deps = serviceDependencies({ requestSummaryOnce: vi.fn(() => run.promise) });
    const service = createSummaryService(deps);
    await service.initialize();
    service.requestRefresh({ manual: true });
    await deps.flush();

    service.stop();

    expect(deps.timers.clearTimeout).toHaveBeenCalledTimes(1);
    expect(service.getPublicState().state).toBe("running");

    run.resolve({ summary: validSummary(), usage: null });
    await deps.flush();
    expect(service.getPublicState().state).toBe("ready");
    expect(deps.timers.setTimeout).toHaveBeenCalledTimes(1);
  });

  it("does not continue an overdue initialization stopped during configuration loading", async () => {
    const configurationRun = deferred();
    const deps = serviceDependencies({
      persisted: persistedState({ nextScheduledAtJST: "2026-08-01 09:00:00 JST" }),
    });
    deps.loadConfiguration = vi.fn(() => configurationRun.promise);
    const service = createSummaryService(deps);

    const initializing = service.initialize();
    service.stop();
    configurationRun.resolve(deps.configuration);
    await initializing;
    await deps.flush();

    expect(deps.loadConfiguration).toHaveBeenCalledTimes(1);
    expect(deps.collectSources).not.toHaveBeenCalled();
    expect(deps.requestSummaryOnce).not.toHaveBeenCalled();
    expect(deps.timers.setTimeout).not.toHaveBeenCalled();
    expect(service.getPublicState().state).toBe("ready");
  });

  it("does not reschedule after a stopped active request fails", async () => {
    const run = deferred();
    const deps = serviceDependencies({ requestSummaryOnce: vi.fn(() => run.promise) });
    const service = createSummaryService(deps);
    await service.initialize();
    service.requestRefresh({ manual: true });
    await deps.flush();
    service.stop();

    const failure = Object.assign(new Error("bad output"), {
      code: "model_schema",
      retryable: false,
    });
    run.reject(failure);
    await deps.flush();

    expect(service.getPublicState().state).toBe("stale");
    expect(deps.timers.setTimeout).toHaveBeenCalledTimes(1);
  });
});
