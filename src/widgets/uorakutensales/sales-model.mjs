export const REFRESH_INTERVAL_OPTIONS = Object.freeze([
  Object.freeze({ id: "5m", label: "5分", milliseconds: 5 * 60 * 1000 }),
  Object.freeze({ id: "10m", label: "10分", milliseconds: 10 * 60 * 1000 }),
  Object.freeze({ id: "15m", label: "15分", milliseconds: 15 * 60 * 1000 }),
]);

const DEFAULT_REFRESH_INTERVAL_ID = "15m";

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function defaultFormatNumber(value) {
  return toNumber(value).toLocaleString("ja-JP");
}

function defaultFormatCurrency(value) {
  return `¥${defaultFormatNumber(value)}`;
}

function normalizeText(value) {
  return String(value || "").trim();
}

export function resolveRefreshIntervalOption(value) {
  const numericValue = toNumber(value);
  const matched = REFRESH_INTERVAL_OPTIONS.find((option) => option.milliseconds === numericValue);

  return matched ?? REFRESH_INTERVAL_OPTIONS.find((option) => option.id === DEFAULT_REFRESH_INTERVAL_ID);
}

export function getSalesStatusMeta(status, lastError) {
  const normalizedStatus = normalizeText(status);

  if (lastError) {
    return {
      hasError: true,
      label: "要確認",
      tone: "danger",
    };
  }

  if (normalizedStatus === "authenticated") {
    return {
      hasError: false,
      label: "正常",
      tone: "success",
    };
  }

  if (["querying", "refreshing", "pending"].includes(normalizedStatus)) {
    return {
      hasError: false,
      label: "更新中",
      tone: "warning",
    };
  }

  if (normalizedStatus) {
    return {
      hasError: true,
      label: "要確認",
      tone: "danger",
    };
  }

  return {
    hasError: false,
    label: "未取得",
    tone: "muted",
  };
}

export function normalizeSalesShop(shop, formatCurrency = defaultFormatCurrency, formatNumber = defaultFormatNumber) {
  const salesYen = toNumber(shop?.salesYen);
  const orderCount = toNumber(shop?.orderCount);
  const lastError = shop?.lastError || null;
  const statusMeta = getSalesStatusMeta(shop?.status, lastError);
  const updated = shop?.updated || null;
  const activityDisplay = shop?.lastHeartbeatJST || shop?.lastQueryJST || "";

  return {
    shopName: normalizeText(shop?.shopName) || "未設定",
    status: normalizeText(shop?.status),
    statusLabel: statusMeta.label,
    statusTone: statusMeta.tone,
    hasError: statusMeta.hasError,
    salesYen,
    salesDisplay: formatCurrency(salesYen),
    orderCount,
    orderCountDisplay: formatNumber(orderCount),
    updated,
    updatedDisplay: updated ? `更新 ${updated}` : "更新時刻なし",
    lastQueryJST: shop?.lastQueryJST || null,
    lastHeartbeatJST: shop?.lastHeartbeatJST || null,
    activityDisplay,
    lastError,
  };
}

export function sortSalesShops(a, b) {
  const salesDiff = b.salesYen - a.salesYen;
  if (salesDiff !== 0) {
    return salesDiff;
  }

  return a.shopName.localeCompare(b.shopName, "ja");
}

export function buildSalesModel({
  data,
  formatCurrency = defaultFormatCurrency,
  formatNumber = defaultFormatNumber,
} = {}) {
  const shops = Array.isArray(data?.shops)
    ? data.shops.map((shop) => normalizeSalesShop(shop, formatCurrency, formatNumber)).sort(sortSalesShops)
    : [];

  const totalSalesYen = toNumber(data?.totals?.salesYen ?? shops.reduce((sum, shop) => sum + shop.salesYen, 0));
  const totalOrderCount = toNumber(data?.totals?.orderCount ?? shops.reduce((sum, shop) => sum + shop.orderCount, 0));
  const shopCount = toNumber(data?.shopCount ?? shops.length);
  const updatedShopCount = toNumber(data?.updatedShopCount ?? shops.filter((shop) => shop.updated).length);
  const hasShopErrors = shops.some((shop) => shop.hasError);

  return {
    ok: data?.ok !== false,
    generatedAt: data?.generatedAtJST || "",
    lastError: data?.lastError || null,
    summary: {
      totalSalesYen,
      totalSalesDisplay: formatCurrency(totalSalesYen),
      totalOrderCount,
      totalOrdersDisplay: formatNumber(totalOrderCount),
      shopCount,
      updatedShopCount,
      shopCoverageDisplay: `${formatNumber(updatedShopCount)}/${formatNumber(shopCount)}`,
      hasErrors: Boolean(data?.lastError) || hasShopErrors,
    },
    shops,
  };
}
