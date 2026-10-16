import { buildAttentionModel } from "../../widgets/uoattention/attention-model.mjs";

import { dayOf } from "./tv-time.mjs";

const MAX_ATTENTION_SHOPS = 5;

function count(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function readable(payload) {
  return Boolean(payload) && typeof payload === "object" && !payload.error && payload.ok !== false;
}

function logoMap(logos) {
  return new Map((logos?.shops || []).map((shop) => [shop.shopName, shop.logoUrl || null]));
}

function shopFailed(shop) {
  return Boolean(shop?.lastError) || shop?.status !== "authenticated";
}

function sumKnown(values) {
  const known = values.filter((value) => value !== null);
  return known.length ? known.reduce((total, value) => total + value, 0) : null;
}

function monthView(monthly, todayYmd) {
  const current = readable(monthly) ? monthly.currentMonth : null;
  const liveDate = current?.liveDate || null;
  const includesToday = Boolean(liveDate) && liveDate === todayYmd;
  return {
    orders: count(current?.totals?.orderCount),
    units: count(current?.totals?.unitsSold),
    fromDay: 1,
    toDay: dayOf(liveDate || current?.completedThroughDate),
    includesToday,
    partial: Boolean(monthly) && (monthly.partial === true || monthly.ok === false),
  };
}

export function buildOrdersView({ sales, monthly, logos, todayYmd }) {
  const month = monthView(monthly, todayYmd);
  if (!readable(sales)) {
    return { generatedAt: null, today: { orders: null, units: null }, month, shops: [], missing: 0 };
  }

  const logoByName = logoMap(logos);
  const shops = (sales.shops || []).map((shop) => {
    const failed = shopFailed(shop);
    return {
      name: shop.shopName,
      orders: failed ? null : count(shop.orderCount),
      units: failed ? null : count(shop.unitsSold),
      logoUrl: logoByName.get(shop.shopName) || null,
      failed,
    };
  });
  const healthy = shops.filter((shop) => !shop.failed);

  return {
    generatedAt: sales.generatedAtJST || null,
    today: {
      orders: sumKnown(healthy.map((shop) => shop.orders)),
      units: sumKnown(healthy.map((shop) => shop.units)),
    },
    month,
    shops: [...healthy.sort((a, b) => (b.orders ?? -1) - (a.orders ?? -1)), ...shops.filter((shop) => shop.failed)].map(
      ({ units, ...shop }) => shop,
    ),
    missing: shops.length - healthy.length,
  };
}

export function buildAttentionView(data, logos) {
  if (!readable(data)) return null;
  const model = buildAttentionModel(data, logos);
  if (!model) return null;

  const active = model.activeShops;
  return {
    total: model.total,
    // Some count unknown: the total is a floor, so the board must not call it "なし".
    partial: model.total === null || model.totalPartial || model.pending === null || model.inquiry === null,
    inquiries: model.inquiry,
    reviews: model.reviews,
    pending: model.pending,
    overdue: model.overdue,
    stale: Object.values(model.sources || {}).some((source) => source?.stale === true),
    generatedAt: model.generatedAtJST || null,
    shops: active.slice(0, MAX_ATTENTION_SHOPS).map((shop) => ({
      name: shop.name,
      logoUrl: shop.logoUrl,
      count: shop.total,
      tone: shop.status === "critical" ? "critical" : "attention",
    })),
    moreCount: Math.max(0, active.length - MAX_ATTENTION_SHOPS),
  };
}
