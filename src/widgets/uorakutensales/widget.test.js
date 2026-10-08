import { describe, expect, it } from "vitest";

import { expectWidgetConfigShape } from "test-utils/widget-config";

import widget from "./widget";

const READ_ONLY = ["sales", "history", "campaigns", "logos", "ranking", "peaks", "monthly", "devices", "devicesMonthly"];

describe("uorakutensales widget config", () => {
  it("allows every read-only snapshot, including the device boards", () => {
    expectWidgetConfigShape(widget);
    for (const endpoint of READ_ONLY) {
      expect(widget.allowedEndpoints.test(endpoint), endpoint).toBe(true);
    }
  });

  it("allows nothing else", () => {
    for (const endpoint of ["devicesRefresh", "device-sales", "devicesMonthlyStatus", "admin", "query"]) {
      expect(widget.allowedEndpoints.test(endpoint), endpoint).toBe(false);
    }
  });
});
