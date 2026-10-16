import { useEffect, useRef, useState } from "react";
import useSWR from "swr";

import { classifyFreshness } from "./freshness.mjs";
import { jstNow } from "./tv-time.mjs";

import { formatProxyUrl } from "utils/proxy/api-helpers";

const SWR_OPTIONS = { revalidateOnFocus: false, errorRetryInterval: 30e3 };

// One polled source. A failed poll (network error, or the proxy's `{ error }` body) keeps the
// last good payload on screen; `lastOkAt` is when a poll last succeeded, even if nothing changed.
export function useSource(url, pollMs) {
  const [lastOkAt, setLastOkAt] = useState(null);
  const lastGood = useRef(undefined);
  const { data, error } = useSWR(url, {
    ...SWR_OPTIONS,
    refreshInterval: pollMs,
    onSuccess: (payload) => {
      if (payload && !payload.error) {
        lastGood.current = payload;
        setLastOkAt(Date.now());
      }
    },
  });
  const failed = Boolean(error) || Boolean(data?.error);
  return {
    configured: Boolean(url),
    data: failed ? lastGood.current : data,
    failed,
    lastOkAt,
  };
}

// A source behind /api/services/proxy, addressed by the cleaned widget the page was given.
export function useProxy(widget, endpoint, query, pollMs) {
  const url = widget ? formatProxyUrl(widget, endpoint || undefined, query || undefined) : null;
  return useSource(url, pollMs);
}

// "loading" until the first answer; then the freshness rule decides.
export function sourceState(source, stampMs, rule, nowMs) {
  if (!source.configured) return "unconfigured";
  if (source.data === undefined && !source.failed) return "loading";
  if (source.data === undefined) return "unavailable";
  return classifyFreshness({ stampMs, nowMs, ...rule });
}

export function useClock(intervalMs = 5000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// Reload once a day after 04:00 JST so a TV that never closes the page starts each day clean.
export function useDailyReload(clock, hour = 4) {
  const loadedYmd = useRef(null);
  useEffect(() => {
    const now = jstNow(clock);
    if (!loadedYmd.current) {
      loadedYmd.current = now.ymd;
      return;
    }
    if (now.ymd !== loadedYmd.current && now.hour >= hour) {
      window.location.reload();
    }
  }, [clock, hour]);
}
