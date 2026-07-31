// @vitest-environment jsdom

import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "test-utils/render-with-providers";

const { useWidgetAPI } = vi.hoisted(() => ({ useWidgetAPI: vi.fn() }));

vi.mock("utils/proxy/use-widget-api", () => ({
  default: useWidgetAPI,
}));

import Component from "./component";

const service = { widget: { type: "uoattention", refreshInterval: 60000 } };

const okSource = {
  ok: true,
  stale: false,
  updatedAtJST: "2026-07-31 14:20 JST",
  lastAttemptAtJST: "2026-07-31 14:20 JST",
  coveredShopCount: 2,
  lastError: null,
};

function snapshot(overrides = {}) {
  return {
    ok: true,
    partial: false,
    status: "critical",
    generatedAtJST: "2026-07-31 14:20 JST",
    shopCount: 2,
    summary: {
      pendingOrderCount: 0,
      unansweredInquiryCount: 1,
      overdueInquiryCount: 0,
      unrepliedReviewCount: 9,
      productReviewCount: 7,
      shopReviewCount: 2,
      reviewCountByRating: { 1: 4, 2: 3, 3: 2 },
    },
    sources: { mainMenu: okSource, reviews: okSource },
    shops: [
      {
        shopName: "3911",
        status: "critical",
        pendingOrderCount: 0,
        unansweredInquiryCount: 0,
        overdueInquiryCount: 0,
        unrepliedReviewCount: 8,
        productReviewCount: 7,
        shopReviewCount: 1,
        reviewCountByRating: { 1: 3, 2: 3, 3: 2 },
        lastError: null,
      },
      {
        shopName: "0406",
        status: "attention",
        pendingOrderCount: 0,
        unansweredInquiryCount: 1,
        overdueInquiryCount: 0,
        unrepliedReviewCount: 1,
        productReviewCount: 0,
        shopReviewCount: 1,
        reviewCountByRating: { 1: 1, 2: 0, 3: 0 },
        lastError: null,
      },
    ],
    recentReviews: [
      {
        reviewId: "rvw_0001",
        shopName: "3911",
        reviewType: "product",
        rating: 1,
        postedAtJST: "2026-07-31 09:12 JST",
        itemManagementNumber: "sample-001",
        itemName: "サンプル商品",
        excerpt: "synthetic one star",
        reviewUrl: "https://review.rakuten.co.jp/item/1/2_2/rvw_0001/",
      },
      {
        reviewId: "rvw_0002",
        shopName: "0406",
        reviewType: "shop",
        rating: 3,
        postedAtJST: "2026-07-30 20:44 JST",
        itemManagementNumber: null,
        itemName: null,
        excerpt: "synthetic three star",
        reviewUrl: null,
      },
    ],
    lastError: null,
    ...overrides,
  };
}

function mockData(data, mutate = vi.fn()) {
  useWidgetAPI.mockReturnValue({ data, error: undefined, mutate });

  return mutate;
}

function render() {
  return renderWithProviders(<Component service={service} />, { settings: { hideErrors: false } });
}

describe("widgets/uoattention/component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads the attention endpoint", () => {
    mockData(snapshot());
    render();

    expect(useWidgetAPI).toHaveBeenCalledWith(service.widget, "attention", { refreshInterval: 60000 });
  });

  it("renders the headline total and the snapshot time", () => {
    mockData(snapshot());
    render();

    expect(screen.getByText("uoattention.openTotal")).toBeInTheDocument();
    // 0 pending + 1 inquiry + 9 reviews, shown twice: hero + company totals row.
    expect(screen.getAllByText("10")).toHaveLength(2);
    expect(screen.getAllByText("2026-07-31 14:20 JST").length).toBeGreaterThan(0);
  });

  it("renders unknown counts as an em dash instead of zero", () => {
    mockData(
      snapshot({
        summary: {
          pendingOrderCount: null,
          unansweredInquiryCount: null,
          overdueInquiryCount: null,
          unrepliedReviewCount: null,
          productReviewCount: null,
          shopReviewCount: null,
          reviewCountByRating: { 1: null, 2: null, 3: null },
        },
      }),
    );
    render();

    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.getByText("uoattention.totalExcludesUnknown")).toBeInTheDocument();
  });

  it("shows the partial badge only when the snapshot is partial", () => {
    mockData(snapshot());
    const { unmount } = render();

    expect(screen.queryByText("uoattention.partial")).not.toBeInTheDocument();
    unmount();

    mockData(snapshot({ partial: true }));
    render();

    expect(screen.getByText("uoattention.partial")).toBeInTheDocument();
  });

  it("always shows both source freshness chips", () => {
    mockData(snapshot());
    render();

    expect(screen.getByText("uoattention.sourceMainMenu")).toBeInTheDocument();
    expect(screen.getByText("uoattention.sourceReviews")).toBeInTheDocument();
  });

  it("filters the review feed by rating", () => {
    mockData(snapshot());
    render();

    expect(screen.getByText("synthetic one star")).toBeInTheDocument();
    expect(screen.getByText("synthetic three star")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "1★ 4" }));

    expect(screen.getByText("synthetic one star")).toBeInTheDocument();
    expect(screen.queryByText("synthetic three star")).not.toBeInTheDocument();
  });

  it("distinguishes an unavailable review source from an empty feed", () => {
    mockData(
      snapshot({
        sources: { mainMenu: okSource, reviews: { ...okSource, ok: false, lastError: "review refresh failed" } },
        recentReviews: [],
      }),
    );
    render();

    expect(screen.getByText("uoattention.reviewsUnavailable")).toBeInTheDocument();
    expect(screen.queryByText("uoattention.reviewsNone")).not.toBeInTheDocument();
  });

  it("renders no outbound links in the review feed", () => {
    mockData(snapshot());
    const { container } = render();

    expect(container.querySelectorAll("a")).toHaveLength(0);
  });

  it("re-reads the snapshot when the refresh button is clicked", () => {
    const mutate = mockData(snapshot());
    render();

    fireEvent.click(screen.getByRole("button", { name: "uoattention.refresh" }));

    expect(mutate).toHaveBeenCalledOnce();
  });

  it("renders a skeleton while there is no data", () => {
    mockData(undefined);
    const { container } = render();

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders the error container when the request fails", () => {
    useWidgetAPI.mockReturnValue({ data: undefined, error: { message: "boom" }, mutate: vi.fn() });
    render();

    expect(screen.queryByText("uoattention.openTotal")).not.toBeInTheDocument();
  });
});
