import getServiceWidget from "utils/config/service-helpers";
import createLogger from "utils/logger";
import { httpProxy } from "utils/proxy/http";

const proxyName = "rakutenRankingProxyHandler";
const logger = createLogger(proxyName);

const API_BASE = "https://openapi.rakuten.co.jp/ichibaranking/api/IchibaItem/Ranking/20220601";

export default async function rakutenRankingProxyHandler(req, res) {
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

  const { applicationId, accessKey } = widget;
  if (!applicationId || !accessKey) {
    return res.status(400).json({ error: "Missing applicationId or accessKey in widget config" });
  }

  const params = new URLSearchParams({
    applicationId,
    accessKey,
    formatVersion: "2",
  });

  const match = endpoint?.match(/^(daily|realtime)(?:_(\d+))?$/);
  if (!match) {
    return res.status(400).json({ error: `Invalid endpoint: ${endpoint}` });
  }
  const [, period, genreId] = match;
  if (period === "realtime") params.set("period", "realtime");
  if (genreId) params.set("genreId", genreId);

  const limit = widget.limit || 10;
  const PAGE_SIZE = 30;
  const totalPages = Math.min(Math.ceil(limit / PAGE_SIZE), 34);

  try {
    const delay = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

    const fetchPage = async (page) => {
      const pageParams = new URLSearchParams(params);
      pageParams.set("page", String(page));
      const pageUrl = new URL(`${API_BASE}?${pageParams.toString()}`);
      const [status, , data] = await httpProxy(pageUrl, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Homepage/1.0)",
          Accept: "application/json",
        },
      });
      if (status !== 200) {
        logger.error("Error fetching Rakuten ranking (endpoint=%s, page=%d): status %d", endpoint, page, status);
        return null;
      }
      return JSON.parse(data.toString());
    };

    const results = [];
    for (let i = 0; i < totalPages; i += 1) {
      if (i > 0) await delay(300);
      results.push(await fetchPage(i + 1));
    }

    const firstResult = results.find((r) => r !== null);
    if (!firstResult) {
      return res.status(502).json({ error: "Rakuten API returned no valid responses" });
    }

    const allItems = results
      .filter(Boolean)
      .flatMap((json) => json.Items || json.items || [])
      .sort((a, b) => a.rank - b.rank);

    const items = allItems.slice(0, limit).map((item) => ({
      rank: item.rank,
      itemName: item.itemName,
      catchcopy: item.catchcopy,
      itemPrice: item.itemPrice,
      itemUrl: item.itemUrl,
      imageUrl: item.mediumImageUrls?.[0]?.replace(/\?_ex=\d+x\d+/, "") || "",
      reviewAverage: item.reviewAverage,
      reviewCount: item.reviewCount,
      shopName: item.shopName,
      availability: item.availability,
    }));

    return res.status(200).json({
      title: firstResult.title || "",
      lastBuildDate: firstResult.lastBuildDate || "",
      items,
    });
  } catch (e) {
    logger.error("Error processing Rakuten ranking: %s", e.message);
    return res.status(500).json({ error: `Failed to fetch ranking: ${e.message}` });
  }
}
