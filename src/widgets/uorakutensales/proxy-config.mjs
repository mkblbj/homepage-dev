const DEFAULT_SALES_SERVICE_URL = "http://127.0.0.1:3912";

// Read-only snapshot endpoints the company dashboard is allowed to call.
// The forbidden refresh/query endpoints (POST /api/query, /api/admin/*,
// GET /api/campaigns/current) are never exposed here.
// The Server authenticates by private-network CIDR + Host, not by bearer token,
// so no Authorization header is sent.
const ENDPOINT_PATHS = {
  sales: "/api/sales",
  history: "/api/history/sales",
  campaigns: "/api/campaigns",
  logos: "/api/shops/logos",
  ranking: "/api/item-rankings",
  peaks: "/api/history/peaks",
  monthly: "/api/sales/monthly",
  // full device boards (no limit/date): the widget ranks, filters and pages them
  devices: "/api/device-sales",
  devicesMonthly: "/api/device-sales/monthly",
  // the market reference for phone-case models, rebuilt once a day
  market: "/api/market-rankings/device-models",
};

export function normalizeSalesServiceUrl(baseUrl = DEFAULT_SALES_SERVICE_URL) {
  const normalized = String(baseUrl || DEFAULT_SALES_SERVICE_URL)
    .trim()
    .replace(/\/+$/, "");

  return normalized || DEFAULT_SALES_SERVICE_URL;
}

export function buildSalesProxyRequest({ endpoint, baseUrl }) {
  const path = ENDPOINT_PATHS[endpoint];
  if (!path) {
    throw new Error(`Unsupported Rakuten sales endpoint: ${endpoint}`);
  }

  const serviceUrl = normalizeSalesServiceUrl(baseUrl);

  return {
    url: new URL(`${serviceUrl}${path}`),
    params: {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    },
  };
}

// per source, only what says whether the reference can be trusted
const MARKET_SOURCE_FIELDS = ["configured", "status", "partial", "recordedDays", "modelCount", "stale", "lastError"];

function sourceStatus(source) {
  if (!source || typeof source !== "object") return source;
  return Object.fromEntries(MARKET_SOURCE_FIELDS.filter((key) => key in source).map((key) => [key, source[key]]));
}

// The board reads the market ranking, not the evidence behind it: the full
// reference repeats item titles, URLs and per-day observations (about 1 MB)
// that the ranking (about 30 KB) never needs. Not a reference → untouched.
export function slimMarketReference(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.ranks)) return data;
  const slim = {
    ...data,
    ranks: data.ranks.map((row) => {
      const copy = { ...row };
      delete copy.evidenceIds;
      return copy;
    }),
  };
  delete slim.evidence;
  if (data.sources && typeof data.sources === "object") {
    slim.sources = { rakuten: sourceStatus(data.sources.rakuten), yahoo: sourceStatus(data.sources.yahoo) };
  }
  return slim;
}

// what a successful read of each endpoint hands to the browser
export function shapeProxyResponse(endpoint, data) {
  return endpoint === "market" ? slimMarketReference(data) : data;
}
