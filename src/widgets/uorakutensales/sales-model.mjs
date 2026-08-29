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

// Progressive reveal: collapsed shows RANKING_STEPS[0] (3 podium cards + 8 list
// cards = 4 rows × 2 columns on a wide container); each "show more" click moves
// to the next step instead of dumping all 100 rows at once.
export const RANKING_STEPS = Object.freeze([11, 20, 50, 100]);
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

function normalizeText(value) {
  return String(value ?? "").trim();
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

  const rtTotal = toNumber(sales?.totals?.salesYen);
  const rtOrders = toNumber(sales?.totals?.orderCount);
  const rtShops = (sales?.shops || []).map((s) => ({
    name: s.shopName,
    sales: toNumber(s.salesYen),
    orders: toNumber(s.orderCount),
  }));

  // history context, keyed by shopName. Each shop keeps per-day detail so the
  // per-shop mini charts can show date / 売上 / 件数 on hover.
  const dates = history?.range?.dates || (history?.shops?.[0]?.daily || []).map((d) => d.date);
  const histByName = new Map();
  (history?.shops || []).forEach((s) => {
    histByName.set(s.shopName, {
      total: toNumber(s?.totals?.salesYen),
      orders: toNumber(s?.totals?.orderCount),
      cvr: toNumber(s?.totals?.conversionRate),
      daily: (s.daily || []).map((d) => ({
        date: d.date,
        md: mdLabel(d.date),
        wd: weekdayJp(d.date),
        sales: toNumber(d.salesYen),
        orders: toNumber(d.orderCount),
        // per-shop daily CVR is authoritative — it comes straight from the API
        cvr: toNumber(d.conversionRate),
      })),
    });
  });
  const grandTotal = toNumber(history?.totals?.salesYen);
  const grandOrders = toNumber(history?.totals?.orderCount);
  const grandCvr = toNumber(history?.totals?.conversionRate);
  const nDays = dates.length || 7;
  const avg = grandTotal / nDays;

  // daily totals across shops (for the area chart + hover crosshair).
  // A conversion rate cannot be summed, so the all-shop figure is derived: each
  // shop-day's visits are recovered as orders / (cvr/100), summed, then divided
  // back. Exact within a day; it can drift slightly from the API's own range
  // total, which additionally de-duplicates visitors across days.
  const dailyTotals = dates.map((date, i) => {
    let s = 0;
    let o = 0;
    let visits = 0;
    (history?.shops || []).forEach((sh) => {
      const d = (sh.daily || [])[i];
      if (d) {
        const orders = toNumber(d.orderCount);
        const cvr = toNumber(d.conversionRate);
        s += toNumber(d.salesYen);
        o += orders;
        if (cvr > 0) visits += (orders * 100) / cvr;
      }
    });
    return {
      date,
      wd: weekdayJp(date),
      md: mdLabel(date),
      sales: s,
      orders: o,
      cvr: visits > 0 ? (o / visits) * 100 : 0,
    };
  });
  const maxDaily = Math.max(1, ...dailyTotals.map((d) => d.sales));
  const heroChart = spark(dailyTotals.map((d) => d.sales), 100, 40, true, true);
  // geometry (% of the box) for the hover crosshair/dot; x uses segment centers so
  // the chart, hover zones and axis labels all line up (equal-width flex tracks).
  const days = dailyTotals.map((d, i) => ({
    ...d,
    xPct: ((i + 0.5) / nDays) * 100,
    yPct: ((5 + (1 - d.sales / maxDaily) * 30) / 40) * 100,
  }));

  // unified rows: realtime-sorted, each carrying its 7-day context
  const rtMax = Math.max(1, ...rtShops.map((s) => s.sales));
  const rows = rtShops
    .slice()
    .sort((a, b) => b.sales - a.sales)
    .map((s) => {
      const h = histByName.get(s.name) || { total: 0, orders: 0, cvr: 0, daily: [] };
      return {
        name: s.name,
        rtSales: s.sales,
        rtOrders: s.orders,
        rtShare: rtTotal > 0 ? (s.sales / rtTotal) * 100 : 0,
        rtBarPct: (s.sales / rtMax) * 100,
        // this shop's share of the trailing-7d total — the "normal" baseline the
        // bullet compares today's share against (today ≥ baseline = over-indexing).
        h7Share: grandTotal > 0 ? (h.total / grandTotal) * 100 : 0,
        h7Total: h.total,
        h7Orders: h.orders,
        cvr: h.cvr,
        daily: h.daily,
        logoUrl: logoByName.get(s.name) || null,
      };
    });

  // shared 0..max scale for the share bullets so bar lengths stay comparable across
  // rows (preserves the sales ranking) while each row's tick marks its own baseline.
  const shareScale = Math.max(1, ...rows.map((r) => Math.max(r.rtShare, r.h7Share)));

  return {
    generatedAtJST: sales?.generatedAtJST || "",
    time: timeFromJST(sales?.generatedAtJST),
    rtTotal,
    rtOrders,
    aov: rtOrders > 0 ? Math.round(rtTotal / rtOrders) : 0,
    rows,
    grandTotal,
    grandOrders,
    grandCvr,
    avg,
    avgOrders: grandOrders / nDays,
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
export const PEAK_DIMS = Object.freeze(["sales", "orders"]);
export const DEFAULT_PEAK_DIM = PEAK_DIMS[0];
// value key per dimension, as the API names it
const PEAK_VALUE_KEY = { sales: "salesYen", orders: "orderCount" };

// Stable per-shop hues. Shops are sorted so a given shop keeps its colour across
// dimensions and re-renders; the stacked record bar and the shop chips below it
// share this map, which lets the chips double as the bar's legend.
const SHOP_PALETTE = Object.freeze(["#E0A878", "#7FB2E8", "#8FD0B0", "#C39BE0", "#E8B26A", "#E295B4", "#9AA6B8", "#B0C97E"]);

export function buildShopColors(shopNames) {
  const unique = [...new Set((shopNames || []).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja"));
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
    const key = PEAK_VALUE_KEY[dim];
    const rec = peaks?.companyRecords?.[dim];
    if (rec) {
      const total = toNumber(rec[key]);
      recordDates.add(rec.date);
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

    const rows = (peaks?.shopRankings?.[dim] || []).map((s) => ({
      rank: toNumber(s.rank),
      shopName: s.shopName,
      value: toNumber(s[key]),
      ...decorateDate(s.date),
    }));
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
      shopCount: toNumber(cov.shopCount),
    },
    records,
    shopBests,
    available,
    shopColors: buildShopColors(available.flatMap((d) => (shopBests[d] || []).map((r) => r.shopName))),
  };
}
