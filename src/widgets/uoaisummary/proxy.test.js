import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSummaryService } = vi.hoisted(() => ({
  getSummaryService: vi.fn(),
}));

vi.mock("./singleton.mjs", () => ({ getSummaryService }));

import uoAISummaryProxyHandler from "./proxy";

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
}

beforeEach(() => {
  getSummaryService.mockReset();
});

describe("uoAISummaryProxyHandler", () => {
  it("returns a no-store public summary without private configuration", async () => {
    const publicState = {
      state: "ready",
      summary: { headline: { ja: "要約", zh: "总结" } },
      lastError: null,
    };
    const service = {
      apiKey: "synthetic-private-key",
      apiUrl: "https://private.invalid/v1/responses",
      model: "synthetic-private-model",
      reasoningEffort: "synthetic-private-effort",
      getPublicState: vi.fn(() => publicState),
    };
    getSummaryService.mockResolvedValue(service);
    const res = responseRecorder();

    await uoAISummaryProxyHandler({ method: "GET", query: { endpoint: "summary" } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers["Cache-Control"]).toBe("private, no-store");
    expect(service.getPublicState).toHaveBeenCalledTimes(1);
    expect(res.body).toEqual(publicState);
    expect(JSON.stringify(res.body)).not.toMatch(/synthetic-private|apiKey|apiUrl|model|reasoningEffort/);
  });

  it.each(["ready", "running", "partial", "stale", "empty", "error"])(
    "preserves the stable public shape for %s",
    async (state) => {
      getSummaryService.mockResolvedValue({
        getPublicState: () => ({
          state,
          severity: "unknown",
          dataQuality: state === "partial" ? "partial" : "insufficient",
          generatedAtJST: null,
          nextScheduledAtJST: null,
          sourceCoverage: { valid: 0, total: 4 },
          sourceFreshness: {},
          summary: null,
          metricDisplay: {},
          cooldownUntilJST: null,
          lastError: state === "error" ? "unexpected" : null,
        }),
      });
      const res = responseRecorder();

      await uoAISummaryProxyHandler({ method: "GET", query: { endpoint: "summary" } }, res);

      expect(Object.keys(res.body).sort()).toEqual([
        "cooldownUntilJST",
        "dataQuality",
        "generatedAtJST",
        "lastError",
        "metricDisplay",
        "nextScheduledAtJST",
        "severity",
        "sourceCoverage",
        "sourceFreshness",
        "state",
        "summary",
      ]);
    },
  );

  it("accepts refresh asynchronously", async () => {
    const service = {
      requestRefresh: vi.fn(() => ({
        accepted: true,
        state: "running",
        cooldownUntilJST: "2026-08-01 10:10:00 JST",
      })),
    };
    getSummaryService.mockResolvedValue(service);
    const res = responseRecorder();

    await uoAISummaryProxyHandler({ method: "POST", query: { endpoint: "refresh" } }, res);

    expect(service.requestRefresh).toHaveBeenCalledWith({ manual: true });
    expect(res.statusCode).toBe(202);
    expect(res.body).toEqual({
      accepted: true,
      state: "running",
      cooldownUntilJST: "2026-08-01 10:10:00 JST",
    });
  });

  it("maps refresh cooldown to 429", async () => {
    const service = {
      requestRefresh: vi.fn(() => ({
        accepted: false,
        state: "cooldown",
        cooldownUntilJST: "2026-08-01 10:10:00 JST",
      })),
    };
    getSummaryService.mockResolvedValue(service);
    const res = responseRecorder();

    await uoAISummaryProxyHandler({ method: "POST", query: { endpoint: "refresh" } }, res);

    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({
      accepted: false,
      state: "cooldown",
      cooldownUntilJST: "2026-08-01 10:10:00 JST",
    });
  });

  it.each([
    ["POST", "summary"],
    ["GET", "refresh"],
    ["DELETE", "summary"],
  ])("rejects %s %s", async (method, endpoint) => {
    const res = responseRecorder();

    await uoAISummaryProxyHandler({ method, query: { endpoint } }, res);

    expect(res.statusCode).toBe(405);
    expect(getSummaryService).not.toHaveBeenCalled();
  });

  it("rejects a cross-site manual refresh before touching the service", async () => {
    const res = responseRecorder();

    await uoAISummaryProxyHandler(
      {
        method: "POST",
        query: { endpoint: "refresh" },
        headers: {
          host: "homepage.example.test",
          origin: "https://attacker.example.test",
          "sec-fetch-site": "cross-site",
        },
      },
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(getSummaryService).not.toHaveBeenCalled();
  });

  it("returns only a redacted code when service configuration fails", async () => {
    const error = Object.assign(new Error("synthetic-private-key"), {
      code: "configuration",
      apiUrl: "https://private.invalid/v1/responses",
    });
    getSummaryService.mockRejectedValue(error);
    const res = responseRecorder();

    await uoAISummaryProxyHandler({ method: "GET", query: { endpoint: "summary" } }, res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: "configuration" });
    expect(JSON.stringify(res.body)).not.toMatch(/synthetic-private|private\.invalid/);
  });
});
