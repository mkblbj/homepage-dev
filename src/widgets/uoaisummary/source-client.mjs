import { buildSalesProxyRequest } from "../uorakutensales/proxy-config.mjs";
import { computeFreshness } from "../uorakutensales/sales-model.mjs";

import { AISummaryError, publicErrorCode } from "./errors.mjs";

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function invalidPayload() {
  throw new AISummaryError("source_unavailable", "Source response is invalid");
}

function requireString(value) {
  if (typeof value !== "string" || !value.trim()) invalidPayload();
}

function requireRecord(value) {
  if (!isRecord(value)) invalidPayload();
}

function requireArray(value) {
  if (!Array.isArray(value)) invalidPayload();
}

function validatePayload(endpointName, data) {
  requireRecord(data);
  if (endpointName === "shipping") {
    requireString(data.updated_at);
    requireRecord(data.today_output);
  } else if (endpointName === "attention") {
    requireString(data.generatedAtJST);
    if (!["normal", "attention", "critical"].includes(data.status)) invalidPayload();
    requireRecord(data.summary);
  } else if (endpointName === "sales") {
    requireString(data.generatedAtJST);
    requireRecord(data.totals);
    requireArray(data.shops);
  } else if (endpointName === "history") {
    requireRecord(data.totals);
    requireArray(data.shops);
    requireRecord(data.range);
    requireArray(data.range.dates);
  } else if (endpointName === "performance") {
    requireString(data.generatedAtJST);
    requireRecord(data.traffic);
    if (!["normal", "attention", "critical"].includes(data.traffic.status)) invalidPayload();
  }
  return data;
}

export async function fetchJson(url, { fetcher = globalThis.fetch, timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      redirect: "manual",
      signal: controller.signal,
    });
    if (response.status >= 300 && response.status < 400) {
      throw new AISummaryError("source_unavailable", "Source redirect rejected");
    }
    if (!response.ok) {
      throw new AISummaryError("source_unavailable", "Source HTTP failure", { status: response.status });
    }
    return await response.json();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new AISummaryError("source_timeout", "Source request timed out");
    }
    if (error instanceof AISummaryError) throw error;
    throw new AISummaryError("source_unavailable", "Source request failed");
  } finally {
    clearTimeout(timer);
  }
}

export function compositeFreshness(sources = {}) {
  const values = Object.values(sources).filter(Boolean);
  if (!values.length) return "fresh";
  if (values.every((source) => source.stale === true)) return "stale";
  if (values.some((source) => source.stale === true)) return "delayed";
  return "fresh";
}

function shippingFreshness(updatedAt, nowTs, refreshInterval = 30000) {
  const parsed = Date.parse(String(updatedAt || "").replace(" ", "T"));
  if (Number.isNaN(parsed)) return "delayed";
  const ageSec = Math.max(0, (nowTs - parsed) / 1000);
  const liveMax = Math.max(60, (refreshInterval / 1000) * 2);
  const staleMax = Math.max(300, (refreshInterval / 1000) * 6);
  return ageSec <= liveMax ? "fresh" : ageSec <= staleMax ? "delayed" : "stale";
}

function unavailable(key, error) {
  return {
    key,
    state: "unavailable",
    partial: true,
    updatedAtJST: null,
    data: null,
    error: publicErrorCode(error),
  };
}

function timestampFreshness(timestamp, nowTs, refreshInterval) {
  const result = computeFreshness(timestamp, nowTs, refreshInterval);
  if (!result) return "delayed";
  return result.state === "live" ? "fresh" : result.state;
}

function worstState(...states) {
  const weight = { fresh: 0, delayed: 1, stale: 2, unavailable: 3 };
  return states.reduce((worst, state) => (weight[state] > weight[worst] ? state : worst), "fresh");
}

function endpoint(baseUrl, path) {
  return new URL(path, String(baseUrl).replace(/\/?$/, "/"));
}

async function isolated(key, source, work) {
  if (!source?.widget || source.error) {
    return unavailable(key, new AISummaryError("configuration", "Source configuration invalid"));
  }
  try {
    return await work(source.widget);
  } catch (error) {
    return unavailable(key, error);
  }
}

export async function collectBusinessSources(
  sources,
  { fetcher = globalThis.fetch, nowTs = Date.now(), timeoutMs = 15000 } = {},
) {
  const read = (url) => fetchJson(url, { fetcher, timeoutMs });
  const [shipping, attention, sales, performance] = await Promise.all([
    isolated("shipping", sources.shipping, async (widget) => {
      const data = validatePayload("shipping", await read(widget.url));
      return {
        key: "shipping",
        state: shippingFreshness(data.updated_at, nowTs, widget.refreshInterval),
        partial: false,
        updatedAtJST: data.updated_at || null,
        data,
        error: null,
      };
    }),
    isolated("attention", sources.attention, async (widget) => {
      const data = validatePayload("attention", await read(endpoint(widget.url, "/api/attention")));
      const state = worstState(
        timestampFreshness(data.generatedAtJST, nowTs, widget.refreshInterval || 60000),
        compositeFreshness(data.sources),
      );
      return {
        key: "attention",
        state,
        partial: Boolean(data.partial),
        updatedAtJST: data.generatedAtJST || null,
        data,
        error: null,
      };
    }),
    isolated("sales", sources.sales, async (widget) => {
      const requests = ["sales", "history"].map((name) =>
        buildSalesProxyRequest({ endpoint: name, baseUrl: widget.url }),
      );
      const [salesData, history] = await Promise.all(requests.map(({ url }) => read(url)));
      validatePayload("sales", salesData);
      validatePayload("history", history);
      const state = timestampFreshness(salesData.generatedAtJST, nowTs, widget.refreshInterval || 900000);
      return {
        key: "sales",
        state,
        partial: Boolean(salesData.partial || history.partial),
        updatedAtJST: salesData.generatedAtJST || null,
        data: { sales: salesData, history },
        error: null,
      };
    }),
    isolated("performance", sources.performance, async (widget) => {
      const data = validatePayload("performance", await read(endpoint(widget.url, "/api/performance")));
      const state = worstState(
        timestampFreshness(data.generatedAtJST, nowTs, widget.refreshInterval || 600000),
        compositeFreshness(data.sources),
      );
      return {
        key: "performance",
        state,
        partial: Boolean(data.partial),
        updatedAtJST: data.generatedAtJST || null,
        data,
        error: null,
      };
    }),
  ]);
  return { shipping, attention, sales, performance };
}
