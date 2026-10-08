/*
 * Small payloads shaped like uo-ec-manager's device-sales API (schemaVersion 1,
 * with salesYen / orderCount), shared by the model, section and widget tests.
 * Every factory returns fresh objects, so a test can bend one field without
 * leaking into the next.
 */

export const COMPAT_SE = "iPhone SE（第2代） / iPhone SE（第3代）（多机型）";
// a real seven-model combination row (2026-10, case board, rank 246)
export const COMPAT_LONG =
  "BASIO active 3 / Google Pixel 9 Pro / Google Pixel 9a / iPhone 16 e / Libero 5G IV / Motorola g24 / らくらくスマートフォン F-53E（多机型）";

const METRIC_DEFINITIONS = {
  salesYen: "tax_inclusive_item_amount_before_order_discounts_excluding_shipping",
  orderCount: "distinct_orders_containing_the_model_or_category",
  unitsSold: "ordered_item_units",
};

// one category board; rows are [model, unitsSold, salesYen, orderCount, kind?]
export function deviceBoard(rows = []) {
  const ranks = rows.map(([model, unitsSold, salesYen, orderCount, kind = "single"], i) => ({
    rank: i + 1,
    model,
    unitsSold,
    salesYen,
    orderCount,
    kind,
  }));
  const sum = (key, list = ranks) => list.reduce((total, r) => total + r[key], 0);
  const units = sum("unitsSold");
  const compat = sum(
    "unitsSold",
    ranks.filter((r) => r.kind === "compatibility"),
  );
  return {
    totalUnits: units,
    singleModelUnits: units - compat,
    compatibilityUnits: compat,
    unresolvedUnits: 0,
    salesYen: sum("salesYen"),
    orderCount: sum("orderCount"),
    assignedSalesYen: sum("salesYen"),
    unresolvedSalesYen: 0,
    assignedUnits: units,
    metricsReady: true,
    coveragePercent: units > 0 ? 100 : 0,
    singleModelPercent: units > 0 ? Math.round(((units - compat) / units) * 10000) / 100 : 0,
    modelCount: ranks.length,
    ranks,
    unresolved: [],
  };
}

export function deviceTypes(caseRows = [], filmRows = [], setRows = []) {
  return { case: deviceBoard(caseRows), film: deviceBoard(filmRows), case_film_set: deviceBoard(setRows) };
}

export function totalsOf(types) {
  const boards = Object.values(types);
  const sum = (key) => boards.reduce((total, b) => total + b[key], 0);
  return {
    allUnits: sum("totalUnits") + 2,
    activeUnits: sum("totalUnits"),
    excludedCancelledUnits: 2,
    excludedCancellationPendingUnits: 0,
    excludedOtherProductUnits: 0,
    unitsSold: sum("totalUnits"),
    salesYen: sum("salesYen"),
    orderCount: sum("orderCount"),
  };
}

function coverage(extra = {}) {
  return {
    shopCount: 3,
    configuredShopCount: 2,
    coveredShopCount: 2,
    updatedShopCount: 2,
    staleShopCount: 0,
    unconfiguredShopNames: ["kurumu"],
    unavailableShopNames: ["kurumu"],
    ...extra,
  };
}

function shop(shopName, types, extra = {}) {
  return {
    shopName,
    configured: true,
    status: "ready",
    stale: false,
    metricsReady: true,
    sourceUpdatedAtJST: "2026-10-07 16:58:59 JST",
    lastError: null,
    totals: totalsOf(types),
    types,
    ...extra,
  };
}

function unconfigured() {
  return { shopName: "kurumu", configured: false, status: "unconfigured", stale: false, totals: null, types: null };
}

export function dailyDeviceSales() {
  const types = deviceTypes(
    [
      ["iPhone 17", 10, 11000, 7],
      ["OPPO Reno13 A", 4, 14190, 4],
      [COMPAT_SE, 2, 2200, 2, "compatibility"],
    ],
    [["AQUOS wish4", 32, 31680, 30]],
  );
  return {
    schemaVersion: 1,
    timezone: "Asia/Tokyo",
    source: "rakuten-order-api",
    metricDefinitions: { ...METRIC_DEFINITIONS },
    generatedAtJST: "2026-10-07 16:59:03 JST",
    coverage: coverage({ updatedShopCount: 1, staleShopCount: 1 }),
    refresh: { state: "idle", autoRefreshIntervalMinutes: 15, reconciliation: "daily" },
    ok: true,
    partial: true,
    metricsReady: true,
    status: "provisional",
    sourceDateJST: "2026-10-07",
    startDate: "2026-10-07",
    endDate: "2026-10-07",
    sourceUpdatedAtJST: "2026-10-07 16:58:59 JST",
    totals: totalsOf(types),
    types,
    shops: [
      shop(
        "3911",
        deviceTypes(
          [
            ["iPhone 17", 10, 11000, 7],
            ["OPPO Reno13 A", 4, 14190, 4],
          ],
          [["AQUOS wish4", 32, 31680, 30]],
        ),
      ),
      shop("松武", deviceTypes([[COMPAT_SE, 2, 2200, 2, "compatibility"]]), {
        status: "stale",
        stale: true,
        sourceUpdatedAtJST: "2026-10-07 15:40:12 JST",
        lastError: "RMS timeout",
      }),
      unconfigured(),
    ],
  };
}

export function monthlyDeviceSales() {
  const thisMonth = deviceTypes([
    ["Google Pixel 10a", 74, 96200, 70],
    ["Galaxy A25", 66, 79200, 60],
    ["iPhone 17 e", 50, 67500, 48],
  ]);
  const lastMonth = deviceTypes([
    ["Galaxy A25", 428, 513600, 400],
    ["Google Pixel 10a", 324, 421200, 300],
    ["iPhone 17", 246, 270600, 230],
  ]);
  return {
    schemaVersion: 1,
    timezone: "Asia/Tokyo",
    source: "rakuten-order-api",
    metricDefinitions: { ...METRIC_DEFINITIONS },
    generatedAtJST: "2026-10-07 16:59:03 JST",
    coverage: { shopCount: 3, configuredShopCount: 2 },
    refresh: { state: "idle", autoRefreshIntervalMinutes: 15, reconciliation: "daily" },
    ok: true,
    partial: true,
    metricsReady: true,
    currentMonth: {
      ok: true,
      partial: true,
      metricsReady: true,
      status: "provisional",
      month: "2026-10",
      startDate: "2026-10-01",
      endDate: "2026-10-07",
      coverage: coverage(),
      sourceUpdatedAtJST: "2026-10-07 16:58:59 JST",
      totals: totalsOf(thisMonth),
      types: thisMonth,
      shops: [
        shop("3911", deviceTypes([["Galaxy A25", 40, 48000, 38]])),
        shop("松武", deviceTypes([["Google Pixel 10a", 30, 39000, 29]])),
        unconfigured(),
      ],
    },
    previousMonth: {
      ok: true,
      partial: true,
      metricsReady: true,
      status: "provisional",
      month: "2026-09",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      coverage: coverage({ coveredShopCount: 1, unavailableShopNames: ["松武", "kurumu"] }),
      sourceUpdatedAtJST: "2026-10-07 10:13:35 JST",
      totals: totalsOf(lastMonth),
      types: lastMonth,
      shops: [
        shop("3911", deviceTypes([["Galaxy A25", 200, 240000, 190]])),
        // read for this month, not yet for last month
        { shopName: "松武", configured: true, status: "not_ready", stale: false, metricsReady: false, totals: null, types: null },
        unconfigured(),
      ],
    },
  };
}
