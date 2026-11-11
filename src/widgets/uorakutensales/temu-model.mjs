// The TEMU shop on the company sales board, read from one snapshot:
//   temuSales → GET /api/temu/sales  today, this month, last month and shop history
//
// TEMU is one shop (UO world, its Japan site), and the server collects it only
// when someone refreshes it from the shop console. Its order and unit counts are
// read. Its yen wait on the amount scope of the shop's API grant: until that is
// granted salesAmount is null, so the yen read as a dash. Once granted they are
// the buyer-paid totals, TEMU's own basis, shown beside the other platforms' and
// never added to them.

import { finishedDays, jstStamp, shopHistoryOf } from "./amazon-model.mjs";
import { daysInMonth, monthMetrics, numberOrNull } from "./sales-model.mjs";

export function temuKey(shopName) {
  return `temu:${shopName ?? ""}`;
}

// A period's figures only while the server calls it ready: a stale period keeps
// its last values, but like the other platforms' they are not current.
function periodOf(period, currency) {
  if (period?.status !== "ready" || !period.totals) return null;
  const { salesAmount, unitsSold, orderCount } = period.totals;
  return {
    sales: currency === "JPY" ? numberOrNull(salesAmount) : null,
    units: numberOrNull(unitsSold),
    orders: numberOrNull(orderCount),
  };
}

const coverageOf = (values) => ({ covered: values ? 1 : 0, total: 1 });

// Null when there is no snapshot: the board then reads as it did before TEMU.
export function buildTemu(sales) {
  if (!sales || sales.error || sales.ok === false) return null;
  const name = sales.shopName ?? "";
  const today = periodOf(sales.today, sales.currency);
  const month = periodOf(sales.month, sales.currency);
  const previous = periodOf(sales.previousMonth, sales.currency);
  // today and the month come from the same refresh, so the pace can take
  // today's part out of the month's total
  const metrics = month
    ? monthMetrics(
        month,
        previous,
        today,
        finishedDays(sales.today?.key, sales.month?.key, today),
        daysInMonth(previous ? sales.previousMonth.key : ""),
      )
    : null;
  const updatedAt = today ? jstStamp(sales.today.sourceUpdatedAt) : "";
  const shop = {
    key: temuKey(name),
    name,
    platform: "temu",
    currency: sales.currency,
    today,
    month,
    previous,
    metrics,
    week: null,
    avg: null,
    daily: [],
    trend: shopHistoryOf(sales.history?.dates, sales.history?.shops?.find((row) => row.shopName === name)),
    counted: Boolean(today),
    updatedAt: updatedAt || jstStamp(month ? sales.month.sourceUpdatedAt : ""),
  };
  return {
    platform: "temu",
    // The 7-day history is scoped to the shop card.
    provides: { week: false, previous: true },
    shops: [shop],
    company: {
      today,
      month,
      previous,
      metrics,
      avg: null,
      daily: [],
      coverage: { today: coverageOf(today), month: coverageOf(month) },
      missing: shop.counted ? [] : [name],
      updatedAt,
    },
  };
}
