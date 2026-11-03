import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const LOCALES = ["en", "ja", "zh-Hans"];
const NS = "uovacuum";
const STATUSES = [
  "docked",
  "charging",
  "preparing",
  "washingMidway",
  "cleaning",
  "paused",
  "returning",
  "idle",
  "error",
  "offline",
];

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

describe("widgets/uovacuum/locales", () => {
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

  it("names every status the model can report", () => {
    for (const locale of LOCALES) {
      const ns = loadNamespace(locale);
      for (const status of STATUSES) {
        expect(ns.status[status], `${locale} status.${status}`).toBeTruthy();
        expect(ns.detail[status], `${locale} detail.${status}`).toBeTruthy();
      }
    }
  });

  it("keeps the interpolation placeholders", () => {
    for (const locale of LOCALES) {
      const ns = loadNamespace(locale);

      expect(ns.detail.error).toContain("{{code}}");
      expect(ns.consumables.low).toContain("{{part}}");
      expect(ns.consumables.low).toContain("{{percent}}");
    }
  });

  it("has no empty strings", () => {
    for (const locale of LOCALES) {
      const ns = loadNamespace(locale);
      for (const key of flatten(ns)) {
        const value = key.split(".").reduce((node, part) => node[part], ns);
        expect(value, `${locale}.${key}`).not.toBe("");
      }
    }
  });
});
