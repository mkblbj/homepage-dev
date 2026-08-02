import { expect, it, vi } from "vitest";

vi.mock("./singleton.mjs", () => ({ getSummaryService: vi.fn() }));

import widgets from "../widgets";
import uoAISummaryProxyHandler from "./proxy";
import widget from "./widget";

it("exposes only the exact summary and refresh endpoint names", () => {
  expect(widget.proxyHandler).toBe(uoAISummaryProxyHandler);
  expect(widget.allowedEndpoints.test("summary")).toBe(true);
  expect(widget.allowedEndpoints.test("refresh")).toBe(true);
  expect(widget.allowedEndpoints.test("summary/private")).toBe(false);
  expect(widget.allowedEndpoints.test("refresh-now")).toBe(false);
});

it("registers the AI summary server widget", () => {
  expect(widgets.uoaisummary).toBe(widget);
});
