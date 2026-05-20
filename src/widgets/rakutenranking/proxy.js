import { buildRankingSignals, normalizeSignalConfig } from "./signals-model.mjs";
import { readSignalState, writeSignalState } from "./signals-store.mjs";
import { createRakutenPageFetcher } from "./ranking-api.mjs";
import { createRakutenCredentialPicker, normalizeRakutenApplications } from "./credentials.mjs";

import getServiceWidget from "utils/config/service-helpers";
import createLogger from "utils/logger";
import { httpProxy } from "utils/proxy/http";

const proxyName = "rakutenRankingProxyHandler";
const logger = createLogger(proxyName);

const API_BASE = "https://openapi.rakuten.co.jp/ichibaranking/api/IchibaItem/Ranking/20220601";
const PAGE_SIZE = 30;

const credentialPicker = createRakutenCredentialPicker();
const rankingPageFetcher = createRakutenPageFetcher({
  request: (pageUrl) => httpProxy(pageUrl, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Homepage/1.0)",
      Accept: "application/json",
    },
  }),
});

function isCredentialAuthorizationError(status) {
  return status === 401 || status === 403;
}

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

  const applications = normalizeRakutenApplications(widget);
  if (applications.length === 0) {
    return res.status(400).json({ error: "Missing applicationId or accessKey in widget config" });
  }
  const widgetKey = `${group}:${service}:${index || 0}`;

  const params = new URLSearchParams({
    formatVersion: "2",
  });

  const match = endpoint?.match(/^(daily|realtime|signals)(?:_(\d+))?$/);
  if (!match) {
    return res.status(400).json({ error: `Invalid endpoint: ${endpoint}` });
  }
  const [, period, genreId] = match;

  try {
    const fetchRanking = async ({ requestedPeriod, requestedLimit, requireComplete = false }) => {
      const rankingParams = new URLSearchParams(params);
      if (requestedPeriod === "realtime") rankingParams.set("period", "realtime");
      if (genreId) rankingParams.set("genreId", genreId);

      const totalPages = Math.min(Math.ceil(requestedLimit / PAGE_SIZE), 34);
      const results = [];

      const fetchPage = async (page) => {
        const cacheParams = new URLSearchParams(rankingParams);
        cacheParams.set("page", String(page));
        const cacheKey = `${API_BASE}?${cacheParams.toString()}`;

        const attemptedCredentialKeys = new Set();

        for (let attempt = 0; attempt < applications.length; attempt += 1) {
          const credential = credentialPicker.next(widgetKey, applications, { exclude: attemptedCredentialKeys });
          if (!credential) break;
          attemptedCredentialKeys.add(credential.bucketKey);

          const pageParams = new URLSearchParams(cacheParams);
          pageParams.set("applicationId", credential.applicationId);
          pageParams.set("accessKey", credential.accessKey);
          const pageUrl = new URL(`${API_BASE}?${pageParams.toString()}`);
          const [status, , data] = await rankingPageFetcher.fetchPage(pageUrl, {
            period: requestedPeriod,
            bucketKey: credential.bucketKey,
            cacheKey,
          });
          credentialPicker.reportStatus(credential, status);

          if (status === 200) {
            return JSON.parse(data.toString());
          }

          logger.error("Error fetching Rakuten ranking (endpoint=%s, page=%d): status %d", endpoint, page, status);
          if (!isCredentialAuthorizationError(status)) {
            return null;
          }
        }

        return null;
      };

      for (let i = 0; i < totalPages; i += 1) {
        results.push(await fetchPage(i + 1));
      }

      if (requireComplete && results.some((result) => result === null)) {
        throw new Error(`Rakuten API returned incomplete ${requestedPeriod} ranking data`);
      }

      const firstResult = results.find((r) => r !== null);
      if (!firstResult) {
        throw new Error("Rakuten API returned no valid responses");
      }

      const allItems = results
        .filter(Boolean)
        .flatMap((json) => json.Items || json.items || [])
        .sort((a, b) => a.rank - b.rank);

      const items = allItems.slice(0, requestedLimit).map((item) => ({
        rank: item.rank,
        itemCode: item.itemCode,
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

      return {
        title: firstResult.title || "",
        lastBuildDate: firstResult.lastBuildDate || "",
        items,
      };
    };

    if (period === "signals") {
      const signalConfig = normalizeSignalConfig(widget.signal);
      if (!signalConfig.enabled) {
        return res.status(200).json({
          enabled: false,
          warmingUp: false,
          config: signalConfig,
          signals: [],
        });
      }

      const realtimeRanking = await fetchRanking({
        requestedPeriod: "realtime",
        requestedLimit: signalConfig.realtimeTop,
        requireComplete: true,
      });
      const dailyRanking = await fetchRanking({
        requestedPeriod: "daily",
        requestedLimit: signalConfig.dailyTop,
        requireComplete: true,
      });

      const endpointKey = genreId ? `genre:${genreId}` : "default";
      const previousState = readSignalState();
      const result = buildRankingSignals({
        now: new Date().toISOString(),
        endpointKey,
        config: signalConfig,
        previousState,
        realtimeItems: realtimeRanking.items,
        dailyItems: dailyRanking.items,
      });

      writeSignalState(result.nextState);

      return res.status(200).json({
        enabled: true,
        warmingUp: result.warmingUp,
        config: result.config,
        lastBuildDate: realtimeRanking.lastBuildDate,
        dailyLastBuildDate: dailyRanking.lastBuildDate,
        signals: result.signals,
      });
    }

    const ranking = await fetchRanking({
      requestedPeriod: period,
      requestedLimit: widget.limit || 10,
    });

    return res.status(200).json(ranking);
  } catch (e) {
    logger.error("Error processing Rakuten ranking: %s", e.message);
    return res.status(500).json({ error: `Failed to fetch ranking: ${e.message}` });
  }
}
