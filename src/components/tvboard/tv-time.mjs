// Every date and clock on the TV board is Tokyo time, whatever zone the TV's browser runs in.

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

const PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const pad2 = (n) => String(n).padStart(2, "0");

function partsOf(date) {
  const out = {};
  PARTS.formatToParts(date).forEach(({ type, value }) => {
    out[type] = value;
  });
  return out;
}

// "2026-10-16" → { year, month, day, weekday } read from the date itself, never from the clock.
function splitYmd(ymd) {
  const match = String(ymd ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return { year, month, day, weekday };
}

export function jstNow(date = new Date()) {
  const p = partsOf(date);
  const hour = Number(p.hour);
  const minute = Number(p.minute);
  const ymd = `${p.year}-${p.month}-${p.day}`;
  return { ymd, hour, minute, minutes: hour * 60 + minute, weekday: splitYmd(ymd).weekday };
}

export function formatMd(ymd) {
  const d = splitYmd(ymd);
  return d ? `${d.month}/${d.day}(${d.weekday})` : "";
}

export function formatLongDate(ymd) {
  const d = splitYmd(ymd);
  return d ? `${d.month}月${d.day}日(${d.weekday})` : "";
}

export function dayOf(ymd) {
  return splitYmd(ymd)?.day ?? null;
}

export function formatClock(date) {
  const p = partsOf(date);
  return `${p.hour}:${p.minute}`;
}

export function jstTimeFromIso(iso) {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : formatClock(new Date(ms));
}

// "2026-10-16 13:14:32" (出荷出力) and "2026-10-16 13:47 JST" (楽天) are both Tokyo wall-clock times.
export function parseJstStamp(text) {
  const match = String(text ?? "").match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const [, ymd, hour, minute, second = "00"] = match;
  const ms = Date.parse(`${ymd}T${pad2(hour)}:${minute}:${second}+09:00`);
  return Number.isNaN(ms) ? null : ms;
}

// "13:47" from either timestamp style; null when it cannot be read.
export function stampClock(text) {
  const ms = parseJstStamp(text);
  return ms == null ? null : formatClock(new Date(ms));
}
