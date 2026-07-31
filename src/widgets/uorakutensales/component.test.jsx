// @vitest-environment jsdom

import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "test-utils/render-with-providers";
import { SettingsContext } from "utils/contexts/settings";

const { useWidgetAPI } = vi.hoisted(() => ({ useWidgetAPI: vi.fn() }));

vi.mock("utils/proxy/use-widget-api", () => ({
  default: useWidgetAPI,
}));

import Component from "./component";

const service = {
  widget: { type: "uorakutensales", refreshInterval: 60000 },
};

const sales = {
  generatedAtJST: "2026-07-28 16:41 JST",
  totals: { salesYen: 0, orderCount: 0 },
  shops: [],
};

function rankedItem(mno, shopName) {
  return {
    rank: 1,
    itemManagementNumber: mno,
    salesYen: 1000,
    unitsSold: 1,
    orderCount: 1,
    averageUnitPriceYen: 1000,
    shopCount: 1,
    shopBreakdown: [{ shopName }],
  };
}

// One ranked board. GET /api/item-rankings nests three of these under `rankings`.
function rankingBoard(overallMno, shops) {
  return {
    shopCount: shops.length,
    overall: { itemCount: 1, items: [rankedItem(overallMno, shops[0].shopName)] },
    shops: shops.map(({ shopName, mno }) => ({
      shopName,
      itemCount: 1,
      items: [rankedItem(mno, shopName)],
    })),
  };
}

function ranking(overallMno, shops) {
  return {
    sourceDateJST: "2026-07-28",
    rankings: {
      sales: rankingBoard(overallMno, shops),
      units: rankingBoard(overallMno, shops),
      orderCount: rankingBoard(overallMno, shops),
    },
  };
}

describe("widgets/uorakutensales/component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to the overall ranking when the selected shop disappears after refresh", () => {
    let rankingData = ranking("overall-before", [{ shopName: "shop-a", mno: "shop-a-item" }]);
    useWidgetAPI.mockImplementation((_widget, endpoint) => {
      if (endpoint === "sales") return { data: sales, error: undefined, mutate: vi.fn() };
      if (endpoint === "ranking") return { data: rankingData, error: undefined, mutate: vi.fn() };
      return { data: undefined, error: undefined, mutate: vi.fn() };
    });

    const { rerender } = renderWithProviders(<Component service={service} />, {
      settings: { hideErrors: false },
    });

    fireEvent.click(screen.getByRole("button", { name: "shop-a" }));
    expect(screen.getByText("shop-a-item")).toBeInTheDocument();

    rankingData = ranking("overall-after", [{ shopName: "shop-b", mno: "shop-b-item" }]);
    rerender(
      <SettingsContext.Provider value={{ settings: { hideErrors: false }, setSettings: () => {} }}>
        <Component service={service} />
      </SettingsContext.Provider>,
    );

    expect(screen.getByText("overall-after")).toBeInTheDocument();
    expect(screen.queryByText("shop-a-item")).not.toBeInTheDocument();
  });

  it("refreshes the ranking together with the sales snapshots", () => {
    const mutateSales = vi.fn();
    const mutateHistory = vi.fn();
    const mutateRanking = vi.fn();
    const rankingData = ranking("overall-item", [{ shopName: "shop-a", mno: "shop-a-item" }]);
    useWidgetAPI.mockImplementation((_widget, endpoint) => {
      if (endpoint === "sales") return { data: sales, error: undefined, mutate: mutateSales };
      if (endpoint === "history") return { data: undefined, error: undefined, mutate: mutateHistory };
      if (endpoint === "ranking") return { data: rankingData, error: undefined, mutate: mutateRanking };
      return { data: undefined, error: undefined, mutate: vi.fn() };
    });

    renderWithProviders(<Component service={service} />, {
      settings: { hideErrors: false },
    });

    fireEvent.click(screen.getByRole("button", { name: "uorakutensales.refresh" }));

    expect(mutateSales).toHaveBeenCalledOnce();
    expect(mutateHistory).toHaveBeenCalledOnce();
    expect(mutateRanking).toHaveBeenCalledOnce();
  });
});
