import assert from "node:assert/strict";
import test from "node:test";

import { buildSalesProxyRequest, normalizeSalesServiceUrl } from "./proxy-config.mjs";

test("normalizeSalesServiceUrl trims trailing slashes and defaults to local sales service", () => {
  assert.equal(normalizeSalesServiceUrl("http://127.0.0.1:3912/"), "http://127.0.0.1:3912");
  assert.equal(normalizeSalesServiceUrl("http://192.168.1.26:3912/"), "http://192.168.1.26:3912");
  assert.equal(normalizeSalesServiceUrl(""), "http://127.0.0.1:3912");
  assert.equal(normalizeSalesServiceUrl(), "http://127.0.0.1:3912");
});

test("buildSalesProxyRequest maps every allowed endpoint to its read-only path", () => {
  const cases = {
    sales: "/api/sales",
    history: "/api/history/sales",
    // GET /api/campaigns is read-only and allowed; GET /api/campaigns/current is not exposed.
    campaigns: "/api/campaigns",
    logos: "/api/shops/logos",
    ranking: "/api/item-rankings",
  };

  for (const [endpoint, path] of Object.entries(cases)) {
    const request = buildSalesProxyRequest({ endpoint, baseUrl: "http://127.0.0.1:3912/" });

    assert.equal(request.url.toString(), `http://127.0.0.1:3912${path}`);
    assert.equal(request.params.method, "GET");
    assert.equal(request.params.body, undefined);
  }
});

test("buildSalesProxyRequest sends no Authorization header", () => {
  // The Server authenticates by private-network CIDR + Host, not by bearer token.
  const request = buildSalesProxyRequest({ endpoint: "sales", baseUrl: "http://127.0.0.1:3912" });

  assert.equal(request.params.headers.Authorization, undefined);
  assert.equal(request.params.headers.Accept, "application/json");
  assert.deepEqual(Object.keys(request.params.headers), ["Accept"]);
});

test("buildSalesProxyRequest falls back to the default base url", () => {
  const request = buildSalesProxyRequest({ endpoint: "logos" });

  assert.equal(request.url.toString(), "http://127.0.0.1:3912/api/shops/logos");
});

test("buildSalesProxyRequest rejects forbidden and unknown endpoints", () => {
  // The dashboard must never reach the forbidden refresh/query endpoints.
  for (const endpoint of ["query", "refresh", "current", "admin", "other"]) {
    assert.throws(
      () => buildSalesProxyRequest({ endpoint }),
      /Unsupported Rakuten sales endpoint/,
      `endpoint "${endpoint}" should be rejected`,
    );
  }
});
