// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";

import useSalesSnapshot, { fetchSalesSnapshot } from "./use-sales-snapshot";

const endpoints = ["sales", "monthly", "amazonSales", "aupaySales", "temuSales"];
const urls = endpoints.map((endpoint) => `/api/services/proxy?endpoint=${endpoint}`);
const widget = { service_group: "EC", service_name: "sales", index: 0 };
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
const payload = (endpoint, count = 160) => {
  if (endpoint === "sales") return { ok: true, totals: { orderCount: count }, shops: [] };
  if (endpoint === "monthly") return { ok: true, currentMonth: { totals: { orderCount: count } } };
  return { ok: true, today: { shops: [], totals: { orderCount: count } } };
};
function deferredNetwork() {
  const pending = new Map();
  vi.stubGlobal("fetch", vi.fn((url, options) => new Promise((resolve, reject) => {
    pending.set(new URL(url, "http://test").searchParams.get("endpoint"), { resolve, reject, options });
  })));
  return pending;
}
function renderSnapshot(options = {}, service = widget, cache = new Map()) {
  return renderHook(() => useSalesSnapshot(service, { refreshInterval: 60000 }), {
    wrapper: ({ children }) => <SWRConfig value={{ provider: () => cache, dedupingInterval: 0, shouldRetryOnError: false, ...options }}>{children}</SWRConfig>,
  });
}
async function settle(pending, count = 160, failure = null) {
  await act(async () => {
    for (const endpoint of endpoints) {
      pending.get(endpoint).resolve(endpoint === failure ? response({}, 503) : response(payload(endpoint, count)));
    }
  });
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("atomic sales snapshots", () => {
  it("does not publish until all five sources settle, then publishes once", async () => {
    const pending = deferredNetwork();
    const { result } = renderSnapshot();
    for (const endpoint of endpoints.slice(0, -1)) {
      await act(async () => pending.get(endpoint).resolve(response(payload(endpoint))));
      expect(result.current.data).toBeUndefined();
    }
    await act(async () => pending.get("temuSales").resolve(response(payload("temuSales"))));
    expect(result.current.data.sales.totals.orderCount).toBe(160);
    expect(result.current.data.temuSales.today.totals.orderCount).toBe(160);
  });

  it("retains the whole old snapshot during a staggered refresh and publishes the new batch together", async () => {
    const pending = deferredNetwork();
    const { result } = renderSnapshot();
    await settle(pending);
    let refresh;
    act(() => { refresh = result.current.mutate(); });
    await act(async () => pending.get("sales").resolve(response(payload("sales", 200))));
    expect(result.current.data.sales.totals.orderCount).toBe(160);
    await settle(pending, 200);
    await refresh;
    expect(result.current.data.sales.totals.orderCount).toBe(200);
    expect(result.current.data.temuSales.today.totals.orderCount).toBe(200);
  });

  it("preserves old data on failure and clears the error after a successful retry", async () => {
    const pending = deferredNetwork();
    const { result } = renderSnapshot();
    await settle(pending);
    act(() => { void result.current.mutate(); });
    await settle(pending, 200, "temuSales");
    expect(result.current.data.sales.totals.orderCount).toBe(160);
    expect(result.current.error.sources).toEqual(["temuSales"]);
    act(() => { void result.current.mutate(); });
    await settle(pending, 220);
    expect(result.current.data.sales.totals.orderCount).toBe(220);
    expect(result.current.error).toBeUndefined();
  });

  it("allows an explicitly marked initial optional 404 fallback but never drops an existing platform on later 404", async () => {
    const pending = deferredNetwork();
    const { result } = renderSnapshot();
    await act(async () => {
      for (const endpoint of endpoints) pending.get(endpoint).resolve(response(payload(endpoint), endpoint === "temuSales" ? 404 : 200));
    });
    expect(result.current.data.sales.totals.orderCount).toBe(160);
    expect(result.current.data.temuSales).toBeNull();
    expect(result.current.error.unsupportedOnly).toBe(true);
    act(() => { void result.current.mutate(); });
    await settle(pending, 200);
    act(() => { void result.current.mutate(); });
    await act(async () => {
      for (const endpoint of endpoints) pending.get(endpoint).resolve(response(payload(endpoint, 220), endpoint === "temuSales" ? 404 : 200));
    });
    expect(result.current.data.sales.totals.orderCount).toBe(200);
    expect(result.current.data.temuSales.today.totals.orderCount).toBe(200);
  });

  it.each([
    ["HTTP", () => response({}, 503)],
    ["network", () => Promise.reject(new Error("offline"))],
    ["JSON", () => ({ ok: true, status: 200, json: async () => { throw new Error("invalid JSON"); } })],
    ["business", () => response({ ok: false })],
    ["embedded error", () => response({ error: "unavailable" })],
    ["empty payload", () => response({})],
  ])("does not publish a partial initial snapshot on %s failure", async (_name, failedResponse) => {
    vi.stubGlobal("fetch", vi.fn((url) => url.includes("temuSales") ? failedResponse() : response(payload(new URL(url, "http://test").searchParams.get("endpoint")))));
    const { result } = renderSnapshot();
    await waitFor(() => expect(result.current.error?.sources).toEqual(["temuSales"]));
    expect(result.current.data).toBeUndefined();
  });

  it("treats explicit disabled sources as absent rather than failed", async () => {
    vi.stubGlobal("fetch", vi.fn((url) => Promise.resolve(response(url.includes("temuSales") ? { enabled: false, ok: true } : payload(new URL(url, "http://test").searchParams.get("endpoint"))))));
    const data = await fetchSalesSnapshot(urls);
    expect(data.temuSales).toBeNull();
    expect(data.sales.totals.orderCount).toBe(160);
  });

  it.each(["fetch", "body"])("bounds a hung %s at 10 seconds and aborts the request", async (stage) => {
    vi.useFakeTimers();
    let signal;
    vi.stubGlobal("fetch", vi.fn((url, options) => {
      if (!url.includes("temuSales")) return Promise.resolve(response(payload(new URL(url, "http://test").searchParams.get("endpoint"))));
      signal = options.signal;
      const hung = new Promise(() => {});
      return stage === "fetch" ? hung : Promise.resolve({ ok: true, status: 200, json: () => hung });
    }));
    const result = fetchSalesSnapshot(urls).catch((error) => error);
    await vi.advanceTimersByTimeAsync(10000);
    const error = await result;
    expect(error.sources).toEqual(["temuSales"]);
    expect(error.unsupportedOnly).toBe(false);
    expect(signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not reuse a different service's cached sales", async () => {
    const cache = new Map();
    vi.stubGlobal("fetch", vi.fn((url) => {
      const params = new URL(url, "http://test").searchParams;
      return Promise.resolve(response(payload(params.get("endpoint"), params.get("service") === "sales" ? 160 : 300)));
    }));
    const first = renderSnapshot({}, widget, cache);
    await waitFor(() => expect(first.result.current.data?.sales.totals.orderCount).toBe(160));
    const second = renderSnapshot({}, { ...widget, service_name: "different" }, cache);
    await waitFor(() => expect(second.result.current.data?.sales.totals.orderCount).toBe(300));
  });

  it("revalidates the whole snapshot together on window focus", async () => {
    vi.useFakeTimers();
    const pending = deferredNetwork();
    const { result } = renderSnapshot({ focusThrottleInterval: 0 });
    await settle(pending);
    await act(async () => {
      // SWR requires focus time to be strictly after its initial throttle time.
      await vi.advanceTimersByTimeAsync(1);
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetch).toHaveBeenCalledTimes(10);
    await act(async () => pending.get("sales").resolve(response(payload("sales", 200))));
    expect(result.current.data.sales.totals.orderCount).toBe(160);
    await settle(pending, 200);
    expect(result.current.data.sales.totals.orderCount).toBe(200);
  });

  it("polls the grouped snapshot rather than independently publishing source refreshes", async () => {
    vi.useFakeTimers();
    const pending = deferredNetwork();
    const { result } = renderSnapshot();
    await settle(pending);
    await act(async () => vi.advanceTimersByTimeAsync(60000));
    await act(async () => pending.get("sales").resolve(response(payload("sales", 200))));
    expect(result.current.data.sales.totals.orderCount).toBe(160);
    await settle(pending, 200);
    expect(result.current.data.sales.totals.orderCount).toBe(200);
  });
});
