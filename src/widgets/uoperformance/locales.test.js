import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const LOCALES = ["en", "ja", "zh-Hans"];
const NS = "uoperformance";

function loadNamespace(locale) {
  const filePath = path.join(process.cwd(), "public", "locales", locale, "common.json");

  return JSON.parse(fs.readFileSync(filePath, "utf8"))[NS];
}

function flatten(value, prefix = "") {
  if (value === null || typeof value !== "object") {
    return [prefix];
  }

  return Object.entries(value).flatMap(([key, child]) => flatten(child, prefix ? `${prefix}.${key}` : key));
}

describe("widgets/uoperformance/locales", () => {
  it("defines the namespace in every locale", () => {
    for (const locale of LOCALES) {
      expect(loadNamespace(locale), `${locale} is missing ${NS}`).toBeTruthy();
    }
  });

  it("uses an identical key set across locales", () => {
    const reference = flatten(loadNamespace("ja")).sort();

    expect(reference.length).toBeGreaterThan(40);

    for (const locale of LOCALES) {
      expect(flatten(loadNamespace(locale)).sort(), `${locale} key set mismatch`).toEqual(reference);
    }
  });

  it("has no empty strings", () => {
    for (const locale of LOCALES) {
      const namespace = loadNamespace(locale);

      for (const key of flatten(namespace)) {
        const value = key.split(".").reduce((node, part) => node[part], namespace);

        expect(String(value).trim(), `${locale}.${key} is empty`).not.toBe("");
      }
    }
  });

  it("defines every trend label and both positive and negative thresholds", () => {
    const trendKeys = ["decrease", "increase", "sharp_decrease", "stable", "surge", "unknown"];

    for (const locale of LOCALES) {
      const namespace = loadNamespace(locale);

      expect(Object.keys(namespace.trend).sort(), `${locale}.trend keys mismatch`).toEqual(trendKeys);
      for (const threshold of ["+20", "+35", "−20", "−35"]) {
        expect(namespace.thresholds, `${locale}.thresholds lost ${threshold}`).toContain(threshold);
      }
    }
  });

  it("keeps every interpolation placeholder in every locale", () => {
    const cases = [
      ["subtitle", "{{count}}"],
      ["perVisitor", "{{n}}"],
      ["vsMedian", "{{value}}"],
      ["sampleOk", "{{n}}"],
      ["sampleShort", "{{n}}"],
      ["covered", "{{covered}}"],
      ["covered", "{{total}}"],
    ];

    for (const locale of LOCALES) {
      const namespace = loadNamespace(locale);

      for (const [key, placeholder] of cases) {
        expect(namespace[key], `${locale}.${key} lost ${placeholder}`).toContain(placeholder);
      }
    }
  });
});
