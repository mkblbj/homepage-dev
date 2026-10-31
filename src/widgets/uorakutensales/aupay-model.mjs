// The au PAY Market shops on the company sales board, read from one snapshot:
//   aupaySales → GET /api/aupay/sales  today and this month
//
// That is all au PAY serves: no last month, history, records, item boards or
// logos, so those figures stay unknown here rather than zero. Its yen are its own
// order amounts (tax included, before points and coupons, no shipping), shown
// beside the other platforms' and never added to them.

import { companyTotals, coverageOf, finishedDays, jstStamp, latest, periodOf, rowsByKey } from "./amazon-model.mjs";
import { monthMetrics } from "./sales-model.mjs";

// configId is opaque but stable; a shop's name can match a 楽天 shop's (3911 does)
export function aupayKey(row) {
  return `aupay:${row?.configId ?? ""}`;
}

// Null when the snapshot is missing or no shop is enabled.
export function buildAupay(sales) {
  if (!sales || sales.error || !sales.today) return null;
  const today = rowsByKey(sales.today, aupayKey);
  const month = rowsByKey(sales.month, aupayKey);
  const keys = [...new Set([...today.keys(), ...month.keys()])];
  if (!keys.length) return null;

  const shops = keys.map((key) => {
    const row = today.get(key) || month.get(key);
    const t = periodOf(today.get(key));
    const m = periodOf(month.get(key));
    return {
      key,
      name: row.shopName,
      platform: "aupay",
      currency: row.currency,
      today: t,
      month: m,
      previous: null,
      metrics: m ? monthMetrics(m, null, t, finishedDays(today.get(key)?.date, month.get(key)?.month, t), 0) : null,
      week: null,
      avg: null,
      daily: [],
      counted: today.get(key)?.includedInTotals === true,
      updatedAt: jstStamp(today.get(key)?.sourceUpdatedAt || month.get(key)?.sourceUpdatedAt),
    };
  });

  // every shop reports in Japan time, so the finished days are the same for all
  const todayTotals = companyTotals(sales.today);
  const monthTotals = companyTotals(sales.month);
  const anyToday = [...today.values()].find((row) => row.date);
  const anyMonth = [...month.values()].find((row) => row.month);
  return {
    platform: "aupay",
    provides: { week: false, previous: false },
    shops,
    company: {
      today: todayTotals,
      month: monthTotals,
      previous: null,
      metrics: monthTotals
        ? monthMetrics(monthTotals, null, todayTotals, finishedDays(anyToday?.date, anyMonth?.month, todayTotals), 0)
        : null,
      avg: null,
      daily: [],
      coverage: { today: coverageOf(sales.today), month: coverageOf(sales.month) },
      missing: shops.filter((s) => !s.counted).map((s) => s.name),
      updatedAt: jstStamp(latest([...today.values()].map((row) => row.sourceUpdatedAt))),
    },
  };
}

// au PAY has no records to show: its shops still get their place on the list of
// shop bests, as an unknown after everyone with a figure.
export function withUnrecordedShops(peaks, shops) {
  if (!peaks || !shops?.length) return peaks;
  const rows = shops.map((s) => ({
    key: s.key,
    platform: s.platform,
    shopName: s.name,
    value: null,
    noRecord: false,
    onRecordDay: false,
  }));
  return {
    ...peaks,
    shopBests: Object.fromEntries(Object.entries(peaks.shopBests).map(([dim, list]) => [dim, [...list, ...rows]])),
  };
}
