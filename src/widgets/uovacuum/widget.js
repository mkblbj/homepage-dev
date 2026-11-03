import uoVacuumProxyHandler from "./proxy";

// state is read with GET; action (POST, same origin only) runs one allowlisted command
const widget = {
  proxyHandler: uoVacuumProxyHandler,
  allowedEndpoints: /^(state|action)$/,
};

export default widget;
