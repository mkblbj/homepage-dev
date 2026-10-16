import assert from "node:assert/strict";
import test from "node:test";

import { buildAttentionView, buildOrdersView } from "./rakuten-model.mjs";

const sales = {
  ok: true,
  generatedAtJST: "2026-10-16 13:47 JST",
  shops: [
    { shopName: "松武", status: "authenticated", orderCount: 47, unitsSold: 49, lastError: null },
    { shopName: "3911", status: "authenticated", orderCount: 112, unitsSold: 123, lastError: null },
    { shopName: "kurumu", status: "authenticated", orderCount: 0, unitsSold: 0, lastError: null },
  ],
};
const monthly = {
  ok: true,
  partial: false,
  currentMonth: {
    liveDate: "2026-10-16",
    completedThroughDate: "2026-10-15",
    totals: { orderCount: 11340, unitsSold: 12542 },
  },
};
const logos = { shops: [{ shopName: "3911", logoUrl: "https://x/3911.jpg" }] };

test("today sums the shops it could read; the month comes from the monthly rollup", () => {
  const v = buildOrdersView({ sales, monthly, logos, todayYmd: "2026-10-16" });
  assert.equal(v.generatedAt, "2026-10-16 13:47 JST");
  assert.deepEqual(v.today, { orders: 159, units: 172 });
  assert.equal(v.month.orders, 11340);
  assert.equal(v.month.units, 12542);
  assert.equal(v.month.includesToday, true);
  assert.equal(v.month.toDay, 16);
  assert.equal(v.month.partial, false);
  assert.equal(v.missing, 0);
  assert.deepEqual(
    v.shops.map((s) => [s.name, s.orders]),
    [
      ["3911", 112],
      ["松武", 47],
      ["kurumu", 0],
    ],
  );
  assert.equal(v.shops[0].logoUrl, "https://x/3911.jpg");
  assert.equal(v.shops[1].logoUrl, null);
});

test("a shop that failed is left out of the total and counted as missing", () => {
  const v = buildOrdersView({
    sales: {
      ...sales,
      shops: [
        ...sales.shops,
        { shopName: "aiashop", status: "error", orderCount: 0, unitsSold: 0, lastError: "timeout" },
      ],
    },
    monthly,
    logos,
    todayYmd: "2026-10-16",
  });
  assert.equal(v.missing, 1);
  assert.deepEqual(v.today, { orders: 159, units: 172 });
  const failed = v.shops.at(-1);
  assert.equal(failed.name, "aiashop");
  assert.equal(failed.failed, true);
  assert.equal(failed.orders, null);
});

test("an unreadable sales payload is unknown, not zero", () => {
  for (const bad of [null, { error: "x" }, { ok: false }]) {
    const v = buildOrdersView({ sales: bad, monthly, logos, todayYmd: "2026-10-16" });
    assert.equal(v.today.orders, null);
    assert.equal(v.today.units, null);
    assert.deepEqual(v.shops, []);
  }
  const noMonth = buildOrdersView({ sales, monthly: { error: "x" }, logos, todayYmd: "2026-10-16" });
  assert.equal(noMonth.month.orders, null);
});

test("the month before today's live day joins does not claim to include today", () => {
  const v = buildOrdersView({
    sales,
    monthly: { ...monthly, currentMonth: { ...monthly.currentMonth, liveDate: null } },
    logos,
    todayYmd: "2026-10-16",
  });
  assert.equal(v.month.includesToday, false);
  assert.equal(v.month.toDay, 15);
});

const attention = {
  ok: true,
  summary: { pendingOrderCount: 0, unansweredInquiryCount: 9, unrepliedReviewCount: 3, overdueInquiryCount: 0 },
  sources: { mainMenu: { stale: false }, reviews: { stale: false } },
  shops: [
    { shopName: "3911", status: "attention", pendingOrderCount: 0, unansweredInquiryCount: 4, overdueInquiryCount: 0, unrepliedReviewCount: 0 },
    { shopName: "0406", status: "critical", pendingOrderCount: 0, unansweredInquiryCount: 1, overdueInquiryCount: 0, unrepliedReviewCount: 1 },
    { shopName: "hagumi", status: "normal", pendingOrderCount: 0, unansweredInquiryCount: 0, overdueInquiryCount: 0, unrepliedReviewCount: 0 },
  ],
};

test("未対応 keeps the 運営対応 total and lists the shops that need work, worst first", () => {
  const a = buildAttentionView(attention, logos);
  assert.equal(a.total, 12);
  assert.equal(a.inquiries, 9);
  assert.equal(a.reviews, 3);
  assert.equal(a.pending, 0);
  assert.equal(a.stale, false);
  assert.deepEqual(
    a.shops.map((s) => [s.name, s.tone, s.count]),
    [
      ["0406", "critical", 2],
      ["3911", "attention", 4],
    ],
  );
  assert.equal(a.shops[1].logoUrl, "https://x/3911.jpg");
  assert.equal(a.moreCount, 0);
});

test("未対応 shows at most five shops and counts the rest", () => {
  const many = {
    ...attention,
    shops: Array.from({ length: 7 }, (_, i) => ({
      shopName: `s${i}`,
      status: "attention",
      pendingOrderCount: 0,
      unansweredInquiryCount: 1,
      overdueInquiryCount: 0,
      unrepliedReviewCount: 0,
    })),
  };
  const a = buildAttentionView(many, logos);
  assert.equal(a.shops.length, 5);
  assert.equal(a.moreCount, 2);
});

test("a stale source is reported; an unreadable payload is null", () => {
  const stale = buildAttentionView({ ...attention, sources: { mainMenu: { stale: true } } }, logos);
  assert.equal(stale.stale, true);
  assert.equal(buildAttentionView({ error: "x" }, logos), null);
  assert.equal(buildAttentionView(null, logos), null);
});
