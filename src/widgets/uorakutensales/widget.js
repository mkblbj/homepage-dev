import uoRakutenSalesProxyHandler from "./proxy";

const widget = {
  proxyHandler: uoRakutenSalesProxyHandler,
  allowedEndpoints: /^(snapshot|query|campaigns-current)$/,
};

export default widget;
