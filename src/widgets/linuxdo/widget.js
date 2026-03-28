import linuxdoProxyHandler from "./proxy";

const widget = {
  proxyHandler: linuxdoProxyHandler,
  allowedEndpoints: /^[A-Za-z0-9_-]+$/,
};

export default widget;
