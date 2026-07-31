// @vitest-environment jsdom

import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "test-utils/render-with-providers";

const { useWidgetAPI } = vi.hoisted(() => ({ useWidgetAPI: vi.fn() }));

vi.mock("utils/proxy/use-widget-api", () => ({
  default: useWidgetAPI,
}));

import Component from "./component";

const service = { widget: { type: "uoperformance", refreshInterval: 600000 } };

const okSource = {
  ok: true,
  stale: false,
  updatedAtJST: "2026-07-31 10:58 JST",
  lastAttemptAtJST: "2026-07-31 10:58 JST",
  dataDateJST: "2026-07-30",
  coveredShopCount: 2,
  lastError: null,
};

const emptyMix = {
  dataDateJST: null,
  period: { startDateJST: null, endDateJST: null },
  new: { salesYen: null, orderCount: null, salesSharePercent: null, orderSharePercent: null },
  repeat: { salesYen: null, orderCount: null, salesSharePercent: null, orderSharePercent: null },
  repeatBuckets: {
    repeat1: { salesYen: null, orderCount: null },
    repeat2: { salesYen: null, orderCount: null },
    repeat3: { salesYen: null, orderCount: null },
    repeatOver4: { salesYen: null, orderCount: null },
  },
  daily: [],
};

function snapshot(overrides = {}) {
  return {
    ok: true,
    partial: false,
    status: "normal",
    generatedAtJST: "2026-07-31 10:58 JST",
    shopCount: 2,
    traffic: {
      status: "normal",
      dataDateJST: "2026-07-30",
      visitCount: 15897,
      uniqueVisitorCount: 14737,
      expectedVisitCount: 19408.5,
      visitDeltaPercent: -18.1,
      sampleCount: 4,
      period: { startDateJST: "2026-07-24", endDateJST: "2026-07-30" },
      daily: [
        { dateJST: "2026-07-29", visitCount: 17438, uniqueVisitorCount: 16361 },
        { dateJST: "2026-07-30", visitCount: 15897, uniqueVisitorCount: 14737 },
      ],
    },
    customerMix: {
      dataDateJST: "2026-07-30",
      period: { startDateJST: "2026-07-24", endDateJST: "2026-07-30" },
      new: { salesYen: 4510302, orderCount: 4233, salesSharePercent: 85.4, orderSharePercent: 86.9 },
      repeat: { salesYen: 770171, orderCount: 640, salesSharePercent: 14.6, orderSharePercent: 13.1 },
      repeatBuckets: {
        repeat1: { salesYen: 569835, orderCount: 491 },
        repeat2: { salesYen: 116089, orderCount: 88 },
        repeat3: { salesYen: 42198, orderCount: 28 },
        repeatOver4: { salesYen: 42049, orderCount: 33 },
      },
      daily: [],
    },
    sources: { traffic: okSource, customerMix: okSource },
    shops: [
      {
        shopName: "3911",
        status: "attention",
        traffic: {
          status: "attention",
          dataDateJST: "2026-07-30",
          visitCount: 5122,
          uniqueVisitorCount: 4652,
          expectedVisitCount: 6784.5,
          visitDeltaPercent: -24.5,
          sampleCount: 4,
          period: {},
          daily: [],
        },
        customerMix: {
          new: { salesYen: 1591833, orderCount: 1673, salesSharePercent: 83.5, orderSharePercent: 85.8 },
          repeat: {},
          repeatBuckets: {},
          daily: [],
        },
        lastError: null,
      },
    ],
    lastError: null,
    ...overrides,
  };
}

function mockData(data, mutate = vi.fn(), logos = undefined) {
  useWidgetAPI.mockImplementation((_widget, endpoint) => {
    if (endpoint === "logos") return { data: logos, error: undefined, mutate: vi.fn() };

    return { data, error: undefined, mutate };
  });

  return mutate;
}

function render() {
  return renderWithProviders(<Component service={service} />, { settings: { hideErrors: false } });
}

describe("widgets/uoperformance/component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads the performance endpoint", () => {
    mockData(snapshot());
    render();

    expect(useWidgetAPI).toHaveBeenCalledWith(service.widget, "performance", { refreshInterval: 600000 });
  });

  it("shows the business day and the snapshot time as separate values", () => {
    mockData(snapshot());
    render();

    expect(screen.getAllByText("uoperformance.businessDay").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2026-07-30").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2026-07-31 10:58 JST").length).toBeGreaterThan(0);
  });

  it("renders the visit headline and the signed delta", () => {
    mockData(snapshot());
    render();

    // The visit count and the delta each appear twice: hero + company totals row.
    expect(screen.getAllByText("15897")).toHaveLength(2);
    expect(screen.getAllByText("-18.1%")).toHaveLength(2);
  });

  it("hides the median legend while the UU series is selected", () => {
    mockData(snapshot());
    render();

    expect(screen.getByText("uoperformance.medianLegend")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "UU" }));

    expect(screen.queryByText("uoperformance.medianLegend")).not.toBeInTheDocument();
  });

  it("reports too few samples instead of zero traffic or an outage", () => {
    mockData(
      snapshot({
        traffic: {
          ...snapshot().traffic,
          status: "unknown",
          expectedVisitCount: null,
          visitDeltaPercent: null,
          sampleCount: 2,
        },
      }),
    );
    render();

    expect(screen.getByText("uoperformance.sampleShort")).toBeInTheDocument();
    expect(screen.queryByText("uoperformance.sampleOk")).not.toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("renders an explicit empty state when the customer mix is unavailable", () => {
    mockData(snapshot({ customerMix: emptyMix }));
    render();

    expect(screen.getByText("uoperformance.mixUnavailable")).toBeInTheDocument();
  });

  it("names both mix shares inside the bar whatever the ratio", () => {
    mockData(
      snapshot({
        customerMix: {
          ...snapshot().customerMix,
          new: { salesYen: 9700, orderCount: 97, salesSharePercent: 97, orderSharePercent: 97 },
          repeat: { salesYen: 300, orderCount: 3, salesSharePercent: 3, orderSharePercent: 3 },
        },
      }),
    );
    render();

    // how much of the label survives is up to the bar's width, so the copy is always
    // rendered and left to ellipsize rather than dropped on a share threshold
    const narrow = screen.getByTitle("uoperformance.repeatCustomers 3.0%");
    expect(narrow.textContent).toBe("uoperformance.repeatCustomers3.0%");
    expect(narrow).toHaveClass("overflow-hidden");
    expect(narrow.firstChild).toHaveClass("truncate");

    expect(screen.getByTitle("uoperformance.newCustomers 97.0%").textContent).toBe("uoperformance.newCustomers97.0%");
  });

  it("compacts the narrow repeat segment without changing the wide segment", () => {
    mockData(snapshot());
    render();

    const wide = screen.getByTitle("uoperformance.newCustomers 85.4%");
    const narrow = screen.getByTitle("uoperformance.repeatCustomers 14.6%");

    expect(wide).toHaveClass("px-1.5");
    expect(wide).toHaveClass("text-center");
    expect(wide.firstChild).toHaveClass("text-[9.5px]");
    expect(wide.lastChild).toHaveClass("text-[12px]");
    expect(narrow).toHaveClass("px-0.5");
    expect(narrow).toHaveClass("text-center");
    expect(narrow.firstChild).toHaveClass("text-[8.5px]");
    expect(narrow.lastChild).toHaveClass("text-[10.5px]");
  });

  it("gives the composition one third of the wide customer-mix card", () => {
    mockData(snapshot());
    render();

    expect(screen.getByText("uoperformance.mixComposition").closest("section")).toHaveClass(
      "@2xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]",
    );
  });

  it("draws the per-shop delta bar left of centre for a shortfall", () => {
    mockData(snapshot());
    const { container } = render();

    // shop 3911 sits at -24.5% → the bar starts at 25.5% and spans 24.5%
    const bar = [...container.querySelectorAll("span")].find(
      (el) => el.style.left === "25.5%" && el.style.width === "24.5%",
    );

    expect(bar).toBeTruthy();
  });

  it("switches the customer mix between sales and orders", () => {
    mockData(snapshot());
    render();

    // Both figures stay on screen in either mode — the toggle swaps which one is primary —
    // so assert on the shares, which really are recomputed from the selected metric.
    expect(screen.getAllByText("85.4%").length).toBeGreaterThan(0);
    expect(screen.getByText("14.6%")).toBeInTheDocument();
    expect(screen.queryByText("86.9%")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "uoperformance.orders" }));

    expect(screen.getAllByText("86.9%").length).toBeGreaterThan(0);
    expect(screen.getByText("13.1%")).toBeInTheDocument();
    expect(screen.queryByText("85.4%")).not.toBeInTheDocument();
    // vitest.setup.js mocks t() to return the key verbatim, so the unit suffix is the raw key.
    expect(screen.getAllByText("4233uoperformance.ordersUnit").length).toBeGreaterThan(0);
  });

  it("always shows both source freshness chips", () => {
    mockData(snapshot());
    render();

    expect(screen.getByText("uoperformance.sourceTraffic")).toBeInTheDocument();
    expect(screen.getByText("uoperformance.sourceMix")).toBeInTheDocument();
  });

  it("shows a shop logo when one is available", () => {
    mockData(snapshot(), vi.fn(), { shops: [{ shopName: "3911", logoUrl: "https://cabinet.example/3911.jpg" }] });
    const { container } = render();

    expect([...container.querySelectorAll("img")].map((img) => img.getAttribute("src"))).toContain(
      "https://cabinet.example/3911.jpg",
    );
  });

  it("falls back to an initial when the logo snapshot is unavailable", () => {
    mockData(snapshot());
    const { container } = render();

    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
  });

  it("keeps the cross-shop de-duplication caveat reachable from the UU figure", () => {
    mockData(snapshot());
    render();

    const mark = screen.getByRole("note", { name: "uoperformance.visitsCaveat" });

    expect(mark).toHaveAttribute("title", "uoperformance.visitsCaveat");
    // it rides along with the UU line rather than taking a line of its own
    expect(mark.parentElement.textContent).toMatch(/^UU 14737 /);
  });

  it("drops the endpoint-naming footnote", () => {
    mockData(snapshot());
    const { container } = render();

    expect(screen.queryByText("uoperformance.footnote")).not.toBeInTheDocument();
    expect(container.textContent).not.toContain("/api/");
  });

  it("re-reads the snapshot when the refresh button is clicked", () => {
    const mutate = mockData(snapshot());
    render();

    fireEvent.click(screen.getByRole("button", { name: "uoperformance.refresh" }));

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

    expect(screen.queryByText("uoperformance.sevenDay")).not.toBeInTheDocument();
  });
});
