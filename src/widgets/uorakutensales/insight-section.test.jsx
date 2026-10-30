// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { buildPerformanceModel } from "widgets/uoperformance/performance-model.mjs";

import { ShopVisitsTable } from "./insight-section";

const t = (key, opts) =>
  key === "common.number"
    ? String(opts?.value ?? "")
    : Object.entries(opts || {}).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, String(v)), key);

const performance = buildPerformanceModel({
  ok: true,
  traffic: { dataDateJST: "2026-10-24", visitCount: 300, sampleCount: 4 },
  shops: [
    { shopName: "A", traffic: { visitCount: 200, uniqueVisitorCount: 190, visitDeltaPercent: -5, sampleCount: 4 } },
  ],
});

describe("widgets/uorakutensales/insight-section", () => {
  it("a shop the snapshot misses still gets its row, read as dashes", () => {
    render(<ShopVisitsTable performance={performance} names={["A", "B"]} shopColors={{}} t={t} />);

    const row = screen.getByRole("row", { name: /^B/ });
    expect(within(row).getAllByText("—")).toHaveLength(5);
  });

  it("an Amazon shop sits in the visits table as dashes, and the total says it is 楽天's", () => {
    const tl = (key, opts) =>
      ({
        "uorakutensales.platformAmazon": "Amazon",
        "uorakutensales.platformTotal": `${opts?.platform} 計`,
      })[key] ?? t(key, opts);
    render(
      <ShopVisitsTable
        performance={performance}
        names={["A", "uoworld"]}
        platformByName={new Map([["uoworld", "amazon"]])}
        scope="楽天"
        shopColors={{}}
        t={tl}
      />,
    );

    const row = screen.getByRole("row", { name: /^uoworld/ });
    expect(within(row).getByText("Amazon")).toBeInTheDocument();
    expect(within(row).getAllByText("—")).toHaveLength(5);
    expect(screen.getByRole("row", { name: /^楽天 計/ })).toBeInTheDocument();
  });

  it("each shop's logo sits beside its name", () => {
    const { container } = render(
      <ShopVisitsTable
        performance={performance}
        names={["A"]}
        shopColors={{}}
        logoByName={new Map([["A", "https://example.test/a.png"]])}
        t={t}
      />,
    );

    expect(container.querySelector('img[src="https://example.test/a.png"]')).toBeInTheDocument();
  });
});
