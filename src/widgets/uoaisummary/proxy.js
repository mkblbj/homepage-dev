import { getSummaryService } from "./singleton.mjs";

import createLogger from "utils/logger";

const logger = createLogger("uoAISummaryProxy");

function publicFailure(res, error) {
  logger.error("AI summary proxy failed: %s", error?.code || "unexpected");
  return res.status(error?.code === "configuration" ? 503 : 500).json({
    error: error?.code === "configuration" ? "configuration" : "unexpected",
  });
}

function firstHeaderValue(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  return raw.split(",", 1)[0].trim() || null;
}

function normalizeOrigin(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const origin = value.trim();
  if (!/^https?:\/\/[^/?#]+\/?$/i.test(origin)) return null;
  try {
    const url = new URL(origin);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function serverOrigin(req) {
  const forwardedProto = firstHeaderValue(req.headers?.["x-forwarded-proto"]);
  const forwardedHost = firstHeaderValue(req.headers?.["x-forwarded-host"]);
  const protocol = forwardedProto && forwardedHost ? forwardedProto : req.socket?.encrypted ? "https" : "http";
  const host = forwardedProto && forwardedHost ? forwardedHost : firstHeaderValue(req.headers?.host);
  const normalizedProtocol = protocol.toLowerCase();
  if (!host || !["http", "https"].includes(normalizedProtocol)) return null;
  return normalizeOrigin(`${normalizedProtocol}://${host}`);
}

function sameOrigin(req) {
  if (firstHeaderValue(req.headers?.["sec-fetch-site"])?.toLowerCase() === "cross-site") return false;
  const requestOrigin = normalizeOrigin(req.headers?.origin);
  const expectedOrigin = serverOrigin(req);
  return requestOrigin !== null && requestOrigin === expectedOrigin;
}

export default async function uoAISummaryProxyHandler(req, res) {
  const endpoint = req.query.endpoint;
  res.setHeader("Cache-Control", "private, no-store");

  if (endpoint === "summary") {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "method_not_allowed" });
    }
    try {
      const service = await getSummaryService();
      return res.status(200).json(service.getPublicState());
    } catch (error) {
      return publicFailure(res, error);
    }
  }

  if (endpoint === "refresh") {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "method_not_allowed" });
    }
    if (!sameOrigin(req)) {
      return res.status(403).json({ error: "cross_site_request" });
    }
    try {
      const service = await getSummaryService();
      const result = service.requestRefresh({ manual: true });
      return res.status(result.state === "cooldown" ? 429 : 202).json(result);
    } catch (error) {
      return publicFailure(res, error);
    }
  }

  return res.status(404).json({ error: "endpoint_not_found" });
}
