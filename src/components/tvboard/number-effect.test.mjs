import assert from "node:assert/strict";
import test from "node:test";

import { numberEffect } from "./number-effect.mjs";

test("the first known value never animates", () => {
  assert.deepEqual(numberEffect(undefined, 248), { animate: false, delta: null });
  assert.deepEqual(numberEffect(null, 248), { animate: false, delta: null });
});

test("an unchanged value stays still", () => {
  assert.deepEqual(numberEffect(248, 248), { animate: false, delta: null });
});

test("a rise rolls and reports how much it rose", () => {
  assert.deepEqual(numberEffect(248, 251), { animate: true, delta: 3 });
});

test("a correction downwards rolls without a delta", () => {
  assert.deepEqual(numberEffect(251, 249), { animate: true, delta: null });
});

test("losing the value is not a change to animate", () => {
  assert.deepEqual(numberEffect(248, null), { animate: false, delta: null });
});
