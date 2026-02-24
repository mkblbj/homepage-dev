import getServiceWidget from "utils/config/service-helpers";
import createLogger from "utils/logger";
import { httpProxy } from "utils/proxy/http";

const proxyName = "yahooRankingProxyHandler";
const logger = createLogger(proxyName);

const API_BASE = "https://shopping.yahooapis.jp/ShoppingWebService/V2/queryRanking";

export default async function yahooRankingProxyHandler(req, res) {
  const { group, service, index, endpoint } = req.query;

  if (!group || !service) {
    logger.debug("Invalid or missing service '%s' or group '%s'", service, group);
    return res.status(400).json({ error: "Invalid proxy service type" });
  }

  const widget = await getServiceWidget(group, service, index);
  if (!widget) {
    logger.debug("Invalid or missing widget for service '%s' in group '%s'", service, group);
    return res.status(400).json({ error: "Invalid proxy service type" });
  }

  const { appid } = widget;
  if (!appid) {
    return res.status(400).json({ error: "Missing appid in widget config" });
  }

  const match = endpoint?.match(/^(ranking|up)(?:_(\d+))?$/);
  if (!match) {
    return res.status(400).json({ error: `Invalid endpoint: ${endpoint}` });
  }

  const [, type, categoryId] = match;

  const params = new URLSearchParams({ appid, type });

  if (type === "ranking") {
    params.set("hits", String(widget.hits || 20));
  }
  if (categoryId) {
    params.set("category_id", categoryId);
  }

  const url = new URL(`${API_BASE}?${params.toString()}`);

  try {
    const [status, , data] = await httpProxy(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Homepage/1.0)",
        Accept: "application/json",
      },
    });

    if (status !== 200) {
      logger.error("Error fetching Yahoo ranking (endpoint=%s): status %d", endpoint, status);
      return res.status(status).json({ error: `Yahoo API returned HTTP ${status}` });
    }

    const json = JSON.parse(data.toString());
    const kr = json.keyword_ranking || {};
    const meta = kr.meta || {};
    const rankingData = kr.ranking_data || [];

    const items = rankingData
      .filter((item) => item.query)
      .map((item) => ({
        rank: item.rank,
        preRank: item.pre_rank,
        vector: item.vector,
        score: item.score,
        query: item.query,
        url: item.url,
        relational: (item.relational?.relational_term || []).map((r) => ({
          query: r.query,
          url: r.url,
        })),
      }));

    return res.status(200).json({
      startDate: meta.start_date || "",
      endDate: meta.end_date || "",
      lastModified: meta.last_modified || "",
      totalResults: meta.total_results_returned || 0,
      items,
    });
  } catch (e) {
    logger.error("Error processing Yahoo ranking: %s", e.message);
    return res.status(500).json({ error: `Failed to fetch ranking: ${e.message}` });
  }
}
