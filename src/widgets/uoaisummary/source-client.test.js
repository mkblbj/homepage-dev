import { describe, expect, it, vi } from "vitest";

import { collectBusinessSources, compositeFreshness, fetchJson } from "./source-client.mjs";

function reply(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("source-client", () => {
  it("blocks redirects and returns a redacted source error", async () => {
    const fetcher = vi.fn().mockResolvedValue(reply({}, 302, { location: "https://other.test" }));

    await expect(fetchJson("https://source.test/data", { fetcher, timeoutMs: 50 })).rejects.toMatchObject({
      code: "source_unavailable",
    });
    expect(fetcher.mock.calls[0][1].redirect).toBe("manual");
  });

  it("collects the six read-only endpoint calls and keeps one failed source isolated", async () => {
    const fetcher = vi.fn(async (url) => {
      const value = String(url);
      if (value.endsWith("/api/performance")) throw new TypeError("private host details");
      if (value.endsWith("/api/sales")) {
        return reply({ generatedAtJST: "2026-08-01 09:45 JST", totals: { salesYen: 100, orderCount: 2 }, shops: [] });
      }
      if (value.endsWith("/api/history/sales")) return reply({ totals: {}, shops: [], range: { dates: [] } });
      if (value.endsWith("/api/item-rankings")) return reply({ rankings: {} });
      if (value.endsWith("/api/attention")) {
        return reply({ generatedAtJST: "2026-08-01 09:50 JST", status: "attention", sources: {}, summary: {} });
      }
      return reply({ updated_at: "2026-08-01 09:59:00+09:00", today_output: {}, today_shipping: {} });
    });

    const sources = {
      shipping: { widget: { type: "uoshippingdashboard", url: "http://shipping.test/api/dashboard/homepage" } },
      attention: { widget: { type: "uoattention", url: "http://commerce.test" } },
      sales: { widget: { type: "uorakutensales", url: "http://commerce.test" } },
      performance: { widget: { type: "uoperformance", url: "http://commerce.test" } },
    };

    const result = await collectBusinessSources(sources, {
      fetcher,
      nowTs: Date.parse("2026-08-01T10:00:00+09:00"),
      timeoutMs: 100,
    });

    expect(fetcher).toHaveBeenCalledTimes(6);
    expect(result.shipping.state).toBe("fresh");
    expect(result.sales.data).toHaveProperty("sales");
    expect(result.sales.data).toHaveProperty("history");
    expect(result.sales.data).toHaveProperty("ranking");
    expect(result.performance).toMatchObject({
      state: "unavailable",
      data: null,
      error: "source_unavailable",
    });
  });

  it("maps all-stale composite sub-sources to stale and one-stale to delayed", async () => {
    const allStale = { traffic: { stale: true }, customerMix: { stale: true } };
    const oneStale = { mainMenu: { stale: false }, reviews: { stale: true } };

    expect(compositeFreshness(allStale)).toBe("stale");
    expect(compositeFreshness(oneStale)).toBe("delayed");
  });
});
