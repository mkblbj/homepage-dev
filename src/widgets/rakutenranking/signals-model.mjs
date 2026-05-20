export const DEFAULT_SIGNAL_CONFIG = {
  enabled: false,
  realtimeTop: 50,
  dailyTop: 50,
  historyDays: 7,
  minRealtimeHits: 2,
  limit: 3,
};

const SIGNAL_LABELS = {
  daily_confirmed: "DAILY CONFIRMED",
  watching: "WATCHING",
  realtime_new: "REALTIME NEW",
};

const SIGNAL_PRIORITIES = {
  daily_confirmed: 3,
  watching: 2,
  realtime_new: 1,
};

function positiveInteger(value, fallback, { min = 1, max = 1000 } = {}) {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < min) return fallback;
  return Math.min(numberValue, max);
}

export function normalizeSignalConfig(rawConfig) {
  const enabled = rawConfig?.enabled === true;

  return {
    enabled,
    realtimeTop: positiveInteger(rawConfig?.realtimeTop, DEFAULT_SIGNAL_CONFIG.realtimeTop, { max: 1000 }),
    dailyTop: positiveInteger(rawConfig?.dailyTop, DEFAULT_SIGNAL_CONFIG.dailyTop, { max: 1000 }),
    historyDays: positiveInteger(rawConfig?.historyDays, DEFAULT_SIGNAL_CONFIG.historyDays, { max: 90 }),
    minRealtimeHits: positiveInteger(rawConfig?.minRealtimeHits, DEFAULT_SIGNAL_CONFIG.minRealtimeHits, { max: 20 }),
    limit: positiveInteger(rawConfig?.limit, DEFAULT_SIGNAL_CONFIG.limit, { max: 20 }),
  };
}

function emptyState() {
  return {
    version: 1,
    endpoints: {},
  };
}

function ensureEndpointState(state, endpointKey) {
  if (!state.endpoints[endpointKey]) {
    state.endpoints[endpointKey] = {
      warmedUp: false,
      items: {},
    };
  }
  if (!state.endpoints[endpointKey].items) {
    state.endpoints[endpointKey].items = {};
  }
  return state.endpoints[endpointKey];
}

function cloneState(previousState) {
  if (!previousState || typeof previousState !== "object") return emptyState();
  return {
    version: 1,
    endpoints: Object.fromEntries(
      Object.entries(previousState.endpoints || {}).map(([endpointKey, endpointState]) => [
        endpointKey,
        {
          warmedUp: endpointState?.warmedUp === true,
          items: Object.fromEntries(
            Object.entries(endpointState?.items || {}).map(([itemCode, record]) => [
              itemCode,
              { ...(record || {}) },
            ]),
          ),
        },
      ]),
    ),
  };
}

function cutoffTime(nowDate, historyDays) {
  return nowDate.getTime() - historyDays * 24 * 60 * 60 * 1000;
}

function isInsideEventWindow(record, cutoffMs) {
  const firstSeenTime = new Date(record.firstSeenAt || 0).getTime();
  return Number.isFinite(firstSeenTime) && firstSeenTime >= cutoffMs;
}

function itemIdentity(item) {
  return String(item?.itemCode || item?.itemUrl || item?.itemName || "").trim();
}

function normalizeRank(item) {
  const rank = Number(item?.rank);
  return Number.isInteger(rank) && rank > 0 ? rank : null;
}

function copyDisplayFields(record, item) {
  record.itemCode = itemIdentity(item);
  record.itemName = String(item.itemName || record.itemName || "");
  record.itemUrl = String(item.itemUrl || record.itemUrl || "");
  record.imageUrl = String(item.imageUrl || record.imageUrl || "");
  record.itemPrice = item.itemPrice ?? record.itemPrice ?? null;
  record.shopName = String(item.shopName || record.shopName || "");
}

function topItems(items, topRank) {
  return (items || [])
    .map((item) => ({ item, rank: normalizeRank(item), key: itemIdentity(item) }))
    .filter(({ rank, key }) => key && rank !== null && rank <= topRank)
    .sort((a, b) => a.rank - b.rank);
}

function updateRealtimeRecord({ endpointState, item, rank, nowIso }) {
  const key = itemIdentity(item);
  const existing = endpointState.items[key];
  const isNew = !existing;
  const record = existing || {
    itemCode: key,
    firstSeenAt: nowIso,
    realtimeHits: 0,
    dailyHits: 0,
    bestRealtimeRank: null,
    bestDailyRank: null,
  };

  copyDisplayFields(record, item);
  record.lastSeenAt = nowIso;
  record.lastRealtimeSeenAt = nowIso;
  record.latestRealtimeRank = rank;
  record.realtimeHits = Number(record.realtimeHits || 0) + 1;
  record.bestRealtimeRank = record.bestRealtimeRank ? Math.min(record.bestRealtimeRank, rank) : rank;
  endpointState.items[key] = record;

  return { record, isNew };
}

function updateDailyRecord({ endpointState, item, rank, nowIso }) {
  const key = itemIdentity(item);
  const existing = endpointState.items[key];
  const record = existing || {
    itemCode: key,
    firstSeenAt: nowIso,
    realtimeHits: 0,
    dailyHits: 0,
    bestRealtimeRank: null,
    bestDailyRank: null,
  };

  copyDisplayFields(record, item);
  record.lastSeenAt = nowIso;
  record.lastDailySeenAt = nowIso;
  record.latestDailyRank = rank;
  record.dailyHits = Number(record.dailyHits || 0) + 1;
  record.bestDailyRank = record.bestDailyRank ? Math.min(record.bestDailyRank, rank) : rank;
  endpointState.items[key] = record;

  return record;
}

function makeSignal(status, record) {
  return {
    status,
    label: SIGNAL_LABELS[status],
    priority: SIGNAL_PRIORITIES[status],
    itemCode: record.itemCode,
    itemName: record.itemName,
    itemUrl: record.itemUrl,
    imageUrl: record.imageUrl,
    itemPrice: record.itemPrice,
    shopName: record.shopName,
    realtimeRank: record.latestRealtimeRank ?? null,
    dailyRank: record.latestDailyRank ?? null,
    bestRealtimeRank: record.bestRealtimeRank ?? null,
    bestDailyRank: record.bestDailyRank ?? null,
    realtimeHits: Number(record.realtimeHits || 0),
    firstSeenAt: record.firstSeenAt,
    lastSeenAt: record.lastSeenAt,
  };
}

export function buildRankingSignals({
  now = new Date().toISOString(),
  endpointKey = "default",
  config = DEFAULT_SIGNAL_CONFIG,
  previousState,
  realtimeItems = [],
  dailyItems = [],
}) {
  const normalizedConfig = normalizeSignalConfig(config);
  const nowDate = new Date(now);
  const nowIso = Number.isNaN(nowDate.getTime()) ? new Date().toISOString() : nowDate.toISOString();
  const effectiveNowDate = new Date(nowIso);
  const cutoffMs = cutoffTime(effectiveNowDate, normalizedConfig.historyDays);
  const nextState = cloneState(previousState);
  const endpointState = ensureEndpointState(nextState, endpointKey);
  const warmingUp = endpointState.warmedUp !== true;
  const newRealtimeKeys = new Set();

  for (const { item: rankedItem, rank } of topItems(realtimeItems, normalizedConfig.realtimeTop)) {
    const { record, isNew } = updateRealtimeRecord({ endpointState, item: rankedItem, rank, nowIso });
    if (isNew && !warmingUp && isInsideEventWindow(record, cutoffMs)) {
      record.signalFirstSeenAt = nowIso;
      newRealtimeKeys.add(record.itemCode);
    }
  }

  for (const { item: rankedItem, rank } of topItems(dailyItems, normalizedConfig.dailyTop)) {
    updateDailyRecord({ endpointState, item: rankedItem, rank, nowIso });
  }

  endpointState.warmedUp = true;

  const signalByItemCode = new Map();

  if (!warmingUp && normalizedConfig.enabled) {
    for (const record of Object.values(endpointState.items)) {
      if (!isInsideEventWindow(record, cutoffMs)) continue;

      const isSignalCandidate = Boolean(record.signalFirstSeenAt);
      const hasCurrentRealtime = Number(record.latestRealtimeRank || 0) > 0 && record.lastRealtimeSeenAt === nowIso;
      const hasCurrentDaily = Number(record.latestDailyRank || 0) > 0 && record.lastDailySeenAt === nowIso;

      if (isSignalCandidate && hasCurrentDaily && Number(record.realtimeHits || 0) > 0) {
        signalByItemCode.set(record.itemCode, makeSignal("daily_confirmed", record));
      } else if (isSignalCandidate && hasCurrentRealtime && Number(record.realtimeHits || 0) >= normalizedConfig.minRealtimeHits) {
        signalByItemCode.set(record.itemCode, makeSignal("watching", record));
      } else if (newRealtimeKeys.has(record.itemCode)) {
        signalByItemCode.set(record.itemCode, makeSignal("realtime_new", record));
      }
    }
  }

  const signals = [...signalByItemCode.values()]
    .sort((a, b) => b.priority - a.priority || (a.realtimeRank || 9999) - (b.realtimeRank || 9999))
    .slice(0, normalizedConfig.limit);

  return {
    warmingUp,
    config: normalizedConfig,
    signals,
    nextState,
  };
}
