/*
 * 機種別販売 — framework-free view model for the device-model board.
 *
 * Two read-only snapshots from uo-ec-manager feed it:
 *   devices        → GET /api/device-sales          today; the server re-reads it every 15 min
 *   devicesMonthly → GET /api/device-sales/monthly  this month so far + last month
 *
 * Rows, categories and totals each carry three metrics:
 *   units  ← unitsSold   purchased quantities (a 2-film pack or a case+film set is 1)
 *   sales  ← salesYen    tax-inclusive item amount, before shipping/coupons/points
 *   orders ← orderCount  distinct orders — never summed across rows or categories
 * They count demand by order date; they are not the R-Karte sales in /api/sales,
 * so the two are never added together or compared.
 * Missing stays missing: no board → null, money not filled in yet → null, never 0.
 */

// tab order in the UI
export const DEVICE_PERIODS = Object.freeze(["today", "thisMonth", "lastMonth"]);
// the board opens on the month: a day's handful of sales rarely tells one model
// from the next, while the month (today included) ranks them clearly
export const DEFAULT_DEVICE_PERIOD = "thisMonth";
// category order in the UI, default first
export const DEVICE_TYPES = Object.freeze(["case", "film", "case_film_set"]);
// the API ranks by units, so units lead; the toggle re-ranks by the other two
export const DEVICE_METRICS = Object.freeze(["units", "sales", "orders"]);
export const DEFAULT_DEVICE_METRIC = DEVICE_METRICS[0];
// progressive reveal per category: 10 → 30 → every model that sold
export const DEVICE_STEPS = Object.freeze([10, 30, Infinity]);
// this many pieces per order reads as a bulk buy (the shop rows use the same bar)
export const BULK_PER_ORDER = 2;
// case styles in UI order — 手帳型, 普通, 不明 (style not confirmed); cases and
// case+film sets carry them, films do not
export const CASE_STYLES = Object.freeze(["folio", "standard", "unknown"]);

// the server tags combination rows with a Chinese "（多机型）" (a Japanese
// "（多機種）" is accepted too); the board draws its own localized badge from
// `kind`, so the tag comes off the display name
const COMPAT_TAG = /\s*[（(]多(?:[机機]型|機種)[）)]\s*$/;

function text(value) {
  return String(value ?? "").trim();
}

// null/undefined stay null ("not measured yet"); anything else becomes a number
function measured(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function displayModelName(model, kind) {
  const name = text(model);
  if (kind !== "compatibility") return name;
  return name.replace(COMPAT_TAG, "") || name;
}

// every model a combination row covers, in the API's order
export function compatParts(model) {
  return displayModelName(model, "compatibility")
    .split(" / ")
    .map((part) => part.trim())
    .filter(Boolean);
}

// the three metrics off any API container; boards name their units totalUnits
function metricsOf(source, unitsKey = "unitsSold") {
  return {
    units: measured(source?.[unitsKey]),
    sales: measured(source?.salesYen),
    orders: measured(source?.orderCount),
  };
}

function normalizeRow(row) {
  const kind = text(row?.kind);
  const fullModel = text(row?.model);
  const metrics = metricsOf(row);
  return {
    rank: measured(row?.rank) ?? 0,
    model: displayModelName(fullModel, kind),
    // the untouched API name: the key across periods
    fullModel,
    compat: kind === "compatibility",
    // what the row covers; a single model is a list of one
    models: kind === "compatibility" ? compatParts(fullModel) : [displayModelName(fullModel, kind)],
    ...metrics,
    perOrder: metrics.units != null && metrics.orders > 0 ? metrics.units / metrics.orders : null,
  };
}

function normalizeBoard(block) {
  const metrics = metricsOf(block, "totalUnits");
  return {
    ...metrics,
    // money and distinct orders can trail the quantities on a cold cache
    metricsReady: Boolean(block?.metricsReady) && metrics.sales != null && metrics.orders != null,
    modelCount: measured(block?.modelCount) ?? 0,
    singleModelPercent: measured(block?.singleModelPercent),
    unresolvedUnits: measured(block?.unresolvedUnits) ?? 0,
    // already ranked by the API (units desc, ties by model name)
    rows: (Array.isArray(block?.ranks) ? block.ranks : []).map(normalizeRow).filter((r) => r.fullModel),
    // the 手帳型 / 普通 / 不明 boards, each with its own distinct orders
    styles: normalizeStyles(block?.styles),
    // the share of units whose case style is confirmed — not the model coverage
    styleCoverage: measured(block?.styleCoveragePercent),
  };
}

function normalizeStyles(styles) {
  if (!styles || typeof styles !== "object") return null;
  return Object.fromEntries(CASE_STYLES.map((key) => [key, normalizeBoard(styles[key])]));
}

// null in, null out: a shop or period without boards was not read — it did not sell nothing
function normalizeTypes(types) {
  if (!types || typeof types !== "object") return null;
  const out = {};
  DEVICE_TYPES.forEach((key) => {
    out[key] = normalizeBoard(types[key]);
  });
  return out;
}

function normalizePeriod(key, block) {
  if (!block || typeof block !== "object") return null;
  const types = block.ok === false ? null : normalizeTypes(block.types);
  const shops = (Array.isArray(block.shops) ? block.shops : [])
    .map((s) => ({
      name: text(s?.shopName),
      stale: Boolean(s?.stale),
      totals: s?.totals ? metricsOf(s.totals) : null,
      types: normalizeTypes(s?.types),
    }))
    .filter((s) => s.name);
  const coverage = block.coverage || {};
  const missing = Array.isArray(coverage.unavailableShopNames) ? coverage.unavailableShopNames : [];
  return {
    key,
    // "2026-10-07" for today, "2026-10" for a month
    label: text(block.sourceDateJST || block.month),
    // the last day the period covers — today, for this month
    endDate: text(block.endDate),
    status: text(block.status) || "not_ready",
    ready: types !== null,
    // the source time — generatedAtJST moves even when a refresh fails
    updatedAt: text(block.sourceUpdatedAtJST),
    coveredShopCount: measured(coverage.coveredShopCount) ?? 0,
    shopCount: measured(coverage.shopCount) ?? 0,
    missingShops: missing.map(text).filter(Boolean),
    staleShops: shops.filter((s) => s.stale).map((s) => s.name),
    totals: types && block.totals ? metricsOf(block.totals) : null,
    types,
    // only shops with boards of their own get a chip
    shops: shops.filter((s) => s.types).map(({ name, totals, types: boards }) => ({ name, totals, types: boards })),
  };
}

// the proxy relays an upstream failure as { error } and the SWR fetcher does not
// throw — that shape means "endpoint unavailable", not "data still landing"
function usable(payload) {
  return payload && typeof payload === "object" && !payload.error ? payload : null;
}

// Build the device board from both snapshots. Null while no period has a readable
// board (still loading, endpoint missing, or nothing aggregated yet).
export function buildDeviceSales(daily, monthly) {
  const day = usable(daily);
  const month = usable(monthly);
  const periods = {
    today: normalizePeriod("today", day),
    thisMonth: normalizePeriod("thisMonth", month?.currentMonth),
    lastMonth: normalizePeriod("lastMonth", month?.previousMonth),
  };
  if (!DEVICE_PERIODS.some((key) => periods[key]?.ready)) return null;
  return {
    periods,
    // tabs that exist (ready or still landing), in UI order
    available: DEVICE_PERIODS.filter((key) => periods[key]),
    // the cache build each payload came from; equal stamps mean one build, so
    // today's board can be subtracted from this month's (the 失速 view does)
    builds: { daily: text(day?.generatedAtJST), monthly: text(month?.generatedAtJST) },
  };
}

// units are always measured; sales and orders only once the board has them
export function metricReady(board, metric) {
  return metric === "units" || Boolean(board?.metricsReady);
}

function byMetric(metric) {
  return (a, b) => {
    const av = a[metric];
    const bv = b[metric];
    if (av == null || bv == null) {
      if (av == null && bv == null) return a.rank - b.rank;
      return av == null ? 1 : -1;
    }
    return bv - av || a.rank - b.rank;
  };
}

// Rank one board by the metric on screen. The API rank (units desc, ties by
// model name) breaks ties, so the units view keeps the API's own order; rows the
// metric cannot measure yet sink to the bottom instead of reading as zero.
// 少ない順 ("asc") is the same ranking read from the bottom: a model keeps its
// rank number whichever way the board is read.
export function rankDeviceBoard(board, metric, order = "desc") {
  const sorted = [...(board?.rows || [])].sort(byMetric(metric));
  const top = sorted[0]?.[metric] ?? 0;
  const total = board?.[metric] ?? 0;
  const ranked = sorted.map((row, i) => {
    const value = row[metric];
    return {
      ...row,
      rank: i + 1,
      value,
      // a row's distinct orders are not a slice of the board's distinct orders,
      // so only sales and units get a share
      share: metric !== "orders" && value != null && total > 0 ? (value / total) * 100 : null,
      barPct: value != null && top > 0 ? Math.min(100, (value / top) * 100) : 0,
    };
  });
  return order === "asc" ? ranked.reverse() : ranked;
}

// The 3カテゴリ合計 bar: each category's slice of the metric on screen. Units
// and yen add up across categories; distinct orders do not (one order can hold
// a case and a film), so the 件数 view keeps the units split.
export function categoryMix(types, metric) {
  if (!types) return null;
  const by = metric === "orders" ? "units" : metric;
  const values = DEVICE_TYPES.map((key) => ({ key, value: types[key][by] }));
  const total = values.reduce((sum, v) => sum + (v.value ?? 0), 0);
  return {
    metric: by,
    parts: values.map((v) => ({ ...v, share: total > 0 && v.value != null ? (v.value / total) * 100 : null })),
  };
}

// The board a column shows for a case style: すべて ("all"), or a board without
// styles (films, an older server), is the board itself.
export function styleBoard(board, style) {
  if (!board || style === "all" || !board.styles) return board;
  return board.styles[style] ?? board;
}

// The style switch: each style's slice of the metric on screen. Units and yen
// add up across styles; distinct orders do not (one order can hold a folio and
// a back case), so 件数 keeps the units split. 不明 joins only while it holds
// units. Null for a board that is not split.
export function styleMix(board, metric) {
  if (!board?.styles) return null;
  const by = metric === "orders" ? "units" : metric;
  const keys = CASE_STYLES.filter((key) => key !== "unknown" || (board.styles.unknown.units ?? 0) > 0);
  const total = keys.reduce((sum, key) => sum + (board.styles[key][by] ?? 0), 0);
  return keys.map((key) => {
    const value = board.styles[key][by];
    return { key, value, share: total > 0 && value != null ? (value / total) * 100 : null };
  });
}

// 今月 vs 先月: where each of this month's rows stood last month, ranked by the
// same metric in the same scope (company, or the same shop). Last month's board
// lists every model that sold, so a model missing from it sold nothing then.
// Without a comparable board there are no marks at all — never a column of "new".
export function rankMoves(rows, previousBoard, metric) {
  if (!previousBoard || !metricReady(previousBoard, metric)) return rows.map(() => null);
  const before = new Map(rankDeviceBoard(previousBoard, metric).map((r) => [r.fullModel, r.rank]));
  return rows.map((row) => {
    const prevRank = before.get(row.fullModel);
    if (prevRank == null) return { dir: "new", prevRank: null, delta: 0 };
    const delta = prevRank - row.rank;
    if (delta === 0) return { dir: "same", prevRank, delta: 0 };
    return { dir: delta > 0 ? "up" : "down", prevRank, delta: Math.abs(delta) };
  });
}
