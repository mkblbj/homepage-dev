import { readMercariRankings } from "./mercari-ranking.mjs";
import {
  buildSalesProxyRequest,
  deviceEvidenceQuery,
  marketEvidenceModel,
  normalizeSalesServiceUrl,
  shapeProxyResponse,
} from "./proxy-config.mjs";

import getServiceWidget from "utils/config/service-helpers";
import createLogger from "utils/logger";
import { httpProxy } from "utils/proxy/http";

const logger = createLogger("uorakutensalesProxyHandler");

const EXPECTED_METHOD_BY_ENDPOINT = {
  sales: "GET",
  history: "GET",
  campaigns: "GET",
  logos: "GET",
  ranking: "GET",
  peaks: "GET",
  monthly: "GET",
  devices: "GET",
  devicesMonthly: "GET",
  market: "GET",
  marketEvidence: "GET",
  devicesEvidence: "GET",
  performance: "GET",
  amazonSales: "GET",
  amazonHistory: "GET",
  amazonRanking: "GET",
  rankingMonthly: "GET",
  amazonRankingMonthly: "GET",
  amazonPeaks: "GET",
  aupaySales: "GET",
  temuSales: "GET",
  mercariSales: "GET",
  // worked out here from Mercari's orders: today's boards, and the month boards
  mercariRanking: "GET",
  mercariRankingMonthly: "GET",
};

const JSON_GET = { method: "GET", headers: { Accept: "application/json" } };

// one upstream GET for the Mercari boards; anything but JSON is a failed read
async function fetchJson(url) {
  const [status, , data] = await httpProxy(url, JSON_GET);
  const body = parseResponseData(data);
  if (status >= 400 || !body || typeof body !== "object") {
    const error = new Error(`Mercari read failed: HTTP ${status}`);
    error.status = status;
    throw error;
  }
  return body;
}

async function mercariRanking(endpoint, baseUrl, res) {
  try {
    const boards = await readMercariRankings(fetchJson, normalizeSalesServiceUrl(baseUrl));
    const periods =
      endpoint === "mercariRanking"
        ? { today: boards.today }
        : { currentMonth: boards.currentMonth, previousMonth: boards.previousMonth };
    return res.status(200).json({ ok: true, enabled: boards.enabled, ...periods });
  } catch (e) {
    logger.debug("Mercari boards unavailable: %s", e.message);
    // an older server without Mercari answers 404: no boards, not a fault
    return res.status(e.status === 404 ? 404 : 502).json({ error: { message: "Mercari boards unavailable" } });
  }
}

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

  // marketEvidence names its model in the proxy's query parameter
  const shape = {};
  if (endpoint === "marketEvidence") {
    shape.model = marketEvidenceModel(req.query.query);
    if (!shape.model) {
      return res.status(400).json({ error: "Missing market model" });
    }
  }

  // devicesEvidence forwards its scope (period, model, category, style, shop)
  let search = null;
  if (endpoint === "devicesEvidence") {
    search = deviceEvidenceQuery(req.query.query);
    if (!search) {
      return res.status(400).json({ error: "Invalid device evidence query" });
    }
  }

  const widget = await getServiceWidget(group, service, index);
  if (!widget) {
    logger.debug("Invalid or missing widget for service '%s' in group '%s'", service, group);
    return res.status(400).json({ error: "Invalid proxy service type" });
  }

  if (endpoint === "mercariRanking" || endpoint === "mercariRankingMonthly") {
    return mercariRanking(endpoint, widget.url, res);
  }

  try {
    const { url, params } = buildSalesProxyRequest({
      endpoint,
      baseUrl: widget.url,
      search,
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

    return res.status(status).json(shapeProxyResponse(endpoint, resultData, shape) ?? {});
  } catch (e) {
    logger.error("Error processing Rakuten sales proxy request: %s", e.message);
    return res.status(400).json({ error: e.message });
  }
}
