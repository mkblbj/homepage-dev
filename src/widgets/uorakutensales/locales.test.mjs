import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const LOCALES = ["ja", "en", "zh-Hans"];

// Every key the component reads via t(`uorakutensales.<key>`).
const REQUIRED_KEYS = [
  "title",
  "subtitle",
  "updatedAt",
  "refresh",
  "statusLive",
  "statusDelayed",
  "statusStale",
  "todaySales",
  "asOf",
  "vsSevenDayAvg",
  "aov",
  "ordersUnit",
  "manUnit",
  "shopBreakdownLive",
  "sevenDay",
  "excludesToday",
  "dailyTrend",
  "avgLabel",
  "perDay",
  "shopTrend",
  "chartLine",
  "chartBar",
  "sevenDayAvgShare",
  "total",
  "noData",
  "bestSellers",
  "allShops",
  "shopsAggregated",
  "itemsCount",
  "showMore",
  "showLess",
  "unitsShort",
  "partialData",
  "sortOrders",
  "sortSales",
  "sortUnits",
  "allTimeRecords",
  "recordSales",
  "recordOrders",
  "shopBest",
  "peaksCoverage",
  "recordDayMark",
  "recordUnits",
  "unitsPerOrder",
  "noRecord",
  "unitsSince",
];

function loadNamespace(locale) {
  const filePath = path.join(process.cwd(), "public", "locales", locale, "common.json");
  const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return json.uorakutensales;
}

for (const locale of LOCALES) {
  test(`${locale} exposes the uorakutensales namespace with every key`, () => {
    const ns = loadNamespace(locale);
    assert.ok(ns, `${locale} is missing uorakutensales`);

    for (const key of REQUIRED_KEYS) {
      assert.equal(typeof ns[key], "string", `${locale}.${key} must be a string`);
    }
  });
}

test("interpolation placeholders are preserved across locales", () => {
  for (const locale of LOCALES) {
    const ns = loadNamespace(locale);
    assert.match(ns.subtitle, /\{\{count\}\}/, `${locale}.subtitle needs {{count}}`);
    assert.match(ns.asOf, /\{\{time\}\}/, `${locale}.asOf needs {{time}}`);
    assert.match(ns.vsSevenDayAvg, /\{\{avg\}\}/, `${locale}.vsSevenDayAvg needs {{avg}}`);
  }
});
