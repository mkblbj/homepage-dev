import uoRakutenSalesProxyHandler from "./proxy";

const widget = {
  proxyHandler: uoRakutenSalesProxyHandler,
  allowedEndpoints: /^(sales|history|campaigns|logos|ranking|peaks|monthly)$/,
};

export default widget;
