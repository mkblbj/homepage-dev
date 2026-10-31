// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { buildTodayView } from "./daily-check-model.mjs";
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

// today plus a two-day history, with the company days the server adds up
function weekModel() {
  const day = (date, salesYen) => ({ date, salesYen, orderCount: 2, unitsSold: 2, conversionRate: null });
  const days = [day("2026-10-28", 1000), day("2026-10-29", 3000)];
  return buildModel(
    { generatedAtJST: "2026-10-30 10:20 JST", totals: { salesYen: 500, orderCount: 5, unitsSold: 5 }, shops: [] },
    {
      range: { startDate: "2026-10-28", endDate: "2026-10-29", days: 2 },
      totals: { salesYen: 4000, orderCount: 4, unitsSold: 4, conversionRate: null },
      daily: days,
      shops: [{ shopName: "A", includedInTotals: true, totals: {}, daily: days }],
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
    render(<TodayCard view={buildTodayView(model)} metric="orders" shopColors={{}} t={tc} />);

    expect(screen.getByText(/1\/2店舗/)).toBeInTheDocument();
  });

  // since 2026-10-30 the week comes from the order API too: one yen basis
  it("the today card sets today's yen against the week, as it does the counts", () => {
    for (const metric of ["sales", "orders"]) {
      const { unmount } = render(
        <TodayCard view={buildTodayView(weekModel())} metric={metric} shopColors={{}} t={t} />,
      );

      expect(screen.getByText(`${NS}.todayNoTimeCorrection`), metric).toBeInTheDocument();
      expect(screen.getByText(`${NS}.lastDaysAndToday`), metric).toBeInTheDocument();
      // ¥500 today against a ¥2,000 daily average
      if (metric === "sales") expect(screen.getByText("25%")).toBeInTheDocument();
      unmount();
    }
  });

  it("the shop table sets each shop's yen today against its 7-day average", () => {
    render(<ShopTable table={table} metric="sales" shopColors={{}} t={t} />);

    expect(screen.getByRole("columnheader", { name: `${NS}.perDayAvg（${NS}.manYen）` })).toBeInTheDocument();
    // ¥1,200 today against ¥3,000 a day
    const row = screen.getByRole("row", { name: /^A/ });
    expect(within(row).getByText("40%")).toBeInTheDocument();
  });

  it("the shop table shows its warnings and an unknown company total as dashes", () => {
    const unknownTotal = { ...table, total: { ...table.total, today: null } };
    render(<ShopTable table={unknownTotal} metric="orders" shopColors={{}} notes={["history stopped"]} t={t} />);

    expect(screen.getByRole("note")).toHaveTextContent("history stopped");
    const total = screen.getByRole("row", { name: new RegExp(`^${NS}.total`) });
    expect(within(total).queryByText(`0${NS}.ordersUnit`)).not.toBeInTheDocument();
  });

  it("history notes say when the week stopped updating", () => {
    const tn = (key, opts) => `${key}:${opts?.md ?? ""}`;
    expect(historyNotes(null, tn)).toEqual([]);
    expect(historyNotes({ behind: false, endMd: "10/29" }, tn)).toEqual([]);
    expect(historyNotes({ behind: true, endMd: "10/27" }, tn)).toEqual([`${NS}.historyStopped:10/27`]);
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

  // platform labels and footer names, as the locale renders them
  const tl = (key, opts) =>
    ({
      [`${NS}.platformRakuten`]: "楽天",
      [`${NS}.platformAmazon`]: "Amazon",
      [`${NS}.platformTotal`]: `${opts?.platform} 計`,
      [`${NS}.companyTotal`]: "全社 計",
    })[key] ?? t(key, opts);

  const amazonShop = shopRow("uoworld", { key: "amazon:acc:JP", platform: "amazon", cvr: null, visits: null });
  const multiTable = {
    rows: [shopRow("A", { platform: "rakuten" }), amazonShop],
    idle: [],
    totals: [
      { ...shopRow(null), key: "total:rakuten", platform: "rakuten", today: { sales: 4800, units: 56, orders: 48 } },
      { ...shopRow(null), key: "total:amazon", platform: "amazon", visits: null },
      { ...shopRow(null), key: "total:company", platform: null, today: { sales: null, units: 70, orders: 60 } },
    ],
  };
  multiTable.total = multiTable.totals[2];

  it("each shop and each platform total carries its platform's mark; the company total does not", () => {
    render(<ShopTable table={multiTable} metric="orders" shopColors={{}} t={tl} />);

    const markOf = (row) => row.querySelector("[data-platform]")?.dataset.platform ?? null;
    expect(markOf(screen.getByRole("row", { name: /^uoworld/ }))).toBe("amazon");
    expect(markOf(screen.getByRole("row", { name: /^A(?!mazon)/ }))).toBe("rakuten");
    expect(markOf(screen.getByRole("row", { name: /^楽天 計/ }))).toBe("rakuten");
    expect(markOf(screen.getByRole("row", { name: /^Amazon 計/ }))).toBe("amazon");
    expect(markOf(screen.getByRole("row", { name: /^全社 計/ }))).toBe(null);
    // the mark is drawn, the platform's name is what a screen reader hears
    expect(screen.getByRole("row", { name: /^uoworld/ }).querySelector("[data-platform]")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("a shop row that names no platform draws no mark", () => {
    render(<ShopTable table={table} metric="orders" shopColors={{}} t={t} />);
    expect(screen.getByRole("row", { name: /^A/ }).querySelector("[data-platform]")).toBeNull();
  });

  it("the shop table names Amazon shops and closes with a line per platform and the company", () => {
    render(<ShopTable table={multiTable} metric="orders" shopColors={{}} t={tl} />);

    expect(within(screen.getByRole("row", { name: /^uoworld/ })).getByText("Amazon")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /^A(?!mazon)/ })).queryByText("Amazon")).not.toBeInTheDocument();
    expect(screen.getByRole("row", { name: /^楽天 計/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /^Amazon 計/ })).toBeInTheDocument();
    // a count's share is of the company: 12 of 60
    const company = screen.getByRole("row", { name: /^全社 計/ });
    expect(within(company).getByText("100.0%")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /^uoworld/ })).getByText("20.0%")).toBeInTheDocument();
  });

  it("in 売上 each shop's share is of its own platform, and the company has no yen", () => {
    render(<ShopTable table={multiTable} metric="sales" shopColors={{}} t={tl} />);

    // 楽天 A: ¥1,200 of 楽天's ¥4,800; uoworld: ¥1,200 of Amazon's ¥1,200
    expect(within(screen.getByRole("row", { name: /^A(?!mazon)/ })).getByText("25.0%")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /^uoworld/ })).getByText("100.0%")).toBeInTheDocument();
    // the company's share cell (after 今日) is a dash
    const company = screen.getByRole("row", { name: /^全社 計/ });
    expect(within(company).getAllByRole("cell")[1]).toHaveTextContent(/^—$/);
  });

  it("every shop's 売上 stands against its own week, on either platform", () => {
    render(<ShopTable table={multiTable} metric="sales" shopColors={{}} t={tl} />);

    // ¥1,200 today against ¥3,000 a day
    expect(within(screen.getByRole("row", { name: /^uoworld/ })).getByText("40%")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /^A(?!mazon)/ })).getByText("40%")).toBeInTheDocument();
  });

  it("a shop on another platform takes no 楽天 logo, even under the same name", () => {
    const table3 = {
      rows: [
        shopRow("3911", { key: "rakuten:3911", platform: "rakuten" }),
        shopRow("3911", { key: "aupay:1", platform: "aupay", cvr: null, visits: null }),
      ],
      idle: [],
      total: shopRow(null),
    };
    const { container } = render(
      <ShopTable
        table={table3}
        metric="orders"
        shopColors={{}}
        logoByName={new Map([["3911", "https://example.test/3911.png"]])}
        t={tl}
      />,
    );

    expect(container.querySelectorAll('img[src="https://example.test/3911.png"]')).toHaveLength(1);
  });

  it("the shop table says which platform the company's comparisons leave out", () => {
    const tn = (key, opts) =>
      key === `${NS}.companyExcludes`
        ? `excludes ${opts.names}`
        : key === `${NS}.platformAupay`
          ? "au PAY"
          : tl(key, opts);
    render(<ShopTable table={{ ...multiTable, compareExcludes: ["aupay"] }} metric="orders" shopColors={{}} t={tn} />);

    expect(screen.getByText("excludes au PAY")).toBeInTheDocument();
  });

  it("the company's 7-day ratio sets only the platforms with a week against it", () => {
    const company = {
      ...shopRow(null),
      key: "total:company",
      platform: null,
      today: { sales: null, units: 70, orders: 50 },
      weekToday: { sales: null, units: 60, orders: 25 },
      avg: { sales: null, units: 30, orders: 25 },
    };
    render(
      <ShopTable
        table={{ rows: [], idle: [], total: company, totals: [company] }}
        metric="orders"
        shopColors={{}}
        t={t}
      />,
    );

    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  const multiView = {
    multi: true,
    platforms: [
      { platform: "rakuten", values: { sales: 324785, units: 276, orders: 261 }, aov: 1244, time: "13:40" },
      { platform: "amazon", values: { sales: 7897, units: 9, orders: 6 }, aov: 1316, time: "13:55" },
    ],
    values: { sales: null, units: 285, orders: 267 },
    avg: null,
    days: [],
    salesDays: [],
    coverage: { covered: 9, total: 10 },
    time: "13:40",
    mix: [],
  };

  it("the today card adds counts across platforms into one figure", () => {
    render(<TodayCard view={multiView} metric="orders" shopColors={{}} t={tl} />);

    expect(screen.getByText(`267${NS}.ordersUnit`)).toBeInTheDocument();
    // each platform keeps a line with its own yen
    expect(screen.getByText("楽天")).toBeInTheDocument();
    expect(screen.getByText(/¥7897/)).toBeInTheDocument();
    expect(screen.queryByText(`${NS}.salesNotSummed`)).not.toBeInTheDocument();
  });

  it("the today card shows each platform's 売上 instead of one total", () => {
    render(<TodayCard view={multiView} metric="sales" shopColors={{}} t={tl} />);

    expect(screen.getByText("¥324785")).toBeInTheDocument();
    expect(screen.getByText("¥7897")).toBeInTheDocument();
    expect(screen.getByText(`${NS}.salesNotSummed`)).toBeInTheDocument();
  });

  it("the today card says which platform stays out of the week", () => {
    const tn = (key, opts) =>
      key === `${NS}.weekExcludes`
        ? `week excludes ${opts.names}`
        : key === `${NS}.platformAupay`
          ? "au PAY"
          : tl(key, opts);
    const view = {
      ...multiView,
      values: { sales: null, units: 285, orders: 300 },
      weekValues: { sales: null, units: 285, orders: 150 },
      avg: { sales: null, units: 300, orders: 300 },
      weekExcludes: ["aupay"],
    };
    render(<TodayCard view={view} metric="orders" shopColors={{}} t={tn} />);

    expect(screen.getByText(`300${NS}.ordersUnit`)).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("week excludes au PAY")).toBeInTheDocument();
  });

  it("the month card lists each platform's 売上 when the company has none", () => {
    const metric = { current: 900, previous: 1000, pace: 30, prevPace: 32, paceDeltaPct: -6, vsPrevPct: 90 };
    const monthly = {
      multi: true,
      current: { month: "2026-10", completedDays: 29, hasLiveDay: true, progressPct: 93, coverage: null },
      metrics: { sales: null, units: metric, orders: metric },
      platforms: [
        { platform: "rakuten", metrics: { sales: { ...metric, current: 26333000 } } },
        { platform: "amazon", metrics: { sales: { ...metric, current: 472523, paceDeltaPct: 12 } } },
      ],
    };
    render(<MonthCard monthly={monthly} metric="sales" t={tl} />);

    expect(screen.getByText("楽天")).toBeInTheDocument();
    expect(screen.getByText("Amazon")).toBeInTheDocument();
    expect(screen.getByText("+12.0%")).toBeInTheDocument();
    expect(screen.getByText(`${NS}.salesNotSummed`)).toBeInTheDocument();
  });

  it("the today card shows no 7-day ratio without history", () => {
    const model = buildModel(
      { generatedAtJST: "2026-10-25 10:20 JST", totals: { salesYen: 500, orderCount: 5, unitsSold: 5 }, shops: [] },
      null,
    );
    render(<TodayCard view={buildTodayView(model)} metric="sales" shopColors={{}} t={t} />);

    expect(screen.getByText("¥500")).toBeInTheDocument();
    expect(screen.queryByText(`${NS}.todayNoTimeCorrection`)).not.toBeInTheDocument();
  });
});
