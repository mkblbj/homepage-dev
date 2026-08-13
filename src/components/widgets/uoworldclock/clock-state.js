const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export function parseHourRange(text) {
  const match = String(text || "").match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (!match) throw new Error(`Invalid hour range: ${text}`);

  const [, startHour, startMinute, endHour, endMinute] = match;
  return {
    start: Number(startHour) * 60 + Number(startMinute),
    end: Number(endHour) * 60 + Number(endMinute),
  };
}

// 固定用 en-US 取 parts：这里要的是纯数值，与 widget 的展示 locale 无关。
// hourCycle 用 h23 而非 hour12:false，避免依赖引擎对 hour12 的映射（h24 会把午夜给成 24）。
export function getZonedTimeInfo(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type) => parts.find((part) => part.type === type).value;

  return {
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
    // 不读本地化的 weekday 字符串（ja 下是「木」）；用当地年月日构造 UTC 零点再取星期
    weekday: new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00Z`).getUTCDay(),
  };
}

function inRange(minutes, range) {
  return minutes >= range.start && minutes < range.end;
}

export function resolveClockState(date, { timeZone, workHours, dayHours, workdays }) {
  const { minutes, weekday } = getZonedTimeInfo(date, timeZone);
  const days = Array.isArray(workdays) ? workdays : ALL_DAYS;

  if (days.includes(weekday) && inRange(minutes, parseHourRange(workHours))) return "working";
  if (inRange(minutes, parseHourRange(dayHours))) return "daytime";
  return "night";
}
