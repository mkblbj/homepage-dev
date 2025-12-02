import getServiceWidget from "utils/config/service-helpers";
import createLogger from "utils/logger";
import { httpProxy } from "utils/proxy/http";

const proxyName = "yahoorssProxyHandler";
const logger = createLogger(proxyName);

function parseRssXml(xmlString) {
  const items = [];
  
  // Extract channel title
  const channelTitleMatch = xmlString.match(/<channel>[\s\S]*?<title>([^<]+)<\/title>/);
  const channelTitle = channelTitleMatch ? channelTitleMatch[1] : "Yahoo! News";
  
  // Extract all items
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  
  while ((match = itemRegex.exec(xmlString)) !== null) {
    const itemContent = match[1];
    
    const titleMatch = itemContent.match(/<title>([^<]+)<\/title>/);
    const linkMatch = itemContent.match(/<link>([^<]+)<\/link>/);
    const pubDateMatch = itemContent.match(/<pubDate>([^<]+)<\/pubDate>/);
    
    if (titleMatch && linkMatch) {
      items.push({
        title: titleMatch[1],
        link: linkMatch[1],
        pubDate: pubDateMatch ? pubDateMatch[1] : null,
      });
    }
  }
  
  return {
    channelTitle,
    items,
  };
}

export default async function yahoorssProxyHandler(req, res) {
  const { group, service, index } = req.query;

  if (!group || !service) {
    logger.debug("Invalid or missing service '%s' or group '%s'", service, group);
    return res.status(400).json({ error: "Invalid proxy service type" });
  }

  const widget = await getServiceWidget(group, service, index);
  if (!widget) {
    logger.debug("Invalid or missing widget for service '%s' in group '%s'", service, group);
    return res.status(400).json({ error: "Invalid proxy service type" });
  }

  const url = widget.feedUrl || widget.url;
  if (!url) {
    return res.status(400).json({ error: "Missing feedUrl or url in widget config" });
  }

  try {
    const [status, , data] = await httpProxy(new URL(url), {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Homepage/1.0)",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
      },
    });

    if (status !== 200) {
      logger.error("Error fetching RSS from %s: status %d", url, status);
      return res.status(status).json({ error: `Failed to fetch RSS: HTTP ${status}` });
    }

    const xmlString = data.toString();
    const parsed = parseRssXml(xmlString);
    
    // Apply limit if specified
    const limit = widget.limit || 10;
    parsed.items = parsed.items.slice(0, limit);

    return res.status(200).json(parsed);
  } catch (e) {
    logger.error("Error parsing RSS from %s: %s", url, e.message);
    return res.status(500).json({ error: `Failed to parse RSS: ${e.message}` });
  }
}

