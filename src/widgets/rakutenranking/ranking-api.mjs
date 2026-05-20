const REALTIME_PAGE_CACHE_TTL_MS = 5 * 60 * 1000;
const DAILY_PAGE_CACHE_TTL_MS = 60 * 60 * 1000;
const DEFAULT_PAGE_CACHE_TTL_MS = 15 * 60 * 1000;
const STALE_ON_RATE_LIMIT_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_MIN_INTERVAL_MS = 1100;
const DEFAULT_GLOBAL_MIN_INTERVAL_MS = 250;

export function getRakutenPageCacheTtl(period) {
  if (period === "realtime") return REALTIME_PAGE_CACHE_TTL_MS;
  if (period === "daily") return DAILY_PAGE_CACHE_TTL_MS;
  return DEFAULT_PAGE_CACHE_TTL_MS;
}

function defaultDelay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function createRakutenPageFetcher({
  request,
  minIntervalMs = DEFAULT_MIN_INTERVAL_MS,
  globalMinIntervalMs = DEFAULT_GLOBAL_MIN_INTERVAL_MS,
  now = () => Date.now(),
  delay = defaultDelay,
} = {}) {
  if (typeof request !== "function") {
    throw new Error("createRakutenPageFetcher requires a request function");
  }

  const cache = new Map();
  const inflight = new Map();
  const queues = new Map();
  const globalQueueState = {
    queue: Promise.resolve(),
    lastStartedAt: null,
  };

  const ensureQueue = (bucketKey) => {
    if (!queues.has(bucketKey)) {
      queues.set(bucketKey, {
        queue: Promise.resolve(),
        lastStartedAt: null,
      });
    }
    return queues.get(bucketKey);
  };

  const enqueueGlobal = (bucketState, task) => {
    const run = async () => {
      let current = now();
      if (globalQueueState.lastStartedAt !== null) {
        const globalWaitMs = Math.max(0, globalQueueState.lastStartedAt + globalMinIntervalMs - current);
        if (globalWaitMs > 0) await delay(globalWaitMs);
      }

      current = now();
      if (bucketState.lastStartedAt !== null) {
        const bucketWaitMs = Math.max(0, bucketState.lastStartedAt + minIntervalMs - current);
        if (bucketWaitMs > 0) await delay(bucketWaitMs);
      }

      const startedAt = now();
      globalQueueState.lastStartedAt = startedAt;
      bucketState.lastStartedAt = startedAt;
      return task();
    };

    const next = globalQueueState.queue.then(run, run);
    globalQueueState.queue = next.catch(() => {});
    return next;
  };

  const enqueue = (bucketKey, task) => {
    const queueState = ensureQueue(bucketKey);
    const run = () => enqueueGlobal(queueState, task);

    const next = queueState.queue.then(run, run);
    queueState.queue = next.catch(() => {});
    return next;
  };

  const fetchPage = async (pageUrl, { period = "daily", bucketKey = "default", cacheKey } = {}) => {
    const key = cacheKey || pageUrl.toString();
    const current = now();
    const cached = cache.get(key);

    if (cached && cached.expiresAt > current) {
      return cached.result;
    }

    const running = inflight.get(key);
    if (running) return running;

    const promise = enqueue(bucketKey, () => request(pageUrl))
      .then((result) => {
        const status = Number(result?.[0]);
        const completedAt = now();

        if (status === 200) {
          cache.set(key, {
            result,
            expiresAt: completedAt + getRakutenPageCacheTtl(period),
            staleUntil: completedAt + STALE_ON_RATE_LIMIT_TTL_MS,
          });
          return result;
        }

        if (status === 429 && cached?.result && cached.staleUntil > completedAt) {
          return cached.result;
        }

        return result;
      })
      .finally(() => {
        inflight.delete(key);
      });

    inflight.set(key, promise);
    return promise;
  };

  return {
    fetchPage,
    clearCache() {
      cache.clear();
      inflight.clear();
      queues.clear();
      globalQueueState.lastStartedAt = null;
      globalQueueState.queue = Promise.resolve();
    },
  };
}
