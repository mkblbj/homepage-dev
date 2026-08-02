/** @vitest-environment jsdom */

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "test-utils/render-with-providers";

const { useWidgetAPI, formatProxyUrl } = vi.hoisted(() => ({
  useWidgetAPI: vi.fn(),
  formatProxyUrl: vi.fn(() => "/api/services/proxy?endpoint=refresh"),
}));

vi.mock("utils/proxy/use-widget-api", () => ({ default: useWidgetAPI }));
vi.mock("utils/proxy/api-helpers", () => ({ formatProxyUrl }));

import Component from "./component";

const ready = {
  state: "ready",
  severity: "attention",
  dataQuality: "complete",
  generatedAtJST: "2026-08-01 10:00:00 JST",
  nextScheduledAtJST: "2026-08-01 11:00:00 JST",
  sourceCoverage: { valid: 4, total: 4 },
  sourceFreshness: {
    shipping: { state: "fresh", updatedAtJST: "2026-08-01 09:59:00 JST" },
    attention: { state: "fresh", updatedAtJST: "2026-08-01 09:50:00 JST" },
    sales: { state: "delayed", updatedAtJST: "2026-08-01 09:45:00 JST" },
    performance: { state: "fresh", updatedAtJST: "2026-08-01 07:00:00 JST" },
  },
  cooldownUntilJST: null,
  lastError: null,
  summary: {
    headline: { ja: "対応待ち案件を優先してください。", zh: "请优先处理待办事项。" },
    assessment: { ja: "全体は安定しています。", zh: "整体稳定。" },
    actions: [
      {
        priority: "high",
        module: "attention",
        shopName: "3911",
        metricKey: "attention.open_total",
        title: { ja: "未対応案件を整理", zh: "梳理待办事项" },
        reason: { ja: "優先順を確認してください。", zh: "请确认处理优先级。" },
      },
    ],
  },
  metrics: [
    {
      key: "sales.realtime_yen",
      unit: "yen",
      value: 1240000,
      previousValue: 1420000,
      delta: -180000,
      deltaPercent: -12.7,
      note: null,
    },
    { key: "sales.orders", unit: "count", value: 248, previousValue: 240, delta: 8, deltaPercent: 3.3, note: null },
    {
      key: "sales.realtime_vs_seven_day_avg_percent",
      unit: "percent",
      value: 88,
      previousValue: null,
      delta: null,
      deltaPercent: null,
      note: null,
    },
    {
      key: "performance.traffic.visit",
      unit: "count",
      value: 8420,
      previousValue: null,
      delta: null,
      deltaPercent: null,
      note: null,
    },
    {
      key: "performance.traffic.delta_percent",
      unit: "percent",
      value: -9,
      previousValue: null,
      delta: null,
      deltaPercent: null,
      note: null,
    },
    {
      key: "attention.open_total",
      unit: "count",
      value: 58,
      previousValue: 46,
      delta: 12,
      deltaPercent: 26.1,
      note: null,
    },
    {
      key: "output.today.total",
      unit: "count",
      value: 1860,
      previousValue: null,
      delta: null,
      deltaPercent: null,
      note: null,
    },
    {
      key: "output.tomorrow.total",
      unit: "count",
      value: 2010,
      previousValue: null,
      delta: null,
      deltaPercent: null,
      note: "predicted",
    },
  ],
};

const service = {
  name: "AI 経営サマリー",
  widget: {
    type: "uoaisummary",
    service_group: "リアルタイム看板",
    service_name: "AI 経営サマリー",
    index: 0,
    refreshInterval: 60000,
  },
};

function mockSummary(data = ready, mutate = vi.fn()) {
  useWidgetAPI.mockReturnValue({ data, error: null, mutate });
  return mutate;
}

function renderSummary() {
  return renderWithProviders(<Component service={service} />);
}

function withoutSummary(state, overrides = {}) {
  return {
    ...ready,
    state,
    severity: "unknown",
    dataQuality: state === "error" ? "insufficient" : "complete",
    summary: null,
    metrics: [],
    lastError: state === "error" ? "configuration" : null,
    ...overrides,
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSummary();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 202,
    json: async () => ({ accepted: true, state: "running" }),
  });
});

describe("widgets/uoaisummary/component", () => {
  it("shows Japanese by default and switches cached text to Chinese", () => {
    renderSummary();

    expect(screen.getByText("対応待ち案件を優先してください。")).toBeInTheDocument();
    expect(screen.getByText("全体は安定しています。")).toBeInTheDocument();
    expect(screen.getByText("未対応案件を整理")).toBeInTheDocument();
    expect(screen.getByText(/優先順を確認してください。/)).toBeInTheDocument();
    expect(screen.getByText("最優先")).toBeInTheDocument();
    expect(screen.queryByText("请优先处理待办事项。")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "中文" }));

    expect(screen.getByText("请优先处理待办事项。")).toBeInTheDocument();
    expect(screen.getByText("整体稳定。")).toBeInTheDocument();
    expect(screen.getByText("梳理待办事项")).toBeInTheDocument();
    expect(screen.getByText(/请确认处理优先级。/)).toBeInTheDocument();
    expect(screen.getByText("最高优先")).toBeInTheDocument();
    expect(screen.queryByText("対応待ち案件を優先してください。")).not.toBeInTheDocument();
    expect(screen.queryByText("未対応案件を整理")).not.toBeInTheDocument();
    expect(screen.getByText("AI 经营总结")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI重新分析" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "日本語" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "日本語" }));

    expect(screen.getByText("対応待ち案件を優先してください。")).toBeInTheDocument();
    expect(screen.getByText("AI 経営サマリー")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI再分析" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "中文" })).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("posts a manual refresh once and revalidates after a 202 response", async () => {
    const mutate = mockSummary();
    renderSummary();

    fireEvent.click(screen.getByRole("button", { name: "AI再分析" }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/services/proxy?endpoint=refresh",
        expect.objectContaining({ method: "POST", headers: { Accept: "application/json" } }),
      ),
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(formatProxyUrl).toHaveBeenCalledWith(service.widget, "refresh");
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("announces cooldown and revalidates after a 429 response", async () => {
    const mutate = mockSummary();
    global.fetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        accepted: false,
        state: "cooldown",
        cooldownUntilJST: "2099-08-01 23:59:00 JST",
      }),
    });
    renderSummary();

    fireEvent.click(screen.getByRole("button", { name: "AI再分析" }));

    expect(await screen.findByRole("status")).toHaveTextContent("再分析は 2099-08-01 23:59:00 JST までお待ちください");
    expect(screen.getByRole("button", { name: "AI再分析" })).toBeDisabled();
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["cached summary", ready],
    ["no-summary waiting", withoutSummary("empty")],
  ])("locks the %s refresh button synchronously until fetch and revalidation finish", async (_label, data) => {
    const request = deferred();
    const mutate = mockSummary(data);
    global.fetch.mockReturnValue(request.promise);
    renderSummary();

    const refresh = screen.getByRole("button", { name: "AI再分析" });
    fireEvent.click(refresh);
    fireEvent.click(refresh);

    expect(refresh).toBeDisabled();
    expect(refresh).toHaveAttribute("aria-busy", "true");
    expect(global.fetch).toHaveBeenCalledTimes(1);

    request.resolve({
      ok: true,
      status: 202,
      json: async () => ({ accepted: true, state: "running" }),
    });

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(refresh).toBeEnabled());
    expect(refresh).toHaveAttribute("aria-busy", "false");
  });

  it.each([
    ["running", "complete", "AI分析中"],
    ["stale", "stale", "前回の結果を表示中"],
    ["partial", "partial", "一部データで分析"],
    ["error", "stale", "前回の結果を表示中"],
  ])("shows a live %s status without hiding a cached summary", (state, dataQuality, label) => {
    mockSummary({ ...ready, state, dataQuality, lastError: state === "error" ? "model_http" : null });
    renderSummary();

    expect(screen.getByRole("status")).toHaveTextContent(label);
    expect(screen.getByText("対応待ち案件を優先してください。")).toBeInTheDocument();
  });

  it("shows first-analysis progress instead of an error when no summary is running", () => {
    mockSummary(withoutSummary("running"));
    renderSummary();

    expect(screen.getByRole("status")).toHaveTextContent("AI分析中");
    expect(screen.getByText("最初のサマリーを生成しています")).toBeInTheDocument();
    expect(screen.queryByText("AIサマリーを生成できません")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI再分析" })).toBeDisabled();
  });

  it("shows an actionable waiting state when no summary has been generated", () => {
    mockSummary(withoutSummary("empty"));
    renderSummary();

    expect(screen.getByRole("status")).toHaveTextContent("AIサマリーはまだありません");
    expect(screen.getByText("初回分析を開始してください")).toBeInTheDocument();
    expect(screen.queryByText("AIサマリーを生成できません")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI再分析" })).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows an actionable error panel when no cached summary exists", async () => {
    const mutate = mockSummary(withoutSummary("error"));
    renderSummary();

    expect(screen.getByRole("alert")).toHaveTextContent("AIサマリーを生成できません");
    expect(screen.getByRole("alert")).toHaveTextContent("AIの設定を確認してください");
    const retry = screen.getByRole("button", { name: "AI再分析" });
    expect(retry).toHaveAttribute("type", "button");

    fireEvent.click(retry);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("announces cooldown feedback from the no-summary waiting state", async () => {
    const mutate = mockSummary(withoutSummary("empty"));
    global.fetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        accepted: false,
        state: "cooldown",
        cooldownUntilJST: "2099-08-01 23:59:00 JST",
      }),
    });
    renderSummary();

    fireEvent.click(screen.getByRole("button", { name: "AI再分析" }));

    const feedback = await screen.findByText("再分析は 2099-08-01 23:59:00 JST までお待ちください");
    expect(feedback).toHaveAttribute("role", "status");
    expect(screen.getByRole("button", { name: "AI再分析" })).toBeDisabled();
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("shows a localized safe error category while retaining a cached summary", () => {
    mockSummary({ ...ready, state: "error", lastError: "model_http" });
    renderSummary();

    expect(screen.getByRole("alert")).toHaveTextContent("AI分析サービスでエラーが発生しました");
    expect(screen.getByText("対応待ち案件を優先してください。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "中文" }));

    expect(screen.getByRole("alert")).toHaveTextContent("AI分析服务发生错误");
    expect(screen.queryByText("model_http")).not.toBeInTheDocument();
  });

  it.each([
    ["source_timeout", "元データを取得できませんでした"],
    ["source_unavailable", "元データを取得できませんでした"],
    ["model_schema", "AI分析サービスでエラーが発生しました"],
    ["cache", "サマリーの保存に失敗しました"],
    ["unexpected", "予期しないエラーが発生しました"],
  ])("maps the safe %s category without exposing its internal code", (lastError, message) => {
    mockSummary({ ...ready, state: "error", lastError });
    renderSummary();

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByText(lastError)).not.toBeInTheDocument();
  });

  it("honors a persisted cooldown while displaying a cached summary", () => {
    mockSummary({ ...ready, cooldownUntilJST: "2099-08-01 23:59:00 JST" });
    renderSummary();

    expect(screen.getByRole("status")).toHaveTextContent("再分析は 2099-08-01 23:59:00 JST までお待ちください");
    expect(screen.getByRole("button", { name: "AI再分析" })).toBeDisabled();
  });

  it("announces unexpected refresh feedback from the no-summary error state", async () => {
    mockSummary(withoutSummary("error"));
    global.fetch.mockRejectedValue(new Error("offline"));
    renderSummary();

    fireEvent.click(screen.getByRole("button", { name: "AI再分析" }));

    const feedback = await screen.findByText("再分析を開始できませんでした");
    expect(feedback).toHaveAttribute("role", "status");
    expect(screen.getByRole("alert")).toHaveTextContent("AIサマリーを生成できません");
  });

  it("announces an unexpected refresh failure while retaining the cached summary", async () => {
    global.fetch.mockRejectedValue(new Error("offline"));
    renderSummary();

    fireEvent.click(screen.getByRole("button", { name: "AI再分析" }));

    expect(await screen.findByRole("status")).toHaveTextContent("再分析を開始できませんでした");
    expect(screen.getByText("対応待ち案件を優先してください。")).toBeInTheDocument();
  });

  it("uses the configured summary refresh interval and disables refresh while running", () => {
    mockSummary({ ...ready, state: "running" });
    renderSummary();

    expect(useWidgetAPI).toHaveBeenCalledWith(service.widget, "summary", { refreshInterval: 60000 });
    expect(screen.getByRole("button", { name: "AI再分析" })).toBeDisabled();
  });
});

describe("cockpit layout", () => {
  beforeEach(() => {
    useWidgetAPI.mockReturnValue({ data: ready, error: null, mutate: vi.fn() });
  });

  it("shows the headline, assessment and action reason without expanding anything", () => {
    renderWithProviders(<Component service={{ widget: { type: "uoaisummary" } }} />);

    expect(screen.getByText("対応待ち案件を優先してください。")).toBeInTheDocument();
    expect(screen.getByText("全体は安定しています。")).toBeInTheDocument();
    expect(screen.getByText("未対応案件を整理")).toBeInTheDocument();
    expect(screen.getByText(/優先順を確認してください。/)).toBeInTheDocument();
  });

  it("keeps the metric strip closed by default", () => {
    renderWithProviders(<Component service={{ widget: { type: "uoaisummary" } }} />);

    expect(screen.queryByText("リアルタイム売上")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /指標/ })).toHaveAttribute("aria-expanded", "false");
  });

  it("reveals seven fixed metrics when the strip is opened", () => {
    renderWithProviders(<Component service={{ widget: { type: "uoaisummary" } }} />);
    fireEvent.click(screen.getByRole("button", { name: /指標/ }));

    ["リアルタイム売上", "注文数", "7日平均比", "訪問数", "未対応", "今日出力", "明日予定"].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
    expect(screen.getByText("¥1,240,000")).toBeInTheDocument();
    expect(screen.getByText("予測値")).toBeInTheDocument();
    expect(screen.getByText("基準100%")).toBeInTheDocument();
  });

  it("uses the traffic baseline delta as the visit secondary line", () => {
    renderWithProviders(<Component service={{ widget: { type: "uoaisummary" } }} />);
    fireEvent.click(screen.getByRole("button", { name: /指標/ }));

    expect(screen.getByText("-9.0%")).toBeInTheDocument();
  });

  it("never renders a raw metric key", () => {
    const { container } = renderWithProviders(<Component service={{ widget: { type: "uoaisummary" } }} />);
    fireEvent.click(screen.getByRole("button", { name: /指標/ }));

    expect(container.textContent).not.toMatch(/attention\.open_total/);
    expect(container.textContent).not.toMatch(/performance\.traffic/);
  });

  it("names the worst source in the freshness summary", () => {
    renderWithProviders(<Component service={{ widget: { type: "uoaisummary" } }} />);

    expect(screen.getByText("4/4 · 楽天売上 遅延")).toBeInTheDocument();
  });

  it("appends the referenced metric to the action reason", () => {
    renderWithProviders(<Component service={{ widget: { type: "uoaisummary" } }} />);

    expect(screen.getByText(/未対応 58/)).toBeInTheDocument();
  });

  it("marks the severity with a status dot instead of badges", () => {
    renderWithProviders(<Component service={{ widget: { type: "uoaisummary" } }} />);

    expect(screen.getByTestId("uoaisummary-status-dot")).toHaveAttribute("data-severity", "attention");
    expect(screen.queryByText("注意")).not.toBeInTheDocument();
  });
});
