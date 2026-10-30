// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  barLabel,
  historyNotes,
  MetricSwitch,
  MonthCard,
  ShopTable,
  TodayCard,
  valueText,
  VisitCard,
} from "./daily-check-section";
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

// today plus a two-day history, both shops on the same window
function weekModel() {
  const day = (date, salesYen) => ({ date, salesYen, orderCount: 2, unitsSold: 2 });
  return buildModel(
    { generatedAtJST: "2026-10-30 10:20 JST", totals: { salesYen: 500, orderCount: 5, unitsSold: 5 }, shops: [] },
    {
      range: { dates: ["2026-10-28", "2026-10-29"] },
      totals: { salesYen: 4000, orderCount: 4, unitsSold: 4 },
      shops: [{ shopName: "A", totals: {}, daily: [day("2026-10-28", 1000), day("2026-10-29", 3000)] }],
    },
  );
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

  it("units sit in the headers, so the cells carry bare figures", () => {
    render(<ShopTable table={table} metric="orders" shopColors={{}} t={t} />);

    expect(screen.getByRole("columnheader", { name: `${NS}.perDayAvg（${NS}.ordersUnit）` })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: `${NS}.cumulative（${NS}.ordersUnit）` })).toBeInTheDocument();
    const row = screen.getByRole("row", { name: /^A/ });
    // avg 25 a day, 800 this month, 700 visits — no unit repeated per cell
    expect(within(row).getByText("25")).toBeInTheDocument();
    expect(within(row).getByText("800")).toBeInTheDocument();
    expect(within(row).getByText("700")).toBeInTheDocument();
    expect(within(row).queryByText(`25${NS}.ordersUnit`)).not.toBeInTheDocument();
  });

  it("yen columns read in 万円 from the header", () => {
    render(<ShopTable table={table} metric="sales" shopColors={{}} t={t} />);

    expect(screen.getByRole("columnheader", { name: `${NS}.cumulative（${NS}.manYen）` })).toBeInTheDocument();
    const row = screen.getByRole("row", { name: /^A/ });
    // ¥3,000 a day and ¥90,000 this month
    expect(within(row).getByText("0.3")).toBeInTheDocument();
    expect(within(row).getByText("9.0")).toBeInTheDocument();
  });

  it("each column group starts with a divider the whole way down", () => {
    render(<ShopTable table={table} metric="sales" shopColors={{}} t={t} />);

    for (const row of screen.getAllByRole("row").slice(1)) {
      const starts = [...row.querySelectorAll("[data-group-start]")].map((c) => c.dataset.groupStart);
      expect(starts, row.textContent).toEqual(["today", "week", "month", "visits"]);
    }
  });

  it("each group's colour line underlines its name", () => {
    render(<ShopTable table={table} metric="sales" shopColors={{}} t={t} />);

    for (const header of screen.getAllByRole("columnheader").filter((h) => h.getAttribute("scope") === "colgroup")) {
      const label = within(header).getByText(/uorakutensales\.col/);
      const line = header.querySelector("[data-group-line]");
      expect(label.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING, header.textContent).toBeTruthy();
    }
  });

  it("idle shops stay folded until asked", () => {
    render(<ShopTable table={table} metric="sales" shopColors={{}} t={t} />);

    expect(screen.queryByRole("row", { name: /^Z/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`${NS}.idleShow`) }));
    expect(screen.getByRole("row", { name: /^Z/ })).toBeInTheDocument();
  });

  it("unknown visits read as a dash, never zero", () => {
    render(<ShopTable table={table} metric="orders" shopColors={{}} t={t} />);

    const row = screen.getByRole("row", { name: /^B/ });
    expect(within(row).getAllByText("—")).toHaveLength(2);
    expect(within(row).queryByText("0")).not.toBeInTheDocument();
  });

  it("a shop missing from the live snapshot reads dashes, not ¥0", () => {
    const missing = { ...table, rows: [...table.rows, shopRow("C", { today: null, avg: null, cvr: null })] };
    render(<ShopTable table={missing} metric="sales" shopColors={{}} t={t} />);

    const row = screen.getByRole("row", { name: /^C/ });
    expect(within(row).queryByText("¥0")).not.toBeInTheDocument();
    expect(within(row).getAllByText("—").length).toBeGreaterThanOrEqual(4);
  });

  it("each shop's logo sits beside its name", () => {
    const { container } = render(
      <ShopTable
        table={table}
        metric="sales"
        shopColors={{}}
        logoByName={new Map([["A", "https://example.test/a.png"]])}
        t={t}
      />,
    );

    expect(container.querySelector('img[src="https://example.test/a.png"]')).toBeInTheDocument();
    // no logo → the shop's initial instead of an empty gap
    expect(
      within(screen.getByRole("row", { name: /^B/ })).getByText("B", { selector: "[aria-hidden]" }),
    ).toBeInTheDocument();
  });

  it("bar labels keep a small day readable", () => {
    expect(barLabel("sales", 1033368, t)).toBe(`103${NS}.manUnit`);
    expect(barLabel("sales", 3000, t)).toBe(`0.3${NS}.manUnit`);
    expect(barLabel("orders", 920, t)).toBe("920");
  });

  it("the month card says nothing without the month board", () => {
    const { container } = render(<MonthCard monthly={null} metric="sales" t={t} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("the month card names the shop coverage only when shops are missing", () => {
    const metric = { current: 900, previous: 1000, pace: 30, prevPace: 32, paceDeltaPct: -6, vsPrevPct: 90 };
    const monthly = (coverage) => ({
      current: { month: "2026-10", completedDays: 29, hasLiveDay: true, progressPct: 93, coverage },
      metrics: { sales: metric, units: metric, orders: metric },
    });
    const tc = (key, opts) => (key === `${NS}.shopCoverage` ? `${opts.covered}/${opts.total}店舗` : t(key, opts));
    const { rerender } = render(<MonthCard monthly={monthly({ covered: 8, total: 9 })} metric="orders" t={tc} />);
    expect(screen.getByText(/· 8\/9店舗/)).toBeInTheDocument();

    rerender(<MonthCard monthly={monthly({ covered: 9, total: 9 })} metric="orders" t={tc} />);
    expect(screen.queryByText(/店舗/)).not.toBeInTheDocument();
  });

  it("the visit card says nothing without the performance snapshot", () => {
    const { container } = render(<VisitCard performance={null} t={t} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("whole yen and whole pieces, even for a daily average", () => {
    expect(valueText("sales", 752443.571, t)).toBe("¥752444");
    expect(valueText("units", 711.4, t)).toBe(`711${NS}.unitsShort`);
  });

  it("the today card names its shop coverage when a shop is missing", () => {
    const model = buildModel(
      {
        generatedAtJST: "2026-10-30 13:40:48 JST",
        sourceUpdatedAtJST: "2026-10-30 13:40:45 JST",
        shopCount: 2,
        updatedShopCount: 1,
        totals: { salesYen: 500, orderCount: 5, unitsSold: 5 },
        shops: [
          { shopName: "A", includedInTotals: true, salesYen: 500, orderCount: 5, unitsSold: 5 },
          { shopName: "K", includedInTotals: false, salesYen: null, orderCount: null, unitsSold: null },
        ],
      },
      null,
    );
    const tc = (key, opts) => (key === `${NS}.shopCoverage` ? `${opts.covered}/${opts.total}店舗` : t(key, opts));
    render(<TodayCard model={model} metric="orders" shopColors={{}} t={tc} />);

    expect(screen.getByText(/1\/2店舗/)).toBeInTheDocument();
  });

  it("the today card does not set today's yen against the after-coupon week", () => {
    render(<TodayCard model={weekModel()} metric="sales" shopColors={{}} t={t} />);

    expect(screen.queryByText(`${NS}.todayNoTimeCorrection`)).not.toBeInTheDocument();
    expect(screen.getByText(`${NS}.salesBasisNote`)).toBeInTheDocument();
    // the bars show the week alone, labelled as after coupons, with no today bar
    expect(screen.getByText(`${NS}.lastDaysAfterCoupon`)).toBeInTheDocument();
    expect(screen.queryByText(`${NS}.todayLabel`, { selector: ".flex-1" })).not.toBeInTheDocument();
  });

  it("the today card still compares counts with the week", () => {
    render(<TodayCard model={weekModel()} metric="orders" shopColors={{}} t={t} />);

    expect(screen.getByText(`${NS}.todayNoTimeCorrection`)).toBeInTheDocument();
    expect(screen.getByText(`${NS}.lastDaysAndToday`)).toBeInTheDocument();
    expect(screen.queryByText(`${NS}.salesBasisNote`)).not.toBeInTheDocument();
  });

  it("the shop table shows no 7-day ratio for 売上 and marks the week's yen as after coupons", () => {
    render(<ShopTable table={table} metric="sales" shopColors={{}} t={t} />);

    expect(
      screen.getByRole("columnheader", { name: `${NS}.perDayAvg（${NS}.manYen）${NS}.afterCouponTag` }),
    ).toBeInTheDocument();
    const row = screen.getByRole("row", { name: /^A/ });
    expect(within(row).queryByText(/^\d+%$/)).not.toBeInTheDocument();
  });

  it("the shop table shows its warnings and an unknown company total as dashes", () => {
    const unknownTotal = { ...table, total: { ...table.total, today: null } };
    render(<ShopTable table={unknownTotal} metric="orders" shopColors={{}} notes={["history stopped"]} t={t} />);

    expect(screen.getByRole("note")).toHaveTextContent("history stopped");
    const total = screen.getByRole("row", { name: new RegExp(`^${NS}.total`) });
    expect(within(total).queryByText(`0${NS}.ordersUnit`)).not.toBeInTheDocument();
  });

  it("history notes say when the week stopped and which shops lag behind", () => {
    const tn = (key, opts) => `${key}:${opts?.names ?? ""}:${opts?.md ?? ""}`;
    expect(historyNotes(null, tn)).toEqual([]);
    expect(historyNotes({ behind: false, lagging: [], endMd: "10/29" }, tn)).toEqual([]);
    expect(
      historyNotes({ behind: true, endMd: "10/27", lagging: ["0406", "松武"], laggingEndMd: "10/25" }, tn),
    ).toEqual([`${NS}.historyStopped::10/27`, `${NS}.historyLagging:0406・松武:10/25`]);
  });

  it("the visit card says the visits stopped updating instead of 確定値", () => {
    const performance = {
      visit: 22133,
      uu: 20966,
      expected: null,
      delta: null,
      sampleCount: 0,
      dataDateJST: "2026-10-27",
      sources: { traffic: { stale: true } },
    };
    const { rerender } = render(<VisitCard performance={performance} t={t} />);
    expect(screen.getByText(`${NS}.visitsStale`)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(`${NS}.confirmed`))).not.toBeInTheDocument();

    rerender(<VisitCard performance={{ ...performance, sources: { traffic: { stale: false } } }} t={t} />);
    expect(screen.queryByText(`${NS}.visitsStale`)).not.toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${NS}.confirmed`))).toBeInTheDocument();
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
