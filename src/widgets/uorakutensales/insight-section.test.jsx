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
