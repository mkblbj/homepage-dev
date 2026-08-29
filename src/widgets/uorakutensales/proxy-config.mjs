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
