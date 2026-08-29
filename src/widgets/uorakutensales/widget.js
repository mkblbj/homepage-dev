import uoRakutenSalesProxyHandler from "./proxy";

const widget = {
  proxyHandler: uoRakutenSalesProxyHandler,
  allowedEndpoints: /^(sales|history|campaigns|logos|ranking|peaks)$/,
};

export default widget;
