import { describe, expect, it } from "vitest";

import { buildAttentionModel, isNil, sumNullable } from "./attention-model.mjs";

const snapshot = {
  ok: true,
  partial: false,
  status: "critical",
  generatedAtJST: "2026-07-31 14:20 JST",
  shopCount: 7,
  summary: {
    pendingOrderCount: 0,
    unansweredInquiryCount: 1,
    overdueInquiryCount: 0,
    unrepliedReviewCount: 18,
    productReviewCount: 13,
    shopReviewCount: 5,
    reviewCountByRating: { 1: 5, 2: 8, 3: 5 },
  },
  sources: {
    mainMenu: {
      ok: true,
      stale: false,
      updatedAtJST: "2026-07-31 14:20 JST",
      lastAttemptAtJST: "2026-07-31 14:20 JST",
      coveredShopCount: 7,
      lastError: null,
    },
    reviews: {
      ok: true,
      stale: false,
      updatedAtJST: "2026-07-31 14:09 JST",
      lastAttemptAtJST: "2026-07-31 14:09 JST",
      coveredShopCount: 7,
      lastError: null,
    },
  },
  shops: [
    {
      shopName: "3911",
      status: "critical",
      pendingOrderCount: 0,
      unansweredInquiryCount: 0,
      overdueInquiryCount: 0,
      unrepliedReviewCount: 8,
      productReviewCount: 7,
      shopReviewCount: 1,
      reviewCountByRating: { 1: 3, 2: 3, 3: 2 },
      // The API also nests per-shop review records; the model must drop them entirely.
      reviews: [
        {
          reviewId: "rvw_0001",
          shopName: "3911",
          reviewType: "product",
          rating: 1,
          postedAtJST: "2026-07-31 09:12 JST",
          itemManagementNumber: "sample-001",
          itemName: "サンプル商品",
          excerpt: "synthetic excerpt",
          reviewUrl: "https://review.rakuten.co.jp/item/1/2_2/rvw_0001/",
        },
      ],
      lastError: null,
    },
    {
      shopName: "0406",
      status: "critical",
      pendingOrderCount: 0,
      unansweredInquiryCount: 0,
      overdueInquiryCount: 0,
      unrepliedReviewCount: 1,
      productReviewCount: 0,
      shopReviewCount: 1,
      reviewCountByRating: { 1: 1, 2: 0, 3: 0 },
      lastError: null,
    },
  ],
  recentReviews: [
    {
      reviewId: "rvw_0001",
      shopName: "3911",
      reviewType: "product",
      rating: 1,
      postedAtJST: "2026-07-31 09:12 JST",
      itemManagementNumber: "sample-001",
      itemName: "サンプル商品",
      excerpt: "synthetic excerpt",
      reviewUrl: "https://review.rakuten.co.jp/item/1/2_2/rvw_0001/",
    },
    {
      reviewId: "rvw_0002",
      shopName: "0406",
      reviewType: "shop",
      rating: 2,
      postedAtJST: "2026-07-30 20:44 JST",
      itemManagementNumber: null,
      itemName: null,
      excerpt: "",
      reviewUrl: null,
    },
  ],
  lastError: null,
};

// a shop with nothing to handle; overrides turn it into the case under test
function clearShop(shopName, overrides = {}) {
  return {
    shopName,
    status: "normal",
    pendingOrderCount: 0,
    unansweredInquiryCount: 0,
    overdueInquiryCount: 0,
    unrepliedReviewCount: 0,
    reviewCountByRating: { 1: 0, 2: 0, 3: 0 },
    lastError: null,
    ...overrides,
  };
}

const UNKNOWN_COUNTS = { pendingOrderCount: null, unansweredInquiryCount: null, unrepliedReviewCount: null };

describe("widgets/uoattention/attention-model", () => {
  it("returns null without data", () => {
    expect(buildAttentionModel(undefined)).toBeNull();
    expect(buildAttentionModel(null)).toBeNull();
  });

  it("maps the company summary", () => {
    const model = buildAttentionModel(snapshot);

    expect(model.status).toBe("critical");
    expect(model.partial).toBe(false);
    expect(model.shopCount).toBe(7);
    expect(model.pending).toBe(0);
    expect(model.inquiry).toBe(1);
    expect(model.reviews).toBe(18);
    expect(model.total).toBe(19);
    expect(model.totalPartial).toBe(false);
    expect(model.ratings).toEqual([
      { star: 1, n: 5 },
      { star: 2, n: 8 },
      { star: 3, n: 5 },
    ]);
  });

  it("keeps unknown counts as null instead of coercing them to 0", () => {
    const model = buildAttentionModel({
      ...snapshot,
      summary: { ...snapshot.summary, pendingOrderCount: null, reviewCountByRating: { 1: null, 2: 8, 3: null } },
    });

    expect(model.pending).toBeNull();
    expect(model.ratings).toEqual([
      { star: 1, n: null },
      { star: 2, n: 8 },
      { star: 3, n: null },
    ]);
  });

  it("excludes an unknown review count from the headline total and flags it", () => {
    const model = buildAttentionModel({
      ...snapshot,
      summary: { ...snapshot.summary, unrepliedReviewCount: null },
    });

    expect(model.total).toBe(1);
    expect(model.totalPartial).toBe(true);
  });

  it("drops rating buckets that are zero or unknown", () => {
    const model = buildAttentionModel(snapshot);

    expect(model.shops[0].stars).toEqual([
      { star: 1, n: 3 },
      { star: 2, n: 3 },
      { star: 3, n: 2 },
    ]);
    expect(model.shops[1].stars).toEqual([{ star: 1, n: 1 }]);
  });

  it("counts only shops whose review count is known as covered", () => {
    const model = buildAttentionModel({
      ...snapshot,
      shops: [snapshot.shops[0], { ...snapshot.shops[1], unrepliedReviewCount: null }],
    });

    expect(model.coveredShopCount).toBe(1);
  });

  it("falls back to unknown for a missing status", () => {
    const model = buildAttentionModel({ ...snapshot, status: undefined, shops: [{ shopName: "x" }] });

    expect(model.status).toBe("unknown");
    expect(model.shops[0].status).toBe("unknown");
  });

  it("gives each shop its open total, unknown only when every count is", () => {
    const model = buildAttentionModel({
      ...snapshot,
      shops: [...snapshot.shops, clearShop("x", { status: "unknown", ...UNKNOWN_COUNTS })],
    });

    expect(model.shops.map((shop) => shop.total)).toEqual([8, 1, null]);
  });

  it("folds shops with nothing to handle out of the active list", () => {
    const model = buildAttentionModel({
      ...snapshot,
      shops: [clearShop("hagumi"), ...snapshot.shops, clearShop("kurumu")],
    });

    expect(model.quietShops.map((shop) => shop.name)).toEqual(["hagumi", "kurumu"]);
    expect(model.activeShops.map((shop) => shop.name)).toEqual(["3911", "0406"]);
    // the full list stays as the Server sent it
    expect(model.shops.map((shop) => shop.name)).toEqual(["hagumi", "3911", "0406", "kurumu"]);
  });

  it("keeps a normal shop active while it has a count, an unknown count or an error", () => {
    const model = buildAttentionModel({
      ...snapshot,
      shops: [
        clearShop("counted", { unansweredInquiryCount: 1 }),
        clearShop("pending-unknown", { pendingOrderCount: null }),
        clearShop("overdue-unknown", { overdueInquiryCount: null }),
        clearShop("failing", { lastError: "RMS login failed" }),
      ],
    });

    expect(model.quietShops).toEqual([]);
    expect(model.activeShops.map((shop) => shop.name).sort()).toEqual(
      ["counted", "failing", "overdue-unknown", "pending-unknown"].sort(),
    );
  });

  it("keeps a shop the Server did not call normal active even with zero counts", () => {
    const model = buildAttentionModel({ ...snapshot, shops: [clearShop("flagged", { status: "attention" })] });

    expect(model.activeShops.map((shop) => shop.name)).toEqual(["flagged"]);
  });

  it("orders the active shops by severity, then by open count", () => {
    const model = buildAttentionModel({
      ...snapshot,
      shops: [
        clearShop("normal-3", { pendingOrderCount: 3 }),
        clearShop("attention-9", { status: "attention", unansweredInquiryCount: 9 }),
        clearShop("unknown", { status: "unknown", ...UNKNOWN_COUNTS }),
        clearShop("critical-2", { status: "critical", unrepliedReviewCount: 2 }),
        clearShop("critical-8", { status: "critical", unansweredInquiryCount: 3, unrepliedReviewCount: 5 }),
      ],
    });

    expect(model.activeShops.map((shop) => shop.name)).toEqual([
      "critical-8",
      "critical-2",
      "attention-9",
      "unknown",
      "normal-3",
    ]);
  });

  it("identifies reviewed items by management number and drops the full title", () => {
    const model = buildAttentionModel(snapshot);

    expect(model.recentReviews).toHaveLength(2);
    expect(model.recentReviews[0]).toEqual({
      id: "rvw_0001",
      shop: "3911",
      logoUrl: null,
      type: "product",
      rating: 1,
      postedAtJST: "2026-07-31 09:12 JST",
      itemNo: "sample-001",
      excerpt: "synthetic excerpt",
    });
    // Shop reviews never carry a management number.
    expect(model.recentReviews[1].itemNo).toBeNull();
    expect(model.recentReviews[1].excerpt).toBe("");
    expect(JSON.stringify(model)).not.toContain("サンプル商品");
  });

  it("never leaks reviewUrl into the model", () => {
    const model = buildAttentionModel(snapshot);

    expect(JSON.stringify(model)).not.toContain("review.rakuten.co.jp");
  });

  it("flags the feed as truncated when it holds fewer rows than the counted total", () => {
    // The Server counts every unreplied review but ships only the newest 20 as detail rows.
    const truncated = buildAttentionModel({
      ...snapshot,
      summary: { ...snapshot.summary, unrepliedReviewCount: 27 },
    });

    expect(truncated.reviews).toBe(27);
    expect(truncated.feedCount).toBe(2);
    expect(truncated.reviewsTruncated).toBe(true);
  });

  it("does not flag truncation when the feed already holds everything", () => {
    const model = buildAttentionModel({
      ...snapshot,
      summary: { ...snapshot.summary, unrepliedReviewCount: 2 },
    });

    expect(model.reviewsTruncated).toBe(false);
  });

  it("never claims truncation while the counted total is unknown", () => {
    const model = buildAttentionModel({
      ...snapshot,
      summary: { ...snapshot.summary, unrepliedReviewCount: null },
    });

    expect(model.reviews).toBeNull();
    expect(model.reviewsTruncated).toBe(false);
  });

  it("merges shop logos by name and tolerates missing entries", () => {
    const logos = {
      shops: [
        { shopName: "3911", logoUrl: "https://cabinet.example/3911.jpg" },
        { shopName: "unknown-shop", logoUrl: "https://cabinet.example/other.jpg" },
      ],
    };
    const model = buildAttentionModel(snapshot, logos);

    expect(model.shops[0].logoUrl).toBe("https://cabinet.example/3911.jpg");
    expect(model.shops[1].logoUrl).toBeNull();
    expect(model.recentReviews[0].logoUrl).toBe("https://cabinet.example/3911.jpg");
    expect(model.recentReviews[1].logoUrl).toBeNull();
  });

  it("leaves logos null when the snapshot is unavailable", () => {
    const model = buildAttentionModel(snapshot, undefined);

    expect(model.shops.every((shop) => shop.logoUrl === null)).toBe(true);
  });

  it("sums nullable lists, returning null only when every member is unknown", () => {
    expect(sumNullable([1, null, 2])).toBe(3);
    expect(sumNullable([null, null])).toBeNull();
    expect(sumNullable([])).toBeNull();
    expect(sumNullable([0, null])).toBe(0);
  });

  it("treats null and undefined as nil but keeps 0 as a real value", () => {
    expect(isNil(null)).toBe(true);
    expect(isNil(undefined)).toBe(true);
    expect(isNil(0)).toBe(false);
  });
});

// /api/attention since Mercari Shops joined (2026-11-19): its inquiries ride along
const MERCARI_CONFIG = "09ac59f3-a7b7-415f-b8a8-2af9f1ac9967";

function mercariShop(overrides = {}) {
  return {
    platform: "mercari",
    configId: MERCARI_CONFIG,
    shopId: "DKnSGBVY6VP22ckTF3h444",
    shopName: "3911",
    enabled: true,
    status: "ready",
    sourceUpdatedAt: "2026-11-19T06:28:18.698Z",
    lastError: null,
    unansweredInquiryCount: 1,
    inProgressInquiryCount: 45,
    overdueInquiryCount: null,
    ...overrides,
  };
}

const mercariSource = {
  ok: true,
  stale: false,
  updatedAtJST: "2026-11-19 15:28:18 JST",
  lastAttemptAtJST: "2026-11-19 15:28:18 JST",
  coveredShopCount: 1,
  lastError: null,
};

function withMercari(shops = [mercariShop()], summary = { unansweredInquiryCount: 1, inProgressInquiryCount: 45 }) {
  return {
    ...snapshot,
    summary: {
      ...snapshot.summary,
      allPlatformUnansweredInquiryCount:
        snapshot.summary.unansweredInquiryCount + (summary.unansweredInquiryCount ?? 0),
    },
    sources: { ...snapshot.sources, mercariInquiries: mercariSource },
    mercariInquiries: {
      ok: true,
      enabled: true,
      partial: false,
      source: "mercari-shops-inquiries",
      summary,
      freshness: mercariSource,
      shops,
    },
  };
}

describe("widgets/uoattention/attention-model Mercari inquiries", () => {
  it("counts every platform's unanswered inquiries in the headline, overdue staying 楽天's", () => {
    const model = buildAttentionModel(withMercari());

    expect(model.inquiry).toBe(2);
    expect(model.overdue).toBe(0);
    expect(model.total).toBe(20);
    expect(model.mercari).toEqual({ inquiry: 1, handling: 45 });
    expect(model.sources.mercariInquiries).toEqual(mercariSource);
  });

  it("keeps the 楽天-only figures when the snapshot has no Mercari", () => {
    const model = buildAttentionModel(snapshot);

    expect(model.inquiry).toBe(1);
    expect(model.mercari).toBeNull();
    expect(model.shops.every((shop) => shop.platform === "rakuten")).toBe(true);
  });

  it("gives the Mercari shop its own entry beside the 楽天 shop of the same name", () => {
    const model = buildAttentionModel(withMercari(), { shops: [{ shopName: "3911", logoUrl: "https://x/3911.png" }] });
    const both = model.shops.filter((shop) => shop.name === "3911");

    expect(both.map((shop) => shop.platform)).toEqual(["rakuten", "mercari"]);
    expect(new Set(both.map((shop) => shop.key)).size).toBe(2);
    const mercari = both[1];
    expect(mercari.key).toBe(`mercari:${MERCARI_CONFIG}`);
    // the platform's own icon, never the 楽天 shop's logo
    expect(mercari.logoUrl).toMatch(/^data:image\/png;base64,/);
    expect(mercari).toMatchObject({ status: "attention", inquiry: 1, handling: 45, total: 1, overdue: null });
    // 楽天's coverage and shop count are unchanged
    expect(model.shopCount).toBe(7);
    expect(model.coveredShopCount).toBe(buildAttentionModel(snapshot).coveredShopCount);
  });

  it("keeps a Mercari shop with inquiries in progress on the board, folds it once there are none", () => {
    const handling = buildAttentionModel(withMercari([mercariShop({ unansweredInquiryCount: 0 })]));
    const shop = handling.shops.find((s) => s.platform === "mercari");
    expect(shop.status).toBe("normal");
    expect(handling.activeShops).toContain(shop);

    const clear = buildAttentionModel(
      withMercari([mercariShop({ unansweredInquiryCount: 0, inProgressInquiryCount: 0 })]),
    );
    expect(clear.quietShops.map((s) => s.key)).toContain(`mercari:${MERCARI_CONFIG}`);
  });

  it("reads a Mercari shop the server could not read fresh as unknown, not zero", () => {
    const stale = mercariShop({
      status: "stale",
      unansweredInquiryCount: null,
      inProgressInquiryCount: null,
      lastError: "MERCARI_INQUIRIES_FAILED",
    });
    const model = buildAttentionModel(
      withMercari([stale], { unansweredInquiryCount: null, inProgressInquiryCount: null }),
    );
    const shop = model.shops.find((s) => s.platform === "mercari");

    expect(shop).toMatchObject({ status: "unknown", inquiry: null, handling: null, total: null });
    expect(model.activeShops).toContain(shop);
    expect(model.mercari).toEqual({ inquiry: null, handling: null });
  });

  it("leaves out a disabled Mercari source and disabled shops", () => {
    const disabled = withMercari();
    expect(
      buildAttentionModel({ ...disabled, mercariInquiries: { ...disabled.mercariInquiries, enabled: false } }).mercari,
    ).toBeNull();
    const model = buildAttentionModel(withMercari([mercariShop({ enabled: false })]));
    expect(model.shops.some((shop) => shop.platform === "mercari")).toBe(false);
  });
});
