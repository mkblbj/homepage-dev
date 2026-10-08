import assert from "node:assert/strict";
import test from "node:test";

import { buildMarketReference } from "./device-market-model.mjs";
import { marketDeviceModels } from "./device-sales.fixtures.mjs";
import {
  buildSalesProxyRequest,
  normalizeSalesServiceUrl,
  shapeProxyResponse,
  slimMarketReference,
} from "./proxy-config.mjs";

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
    peaks: "/api/history/peaks",
    monthly: "/api/sales/monthly",
    // full device boards — no limit/date, the widget ranks and pages them itself
    devices: "/api/device-sales",
    devicesMonthly: "/api/device-sales/monthly",
    // the market reference for phone-case models, read-only
    market: "/api/market-rankings/device-models",
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
  for (const endpoint of [
    "query",
    "refresh",
    "current",
    "admin",
    "other",
    "devicesRefresh",
    "device-sales",
    "market-rankings",
    "marketRefresh",
  ]) {
    assert.throws(
      () => buildSalesProxyRequest({ endpoint }),
      /Unsupported Rakuten sales endpoint/,
      `endpoint "${endpoint}" should be rejected`,
    );
  }
});

test("slimMarketReference keeps the ranking and its status, and drops the evidence", () => {
  const raw = marketDeviceModels();
  const slim = slimMarketReference(raw);

  assert.equal(slim.evidence, undefined);
  assert.equal(JSON.stringify(slim).includes("item.rakuten.co.jp"), false);
  assert.deepEqual(
    slim.ranks.map((r) => r.model),
    raw.ranks.map((r) => r.model),
  );
  assert.equal(slim.ranks[0].evidenceIds, undefined);
  assert.deepEqual(slim.ranks[0].sourceScores, raw.ranks[0].sourceScores);
  assert.equal(slim.ranks[0].productCount, raw.ranks[0].productCount);
  assert.deepEqual(slim.sources.rakuten, {
    configured: true,
    status: "observed",
    partial: true,
    recordedDays: 7,
    modelCount: 4,
    stale: false,
    lastError: null,
  });
  assert.deepEqual(
    [slim.status, slim.partial, slim.recordedDays, slim.expectedDays, slim.startDate, slim.endDate],
    ["observed", true, 7, 38, "2026-09-01", "2026-10-08"],
  );
  assert.deepEqual(slim.scoreWeights, raw.scoreWeights);
  // the payload it was given is left as it was
  assert.equal(raw.evidence.length, 1);
  assert.equal(raw.ranks[0].evidenceIds.length, 2);
  // and the board reads the slim reference exactly as the full one
  assert.deepEqual(buildMarketReference(slim), buildMarketReference(raw));
});

test("shapeProxyResponse slims only a market reference and passes everything else through", () => {
  const sales = { generatedAtJST: "2026-10-08 15:00 JST", evidence: ["kept"] };
  assert.equal(shapeProxyResponse("sales", sales), sales);
  const relayed = { error: { message: "Rakuten sales service error" } };
  assert.equal(shapeProxyResponse("market", relayed), relayed);
  assert.equal(shapeProxyResponse("market", null), null);
  assert.equal(shapeProxyResponse("market", marketDeviceModels()).evidence, undefined);
});
