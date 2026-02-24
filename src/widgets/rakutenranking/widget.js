import rakutenRankingProxyHandler from "./proxy";

const widget = {
  proxyHandler: rakutenRankingProxyHandler,
  allowedEndpoints: /^(daily|realtime)(_\d+)?$/,
};

export default widget;
