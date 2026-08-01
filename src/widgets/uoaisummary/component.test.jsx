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
  metricDisplay: {
    "attention.open_total": {
      rawValue: 64,
      ja: "未対応合計 64件 (+4件)",
      zh: "未处理合计 64件 (+4件)",
    },
    "performance.traffic.delta_percent": {
      rawValue: -31.8,
      ja: "同曜日中央値比 -31.8%",
      zh: "较同星期中位数 -31.8%",
    },
  },
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

    fireEvent.click(screen.getByRole("button", { name: "中文" }));

    expect(screen.getByText("请优先处理待办事项。")).toBeInTheDocument();
    expect(screen.getByText("未处理合计 64件 (+4件)")).toBeInTheDocument();
    expect(screen.queryByText("未対応合計 64件 (+4件)")).not.toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("expands and collapses action details with an accessible disclosure button", () => {
    renderSummary();

    const disclosure = screen.getByRole("button", { name: "詳細を見る" });
    expect(disclosure).toHaveAttribute("type", "button");
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(disclosure).toHaveAttribute("aria-controls", "uoaisummary-details");
    expect(screen.queryByText("未対応案件を整理")).not.toBeInTheDocument();

    fireEvent.click(disclosure);

    expect(screen.getByRole("button", { name: "詳細を閉じる" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("未対応案件を整理")).toBeInTheDocument();
    expect(screen.getByText("データカバレッジ · 4/4")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "詳細を閉じる" }));
    expect(screen.queryByText("未対応案件を整理")).not.toBeInTheDocument();
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
      json: async () => ({ accepted: false, state: "cooldown" }),
    });
    renderSummary();

    fireEvent.click(screen.getByRole("button", { name: "AI再分析" }));

    expect(await screen.findByRole("status")).toHaveTextContent("再分析はしばらくお待ちください");
    expect(mutate).toHaveBeenCalledTimes(1);
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

  it("shows an actionable error panel when no cached summary exists", async () => {
    const mutate = mockSummary({ ...ready, state: "error", summary: null, lastError: "configuration" });
    renderSummary();

    expect(screen.getByRole("alert")).toHaveTextContent("AIサマリーを生成できません");
    const retry = screen.getByRole("button", { name: "AI再分析" });
    expect(retry).toHaveAttribute("type", "button");

    fireEvent.click(retry);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(mutate).toHaveBeenCalledTimes(1);
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
