import genericProxyHandler from "utils/proxy/handlers/generic";

const widget = {
  // WeatherAPI expects key as query param, so we embed it in the URL template
  // Added lang parameter for multilingual support
  api: "http://api.weatherapi.com/v1/{endpoint}?key={key}&q={q}&days={days}&aqi={aqi}&alerts={alerts}&lang={lang}",
  proxyHandler: genericProxyHandler,
  mappings: {
    forecast: {
      endpoint: "forecast.json",
    },
  },
};

export default widget;
