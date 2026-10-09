import assert from "node:assert/strict";
import test from "node:test";

import { buildMarketReference } from "./device-market-model.mjs";
import { marketDeviceModels } from "./device-sales.fixtures.mjs";
import {
  buildSalesProxyRequest,
  marketEvidenceModel,
  normalizeSalesServiceUrl,
  pickModelEvidence,
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
    // one model's evidence, picked out of the same reference by the proxy
    marketEvidence: "/api/market-rankings/device-models",
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
  assert.equal(raw.evidence.length, 6);
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

test("pickModelEvidence lists one model's evidence by contribution, compact and with safe links", () => {
  const evidence = pickModelEvidence(marketDeviceModels(), "iPhone 18 Pro");

  assert.equal(evidence.model, "iPhone 18 Pro");
  // six ids, one of them no longer in the evidence list
  assert.equal(evidence.total, 5);
  // a daily rank weighs more than a realtime one, and a listing naming eleven
  // models gives each only an eleventh, so the realtime #1 comes last
  assert.deepEqual(
    evidence.items.map((item) => item.id),
    [
      "rakuten:560271:daily|odd:1",
      "yahoo:all:ranking|iphone18pro ケース",
      "yahoo:38347:trend|iface:1",
      "rakuten:560271:realtime|peak:1",
      "rakuten:560271:realtime|iface:2",
    ],
  );
  assert.deepEqual(evidence.items[4], {
    id: "rakuten:560271:realtime|iface:2",
    group: "rakutenProducts",
    period: "realtime",
    type: "product",
    title: "【クーポン配布中】iFace公式 iPhone18Pro iPhone18ProMax iPhone17",
    url: "https://item.rakuten.co.jp/iface/18pro-set/",
    bestRank: 1,
    bestDate: "2026-10-07",
    days: 2,
    models: 11,
  });
  // a search term is titled by the term and links to its search page
  assert.equal(evidence.items[1].type, "keyword");
  assert.equal(evidence.items[1].title, "iphone18pro ケース");
  assert.match(evidence.items[1].url, /^https:\/\/shopping\.yahoo\.co\.jp\/search\//);
  // anything but an http(s) Rakuten / Yahoo page loses its link
  assert.equal(evidence.items[0].url, null);
});

test("pickModelEvidence gives an empty list for a model without evidence, and passes errors through", () => {
  assert.deepEqual(pickModelEvidence(marketDeviceModels(), "Galaxy A25"), { model: "Galaxy A25", total: 0, items: [] });
  assert.deepEqual(pickModelEvidence(marketDeviceModels(), "Galaxy S99"), { model: "Galaxy S99", total: 0, items: [] });
  const relayed = { error: { message: "Rakuten sales service error" } };
  assert.equal(pickModelEvidence(relayed, "iPhone 17"), relayed);
});

test("marketEvidenceModel reads the model from the proxy query, and nothing else", () => {
  assert.equal(marketEvidenceModel(JSON.stringify({ model: "iPhone 18 Pro" })), "iPhone 18 Pro");
  assert.equal(marketEvidenceModel(JSON.stringify({ model: "  iPhone 17  " })), "iPhone 17");
  for (const query of [
    undefined,
    "",
    "not json",
    JSON.stringify({}),
    JSON.stringify({ model: "" }),
    JSON.stringify({ model: 42 }),
    JSON.stringify({ model: "x".repeat(101) }),
    [JSON.stringify({ model: "iPhone 17" })],
  ]) {
    assert.equal(marketEvidenceModel(query), null, `query ${JSON.stringify(query)}`);
  }
});

test("shapeProxyResponse picks one model's evidence for marketEvidence", () => {
  const evidence = shapeProxyResponse("marketEvidence", marketDeviceModels(), { model: "iPhone 18 Pro" });

  assert.equal(evidence.total, 5);
  assert.equal(evidence.items.length, 5);
  assert.equal(JSON.stringify(evidence).includes("Galaxy A25"), false);
});
