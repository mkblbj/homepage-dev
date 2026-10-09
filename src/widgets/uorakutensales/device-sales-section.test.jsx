// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { buildDeviceEvidence } from "./device-evidence-model.mjs";
import { buildMarketEvidence, buildMarketReference } from "./device-market-model.mjs";
import { buildDeviceSales } from "./device-sales-model.mjs";
import DeviceSalesSection from "./device-sales-section";
import {
  COMPAT_LONG,
  dailyDeviceSales,
  deviceTypes,
  marketDeviceModels,
  monthlyDeviceSales,
  ownDeviceEvidence,
  slowingDeviceSales,
  styledDeviceSales,
  styledSlowingDeviceSales,
} from "./device-sales.fixtures.mjs";
import { pickModelEvidence, shapeProxyResponse } from "./proxy-config.mjs";

const SE_NAME = "iPhone SE（第2代） / iPhone SE（第3代）";
const U = "uorakutensales.unitsShort";

// echoes the key and its params, so an assertion can see what reached the copy
function t(key, opts) {
  if (key === "common.number") return String(opts?.value ?? "");
  return opts ? `${key} ${Object.values(opts).join("/")}` : key;
}

// the board opens on this month; most cases read today's fixture, so they start there
function renderBoard(
  daily = dailyDeviceSales(),
  monthly = monthlyDeviceSales(),
  { period = "uorakutensales.periodToday" } = {},
) {
  const view = render(<DeviceSalesSection devices={buildDeviceSales(daily, monthly)} cardCls="" t={t} />);
  if (period) fireEvent.click(screen.getByRole("button", { name: period }));
  return view;
}

// jsdom loads no CSS, so every column is in the DOM; read each one on its own
const column = (type) => within(screen.getByTestId(`device-column-${type}`));
const models = (type) =>
  column(type)
    .queryAllByTestId("device-model")
    .map((el) => el.textContent);
const click = (name, role = "button") => fireEvent.click(screen.getByRole(role, { name }));
const shopSelect = () => screen.getByRole("combobox", { name: /uorakutensales\.shopLabel/ });
const styleSwitch = (type) =>
  within(screen.getByTestId(`device-column-${type}`)).queryByRole("group", { name: "uorakutensales.styleGroup" });
const chips = (type) =>
  within(styleSwitch(type))
    .getAllByRole("button")
    .map((b) => b.textContent);
const pickStyle = (type, name) => fireEvent.click(within(styleSwitch(type)).getByRole("button", { name }));
const marketBoard = ({
  daily = dailyDeviceSales(),
  monthly = monthlyDeviceSales(),
  market = buildMarketReference(marketDeviceModels()),
  evidence = null,
  onEvidence = () => {},
} = {}) => (
  <DeviceSalesSection
    devices={buildDeviceSales(daily, monthly)}
    market={market}
    evidence={evidence}
    onEvidence={onEvidence}
    cardCls=""
    t={t}
  />
);
function renderMarket(props) {
  const view = render(marketBoard(props));
  click("uorakutensales.viewMarket");
  return view;
}
// a model's 根拠 as the widget hands it down: picked by the proxy, read by the model
const evidenceFor = (model) => ({ model, ...buildMarketEvidence(pickModelEvidence(marketDeviceModels(), model)) });
// each market row: [model, its flag or null]
const marketList = () =>
  screen
    .queryAllByTestId("market-row")
    .map((row) => [
      within(row).getByTestId("market-model").textContent,
      within(row).queryAllByTestId("market-flag")[0]?.textContent ?? null,
    ]);
const ownBoard = ({
  daily = dailyDeviceSales(),
  monthly = monthlyDeviceSales(),
  deviceEvidence = null,
  onDeviceEvidence = () => {},
} = {}) => (
  <DeviceSalesSection
    devices={buildDeviceSales(daily, monthly)}
    deviceEvidence={deviceEvidence}
    onDeviceEvidence={onDeviceEvidence}
    cardCls=""
    t={t}
  />
);
// a row's 内訳 as the widget hands it down: the server's list, slimmed by the proxy
const ownEvidence = (key, payload = ownDeviceEvidence()) => ({
  key,
  ...buildDeviceEvidence(shapeProxyResponse("devicesEvidence", payload)),
});
const evidenceRows = (panel) => within(panel).getAllByTestId("own-evidence-row");
const evidenceShops = (panel) =>
  evidenceRows(panel).map((li) => within(li).getByTestId("own-evidence-shop").textContent);
function renderStyled() {
  const { daily, monthly } = styledDeviceSales();
  return renderBoard(daily, monthly, { period: null });
}

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

  it("marks this month's best sellers against last month, and nowhere else", () => {
    renderBoard();
    expect(screen.queryAllByTestId("device-move")).toHaveLength(0);

    click("uorakutensales.thisMonth");
    const moves = column("case").getAllByTestId("device-move");
    expect(moves.map((el) => el.textContent)).toEqual(["↑1", "↓1", "uorakutensales.rankNew"]);
    expect(moves[0]).toHaveAttribute("title", "uorakutensales.prevRank 2");
    expect(moves[2]).toHaveAttribute("title", "uorakutensales.prevRankNone");

    // 少ない順 reads ranks from the bottom: no marks there
    click("uorakutensales.viewLeast");
    expect(screen.queryAllByTestId("device-move")).toHaveLength(0);

    // 松武 has no board last month → no marks rather than a column of NEW
    click("uorakutensales.viewBest");
    fireEvent.change(shopSelect(), { target: { value: "松武" } });
    expect(screen.queryAllByTestId("device-move")).toHaveLength(0);
  });

  it("opens on this month whichever board arrives first", () => {
    const board = (daily, monthly) => (
      <DeviceSalesSection devices={buildDeviceSales(daily, monthly)} cardCls="" t={t} />
    );
    const pressed = (name) => screen.getByRole("button", { name }).getAttribute("aria-pressed");

    // today landed first: show it rather than nothing, then move to the default
    const first = render(board(dailyDeviceSales(), undefined));
    expect(pressed("uorakutensales.periodToday")).toBe("true");
    first.rerender(board(dailyDeviceSales(), monthlyDeviceSales()));
    expect(pressed("uorakutensales.thisMonth")).toBe("true");
    expect(models("case")).toEqual(["Google Pixel 10a", "Galaxy A25", "iPhone 17 e"]);
    first.unmount();

    // the month board landed first: it stays there when today follows
    const second = render(board(undefined, monthlyDeviceSales()));
    second.rerender(board(dailyDeviceSales(), monthlyDeviceSales()));
    expect(pressed("uorakutensales.thisMonth")).toBe("true");
  });
  it("splits the case and set columns by style, each with its share, and leaves films alone", () => {
    renderStyled();

    expect(chips("case")).toEqual([
      "uorakutensales.styleAll",
      "uorakutensales.styleFolio58%",
      "uorakutensales.styleStandard42%",
    ]);
    expect(chips("case_film_set")).toEqual([
      "uorakutensales.styleAll",
      "uorakutensales.styleFolio0%",
      "uorakutensales.styleStandard100%",
    ]);
    expect(styleSwitch("film")).toBeNull();
    // on a wide board the film column keeps the switch's slot, so the rows line up
    expect(within(screen.getByTestId("device-column-film")).getByTestId("style-spacer")).toBeInTheDocument();
  });

  it("re-ranks a column by the chosen style, with that style's own total", () => {
    renderStyled();

    pickStyle("case", /styleStandard/);

    expect(models("case")).toEqual(["Galaxy A25", "Google Pixel 10a", "iPhone 17 e"]);
    expect(within(styleSwitch("case")).getByRole("button", { name: /styleStandard/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(column("case").getByText(`80${U}`)).toBeInTheDocument();
    // the set column keeps its own choice
    expect(models("case_film_set")).toEqual(["AQUOS wish4"]);
  });

  it("compares this month's ranks with last month's within the same style", () => {
    renderStyled();

    pickStyle("case", /styleFolio/);

    expect(
      column("case")
        .getAllByTestId("device-move")
        .map((el) => el.textContent),
    ).toEqual(["↑1", "uorakutensales.rankNew", "↓2"]);
  });

  it("offers 不明 only while it holds units, and falls back to すべて once it is gone", () => {
    renderStyled();
    click("uorakutensales.lastMonth");

    expect(chips("case")).toContain("uorakutensales.styleUnknown1%");
    pickStyle("case", /styleUnknown/);
    expect(models("case")).toEqual(["Galaxy A25"]);

    click("uorakutensales.thisMonth");
    expect(chips("case")).toEqual([
      "uorakutensales.styleAll",
      "uorakutensales.styleFolio58%",
      "uorakutensales.styleStandard42%",
    ]);
    expect(within(styleSwitch("case")).getByRole("button", { name: "uorakutensales.styleAll" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(models("case")).toEqual(["Google Pixel 10a", "Galaxy A25", "iPhone 17 e"]);
  });

  it("reads a chosen shop's style board", () => {
    renderStyled();

    fireEvent.change(shopSelect(), { target: { value: "3911" } });
    pickStyle("case", /styleFolio/);

    expect(models("case")).toEqual(["Galaxy A25"]);
    expect(column("case").getAllByText(`10${U}`).length).toBeGreaterThan(0);
  });

  it("keeps the style in 失速 and ranks that style's slowdown", () => {
    const { daily, monthly } = styledSlowingDeviceSales();
    renderBoard(daily, monthly, { period: null });
    click("uorakutensales.viewSlowing");

    pickStyle("case", /styleFolio/);
    expect(models("case")).toEqual(["Galaxy A25", "arrows We3"]);

    pickStyle("case", /styleStandard/);
    expect(models("case")).toEqual(["arrows We3", "DIGNO BX3"]);
  });

  it("shows no style switch, and no empty slot, for a server without styles", () => {
    renderBoard();

    expect(screen.queryAllByRole("group", { name: "uorakutensales.styleGroup" })).toHaveLength(0);
    expect(screen.queryAllByTestId("style-spacer")).toHaveLength(0);
  });
  it("lists the market reference against our own case sales for this month", () => {
    renderMarket();

    expect(marketList()).toEqual([
      ["iPhone 17", "uorakutensales.flagNone"],
      ["Galaxy A25", "uorakutensales.flagStrong"],
      ["iPhone 18 Pro", "uorakutensales.flagNone"],
      ["Google Pixel 10a", "uorakutensales.flagStrong"],
      ["iPhone Air", "uorakutensales.flagNone"],
    ]);
    const galaxy = screen.getAllByTestId("market-row")[1];
    expect(within(galaxy).getByText(`uorakutensales.marketOwnRow 2/66${U}`)).toBeInTheDocument();
    expect(within(galaxy).getByText("#2")).toBeInTheDocument();
    // the strip and the columns step aside
    expect(screen.queryByTestId("device-total")).not.toBeInTheDocument();
    expect(screen.queryByTestId("device-column-case")).not.toBeInTheDocument();
  });

  it("explains the reference: window, weights, recorded days and the flags", () => {
    renderMarket();

    expect(screen.getByText("uorakutensales.marketRecorded 7/38")).toBeInTheDocument();
    expect(screen.getByText(/9\/1〜10\/8 · uorakutensales\.marketWeights 50\/30\/20/)).toBeInTheDocument();
    expect(screen.getByText("uorakutensales.flagWeakNote 20/30")).toBeInTheDocument();
    expect(screen.getByText("uorakutensales.marketNote")).toBeInTheDocument();
  });

  it("follows the period and the shop chosen above", () => {
    renderMarket();

    click("uorakutensales.lastMonth");
    expect(
      within(screen.getAllByTestId("market-row")[0]).getByText(`uorakutensales.marketOwnRow 3/246${U}`),
    ).toBeInTheDocument();

    click("uorakutensales.thisMonth");
    fireEvent.change(shopSelect(), { target: { value: "3911" } });
    expect(marketList().slice(1, 4)).toEqual([
      ["Galaxy A25", "uorakutensales.flagStrong"],
      ["iPhone 18 Pro", "uorakutensales.flagNone"],
      ["Google Pixel 10a", "uorakutensales.flagNone"],
    ]);
  });

  it("gives no own figures or flags while the period has no board", () => {
    const daily = dailyDeviceSales();
    Object.assign(daily, { ok: false, status: "not_ready", totals: null, types: null });
    daily.shops = daily.shops.map((s) => ({ ...s, totals: null, types: null }));
    renderMarket({ daily });
    click("uorakutensales.periodToday");

    expect(marketList().every(([, flag]) => flag === null)).toBe(true);
    expect(screen.queryByText(/uorakutensales\.marketOwnRow/)).not.toBeInTheDocument();
  });

  it("says the reference is still being collected", () => {
    renderMarket({
      market: buildMarketReference({ ...marketDeviceModels(), status: "not_ready", ranks: [], partial: false }),
    });

    expect(screen.getByText("uorakutensales.marketNotReady")).toBeInTheDocument();
    expect(screen.queryAllByTestId("market-row")).toHaveLength(0);
    expect(screen.queryByText(/uorakutensales\.marketRecorded/)).not.toBeInTheDocument();
  });

  it("offers 市場 only with a market reference, and leaves it when the reference goes away", () => {
    const board = (market) => (
      <DeviceSalesSection
        devices={buildDeviceSales(dailyDeviceSales(), monthlyDeviceSales())}
        market={market}
        cardCls=""
        t={t}
      />
    );
    const { rerender } = render(board(null));
    expect(screen.queryByRole("button", { name: "uorakutensales.viewMarket" })).not.toBeInTheDocument();

    rerender(board(buildMarketReference(marketDeviceModels())));
    click("uorakutensales.viewMarket");
    expect(screen.getAllByTestId("market-row")).toHaveLength(5);

    rerender(board(null));
    expect(screen.getByRole("button", { name: "uorakutensales.viewBest" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("device-column-case")).toBeInTheDocument();
  });
  it("opens a model's 根拠 from its name, and closes it again", () => {
    const onEvidence = vi.fn();
    const { rerender } = renderMarket({ onEvidence });

    const toggle = screen.getByRole("button", { name: "iPhone 18 Pro" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(onEvidence).toHaveBeenLastCalledWith("iPhone 18 Pro");

    rerender(marketBoard({ onEvidence, evidence: { model: "iPhone 18 Pro", status: "loading", total: 0, items: [] } }));
    expect(screen.getByRole("button", { name: "iPhone 18 Pro" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("uorakutensales.evidenceLoading")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "iPhone 18 Pro" }));
    expect(onEvidence).toHaveBeenLastCalledWith(null);
  });

  it("lists the evidence by contribution, with sources, ranks, model counts and links", () => {
    renderMarket({ evidence: evidenceFor("iPhone 18 Pro") });

    // only under its own model
    expect(screen.getAllByTestId("market-evidence")).toHaveLength(1);
    const panel = within(screen.getAllByTestId("market-row")[2]).getByTestId("market-evidence");
    expect(within(panel).getByText("uorakutensales.evidenceTitle 5")).toBeInTheDocument();
    const items = within(panel).getAllByTestId("evidence-item");
    expect(items.map((li) => within(li).getByTestId("evidence-source").textContent)).toEqual([
      "uorakutensales.evidenceRakutenDaily",
      "uorakutensales.evidenceYahooSearch",
      "uorakutensales.evidenceYahooTrend",
      "uorakutensales.evidenceRakutenRealtime",
      "uorakutensales.evidenceRakutenRealtime",
    ]);
    // the realtime #1 listing names eleven models, seen on two days
    expect(within(items[4]).getByText("#1")).toBeInTheDocument();
    expect(within(items[4]).getByText("uorakutensales.evidenceModels 11")).toBeInTheDocument();
    expect(within(items[4]).getByText("uorakutensales.evidenceDays 2")).toBeInTheDocument();
    const link = within(items[2]).getByRole("link", { name: "iFace 公式 iPhone18pro ケース iPhone17 iPhone 17e" });
    expect(link).toHaveAttribute("href", "https://store.shopping.yahoo.co.jp/iface/18pro.html");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    // a link that is not a public Rakuten / Yahoo page stays plain text
    expect(within(items[0]).queryByRole("link")).toBeNull();
    expect(within(items[0]).getByText("リンクの壊れた商品")).toBeInTheDocument();
  });

  it("shows ten entries first and the rest on demand", () => {
    const items = Array.from({ length: 12 }, (_, i) => ({
      id: `e${i}`,
      group: "rakutenProducts",
      period: "daily",
      type: "product",
      title: `商品 ${i + 1}`,
      url: null,
      bestRank: i + 1,
      bestDate: "2026-10-07",
      days: 1,
      models: 1,
    }));
    renderMarket({ evidence: { model: "iPhone 17", status: "ready", total: 12, items } });

    const panel = screen.getByTestId("market-evidence");
    expect(within(panel).getAllByTestId("evidence-item")).toHaveLength(10);
    fireEvent.click(within(panel).getByRole("button", { name: "uorakutensales.showMore 2" }));
    expect(within(panel).getAllByTestId("evidence-item")).toHaveLength(12);
    fireEvent.click(within(panel).getByRole("button", { name: "uorakutensales.showLess" }));
    expect(within(panel).getAllByTestId("evidence-item")).toHaveLength(10);
  });

  it("says when a model has no evidence, or it could not be read", () => {
    const { rerender } = renderMarket({ evidence: evidenceFor("Galaxy A25") });
    expect(screen.getByText("uorakutensales.evidenceNone")).toBeInTheDocument();

    rerender(marketBoard({ evidence: { model: "Galaxy A25", status: "failed", total: 0, items: [] } }));
    expect(screen.getByText("uorakutensales.evidenceFailed")).toBeInTheDocument();
  });
  it("opens a model's 内訳 from its name, with the board's period, model and category", () => {
    const onDeviceEvidence = vi.fn();
    render(ownBoard({ onDeviceEvidence }));
    click("uorakutensales.lastMonth");

    fireEvent.click(column("case").getByRole("button", { name: "iPhone 17" }));

    expect(onDeviceEvidence).toHaveBeenLastCalledWith({
      key: "case:iPhone 17",
      month: "2026-09",
      model: "iPhone 17",
      type: "case",
    });
  });

  it("carries the chosen style, the shop and today's date into the 内訳's scope", () => {
    const onDeviceEvidence = vi.fn();
    const { daily, monthly } = styledDeviceSales();
    render(ownBoard({ daily, monthly, onDeviceEvidence }));

    pickStyle("case", /styleFolio/);
    fireEvent.click(column("case").getByRole("button", { name: "Google Pixel 10a" }));
    expect(onDeviceEvidence).toHaveBeenLastCalledWith({
      key: "case:Google Pixel 10a",
      month: "2026-10",
      model: "Google Pixel 10a",
      type: "case",
      style: "folio",
    });

    pickStyle("case", "uorakutensales.styleAll");
    fireEvent.change(shopSelect(), { target: { value: "3911" } });
    fireEvent.click(column("case").getByRole("button", { name: "Galaxy A25" }));
    expect(onDeviceEvidence).toHaveBeenLastCalledWith({
      key: "case:Galaxy A25",
      month: "2026-10",
      model: "Galaxy A25",
      type: "case",
      shopName: "3911",
    });

    fireEvent.change(shopSelect(), { target: { value: "__all__" } });
    click("uorakutensales.periodToday");
    // a combination row is asked for by the full name the board ranks it under
    fireEvent.click(column("case").getByRole("button", { name: SE_NAME }));
    expect(onDeviceEvidence).toHaveBeenLastCalledWith({
      key: "case:iPhone SE（第2代） / iPhone SE（第3代）（多机型）",
      date: "2026-10-07",
      model: "iPhone SE（第2代） / iPhone SE（第3代）（多机型）",
      type: "case",
    });
  });

  it("lists our products by the metric on screen, with how each was recognized", () => {
    render(ownBoard({ deviceEvidence: ownEvidence("case:iPhone 17") }));
    click("uorakutensales.lastMonth");

    const toggle = column("case").getByRole("button", { name: "iPhone 17" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const panel = column("case").getByTestId("own-evidence");
    expect(within(panel).getByText("uorakutensales.ownEvidenceTitle 4")).toBeInTheDocument();
    expect(within(panel).getByText(`11${U} · ¥13660 · 8uorakutensales.ordersUnit`)).toBeInTheDocument();
    expect(
      within(panel).getByText("uorakutensales.sourceSelection 2 · uorakutensales.sourceTitle 2", { exact: false }),
    ).toBeInTheDocument();
    expect(evidenceShops(panel)).toEqual(["3911", "松田", "天海", "hagumi"]);

    const [history, title, series, unresolved] = evidenceRows(panel);
    expect(
      within(series).getByText(
        "uorakutensales.ownEvidenceModel: uorakutensales.sourceSelection ●iPhone シリ-ズ = iPhone 17",
      ),
    ).toBeInTheDocument();
    expect(
      within(series).getByText(/uorakutensales\.styleFolio: uorakutensales\.sourceSeries.*102/),
    ).toBeInTheDocument();
    const example = within(series).getByRole("link", { name: /uorakutensales\.ownEvidenceExample/ });
    expect(example).toHaveAttribute("href", "https://item.rakuten.co.jp/0406colors/18cls01-zenfone9/");
    expect(example).toHaveAttribute("target", "_blank");
    expect(example).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(history).getByText(/uorakutensales\.sourceSku 機種 = iPhone 17/)).toBeInTheDocument();
    expect(within(history).getByTitle("iPhone 17 手帳型 ケース レザー")).toBeInTheDocument();
    expect(
      within(title).getByText(/uorakutensales\.styleStandard: uorakutensales\.sourceTitle.*クリア/),
    ).toBeInTheDocument();
    expect(within(unresolved).getByText(/uorakutensales\.ruleMissingStyle/)).toBeInTheDocument();
    expect(within(title).queryByRole("link")).toBeNull();

    click("uorakutensales.sortSales");
    expect(evidenceShops(column("case").getByTestId("own-evidence"))).toEqual(["3911", "松田", "hagumi", "天海"]);
  });

  it("shows ten products first and the rest on demand", () => {
    const payload = ownDeviceEvidence();
    payload.evidence = Array.from({ length: 12 }, (_, i) => ({
      ...payload.evidence[1],
      id: `row-${i}`,
      shopName: `店${i + 1}`,
      unitsSold: 20 - i,
    }));
    payload.pagination = { ...payload.pagination, totalItems: 12 };
    render(ownBoard({ deviceEvidence: ownEvidence("case:iPhone 17", payload) }));
    click("uorakutensales.lastMonth");

    const panel = column("case").getByTestId("own-evidence");
    expect(evidenceRows(panel)).toHaveLength(10);
    fireEvent.click(within(panel).getByRole("button", { name: "uorakutensales.showMore 2" }));
    expect(evidenceRows(panel)).toHaveLength(12);
    fireEvent.click(within(panel).getByRole("button", { name: "uorakutensales.showLess" }));
    expect(evidenceRows(panel)).toHaveLength(10);
  });

  it("says when the 内訳 is loading, empty or could not be read", () => {
    const { rerender } = render(
      ownBoard({ deviceEvidence: { key: "case:iPhone 17", ...buildDeviceEvidence(undefined) } }),
    );
    click("uorakutensales.lastMonth");
    expect(column("case").getByText("uorakutensales.ownEvidenceLoading")).toBeInTheDocument();

    const none = ownDeviceEvidence();
    Object.assign(none, { evidence: [], summary: { unitsSold: 0, salesYen: 0, orderCount: 0, metricsReady: true } });
    rerender(ownBoard({ deviceEvidence: ownEvidence("case:iPhone 17", none) }));
    expect(column("case").getByText("uorakutensales.ownEvidenceNone")).toBeInTheDocument();

    rerender(
      ownBoard({ deviceEvidence: { key: "case:iPhone 17", ...buildDeviceEvidence({ error: { message: "x" } }) } }),
    );
    expect(column("case").getByText("uorakutensales.ownEvidenceFailed")).toBeInTheDocument();
  });

  it("closes the 内訳 when the period, the style or the view changes", () => {
    const onDeviceEvidence = vi.fn();
    const { daily, monthly } = styledDeviceSales();
    render(ownBoard({ daily, monthly, onDeviceEvidence, deviceEvidence: ownEvidence("case:Galaxy A25") }));

    onDeviceEvidence.mockClear();
    click("uorakutensales.lastMonth");
    expect(onDeviceEvidence).toHaveBeenCalledWith(null);

    onDeviceEvidence.mockClear();
    pickStyle("case", /styleFolio/);
    expect(onDeviceEvidence).toHaveBeenCalledWith(null);

    onDeviceEvidence.mockClear();
    click("uorakutensales.viewLeast");
    expect(onDeviceEvidence).toHaveBeenCalledWith(null);
  });

  it("keeps the 失速 rows without a 内訳", () => {
    const { daily, monthly } = slowingDeviceSales();
    render(ownBoard({ daily, monthly }));
    click("uorakutensales.viewSlowing");

    expect(models("case")).toEqual(["arrows We3", "Galaxy A25", "DIGNO BX3"]);
    expect(column("case").queryByRole("button", { name: "arrows We3" })).toBeNull();
  });
});
