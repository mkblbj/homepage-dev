import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("./announcement-banner.module.css", import.meta.url), "utf8");
const component = readFileSync(new URL("./announcement-banner.jsx", import.meta.url), "utf8");

test("announcement banner stays fixed to the viewport and preserves document flow", () => {
  assert.match(css, /\.announcement-banner\s*{[^}]*position:\s*fixed;/s);
  assert.match(css, /\.announcement-banner\s*{[^}]*top:\s*0;/s);
  assert.match(css, /\.announcement-banner\s*{[^}]*left:\s*0;/s);
  assert.match(css, /\.announcement-banner\s*{[^}]*right:\s*0;/s);
  assert.match(css, /\.announcement-banner-spacer\s*{[^}]*height:\s*40px;/s);
  assert.match(component, /announcement-banner-spacer/);
});

test("announcement banner is portaled outside transformed page wrappers", () => {
  assert.match(component, /createPortal/);
  assert.match(component, /document\.body/);
});
