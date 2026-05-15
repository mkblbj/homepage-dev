import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("hash route watches announcements config changes", () => {
  const hashRouteSource = readFileSync(new URL("./hash.js", import.meta.url), "utf8");

  assert.match(hashRouteSource, /"announcements\.yaml"/);
});
