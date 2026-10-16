import { stampClock } from "./tv-time.mjs";

// WMO weather codes as Open-Meteo reports them.
export function weatherLabelJa(code) {
  if (!Number.isFinite(code)) return "—";
  if (code === 0) return "晴れ";
  if (code === 1 || code === 2) return "晴れ時々くもり";
  if (code === 3) return "くもり";
  if (code === 45 || code === 48) return "霧";
  if (code >= 51 && code <= 57) return "霧雨";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "雨";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "雪";
  if (code >= 95 && code <= 99) return "雷雨";
  return "—";
}

const round = (value) => (Number.isFinite(value) ? Math.round(value) : null);

function dayAt(daily, i) {
  if (!daily?.time?.[i]) return null;
  return {
    text: weatherLabelJa(daily.weathercode?.[i]),
    max: round(daily.temperature_2m_max?.[i]),
    min: round(daily.temperature_2m_min?.[i]),
    pop: round(daily.precipitation_probability_max?.[i]),
  };
}

export function buildWeatherView(payload) {
  if (!payload || payload.error || !payload.daily) return null;
  const today = dayAt(payload.daily, 0);
  if (!today) return null;
  const tomorrow = dayAt(payload.daily, 1);
  return {
    label: payload.label || "",
    today,
    tomorrow: tomorrow ? { text: tomorrow.text, max: tomorrow.max, min: tomorrow.min } : null,
  };
}

const temps = (day) => `${day.max ?? "—"}° / ${day.min ?? "—"}°`;

function weatherSegment(weather) {
  if (!weather) return null;
  const parts = [
    `今日 ${weather.today.text} ${temps(weather.today)}${weather.today.pop == null ? "" : ` ・ 降水 ${weather.today.pop}%`}`,
  ];
  if (weather.tomorrow) parts.push(`明日 ${weather.tomorrow.text} ${temps(weather.tomorrow)}`);
  return { key: "weather", tag: `天気 ${weather.label}`.trim(), parts };
}

function aiSegment(ai) {
  const summary = ai && !ai.error ? ai.summary : null;
  const headline = summary?.headline?.ja;
  if (!headline) return null;
  const time = stampClock(ai.generatedAtJST);
  const actions = (summary.actions || []).map((action) => action?.title?.ja).filter(Boolean);
  return {
    key: "ai",
    tag: time ? `AI 経営サマリー ${time}` : "AI 経営サマリー",
    parts: [headline, ...actions.map((title) => `◆ ${title}`)],
  };
}

export function buildTickerSegments({ weather, ai }) {
  return [weatherSegment(weather), aiSegment(ai)].filter(Boolean);
}
