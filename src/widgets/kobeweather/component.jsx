import Container from "components/services/widget/container";
import { useTranslation } from "next-i18next";
import {
  WiCloud,
  WiDayCloudy,
  WiDaySunny,
  WiFog,
  WiNightClear,
  WiNightCloudy,
  WiRain,
  WiSnow,
  WiThunderstorm,
} from "react-icons/wi";
import { Area, AreaChart, LabelList, YAxis } from "recharts";

import useWidgetAPI from "utils/proxy/use-widget-api";

// Map WeatherAPI codes to react-icons
const getWeatherIcon = (code, isDay, size = "w-8 h-8") => {
  if ([1000].includes(code)) return isDay ? <WiDaySunny className={`${size} text-yellow-400`} /> : <WiNightClear className={`${size} text-yellow-200`} />;
  if ([1003, 1006, 1009].includes(code)) return isDay ? <WiDayCloudy className={`${size} text-gray-300`} /> : <WiNightCloudy className={`${size} text-gray-300`} />;
  if ([1030, 1135, 1147].includes(code)) return <WiFog className={`${size} text-gray-400`} />;
  if ([1063, 1150, 1153, 1180, 1183, 1186, 1189, 1192, 1195, 1240, 1243, 1246].includes(code)) return <WiRain className={`${size} text-blue-400`} />;
  if ([1066, 1114, 1117, 1210, 1213, 1216, 1219, 1222, 1225, 1255, 1258].includes(code)) return <WiSnow className={`${size} text-white`} />;
  if ([1087, 1273, 1276, 1279, 1282].includes(code)) return <WiThunderstorm className={`${size} text-yellow-400`} />;
  return <WiCloud className={`${size} text-gray-300`} />;
};

const formatHour = (timeEpoch) => {
  const date = new Date(timeEpoch * 1000);
  return `${date.getHours()}:00`;
};

export default function Component({ service }) {
  const { t } = useTranslation();
  const { widget } = service;
  if (widget.fields) delete widget.fields;
  if (!widget.days) widget.days = 3;
  if (!widget.aqi) widget.aqi = "no";
  if (!widget.alerts) widget.alerts = "no";
  if (!widget.lang) widget.lang = "ja";

  const { data, error } = useWidgetAPI(widget, "forecast");

  if (error) return <Container service={service} error={error} />;
  if (!data) return <Container service={service}>{t("kobeweather.loading")}</Container>;

  const { current, forecast, location } = data;
  const forecastDays = forecast?.forecastday || [];
  const hourly = forecastDays[0]?.hour || [];
  const isDay = current.is_day === 1;
  
  const currentHour = new Date().getHours();
  
  // Combine all available hours (up to 72h with 3 days forecast)
  let allHours = [...hourly];
  if (forecastDays[1]) {
    allHours = [...allHours, ...forecastDays[1].hour];
  }
  if (forecastDays[2]) {
    allHours = [...allHours, ...forecastDays[2].hour];
  }
  
  // Get 48 hours of data starting from current hour
  const chartHours = allHours.slice(currentHour, currentHour + 48).map(h => ({
    time: formatHour(h.time_epoch),
    temp: Math.round(h.temp_c),
    wind: h.wind_kph.toFixed(1),
    isDay: h.is_day === 1,
    conditionCode: h.condition?.code || 1000, // Weather condition code for icon
  }));

  const rainChance = forecastDays[0]?.day?.daily_chance_of_rain || 0;
  const snowChance = forecastDays[0]?.day?.daily_chance_of_snow || 0;

  const formatDay = (dateStr, idx) => {
    if (idx === 0) return t("kobeweather.today");
    const date = new Date(dateStr);
    return t("common.date", { value: date, formatParams: { value: { month: "long", day: "2-digit" } } });
  };

  // Calculate chart width: 60px per hour item
  const itemWidth = 60;
  const chartWidth = chartHours.length * itemWidth;

  return (
    <Container service={service}>
      {/* flex-1 + min-w-0 + max-w-full: completely isolate the widget from expanding parent */}
      <div className="relative overflow-hidden text-white flex-1 min-w-0 max-w-full">
        <div className="relative z-10 flex flex-col min-w-0 max-w-full">
        {/* Header Section - Compact horizontal layout */}
        <div className="flex items-center justify-between px-4 py-2">
          {/* Left: Location & Temperature */}
          <div className="flex items-center gap-3">
            {getWeatherIcon(current.condition.code, isDay, "w-12 h-12")}
            <div>
              <h2 className="text-2xl font-bold tracking-wide">{service.name || location.name} {Math.round(current.temp_c)}°C</h2>
              <div className="text-sm text-gray-300">{current.condition.text}</div>
            </div>
          </div>
          {/* Right: Details */}
          <div className="text-right text-xs text-gray-300 font-mono leading-relaxed">
            <div>{t("kobeweather.feelsLike")} {Math.round(current.feelslike_c)}°C · {t("kobeweather.humidity")} {current.humidity}%</div>
            <div>{t("kobeweather.pressure")} {current.pressure_mb} mb · {t("kobeweather.cloud")} {current.cloud}%</div>
            <div>{t("kobeweather.rainChance")} {rainChance}% · {t("kobeweather.snowChance")} {snowChance}%</div>
          </div>
        </div>

        {/* Daily Forecast Cards */}
        <div className="grid grid-cols-3 gap-2 px-3 pb-3">
          {forecastDays.slice(0, 3).map((day, idx) => (
            <div key={idx} className="bg-white/5 border border-white/10 rounded-md p-2.5 flex flex-row items-center justify-between backdrop-blur-sm">
              <div className="flex flex-col text-left">
                <span className="text-xs font-semibold text-gray-200 mb-1">{formatDay(day.date, idx)}</span>
                <div className="text-[11px] text-gray-300 leading-tight">
                  <div>{t("kobeweather.min")}: {Math.round(day.day.mintemp_c)}°C</div>
                  <div>{t("kobeweather.max")}: {Math.round(day.day.maxtemp_c)}°C</div>
                </div>
              </div>
              <div className="ml-1">{getWeatherIcon(day.day.condition.code, true, "w-10 h-10")}</div>
            </div>
          ))}
        </div>

        {/* Hourly Chart Section - Scrollable */}
        {/* max-w-full is critical to prevent chart from expanding parent */}
        <div className="bg-black/10 mx-0 py-3 overflow-hidden max-w-full backdrop-blur-sm">
          <div 
            className="overflow-x-auto scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent"
            style={{ scrollbarWidth: 'thin' }}
          >
            <div style={{ width: `${chartWidth}px`, paddingLeft: '12px', paddingRight: '12px' }}>
              {/* Chart with temperature labels */}
              <div className="h-24 w-full relative">
                <AreaChart 
                  width={chartWidth} 
                  height={96} 
                  data={chartHours} 
                  margin={{ top: 25, right: 20, left: 20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#93c5fd" stopOpacity={0.4}/>
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.1}/>
                    </linearGradient>
                  </defs>
                  <YAxis domain={['dataMin - 2', 'dataMax + 2']} hide />
                  <Area 
                    type="monotone" 
                    dataKey="temp" 
                    stroke="#fbbf24" 
                    strokeWidth={2.5} 
                    fill="url(#tempGradient)"
                    dot={{ fill: '#fbbf24', strokeWidth: 0, r: 0 }}
                  >
                    <LabelList 
                      dataKey="temp" 
                      position="top" 
                      formatter={(v) => `${v}°C`}
                      style={{ fill: '#fff', fontSize: '10px', fontWeight: 500 }}
                    />
                  </Area>
                </AreaChart>
                {/* Dotted vertical line at start */}
                <div className="absolute left-[32px] top-6 bottom-0 border-l border-dashed border-sky-300/50"></div>
              </div>

              {/* Weather icons row - shows condition for each hour */}
              <div className="flex mt-1">
                {chartHours.map((h, i) => (
                  <div key={i} className="flex flex-col items-center" style={{ width: `${itemWidth}px` }}>
                    {getWeatherIcon(h.conditionCode, h.isDay, "w-5 h-5")}
                  </div>
                ))}
              </div>

              {/* Wind speed and time row */}
              <div className="flex mt-1 text-[10px] text-white/90 font-mono">
                {chartHours.map((h, i) => (
                  <div key={i} className="flex flex-col items-center leading-tight" style={{ width: `${itemWidth}px` }}>
                    <span>{h.wind} km/h</span>
                    <span className="text-white/70">{i === 0 ? t("kobeweather.now") : h.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </Container>
  );
}
