import uoAISummaryProxyHandler from "./proxy";

const widget = {
  proxyHandler: uoAISummaryProxyHandler,
  allowedEndpoints: /^(summary|refresh)$/,
};

export default widget;
