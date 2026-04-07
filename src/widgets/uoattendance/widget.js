import genericProxyHandler from "utils/proxy/handlers/generic";

const widget = {
  api: "{endpoint}",
  proxyHandler: genericProxyHandler,
  mappings: {
    actual: {
      endpoint: "{url}",
    },
    schedule: {
      endpoint: "{scheduleUrl}",
      optionalParams: ["day", "department_category"],
    },
  },
};

export default widget;

