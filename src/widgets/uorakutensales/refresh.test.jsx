// @vitest-environment jsdom
// Real Component, widget hooks and SWR; only HTTP delivery is controlled.
import { act, fireEvent, screen, within } from "@testing-library/react";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "test-utils/render-with-providers";
import Component from "./component";

const service = { widget: { type: "uorakutensales", service_group: "test", service_name: "sales", index: 0, refreshInterval: 60000 } };
const stamp = "2026-11-17T04:00:00.000Z";
const totals = (orders) => ({ salesAmount: orders * 100, orderCount: orders, unitsSold: orders });
const rakuten = {
  ok: true, generatedAtJST: "2026-11-17 13:00:00 JST", sourceUpdatedAtJST: "2026-11-17 13:00:00 JST",
  totals: { salesYen: 16000, orderCount: 160, unitsSold: 160 },
  updatedShopCount: 1, enabledShopCount: 1,
  shops: [{ shopName: "Rakuten-test", salesYen: 16000, orderCount: 160, unitsSold: 160, includedInTotals: true }],
};
function platform(orders, identity) {
  return { ok: true, today: {
    ok: true, enabledShopCount: 1, updatedShopCount: 1, totalsByCurrency: { JPY: totals(orders) },
    shops: [{ ...identity, date: "2026-11-17", currency: "JPY", enabled: true, status: "ready", includedInTotals: true, totals: totals(orders), sourceUpdatedAt: stamp }],
  } };
}
const snapshots = {
  sales: rakuten,
  monthly: { ok: true, currentMonth: { month: "2026-11", totals: { salesYen: 80000, orderCount: 800, unitsSold: 800 }, shops: [] } },
  amazonSales: platform(12, { shopName: "Amazon-test", accountId: "test", marketplaceId: "JP" }),
  aupaySales: platform(7, { shopName: "auPAY-test", configId: "test" }),
  mercariSales: platform(5, { shopName: "Mercari-test", configId: "test" }),
  temuSales: {
    ok: true, shopName: "TEMU-test", currency: "JPY", enabled: true,
    today: { key: "2026-11-17", status: "ready", totals: { ...totals(3), salesAmount: null }, sourceUpdatedAt: stamp },
  },
};
function harness() {
  const pending = new Map();
  vi.stubGlobal("fetch", vi.fn((url) => new Promise((resolve) => pending.set(new URL(url, "http://test").searchParams.get("endpoint"), resolve))));
  const cache = new Map();
  const config = {
    provider: () => cache, dedupingInterval: 0, shouldRetryOnError: false, revalidateOnFocus: false,
    fetcher: (url) => fetch(url).then((res) => res.json()),
  };
  const rendered = renderWithProviders(<SWRConfig value={config}><Component service={service} /></SWRConfig>);
  const resolve = async (endpoint, data = snapshots[endpoint], status = 200) => {
    await act(async () => pending.get(endpoint)({ ok: status < 400, status, json: async () => data }));
  };
  const ready = async () => { for (const endpoint of Object.keys(snapshots)) await resolve(endpoint); };
  const card = () => screen.getByText("uorakutensales.todayLabel").closest("section");
  const figure = () => card().querySelector(".text-\\[52px\\]")?.textContent;
  const refresh = () => fireEvent.click(screen.getByRole("button", { name: "uorakutensales.refresh" }));
  return { ...rendered, pending, resolve, ready, card, figure, refresh };
}
afterEach(() => { vi.unstubAllGlobals(); });

describe("sales-board atomic rendering", () => {
  it("never shows 160/172/179/182 while other sales sources are pending; publishes all 187 orders together", async () => {
    const h = harness();
    for (const endpoint of ["sales", "amazonSales", "aupaySales", "temuSales", "mercariSales"]) {
      await h.resolve(endpoint);
      expect(screen.queryByText("uorakutensales.todayLabel")).not.toBeInTheDocument();
      expect(screen.queryByRole("row", { name: /^Rakuten-test/ })).not.toBeInTheDocument();
    }
    await h.resolve("monthly");
    expect(h.figure()).toBe("187uorakutensales.ordersUnit");
    expect(screen.getByRole("row", { name: /^Mercari-test/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /^TEMU-test/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /^auPAY-test/ })).toBeInTheDocument();
  });

  it("keeps 187 throughout a staggered manual refresh and replaces it only when the batch is complete", async () => {
    const h = harness();
    await h.ready();
    h.refresh();
    await h.resolve("sales", { ...rakuten, totals: { ...rakuten.totals, orderCount: 180 } });
    expect(h.figure()).toBe("187uorakutensales.ordersUnit");
    for (const endpoint of ["monthly", "amazonSales", "aupaySales", "mercariSales"]) await h.resolve(endpoint);
    expect(h.figure()).toBe("187uorakutensales.ordersUnit");
    await h.resolve("temuSales");
    expect(h.figure()).toBe("207uorakutensales.ordersUnit");
  });

  it("retains the complete old total on failed refresh, names the failed platform and recovers", async () => {
    const h = harness();
    await h.ready();
    h.refresh();
    await h.resolve("sales", { ...rakuten, totals: { ...rakuten.totals, orderCount: 180 } });
    for (const endpoint of ["monthly", "amazonSales", "aupaySales", "mercariSales"]) await h.resolve(endpoint);
    await h.resolve("temuSales", { error: "offline" }, 503);
    expect(h.figure()).toBe("187uorakutensales.ordersUnit");
    expect(screen.getByRole("alert")).toHaveTextContent("uorakutensales.snapshotRefreshFailed");
    expect(screen.getByRole("alert")).toHaveTextContent("uorakutensales.platformTemu");
    h.refresh();
    await h.ready();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(h.figure()).toBe("187uorakutensales.ordersUnit");
  });

  it("shows an initial error and working retry instead of an incomplete total", async () => {
    const h = harness();
    for (const endpoint of ["sales", "monthly", "amazonSales", "aupaySales", "mercariSales"]) await h.resolve(endpoint);
    await h.resolve("temuSales", { error: "offline" }, 503);
    expect(screen.queryByText("uorakutensales.todayLabel")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("uorakutensales.snapshotLoadFailed");
    h.refresh();
    await h.ready();
    expect(h.figure()).toBe("187uorakutensales.ordersUnit");
  });

  it("marks legacy optional endpoints as unavailable rather than silently claiming complete coverage", async () => {
    const h = harness();
    for (const endpoint of ["sales", "monthly", "amazonSales", "aupaySales", "mercariSales"]) await h.resolve(endpoint);
    await h.resolve("temuSales", { error: "not found" }, 404);
    expect(h.figure()).toBe("184uorakutensales.ordersUnit");
    expect(screen.getByRole("alert")).toHaveTextContent("uorakutensales.snapshotUnavailable");
    expect(screen.getByRole("alert")).toHaveTextContent("uorakutensales.platformTemu");
  });

  it("does not replace the amounts in sales mode before all sources arrive", async () => {
    const h = harness();
    await h.ready();
    fireEvent.click(screen.getByRole("button", { name: "uorakutensales.sortSales" }));
    // 楽天 ¥16000 + Amazon ¥1200 + au PAY ¥700 + Mercari ¥500; TEMU has no yen
    expect(h.figure()).toBe("¥18400");
    expect(within(h.card()).getByText(/¥16000/)).toBeInTheDocument();
    h.refresh();
    await h.resolve("sales", { ...rakuten, totals: { ...rakuten.totals, salesYen: 20000 } });
    expect(h.figure()).toBe("¥18400");
    expect(within(h.card()).queryByText(/¥20000/)).not.toBeInTheDocument();
    for (const endpoint of ["monthly", "amazonSales", "aupaySales", "temuSales", "mercariSales"]) await h.resolve(endpoint);
    expect(h.figure()).toBe("¥22400");
    expect(within(h.card()).getByText(/¥20000/)).toBeInTheDocument();
  });
});
