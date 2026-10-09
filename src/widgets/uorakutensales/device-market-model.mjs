/*
 * 市場 — uo-ec-manager's market reference for phone-case models, set against
 * our own case sales.
 *
 *   market → GET /api/market-rankings/device-models
 *
 * The server merges the Rakuten case rankings, Yahoo case trends and Yahoo
 * searches it saved since the 1st of last month into one score per model
 * (leader = 100), rebuilt once a day. It is a reference only: the score never
 * becomes units, money or a market share.
 */
import { rankDeviceBoard } from "./device-sales-model.mjs";

// a market top-20 model that we rank below 30th is one we trail on
export const MARKET_GAP_TOP = 20;
export const OWN_WEAK_FROM = 30;
// one of our own top 10
export const OWN_STRONG_TO = 10;
// the reference is rebuilt once a day; an hour between reads is plenty
export const MARKET_REFRESH_INTERVAL = 3600000;
// the three signals behind a score, in the order the server weighs them
export const MARKET_SOURCES = Object.freeze(["rakutenProducts", "yahooSearch", "yahooProducts"]);

function text(value) {
  return String(value ?? "").trim();
}

function measured(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function bySource(values) {
  return Object.fromEntries(MARKET_SOURCES.map((key) => [key, measured(values?.[key])]));
}

// Null while there is nothing to read: still loading, or the proxy relayed an
// error (an older server without the route answers 404).
export function buildMarketReference(payload) {
  if (!payload || typeof payload !== "object" || payload.error || !Array.isArray(payload.ranks)) return null;
  const rows = payload.ranks
    .map((row) => ({
      rank: measured(row?.rank) ?? 0,
      model: text(row?.model),
      score: measured(row?.score) ?? 0,
      sources: bySource(row?.sourceScores),
    }))
    .filter((row) => row.model);
  const status = text(payload.status) || "not_ready";
  const sources = payload.sources || {};
  return {
    status,
    ready: status !== "not_ready" && rows.length > 0,
    partial: payload.partial === true,
    // a source still serving its last good capture
    stale: ["rakuten", "yahoo"].some((key) => sources[key]?.stale === true),
    startDate: text(payload.startDate),
    endDate: text(payload.endDate),
    recordedDays: measured(payload.recordedDays) ?? 0,
    expectedDays: measured(payload.expectedDays) ?? 0,
    weights: bySource(payload.scoreWeights),
    rows,
  };
}

function flagOf(marketRank, own) {
  if (!own) return "none";
  if (marketRank <= MARKET_GAP_TOP && own.rank > OWN_WEAK_FROM) return "weak";
  if (own.rank <= OWN_STRONG_TO) return "strong";
  return null;
}

// The 市場 list: each market row with where the model stands on our own case
// board for the chosen period and shop, ranked by the metric on screen over
// single-model rows (a combination row covers several models, so its rank is
// no one model's). Without our board there is nothing to set it against — no
// own figures and no flags, since an unread board is not "not selling".
export function marketRows(reference, ownBoard, metric) {
  if (!reference) return [];
  if (!ownBoard) return reference.rows.map((row) => ({ ...row, own: null, flag: null }));
  const singles = { ...ownBoard, rows: ownBoard.rows.filter((row) => !row.compat) };
  const own = new Map(
    rankDeviceBoard(singles, metric).map((row) => [row.fullModel, { rank: row.rank, value: row.value }]),
  );
  return reference.rows.map((row) => {
    const mine = own.get(row.model) ?? null;
    return { ...row, own: mine, flag: flagOf(row.rank, mine) };
  });
}

// What a model's 根拠 panel can show: still loading, failed (the proxy relayed
// an error, or sent no list), or the model's evidence — most contributing
// first, as the proxy picked it out. Entries without a title show nothing and
// drop out; `total` stays the server's count.
export function buildMarketEvidence(payload) {
  if (payload == null) return { status: "loading", total: 0, items: [] };
  if (typeof payload !== "object" || payload.error || !Array.isArray(payload.items)) {
    return { status: "failed", total: 0, items: [] };
  }
  const items = payload.items.filter((item) => item && typeof item === "object" && text(item.title));
  return { status: "ready", total: measured(payload.total) ?? items.length, items };
}
