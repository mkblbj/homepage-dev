// The au PAY Market shops on the company sales board, read from one snapshot:
//   aupaySales → GET /api/aupay/sales  today, this month, last month and shop history
//
// An older server can omit the history or last month. A period that could not
// be read is unknown.
// Its yen are its own order amounts (tax included, before points and coupons, no
// shipping), shown beside the other platforms' and never added to them.

import {
  companyTotals,
  coverageOf,
  finishedDays,
  jstStamp,
  latest,
  periodOf,
  rowsByKey,
  shopHistoryOf,
} from "./amazon-model.mjs";
import { daysInMonth, monthMetrics } from "./sales-model.mjs";

// configId is opaque but stable; a shop's name can match a 楽天 shop's (3911 does)
export function configKey(platform, row) {
  return `${platform}:${row?.configId ?? ""}`;
}

export function aupayKey(row) {
  return configKey("aupay", row);
}

// Null when the snapshot is missing or no shop is enabled.
export function buildAupay(sales) {
  return buildConfigShops("aupay", sales);
}

// au PAY's snapshot shape: each period lists every enabled shop by its configId,
// with the platform's totals beside them. Mercari Shops answers in the same shape
// (mercari-model), so the platform is a parameter.
export function buildConfigShops(platform, sales) {
  if (!sales || sales.error || !sales.today) return null;
  const keyOf = (row) => configKey(platform, row);
  const today = rowsByKey(sales.today, keyOf);
  const month = rowsByKey(sales.month, keyOf);
  const previous = rowsByKey(sales.previousMonth, keyOf);
  const history = rowsByKey(sales.history, keyOf);
  const keys = [...new Set([...today.keys(), ...month.keys(), ...previous.keys()])];
  if (!keys.length) return null;

  const shops = keys.map((key) => {
    const row = today.get(key) || month.get(key) || previous.get(key);
    const t = periodOf(today.get(key));
    const m = periodOf(month.get(key));
    const p = periodOf(previous.get(key));
    return {
      key,
      name: row.shopName,
      platform,
      currency: row.currency,
      today: t,
      month: m,
      previous: p,
      metrics: m
        ? monthMetrics(
            m,
            p,
            t,
            finishedDays(today.get(key)?.date, month.get(key)?.month, t),
            daysInMonth(previous.get(key)?.month),
          )
        : null,
      week: null,
      avg: null,
      daily: [],
      trend: shopHistoryOf(sales.history?.dates, history.get(key)),
      counted: today.get(key)?.includedInTotals === true,
      updatedAt: jstStamp(today.get(key)?.sourceUpdatedAt || month.get(key)?.sourceUpdatedAt),
    };
  });

  // every shop reports in Japan time, so the finished days are the same for all
  const todayTotals = companyTotals(sales.today);
  const monthTotals = companyTotals(sales.month);
  const previousTotals = companyTotals(sales.previousMonth);
  const anyToday = [...today.values()].find((row) => row.date);
  const anyMonth = [...month.values()].find((row) => row.month);
  const anyPrevious = [...previous.values()].find((row) => row.month);
  return {
    platform,
    // The 7-day history is scoped to the shop cards.
    provides: { week: false, previous: Boolean(sales.previousMonth) },
    shops,
    company: {
      today: todayTotals,
      month: monthTotals,
      previous: previousTotals,
      metrics: monthTotals
        ? monthMetrics(
            monthTotals,
            previousTotals,
            todayTotals,
            finishedDays(anyToday?.date, anyMonth?.month, todayTotals),
            daysInMonth(anyPrevious?.month),
          )
        : null,
      avg: null,
      daily: [],
      coverage: { today: coverageOf(sales.today), month: coverageOf(sales.month) },
      missing: shops.filter((s) => !s.counted).map((s) => s.name),
      updatedAt: jstStamp(latest([...today.values()].map((row) => row.sourceUpdatedAt))),
    },
  };
}

// au PAY, TEMU and Mercari have no records to show: their shops still get their place on the list of
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
