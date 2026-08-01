import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { singletonModuleEvaluation, startAISummaryScheduler } = vi.hoisted(() => ({
  singletonModuleEvaluation: { count: 0 },
  startAISummaryScheduler: vi.fn(),
}));

vi.mock("./widgets/uoaisummary/singleton.mjs", () => {
  singletonModuleEvaluation.count += 1;
  return { startAISummaryScheduler };
});

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  singletonModuleEvaluation.count = 0;
  startAISummaryScheduler.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

it("starts the scheduler only in the Node runtime", async () => {
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  const { register } = await import("./instrumentation");

  await register();

  expect(singletonModuleEvaluation.count).toBe(1);
  expect(startAISummaryScheduler).toHaveBeenCalledTimes(1);
});

it("does not import server scheduling in edge runtime", async () => {
  vi.stubEnv("NEXT_RUNTIME", "edge");
  const { register } = await import("./instrumentation");

  await register();

  expect(singletonModuleEvaluation.count).toBe(0);
  expect(startAISummaryScheduler).not.toHaveBeenCalled();
});
