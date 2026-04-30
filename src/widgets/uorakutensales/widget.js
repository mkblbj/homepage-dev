import uoRakutenSalesProxyHandler from "./proxy";

const widget = {
  proxyHandler: uoRakutenSalesProxyHandler,
  allowedEndpoints: /^(snapshot|query)$/,
};

export default widget;
