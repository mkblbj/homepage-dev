import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

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
