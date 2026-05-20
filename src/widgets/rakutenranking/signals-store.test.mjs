import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { getSignalStorePath, readSignalState, writeSignalState } from "./signals-store.mjs";

test("getSignalStorePath uses configured directory", () => {
  assert.equal(
    getSignalStorePath("/tmp/homepage-config"),
    "/tmp/homepage-config/rakuten-ranking-signals.json",
  );
});

test("readSignalState falls back to empty state when file is missing or invalid", () => {
  const dir = mkdtempSync(join(tmpdir(), "rakuten-signals-"));
  try {
    assert.deepEqual(readSignalState(dir), { version: 1, endpoints: {} });

    writeFileSync(getSignalStorePath(dir), "{not-json", "utf8");
    assert.deepEqual(readSignalState(dir), { version: 1, endpoints: {} });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("writeSignalState persists readable JSON", () => {
  const dir = mkdtempSync(join(tmpdir(), "rakuten-signals-"));
  try {
    const state = {
      version: 1,
      endpoints: {
        default: {
          warmedUp: true,
          items: {
            "shop:item": {
              itemCode: "shop:item",
              firstSeenAt: "2026-05-20T00:00:00.000Z",
            },
          },
        },
      },
    };

    writeSignalState(state, dir);
    assert.deepEqual(readSignalState(dir), state);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
