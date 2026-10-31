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
    render(<ShopVisitsTable performance={performance} shops={[{ name: "A" }, { name: "B" }]} shopColors={{}} t={t} />);

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
        shops={[{ name: "A" }, { key: "amazon:acc:JP", name: "uoworld", platform: "amazon" }]}
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

  it("an au PAY shop named like a 楽天 shop keeps its own dashes and takes no logo", () => {
    const tl = (key, opts) => ({ "uorakutensales.platformAupay": "au PAY" })[key] ?? t(key, opts);
    const { container } = render(
      <ShopVisitsTable
        performance={performance}
        shops={[
          { key: "rakuten:A", name: "A", platform: "rakuten" },
          { key: "aupay:1", name: "A", platform: "aupay" },
        ]}
        logoByName={new Map([["A", "https://example.test/a.png"]])}
        shopColors={{}}
        t={tl}
      />,
    );

    const rows = screen.getAllByRole("row", { name: /^A/ });
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("200")).toBeInTheDocument();
    expect(within(rows[1]).getAllByText("—")).toHaveLength(5);
    // the logo is the 楽天 shop's alone
    expect(container.querySelectorAll('img[src="https://example.test/a.png"]')).toHaveLength(1);
  });

  it("each shop's logo sits beside its name", () => {
    const { container } = render(
      <ShopVisitsTable
        performance={performance}
        shops={[{ name: "A" }]}
        shopColors={{}}
        logoByName={new Map([["A", "https://example.test/a.png"]])}
        t={t}
      />,
    );

    expect(container.querySelector('img[src="https://example.test/a.png"]')).toBeInTheDocument();
  });
});
