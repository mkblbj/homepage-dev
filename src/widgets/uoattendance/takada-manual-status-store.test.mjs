import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  clearTakadaManualStatus,
  readTakadaManualStatus,
  writeTakadaManualStatus,
} from "./takada-manual-status-store.mjs";

test("Takada manual status store reads, writes, and clears the local JSON file", () => {
  const dir = mkdtempSync(join(tmpdir(), "uoattendance-takada-"));
  const filePath = join(dir, "status.json");

  try {
    assert.equal(readTakadaManualStatus(filePath), null);

    const saved = writeTakadaManualStatus(filePath, {
      employee: "70",
      employee_name: "高田 健治",
      date: "2026-07-06",
      status: "working",
      time: "08:59",
      updatedAt: "2026-07-06T08:59:00.000+09:00",
    });

    assert.deepEqual(saved, {
      employee: "70",
      employee_name: "高田 健治",
      date: "2026-07-06",
      status: "working",
      time: "08:59",
      updatedAt: "2026-07-06T08:59:00.000+09:00",
    });
    assert.deepEqual(readTakadaManualStatus(filePath), saved);
    assert.match(readFileSync(filePath, "utf8"), /"employee_name": "高田 健治"/);

    clearTakadaManualStatus(filePath);
    assert.equal(readTakadaManualStatus(filePath), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Takada manual status store ignores invalid local JSON instead of breaking the widget", () => {
  const dir = mkdtempSync(join(tmpdir(), "uoattendance-takada-"));
  const filePath = join(dir, "missing.json");

  try {
    assert.throws(
      () =>
        writeTakadaManualStatus(filePath, {
          employee: "70",
          employee_name: "高田 健治",
          date: "2026-07-06",
          status: "vacation",
          time: "08:59",
        }),
      /Invalid Takada manual status/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
