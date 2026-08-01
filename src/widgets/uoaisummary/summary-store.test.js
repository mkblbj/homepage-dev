import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { HASHED_CONFIGS } from "../../pages/api/hash-configs.mjs";
import { appendSnapshot, createSummaryStore, emptySummaryState, getSummaryStorePath } from "./summary-store.mjs";

let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "uo-ai-summary-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("summary store", () => {
  it("returns an empty versioned state when the cache is missing", () => {
    expect(createSummaryStore({ configDir: dir }).read()).toEqual(emptySummaryState());
  });

  it("isolates corrupt JSON and starts clean", () => {
    writeFileSync(getSummaryStorePath(dir), "{broken", "utf8");

    const state = createSummaryStore({ configDir: dir, now: () => 123 }).read();

    expect(state).toEqual(emptySummaryState());
    expect(readdirSync(dir)).toContain("uo-ai-summary.json.corrupt-123");
  });

  it("atomically writes readable state without persisting running", () => {
    const store = createSummaryStore({ configDir: dir, now: () => 123 });
    store.write({ ...emptySummaryState(), running: true, lastAttemptAtJST: "2026-08-01 10:00:00 JST" });

    expect(store.read()).toMatchObject({ lastAttemptAtJST: "2026-08-01 10:00:00 JST" });
    expect(store.read()).not.toHaveProperty("running");
    expect(readdirSync(dir).some((name) => name.endsWith(".tmp"))).toBe(false);
  });

  it("keeps only the newest 24 compact snapshots", () => {
    let state = emptySummaryState();
    for (let index = 0; index < 30; index += 1) {
      state = appendSnapshot(state, {
        capturedAtJST: "2026-08-01 " + String(index).padStart(2, "0") + ":00:00 JST",
        metrics: { "sales.realtime_yen": index },
      });
    }

    expect(state.snapshots).toHaveLength(24);
    expect(state.snapshots[0].metrics["sales.realtime_yen"]).toBe(6);
    expect(state.snapshots[23].metrics["sales.realtime_yen"]).toBe(29);
  });

  it("does not serialize an Error as lastError", () => {
    const store = createSummaryStore({ configDir: dir });
    store.write({ ...emptySummaryState(), lastError: new Error("private failure") });

    expect(store.read().lastError).toBeNull();
  });

  it("does not include the generated cache in the browser config hash", () => {
    expect(HASHED_CONFIGS).not.toContain("uo-ai-summary.json");
  });
});
