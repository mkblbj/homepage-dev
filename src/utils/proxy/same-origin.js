// Shared CSRF guard for proxy endpoints that act (uoaisummary refresh, uovacuum
// commands): another site must not be able to make a visitor's browser fire them.

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

export default function isSameOriginRequest(req) {
  if (firstHeaderValue(req.headers?.["sec-fetch-site"])?.toLowerCase() === "cross-site") return false;
  const requestOrigin = normalizeOrigin(req.headers?.origin);
  const expectedOrigin = serverOrigin(req);
  return requestOrigin !== null && requestOrigin === expectedOrigin;
}
