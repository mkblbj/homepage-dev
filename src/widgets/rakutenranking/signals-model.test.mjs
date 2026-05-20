import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SIGNAL_CONFIG,
  buildRankingSignals,
  normalizeSignalConfig,
} from "./signals-model.mjs";

const now = "2026-05-20T05:00:00.000Z";

function item(itemCode, rank, name = itemCode) {
  return {
    rank,
    itemCode,
    itemName: name,
    itemPrice: 1200,
    itemUrl: `https://item.rakuten.co.jp/${itemCode}`,
    imageUrl: `https://img.example.com/${itemCode}.jpg`,
    shopName: "demo-shop",
  };
}

test("normalizeSignalConfig disables signals unless explicitly enabled", () => {
  assert.deepEqual(normalizeSignalConfig(undefined), {
    ...DEFAULT_SIGNAL_CONFIG,
    enabled: false,
  });

  assert.deepEqual(
    normalizeSignalConfig({
      enabled: true,
      realtimeTop: "80",
      dailyTop: "70",
      historyDays: "14",
      minRealtimeHits: "3",
      limit: "5",
    }),
    {
      enabled: true,
      realtimeTop: 80,
      dailyTop: 70,
      historyDays: 14,
      minRealtimeHits: 3,
      limit: 5,
    },
  );
});

test("first run seeds baseline and returns no noisy signals", () => {
  const result = buildRankingSignals({
    now,
    endpointKey: "genre:564500",
    config: normalizeSignalConfig({ enabled: true }),
    previousState: { version: 1, endpoints: {} },
    realtimeItems: [item("shop:a", 1), item("shop:b", 49), item("shop:c", 51)],
    dailyItems: [item("shop:d", 1)],
  });

  assert.equal(result.warmingUp, true);
  assert.deepEqual(result.signals, []);
  assert.equal(Object.keys(result.nextState.endpoints["genre:564500"].items).length, 3);
  assert.equal(result.nextState.endpoints["genre:564500"].items["shop:a"].realtimeHits, 1);
  assert.equal(result.nextState.endpoints["genre:564500"].items["shop:d"].dailyHits, 1);
});

test("new real-time top entry becomes realtime_new after baseline exists", () => {
  const previousState = buildRankingSignals({
    now: "2026-05-20T04:00:00.000Z",
    endpointKey: "default",
    config: normalizeSignalConfig({ enabled: true }),
    previousState: { version: 1, endpoints: {} },
    realtimeItems: [item("shop:old", 8)],
    dailyItems: [],
  }).nextState;

  const result = buildRankingSignals({
    now,
    endpointKey: "default",
    config: normalizeSignalConfig({ enabled: true }),
    previousState,
    realtimeItems: [item("shop:old", 9), item("shop:new", 37, "New Product")],
    dailyItems: [],
  });

  assert.equal(result.warmingUp, false);
  assert.equal(result.signals.length, 1);
  assert.equal(result.signals[0].status, "realtime_new");
  assert.equal(result.signals[0].itemCode, "shop:new");
  assert.equal(result.signals[0].realtimeRank, 37);
  assert.equal(result.signals[0].label, "REALTIME NEW");
});

test("repeated real-time entry becomes watching when it reaches minRealtimeHits", () => {
  const config = normalizeSignalConfig({ enabled: true, minRealtimeHits: 2 });
  const baseline = buildRankingSignals({
    now: "2026-05-20T03:00:00.000Z",
    endpointKey: "default",
    config,
    previousState: { version: 1, endpoints: {} },
    realtimeItems: [item("shop:seed", 10)],
    dailyItems: [],
  }).nextState;

  const firstSeen = buildRankingSignals({
    now: "2026-05-20T04:00:00.000Z",
    endpointKey: "default",
    config,
    previousState: baseline,
    realtimeItems: [item("shop:seed", 10), item("shop:watch", 20)],
    dailyItems: [],
  }).nextState;

  const result = buildRankingSignals({
    now,
    endpointKey: "default",
    config,
    previousState: firstSeen,
    realtimeItems: [item("shop:watch", 18)],
    dailyItems: [],
  });

  assert.equal(result.signals.length, 1);
  assert.equal(result.signals[0].status, "watching");
  assert.equal(result.signals[0].realtimeHits, 2);
  assert.equal(result.signals[0].bestRealtimeRank, 18);
});

test("daily top entry confirms a product previously found in real-time", () => {
  const config = normalizeSignalConfig({ enabled: true });
  const baseline = buildRankingSignals({
    now: "2026-05-20T03:00:00.000Z",
    endpointKey: "default",
    config,
    previousState: { version: 1, endpoints: {} },
    realtimeItems: [item("shop:seed", 10)],
    dailyItems: [],
  }).nextState;

  const realtimeState = buildRankingSignals({
    now: "2026-05-20T04:00:00.000Z",
    endpointKey: "default",
    config,
    previousState: baseline,
    realtimeItems: [item("shop:hit", 25)],
    dailyItems: [],
  }).nextState;

  const result = buildRankingSignals({
    now,
    endpointKey: "default",
    config,
    previousState: realtimeState,
    realtimeItems: [item("shop:hit", 22)],
    dailyItems: [item("shop:hit", 46)],
  });

  assert.equal(result.signals.length, 1);
  assert.equal(result.signals[0].status, "daily_confirmed");
  assert.equal(result.signals[0].dailyRank, 46);
  assert.equal(result.signals[0].priority, 3);
});

test("old stable products stop producing signals after the event window", () => {
  const config = normalizeSignalConfig({ enabled: true, historyDays: 7 });
  const oldDate = "2026-05-01T00:00:00.000Z";
  const previousState = {
    version: 1,
    endpoints: {
      default: {
        warmedUp: true,
        items: {
          "shop:old": {
            itemCode: "shop:old",
            itemName: "Old Stable Product",
            firstSeenAt: oldDate,
            lastSeenAt: oldDate,
            realtimeHits: 12,
            dailyHits: 5,
            bestRealtimeRank: 5,
            bestDailyRank: 8,
          },
        },
      },
    },
  };

  const result = buildRankingSignals({
    now,
    endpointKey: "default",
    config,
    previousState,
    realtimeItems: [item("shop:old", 6)],
    dailyItems: [item("shop:old", 9)],
  });

  assert.deepEqual(result.signals, []);
  assert.equal(result.nextState.endpoints.default.items["shop:old"].realtimeHits, 13);
});
