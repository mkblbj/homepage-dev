const DEFAULT_SALES_SERVICE_URL = "http://127.0.0.1:3912";

// Read-only snapshot endpoints the company dashboard is allowed to call.
// The forbidden refresh/query endpoints (POST /api/query, /api/admin/*,
// GET /api/campaigns/current) are never exposed here — see
// docs/superpowers/company-dashboard-api.md.
const ENDPOINT_PATHS = {
  sales: "/api/sales",
  history: "/api/history/sales",
  campaigns: "/api/campaigns",
};

export function normalizeSalesServiceUrl(baseUrl = DEFAULT_SALES_SERVICE_URL) {
  const normalized = String(baseUrl || DEFAULT_SALES_SERVICE_URL).trim().replace(/\/+$/, "");

  return normalized || DEFAULT_SALES_SERVICE_URL;
}

function requireToken(token) {
  const normalized = String(token || "").trim();

  if (!normalized) {
    throw new Error("Missing Rakuten sales token");
  }

  return normalized;
}

export function buildSalesProxyRequest({ endpoint, baseUrl, token }) {
  const path = ENDPOINT_PATHS[endpoint];
  if (!path) {
    throw new Error(`Unsupported Rakuten sales endpoint: ${endpoint}`);
  }

  const normalizedToken = requireToken(token);
  const serviceUrl = normalizeSalesServiceUrl(baseUrl);

  return {
    url: new URL(`${serviceUrl}${path}`),
    params: {
      method: "GET",
      headers: {
        Authorization: `Bearer ${normalizedToken}`,
        Accept: "application/json",
      },
    },
  };
}
