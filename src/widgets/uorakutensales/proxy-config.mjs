const DEFAULT_SALES_SERVICE_URL = "http://127.0.0.1:3912";

// Read-only snapshot endpoints the company dashboard is allowed to call.
// The forbidden refresh/query endpoints (POST /api/query, /api/admin/*,
// GET /api/campaigns/current) are never exposed here.
// The Server authenticates by private-network CIDR + Host, not by bearer token,
// so no Authorization header is sent.
const ENDPOINT_PATHS = {
  sales: "/api/sales",
  history: "/api/history/sales",
  campaigns: "/api/campaigns",
  logos: "/api/shops/logos",
  ranking: "/api/item-rankings",
  peaks: "/api/history/peaks",
  monthly: "/api/sales/monthly",
  // full device boards (no limit/date): the widget ranks, filters and pages them
  devices: "/api/device-sales",
  devicesMonthly: "/api/device-sales/monthly",
  // the market reference for phone-case models, rebuilt once a day
  market: "/api/market-rankings/device-models",
  // one model's evidence: the proxy reads the same reference and picks it out
  marketEvidence: "/api/market-rankings/device-models",
  // our own products behind one model, read with that model's scope
  devicesEvidence: "/api/device-sales/evidence",
};

export function normalizeSalesServiceUrl(baseUrl = DEFAULT_SALES_SERVICE_URL) {
  const normalized = String(baseUrl || DEFAULT_SALES_SERVICE_URL)
    .trim()
    .replace(/\/+$/, "");

  return normalized || DEFAULT_SALES_SERVICE_URL;
}

// `search` is the validated scope of a devicesEvidence read; every other
// endpoint is read without a query string
export function buildSalesProxyRequest({ endpoint, baseUrl, search = null }) {
  const path = ENDPOINT_PATHS[endpoint];
  if (!path) {
    throw new Error(`Unsupported Rakuten sales endpoint: ${endpoint}`);
  }

  const serviceUrl = normalizeSalesServiceUrl(baseUrl);
  const url = new URL(`${serviceUrl}${path}`);
  if (search) {
    Object.entries(search).forEach(([key, value]) => url.searchParams.set(key, value));
  }

  return {
    url,
    params: {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    },
  };
}

// per source, only what says whether the reference can be trusted
const MARKET_SOURCE_FIELDS = ["configured", "status", "partial", "recordedDays", "modelCount", "stale", "lastError"];

function sourceStatus(source) {
  if (!source || typeof source !== "object") return source;
  return Object.fromEntries(MARKET_SOURCE_FIELDS.filter((key) => key in source).map((key) => [key, source[key]]));
}

// The board reads the market ranking, not the evidence behind it: the full
// reference repeats item titles, URLs and per-day observations (about 1 MB)
// that the ranking (about 30 KB) never needs. Not a reference → untouched.
export function slimMarketReference(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.ranks)) return data;
  const slim = {
    ...data,
    ranks: data.ranks.map((row) => {
      const copy = { ...row };
      delete copy.evidenceIds;
      return copy;
    }),
  };
  delete slim.evidence;
  if (data.sources && typeof data.sources === "object") {
    slim.sources = { rakuten: sourceStatus(data.sources.rakuten), yahoo: sourceStatus(data.sources.yahoo) };
  }
  return slim;
}

// The server weighs a ranking signal by 1/√rank, splits a listing that names
// several models evenly between them, and mixes Rakuten daily / realtime at
// 70 / 30 and Yahoo search ranking / rising at 5/6 / 1/6.
const PERIOD_WEIGHT = { daily: 0.7, realtime: 0.3, ranking: 5 / 6, up: 1 / 6, trend: 1 };
// only public Rakuten / Yahoo pages become links
const LINK_HOSTS = ["rakuten.co.jp", "yahoo.co.jp"];
const MAX_MODEL_LENGTH = 100;

function linkOf(value) {
  try {
    const url = new URL(String(value));
    const host = LINK_HOSTS.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
    return (url.protocol === "https:" || url.protocol === "http:") && host ? url.toString() : null;
  } catch {
    return null;
  }
}

function signalOf(item) {
  const observed = (item.observations || []).reduce((sum, o) => {
    const rank = Number(o?.sourceRank);
    return rank > 0 ? sum + (Number(o?.modelShare) || 0) / Math.sqrt(rank) : sum;
  }, 0);
  return observed * (PERIOD_WEIGHT[item.period] ?? 1);
}

function compactEvidence(item) {
  const seen = (item.observations || []).filter((o) => Number(o?.sourceRank) > 0);
  const best = seen.reduce((top, o) => (!top || o.sourceRank < top.sourceRank ? o : top), null);
  return {
    id: item.id,
    group: item.group,
    period: item.period,
    type: item.type,
    title: String((item.type === "keyword" ? item.query : item.itemName) ?? "").trim(),
    url: linkOf(item.type === "keyword" ? item.url : item.itemUrl),
    bestRank: best ? Number(best.sourceRank) : null,
    bestDate: best ? String(best.date ?? "") : "",
    days: seen.length,
    models: seen.reduce((most, o) => Math.max(most, Array.isArray(o.models) ? o.models.length : 0), 0),
  };
}

// One model's evidence out of the full reference, most contributing first:
// each signal's share of its source, weighted by how much that source adds to
// the model's score. Only what the 根拠 list shows leaves the proxy.
export function pickModelEvidence(reference, model) {
  if (!reference || typeof reference !== "object" || !Array.isArray(reference.ranks)) return reference;
  const row = reference.ranks.find((r) => r?.model === model);
  const byId = new Map((Array.isArray(reference.evidence) ? reference.evidence : []).map((item) => [item?.id, item]));
  const items = (row?.evidenceIds || []).map((id) => byId.get(id)).filter(Boolean);
  const signalByGroup = {};
  items.forEach((item) => {
    signalByGroup[item.group] = (signalByGroup[item.group] ?? 0) + signalOf(item);
  });
  const weightOf = (item) => {
    const total = signalByGroup[item.group];
    if (!(total > 0)) return 0;
    const sourceWeight = Number(reference.scoreWeights?.[item.group]) || 0;
    const sourceScore = Number(row.sourceScores?.[item.group]) || 0;
    return (sourceWeight * sourceScore * signalOf(item)) / total;
  };
  const ranked = items
    .map((item) => ({ item, weight: weightOf(item) }))
    .sort((a, b) => b.weight - a.weight)
    .map(({ item }) => compactEvidence(item));
  return { model, total: ranked.length, items: ranked };
}

// the proxy's `query` parameter (JSON) as a plain object, or null
function parseQuery(query) {
  if (typeof query !== "string" || !query) return null;
  try {
    const value = JSON.parse(query);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

// a non-empty trimmed string up to `max` characters, or null
function boundedText(value, max) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

// The model a marketEvidence request asks for, out of the proxy's `query`
// parameter; null for anything that is not one sensible model name.
export function marketEvidenceModel(query) {
  return boundedText(parseQuery(query)?.model, MAX_MODEL_LENGTH);
}

const EVIDENCE_TYPES = ["case", "film", "case_film_set"];
const EVIDENCE_STYLES = ["folio", "standard", "unknown"];
// a combination row's name lists every model it covers
const MAX_EVIDENCE_MODEL_LENGTH = 300;
const MAX_SHOP_NAME_LENGTH = 60;
// the server's largest page: even last month's biggest model fits in one read
const EVIDENCE_PAGE_SIZE = "500";

// The scope of a devicesEvidence read — one date or one month, the model as
// the board ranks it, its category, and optionally a case style and a shop —
// as the server's query string; null for anything the server would refuse.
export function deviceEvidenceQuery(query) {
  const raw = parseQuery(query);
  if (!raw) return null;
  const hasDate = raw.date !== undefined;
  if (hasDate === (raw.month !== undefined)) return null;
  const period = hasDate ? raw.date : raw.month;
  if (typeof period !== "string" || !(hasDate ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{4}-\d{2}$/).test(period)) return null;
  const model = boundedText(raw.model, MAX_EVIDENCE_MODEL_LENGTH);
  if (!model || !EVIDENCE_TYPES.includes(raw.type)) return null;
  const search = { [hasDate ? "date" : "month"]: period, model, type: raw.type };
  if (raw.style !== undefined) {
    if (!EVIDENCE_STYLES.includes(raw.style) || raw.type === "film") return null;
    search.style = raw.style;
  }
  if (raw.shopName !== undefined) {
    const shop = boundedText(raw.shopName, MAX_SHOP_NAME_LENGTH);
    if (!shop) return null;
    search.shopName = shop;
  }
  return { ...search, page: "1", pageSize: EVIDENCE_PAGE_SIZE };
}

// The 内訳 list never charts a product's days, and a product page or example
// link is kept only when it is a public Rakuten / Yahoo page. Not a list →
// untouched.
function slimDeviceEvidence(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.evidence)) return data;
  return {
    ...data,
    evidence: data.evidence.map((row) => {
      const copy = { ...row, itemUrl: linkOf(row.itemUrl) };
      delete copy.daily;
      const style = copy.caseStyleEvidence;
      if (style && typeof style === "object") {
        copy.caseStyleEvidence = {
          ...style,
          references: (Array.isArray(style.references) ? style.references : [])
            .map((ref) => ({ ...ref, url: linkOf(ref?.url) }))
            .filter((ref) => ref.url),
        };
      }
      return copy;
    }),
  };
}

// what a successful read of each endpoint hands to the browser
export function shapeProxyResponse(endpoint, data, params = {}) {
  if (endpoint === "market") return slimMarketReference(data);
  if (endpoint === "marketEvidence") return pickModelEvidence(data, params.model);
  if (endpoint === "devicesEvidence") return slimDeviceEvidence(data);
  return data;
}
