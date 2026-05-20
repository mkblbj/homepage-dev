import { existsSync, renameSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_CONFIG_DIR = process.env.HOMEPAGE_CONFIG_DIR
  ? process.env.HOMEPAGE_CONFIG_DIR
  : join(process.cwd(), "config");

export function getSignalStorePath(configDir = DEFAULT_CONFIG_DIR) {
  return join(configDir, "rakuten-ranking-signals.json");
}

export function emptySignalState() {
  return {
    version: 1,
    endpoints: {},
  };
}

export function readSignalState(configDir = DEFAULT_CONFIG_DIR) {
  const filePath = getSignalStorePath(configDir);
  if (!existsSync(filePath)) return emptySignalState();

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    if (!parsed || typeof parsed !== "object" || !parsed.endpoints || typeof parsed.endpoints !== "object") {
      return emptySignalState();
    }
    return {
      version: 1,
      endpoints: parsed.endpoints,
    };
  } catch {
    return emptySignalState();
  }
}

export function writeSignalState(state, configDir = DEFAULT_CONFIG_DIR) {
  const filePath = getSignalStorePath(configDir);
  const tempPath = `${filePath}.tmp`;
  writeFileSync(tempPath, JSON.stringify(state || emptySignalState(), null, 2), "utf8");
  renameSync(tempPath, filePath);
}
