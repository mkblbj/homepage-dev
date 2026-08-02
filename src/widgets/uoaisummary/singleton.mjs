import { buildAnalysisInput } from "./analysis-input.mjs";
import { discoverSummaryConfiguration } from "./config.mjs";
import { requestSummaryOnce } from "./responses-client.mjs";
import { collectBusinessSources } from "./source-client.mjs";
import { createSummaryService } from "./summary-service.mjs";
import { createSummaryStore } from "./summary-store.mjs";

import { CONF_DIR } from "utils/config/config";
import { servicesFromConfig } from "utils/config/service-helpers";
import createLogger from "utils/logger";

const logger = createLogger("uoAISummary");
const SINGLETON = Symbol.for("homepage.uoaisummary.service");
const CONFIGURED_WIDGET = Symbol("homepage.uoaisummary.configured-widget");

function toJST(timestamp) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second} JST`;
}

function hasSummaryWidget(groups) {
  return (groups || []).some(
    (group) =>
      (group.services || []).some((service) => (service.widget || service.widgets?.[0])?.type === "uoaisummary") ||
      hasSummaryWidget(group.groups),
  );
}

async function loadConfiguration() {
  const groups = await servicesFromConfig();
  try {
    return discoverSummaryConfiguration(groups);
  } catch (error) {
    if (hasSummaryWidget(groups) && error && (typeof error === "object" || typeof error === "function")) {
      error[CONFIGURED_WIDGET] = true;
    }
    throw error;
  }
}

function buildService() {
  return createSummaryService({
    loadConfiguration,
    collectSources: (sources, options) => collectBusinessSources(sources, { ...options, fetcher: globalThis.fetch }),
    buildAnalysisInput,
    requestSummaryOnce: (options) => requestSummaryOnce({ ...options, fetcher: globalThis.fetch }),
    store: createSummaryStore({ configDir: CONF_DIR }),
    clock: { now: Date.now, toJST },
    timers: { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout },
    logger,
  });
}

export async function getSummaryService() {
  const root = globalThis;
  if (!root[SINGLETON]) {
    const service = buildService();
    root[SINGLETON] = {
      service,
      ready: Promise.resolve(service.initialize()).then(() => service),
    };
  }
  return root[SINGLETON].ready;
}

export async function startAISummaryScheduler() {
  try {
    await getSummaryService();
  } catch (error) {
    if (error?.code === "configuration" && !error[CONFIGURED_WIDGET]) {
      resetSummaryService();
      logger.info("AI summary scheduler is not configured");
      return;
    }
    if (error?.code === "configuration") resetSummaryService();
    logger.error("AI summary scheduler startup failed: %s", error?.code || "unexpected");
  }
}

function resetSummaryService() {
  globalThis[SINGLETON]?.service?.stop?.();
  delete globalThis[SINGLETON];
}

export function __resetSummaryServiceForTests() {
  resetSummaryService();
}
