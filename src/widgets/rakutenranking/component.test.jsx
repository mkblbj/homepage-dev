// @vitest-environment jsdom

import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "test-utils/render-with-providers";

const { useSWR } = vi.hoisted(() => ({ useSWR: vi.fn() }));
vi.mock("swr", () => ({ default: useSWR }));

import Component from "./component";

function service() {
  return {
    widget: {
      type: "rakutenranking",
      service_group: "楽天ランキング",
      service_name: "楽天ランキング",
      signal: {
        enabled: true,
        realtimeTop: 50,
        dailyTop: 50,
        historyDays: 7,
        minRealtimeHits: 2,
        limit: 3,
      },
    },
  };
}

describe("widgets/rakutenranking/component signals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a prominent signal area above normal ranking content", () => {
    useSWR.mockImplementation((url) => {
      if (String(url).includes("endpoint=signals")) {
        return {
          data: {
            enabled: true,
            warmingUp: false,
            config: { realtimeTop: 50, dailyTop: 50 },
            signals: [
              {
                status: "daily_confirmed",
                label: "DAILY CONFIRMED",
                itemCode: "shop:hit",
                itemName: "Confirmed Hit Product",
                itemUrl: "https://item.rakuten.co.jp/shop/hit",
                imageUrl: "https://img.example.com/hit.jpg",
                itemPrice: 2980,
                shopName: "hit-shop",
                realtimeRank: 12,
                dailyRank: 44,
                realtimeHits: 2,
              },
            ],
          },
          error: undefined,
          mutate: vi.fn(),
        };
      }

      return {
        data: {
          lastBuildDate: "Wed, 20 May 2026 14:11:00 +0900",
          items: [
            {
              rank: 1,
              itemName: "Normal Ranking Item",
              itemUrl: "https://item.rakuten.co.jp/shop/normal",
              itemPrice: 1000,
              reviewAverage: 4.5,
              reviewCount: 10,
              shopName: "normal-shop",
            },
          ],
        },
        error: undefined,
        mutate: vi.fn(),
      };
    });

    const { container } = renderWithProviders(<Component service={service()} />, {
      settings: { hideErrors: false },
    });

    expect(container.textContent).toContain("急浮上");
    expect(container.textContent).toContain("1件");
    expect(screen.getByText("Confirmed Hit Product")).toBeInTheDocument();
    expect(container.textContent).toContain("日榜確認");
    expect(container.textContent).toContain("Normal Ranking Item");
  });

  it("does not reserve signal space when there are no signals after warmup", () => {
    useSWR.mockImplementation((url) => {
      if (String(url).includes("endpoint=signals")) {
        return {
          data: {
            enabled: true,
            warmingUp: false,
            config: { realtimeTop: 50, dailyTop: 50 },
            signals: [],
          },
          error: undefined,
          mutate: vi.fn(),
        };
      }

      return {
        data: {
          items: [],
        },
        error: undefined,
        mutate: vi.fn(),
      };
    });

    const { container } = renderWithProviders(<Component service={service()} />, {
      settings: { hideErrors: false },
    });

    expect(container.textContent).not.toContain("急浮上");
  });
});
