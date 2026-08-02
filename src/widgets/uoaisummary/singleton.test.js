import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { servicesFromConfig, discoverSummaryConfiguration, createSummaryService, service, logger } = vi.hoisted(() => {
  let dependencies;
  const service = {
    initialize: vi.fn(() => dependencies.loadConfiguration()),
    stop: vi.fn(),
  };
  return {
    servicesFromConfig: vi.fn().mockResolvedValue([]),
    discoverSummaryConfiguration: vi.fn(() => ({ ai: {}, sources: {} })),
    createSummaryService: vi.fn((value) => {
      dependencies = value;
      return service;
    }),
    service,
    logger: { error: vi.fn(), info: vi.fn() },
  };
});

vi.mock("utils/config/config", () => ({ CONF_DIR: "/tmp/uo-ai-test" }));
vi.mock("utils/config/service-helpers", () => ({ servicesFromConfig }));
vi.mock("utils/logger", () => ({
  default: () => logger,
}));
vi.mock("./analysis-input.mjs", () => ({ buildAnalysisInput: vi.fn() }));
vi.mock("./config.mjs", () => ({ discoverSummaryConfiguration }));
vi.mock("./responses-client.mjs", () => ({ requestSummaryOnce: vi.fn() }));
vi.mock("./source-client.mjs", () => ({ collectBusinessSources: vi.fn() }));
vi.mock("./summary-service.mjs", () => ({ createSummaryService }));
vi.mock("./summary-store.mjs", () => ({
  createSummaryStore: vi.fn(() => ({ read: vi.fn(), write: vi.fn() })),
}));

beforeEach(async () => {
  const singleton = await import("./singleton.mjs");
  singleton.__resetSummaryServiceForTests();
  servicesFromConfig.mockReset();
  servicesFromConfig.mockResolvedValue([]);
  discoverSummaryConfiguration.mockReset();
  discoverSummaryConfiguration.mockReturnValue({ ai: {}, sources: {} });
  service.initialize.mockClear();
  service.stop.mockClear();
  createSummaryService.mockClear();
  logger.error.mockClear();
  logger.info.mockClear();
});

afterEach(async () => {
  const singleton = await import("./singleton.mjs");
  singleton.__resetSummaryServiceForTests();
});

it("returns the same initialized service for concurrent callers", async () => {
  const singleton = await import("./singleton.mjs");

  const [first, second] = await Promise.all([singleton.getSummaryService(), singleton.getSummaryService()]);

  expect(first).toBe(second);
  expect(first).toBe(service);
  expect(createSummaryService).toHaveBeenCalledTimes(1);
  expect(service.initialize).toHaveBeenCalledTimes(1);
});

it("preserves the process singleton across module reloads", async () => {
  const firstModule = await import("./singleton.mjs");
  const first = await firstModule.getSummaryService();

  vi.resetModules();
  const reloadedModule = await import("./singleton.mjs");
  const second = await reloadedModule.getSummaryService();

  expect(second).toBe(first);
  expect(createSummaryService).toHaveBeenCalledTimes(1);
  expect(service.initialize).toHaveBeenCalledTimes(1);
});

it("quietly skips startup when no AI summary widget exists", async () => {
  const error = Object.assign(new Error("Expected exactly one uoaisummary widget"), {
    code: "configuration",
  });
  discoverSummaryConfiguration.mockImplementation(() => {
    throw error;
  });
  const singleton = await import("./singleton.mjs");

  await singleton.startAISummaryScheduler();

  expect(logger.error).not.toHaveBeenCalled();
});

it("logs only a redacted code when a configured AI widget is invalid", async () => {
  servicesFromConfig.mockResolvedValue([
    {
      name: "AI",
      type: "group",
      services: [
        {
          name: "Executive Summary",
          type: "service",
          widget: { type: "uoaisummary" },
        },
      ],
      groups: [],
    },
  ]);
  const error = Object.assign(new Error("invalid synthetic-secret-value"), {
    code: "configuration",
  });
  discoverSummaryConfiguration.mockImplementation(() => {
    throw error;
  });
  const singleton = await import("./singleton.mjs");

  await singleton.startAISummaryScheduler();

  expect(logger.error).toHaveBeenCalledWith("AI summary scheduler startup failed: %s", "configuration");
  expect(JSON.stringify(logger.error.mock.calls)).not.toContain("synthetic-secret-value");
});
