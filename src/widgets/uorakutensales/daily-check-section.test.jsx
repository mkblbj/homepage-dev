// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MetricSwitch, MonthCard, ShopTable, TodayCard, VisitCard } from "./daily-check-section";
import { buildModel } from "./sales-model.mjs";

// the test i18n mock returns keys as-is and numbers as plain strings
const t = (key, opts) =>
  key === "common.number"
    ? String(opts?.value ?? "")
    : Object.entries(opts || {}).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, String(v)), key);

const NS = "uorakutensales";

function shopRow(name, overrides = {}) {
  return {
    name,
    today: { sales: 1200, units: 14, orders: 12 },
    avg: { sales: 3000, units: 30, orders: 25 },
    cvr: 2.5,
    month: { sales: 90000, units: 900, orders: 800 },
    monthDelta: { sales: -12.5, units: -21, orders: 3 },
    visits: 700,
    visitDelta: -8.3,
    ...overrides,
  };
}

const table = {
  rows: [shopRow("A"), shopRow("B", { visits: null, visitDelta: null })],
  idle: [shopRow("Z", { today: { sales: 0, units: 0, orders: 0 }, month: { sales: 0, units: 0, orders: 0 } })],
  total: { ...shopRow(null), visits: 21654, visitDelta: -15.1 },
};

describe("widgets/uorakutensales/daily-check-section", () => {
  it("the metric switch marks the current metric and reports a new pick", () => {
    const onChange = vi.fn();
    render(<MetricSwitch metric="sales" onChange={onChange} t={t} />);

    expect(screen.getByRole("button", { name: `${NS}.sortSales` })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: `${NS}.sortOrders` }));
    expect(onChange).toHaveBeenCalledWith("orders");
  });

  it("the shop table leads each row with the picked metric", () => {
    render(<ShopTable table={table} metric="orders" shopColors={{}} t={t} />);

    const row = screen.getByRole("row", { name: /^A/ });
    expect(within(row).getByText(`12${NS}.ordersUnit`)).toBeInTheDocument();
  });

  it("colours a month delta only past twenty percent", () => {
    render(<ShopTable table={table} metric="units" shopColors={{}} t={t} />);

    const row = screen.getByRole("row", { name: /^A/ });
    expect(within(row).getByText("−21.0%")).toHaveAttribute("data-tone", "down");
    expect(within(row).getByText("−8.3%")).toHaveAttribute("data-tone", "flat");
  });

  it("idle shops stay folded until asked", () => {
    render(<ShopTable table={table} metric="sales" shopColors={{}} t={t} />);

    expect(screen.queryByRole("row", { name: /^Z/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`${NS}.idleShow`) }));
    expect(screen.getByRole("row", { name: /^Z/ })).toBeInTheDocument();
  });

  it("unknown visits read as a dash, never zero", () => {
    render(<ShopTable table={table} metric="sales" shopColors={{}} t={t} />);

    const row = screen.getByRole("row", { name: /^B/ });
    expect(within(row).getAllByText("—")).toHaveLength(2);
    expect(within(row).queryByText("0")).not.toBeInTheDocument();
  });

  it("the month card says nothing without the month board", () => {
    const { container } = render(<MonthCard monthly={null} metric="sales" t={t} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("the visit card says nothing without the performance snapshot", () => {
    const { container } = render(<VisitCard performance={null} t={t} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("the today card shows no 7-day ratio without history", () => {
    const model = buildModel(
      { generatedAtJST: "2026-10-25 10:20 JST", totals: { salesYen: 500, orderCount: 5, unitsSold: 5 }, shops: [] },
      null,
    );
    render(<TodayCard model={model} metric="sales" shopColors={{}} t={t} />);

    expect(screen.getByText("¥500")).toBeInTheDocument();
    expect(screen.queryByText(`${NS}.todayNoTimeCorrection`)).not.toBeInTheDocument();
  });
});
