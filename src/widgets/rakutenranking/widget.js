import rakutenRankingProxyHandler from "./proxy";

const widget = {
  proxyHandler: rakutenRankingProxyHandler,
  allowedEndpoints: /^(daily|realtime|signals)(_\d+)?$/,
};

export default widget;
