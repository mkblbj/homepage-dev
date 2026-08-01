import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function emptySummaryState() {
  return {
    version: 1,
    latest: null,
    snapshots: [],
    lastAttemptAtJST: null,
    manualCooldownUntilJST: null,
    nextScheduledAtJST: null,
    lastError: null,
    usage: null,
  };
}

export function getSummaryStorePath(configDir) {
  return join(configDir, "uo-ai-summary.json");
}

function normalizeState(value) {
  const empty = emptySummaryState();
  if (!value || value.version !== 1) return empty;

  return {
    ...empty,
    latest: value.latest && typeof value.latest === "object" ? value.latest : null,
    snapshots: Array.isArray(value.snapshots) ? value.snapshots.slice(-24) : [],
    lastAttemptAtJST: value.lastAttemptAtJST || null,
    manualCooldownUntilJST: value.manualCooldownUntilJST || null,
    nextScheduledAtJST: value.nextScheduledAtJST || null,
    lastError: typeof value.lastError === "string" ? value.lastError : null,
    usage: value.usage || null,
  };
}

export function appendSnapshot(state, snapshot, limit = 24) {
  return { ...state, snapshots: [...(state.snapshots || []), snapshot].slice(-limit) };
}

export function createSummaryStore({ configDir, now = Date.now }) {
  const filePath = getSummaryStorePath(configDir);

  return {
    read() {
      if (!existsSync(filePath)) return emptySummaryState();

      try {
        return normalizeState(JSON.parse(readFileSync(filePath, "utf8")));
      } catch {
        renameSync(filePath, `${filePath}.corrupt-${now()}`);
        return emptySummaryState();
      }
    },
    write(value) {
      mkdirSync(configDir, { recursive: true });
      const state = normalizeState(value);
      const tempPath = `${filePath}.${process.pid}.${now()}.tmp`;
      writeFileSync(tempPath, JSON.stringify(state, null, 2), "utf8");
      renameSync(tempPath, filePath);
      return state;
    },
  };
}
