// The Amazon shops on the company sales board, read from three snapshots:
//   amazonSales   → GET /api/amazon/sales          today, this month, last month
//   amazonHistory → GET /api/amazon/history/sales  the last seven finished days
//   amazonRanking → GET /api/amazon/item-rankings  today's item boards, per shop
//
// Amazon's yen come from its own Sales API, a different basis from 楽天's
// order-API amounts, so they are shown beside 楽天's and never added to them;
// order and unit counts add up across platforms. Only JPY shops carry yen here:
// another currency's amounts are unknown in yen, never converted.

import {
  daysInMonth,
  dayWithinMonth,
  mdLabel,
  monthMetrics,
  numberOrNull,
  RANKING_DIMS,
  RANKING_MAX_COUNT,
  ratio,
  weekdayJp,
} from "./sales-model.mjs";

export const PLATFORMS = Object.freeze(["rakuten", "amazon"]);

function triple(sales, units, orders) {
  return { sales, units, orders };
}

// Amazon names its metrics its own way; yen only for a JPY shop
function metricsOf(totals, currency) {
  if (!totals) return null;
  return triple(
    currency === "JPY" ? numberOrNull(totals.salesAmount) : null,
    numberOrNull(totals.unitsSold),
    numberOrNull(totals.orderCount),
  );
}

// "2026-10-30T04:55:45.603Z" → "2026-10-30 13:55:45 JST", the stamp style the
// 楽天 snapshots use, so both platforms read the same on the page
export function jstStamp(iso) {
  const ms = Date.parse(String(iso || ""));
  if (Number.isNaN(ms)) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(ms))
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} JST`;
}

// the newest of several ISO times, or "" when none parses
export function latest(isos) {
  const times = isos.map((iso) => Date.parse(String(iso || ""))).filter((ms) => !Number.isNaN(ms));
  return times.length ? new Date(Math.max(...times)).toISOString() : "";
}

// A shop's figures for one period, only while the server counts them: a stale
// shop keeps its last values, but like 楽天's they are not today's.
export function periodOf(row) {
  return row && row.includedInTotals === true ? metricsOf(row.totals, row.currency) : null;
}

// Accounts can sell in several marketplaces under one name: the platform,
// account and marketplace together are what tell two shops apart.
export function amazonKey(row) {
  return `amazon:${row?.accountId ?? ""}:${row?.marketplaceId ?? ""}`;
}

export function rowsByKey(period, keyOf = amazonKey) {
  return new Map((period?.shops || []).filter((row) => row.enabled !== false).map((row) => [keyOf(row), row]));
}

// Finished days of the month, so the pace leaves today's half-run day out; 0
// when today is unknown, which reports no pace rather than an inflated one.
export function finishedDays(todayDate, month, today) {
  if (!today) return 0;
  return Math.max(0, dayWithinMonth(todayDate, month) - 1);
}

function sumKnown(values) {
  return values.some((v) => v === null || v === undefined) ? null : values.reduce((a, b) => a + b, 0);
}

function addTriples(list) {
  if (!list.length || list.some((v) => !v)) return null;
  return triple(
    sumKnown(list.map((v) => v.sales)),
    sumKnown(list.map((v) => v.units)),
    sumKnown(list.map((v) => v.orders)),
  );
}

export function companyTotals(period) {
  if (!period || period.ok === false) return null;
  return metricsOf(period.totalsByCurrency?.JPY, "JPY");
}

export function coverageOf(period) {
  const covered = numberOrNull(period?.updatedShopCount);
  const total = numberOrNull(period?.enabledShopCount);
  return covered === null || total === null ? null : { covered, total };
}

// Build the Amazon view model. Null when the snapshot is missing or no shop is
// enabled — the board then reads exactly as it did before Amazon.
export function buildAmazon(sales, history) {
  if (!sales || sales.error || !sales.today) return null;
  const today = rowsByKey(sales.today);
  const month = rowsByKey(sales.month);
  const previous = rowsByKey(sales.previousMonth);
  const keys = [...new Set([...today.keys(), ...month.keys(), ...previous.keys()])];
  if (!keys.length) return null;

  const historyByKey = new Map((history?.shops || []).map((row) => [amazonKey(row), row]));
  const windowDays = numberOrNull(history?.window?.completeDays) || 7;

  const shops = keys.map((key) => {
    const row = today.get(key) || month.get(key) || previous.get(key);
    const t = periodOf(today.get(key));
    const m = periodOf(month.get(key));
    const p = periodOf(previous.get(key));
    const monthStr = month.get(key)?.month ?? "";
    const metrics = m
      ? monthMetrics(m, p, t, finishedDays(today.get(key)?.date, monthStr, t), daysInMonth(previous.get(key)?.month))
      : null;
    const h = historyByKey.get(key);
    const week = h?.includedInTotals === true ? metricsOf(h.totals, h.currency) : null;
    return {
      key,
      name: row.shopName,
      platform: "amazon",
      currency: row.currency,
      today: t,
      month: m,
      previous: p,
      metrics,
      week,
      avg: week
        ? triple(
            week.sales === null ? null : week.sales / windowDays,
            ratio(week.units, windowDays),
            ratio(week.orders, windowDays),
          )
        : null,
      daily: week
        ? (h.daily || [])
            .filter((d) => d?.date)
            .map((d) => ({
              date: d.date,
              md: mdLabel(d.date),
              wd: weekdayJp(d.date),
              ...metricsOf(d.totals, h.currency),
            }))
        : [],
      counted: today.get(key)?.includedInTotals === true,
      updatedAt: jstStamp(today.get(key)?.sourceUpdatedAt || month.get(key)?.sourceUpdatedAt),
    };
  });

  // the company figures: the server's own JPY totals, and a pace only when every
  // shop shares one local date, so the finished days mean the same for all
  const todayTotals = companyTotals(sales.today);
  const monthTotals = companyTotals(sales.month);
  const dates = new Set(shops.map((s) => today.get(s.key)?.date).filter(Boolean));
  const months = new Set(shops.map((s) => month.get(s.key)?.month).filter(Boolean));
  const [todayDate] = dates;
  const [monthStr] = months;
  const prevMonthStr = (sales.previousMonth?.shops || []).find((row) => row.month)?.month ?? "";
  const sameDay = dates.size === 1 && months.size === 1;

  // the days every counted shop's history holds, added up by date
  const withHistory = shops.filter((s) => s.daily.length);
  const commonDates = withHistory.length
    ? withHistory[0].daily
        .map((d) => d.date)
        .filter((date) => withHistory.every((s) => s.daily.some((d) => d.date === date)))
    : [];
  const daily = commonDates.map((date) => ({
    date,
    md: mdLabel(date),
    wd: weekdayJp(date),
    ...addTriples(withHistory.map((s) => s.daily.find((d) => d.date === date))),
  }));

  return {
    platform: "amazon",
    // Amazon serves a week and a last month, so it joins the company's comparisons
    provides: { week: true, previous: true },
    shops,
    company: {
      today: todayTotals,
      month: monthTotals,
      previous: companyTotals(sales.previousMonth),
      metrics: monthTotals
        ? monthMetrics(
            monthTotals,
            companyTotals(sales.previousMonth),
            todayTotals,
            sameDay ? finishedDays(todayDate, monthStr, todayTotals) : 0,
            daysInMonth(prevMonthStr),
          )
        : null,
      // a seven-day average needs every shop's week; one missing makes it unknown
      avg: shops.every((s) => s.avg) ? addTriples(shops.map((s) => s.avg)) : null,
      daily,
      coverage: { today: coverageOf(sales.today), month: coverageOf(sales.month) },
      missing: shops.filter((s) => !s.counted).map((s) => s.name),
      updatedAt: jstStamp(latest(shops.map((s) => today.get(s.key)?.sourceUpdatedAt))),
    },
  };
}

// A shop's card for the analysis section's 7-day trend, in the shape the 楽天
// cards use. Amazon reports no visits, so the CVR is unknown, never 0%.
export function trendRowOf(shop) {
  return {
    key: shop.key,
    name: shop.name,
    platform: shop.platform,
    h7Total: shop.week?.sales ?? null,
    h7Orders: shop.week?.orders ?? null,
    h7Units: shop.week?.units ?? null,
    cvr: null,
    daily: shop.daily.map((d) => ({
      ...d,
      sales: d.sales ?? 0,
      orders: d.orders ?? 0,
      units: d.units ?? 0,
      cvr: null,
    })),
    logoUrl: null,
  };
}

// ---- all-time records (GET /api/amazon/history/peaks) ----

// value key per record dimension, in Amazon's names
const PEAK_KEY = { sales: "salesAmount", units: "unitsSold", orders: "orderCount" };

// Each Amazon shop's own best day joins 楽天's shop bests, ranked by the same
// value. The company records stay 楽天's: Amazon's history starts later (what
// its API still serves) and its yen are counted differently, so no record day
// is shared across platforms. `amazonSince` says where Amazon's records start.
export function withAmazonPeaks(peaks, amazonPeaks) {
  if (!peaks || !amazonPeaks || amazonPeaks.error) return peaks;
  const shops = (amazonPeaks.shops || []).filter((s) => s.enabled !== false && s.status !== "disabled" && s.records);
  if (!shops.length) return peaks;

  const shopBests = { ...peaks.shopBests };
  Object.entries(PEAK_KEY).forEach(([dim, key]) => {
    if (!shopBests[dim]) return;
    const rows = shops
      .map((s) => {
        // another currency's yen are not comparable at all
        const record = dim === "sales" && s.currency !== "JPY" ? null : s.records[key];
        const value = numberOrNull(record?.value);
        if (value === null) return null;
        const date = String(record.date || "");
        return {
          key: amazonKey(s),
          platform: "amazon",
          shopName: s.shopName,
          value,
          noRecord: value <= 0,
          date,
          md: mdLabel(date),
          wd: weekdayJp(date),
          year: Number(date.slice(0, 4)) || null,
          // 楽天's record days say nothing about an Amazon shop
          onRecordDay: false,
        };
      })
      .filter(Boolean);
    shopBests[dim] = [...shopBests[dim], ...rows]
      .sort((a, b) => b.value - a.value)
      .map((row, i) => ({ ...row, rank: i + 1 }));
  });

  const since = shops
    .map((s) => String(s.coverage?.startDate || ""))
    .filter(Boolean)
    .sort()[0];
  return { ...peaks, shopBests, amazonSince: since || null };
}

// ---- item boards (GET /api/amazon/item-rankings) ----

// One Amazon item in the shape the 楽天 boards use. The SKU is the seller's own
// handle, like 楽天's management number. A pending order can carry units
// before its amount: that amount stays null, never ¥0.
function normalizeAmazonItem(item, shopName) {
  const salesYen = item?.currency === "JPY" ? numberOrNull(item?.salesAmount) : null;
  const unitsSold = numberOrNull(item?.unitsSold) ?? 0;
  return {
    rank: numberOrNull(item?.rank) ?? 0,
    mno:
      String(item?.sku ?? "").trim() ||
      String(item?.asin ?? "").trim() ||
      String(item?.itemName ?? "")
        .trim()
        .slice(0, 24) ||
      "-",
    url: String(item?.itemUrl ?? "").trim() || null,
    imageUrl: String(item?.imageUrl ?? "").trim() || null,
    salesYen,
    unitsSold,
    orderCount: numberOrNull(item?.orderCount) ?? 0,
    avgPrice: salesYen !== null && unitsSold > 0 ? salesYen / unitsSold : null,
    shopCount: 1,
    shopName,
  };
}

// Per dimension, one board per Amazon shop, ready to sit beside 楽天's shop
// boards. Amazon has no company-wide board: its shops are only ranked apart.
export function buildAmazonBoards(ranking) {
  if (!ranking || ranking.error) return null;
  const shops = (ranking.shops || []).filter((s) => s.enabled !== false && s.status !== "disabled");
  if (!shops.length) return null;
  return Object.fromEntries(
    RANKING_DIMS.map((dim) => [
      dim,
      shops.map((s) => ({
        key: amazonKey(s),
        shopName: s.shopName,
        platform: "amazon",
        itemCount: numberOrNull(s.itemCount) ?? 0,
        ok: s.status === "ready" || s.status === "partial",
        stale: s.status === "stale",
        items: (s.rankings?.[dim] || []).slice(0, RANKING_MAX_COUNT).map((it) => normalizeAmazonItem(it, s.shopName)),
      })),
    ]),
  );
}
