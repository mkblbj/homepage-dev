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
    sales: { state: "fresh", updatedAtJST: "2026-08-01 09:45:00 JST" },
    performance: { state: "fresh", updatedAtJST: "2026-08-01 07:00:00 JST" },
  },
  cooldownUntilJST: null,
  lastError: null,
  summary: {
    headline: { ja: "対応待ち案件を優先してください。", zh: "请优先处理待办事项。" },
    assessment: {
      ja: "全体は安定していますが、運営対応に注意が必要です。",
      zh: "整体稳定，但运营待办需要关注。",
    },
    evidence: [
      {
        metricKey: "attention.open_total",
        interpretation: { ja: "滞留が見られます。", zh: "存在积压。" },
      },
      {
        metricKey: "performance.traffic.delta_percent",
        interpretation: { ja: "基準を下回っています。", zh: "低于基准。" },
      },
    ],
    actions: [
      {
        priority: "high",
        module: "attention",
        shopName: null,
        title: { ja: "未対応案件を整理", zh: "梳理待办事项" },
        reason: { ja: "優先順を確認してください。", zh: "请确认处理优先级。" },
      },
    ],
    reviewThemes: [],
  },
  metrics: [
    {
      key: "attention.open_total",
      unit: "count",
      value: 64,
      previousValue: 60,
      delta: 4,
      deltaPercent: 6.7,
      note: null,
    },
    {
      key: "performance.traffic.delta_percent",
      unit: "percent",
      value: -31.8,
      previousValue: null,
      delta: null,
      deltaPercent: null,
      note: null,
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
  it("shows Japanese by default and switches only cached text and metric displays to Chinese", () => {
    renderSummary();

    expect(screen.getByText("対応待ち案件を優先してください。")).toBeInTheDocument();
    expect(screen.getByText("未対応合計 64件 (+4件)")).toBeInTheDocument();
    expect(screen.getByText("未対応案件を整理")).toBeInTheDocument();
    expect(screen.getByText("最優先")).toBeInTheDocument();
    expect(screen.queryByText("優先順を確認してください。")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "中文" }));

    expect(screen.getByText("请优先处理待办事项。")).toBeInTheDocument();
    expect(screen.getByText("未处理合计 64件 (+4件)")).toBeInTheDocument();
    expect(screen.getByText("梳理待办事项")).toBeInTheDocument();
    expect(screen.getByText("最高优先")).toBeInTheDocument();
    expect(screen.queryByText("未対応合計 64件 (+4件)")).not.toBeInTheDocument();
    expect(screen.queryByText("未対応案件を整理")).not.toBeInTheDocument();
    expect(screen.getByText("AI 经营总结")).toBeInTheDocument();
    expect(screen.getByText("关注")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI重新分析" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看详情" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "日本語" }));

    expect(screen.getByText("対応待ち案件を優先してください。")).toBeInTheDocument();
    expect(screen.getByText("未対応合計 64件 (+4件)")).toBeInTheDocument();
    expect(screen.getByText("AI 経営サマリー")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI再分析" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "詳細を見る" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "中文" })).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("expands and collapses action details with an accessible disclosure button", () => {
    renderSummary();

    const disclosure = screen.getByRole("button", { name: "詳細を見る" });
    expect(disclosure).toHaveAttribute("type", "button");
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(disclosure).toHaveAttribute("aria-controls", "uoaisummary-details");
    expect(screen.getByText("未対応案件を整理")).toBeInTheDocument();
    expect(screen.queryByText("優先順を確認してください。")).not.toBeInTheDocument();

    fireEvent.click(disclosure);

    expect(screen.getByRole("button", { name: "詳細を閉じる" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("未対応案件を整理")).toBeInTheDocument();
    expect(screen.getByText("優先順を確認してください。")).toBeInTheDocument();
    expect(screen.getByText("データカバレッジ · 4/4")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "詳細を閉じる" }));
    expect(screen.getByText("未対応案件を整理")).toBeInTheDocument();
    expect(screen.queryByText("優先順を確認してください。")).not.toBeInTheDocument();
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
