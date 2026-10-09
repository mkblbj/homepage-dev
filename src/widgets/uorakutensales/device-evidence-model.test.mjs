import assert from "node:assert/strict";
import test from "node:test";

import { buildDeviceEvidence, rankDeviceEvidence } from "./device-evidence-model.mjs";
import { ownDeviceEvidence } from "./device-sales.fixtures.mjs";
import { shapeProxyResponse } from "./proxy-config.mjs";

// what the widget receives: the server's list, slimmed by the proxy
const ready = () => buildDeviceEvidence(shapeProxyResponse("devicesEvidence", ownDeviceEvidence()));

test("buildDeviceEvidence says whether the 内訳 is loading, failed or ready", () => {
  assert.equal(buildDeviceEvidence(undefined).status, "loading");
  assert.equal(buildDeviceEvidence(null).status, "loading");
  // the proxy relays a failed read as { error }; a payload without a list is no list either
  assert.equal(buildDeviceEvidence({ error: { message: "Rakuten sales service error" } }).status, "failed");
  assert.equal(buildDeviceEvidence({ ok: true }).status, "failed");
  // no shop in range: ok false, no summary, an empty list
  const empty = buildDeviceEvidence({
    ok: false,
    summary: null,
    evidence: [],
    pagination: { totalItems: 0, hasMore: false },
  });
  assert.equal(empty.status, "ready");
  assert.deepEqual(empty.rows, []);
  assert.deepEqual(empty.summary, { units: null, sales: null, orders: null });
});

test("buildDeviceEvidence keeps the summary, the row count and how each row was recognized", () => {
  const evidence = ready();

  assert.equal(evidence.status, "ready");
  // the scope's distinct orders come from the server, never from adding rows (3+3+1+2)
  assert.deepEqual(evidence.summary, { units: 11, sales: 13660, orders: 8 });
  assert.equal(evidence.total, 4);
  assert.equal(evidence.more, false);
  assert.deepEqual(evidence.basis, {
    device: { selection: 2, title: 2 },
    style: { "same-shop-product-history": 1, title: 1, "verified-series": 1, unresolved: 1 },
  });
  assert.deepEqual(
    evidence.rows.find((r) => r.id === "b2"),
    {
      id: "b2",
      shop: "天海",
      itemNumber: "■102-全機種対応",
      title: "iphone17 ケース 手帳型 WE2 WE3 GalaxyA37",
      units: 2,
      sales: 1980,
      orders: 1,
      device: {
        source: "selection",
        option: { source: "selected-choice", key: "●iPhone シリ-ズ", value: "iPhone 17" },
      },
      style: {
        key: "folio",
        source: "verified-series",
        rule: "verified-folio-series",
        text: "102",
        example: "https://item.rakuten.co.jp/0406colors/18cls01-zenfone9/",
        history: null,
      },
    },
  );
  const history = evidence.rows.find((r) => r.id === "c3");
  assert.equal(history.style.history, "iPhone 17 手帳型 ケース レザー");
  assert.deepEqual(history.device.option, { source: "sku", key: "機種", value: "iPhone 17" });
  assert.equal(evidence.rows.find((r) => r.id === "a1").device.option, null);
  assert.equal(evidence.rows.find((r) => r.id === "d4").style.rule, "missing-case-style");
});

test("a film row has no case style, and an example that is no web page is dropped", () => {
  const raw = ownDeviceEvidence();
  raw.evidence = raw.evidence.map((row) =>
    row.id === "b2"
      ? {
          ...row,
          caseStyleEvidence: {
            ...row.caseStyleEvidence,
            references: [{ kind: "series-example", url: "javascript:alert(1)" }],
          },
        }
      : { ...row, type: "film", caseStyle: null, caseStyleEvidence: null },
  );
  const evidence = buildDeviceEvidence(raw);

  assert.equal(evidence.rows.find((r) => r.id === "b2").style.example, null);
  assert.ok(evidence.rows.filter((r) => r.id !== "b2").every((r) => r.style === null));
  assert.deepEqual(evidence.basis.style, { "verified-series": 1 });
});

test("rankDeviceEvidence orders the rows by the metric on screen", () => {
  const { rows } = ready();

  assert.deepEqual(
    rankDeviceEvidence(rows, "units").map((r) => r.id),
    ["c3", "a1", "b2", "d4"],
  );
  assert.deepEqual(
    rankDeviceEvidence(rows, "sales").map((r) => r.id),
    ["c3", "a1", "d4", "b2"],
  );
  // equal orders: more pieces first
  assert.deepEqual(
    rankDeviceEvidence(rows, "orders").map((r) => r.id),
    ["c3", "a1", "d4", "b2"],
  );
  // a row whose money is not in yet sinks instead of reading as zero
  const pending = rows.map((r) => (r.id === "c3" ? { ...r, sales: null } : r));
  assert.deepEqual(
    rankDeviceEvidence(pending, "sales").map((r) => r.id),
    ["a1", "d4", "b2", "c3"],
  );
});
