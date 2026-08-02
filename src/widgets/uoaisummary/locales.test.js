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

const METRIC_KEYS = [
  "shipping.today_output.total",
  "shipping.active_shops",
  "shipping.tomorrow.total",
  "attention.open_total",
  "attention.pending_orders",
  "attention.unanswered_inquiries",
  "attention.overdue_inquiries",
  "attention.unreplied_reviews",
  "sales.realtime_yen",
  "sales.orders",
  "sales.aov_yen",
  "sales.realtime_vs_seven_day_avg_percent",
  "performance.traffic.visit",
  "performance.traffic.delta_percent",
  "performance.mix.new_sales_share",
];

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
