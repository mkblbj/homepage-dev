function count(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function readable(payload) {
  return Boolean(payload) && typeof payload === "object" && !payload.error && payload.ok !== false;
}

// A shop is left out when it failed, or when it answered without an order count: either way the
// board cannot vouch for its number, so it is reported as missing rather than added as 0.
function shopOrders(shop) {
  if (shop?.lastError || shop?.status !== "authenticated") return null;
  return count(shop.orderCount);
}

// The workshop only asks how many Rakuten orders came in today (simplified board, 2026-10-19).
export function buildOrdersView({ sales }) {
  if (!readable(sales)) {
    return { generatedAt: null, orders: null, shopCount: 0, missing: 0 };
  }
  const orders = (sales.shops || []).map(shopOrders);
  const known = orders.filter((value) => value !== null);
  return {
    generatedAt: sales.generatedAtJST || null,
    orders: known.length ? known.reduce((total, value) => total + value, 0) : null,
    shopCount: orders.length,
    missing: orders.length - known.length,
  };
}
