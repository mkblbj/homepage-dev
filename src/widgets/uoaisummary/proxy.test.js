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
          metrics: [],
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
        "metrics",
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

    await uoAISummaryProxyHandler(
      {
        method: "POST",
        query: { endpoint: "refresh" },
        headers: {
          host: "homepage.example.test",
          origin: "https://homepage.example.test",
        },
        socket: { encrypted: true },
      },
      res,
    );

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

    await uoAISummaryProxyHandler(
      {
        method: "POST",
        query: { endpoint: "refresh" },
        headers: {
          host: "homepage.example.test",
          origin: "https://homepage.example.test",
        },
        socket: { encrypted: true },
      },
      res,
    );

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
          origin: "https://homepage.example.test",
          "sec-fetch-site": "cross-site",
        },
        socket: { encrypted: true },
      },
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(getSummaryService).not.toHaveBeenCalled();
  });

  it("rejects refresh without request origin evidence", async () => {
    const res = responseRecorder();

    await uoAISummaryProxyHandler(
      {
        method: "POST",
        query: { endpoint: "refresh" },
      },
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(getSummaryService).not.toHaveBeenCalled();
  });

  it("does not treat same-site as same-origin without an Origin header", async () => {
    const res = responseRecorder();

    await uoAISummaryProxyHandler(
      {
        method: "POST",
        query: { endpoint: "refresh" },
        headers: {
          host: "homepage.example.test",
          "sec-fetch-site": "same-site",
        },
        socket: { encrypted: true },
      },
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(getSummaryService).not.toHaveBeenCalled();
  });

  it("rejects a matching host sent over a different protocol", async () => {
    const res = responseRecorder();

    await uoAISummaryProxyHandler(
      {
        method: "POST",
        query: { endpoint: "refresh" },
        headers: {
          host: "homepage.example.test",
          origin: "http://homepage.example.test",
        },
        socket: { encrypted: true },
      },
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(getSummaryService).not.toHaveBeenCalled();
  });

  it("rejects an Origin header containing a path", async () => {
    const res = responseRecorder();

    await uoAISummaryProxyHandler(
      {
        method: "POST",
        query: { endpoint: "refresh" },
        headers: {
          host: "homepage.example.test",
          origin: "https://homepage.example.test/./",
        },
        socket: { encrypted: true },
      },
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(getSummaryService).not.toHaveBeenCalled();
  });

  it("accepts the first forwarded protocol and host as the public origin", async () => {
    const service = {
      requestRefresh: vi.fn(() => ({ accepted: true, state: "running", cooldownUntilJST: null })),
    };
    getSummaryService.mockResolvedValue(service);
    const res = responseRecorder();

    await uoAISummaryProxyHandler(
      {
        method: "POST",
        query: { endpoint: "refresh" },
        headers: {
          host: "internal.example.test:3000",
          origin: "https://homepage.example.test",
          "x-forwarded-host": " Homepage.Example.Test:443 , internal.example.test:3000",
          "x-forwarded-proto": " https , http",
        },
        socket: { encrypted: false },
      },
      res,
    );

    expect(res.statusCode).toBe(202);
    expect(service.requestRefresh).toHaveBeenCalledWith({ manual: true });
  });

  it("accepts a mixed-case forwarded protocol", async () => {
    const service = {
      requestRefresh: vi.fn(() => ({ accepted: true, state: "running", cooldownUntilJST: null })),
    };
    getSummaryService.mockResolvedValue(service);
    const res = responseRecorder();

    await uoAISummaryProxyHandler(
      {
        method: "POST",
        query: { endpoint: "refresh" },
        headers: {
          host: "internal.example.test:3000",
          origin: "https://homepage.example.test",
          "x-forwarded-host": "homepage.example.test",
          "x-forwarded-proto": "Https",
        },
        socket: { encrypted: false },
      },
      res,
    );

    expect(res.statusCode).toBe(202);
    expect(service.requestRefresh).toHaveBeenCalledWith({ manual: true });
  });

  it("falls back to socket and Host when only forwarded protocol is present", async () => {
    const service = {
      requestRefresh: vi.fn(() => ({ accepted: true, state: "running", cooldownUntilJST: null })),
    };
    getSummaryService.mockResolvedValue(service);
    const res = responseRecorder();

    await uoAISummaryProxyHandler(
      {
        method: "POST",
        query: { endpoint: "refresh" },
        headers: {
          host: "homepage.example.test",
          origin: "http://homepage.example.test",
          "x-forwarded-proto": "https",
        },
        socket: { encrypted: false },
      },
      res,
    );

    expect(res.statusCode).toBe(202);
  });

  it("falls back to socket and Host when only forwarded host is present", async () => {
    const service = {
      requestRefresh: vi.fn(() => ({ accepted: true, state: "running", cooldownUntilJST: null })),
    };
    getSummaryService.mockResolvedValue(service);
    const res = responseRecorder();

    await uoAISummaryProxyHandler(
      {
        method: "POST",
        query: { endpoint: "refresh" },
        headers: {
          host: "internal.example.test:3000",
          origin: "http://internal.example.test:3000",
          "x-forwarded-host": "homepage.example.test",
        },
        socket: { encrypted: false },
      },
      res,
    );

    expect(res.statusCode).toBe(202);
  });

  it("normalizes host casing and the default port", async () => {
    const service = {
      requestRefresh: vi.fn(() => ({ accepted: true, state: "running", cooldownUntilJST: null })),
    };
    getSummaryService.mockResolvedValue(service);
    const res = responseRecorder();

    await uoAISummaryProxyHandler(
      {
        method: "POST",
        query: { endpoint: "refresh" },
        headers: {
          host: "HOMEPAGE.EXAMPLE.TEST",
          origin: "https://Homepage.Example.Test:443",
        },
        socket: { encrypted: true },
      },
      res,
    );

    expect(res.statusCode).toBe(202);
    expect(service.requestRefresh).toHaveBeenCalledWith({ manual: true });
  });

  it("preserves non-default ports when comparing origins", async () => {
    const service = {
      requestRefresh: vi.fn(() => ({ accepted: true, state: "running", cooldownUntilJST: null })),
    };
    getSummaryService.mockResolvedValue(service);

    const accepted = responseRecorder();
    await uoAISummaryProxyHandler(
      {
        method: "POST",
        query: { endpoint: "refresh" },
        headers: {
          host: "homepage.example.test:8443",
          origin: "https://homepage.example.test:8443",
        },
        socket: { encrypted: true },
      },
      accepted,
    );

    expect(accepted.statusCode).toBe(202);

    const rejected = responseRecorder();
    await uoAISummaryProxyHandler(
      {
        method: "POST",
        query: { endpoint: "refresh" },
        headers: {
          host: "homepage.example.test:8443",
          origin: "https://homepage.example.test:9443",
        },
        socket: { encrypted: true },
      },
      rejected,
    );

    expect(rejected.statusCode).toBe(403);
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
