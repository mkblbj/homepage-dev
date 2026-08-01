import { AISummaryError } from "./errors.mjs";

export const SOURCE_WIDGET_TYPES = Object.freeze({
  shipping: "uoshippingdashboard",
  attention: "uoattention",
  sales: "uorakutensales",
  performance: "uoperformance",
});

const DEFAULTS = Object.freeze({
  generationInterval: 3600000,
  manualCooldown: 600000,
  requestTimeout: 180000,
  refreshInterval: 60000,
});

function configured(value) {
  const text = String(value ?? "").trim();
  return text && !/\{\{[^}]+\}\}/.test(text) ? text : null;
}

function positiveInteger(value, fallback, minimum) {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) {
    throw new AISummaryError("configuration", "Invalid AI timing configuration");
  }
  return number;
}

function responsesUrl(value) {
  const text = configured(value);
  try {
    const url = new URL(text);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/\/responses\/?$/.test(url.pathname)
    ) {
      throw new Error("invalid");
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new AISummaryError("configuration", "Invalid AI Responses endpoint");
  }
}

function collectServices(groups, parents = []) {
  return (groups || []).flatMap((group) => {
    const here = (group.services || []).map((entry) => ({
      groupName: group.name,
      parents,
      serviceName: entry.name,
      widget: entry.widget || entry.widgets?.[0] || null,
    }));
    return here.concat(collectServices(group.groups, parents.concat(group.name)));
  });
}

function resolveSource(entries, type) {
  const matches = entries.filter((entry) => entry.widget?.type === type);
  if (matches.length !== 1) {
    return {
      serviceName: null,
      groupName: null,
      widget: null,
      error: matches.length === 0 ? "missing" : "duplicate",
    };
  }
  const { serviceName, groupName, widget } = matches[0];
  return { serviceName, groupName, widget, error: null };
}

export function discoverSummaryConfiguration(groups) {
  const entries = collectServices(groups);
  const aiMatches = entries.filter((entry) => entry.widget?.type === "uoaisummary");
  if (aiMatches.length !== 1) {
    throw new AISummaryError("configuration", "Expected exactly one uoaisummary widget");
  }

  const raw = aiMatches[0].widget;
  const apiUrl = responsesUrl(raw.apiUrl);
  const apiKey = configured(raw.apiKey);
  const model = configured(raw.model);
  if (!apiUrl || !apiKey || model !== "gpt-5.6-luna" || raw.reasoningEffort !== "xhigh") {
    throw new AISummaryError("configuration", "Invalid AI Responses configuration");
  }

  return {
    ai: {
      apiUrl,
      apiKey: apiKey.trim(),
      model,
      reasoningEffort: "xhigh",
      generationInterval: positiveInteger(raw.generationInterval, DEFAULTS.generationInterval, 3600000),
      manualCooldown: positiveInteger(raw.manualCooldown, DEFAULTS.manualCooldown, 600000),
      requestTimeout: positiveInteger(raw.requestTimeout, DEFAULTS.requestTimeout, 1000),
      refreshInterval: positiveInteger(raw.refreshInterval, DEFAULTS.refreshInterval, 1000),
    },
    sources: Object.fromEntries(
      Object.entries(SOURCE_WIDGET_TYPES).map(([key, type]) => [key, resolveSource(entries, type)]),
    ),
  };
}
