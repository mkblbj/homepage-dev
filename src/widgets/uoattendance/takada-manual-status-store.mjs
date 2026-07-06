import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";

import { normalizeTakadaManualStatus } from "./takada-manual-status.mjs";

export function readTakadaManualStatus(filePath) {
  try {
    if (!existsSync(filePath)) {
      return null;
    }

    return normalizeTakadaManualStatus(JSON.parse(readFileSync(filePath, "utf8")));
  } catch (e) {
    return null;
  }
}

export function writeTakadaManualStatus(filePath, value) {
  const status = normalizeTakadaManualStatus(value);
  if (!status) {
    throw new Error("Invalid Takada manual status");
  }

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(status, null, 2), "utf8");
  return status;
}

export function clearTakadaManualStatus(filePath) {
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}
