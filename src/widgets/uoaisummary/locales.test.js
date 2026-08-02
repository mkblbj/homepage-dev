import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

import { METRIC_DEFINITIONS } from "./metrics.mjs";

function keys(value, prefix = "") {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === "object" ? keys(child, path) : [path];
  });
}

it("keeps every uoaisummary UI key aligned across ja, zh-Hans, and en", () => {
  const read = (locale) =>
    JSON.parse(readFileSync(resolve("public/locales", locale, "common.json"), "utf8")).uoaisummary;
  const ja = keys(read("ja")).sort();

  expect(keys(read("zh-Hans")).sort()).toEqual(ja);
  expect(keys(read("en")).sort()).toEqual(ja);
});

// Derived so that adding a metric without adding its label fails here.
const METRIC_KEYS = METRIC_DEFINITIONS.map(([key]) => key);

it("labels every metric key in every locale", () => {
  ["ja", "zh-Hans", "en"].forEach((locale) => {
    const uoaisummary = JSON.parse(readFileSync(resolve("public/locales", locale, "common.json"), "utf8")).uoaisummary;
    METRIC_KEYS.forEach((key) => {
      expect(uoaisummary.metric[key], `${locale} is missing ${key}`).toBeTruthy();
    });
  });
});

it("drops the copy for the removed blocks", () => {
  ["ja", "zh-Hans", "en"].forEach((locale) => {
    const uoaisummary = JSON.parse(readFileSync(resolve("public/locales", locale, "common.json"), "utf8")).uoaisummary;
    expect(uoaisummary.reviewThemes).toBeUndefined();
    expect(uoaisummary.coverage).toBeUndefined();
    expect(uoaisummary.showDetails).toBeUndefined();
    expect(uoaisummary.hideDetails).toBeUndefined();
  });
});
