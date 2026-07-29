import assert from "node:assert/strict";
import test from "node:test";

import { buildSalesProxyRequest, normalizeSalesServiceUrl } from "./proxy-config.mjs";

test("normalizeSalesServiceUrl trims trailing slashes and defaults to local sales service", () => {
  assert.equal(normalizeSalesServiceUrl("http://127.0.0.1:3912/"), "http://127.0.0.1:3912");
  assert.equal(normalizeSalesServiceUrl(), "http://127.0.0.1:3912");
});

test("buildSalesProxyRequest creates an authenticated realtime sales snapshot request", () => {
  const request = buildSalesProxyRequest({
    endpoint: "sales",
    baseUrl: "http://127.0.0.1:3912/",
    token: "secret-token",
  });

  assert.equal(request.url.toString(), "http://127.0.0.1:3912/api/sales");
  assert.equal(request.params.method, "GET");
  assert.equal(request.params.headers.Authorization, "Bearer secret-token");
  assert.equal(request.params.headers.Accept, "application/json");
  assert.equal(request.params.body, undefined);
});

test("buildSalesProxyRequest creates an authenticated 7-day history snapshot request", () => {
  const request = buildSalesProxyRequest({
    endpoint: "history",
    baseUrl: "http://127.0.0.1:3912/",
    token: "secret-token",
  });

  assert.equal(request.url.toString(), "http://127.0.0.1:3912/api/history/sales");
  assert.equal(request.params.method, "GET");
  assert.equal(request.params.headers.Authorization, "Bearer secret-token");
  assert.equal(request.params.headers.Accept, "application/json");
  assert.equal(request.params.body, undefined);
});

test("buildSalesProxyRequest creates an authenticated campaigns snapshot request", () => {
  const request = buildSalesProxyRequest({
    endpoint: "campaigns",
    baseUrl: "http://127.0.0.1:3912/",
    token: "secret-token",
  });

  // GET /api/campaigns is read-only and allowed; GET /api/campaigns/current is not exposed.
  assert.equal(request.url.toString(), "http://127.0.0.1:3912/api/campaigns");
  assert.equal(request.params.method, "GET");
  assert.equal(request.params.headers.Authorization, "Bearer secret-token");
  assert.equal(request.params.body, undefined);
});

test("buildSalesProxyRequest creates an authenticated shop-logos request", () => {
  const request = buildSalesProxyRequest({
    endpoint: "logos",
    baseUrl: "http://127.0.0.1:3912/",
    token: "secret-token",
  });

  assert.equal(request.url.toString(), "http://127.0.0.1:3912/api/shops/logos");
  assert.equal(request.params.method, "GET");
  assert.equal(request.params.headers.Authorization, "Bearer secret-token");
  assert.equal(request.params.body, undefined);
});

test("buildSalesProxyRequest creates an authenticated item-ranking request", () => {
  const request = buildSalesProxyRequest({
    endpoint: "ranking",
    baseUrl: "http://127.0.0.1:3912/",
    token: "secret-token",
  });

  assert.equal(request.url.toString(), "http://127.0.0.1:3912/api/item-rankings");
  assert.equal(request.params.method, "GET");
  assert.equal(request.params.headers.Authorization, "Bearer secret-token");
  assert.equal(request.params.body, undefined);
});

test("buildSalesProxyRequest rejects missing token and forbidden/unknown endpoints", () => {
  assert.throws(() => buildSalesProxyRequest({ endpoint: "sales", token: "" }), /Missing Rakuten sales token/);

  // The dashboard must never reach the forbidden refresh/query endpoints.
  for (const endpoint of ["query", "refresh", "current", "other"]) {
    assert.throws(
      () => buildSalesProxyRequest({ endpoint, token: "secret-token" }),
      /Unsupported Rakuten sales endpoint/,
      `endpoint "${endpoint}" should be rejected`,
    );
  }
});
