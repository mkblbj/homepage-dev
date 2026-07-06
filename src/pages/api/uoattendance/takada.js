import { join } from "path";

import { CONF_DIR } from "utils/config/config";
import {
  clearTakadaManualStatus,
  readTakadaManualStatus,
  writeTakadaManualStatus,
} from "widgets/uoattendance/takada-manual-status-store.mjs";

const TAKADA_STATUS_FILE = join(CONF_DIR, "uoattendance-takada-status.json");

function parseBody(body) {
  if (typeof body !== "string") {
    return body || {};
  }

  try {
    return JSON.parse(body);
  } catch (e) {
    return {};
  }
}

export default async function handler(req, res) {
  switch (req.method) {
    case "GET":
      return res.status(200).json({ status: readTakadaManualStatus(TAKADA_STATUS_FILE) });

    case "POST":
    case "PUT": {
      try {
        const status = writeTakadaManualStatus(TAKADA_STATUS_FILE, {
          ...parseBody(req.body),
          updatedAt: new Date().toISOString(),
        });
        return res.status(200).json({ status });
      } catch (e) {
        return res.status(400).json({ error: "Invalid Takada manual status" });
      }
    }

    case "DELETE":
      clearTakadaManualStatus(TAKADA_STATUS_FILE);
      return res.status(200).json({ status: null });

    default:
      res.setHeader("Allow", ["GET", "POST", "PUT", "DELETE"]);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
