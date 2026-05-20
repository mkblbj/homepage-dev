# Rakuten Ranking Signals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a prominent Rakuten "hot signal" area that detects products newly breaking into the real-time top 50 and confirms them when they also enter the daily top 50.

**Architecture:** Keep the existing `rakutenranking` widget and add a `signals` endpoint plus a small local state file. The proxy fetches real-time and daily rankings for the active genre, updates a bounded history keyed by `itemCode`, and returns only meaningful signal events; the component renders those events as an attention area above the normal ranking controls.

**Tech Stack:** Next.js Pages Router API proxy, existing Homepage widget registry, React, SWR, Tailwind utility classes, `node:test`, Vitest/jsdom.

---

## File Structure

- Create `src/widgets/rakutenranking/signals-model.mjs`: pure signal configuration normalization and event detection from current ranking snapshots plus previous state.
- Create `src/widgets/rakutenranking/signals-model.test.mjs`: node tests for first-run warmup, real-time new entries, repeated real-time entries, daily confirmation, stale event suppression, and config normalization.
- Create `src/widgets/rakutenranking/signals-store.mjs`: small JSON persistence helper using `CONF_DIR`, with safe read fallback and atomic-ish write through a temporary file.
- Create `src/widgets/rakutenranking/signals-store.test.mjs`: node tests for missing file fallback, read/write round trip, and invalid JSON fallback using a temporary directory override.
- Modify `src/widgets/rakutenranking/proxy.js`: factor current ranking fetch into reusable helpers, add `signals` endpoint support, fetch daily and real-time top ranges, call the model, and persist state.
- Modify `src/widgets/rakutenranking/widget.js`: allow `signals` endpoints with optional genre suffix.
- Modify `src/widgets/rakutenranking/component.jsx`: fetch `signals` in parallel with the active ranking endpoint and render a prominent signal area above the genre/period controls.
- Create `src/widgets/rakutenranking/component.test.jsx`: jsdom tests for rendering the prominent signal area and for hiding it when no signal exists.
- Modify `src/utils/config/service-helpers.js`: pass a sanitized `signal` object to the frontend for `rakutenranking`; never expose `applicationId` or `accessKey`.
- Modify local `config/services.yaml`: add the `signal` block under the existing `rakutenranking` widget.

## Signal Rules

- `signal.enabled` must be `true` before the component fetches `signals`.
- `realtimeTop` defaults to `50`; the proxy fetches enough pages to cover this rank range and only monitors items whose `rank <= realtimeTop`.
- `dailyTop` defaults to `50`; daily confirmation requires current daily rank within this range.
- `historyDays` defaults to `7`; products first seen earlier than this window do not produce active signals, even if they remain stable.
- `minRealtimeHits` defaults to `2`; repeated real-time visibility becomes `watching`.
- `limit` defaults to `3`; the component shows only the highest-priority returned events.
- The first run for a genre seeds baseline state and returns an empty `signals` list with `warmingUp: true`, so the current top 50 does not flood the UI as "new".
- Event priority is `daily_confirmed` first, then `watching`, then `realtime_new`.

## Tasks

### Task 1: Red Tests For Signal Model

**Files:**
- Create: `src/widgets/rakutenranking/signals-model.test.mjs`
- Later create: `src/widgets/rakutenranking/signals-model.mjs`

- [ ] **Step 1: Write the failing model tests**

Create `src/widgets/rakutenranking/signals-model.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the test and confirm the red failure**

Run:

```bash
node --test src/widgets/rakutenranking/signals-model.test.mjs
```

Expected: FAIL with `Cannot find module './signals-model.mjs'`.

- [ ] **Step 3: Commit the red tests**

```bash
git add src/widgets/rakutenranking/signals-model.test.mjs
git commit -m "test: add rakuten ranking signal model coverage"
```

### Task 2: Signal Model

**Files:**
- Create: `src/widgets/rakutenranking/signals-model.mjs`
- Test: `src/widgets/rakutenranking/signals-model.test.mjs`

- [ ] **Step 1: Implement the pure signal model**

Create `src/widgets/rakutenranking/signals-model.mjs`:

```js
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

  for (const { item, rank } of topItems(realtimeItems, normalizedConfig.realtimeTop)) {
    const { record, isNew } = updateRealtimeRecord({ endpointState, item, rank, nowIso });
    if (isNew && !warmingUp && isInsideEventWindow(record, cutoffMs)) {
      newRealtimeKeys.add(record.itemCode);
    }
  }

  for (const { item, rank } of topItems(dailyItems, normalizedConfig.dailyTop)) {
    updateDailyRecord({ endpointState, item, rank, nowIso });
  }

  endpointState.warmedUp = true;

  const signalByItemCode = new Map();

  if (!warmingUp && normalizedConfig.enabled) {
    for (const record of Object.values(endpointState.items)) {
      if (!isInsideEventWindow(record, cutoffMs)) continue;

      const hasCurrentRealtime = Number(record.latestRealtimeRank || 0) > 0 && record.lastRealtimeSeenAt === nowIso;
      const hasCurrentDaily = Number(record.latestDailyRank || 0) > 0 && record.lastDailySeenAt === nowIso;

      if (hasCurrentDaily && Number(record.realtimeHits || 0) > 0) {
        signalByItemCode.set(record.itemCode, makeSignal("daily_confirmed", record));
      } else if (hasCurrentRealtime && Number(record.realtimeHits || 0) >= normalizedConfig.minRealtimeHits) {
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
```

- [ ] **Step 2: Run the model tests**

Run:

```bash
node --test src/widgets/rakutenranking/signals-model.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Commit the model**

```bash
git add src/widgets/rakutenranking/signals-model.mjs src/widgets/rakutenranking/signals-model.test.mjs
git commit -m "feat: add rakuten ranking signal model"
```

### Task 3: Signal Store

**Files:**
- Create: `src/widgets/rakutenranking/signals-store.mjs`
- Create: `src/widgets/rakutenranking/signals-store.test.mjs`

- [ ] **Step 1: Write the failing store tests**

Create `src/widgets/rakutenranking/signals-store.test.mjs`:

```js
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { getSignalStorePath, readSignalState, writeSignalState } from "./signals-store.mjs";

test("getSignalStorePath uses configured directory", () => {
  assert.equal(
    getSignalStorePath("/tmp/homepage-config"),
    "/tmp/homepage-config/rakuten-ranking-signals.json",
  );
});

test("readSignalState falls back to empty state when file is missing or invalid", () => {
  const dir = mkdtempSync(join(tmpdir(), "rakuten-signals-"));
  try {
    assert.deepEqual(readSignalState(dir), { version: 1, endpoints: {} });

    writeFileSync(getSignalStorePath(dir), "{not-json", "utf8");
    assert.deepEqual(readSignalState(dir), { version: 1, endpoints: {} });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("writeSignalState persists readable JSON", () => {
  const dir = mkdtempSync(join(tmpdir(), "rakuten-signals-"));
  try {
    const state = {
      version: 1,
      endpoints: {
        default: {
          warmedUp: true,
          items: {
            "shop:item": {
              itemCode: "shop:item",
              firstSeenAt: "2026-05-20T00:00:00.000Z",
            },
          },
        },
      },
    };

    writeSignalState(state, dir);
    assert.deepEqual(readSignalState(dir), state);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the test and confirm the red failure**

Run:

```bash
node --test src/widgets/rakutenranking/signals-store.test.mjs
```

Expected: FAIL with `Cannot find module './signals-store.mjs'`.

- [ ] **Step 3: Implement the store helper**

Create `src/widgets/rakutenranking/signals-store.mjs`:

```js
import { existsSync, renameSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { CONF_DIR } from "../../utils/config/config.js";

export function getSignalStorePath(configDir = CONF_DIR) {
  return join(configDir, "rakuten-ranking-signals.json");
}

export function emptySignalState() {
  return {
    version: 1,
    endpoints: {},
  };
}

export function readSignalState(configDir = CONF_DIR) {
  const filePath = getSignalStorePath(configDir);
  if (!existsSync(filePath)) return emptySignalState();

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    if (!parsed || typeof parsed !== "object" || !parsed.endpoints || typeof parsed.endpoints !== "object") {
      return emptySignalState();
    }
    return {
      version: 1,
      endpoints: parsed.endpoints,
    };
  } catch {
    return emptySignalState();
  }
}

export function writeSignalState(state, configDir = CONF_DIR) {
  const filePath = getSignalStorePath(configDir);
  const tempPath = `${filePath}.tmp`;
  writeFileSync(tempPath, JSON.stringify(state || emptySignalState(), null, 2), "utf8");
  renameSync(tempPath, filePath);
}
```

- [ ] **Step 4: Run the store tests**

Run:

```bash
node --test src/widgets/rakutenranking/signals-store.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit the store**

```bash
git add src/widgets/rakutenranking/signals-store.mjs src/widgets/rakutenranking/signals-store.test.mjs
git commit -m "feat: persist rakuten ranking signal state"
```

### Task 4: Proxy Signals Endpoint

**Files:**
- Modify: `src/widgets/rakutenranking/proxy.js`
- Modify: `src/widgets/rakutenranking/widget.js`
- Test: `src/widgets/rakutenranking/signals-model.test.mjs`
- Test: `src/widgets/rakutenranking/signals-store.test.mjs`

- [ ] **Step 1: Update endpoint validation in widget metadata**

Modify `src/widgets/rakutenranking/widget.js`:

```js
import rakutenRankingProxyHandler from "./proxy";

const widget = {
  proxyHandler: rakutenRankingProxyHandler,
  allowedEndpoints: /^(daily|realtime|signals)(_\d+)?$/,
};

export default widget;
```

- [ ] **Step 2: Add imports to the proxy**

At the top of `src/widgets/rakutenranking/proxy.js`, add:

```js
import { buildRankingSignals, normalizeSignalConfig } from "./signals-model.mjs";
import { readSignalState, writeSignalState } from "./signals-store.mjs";
```

- [ ] **Step 3: Replace endpoint parsing**

Replace the current endpoint match block with:

```js
  const match = endpoint?.match(/^(daily|realtime|signals)(?:_(\d+))?$/);
  if (!match) {
    return res.status(400).json({ error: `Invalid endpoint: ${endpoint}` });
  }
  const [, period, genreId] = match;
```

- [ ] **Step 4: Extract page fetching inside the handler**

Inside the `try` block, replace the local page loop with a reusable helper that accepts a period and limit:

```js
    const delay = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

    const fetchRanking = async ({ requestedPeriod, requestedLimit }) => {
      const rankingParams = new URLSearchParams(params);
      if (requestedPeriod === "realtime") rankingParams.set("period", "realtime");
      if (genreId) rankingParams.set("genreId", genreId);

      const PAGE_SIZE = 30;
      const totalPages = Math.min(Math.ceil(requestedLimit / PAGE_SIZE), 34);
      const results = [];

      const fetchPage = async (page) => {
        const pageParams = new URLSearchParams(rankingParams);
        pageParams.set("page", String(page));
        const pageUrl = new URL(`${API_BASE}?${pageParams.toString()}`);
        const [status, , data] = await httpProxy(pageUrl, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; Homepage/1.0)",
            Accept: "application/json",
          },
        });
        if (status !== 200) {
          logger.error("Error fetching Rakuten ranking (endpoint=%s, page=%d): status %d", endpoint, page, status);
          return null;
        }
        return JSON.parse(data.toString());
      };

      for (let i = 0; i < totalPages; i += 1) {
        if (i > 0) await delay(300);
        results.push(await fetchPage(i + 1));
      }

      const firstResult = results.find((r) => r !== null);
      if (!firstResult) {
        throw new Error("Rakuten API returned no valid responses");
      }

      const allItems = results
        .filter(Boolean)
        .flatMap((json) => json.Items || json.items || [])
        .sort((a, b) => a.rank - b.rank);

      const items = allItems.slice(0, requestedLimit).map((item) => ({
        rank: item.rank,
        itemCode: item.itemCode,
        itemName: item.itemName,
        catchcopy: item.catchcopy,
        itemPrice: item.itemPrice,
        itemUrl: item.itemUrl,
        imageUrl: item.mediumImageUrls?.[0]?.replace(/\?_ex=\d+x\d+/, "") || "",
        reviewAverage: item.reviewAverage,
        reviewCount: item.reviewCount,
        shopName: item.shopName,
        availability: item.availability,
      }));

      return {
        title: firstResult.title || "",
        lastBuildDate: firstResult.lastBuildDate || "",
        items,
      };
    };
```

- [ ] **Step 5: Add signal response path before the normal ranking response**

Still inside the `try` block, before returning the existing daily/realtime response, add:

```js
    if (period === "signals") {
      const signalConfig = normalizeSignalConfig(widget.signal);
      if (!signalConfig.enabled) {
        return res.status(200).json({
          enabled: false,
          warmingUp: false,
          config: signalConfig,
          signals: [],
        });
      }

      const [realtimeRanking, dailyRanking] = await Promise.all([
        fetchRanking({ requestedPeriod: "realtime", requestedLimit: signalConfig.realtimeTop }),
        fetchRanking({ requestedPeriod: "daily", requestedLimit: signalConfig.dailyTop }),
      ]);

      const endpointKey = genreId ? `genre:${genreId}` : "default";
      const previousState = readSignalState();
      const result = buildRankingSignals({
        now: new Date().toISOString(),
        endpointKey,
        config: signalConfig,
        previousState,
        realtimeItems: realtimeRanking.items,
        dailyItems: dailyRanking.items,
      });

      writeSignalState(result.nextState);

      return res.status(200).json({
        enabled: true,
        warmingUp: result.warmingUp,
        config: result.config,
        lastBuildDate: realtimeRanking.lastBuildDate,
        dailyLastBuildDate: dailyRanking.lastBuildDate,
        signals: result.signals,
      });
    }
```

- [ ] **Step 6: Replace the existing daily/realtime page loop response**

After the `signals` block, return the normal ranking:

```js
    const ranking = await fetchRanking({
      requestedPeriod: period,
      requestedLimit: widget.limit || 10,
    });

    return res.status(200).json(ranking);
```

- [ ] **Step 7: Preserve current error shape**

Keep the existing `catch` block:

```js
  } catch (e) {
    logger.error("Error processing Rakuten ranking: %s", e.message);
    return res.status(500).json({ error: `Failed to fetch ranking: ${e.message}` });
  }
```

- [ ] **Step 8: Run targeted tests**

Run:

```bash
node --test src/widgets/rakutenranking/signals-model.test.mjs src/widgets/rakutenranking/signals-store.test.mjs
```

Expected: PASS.

- [ ] **Step 9: Commit proxy endpoint changes**

```bash
git add src/widgets/rakutenranking/proxy.js src/widgets/rakutenranking/widget.js
git commit -m "feat: add rakuten ranking signals endpoint"
```

### Task 5: Service Config Sanitization

**Files:**
- Modify: `src/utils/config/service-helpers.js`

- [ ] **Step 1: Add `signal` to the widget option destructuring**

In the large `widgetData` destructuring near the existing `defaultGenre` and `genres` fields, add:

```js
          // rakutenranking
          defaultGenre,
          genres,
          signal,
```

- [ ] **Step 2: Pass sanitized signal settings for `rakutenranking`**

Inside the existing `if (type === "rakutenranking")` block, change it to:

```js
        if (type === "rakutenranking") {
          if (genres) widget.genres = genres;
          if (defaultGenre !== undefined) widget.defaultGenre = defaultGenre;
          if (refreshInterval) widget.refreshInterval = refreshInterval;
          if (signal && typeof signal === "object") {
            widget.signal = {
              enabled: signal.enabled === true,
              realtimeTop: Number.parseInt(signal.realtimeTop, 10) || 50,
              dailyTop: Number.parseInt(signal.dailyTop, 10) || 50,
              historyDays: Number.parseInt(signal.historyDays, 10) || 7,
              minRealtimeHits: Number.parseInt(signal.minRealtimeHits, 10) || 2,
              limit: Number.parseInt(signal.limit, 10) || 3,
            };
          }
        }
```

- [ ] **Step 3: Verify credentials remain server-only**

Run:

```bash
rg -n "applicationId|accessKey" src/utils/config/service-helpers.js
```

Expected: no new forwarding of `applicationId` or `accessKey` to the cleaned frontend widget.

- [ ] **Step 4: Commit sanitization**

```bash
git add src/utils/config/service-helpers.js
git commit -m "feat: expose sanitized rakuten signal config"
```

### Task 6: Red Tests For Prominent Signal UI

**Files:**
- Create: `src/widgets/rakutenranking/component.test.jsx`
- Modify later: `src/widgets/rakutenranking/component.jsx`

- [ ] **Step 1: Write component tests**

Create `src/widgets/rakutenranking/component.test.jsx`:

```jsx
// @vitest-environment jsdom

import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "test-utils/render-with-providers";

const { useSWR } = vi.hoisted(() => ({ useSWR: vi.fn() }));
vi.mock("swr", () => ({ default: useSWR }));

import Component from "./component";

function service() {
  return {
    widget: {
      type: "rakutenranking",
      service_group: "楽天ランキング",
      service_name: "楽天ランキング",
      signal: {
        enabled: true,
        realtimeTop: 50,
        dailyTop: 50,
        historyDays: 7,
        minRealtimeHits: 2,
        limit: 3,
      },
    },
  };
}

describe("widgets/rakutenranking/component signals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a prominent signal area above normal ranking content", () => {
    useSWR.mockImplementation((url) => {
      if (String(url).includes("endpoint=signals")) {
        return {
          data: {
            enabled: true,
            warmingUp: false,
            config: { realtimeTop: 50, dailyTop: 50 },
            signals: [
              {
                status: "daily_confirmed",
                label: "DAILY CONFIRMED",
                itemCode: "shop:hit",
                itemName: "Confirmed Hit Product",
                itemUrl: "https://item.rakuten.co.jp/shop/hit",
                imageUrl: "https://img.example.com/hit.jpg",
                itemPrice: 2980,
                shopName: "hit-shop",
                realtimeRank: 12,
                dailyRank: 44,
                realtimeHits: 2,
              },
            ],
          },
          error: undefined,
          mutate: vi.fn(),
        };
      }

      return {
        data: {
          lastBuildDate: "Wed, 20 May 2026 14:11:00 +0900",
          items: [
            {
              rank: 1,
              itemName: "Normal Ranking Item",
              itemUrl: "https://item.rakuten.co.jp/shop/normal",
              itemPrice: 1000,
              reviewAverage: 4.5,
              reviewCount: 10,
              shopName: "normal-shop",
            },
          ],
        },
        error: undefined,
        mutate: vi.fn(),
      };
    });

    const { container } = renderWithProviders(<Component service={service()} />, {
      settings: { hideErrors: false },
    });

    expect(container.textContent).toContain("急浮上");
    expect(container.textContent).toContain("1件");
    expect(screen.getByText("Confirmed Hit Product")).toBeInTheDocument();
    expect(container.textContent).toContain("日榜確認");
    expect(container.textContent).toContain("Normal Ranking Item");
  });

  it("does not reserve signal space when there are no signals after warmup", () => {
    useSWR.mockImplementation((url) => {
      if (String(url).includes("endpoint=signals")) {
        return {
          data: {
            enabled: true,
            warmingUp: false,
            config: { realtimeTop: 50, dailyTop: 50 },
            signals: [],
          },
          error: undefined,
          mutate: vi.fn(),
        };
      }

      return {
        data: {
          items: [],
        },
        error: undefined,
        mutate: vi.fn(),
      };
    });

    const { container } = renderWithProviders(<Component service={service()} />, {
      settings: { hideErrors: false },
    });

    expect(container.textContent).not.toContain("急浮上");
  });
});
```

- [ ] **Step 2: Run the component tests and confirm red failure**

Run:

```bash
npx vitest run src/widgets/rakutenranking/component.test.jsx
```

Expected: FAIL because the component does not fetch `/signals` or render the signal area yet.

- [ ] **Step 3: Commit red UI tests**

```bash
git add src/widgets/rakutenranking/component.test.jsx
git commit -m "test: cover rakuten ranking signal entry"
```

### Task 7: Prominent Signal UI

**Files:**
- Modify: `src/widgets/rakutenranking/component.jsx`
- Test: `src/widgets/rakutenranking/component.test.jsx`

- [ ] **Step 1: Add signal formatting helpers near the existing helpers**

In `src/widgets/rakutenranking/component.jsx`, add:

```jsx
function formatSignalPrice(price) {
  if (!price) return "";
  return `¥${Number(price).toLocaleString("ja-JP")}`;
}

function signalLabel(signal) {
  if (signal.status === "daily_confirmed") return "日榜確認";
  if (signal.status === "watching") return "連続上榜";
  return "实时突入";
}

function signalTone(signal) {
  if (signal.status === "daily_confirmed") return "border-amber-400/70 bg-amber-100/80 text-amber-900 dark:border-amber-300/50 dark:bg-amber-500/20 dark:text-amber-100";
  if (signal.status === "watching") return "border-sky-400/60 bg-sky-100/70 text-sky-900 dark:border-sky-300/40 dark:bg-sky-500/20 dark:text-sky-100";
  return "border-rose-400/60 bg-rose-100/75 text-rose-900 dark:border-rose-300/40 dark:bg-rose-500/20 dark:text-rose-100";
}
```

- [ ] **Step 2: Add `SignalPanel` before `StarRating`**

Add:

```jsx
function SignalPanel({ data }) {
  const signals = data?.signals || [];
  if (!data?.enabled || data?.warmingUp || signals.length === 0) return null;

  return (
    <div className="mx-2 mt-1.5 mb-1.5 overflow-hidden rounded-lg border border-rose-400/50 bg-gradient-to-r from-rose-50 via-amber-50 to-white shadow-sm dark:border-rose-300/30 dark:from-rose-950/40 dark:via-amber-950/30 dark:to-theme-900/40">
      <div className="flex items-center justify-between gap-2 border-b border-rose-200/70 px-2.5 py-1.5 dark:border-rose-800/40">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="inline-flex h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_0_3px_rgba(244,63,94,0.16)]" />
          <span className="text-xs font-bold text-rose-700 dark:text-rose-200">急浮上</span>
          <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {signals.length}件
          </span>
        </div>
        <span className="shrink-0 text-[10px] text-theme-600 dark:text-theme-300">
          实时前{data.config?.realtimeTop || 50}
        </span>
      </div>
      <div className="flex flex-col divide-y divide-rose-100/80 dark:divide-rose-900/30">
        {signals.map((signal) => (
          <a
            key={`${signal.status}-${signal.itemCode}`}
            href={signal.itemUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-2.5 py-2 transition-colors hover:bg-white/60 dark:hover:bg-white/5"
          >
            {signal.imageUrl && (
              <img
                src={signal.imageUrl}
                alt=""
                className="h-10 w-10 shrink-0 rounded-md bg-white object-contain"
                loading="lazy"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="line-clamp-1 text-xs font-semibold text-theme-800 dark:text-theme-100">
                {signal.itemName}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-theme-600 dark:text-theme-300">
                {signal.realtimeRank && <span>RT #{signal.realtimeRank}</span>}
                {signal.dailyRank && <span>DAY #{signal.dailyRank}</span>}
                {signal.itemPrice && <span>{formatSignalPrice(signal.itemPrice)}</span>}
              </div>
            </div>
            <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${signalTone(signal)}`}>
              {signalLabel(signal)}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Fetch signals in parallel with the current ranking**

Inside `Component`, after the `url` constant, add:

```jsx
  const signalEndpoint = activeGenre ? `signals_${activeGenre}` : "signals";
  const signalUrl = widget.signal?.enabled ? formatProxyUrl(widget, signalEndpoint) : null;
```

After the existing `useSWR(url, ...)` call, add:

```jsx
  const { data: signalData } = useSWR(signalUrl, {
    refreshInterval,
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 60000,
  });
```

- [ ] **Step 4: Render the signal area above genre controls**

Inside the returned `<div className="flex flex-col w-full min-w-0">`, insert this as the first child:

```jsx
        <SignalPanel data={signalData} />
```

- [ ] **Step 5: Run the component tests**

Run:

```bash
npx vitest run src/widgets/rakutenranking/component.test.jsx
```

Expected: PASS.

- [ ] **Step 6: Commit UI changes**

```bash
git add src/widgets/rakutenranking/component.jsx src/widgets/rakutenranking/component.test.jsx
git commit -m "feat: show rakuten ranking signal entry"
```

### Task 8: Local Service Configuration

**Files:**
- Modify: `config/services.yaml`

- [ ] **Step 1: Add signal config under the existing Rakuten ranking widget**

Update the existing `rakutenranking` widget config:

```yaml
          signal:
            enabled: true
            realtimeTop: 50
            dailyTop: 50
            historyDays: 7
            minRealtimeHits: 2
            limit: 3
```

The block belongs under the same widget as `limit`, `refreshInterval`, `defaultGenre`, and `genres`.

- [ ] **Step 2: Commit local config change only if this repository tracks it**

Run:

```bash
git status --short config/services.yaml
```

If the file is tracked and the diff contains only this signal block, commit:

```bash
git add config/services.yaml
git commit -m "config: enable rakuten ranking signals"
```

If the file is ignored or contains unrelated user edits, leave it uncommitted and report that the local config was updated.

### Task 9: Verification

**Files:**
- Test all touched files.

- [ ] **Step 1: Run node tests**

Run:

```bash
node --test src/widgets/rakutenranking/signals-model.test.mjs src/widgets/rakutenranking/signals-store.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run component test**

Run:

```bash
npx vitest run src/widgets/rakutenranking/component.test.jsx
```

Expected: PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
pnpm lint
```

Expected: PASS or pre-existing unrelated lint failures. If failures appear in touched files, fix them before continuing.

- [ ] **Step 4: Run a production build**

Run:

```bash
pnpm build
```

Expected: PASS. If the build fails because of environment-specific external services, capture the exact error and verify that no touched file is the cause.

- [ ] **Step 5: Start the dev server**

Run:

```bash
pnpm dev
```

Expected: Next.js dev server starts on `http://localhost:39856`.

- [ ] **Step 6: Manual browser check**

Open the homepage and verify:

- The normal Rakuten ranking still loads for `デイリー` and `リアルタイム`.
- The first signal request may return warmup with no visible area.
- After warmup, new real-time top 50 entries appear in the prominent `急浮上` area.
- Products confirmed in daily top 50 show `日榜確認`.
- The UI remains compact and does not overlap text at the widget width currently used on the homepage.

### Task 10: Final Review

**Files:**
- Review all touched files.

- [ ] **Step 1: Inspect git diff**

Run:

```bash
git diff -- src/widgets/rakutenranking src/utils/config/service-helpers.js config/services.yaml
```

Expected: only signal model, store, proxy endpoint, widget metadata, component signal UI, sanitized config forwarding, and local signal config changes.

- [ ] **Step 2: Confirm no credentials were added to frontend cleaned config**

Run:

```bash
rg -n "applicationId|accessKey" src/utils/config/service-helpers.js src/widgets/rakutenranking/component.jsx
```

Expected: `applicationId` and `accessKey` are not referenced in `component.jsx` and are not forwarded by `service-helpers.js`.

- [ ] **Step 3: Report results**

Report:

- New files created.
- Existing files modified.
- Test commands and outcomes.
- Whether the signal state file was created under `config/rakuten-ranking-signals.json`.
- Whether the first run is in warmup mode.
