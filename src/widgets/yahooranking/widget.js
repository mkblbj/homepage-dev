import yahooRankingProxyHandler from "./proxy";

const widget = {
  proxyHandler: yahooRankingProxyHandler,
  allowedEndpoints: /^(ranking|up)(_\d+)?$/,
};

export default widget;
