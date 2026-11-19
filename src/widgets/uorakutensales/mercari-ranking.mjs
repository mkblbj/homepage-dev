// Mercari Shops' best sellers, worked out in the homepage's proxy. The server
// keeps no item ranking for Mercari (section 14 of the backend doc), but it
// serves every order of last month and this one with its items:
//   GET /api/mercari/status                 the enabled shops
//   GET /api/mercari/orders?shopName=…      orders, newest first, 200 a page
//   GET /api/mercari/products?shopName=…    the sold products' main images
// Each product's figures count only orders the server counts as sales
// (includedInSales) and only the quantity kept: unit price × kept quantity,
// by JST order day, the same way the server adds up the shop's sales.
//
// Reading every page takes a few requests, so a shop's boards are kept until the
// server's order snapshot moves on (its sourceUpdatedAt, refreshed every 15 min):
// a read in between costs one page.
//
// The answer per period has the shape of Amazon's item rankings, so the page
// reads both the same way.

export const PAGE_LIMIT = 200;
// the page shows at most 100 rows a board
export const MAX_ITEMS = 100;
const MAX_PAGES = 50;
const PRODUCT_URL = "https://jp.mercari.com/shops/product/";
// a board row shows one line of the title: its code and model are at the front
const TITLE_LENGTH = 60;
const DIMS = ["orderCount", "sales", "units"];
const VALUE_OF = { orderCount: "orderCount", sales: "salesAmount", units: "unitsSold" };

const JST_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function jstDate(now = new Date()) {
  return JST_DATE.format(now);
}

export function previousMonthOf(month) {
  const [year, mon] = month.split("-").map(Number);
  return mon === 1 ? `${year - 1}-12` : `${year}-${String(mon - 1).padStart(2, "0")}`;
}

const number = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

// Each product's figures over the orders `inPeriod` picks.
function tally(orders, inPeriod) {
  const byProduct = new Map();
  orders.forEach((order) => {
    if (order?.includedInSales !== true || !inPeriod(String(order.date || ""))) return;
    const seen = new Set();
    (order.items || []).forEach((item) => {
      const kept = number(item?.netQuantity);
      const id = String(item?.productId || "");
      if (!id || kept <= 0) return;
      const entry = byProduct.get(id) ?? {
        id,
        name: String(item.name || "").trim(),
        unitsSold: 0,
        salesAmount: 0,
        orderCount: 0,
      };
      entry.unitsSold += kept;
      entry.salesAmount += number(item.unitPrice) * kept;
      if (!seen.has(id)) {
        entry.orderCount += 1;
        seen.add(id);
      }
      byProduct.set(id, entry);
    });
  });
  return [...byProduct.values()];
}

// the other two figures, then the product id, settle a tie
const TIE_ORDER = {
  orderCount: ["unitsSold", "salesAmount"],
  sales: ["unitsSold", "orderCount"],
  units: ["orderCount", "salesAmount"],
};

function ranked(entries, dim, images) {
  const key = VALUE_OF[dim];
  const [second, third] = TIE_ORDER[dim];
  return [...entries]
    .sort((a, b) => b[key] - a[key] || b[second] - a[second] || b[third] - a[third] || (a.id < b.id ? -1 : 1))
    .slice(0, MAX_ITEMS)
    .map((entry, i) => ({
      rank: i + 1,
      // its own title leads with the shop's code for it, then the model
      sku: entry.name.slice(0, TITLE_LENGTH),
      itemUrl: `${PRODUCT_URL}${entry.id}`,
      imageUrl: images.get(entry.id) ?? null,
      salesAmount: entry.salesAmount,
      currency: "JPY",
      unitsSold: entry.unitsSold,
      orderCount: entry.orderCount,
    }));
}

// One shop's boards for today, this month and last month, from its orders and
// the images of its sold products.
export function rankShop(shop, orders, images, today) {
  const month = today.slice(0, 7);
  const previous = previousMonthOf(month);
  const board = (inPeriod) => {
    const entries = tally(orders, inPeriod);
    return {
      configId: shop.configId,
      shopName: shop.shopName,
      enabled: true,
      status: shop.status,
      sourceUpdatedAt: shop.sourceUpdatedAt,
      itemCount: entries.length,
      rankings: Object.fromEntries(DIMS.map((dim) => [dim, ranked(entries, dim, images)])),
    };
  };
  return {
    today: board((date) => date === today),
    currentMonth: board((date) => date.startsWith(`${month}-`)),
    previousMonth: board((date) => date.startsWith(`${previous}-`)),
  };
}

// A shop the server has not read: on the list, with nothing to rank.
function unreadShop(shop, status) {
  const empty = {
    configId: shop.configId,
    shopName: shop.shopName,
    enabled: true,
    status,
    sourceUpdatedAt: null,
    itemCount: 0,
    rankings: Object.fromEntries(DIMS.map((dim) => [dim, []])),
  };
  return { today: empty, currentMonth: empty, previousMonth: empty };
}

function pageUrl(baseUrl, path, shopName, page) {
  const url = new URL(`${baseUrl}${path}`);
  url.searchParams.set("shopName", shopName);
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(PAGE_LIMIT));
  return url;
}

// Every page of a listing, all from one snapshot: the server's refresh can move
// rows between pages, so a read that straddles two snapshots starts over.
async function readAll(fetchJson, baseUrl, path, shopName, first = null) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const head = attempt === 0 && first ? first : await fetchJson(pageUrl(baseUrl, path, shopName, 1));
    const items = [...(head.items || [])];
    let next = head.nextPage;
    let mixed = false;
    for (let pages = 1; next && pages < MAX_PAGES; pages += 1) {
      const page = await fetchJson(pageUrl(baseUrl, path, shopName, next));
      if (page.sourceUpdatedAt !== head.sourceUpdatedAt) {
        mixed = true;
        break;
      }
      items.push(...(page.items || []));
      next = page.nextPage;
    }
    if (!mixed) return { head, items };
  }
  throw new Error(`Mercari ${path} changed while it was read`);
}

// The boards kept per server and shop, and the read under way per server.
const cache = new Map();
const inFlight = new Map();

async function readShop(fetchJson, baseUrl, shop, today) {
  const first = await fetchJson(pageUrl(baseUrl, "/api/mercari/orders", shop.shopName, 1));
  if (first?.status !== "ready" && first?.status !== "stale") return unreadShop(shop, first?.status ?? "error");
  const key = `${baseUrl}|${shop.configId}`;
  const kept = cache.get(key);
  if (kept && kept.stamp === first.sourceUpdatedAt && kept.today === today) return kept.boards;

  const { items: orders } = await readAll(fetchJson, baseUrl, "/api/mercari/orders", shop.shopName, first);
  // the images are only a nicety: without them the board still reads
  let images = new Map();
  try {
    const { items: products } = await readAll(fetchJson, baseUrl, "/api/mercari/products", shop.shopName);
    images = new Map(products.filter((p) => p?.id && p.imageUrl).map((p) => [p.id, p.imageUrl]));
  } catch {
    images = kept?.images ?? new Map();
  }
  const boards = rankShop(
    { configId: shop.configId, shopName: shop.shopName, status: first.status, sourceUpdatedAt: first.sourceUpdatedAt },
    orders,
    images,
    today,
  );
  cache.set(key, { stamp: first.sourceUpdatedAt, today, boards, images });
  return boards;
}

async function readAllShops(fetchJson, baseUrl, now) {
  const status = await fetchJson(new URL(`${baseUrl}/api/mercari/status`));
  const shops = (status?.shops || []).filter((s) => s?.enabled !== false && s?.shopName);
  const today = jstDate(now);
  const month = today.slice(0, 7);
  const result = {
    ok: true,
    enabled: shops.length > 0,
    today: { key: today, shops: [] },
    currentMonth: { key: month, shops: [] },
    previousMonth: { key: previousMonthOf(month), shops: [] },
  };
  // one shop at a time: a few local requests each, and nothing to gain by racing
  for (const shop of shops) {
    const boards = await readShop(fetchJson, baseUrl, shop, today);
    result.today.shops.push(boards.today);
    result.currentMonth.shops.push(boards.currentMonth);
    result.previousMonth.shops.push(boards.previousMonth);
  }
  return result;
}

// Today's boards and the month boards are asked for separately but read together.
export function readMercariRankings(fetchJson, baseUrl, now = new Date()) {
  const running = inFlight.get(baseUrl);
  if (running) return running;
  const read = readAllShops(fetchJson, baseUrl, now).finally(() => inFlight.delete(baseUrl));
  inFlight.set(baseUrl, read);
  return read;
}

// for tests
export function clearMercariRankingCache() {
  cache.clear();
  inFlight.clear();
}
