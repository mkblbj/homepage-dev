function count(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function readable(payload) {
  return Boolean(payload) && typeof payload === "object" && !payload.error && payload.ok !== false;
}

// The workshop only asks how many Rakuten orders came in today (simplified board, 2026-10-19).
// Since the order-API switch (2026-10-30) the server's totals already leave out shops it cannot
// vouch for (includedInTotals: false), so the board shows that total and counts the rest as
// missing instead of adding up shops itself.
export function buildOrdersView({ sales }) {
  if (!readable(sales)) {
    return { generatedAt: null, orders: null, shopCount: 0, missing: 0 };
  }
  const shops = sales.shops || [];
  const shopCount = count(sales.shopCount) ?? shops.length;
  const included = count(sales.updatedShopCount) ?? shops.filter((shop) => shop?.includedInTotals === true).length;
  return {
    // the source time: generatedAtJST moves on every rebuild, even when a refresh failed
    generatedAt: sales.sourceUpdatedAtJST || sales.generatedAtJST || null,
    orders: count(sales.totals?.orderCount),
    shopCount,
    missing: Math.max(0, shopCount - included),
  };
}
