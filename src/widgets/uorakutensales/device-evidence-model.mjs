/*
 * 内訳 — our own products behind one model on the device board, and how each
 * was recognized: the model (an order choice or SKU attribute, or the title)
 * and, for cases and sets, the case style (a verified series, the title, the
 * same product's earlier title, or not at all).
 *
 *   devicesEvidence → GET /api/device-sales/evidence (one model, one scope)
 *
 * The figures are the board's own: units, tax-inclusive item yen and distinct
 * orders. A row's orders are its own; the scope's come from the server's
 * summary, never from adding rows. Missing stays missing (null, not 0).
 */

const NO_FIGURES = Object.freeze({ units: null, sales: null, orders: null });

function text(value) {
  return String(value ?? "").trim();
}

function measured(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function figuresOf(source) {
  return {
    units: measured(source?.unitsSold),
    sales: measured(source?.salesYen),
    orders: measured(source?.orderCount),
  };
}

// the proxy already keeps only public pages; anything else is not a link here either
function webLink(value) {
  const url = text(value);
  return /^https?:\/\//.test(url) ? url : null;
}

// how the model was read: the order's choice or SKU attribute, or the title
function deviceBasis(evidence) {
  const option = (Array.isArray(evidence?.options) ? evidence.options : [])[0];
  return {
    source: text(evidence?.source) || null,
    option: option ? { source: text(option.source), key: text(option.key), value: text(option.value) } : null,
  };
}

// how the case style was decided; films carry none
function styleBasis(row) {
  const evidence = row?.caseStyleEvidence;
  if (!evidence || typeof evidence !== "object") return null;
  const references = Array.isArray(evidence.references) ? evidence.references : [];
  return {
    key: text(evidence.style || row.caseStyle) || null,
    source: text(evidence.source) || null,
    rule: text(evidence.rule) || null,
    text: text(evidence.matchedText) || null,
    example: references.map((ref) => webLink(ref?.url)).find(Boolean) ?? null,
    // the earlier title of the same product that settled the style
    history: text(evidence.productTitle) || null,
  };
}

function countBy(keys) {
  const counts = {};
  keys.filter(Boolean).forEach((key) => {
    counts[key] = (counts[key] ?? 0) + 1;
  });
  return counts;
}

function empty(status) {
  return { status, summary: NO_FIGURES, total: 0, more: false, basis: { device: {}, style: {} }, rows: [] };
}

// What a model's 内訳 can show: still loading, failed (the proxy relayed an
// error, or sent no list), or the products — with the scope's summary, the
// server's row count, whether rows were left past the page, and how many rows
// each recognition source settled.
export function buildDeviceEvidence(payload) {
  if (payload == null) return empty("loading");
  if (typeof payload !== "object" || payload.error || !Array.isArray(payload.evidence)) return empty("failed");
  const rows = payload.evidence
    .filter((row) => row && typeof row === "object" && text(row.id))
    .map((row) => ({
      id: text(row.id),
      shop: text(row.shopName),
      itemNumber: text(row.itemNumber),
      title: text(row.title),
      // the product's own public page, when it has one
      url: webLink(row.itemUrl),
      ...figuresOf(row),
      device: deviceBasis(row.deviceEvidence),
      style: styleBasis(row),
    }));
  return {
    status: "ready",
    summary: payload.summary ? figuresOf(payload.summary) : NO_FIGURES,
    total: measured(payload.pagination?.totalItems) ?? rows.length,
    more: payload.pagination?.hasMore === true,
    basis: {
      device: countBy(rows.map((row) => row.device.source)),
      style: countBy(rows.map((row) => row.style?.source)),
    },
    rows,
  };
}

// The rows by the metric on screen, more pieces first on a tie. A row the
// metric cannot measure yet sinks to the bottom instead of reading as zero.
export function rankDeviceEvidence(rows, metric) {
  const tie = (a, b) => (b.units ?? 0) - (a.units ?? 0) || a.id.localeCompare(b.id);
  return [...rows].sort((a, b) => {
    const av = a[metric];
    const bv = b[metric];
    if (av == null || bv == null) {
      if (av == null && bv == null) return tie(a, b);
      return av == null ? 1 : -1;
    }
    return bv - av || tie(a, b);
  });
}
