import genericProxyHandler from "utils/proxy/handlers/generic";

// `mappings` doubles as the endpoint allowlist: src/pages/api/services/proxy.js rejects any
// endpoint that is not a key here with a 403 and forces the method to GET, so the forbidden
// POST /api/admin/performance/refresh is structurally unreachable from the dashboard.
const widget = {
  api: "{url}/{endpoint}",
  proxyHandler: genericProxyHandler,

  mappings: {
    performance: {
      endpoint: "api/performance",
    },
  },
};

export default widget;
