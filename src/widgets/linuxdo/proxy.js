import { xml2js } from "xml-js";

import getServiceWidget from "utils/config/service-helpers";
import createLogger from "utils/logger";
import { httpProxy } from "utils/proxy/http";

const proxyName = "linuxdoProxyHandler";
const logger = createLogger(proxyName);
const feedIdRegex = /^[A-Za-z0-9_-]+$/;
const defaultLimit = 10;
const defaultFeeds = [
  { id: "latest", label: "最新", url: "https://linux.do/latest.rss" },
  { id: "ai", label: "AI", url: "https://linux.do/tag/444.rss" },
];

function getTextValue(value) {
  if (!value) return "";
  if (Array.isArray(value)) {
    return getTextValue(value[0]);
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object") {
    return value._cdata ?? value._text ?? "";
  }
  return "";
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function decodeHtmlEntities(text) {
  if (!text) return "";

  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function stripHtml(html) {
  if (!html) return "";

  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function isBoilerplateParagraph(text) {
  return /阅读完整话题/.test(text) || /^\d+\s*个帖子\s*-\s*\d+\s*位参与者$/.test(text);
}

function extractExcerpt(description) {
  if (!description) return "";

  const paragraphMatches = [...description.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)];
  const paragraphs = paragraphMatches
    .map((match) => stripHtml(match[1]))
    .filter((paragraph) => paragraph && !isBoilerplateParagraph(paragraph));

  if (paragraphs.length > 0) {
    return paragraphs[0];
  }

  const plainText = stripHtml(description);
  return isBoilerplateParagraph(plainText) ? "" : plainText;
}

function normalizeFeed(rawFeed) {
  if (!rawFeed || typeof rawFeed !== "object") return null;

  const { id, label, url } = rawFeed;
  if (
    typeof id !== "string" ||
    !feedIdRegex.test(id) ||
    typeof label !== "string" ||
    !label.trim() ||
    typeof url !== "string" ||
    !url.trim()
  ) {
    return null;
  }

  return {
    id,
    label: label.trim(),
    url: url.trim(),
  };
}

function getFeeds(widget) {
  const configuredFeeds = Array.isArray(widget.feeds) ? widget.feeds.map(normalizeFeed).filter(Boolean) : [];
  return configuredFeeds.length > 0 ? configuredFeeds : defaultFeeds;
}

function getActiveFeed(widget, feeds, endpoint) {
  if (endpoint && !feedIdRegex.test(endpoint)) {
    return null;
  }

  if (endpoint) {
    return feeds.find((feed) => feed.id === endpoint) ?? null;
  }

  if (typeof widget.defaultFeed === "string" && feedIdRegex.test(widget.defaultFeed)) {
    return feeds.find((feed) => feed.id === widget.defaultFeed) ?? null;
  }

  return feeds[0] ?? null;
}

function parseRss(xmlString) {
  const rss = xml2js(xmlString, {
    compact: true,
    trim: true,
    nativeType: false,
    ignoreDeclaration: true,
    ignoreInstruction: true,
    ignoreComment: true,
    ignoreCdata: false,
  });

  const channel = rss?.rss?.channel;
  if (!channel) {
    throw new Error("Invalid RSS payload");
  }

  return {
    channelTitle: getTextValue(channel.title),
    lastBuildDate: getTextValue(channel.lastBuildDate),
    items: toArray(channel.item).map((item) => ({
      title: getTextValue(item.title),
      link: getTextValue(item.link),
      pubDate: getTextValue(item.pubDate),
      author: getTextValue(item["dc:creator"]),
      category: getTextValue(item.category),
      excerpt: extractExcerpt(getTextValue(item.description)),
      sourceUrl: item.source?._attributes?.url ?? "",
    })),
  };
}

export default async function linuxdoProxyHandler(req, res) {
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

  const feeds = getFeeds(widget);
  const activeFeed = getActiveFeed(widget, feeds, endpoint);

  if (!activeFeed) {
    return res.status(400).json({ error: `Invalid endpoint: ${endpoint}` });
  }

  const requestedLimit = Number.parseInt(widget.limit, 10);
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? requestedLimit : defaultLimit;

  try {
    const [status, , data] = await httpProxy(new URL(activeFeed.url), {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Homepage/1.0)",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
    });

    if (status !== 200) {
      logger.error("Error fetching Linux.do RSS from %s: status %d", activeFeed.url, status);
      return res.status(status).json({ error: `Failed to fetch Linux.do RSS: HTTP ${status}` });
    }

    const parsed = parseRss(data.toString());

    return res.status(200).json({
      channelTitle: parsed.channelTitle,
      lastBuildDate: parsed.lastBuildDate,
      feedId: activeFeed.id,
      items: parsed.items.slice(0, limit),
    });
  } catch (error) {
    logger.error("Error parsing Linux.do RSS from %s: %s", activeFeed.url, error.message);
    return res.status(500).json({ error: `Failed to parse Linux.do RSS: ${error.message}` });
  }
}
