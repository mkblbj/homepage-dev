import assert from "node:assert/strict";
import test from "node:test";

import { classifyFreshness, FRESHNESS, worstState } from "./freshness.mjs";

const now = Date.parse("2026-10-16T14:00:00+09:00");

test("shipping data turns delayed after 5 minutes and unavailable after an hour", () => {
  assert.equal(classifyFreshness({ stampMs: now - 4 * 60e3, nowMs: now, ...FRESHNESS.shipping }), "ok");
  assert.equal(classifyFreshness({ stampMs: now - 6 * 60e3, nowMs: now, ...FRESHNESS.shipping }), "delayed");
  assert.equal(classifyFreshness({ stampMs: now - 61 * 60e3, nowMs: now, ...FRESHNESS.shipping }), "unavailable");
});

test("never having data is unavailable, not ok", () => {
  assert.equal(classifyFreshness({ stampMs: null, nowMs: now }), "unavailable");
});

test("the AI summary goes late after two hours and disappears after six", () => {
  assert.equal(classifyFreshness({ stampMs: now - 90 * 60e3, nowMs: now, ...FRESHNESS.aiSummary }), "ok");
  assert.equal(classifyFreshness({ stampMs: now - 3 * 3600e3, nowMs: now, ...FRESHNESS.aiSummary }), "delayed");
  assert.equal(classifyFreshness({ stampMs: now - 7 * 3600e3, nowMs: now, ...FRESHNESS.aiSummary }), "unavailable");
});

test("two halves of one panel show the worse of their states", () => {
  assert.equal(worstState("ok", "unavailable"), "unavailable");
  assert.equal(worstState("ok", "loading"), "loading");
  assert.equal(worstState("delayed", "ok"), "delayed");
  assert.equal(worstState("loading", "unavailable"), "unavailable");
  assert.equal(worstState("ok", "unconfigured"), "ok");
  assert.equal(worstState("unconfigured", "unconfigured"), "unconfigured");
});

test("a source without a delay threshold is ok until it must hide", () => {
  assert.equal(classifyFreshness({ stampMs: now - 59 * 60e3, nowMs: now, ...FRESHNESS.attention }), "ok");
  assert.equal(classifyFreshness({ stampMs: now - 61 * 60e3, nowMs: now, ...FRESHNESS.attention }), "unavailable");
});
