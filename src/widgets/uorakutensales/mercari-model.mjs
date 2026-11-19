// The Mercari Shops shops on the company sales board, read from one snapshot:
//   mercariSales → GET /api/mercari/sales  today, this month, last month and shop history
//
// Section 14 of the backend doc. The server answers in au PAY's shape, so the
// board reads it the same way: shops keyed by configId (3911 is also a 楽天 and
// an au PAY shop's name), only `ready` shops in the platform totals, a stale
// shop's figures shown as not current.
// Its yen are item price × quantity kept, by JST order day: before coupons and
// platform fees, without shipping. They are shown beside the other platforms'
// and never added to them.

import { shopBoardsOf } from "./amazon-model.mjs";
import { buildConfigShops, configKey } from "./aupay-model.mjs";

export function mercariKey(row) {
  return configKey("mercari", row);
}

// Null when the snapshot is missing or no shop is enabled.
export function buildMercari(sales) {
  return buildConfigShops("mercari", sales);
}

// Each Mercari shop's best sellers for one period (the proxy's mercariRanking
// for today, mercariRankingMonthly for this and last month), as shop boards
// beside 楽天's. Like Amazon, Mercari has no company-wide board.
export function buildMercariBoards(period) {
  return shopBoardsOf(period, "mercari", mercariKey);
}
