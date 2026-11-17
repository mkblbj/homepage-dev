import { useCallback } from "react";
import useSWR from "swr";

import { formatProxyUrl } from "utils/proxy/api-helpers";

const ENDPOINTS = ["sales", "monthly", "amazonSales", "aupaySales", "temuSales"];
const REQUEST_TIMEOUT = 10000;

async function readSource(url, endpoint) {
  const controller = new AbortController();
  let timer;
  try {
    const data = await Promise.race([
      (async () => {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
          const error = new Error(`HTTP ${response.status}`);
          error.unsupported = endpoint !== "sales" && response.status === 404;
          throw error;
        }
        return response.json();
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("Sales snapshot request timed out"));
          controller.abort();
        }, REQUEST_TIMEOUT);
      }),
    ]);
    // A disabled platform is not a failed read. Empty/malformed responses are.
    if (endpoint !== "sales" && (data?.enabled === false || data?.configured === false)) return { data: null };
    const required = endpoint === "sales" ? "totals" : endpoint === "monthly" ? "currentMonth" : "today";
    if (!data || typeof data !== "object" || data.error || data.ok === false || !Object.hasOwn(data, required)) {
      throw new Error("Invalid sales snapshot");
    }
    return { data };
  } catch (error) {
    return { error };
  } finally {
    clearTimeout(timer);
  }
}

// One SWR publication per round, regardless of HTTP completion order. Errors
// reject the entire round so SWR retains its last successful, unmixed snapshot.
export async function fetchSalesSnapshot(urls) {
  const results = await Promise.all(urls.map((url, index) => readSource(url, ENDPOINTS[index])));
  const snapshot = Object.fromEntries(ENDPOINTS.map((endpoint, index) => [endpoint, results[index].data ?? null]));
  const failed = ENDPOINTS.filter((_, index) => results[index].error);
  if (failed.length) {
    const error = new Error(`Sales snapshot unavailable: ${failed.join(", ")}`);
    error.sources = failed;
    error.unsupportedOnly = results.every((result) => !result.error || result.error.unsupported);
    error.partial = snapshot;
    throw error;
  }
  return snapshot;
}

export default function useSalesSnapshot(widget, { refreshInterval }) {
  const urls = ENDPOINTS.map((endpoint) => formatProxyUrl(widget, endpoint));
  const { data, error, mutate, isValidating } = useSWR(
    ["uorakutensales-snapshot", ...urls],
    ([, ...sourceUrls]) => fetchSalesSnapshot(sourceUrls),
    { refreshInterval },
  );
  // SWR records the error for rendering. Event handlers must not also leak a
  // rejected bound-mutate promise into the browser's unhandledrejection event.
  const refresh = useCallback(() => mutate().catch(() => undefined), [mutate]);
  return {
    // Old backends may lack optional endpoints. This is explicitly signalled
    // to the UI, and never displaces an already successful full snapshot.
    data: data ?? (error?.unsupportedOnly ? error.partial : undefined),
    error,
    mutate: refresh,
    isValidating,
  };
}
