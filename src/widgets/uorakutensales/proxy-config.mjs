const DEFAULT_SALES_SERVICE_URL = "http://127.0.0.1:3912";

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
  const normalizedToken = requireToken(token);
  const serviceUrl = normalizeSalesServiceUrl(baseUrl);
  const headers = {
    Authorization: `Bearer ${normalizedToken}`,
    Accept: "application/json",
  };

  if (endpoint === "snapshot") {
    return {
      url: new URL(`${serviceUrl}/api/sales`),
      params: {
        method: "GET",
        headers,
      },
    };
  }

  if (endpoint === "query") {
    return {
      url: new URL(`${serviceUrl}/api/query`),
      params: {
        method: "POST",
        headers: {
          ...headers,
          Origin: serviceUrl,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ all: true }),
      },
    };
  }

  throw new Error(`Unsupported Rakuten sales endpoint: ${endpoint}`);
}
