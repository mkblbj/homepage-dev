import { getSettings } from "utils/config/config";
import { cachedRequest } from "utils/proxy/http";

// The TV board's forecast. Location comes only from settings.yaml (tvboard.weather), never from
// the query string, so this route cannot be used to fetch arbitrary coordinates.
const DEFAULT_WEATHER = { label: "神戸", latitude: 34.6901, longitude: 135.1955 };

function weatherConfig() {
  const configured = getSettings()?.tvboard?.weather || {};
  const latitude = Number(configured.latitude ?? DEFAULT_WEATHER.latitude);
  const longitude = Number(configured.longitude ?? DEFAULT_WEATHER.longitude);
  return {
    label: configured.label ?? DEFAULT_WEATHER.label,
    latitude: Number.isFinite(latitude) ? latitude : DEFAULT_WEATHER.latitude,
    longitude: Number.isFinite(longitude) ? longitude : DEFAULT_WEATHER.longitude,
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const { label, latitude, longitude } = weatherConfig();
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    daily: "weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "Asia/Tokyo",
    forecast_days: "2",
  });

  try {
    const data = await cachedRequest(`https://api.open-meteo.com/v1/forecast?${params}`, 15);
    if (!data?.daily) {
      return res.status(502).json({ error: "weather" });
    }
    return res.status(200).json({ label, daily: data.daily });
  } catch {
    return res.status(502).json({ error: "weather" });
  }
}
