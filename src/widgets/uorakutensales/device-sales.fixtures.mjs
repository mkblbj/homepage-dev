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
        {
          shopName: "松武",
          configured: true,
          status: "not_ready",
          stale: false,
          metricsReady: false,
          totals: null,
          types: null,
        },
        unconfigured(),
      ],
    },
  };
}

// One month whose three payloads agree — today is inside this month and the
// month board already holds today's sales — for the 失速 view. Only the company
// case boards move; films and sets stay empty on every side.
export function slowingDeviceSales() {
  const daily = dailyDeviceSales();
  const monthly = monthlyDeviceSales();
  daily.types = deviceTypes([
    ["Galaxy A25", 6, 7200, 6],
    ["arrows We3", 2, 2400, 2],
    ["Rising", 2, 2400, 2],
  ]);
  monthly.currentMonth.types = deviceTypes([
    ["Galaxy A25", 60, 72000, 58],
    ["Rising", 32, 38400, 30],
    ["arrows We3", 20, 24000, 19],
  ]);
  monthly.previousMonth.types = deviceTypes([
    ["Galaxy A25", 420, 504000, 400],
    ["arrows We3", 300, 360000, 290],
    ["Rising", 90, 108000, 88],
    ["DIGNO BX3", 60, 72000, 58],
    ["Tiny", 20, 24000, 20],
  ]);
  daily.totals = totalsOf(daily.types);
  monthly.currentMonth.totals = totalsOf(monthly.currentMonth.types);
  monthly.previousMonth.totals = totalsOf(monthly.previousMonth.types);
  return { daily, monthly };
}

// A case-style split under a parent board: 手帳型 (folio), 普通 (standard) and
// 不明 (unknown) sub-boards, rows as in deviceBoard. The parent keeps its own
// rows and totals — its distinct orders are not the sum of the styles'.
export function withStyles(board, { folio = [], standard = [], unknown = [] } = {}, styleCoveragePercent = 100) {
  const styles = { folio: deviceBoard(folio), standard: deviceBoard(standard), unknown: deviceBoard(unknown) };
  styles.unknown.unclassifiedProducts = [];
  return { ...board, styleCoveragePercent, styles };
}

// Today and both months with the case and set boards split by style — the
// company everywhere, shop 3911 this month. Last month holds 8 units of
// unconfirmed style; this month none.
export function styledDeviceSales() {
  const daily = dailyDeviceSales();
  const monthly = monthlyDeviceSales();
  const now = monthly.currentMonth;
  const before = monthly.previousMonth;
  daily.types.case = withStyles(daily.types.case, {
    folio: [
      ["iPhone 17", 8, 8800, 6],
      ["OPPO Reno13 A", 4, 14190, 4],
    ],
    standard: [
      ["iPhone 17", 2, 2200, 1],
      [COMPAT_SE, 2, 2200, 2, "compatibility"],
    ],
  });
  now.types.case = withStyles(now.types.case, {
    folio: [
      ["Google Pixel 10a", 50, 65000, 48],
      ["iPhone 17 e", 40, 54000, 39],
      ["Galaxy A25", 20, 24000, 19],
    ],
    standard: [
      ["Galaxy A25", 46, 55200, 42],
      ["Google Pixel 10a", 24, 31200, 23],
      ["iPhone 17 e", 10, 13500, 10],
    ],
  });
  now.types.case_film_set = withStyles(deviceBoard([["AQUOS wish4", 12, 30000, 12]]), {
    standard: [["AQUOS wish4", 12, 30000, 12]],
  });
  now.totals = totalsOf(now.types);
  now.shops[0].types.case = withStyles(now.shops[0].types.case, {
    folio: [["Galaxy A25", 10, 12000, 10]],
    standard: [["Galaxy A25", 30, 36000, 29]],
  });
  before.types.case = withStyles(
    before.types.case,
    {
      folio: [
        ["Galaxy A25", 300, 360000, 280],
        ["Google Pixel 10a", 200, 260000, 185],
        ["iPhone 17", 146, 160600, 136],
      ],
      standard: [
        ["Google Pixel 10a", 124, 161200, 117],
        ["Galaxy A25", 120, 144000, 112],
        ["iPhone 17", 100, 110000, 96],
      ],
      unknown: [["Galaxy A25", 8, 9600, 8]],
    },
    99.2,
  );
  return { daily, monthly };
}

// slowingDeviceSales with the case boards split by style on all three sides:
// folio Galaxy A25 slows from 10 to 4.5 a day, standard arrows We3 from 6.7 to 1
export function styledSlowingDeviceSales() {
  const { daily, monthly } = slowingDeviceSales();
  daily.types.case = withStyles(daily.types.case, {
    folio: [
      ["Galaxy A25", 3, 3600, 3],
      ["arrows We3", 2, 2400, 2],
    ],
    standard: [
      ["Galaxy A25", 3, 3600, 3],
      ["Rising", 2, 2400, 2],
    ],
  });
  monthly.currentMonth.types.case = withStyles(monthly.currentMonth.types.case, {
    folio: [
      ["Galaxy A25", 30, 36000, 29],
      ["arrows We3", 14, 16800, 13],
    ],
    standard: [
      ["Rising", 32, 38400, 30],
      ["Galaxy A25", 30, 36000, 29],
      ["arrows We3", 6, 7200, 6],
    ],
  });
  monthly.previousMonth.types.case = withStyles(monthly.previousMonth.types.case, {
    folio: [
      ["Galaxy A25", 300, 360000, 285],
      ["arrows We3", 100, 120000, 95],
    ],
    standard: [
      ["arrows We3", 200, 240000, 195],
      ["Galaxy A25", 120, 144000, 115],
      ["Rising", 90, 108000, 88],
      ["DIGNO BX3", 60, 72000, 58],
      ["Tiny", 20, 24000, 20],
    ],
  });
  return { daily, monthly };
}

// GET /api/market-rankings/device-models as the server sends it (schemaVersion
// 2), evidence and full sources included
export function marketDeviceModels() {
  const ranks = [
    [1, "iPhone 17", 100, [100, 100, 100]],
    [2, "Galaxy A25", 85.14, [96.09, 64.72, 88.4]],
    [3, "iPhone 18 Pro", 74.14, [87.28, 58.95, 64.09]],
    [4, "Google Pixel 10a", 56.54, [81.48, 0, 78.99]],
    [5, "iPhone Air", 8.5, [12.4, 0, 6.1]],
  ].map(([rank, model, score, [rakutenProducts, yahooSearch, yahooProducts]]) => ({
    rank,
    model,
    score,
    sourceScores: { rakutenProducts, yahooSearch, yahooProducts },
    observedDays: 6,
    productCount: 40 - rank,
    multiModelProductCount: 30 - rank,
    keywordCount: rank === 1 ? 1 : 0,
    bestProductRank: rank,
    bestSearchRank: rank === 1 ? 49 : null,
    evidenceIds: [`rakuten:560271:daily|shop:${rank}`, `yahoo:38347:trend|shop:${rank}`],
  }));
  // iPhone 18 Pro carries a full evidence trail (one id has dropped out of
  // the evidence list); the other rows point at ids this payload leaves out
  ranks[2].evidenceIds = [
    "rakuten:560271:realtime|peak:1",
    "yahoo:38347:trend|iface:1",
    "rakuten:560271:realtime|iface:2",
    "yahoo:all:ranking|iphone18pro ケース",
    "rakuten:560271:daily|odd:1",
    "rakuten:560271:daily|gone:1",
  ];
  const eleven = [
    "iPhone 18 Pro",
    "iPhone 18 Pro Max",
    "iPhone 17",
    "iPhone 17 Pro",
    "iPhone 17 Pro Max",
    "iPhone 17 e",
    "iPhone 16",
    "iPhone 16 Pro",
    "iPhone 16 e",
    "iPhone 15",
    "iPhone 14",
  ];
  const seen = (date, sourceRank, models, collectionMode = "live_snapshot") => ({
    date,
    sourceRank,
    models,
    modelShare: 1 / models.length,
    scope: "phone-case-interest",
    collectionMode,
  });
  const source = (recordedDays, modelCount) => ({
    configured: true,
    status: "observed",
    partial: true,
    recordedDays,
    recordedDates: ["2026-10-07"],
    expectedDays: 38,
    missingDates: ["2026-09-01"],
    modelCount,
    capturedItemCount: 303,
    boards: [{ key: "rakuten:560271:daily", genreId: "560271", period: "daily", capturedItemCount: 100 }],
    ranks: [{ rank: 1, model: "iPhone 17", score: 100 }],
    unassignedItems: [{ title: "全機種対応 ケース" }],
    latestStatus: "ready",
    stale: false,
    lastError: null,
  });
  return {
    schemaVersion: 2,
    referenceOnly: true,
    ok: true,
    partial: true,
    timezone: "Asia/Tokyo",
    productType: "case",
    generatedAtJST: "2026-10-08 15:06:20 JST",
    semantics: "phone_case_model_demand_reference_from_products_and_search",
    scoreWeights: { rakutenProducts: 0.5, yahooSearch: 0.3, yahooProducts: 0.2 },
    startDate: "2026-09-01",
    endDate: "2026-10-08",
    status: "observed",
    recordedDays: 7,
    expectedDays: 38,
    recordedDates: ["2026-09-05", "2026-10-07", "2026-10-08"],
    missingDates: ["2026-09-01", "2026-09-02"],
    ranks,
    evidence: [
      {
        id: "rakuten:560271:daily|shop:1",
        provider: "rakuten",
        type: "product",
        itemName: "iPhone17 ケース 手帳型",
        itemUrl: "https://item.rakuten.co.jp/shop/item-1/",
        observations: [{ date: "2026-10-07", sourceRank: 1, models: ["iPhone 17"], modelShare: 1 }],
      },
      {
        id: "rakuten:560271:realtime|peak:1",
        group: "rakutenProducts",
        provider: "rakuten",
        boardKey: "rakuten:560271:realtime",
        genreId: "560271",
        period: "realtime",
        type: "product",
        itemCode: "peak:1",
        itemName: "ピークデザイン エブリデイ ケース iPhone 18 Pro",
        itemUrl: "https://item.rakuten.co.jp/peak/case-18pro/",
        observations: [seen("2026-10-07", 39, ["iPhone 18 Pro"])],
      },
      {
        id: "yahoo:38347:trend|iface:1",
        group: "yahooProducts",
        provider: "yahoo",
        boardKey: "yahoo:38347:trend",
        genreId: "38347",
        period: "trend",
        type: "product",
        itemCode: "iface:1",
        itemName: "iFace 公式 iPhone18pro ケース iPhone17 iPhone 17e",
        itemUrl: "https://store.shopping.yahoo.co.jp/iface/18pro.html",
        observations: [seen("2026-10-08", 5, ["iPhone 18 Pro", "iPhone 17", "iPhone 17 e", "iPhone 16"])],
      },
      {
        id: "rakuten:560271:realtime|iface:2",
        group: "rakutenProducts",
        provider: "rakuten",
        boardKey: "rakuten:560271:realtime",
        genreId: "560271",
        period: "realtime",
        type: "product",
        itemCode: "iface:2",
        itemName: "【クーポン配布中】iFace公式 iPhone18Pro iPhone18ProMax iPhone17",
        itemUrl: "https://item.rakuten.co.jp/iface/18pro-set/",
        observations: [seen("2026-10-06", 2, eleven), seen("2026-10-07", 1, eleven)],
      },
      {
        id: "yahoo:all:ranking|iphone18pro ケース",
        group: "yahooSearch",
        provider: "yahoo",
        boardKey: "yahoo:all:ranking",
        genreId: "",
        period: "ranking",
        type: "keyword",
        query: "iphone18pro ケース",
        url: "https://shopping.yahoo.co.jp/search/iphone18pro+%E3%82%B1%E3%83%BC%E3%82%B9/1/?ei=UTF-8",
        sourceScore: 52,
        observations: [seen("2026-10-08", 141, ["iPhone 18 Pro"])],
      },
      {
        id: "rakuten:560271:daily|odd:1",
        group: "rakutenProducts",
        provider: "rakuten",
        boardKey: "rakuten:560271:daily",
        genreId: "560271",
        period: "daily",
        type: "product",
        itemCode: "odd:1",
        itemName: "リンクの壊れた商品",
        itemUrl: "javascript:alert(1)",
        observations: [seen("2026-10-05", 50, ["iPhone 18 Pro"], "partial_archive")],
      },
    ],
    sources: { rakuten: source(7, 4), yahoo: source(1, 3) },
  };
}
