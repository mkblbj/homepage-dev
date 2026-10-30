/*
 * 楽天売上 widget — framework-free view model (design "1b").
 *
 * The React component (component.jsx) owns rendering and locale formatting;
 * everything here is pure and unit-tested. Four read-only snapshots feed it:
 *   sales    → GET /api/sales          (realtime today, main body)
 *   history  → GET /api/history/sales  (trailing 7 days excl. today, context)
 *   logos    → GET /api/shops/logos    (shop logo urls)
 *   ranking  → GET /api/item-rankings  (today's item boards, 3 dimensions)
 *
 * uo-ec-manager owns the refresh schedule; this widget only reads the resulting
 * snapshots, so every endpoint simply polls at the configured refreshInterval.
 * Note: /api/item-rankings is ~1MB (3 dimensions × 8 boards × 100 items) while
 * the other three total ~11KB — worth remembering before lowering the interval.
 */

// poll cadence when the service config does not set one
export const DEFAULT_REFRESH_INTERVAL = 60000; // 60s

// Progressive reveal: collapsed shows RANKING_STEPS[0] (3 rows × 2 columns on a
// wide container); each "show more" click moves to the next step instead of
// dumping all 100 rows at once.
export const RANKING_STEPS = Object.freeze([6, 20, 50, 100]);
export const RANKING_TOP_COUNT = RANKING_STEPS[0];
// the API returns at most 100 items per board — that is also our ceiling
export const RANKING_MAX_COUNT = RANKING_STEPS[RANKING_STEPS.length - 1];

// ranking dimensions, in the order the UI offers them (default first)
export const RANKING_DIMS = Object.freeze(["orderCount", "sales", "units"]);
export const DEFAULT_RANKING_DIM = RANKING_DIMS[0];

// 楽天アクセント(緋). data-viz uses blue; neutrals use theme-* tokens in the component.
export const ACCENT = "#C6362B";

const WEEKDAY_JP = ["日", "月", "火", "水", "木", "金", "土"];

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// A figure the API may leave out: null when absent, never 0 — "not read" and
// "read, nothing sold" are different answers.
function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// a / b, unknown when either side is, 0 when there is nothing to divide by
function ratio(a, b) {
  if (a === null || b === null) return null;
  return b > 0 ? a / b : 0;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

// A shop row the server left out of its totals (unconfigured, not read yet, or
// stale) is never counted or compared alongside the others.
const countedInTotals = (row) => row?.includedInTotals !== false;

// A shop count the API may omit: null when absent rather than 0.
function shopCountOf(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

// "2026-10-30", -1 → "2026-10-29"; computed in UTC so it is timezone-stable
function shiftDate(dateStr, days) {
  const [y, m, d] = String(dateStr || "")
    .split("-")
    .map(Number);
  if (!y || !m || !d) return "";
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// uo-ec-manager rebuilds the 7-day history each morning (around 08:15 JST, with
// retries). Until mid-morning a healthy history may still end the day before
// yesterday; after that it should reach yesterday. Read off the sales snapshot's
// own date and time, so the model stays pure.
const HISTORY_READY_HOUR = 10;

function expectedHistoryEnd(sales) {
  const stamp = normalizeText(sales?.sourceUpdatedAtJST || sales?.generatedAtJST);
  const today = normalizeText(sales?.sourceDateJST) || stamp.slice(0, 10);
  const time = timeFromJST(stamp);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || !time) return "";
  return shiftDate(today, Number(time.split(":")[0]) >= HISTORY_READY_HOUR ? -1 : -2);
}

// "2026-07-06" → JP weekday char. Computed in UTC so it is timezone-stable.
export function weekdayJp(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = String(dateStr).split("-").map(Number);
  if (!y || !m || !d) return "";
  const dt = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(dt.getTime()) ? "" : WEEKDAY_JP[dt.getUTCDay()];
}

// "2026-07-06" → "7/6"
export function mdLabel(dateStr) {
  if (!dateStr) return "";
  const [, m, d] = String(dateStr).split("-");
  return m && d ? `${Number(m)}/${Number(d)}` : dateStr;
}

// "2026-07-07 13:30 JST" → "13:30"
export function timeFromJST(jst) {
  const m = String(jst || "").match(/(\d{1,2}:\d{2})/);
  return m ? m[1] : "";
}

// yen → 万 with one decimal ("123456" → "12.3")
export function man(value) {
  return (toNumber(value) / 10000).toFixed(1);
}

// x-position (in a 0..w box) of the i-th of n points.
// centered=true → segment centers (i+0.5)/n·w, so points line up with equal-width
// flex hover zones and centered axis labels. centered=false → edge-to-edge.
export function pointX(i, n, w, centered) {
  if (centered) return ((i + 0.5) / n) * w;
  return n === 1 ? w / 2 : i * (w / (n - 1));
}

// Catmull-Rom → cubic bezier smooth path in a w×h box. Returns { line, area }.
export function spark(vals, w, h, baseZero, centered = false) {
  const values = Array.isArray(vals) ? vals.map(toNumber) : [];
  const n = values.length;
  if (!n) return { line: "", area: "" };
  const min = baseZero ? 0 : Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const padT = 5;
  const padB = 5;
  const usable = h - padT - padB;
  const pts = values.map((v, i) => ({
    x: pointX(i, n, w, centered),
    y: padT + (1 - (v - min) / span) * usable,
  }));
  let line = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i += 1) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    line += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  // close the fill under the actual line extent (not the full box) so a centered
  // line does not get stray triangular fills at the edges.
  const area = `${line} L ${pts[n - 1].x.toFixed(2)} ${h.toFixed(2)} L ${pts[0].x.toFixed(2)} ${h.toFixed(2)} Z`;
  return { line, area };
}

// Realtime snapshot freshness: derive live / delayed / stale from its JST timestamp.
// nowTs is injected (Date.now() from the caller) so this stays pure and testable.
export function computeFreshness(jst, nowTs, refreshInterval = DEFAULT_REFRESH_INTERVAL) {
  if (!jst || nowTs == null) return null;
  const parsed = Date.parse(String(jst).replace(" JST", "+09:00").replace(" ", "T"));
  if (Number.isNaN(parsed)) return null;
  const ageSec = Math.max(0, Math.round((nowTs - parsed) / 1000));
  const liveMax = Math.max(120, (refreshInterval / 1000) * 3);
  const staleMax = Math.max(1800, (refreshInterval / 1000) * 20);
  const state = ageSec <= liveMax ? "live" : ageSec <= staleMax ? "delayed" : "stale";
  return { ageSec, state };
}

// Normalize one ranked item. The management number is the display handle
// (falls back to itemNumber, then a trimmed item name so a row is never blank).
// Only the fields the UI renders are kept — the raw payload is ~1MB and carries
// long item names plus a full shopBreakdown we never show.
function normalizeRankedItem(item) {
  const mno =
    normalizeText(item?.itemManagementNumber) ||
    normalizeText(item?.itemNumber) ||
    normalizeText(item?.itemName).slice(0, 24) ||
    "-";
  const shops = (item?.shopBreakdown || []).map((s) => s.shopName).filter(Boolean);
  return {
    rank: toNumber(item?.rank),
    mno,
    url: normalizeText(item?.itemUrl) || null,
    imageUrl: normalizeText(item?.imageUrl) || null,
    salesYen: toNumber(item?.salesYen),
    unitsSold: toNumber(item?.unitsSold),
    orderCount: toNumber(item?.orderCount),
    avgPrice: toNumber(item?.averageUnitPriceYen),
    shopCount: toNumber(item?.shopCount),
    shopName: shops[0] || null,
  };
}

// One ranking dimension: the aggregated board plus a board per shop.
// Items keep the API's own ordering for that dimension; only the head is kept.
function normalizeRankingDim(block) {
  if (!block) return null;

  const take = (items) => (items || []).slice(0, RANKING_MAX_COUNT).map(normalizeRankedItem);
  const overall = take(block?.overall?.items ?? block?.overall);
  const shops = (block?.shops || []).map((s) => ({
    shopName: s.shopName,
    itemCount: toNumber(s.itemCount),
    ok: s.ok !== false,
    stale: Boolean(s.stale),
    items: take(s.items),
  }));

  if (!overall.length && !shops.some((s) => s.items.length)) return null;

  return {
    partial: Boolean(block?.partial),
    shopCount: toNumber(block?.shopCount ?? shops.length),
    // shops whose items the board actually adds up; null when the API leaves it out
    updatedShopCount: shopCountOf(block?.updatedShopCount),
    staleShopCount: toNumber(block?.staleShopCount),
    failedShopCount: toNumber(block?.failedShopCount),
    overall,
    shops,
  };
}

// Build the item-ranking view model from GET /api/item-rankings.
// The payload carries three independently ranked dimensions (sales / units /
// orderCount); each is normalized separately so the UI can switch between them.
export function buildRanking(ranking) {
  if (!ranking) return null;

  const dims = {};
  RANKING_DIMS.forEach((dim) => {
    const built = normalizeRankingDim(ranking?.rankings?.[dim]);
    if (built) dims[dim] = built;
  });

  const available = RANKING_DIMS.filter((d) => dims[d]);
  if (!available.length) return null;

  return {
    sourceDate: normalizeText(ranking?.sourceDateJST),
    generatedAt: normalizeText(ranking?.generatedAtJST),
    partial: Boolean(ranking?.partial),
    dims,
    // dimensions actually present, in UI order — the toggle renders from this
    available,
  };
}

// Build the full view model from the realtime + history + logo snapshots.
// Returns null when there is no realtime payload yet (loading state).
export function buildModel(sales, history, logos) {
  if (!sales) return null;

  // logos are optional context, merged by shopName (empty → component falls back).
  const logoByName = new Map((logos?.shops || []).map((s) => [s.shopName, s.logoUrl || null]));

  // Today. A shop the server left out of its total (no API access, a failed
  // read) is unknown today: its saved figures are not part of the total, so they
  // are not shown beside it either. With no readable shop at all the server
  // nulls the total, and so does the model.
  const totals = sales?.ok === false ? null : sales?.totals;
  const rtTotal = numberOrNull(totals?.salesYen);
  const rtOrders = numberOrNull(totals?.orderCount);
  const rtUnits = numberOrNull(totals?.unitsSold);
  const rtShops = (sales?.shops || []).map((s) => {
    const counted = countedInTotals(s);
    return {
      name: s.shopName,
      counted,
      sales: counted ? numberOrNull(s.salesYen) : null,
      orders: counted ? numberOrNull(s.orderCount) : null,
      units: counted ? numberOrNull(s.unitsSold) : null,
    };
  });

  // History context, keyed by shopName. Each shop keeps per-day detail so the
  // per-shop mini charts can show date / 売上 / 件数 on hover. Each shop also
  // keeps its own window: one whose history refresh fails holds on to its last
  // one (2026-10-30: three shops stuck at 10/27 while the rest reached 10/29),
  // so days are matched by date, never by position.
  const histByName = new Map();
  (history?.shops || []).forEach((s) => {
    const daily = (s.daily || [])
      .filter((d) => d?.date)
      .map((d) => ({
        date: d.date,
        md: mdLabel(d.date),
        wd: weekdayJp(d.date),
        sales: toNumber(d.salesYen),
        orders: toNumber(d.orderCount),
        units: toNumber(d.unitsSold),
        // per-shop daily CVR is authoritative — it comes straight from the API
        cvr: toNumber(d.conversionRate),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    histByName.set(s.shopName, {
      total: toNumber(s?.totals?.salesYen),
      orders: toNumber(s?.totals?.orderCount),
      units: toNumber(s?.totals?.unitsSold),
      cvr: toNumber(s?.totals?.conversionRate),
      daily,
      endDate: daily.length ? daily[daily.length - 1].date : "",
    });
  });
  // The company totals add up each shop's own window, so the averages stay a
  // sum of per-shop daily averages and agree with the shop rows.
  const grandTotal = toNumber(history?.totals?.salesYen);
  const grandOrders = toNumber(history?.totals?.orderCount);
  const grandUnits = toNumber(history?.totals?.unitsSold);
  const grandCvr = toNumber(history?.totals?.conversionRate);
  const nDays = toNumber(history?.range?.days) || (history?.range?.dates || []).length || 7;
  const avg = grandTotal / nDays;

  // The company chart keeps only the days every shop has: a day some shops are
  // missing from would read as a slump.
  const withDays = [...histByName.values()].filter((h) => h.daily.length);
  const dates = withDays.length
    ? withDays[0].daily.map((d) => d.date).filter((date) => withDays.every((h) => h.daily.some((d) => d.date === date)))
    : [];

  // the newest window any shop holds, which the shop rows mostly cover, and the
  // shops still on an older one
  const latestEnd = withDays.reduce((end, h) => (h.endDate > end ? h.endDate : end), "");
  const newest = withDays.find((h) => h.endDate === latestEnd);
  const lagging = [...histByName.entries()].filter(([, h]) => h.daily.length && h.endDate < latestEnd);
  const laggingEnd = lagging.reduce((end, [, h]) => (!end || h.endDate < end ? h.endDate : end), "");
  const expectedEnd = expectedHistoryEnd(sales);
  const week = newest
    ? {
        label: `${newest.daily[0].md}–${mdLabel(latestEnd)}`,
        endMd: mdLabel(latestEnd),
        // even the newest window is older than a healthy morning refresh leaves
        behind: Boolean(expectedEnd) && latestEnd < expectedEnd,
        lagging: lagging.map(([name]) => name),
        laggingEndMd: mdLabel(laggingEnd),
      }
    : null;

  // daily totals across shops (for the area chart + hover crosshair).
  // A conversion rate cannot be summed, so the all-shop figure is derived: each
  // shop-day's visits are recovered as orders / (cvr/100), summed, then divided
  // back. Exact within a day; it can drift slightly from the API's own range
  // total, which additionally de-duplicates visitors across days.
  const dailyTotals = dates.map((date) => {
    let s = 0;
    let o = 0;
    let u = 0;
    let visits = 0;
    withDays.forEach((h) => {
      const d = h.daily.find((day) => day.date === date);
      s += d.sales;
      o += d.orders;
      u += d.units;
      if (d.cvr > 0) visits += (d.orders * 100) / d.cvr;
    });
    return {
      date,
      wd: weekdayJp(date),
      md: mdLabel(date),
      sales: s,
      orders: o,
      units: u,
      cvr: visits > 0 ? (o / visits) * 100 : 0,
    };
  });
  const maxDaily = Math.max(1, ...dailyTotals.map((d) => d.sales));
  const heroChart = spark(
    dailyTotals.map((d) => d.sales),
    100,
    40,
    true,
    true,
  );
  // geometry (% of the box) for the hover crosshair/dot; x uses segment centers so
  // the chart, hover zones and axis labels all line up (equal-width flex tracks).
  const days = dailyTotals.map((d, i) => ({
    ...d,
    xPct: ((i + 0.5) / dailyTotals.length) * 100,
    yPct: ((5 + (1 - d.sales / maxDaily) * 30) / 40) * 100,
  }));

  // unified rows: realtime-sorted (unknown last), each carrying its 7-day context
  const rtMax = Math.max(1, ...rtShops.map((s) => s.sales ?? 0));
  const rows = rtShops
    .slice()
    .sort((a, b) => (b.sales ?? -1) - (a.sales ?? -1))
    .map((s) => {
      const h = histByName.get(s.name) || { total: 0, orders: 0, cvr: 0, daily: [] };
      const share = ratio(s.sales, rtTotal);
      return {
        name: s.name,
        rtSales: s.sales,
        rtOrders: s.orders,
        rtUnits: s.units,
        rtUnitsPerOrder: ratio(s.units, s.orders),
        rtShare: share === null ? null : share * 100,
        rtBarPct: s.sales === null ? null : (s.sales / rtMax) * 100,
        // this shop's share of the trailing-7d total — the "normal" baseline the
        // bullet compares today's share against (today ≥ baseline = over-indexing).
        h7Share: grandTotal > 0 ? (h.total / grandTotal) * 100 : 0,
        h7Total: h.total,
        h7Units: h.units,
        h7Orders: h.orders,
        cvr: h.cvr,
        daily: h.daily,
        logoUrl: logoByName.get(s.name) || null,
      };
    });

  // shared 0..max scale for the share bullets so bar lengths stay comparable across
  // rows (preserves the sales ranking) while each row's tick marks its own baseline.
  const shareScale = Math.max(1, ...rows.map((r) => Math.max(r.rtShare ?? 0, r.h7Share)));

  // the order-API read time: generatedAtJST is the response's build time and
  // moves on every rebuild, even when a refresh failed
  const updatedAtJST = sales?.sourceUpdatedAtJST || sales?.generatedAtJST || "";
  const aov = ratio(rtTotal, rtOrders);

  return {
    generatedAtJST: sales?.generatedAtJST || "",
    updatedAtJST,
    time: timeFromJST(updatedAtJST),
    rtTotal,
    rtOrders,
    rtUnits,
    aov: aov === null ? null : Math.round(aov),
    // units per order — how many pieces a single order carries. Separates
    // wholesale-style buying from one-piece shoppers.
    rtUnitsPerOrder: ratio(rtUnits, rtOrders),
    // how many shops today's total adds up, against every shop on the list
    coverage: {
      covered: shopCountOf(sales?.updatedShopCount) ?? rtShops.filter((s) => s.counted).length,
      total: shopCountOf(sales?.shopCount) ?? rtShops.length,
    },
    // shops the total leaves out, named so the header can say which
    missing: rtShops.filter((s) => !s.counted).map((s) => s.name),
    week,
    unitsPerOrder: grandOrders > 0 ? grandUnits / grandOrders : 0,
    rows,
    grandTotal,
    grandOrders,
    grandUnits,
    grandCvr,
    avg,
    avgOrders: grandOrders / nDays,
    avgUnits: grandUnits / nDays,
    nDays,
    days,
    maxDaily,
    heroChart,
    shareScale,
    hasHistory: Boolean(history && (history.shops || []).length),
  };
}

// ---- historical peaks (GET /api/history/peaks) ----

// Record boards the API exposes: best single day by yen, and by order count.
export const PEAK_DIMS = Object.freeze(["sales", "units", "orders"]);
export const DEFAULT_PEAK_DIM = PEAK_DIMS[0];
// value key per dimension, as the API names it — shared by the record boards
// and the monthly rollup, which expose the same three metrics
const METRIC_KEY = { sales: "salesYen", units: "unitsSold", orders: "orderCount" };

// Stable per-shop hues, assigned by sorted position so the palette stays evenly
// spread and every shop is clearly distinguishable. Callers must build this ONCE
// from the union of every shop they will draw (today's rows + the record board),
// otherwise two boards with different shop sets would disagree on colours.
const SHOP_PALETTE = Object.freeze([
  "#E0A878",
  "#7FB2E8",
  "#8FD0B0",
  "#C39BE0",
  "#E8B26A",
  "#E295B4",
  "#9AA6B8",
  "#B0C97E",
  // added once the company passed eight shops: appended, so the first eight keep their colours
  "#7CCFD8",
  "#D9CF7E",
]);
export const FALLBACK_SHOP_COLOR = "#9AA6B8";

export function buildShopColors(shopNames) {
  const unique = [...new Set((shopNames || []).map(normalizeText).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "ja"),
  );
  const colors = {};
  unique.forEach((name, i) => {
    colors[name] = SHOP_PALETTE[i % SHOP_PALETTE.length];
  });
  return colors;
}

function yearOf(dateStr) {
  const y = Number(String(dateStr || "").slice(0, 4));
  return Number.isFinite(y) && y > 0 ? y : null;
}

function decorateDate(dateStr) {
  return { date: dateStr || "", md: mdLabel(dateStr), wd: weekdayJp(dateStr), year: yearOf(dateStr) };
}

// Build the "all-time records" view model. Returns null unless the snapshot is
// complete (`status: "ready"`) — the API deliberately withholds partial boards
// rather than publishing a record that later moves.
export function buildPeaks(peaks) {
  if (!peaks || peaks.status !== "ready") return null;

  const records = {};
  const shopBests = {};
  const recordDates = new Set();

  PEAK_DIMS.forEach((dim) => {
    const key = METRIC_KEY[dim];
    const rec = peaks?.companyRecords?.[dim];
    if (rec) {
      const total = toNumber(rec[key]);
      // a zero record carries no date; never seed the "legendary day" set with
      // an empty value or every shop without a record would appear to match it
      if (rec.date) recordDates.add(rec.date);
      records[dim] = {
        ...decorateDate(rec.date),
        value: total,
        // only shops that actually sold that day appear in the stacked bar
        contributions: (rec.shopContributions || [])
          .map((c) => ({ shopName: c.shopName, value: toNumber(c[key]) }))
          .filter((c) => c.value > 0)
          .map((c) => ({ ...c, pct: total > 0 ? (c.value / total) * 100 : 0 })),
      };
    }

    const rows = (peaks?.shopRankings?.[dim] || []).map((s) => {
      const value = toNumber(s[key]);
      return {
        rank: toNumber(s.rank),
        shopName: s.shopName,
        value,
        // a peak of 0 means the shop never sold — its "record date" is just the
        // last day scanned, so the UI must not present it as an achievement
        noRecord: value <= 0,
        ...decorateDate(s.date),
      };
    });
    if (rows.length) shopBests[dim] = rows;
  });

  const available = PEAK_DIMS.filter((d) => records[d] || shopBests[d]);
  if (!available.length) return null;

  // a shop whose personal best landed on a company-record day — the same date
  // carrying several records is the "legendary day" worth calling out
  available.forEach((dim) => {
    (shopBests[dim] || []).forEach((row) => {
      row.onRecordDay = recordDates.has(row.date);
    });
  });

  const cov = peaks?.coverage || {};
  return {
    generatedAt: normalizeText(peaks?.generatedAtJST),
    coverage: {
      startDate: normalizeText(cov.startDate),
      endDate: normalizeText(cov.endDate),
      startYear: yearOf(cov.startDate),
      // units were only backfilled from a later date than sales/orders, so the
      // units record covers a shorter window and has to say so
      unitsStartDate: normalizeText(cov.unitsStartDate),
      unitsStartYear: yearOf(cov.unitsStartDate),
      shopCount: toNumber(cov.shopCount),
    },
    records,
    shopBests,
    available,
    // every shop that appears on any board — the component unions this with
    // today's rows to assign one palette across the whole widget
    shopNames: [...new Set(available.flatMap((d) => (shopBests[d] || []).map((r) => r.shopName)))],
  };
}

// ---- monthly rollup (GET /api/sales/monthly) ----

// The month board offers the same three metrics in the same order as the record
// board, so the two toggles read as one control.
export const MONTH_DIMS = PEAK_DIMS;

// "2026-09" → 30. Day 0 of the next month is the last day of this one; computed
// in UTC so it never shifts with the runtime's timezone.
function daysInMonth(monthStr) {
  const [y, m] = String(monthStr || "")
    .split("-")
    .map(Number);
  if (!y || !m || m < 1 || m > 12) return 0;
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// Day number of `dateStr`, but only when it genuinely falls inside `monthStr`.
// On the 1st, completedThroughDate still points at last month's final day —
// reading "31" straight out of it would claim 31 finished days of the new month.
function dayWithinMonth(dateStr, monthStr) {
  const date = normalizeText(dateStr);
  const month = normalizeText(monthStr);
  if (!date || !month || !date.startsWith(`${month}-`)) return 0;
  const day = Number(date.slice(8, 10));
  return Number.isFinite(day) && day > 0 ? day : 0;
}

// Pull the three metrics off any object the API keys by its own field names
// (a totals block or a shop row). Null in, null out — "not ready" is not zero.
function metricsOf(source) {
  if (!source) return null;
  const out = {};
  MONTH_DIMS.forEach((dim) => {
    const raw = source[METRIC_KEY[dim]];
    out[dim] = raw === null || raw === undefined ? null : toNumber(raw);
  });
  return out;
}

// Daily average over the days that are actually finished. Today is stripped out
// because a half-run day would drag the average down all morning and make every
// month look like it started badly.
//
// The monthly and realtime snapshots refresh independently, so they can sit a
// tick apart; against several finished days that is well under a percent and it
// corrects itself on the next poll. A total that has fallen *below* today is a
// real disagreement, though, and reports nothing rather than a negative day.
function paceOf(monthTotal, todayValue, completedDays) {
  if (completedDays <= 0 || monthTotal === null) return null;
  const completed = monthTotal - (todayValue ?? 0);
  return completed < 0 ? null : completed / completedDays;
}

function monthMetrics(current, previous, today, completedDays, prevDays) {
  const out = {};
  MONTH_DIMS.forEach((dim) => {
    const value = current[dim];
    // null (not "0") when there is no complete month to compare against
    const base = previous ? previous[dim] : null;
    const pace = paceOf(value, today?.[dim], completedDays);
    const prevPace = base != null && prevDays > 0 ? base / prevDays : null;
    const comparable = pace != null && prevPace > 0;
    out[dim] = {
      current: value,
      previous: base,
      // bullet fill: how much of last month this month has already matched
      vsPrevPct: base > 0 && value !== null ? (value / base) * 100 : null,
      pace,
      prevPace,
      paceDeltaPct: comparable ? (pace / prevPace - 1) * 100 : null,
      ahead: comparable ? pace >= prevPace : null,
    };
  });
  return out;
}

// The names a month's totals actually add up, sorted so two months compare.
function countedShopNames(month) {
  return (month?.shops || [])
    .filter(countedInTotals)
    .map((s) => normalizeText(s.shopName))
    .sort()
    .join("\n");
}

// Build the "this month vs last month" view model. Everything here is actual —
// no month-end projection — because 楽天's campaign days make the intra-month
// rhythm far too uneven for a linear extrapolation to be honest.
export function buildMonthly(monthly, sales) {
  const cur = monthly?.currentMonth;
  const curTotals = metricsOf(cur?.totals);
  // status "not_ready" nulls the totals; without them the section has nothing
  if (!monthly || monthly.ok === false || !cur || !curTotals) return null;

  const month = normalizeText(cur.month);
  const days = daysInMonth(month);
  const completedDays = dayWithinMonth(cur.completedThroughDate, month);

  // Since the order-API switch a month is "provisional" whenever any shop is
  // missing from it — kurumu has no API access, so last month is never
  // "complete". Its totals are still a fair baseline as long as they add up
  // the same shops as this month's; when the two sets differ, the company
  // figures measure different things and are not compared.
  const prev = monthly.previousMonth;
  const prevReadable = prev && prev.ok !== false && ["complete", "provisional"].includes(prev.status);
  const sameShops = prevReadable && countedShopNames(prev) === countedShopNames(cur);
  const prevTotals = sameShops ? metricsOf(prev.totals) : null;
  const prevDays = prevReadable ? daysInMonth(prev.month) : 0;

  // today's live figures, and only when the API says today really is part of
  // this month's running total — otherwise there is nothing to strip out
  const hasLiveDay = dayWithinMonth(cur.liveDate, month) > 0;
  // The rollup and the realtime snapshot are built from the same order-API
  // read, so an exact sourceUpdatedAtJST match proves both saw the same data.
  // generatedAtJST is each response's own build time and differs by seconds
  // even then. Any other source time means the two polled a refresh apart:
  // the totals would disagree by a whole tick without the difference ever
  // going negative, so subtracting one from the other would bias the average.
  const liveStamp = normalizeText(cur.sourceUpdatedAtJST);
  const sameSnapshot = hasLiveDay && liveStamp !== "" && liveStamp === normalizeText(sales?.sourceUpdatedAtJST);
  const today = sameSnapshot ? metricsOf(sales?.totals) : null;
  // a live day we cannot measure leaves the finished-day span unknowable: report
  // no pace rather than one inflated by spreading a partial day over whole ones
  const paceDays = hasLiveDay && !today ? 0 : completedDays;
  const todayByShop = new Map(sameSnapshot ? (sales?.shops || []).map((s) => [s.shopName, metricsOf(s)]) : []);

  const prevByShop = new Map(
    prevReadable ? (prev.shops || []).filter(countedInTotals).map((s) => [s.shopName, metricsOf(s)]) : [],
  );

  const shopRows = cur.shops || [];
  const shops = shopRows
    .map((s) => {
      const metrics = monthMetrics(
        metricsOf(s),
        countedInTotals(s) ? prevByShop.get(s.shopName) || null : null,
        todayByShop.get(s.shopName) || null,
        paceDays,
        prevDays,
      );
      return {
        name: s.shopName,
        metrics,
        // a shop quiet on both sides is dormant, not underperforming — the UI
        // says so instead of drawing an empty bar next to a -100%
        hasCurrent: MONTH_DIMS.some((d) => metrics[d].current > 0),
        hasPrevious: MONTH_DIMS.some((d) => (metrics[d].previous ?? 0) > 0),
      };
    })
    .sort((a, b) => (b.metrics.sales.current ?? -1) - (a.metrics.sales.current ?? -1));

  return {
    generatedAt: normalizeText(monthly.generatedAtJST),
    partial: Boolean(monthly.partial),
    current: {
      month,
      status: normalizeText(cur.status),
      completedThroughDate: normalizeText(cur.completedThroughDate),
      completedMd: mdLabel(cur.completedThroughDate),
      liveDate: hasLiveDay ? normalizeText(cur.liveDate) : "",
      liveMd: hasLiveDay ? mdLabel(cur.liveDate) : "",
      updatedAt: normalizeText(cur.updatedAtJST),
      completedDays,
      days,
      // marker for the bullet: how far the finished days take us into the month.
      // Today is excluded here too, so the marker and the pace measure the same span.
      progressPct: days > 0 ? (completedDays / days) * 100 : 0,
      hasLiveDay,
      // how many shops the totals add up, against all shops on the list
      coverage: {
        covered: shopCountOf(cur.updatedShopCount) ?? shopRows.filter(countedInTotals).length,
        total: shopCountOf(cur.shopCount) ?? shopRows.length,
      },
    },
    previous: prevTotals
      ? { month: normalizeText(prev.month), status: normalizeText(prev.status), days: prevDays }
      : null,
    metrics: monthMetrics(curTotals, prevTotals, today, paceDays, prevDays),
    shops,
    // every shop on this board — the component unions this with the other boards
    // to assign one palette across the whole widget
    shopNames: shops.map((s) => s.name),
  };
}
