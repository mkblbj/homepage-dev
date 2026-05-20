import assert from "node:assert/strict";
import test from "node:test";

import { createRakutenPageFetcher, getRakutenPageCacheTtl } from "./ranking-api.mjs";

test("getRakutenPageCacheTtl gives realtime shorter cache than daily", () => {
  assert.equal(getRakutenPageCacheTtl("realtime"), 5 * 60 * 1000);
  assert.equal(getRakutenPageCacheTtl("daily"), 60 * 60 * 1000);
});

test("createRakutenPageFetcher reuses fresh cached page responses", async () => {
  let calls = 0;
  const fetcher = createRakutenPageFetcher({
    request: async () => {
      calls += 1;
      return [200, {}, Buffer.from(`{"call":${calls}}`)];
    },
    now: () => 1_000,
    delay: async () => {},
    minIntervalMs: 0,
  });

  const url = new URL("https://example.test/ranking?page=1&period=realtime");
  const first = await fetcher.fetchPage(url, { period: "realtime" });
  const second = await fetcher.fetchPage(url, { period: "realtime" });

  assert.equal(calls, 1);
  assert.equal(first[2].toString(), "{\"call\":1}");
  assert.equal(second[2].toString(), "{\"call\":1}");
});

test("createRakutenPageFetcher returns stale cached page when Rakuten rate limits", async () => {
  let now = 1_000;
  let calls = 0;
  const fetcher = createRakutenPageFetcher({
    request: async () => {
      calls += 1;
      if (calls === 1) return [200, {}, Buffer.from("{\"ok\":true}")];
      return [429, {}, Buffer.from("{\"error\":\"too many requests\"}")];
    },
    now: () => now,
    delay: async () => {},
    minIntervalMs: 0,
  });

  const url = new URL("https://example.test/ranking?page=1&period=daily");
  const first = await fetcher.fetchPage(url, { period: "daily" });
  now += getRakutenPageCacheTtl("daily") + 1;
  const second = await fetcher.fetchPage(url, { period: "daily" });

  assert.equal(calls, 2);
  assert.equal(first[0], 200);
  assert.equal(second[0], 200);
  assert.equal(second[2].toString(), "{\"ok\":true}");
});

test("createRakutenPageFetcher spaces uncached page requests through a queue", async () => {
  let now = 0;
  const starts = [];
  const fetcher = createRakutenPageFetcher({
    request: async () => {
      starts.push(now);
      return [200, {}, Buffer.from("{}")];
    },
    now: () => now,
    delay: async (ms) => {
      now += ms;
    },
    minIntervalMs: 1_000,
  });

  await Promise.all([
    fetcher.fetchPage(new URL("https://example.test/ranking?page=1"), { period: "daily" }),
    fetcher.fetchPage(new URL("https://example.test/ranking?page=2"), { period: "daily" }),
    fetcher.fetchPage(new URL("https://example.test/ranking?page=3"), { period: "daily" }),
  ]);

  assert.deepEqual(starts, [0, 1_000, 2_000]);
});

test("createRakutenPageFetcher uses independent queues for different buckets", async () => {
  let now = 0;
  const starts = [];
  const fetcher = createRakutenPageFetcher({
    request: async (url) => {
      starts.push({ at: now, url: url.toString() });
      return [200, {}, Buffer.from("{}")];
    },
    now: () => now,
    delay: async (ms) => {
      now += ms;
    },
    minIntervalMs: 1_000,
    globalMinIntervalMs: 0,
  });

  await Promise.all([
    fetcher.fetchPage(new URL("https://example.test/ranking?page=1&applicationId=a"), {
      period: "daily",
      bucketKey: "app-a",
    }),
    fetcher.fetchPage(new URL("https://example.test/ranking?page=2&applicationId=b"), {
      period: "daily",
      bucketKey: "app-b",
    }),
  ]);

  assert.deepEqual(starts.map((start) => start.at), [0, 0]);
});

test("createRakutenPageFetcher smooths requests globally across buckets", async () => {
  let now = 0;
  const starts = [];
  const fetcher = createRakutenPageFetcher({
    request: async () => {
      starts.push(now);
      return [200, {}, Buffer.from("{}")];
    },
    now: () => now,
    delay: async (ms) => {
      now += ms;
    },
    minIntervalMs: 1_000,
    globalMinIntervalMs: 250,
  });

  await Promise.all([
    fetcher.fetchPage(new URL("https://example.test/ranking?page=1&applicationId=a"), {
      period: "daily",
      bucketKey: "app-a",
    }),
    fetcher.fetchPage(new URL("https://example.test/ranking?page=2&applicationId=b"), {
      period: "daily",
      bucketKey: "app-b",
    }),
    fetcher.fetchPage(new URL("https://example.test/ranking?page=3&applicationId=c"), {
      period: "daily",
      bucketKey: "app-c",
    }),
  ]);

  assert.deepEqual(starts, [0, 250, 500]);
});

test("createRakutenPageFetcher can share cache across credential-specific URLs", async () => {
  let calls = 0;
  const fetcher = createRakutenPageFetcher({
    request: async () => {
      calls += 1;
      return [200, {}, Buffer.from(`{"call":${calls}}`)];
    },
    now: () => 1_000,
    delay: async () => {},
    minIntervalMs: 0,
  });

  const cacheKey = "https://example.test/ranking?page=1&period=daily";
  const first = await fetcher.fetchPage(new URL(`${cacheKey}&applicationId=a`), {
    period: "daily",
    bucketKey: "app-a",
    cacheKey,
  });
  const second = await fetcher.fetchPage(new URL(`${cacheKey}&applicationId=b`), {
    period: "daily",
    bucketKey: "app-b",
    cacheKey,
  });

  assert.equal(calls, 1);
  assert.equal(first[2].toString(), "{\"call\":1}");
  assert.equal(second[2].toString(), "{\"call\":1}");
});
