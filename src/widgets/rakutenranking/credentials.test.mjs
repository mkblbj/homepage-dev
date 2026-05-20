import assert from "node:assert/strict";
import test from "node:test";

import { createRakutenCredentialPicker, normalizeRakutenApplications } from "./credentials.mjs";

test("normalizeRakutenApplications keeps backward-compatible top-level credentials", () => {
  assert.deepEqual(
    normalizeRakutenApplications({
      applicationId: "app-1",
      accessKey: "key-1",
    }),
    [{ applicationId: "app-1", accessKey: "key-1", bucketKey: "app-1:key-1" }],
  );
});

test("normalizeRakutenApplications appends applications array and removes duplicates", () => {
  assert.deepEqual(
    normalizeRakutenApplications({
      applicationId: "app-1",
      accessKey: "key-1",
      applications: [
        { applicationId: "app-1", accessKey: "key-1" },
        { applicationId: "app-2", accessKey: "key-2" },
        { applicationId: "", accessKey: "missing" },
      ],
    }),
    [
      { applicationId: "app-1", accessKey: "key-1", bucketKey: "app-1:key-1" },
      { applicationId: "app-2", accessKey: "key-2", bucketKey: "app-2:key-2" },
    ],
  );
});

test("createRakutenCredentialPicker rotates credentials per widget key", () => {
  const picker = createRakutenCredentialPicker();
  const applications = [
    { applicationId: "app-1", accessKey: "key-1", bucketKey: "app-1:key-1" },
    { applicationId: "app-2", accessKey: "key-2", bucketKey: "app-2:key-2" },
  ];

  assert.equal(picker.next("widget-a", applications).applicationId, "app-1");
  assert.equal(picker.next("widget-a", applications).applicationId, "app-2");
  assert.equal(picker.next("widget-a", applications).applicationId, "app-1");
  assert.equal(picker.next("widget-b", applications).applicationId, "app-1");
});

test("createRakutenCredentialPicker blocks credentials that fail authorization", () => {
  let now = 1_000;
  const picker = createRakutenCredentialPicker({
    now: () => now,
    blockedCredentialTtlMs: 10_000,
  });
  const applications = [
    { applicationId: "app-1", accessKey: "key-1", bucketKey: "app-1:key-1" },
    { applicationId: "app-2", accessKey: "key-2", bucketKey: "app-2:key-2" },
  ];

  const first = picker.next("widget-a", applications);
  picker.reportStatus(first, 403);

  assert.equal(picker.next("widget-a", applications).applicationId, "app-2");
  assert.equal(picker.next("widget-a", applications).applicationId, "app-2");

  now += 10_001;
  assert.equal(picker.next("widget-a", applications).applicationId, "app-1");
});

test("createRakutenCredentialPicker can exclude credentials already tried for one page", () => {
  const picker = createRakutenCredentialPicker();
  const applications = [
    { applicationId: "app-1", accessKey: "key-1", bucketKey: "app-1:key-1" },
    { applicationId: "app-2", accessKey: "key-2", bucketKey: "app-2:key-2" },
  ];

  assert.equal(
    picker.next("widget-a", applications, { exclude: new Set(["app-1:key-1"]) }).applicationId,
    "app-2",
  );
  assert.equal(
    picker.next("widget-a", applications, { exclude: new Set(["app-1:key-1", "app-2:key-2"]) }),
    null,
  );
});
