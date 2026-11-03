import { buildVacuumModel, isValidDevice, resolveAction } from "./vacuum-model.mjs";

import getServiceWidget from "utils/config/service-helpers";
import createLogger from "utils/logger";
import { httpProxy } from "utils/proxy/http";
import isSameOriginRequest from "utils/proxy/same-origin";

const logger = createLogger("uovacuumProxyHandler");

const METHOD_BY_ENDPOINT = { state: "GET", action: "POST" };
// a Home Assistant that accepts the connection but never answers must not hang the card
const HA_TIMEOUT = 8000;

function callHomeAssistant(url, params) {
  let timer;
  const timedOut = new Promise((resolve) => {
    timer = setTimeout(() => resolve([504, null, null]), HA_TIMEOUT);
  });
  return Promise.race([httpProxy(url, params), timedOut]).finally(() => clearTimeout(timer));
}

function parseBody(body) {
  if (typeof body !== "string") return body && typeof body === "object" ? body : null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function parseStates(data) {
  try {
    const parsed = JSON.parse(Buffer.isBuffer(data) ? data.toString() : String(data));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// url, key and device live only in services.yaml; the browser never sees them
async function readConfig({ group, service, index }) {
  if (!group || !service) return null;
  const widget = await getServiceWidget(group, service, index);
  const url = typeof widget?.url === "string" ? widget.url.trim().replace(/\/+$/, "") : "";
  if (!url || !widget?.key || !isValidDevice(widget?.device)) return null;
  return { url, key: widget.key, device: widget.device };
}

export default async function uoVacuumProxyHandler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  const { endpoint } = req.query;

  const method = METHOD_BY_ENDPOINT[endpoint];
  if (!Object.hasOwn(METHOD_BY_ENDPOINT, endpoint)) {
    return res.status(404).json({ error: "endpoint_not_found" });
  }
  if (req.method !== method) {
    return res.status(405).json({ error: "method_not_allowed" });
  }
  if (endpoint === "action" && !isSameOriginRequest(req)) {
    return res.status(403).json({ error: "cross_site_request" });
  }

  const config = await readConfig(req.query);
  if (!config) {
    return res.status(503).json({ error: "configuration" });
  }
  const authorization = { Authorization: `Bearer ${config.key}` };

  if (endpoint === "state") {
    const [status, , data] = await callHomeAssistant(`${config.url}/api/states`, {
      method: "GET",
      headers: authorization,
    });
    const states = status === 200 ? parseStates(data) : null;
    if (!states) {
      logger.error("Home Assistant states could not be read: HTTP %s", status);
      return res.status(502).json({ error: "home_assistant_unavailable" });
    }
    return res.status(200).json(buildVacuumModel(states, config.device));
  }

  const body = parseBody(req.body);
  const command = body ? resolveAction(body.action, body.value, config.device) : null;
  if (!command) {
    return res.status(400).json({ error: "unsupported_action" });
  }

  const [status] = await callHomeAssistant(`${config.url}/api/services/${command.domain}/${command.service}`, {
    method: "POST",
    headers: { ...authorization, "Content-Type": "application/json" },
    body: JSON.stringify(command.data),
  });
  if (status !== 200) {
    logger.error("Home Assistant refused %s: HTTP %s", body.action, status);
    return res.status(502).json({ error: "home_assistant_rejected" });
  }
  return res.status(200).json({ ok: true });
}
