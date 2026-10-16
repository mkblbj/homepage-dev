import assert from "node:assert/strict";
import test from "node:test";

import { buildTickerSegments, buildWeatherView, buildWeatherViewFromWeatherApi, weatherLabelJa } from "./ticker-model.mjs";

const payload = {
  label: "神戸",
  daily: {
    time: ["2026-10-16", "2026-10-17"],
    weathercode: [0, 3],
    temperature_2m_max: [23.4, 20.6],
    temperature_2m_min: [15.6, 14.9],
    precipitation_probability_max: [10, 30],
  },
};

test("weather codes read as everyday Japanese", () => {
  assert.equal(weatherLabelJa(0), "晴れ");
  assert.equal(weatherLabelJa(2), "晴れ時々くもり");
  assert.equal(weatherLabelJa(3), "くもり");
  assert.equal(weatherLabelJa(63), "雨");
  assert.equal(weatherLabelJa(81), "雨");
  assert.equal(weatherLabelJa(73), "雪");
  assert.equal(weatherLabelJa(95), "雷雨");
  assert.equal(weatherLabelJa(undefined), "—");
});

test("today and tomorrow come out rounded", () => {
  const w = buildWeatherView(payload);
  assert.equal(w.label, "神戸");
  assert.deepEqual(w.today, { text: "晴れ", max: 23, min: 16, pop: 10 });
  assert.deepEqual(w.tomorrow, { text: "くもり", max: 21, min: 15 });
  assert.equal(buildWeatherView({ error: "x" }), null);
  assert.equal(buildWeatherView(null), null);
});

test("the homepage's own WeatherAPI forecast (kobeweather) reads the same way", () => {
  const weatherApi = {
    location: { name: "Kobe" },
    forecast: {
      forecastday: [
        { date: "2026-10-16", day: { maxtemp_c: 23.4, mintemp_c: 15.6, daily_chance_of_rain: 10, condition: { text: "晴れ" } } },
        { date: "2026-10-17", day: { maxtemp_c: 20.6, mintemp_c: 14.9, daily_chance_of_rain: 60, condition: { text: "所により曇り" } } },
      ],
    },
  };
  const w = buildWeatherViewFromWeatherApi(weatherApi);
  assert.equal(w.label, "神戸");
  assert.deepEqual(w.today, { text: "晴れ", max: 23, min: 16, pop: 10 });
  assert.deepEqual(w.tomorrow, { text: "所により曇り", max: 21, min: 15 });
  assert.equal(buildWeatherViewFromWeatherApi({ error: "x" }), null);
  assert.equal(buildWeatherViewFromWeatherApi({ forecast: { forecastday: [] } }), null);
});

const ai = {
  state: "ready",
  generatedAtJST: "2026-10-16 13:00 JST",
  summary: {
    headline: { ja: "出荷は昨日並み", zh: "x" },
    actions: [{ title: { ja: "3911 の問い合わせに返信", zh: "x" } }],
  },
};

test("the ticker carries weather then the AI summary headline and actions", () => {
  const segs = buildTickerSegments({ weather: buildWeatherView(payload), ai });
  assert.deepEqual(
    segs.map((s) => [s.key, s.tag]),
    [
      ["weather", "天気 神戸"],
      ["ai", "AI 経営サマリー 13:00"],
    ],
  );
  assert.deepEqual(segs[0].parts, ["今日 晴れ 23° / 16° ・ 降水 10%", "明日 くもり 21° / 15°"]);
  assert.deepEqual(segs[1].parts, ["出荷は昨日並み", "◆ 3911 の問い合わせに返信"]);
});

test("a missing segment is skipped; nothing to say is an empty ticker", () => {
  assert.deepEqual(
    buildTickerSegments({ weather: null, ai }).map((s) => s.key),
    ["ai"],
  );
  assert.deepEqual(buildTickerSegments({ weather: null, ai: { summary: null } }), []);
  assert.deepEqual(buildTickerSegments({ weather: null, ai: { error: "x" } }), []);
});
