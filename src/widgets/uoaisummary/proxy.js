import { getSummaryService } from "./singleton.mjs";

import createLogger from "utils/logger";
import isSameOriginRequest from "utils/proxy/same-origin";

const logger = createLogger("uoAISummaryProxy");

function publicFailure(res, error) {
  logger.error("AI summary proxy failed: %s", error?.code || "unexpected");
  return res.status(error?.code === "configuration" ? 503 : 500).json({
    error: error?.code === "configuration" ? "configuration" : "unexpected",
  });
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
    if (!isSameOriginRequest(req)) {
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
