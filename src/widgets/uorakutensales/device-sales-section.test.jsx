// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  COMPAT_LONG,
  dailyDeviceSales,
  deviceTypes,
  monthlyDeviceSales,
  slowingDeviceSales,
} from "./device-sales.fixtures.mjs";
import { buildDeviceSales } from "./device-sales-model.mjs";
import DeviceSalesSection from "./device-sales-section";

const SE_NAME = "iPhone SE（第2代） / iPhone SE（第3代）";
const U = "uorakutensales.unitsShort";

// echoes the key and its params, so an assertion can see what reached the copy
function t(key, opts) {
  if (key === "common.number") return String(opts?.value ?? "");
  return opts ? `${key} ${Object.values(opts).join("/")}` : key;
}

function renderBoard(daily = dailyDeviceSales(), monthly = monthlyDeviceSales()) {
  return render(<DeviceSalesSection devices={buildDeviceSales(daily, monthly)} cardCls="" t={t} />);
}

// jsdom loads no CSS, so every column is in the DOM; read each one on its own
const column = (type) => within(screen.getByTestId(`device-column-${type}`));
const models = (type) =>
  column(type)
    .queryAllByTestId("device-model")
    .map((el) => el.textContent);
const click = (name, role = "button") => fireEvent.click(screen.getByRole(role, { name }));
const shopSelect = () => screen.getByRole("combobox", { name: /uorakutensales\.shopLabel/ });

describe("widgets/uorakutensales/device-sales-section", () => {
  it("opens on today's best sellers by units, all three categories at once", () => {
    renderBoard();

    expect(models("case")).toEqual(["iPhone 17", "OPPO Reno13 A", SE_NAME]);
    expect(models("film")).toEqual(["AQUOS wish4"]);
    expect(column("case_film_set").getByText("uorakutensales.noData")).toBeInTheDocument();
    const se = column("case").getAllByTestId("device-row")[2];
    expect(within(se).getByText("uorakutensales.compatBadge")).toBeInTheDocument();
    expect(within(se).getByTitle(SE_NAME)).toBeInTheDocument();
  });

  it("reads the same ranking from the bottom for 少ない順, keeping each rank", () => {
    renderBoard();

    click("uorakutensales.viewLeast");

    expect(models("case")).toEqual([SE_NAME, "OPPO Reno13 A", "iPhone 17"]);
    expect(within(column("case").getAllByTestId("device-row")[0]).getByText("3")).toBeInTheDocument();
  });

  it("re-ranks by sales and lights the sales column", () => {
    renderBoard();

    click("uorakutensales.sortSales");

    expect(models("case")).toEqual(["OPPO Reno13 A", "iPhone 17", SE_NAME]);
    expect(screen.getByRole("button", { name: "uorakutensales.sortSales" })).toHaveAttribute("aria-pressed", "true");
  });

  it("sums the three categories in the active metric, with each one's share", () => {
    renderBoard();

    expect(screen.getByTestId("device-total")).toHaveTextContent(`48${U}`);
    expect(screen.getByText("33.3%")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "uorakutensales.typeFilm" })).toHaveTextContent(`32${U} · 67%`);
  });

  it("shows one category at a time on a narrow board, picked from the tabs", () => {
    renderBoard();

    expect(screen.getByTestId("device-column-case")).toHaveClass("flex");
    expect(screen.getByTestId("device-column-film")).toHaveClass("hidden");

    click("uorakutensales.typeFilm", "tab");

    expect(screen.getByRole("tab", { name: "uorakutensales.typeFilm" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("device-column-film")).toHaveClass("flex");
    expect(screen.getByTestId("device-column-case")).toHaveClass("hidden");
  });

  it("drops back to all shops when the chosen shop has no board in the next period", () => {
    renderBoard();

    fireEvent.change(shopSelect(), { target: { value: "松武" } });
    expect(models("case")).toEqual([SE_NAME]);

    click("uorakutensales.lastMonth");
    expect(shopSelect()).toHaveValue("__all__");
    expect(screen.queryByRole("option", { name: "松武" })).not.toBeInTheDocument();
    expect(models("case")).toEqual(["Galaxy A25", "Google Pixel 10a", "iPhone 17"]);
  });

  it("says today is still landing instead of drawing zeros, and keeps the months usable", () => {
    const daily = dailyDeviceSales();
    Object.assign(daily, { ok: false, status: "not_ready", totals: null, types: null });
    daily.shops = daily.shops.map((s) => ({ ...s, totals: null, types: null }));
    renderBoard(daily);

    expect(screen.getByText("uorakutensales.deviceNotReady")).toBeInTheDocument();
    expect(screen.queryAllByTestId("device-model")).toHaveLength(0);

    click("uorakutensales.thisMonth");
    expect(models("case")[0]).toBe("Google Pixel 10a");
  });

  it("stays on units while sales and orders are still being filled in", () => {
    const daily = dailyDeviceSales();
    const board = daily.types.case;
    Object.assign(board, { metricsReady: false, salesYen: null, orderCount: null });
    board.ranks = board.ranks.map((r) => ({ ...r, salesYen: null, orderCount: null }));
    renderBoard(daily);

    expect(screen.getByRole("button", { name: "uorakutensales.sortSales" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "uorakutensales.sortOrders" })).toBeDisabled();
    expect(screen.getByText("uorakutensales.deviceMetricsPending")).toBeInTheDocument();
    expect(within(column("case").getAllByTestId("device-row")[0]).getAllByText("—").length).toBeGreaterThan(0);
  });

  it("names what a partial board leaves out", () => {
    renderBoard();

    expect(screen.getByText("uorakutensales.shopCoverage 2/3")).toHaveAttribute(
      "title",
      "uorakutensales.missingShops kurumu",
    );
    expect(screen.getByText("uorakutensales.staleShops 1")).toHaveAttribute("title", "松武");
    expect(screen.queryByRole("option", { name: "kurumu" })).not.toBeInTheDocument();
    expect(screen.getByText("10/7（水） · uorakutensales.asOf 16:58")).toBeInTheDocument();
  });

  it("folds a long combination to its first model and opens the full list on demand", () => {
    const daily = dailyDeviceSales();
    daily.types = deviceTypes([
      ["iPhone 17", 10, 11000, 7],
      [COMPAT_LONG, 2, 1936, 2, "compatibility"],
    ]);
    renderBoard(daily);

    expect(models("case")).toEqual(["iPhone 17", "BASIO active 3"]);
    const toggle = column("case").getByRole("button", { name: "uorakutensales.moreModels 6" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(
      column("case").getByText(
        "BASIO active 3 / Google Pixel 9 Pro / Google Pixel 9a / iPhone 16 e / Libero 5G IV / Motorola g24 / らくらくスマートフォン F-53E",
      ),
    ).toBeInTheDocument();
  });

  it("flags a bulk buy, many pieces in few orders", () => {
    const daily = dailyDeviceSales();
    daily.types.film.ranks[0].orderCount = 2;
    renderBoard(daily);

    expect(column("film").getAllByText("×16.0").length).toBeGreaterThan(0);
  });

  it("reveals a long column in steps", () => {
    const daily = dailyDeviceSales();
    daily.types = deviceTypes(Array.from({ length: 12 }, (_, i) => [`Model ${i + 1}`, 20 - i, 1000, 1]));
    renderBoard(daily);

    expect(models("case")).toHaveLength(10);
    fireEvent.click(column("case").getByRole("button", { name: "uorakutensales.showMore 2" }));
    expect(models("case")).toHaveLength(12);
    fireEvent.click(column("case").getByRole("button", { name: "uorakutensales.showLess" }));
    expect(models("case")).toHaveLength(10);
  });

  it("switches to 失速 on this month and ranks models by the pace they lost", () => {
    const { daily, monthly } = slowingDeviceSales();
    renderBoard(daily, monthly);

    click("uorakutensales.viewSlowing");

    expect(screen.getByRole("button", { name: "uorakutensales.thisMonth" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "uorakutensales.periodToday" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "uorakutensales.lastMonth" })).toBeDisabled();
    expect(models("case")).toEqual(["arrows We3", "Galaxy A25", "DIGNO BX3"]);
    expect(
      within(column("case").getAllByTestId("device-row")[0]).getByText(`−7.0${U}uorakutensales.perDay`),
    ).toBeInTheDocument();
  });

  it("says why 失速 cannot compare yet", () => {
    const { daily, monthly } = slowingDeviceSales();
    daily.sourceDateJST = "2026-10-01";
    monthly.currentMonth.endDate = "2026-10-01";
    renderBoard(daily, monthly);

    click("uorakutensales.viewSlowing");

    expect(screen.getByText("uorakutensales.slowingMonthStart")).toBeInTheDocument();
    expect(screen.queryAllByTestId("device-row")).toHaveLength(0);
  });
});
