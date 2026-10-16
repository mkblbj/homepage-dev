import assert from "node:assert/strict";
import test from "node:test";

import { formatClock, formatLongDate, formatMd, jstNow, jstTimeFromIso, parseJstStamp } from "./tv-time.mjs";

test("formatMd and formatLongDate read the weekday of the date itself", () => {
  assert.equal(formatMd("2026-10-16"), "10/16(金)");
  assert.equal(formatLongDate("2026-10-17"), "10月17日(土)");
  assert.equal(formatMd("bad"), "");
  assert.equal(formatMd(null), "");
});

test("jstTimeFromIso turns a UTC record time into a JST clock reading", () => {
  assert.equal(jstTimeFromIso("2026-10-15T07:13:01.000Z"), "16:13");
  assert.equal(jstTimeFromIso("nope"), null);
  assert.equal(jstTimeFromIso(null), null);
});

test("parseJstStamp accepts both upstream timestamp styles", () => {
  assert.equal(parseJstStamp("2026-10-16 13:47 JST"), Date.parse("2026-10-16T13:47:00+09:00"));
  assert.equal(parseJstStamp("2026-10-16 13:14:32"), Date.parse("2026-10-16T13:14:32+09:00"));
  assert.equal(parseJstStamp(null), null);
  assert.equal(parseJstStamp("soon"), null);
});

test("jstNow reads Tokyo time whatever the machine's zone", () => {
  const now = jstNow(new Date("2026-10-15T15:05:00Z"));
  assert.equal(now.ymd, "2026-10-16");
  assert.equal(now.minutes, 5);
  assert.equal(now.weekday, "金");
  assert.equal(formatClock(new Date("2026-10-16T04:15:00Z")), "13:15");
});
