import assert from "node:assert/strict";
import test from "node:test";

import { fitStage, parseDisplayOptions } from "./display-options.mjs";

test("the TV keeps the whole screen and hides the cursor", () => {
  assert.deepEqual(parseDisplayOptions({}), {
    desktop: false,
    hideCursor: true,
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  });
});

test("desktop mode leaves room for the taskbar and one column of icons, and keeps the cursor", () => {
  assert.deepEqual(parseDisplayOptions({ desktop: "1" }), {
    desktop: true,
    hideCursor: false,
    insets: { top: 0, right: 0, bottom: 56, left: 96 },
  });
});

test("each margin can be set from the URL, within sane bounds", () => {
  const options = parseDisplayOptions({ desktop: "1", left: "200", bottom: "48", top: "12", right: "-5" });
  assert.deepEqual(options.insets, { top: 12, right: 0, bottom: 48, left: 200 });
  assert.equal(parseDisplayOptions({ desktop: "1", left: "9999" }).insets.left, 600);
  assert.equal(parseDisplayOptions({ desktop: "1", left: "abc" }).insets.left, 96);
});

test("margins only apply in desktop mode", () => {
  assert.deepEqual(parseDisplayOptions({ left: "200" }).insets, { top: 0, right: 0, bottom: 0, left: 0 });
  assert.equal(parseDisplayOptions({ desktop: "0" }).desktop, false);
  assert.equal(parseDisplayOptions({ desktop: "true" }).desktop, true);
});

test("the board fits the space left inside the margins, centred there", () => {
  assert.deepEqual(fitStage(1920, 1080, { top: 0, right: 0, bottom: 0, left: 0 }), { scale: 1, left: 0, top: 0 });

  const desktop = fitStage(1920, 1080, { top: 0, right: 0, bottom: 56, left: 96 });
  assert.equal(desktop.scale, 1024 / 1080);
  assert.equal(Math.round(desktop.left), 98);
  assert.equal(desktop.top, 0);

  const wide = fitStage(2560, 1080, { top: 0, right: 0, bottom: 0, left: 0 });
  assert.equal(wide.scale, 1);
  assert.equal(wide.left, 320);
});
