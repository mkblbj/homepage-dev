import { buildSalesProxyRequest } from "./proxy-config.mjs";

import getServiceWidget from "utils/config/service-helpers";
import createLogger from "utils/logger";
import { httpProxy } from "utils/proxy/http";

const logger = createLogger("uorakutensalesProxyHandler");

const EXPECTED_METHOD_BY_ENDPOINT = {
  sales: "GET",
  history: "GET",
  campaigns: "GET",
};

function parseResponseData(data) {
  if (Buffer.isBuffer(data)) {
    const text = data.toString();
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  return data;
}

function resolveToken(widget) {
  const configuredKey = String(widget?.key || "").trim();
  const envKey = process.env.HOMEPAGE_VAR_UO_EC_TOKEN || process.env.UO_EC_TOKEN || "";

  if (configuredKey && !configuredKey.startsWith("{{")) {
    return configuredKey;
  }

  return envKey;
}

export default async function uoRakutenSalesProxyHandler(req, res) {
  const { group, service, index, endpoint } = req.query;

  if (!group || !service) {
    logger.debug("Invalid or missing service '%s' or group '%s'", service, group);
    return res.status(400).json({ error: "Invalid proxy service type" });
  }

  const expectedMethod = EXPECTED_METHOD_BY_ENDPOINT[endpoint];
  if (!expectedMethod) {
    return res.status(400).json({ error: `Unsupported Rakuten sales endpoint: ${endpoint}` });
  }

  if (req.method !== expectedMethod) {
    return res.status(405).json({ error: `Unsupported method for ${endpoint}` });
  }

  const widget = await getServiceWidget(group, service, index);
  if (!widget) {
    logger.debug("Invalid or missing widget for service '%s' in group '%s'", service, group);
    return res.status(400).json({ error: "Invalid proxy service type" });
  }

  try {
    const { url, params } = buildSalesProxyRequest({
      endpoint,
      baseUrl: widget.url,
      token: resolveToken(widget),
    });
    const [status, contentType, data] = await httpProxy(url, params);
    const resultData = parseResponseData(data);

    if (status === 204 || status === 304) {
      return res.status(status).end();
    }

    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }

    if (status >= 400) {
      logger.debug("HTTP Error %d calling Rakuten sales endpoint %s", status, endpoint);
      return res.status(status).json({
        error: {
          message: "Rakuten sales service error",
          data: resultData,
        },
      });
    }

    return res.status(status).json(resultData ?? {});
  } catch (e) {
    logger.error("Error processing Rakuten sales proxy request: %s", e.message);
    return res.status(400).json({ error: e.message });
  }
}
