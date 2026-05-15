import assert from "node:assert/strict";
import test from "node:test";

import { HASHED_CONFIGS } from "./hash-configs.mjs";

test("hash route watches announcements config changes", () => {
  assert.equal(HASHED_CONFIGS.includes("announcements.yaml"), true);
});
