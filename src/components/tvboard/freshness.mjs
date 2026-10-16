// How long each source may go without fresh data before the board warns (delay) or stops
// showing its numbers (hide). poll is how often the board asks. All values in milliseconds.
export const FRESHNESS = {
  shipping: { poll: 30e3, delay: 5 * 60e3, hide: 60 * 60e3 },
  rakuten: { poll: 60e3, delay: 30 * 60e3, hide: 2 * 3600e3 },
  monthly: { poll: 5 * 60e3, delay: 30 * 60e3, hide: 2 * 3600e3 },
  attention: { poll: 60e3, hide: 60 * 60e3 },
  attendance: { poll: 5 * 60e3, delay: 15 * 60e3, hide: 60 * 60e3 },
  tomorrowShift: { poll: 15 * 60e3, delay: 15 * 60e3, hide: 60 * 60e3 },
  logos: { poll: 86400e3 },
  weather: { poll: 30 * 60e3, delay: 3 * 3600e3, hide: 6 * 3600e3 },
  aiSummary: { poll: 5 * 60e3 },
};

export function classifyFreshness({ stampMs, nowMs, delay = Infinity, hide = Infinity }) {
  if (stampMs == null || !Number.isFinite(stampMs)) return "unavailable";
  const age = Math.max(0, nowMs - stampMs);
  if (age > hide) return "unavailable";
  if (age > delay) return "delayed";
  return "ok";
}
