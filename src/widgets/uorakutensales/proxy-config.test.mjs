import assert from "node:assert/strict";
import test from "node:test";

import { buildSalesProxyRequest, normalizeSalesServiceUrl } from "./proxy-config.mjs";

test("normalizeSalesServiceUrl trims trailing slashes and defaults to local sales service", () => {
  assert.equal(normalizeSalesServiceUrl("http://127.0.0.1:3912/"), "http://127.0.0.1:3912");
  assert.equal(normalizeSalesServiceUrl(), "http://127.0.0.1:3912");
});

test("buildSalesProxyRequest creates authenticated snapshot request", () => {
  const request = buildSalesProxyRequest({
    endpoint: "snapshot",
    baseUrl: "http://127.0.0.1:3912/",
    token: "secret-token",
  });

  assert.equal(request.url.toString(), "http://127.0.0.1:3912/api/sales");
  assert.equal(request.params.method, "GET");
  assert.equal(request.params.headers.Authorization, "Bearer secret-token");
  assert.equal(request.params.headers.Accept, "application/json");
  assert.equal(request.params.body, undefined);
});

test("buildSalesProxyRequest creates authenticated query request", () => {
  const request = buildSalesProxyRequest({
    endpoint: "query",
    baseUrl: "http://127.0.0.1:3912/",
    token: "secret-token",
  });

  assert.equal(request.url.toString(), "http://127.0.0.1:3912/api/query");
  assert.equal(request.params.method, "POST");
  assert.equal(request.params.headers.Authorization, "Bearer secret-token");
  assert.equal(request.params.headers.Origin, "http://127.0.0.1:3912");
  assert.equal(request.params.headers["Content-Type"], "application/json");
  assert.equal(request.params.body, JSON.stringify({ all: true }));
});

test("buildSalesProxyRequest creates authenticated campaigns snapshot request", () => {
  const request = buildSalesProxyRequest({
    endpoint: "campaigns",
    baseUrl: "http://127.0.0.1:3912/",
    token: "secret-token",
  });

  assert.equal(request.url.toString(), "http://127.0.0.1:3912/api/campaigns");
  assert.equal(request.params.method, "GET");
  assert.equal(request.params.headers.Authorization, "Bearer secret-token");
  assert.equal(request.params.headers.Accept, "application/json");
  assert.equal(request.params.body, undefined);
});

test("buildSalesProxyRequest rejects missing token and unsupported endpoints", () => {
  assert.throws(
    () => buildSalesProxyRequest({ endpoint: "snapshot", token: "" }),
    /Missing Rakuten sales token/,
  );

  assert.throws(
    () => buildSalesProxyRequest({ endpoint: "other", token: "secret-token" }),
    /Unsupported Rakuten sales endpoint/,
  );
});
