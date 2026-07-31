import { describe, expect, it } from "vitest";

import { buildPerformanceModel, isNil, mdLabel, pctLabel, spark, weekdayJp } from "./performance-model.mjs";

const daily = [
  { dateJST: "2026-07-24", visitCount: 17217, uniqueVisitorCount: 16178 },
  { dateJST: "2026-07-25", visitCount: 21036, uniqueVisitorCount: 19432 },
  { dateJST: "2026-07-26", visitCount: 19860, uniqueVisitorCount: 18583 },
  { dateJST: "2026-07-27", visitCount: 15103, uniqueVisitorCount: 14107 },
  { dateJST: "2026-07-28", visitCount: 17043, uniqueVisitorCount: 16064 },
  { dateJST: "2026-07-29", visitCount: 17438, uniqueVisitorCount: 16361 },
  { dateJST: "2026-07-30", visitCount: 15897, uniqueVisitorCount: 14737 },
];

const snapshot = {
  ok: true,
  partial: false,
  status: "normal",
  generatedAtJST: "2026-07-31 10:58 JST",
  shopCount: 7,
  traffic: {
    status: "normal",
    dataDateJST: "2026-07-30",
    visitCount: 15897,
    uniqueVisitorCount: 14737,
    expectedVisitCount: 19408.5,
    visitDeltaPercent: -18.1,
    sampleCount: 4,
    period: { startDateJST: "2026-07-24", endDateJST: "2026-07-30" },
    daily,
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
  sources: {
    traffic: {
      ok: true,
      stale: false,
      updatedAtJST: "2026-07-31 10:58 JST",
      lastAttemptAtJST: "2026-07-31 10:58 JST",
      dataDateJST: "2026-07-30",
      coveredShopCount: 7,
      lastError: null,
    },
    customerMix: {
      ok: true,
      stale: false,
      updatedAtJST: "2026-07-31 10:58 JST",
      lastAttemptAtJST: "2026-07-31 10:58 JST",
      dataDateJST: "2026-07-30",
      coveredShopCount: 7,
      lastError: null,
    },
  },
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
};

describe("widgets/uoperformance/performance-model", () => {
  it("returns null without data", () => {
    expect(buildPerformanceModel(undefined)).toBeNull();
  });

  it("maps the company traffic block", () => {
    const model = buildPerformanceModel(snapshot);

    expect(model.trafficStatus).toBe("normal");
    expect(model.dataDateJST).toBe("2026-07-30");
    expect(model.visit).toBe(15897);
    expect(model.uu).toBe(14737);
    expect(model.delta).toBe(-18.1);
    expect(model.sampleCount).toBe(4);
    expect(model.days).toHaveLength(7);
    expect(model.days[6]).toEqual({ date: "2026-07-30", md: "7/30", wd: "木", visit: 15897, uu: 14737 });
  });

  it("keeps a fractional median instead of rounding it", () => {
    const model = buildPerformanceModel(snapshot);

    expect(model.expected).toBe(19408.5);
  });

  it("leaves the median comparison unknown when there are fewer than 3 samples", () => {
    const model = buildPerformanceModel({
      ...snapshot,
      traffic: {
        ...snapshot.traffic,
        status: "unknown",
        expectedVisitCount: null,
        visitDeltaPercent: null,
        sampleCount: 2,
      },
    });

    expect(model.expected).toBeNull();
    expect(model.delta).toBeNull();
    expect(model.sampleCount).toBe(2);
    expect(model.trafficStatus).toBe("unknown");
  });

  it("keeps an unavailable customer mix as null rather than zero", () => {
    const model = buildPerformanceModel({
      ...snapshot,
      customerMix: {
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
      },
    });

    expect(model.mix.newYen).toBeNull();
    expect(model.mix.newSalesShare).toBeNull();
    expect(model.mix.repSalesShare).toBeNull();
    expect(model.mix.buckets.every((bucket) => bucket.yen === null)).toBe(true);
  });

  it("exposes the four repeat buckets in order with distinct colors", () => {
    const model = buildPerformanceModel(snapshot);

    expect(model.mix.buckets.map((bucket) => bucket.key)).toEqual(["repeat1", "repeat2", "repeat3", "repeatOver4"]);
    expect(model.mix.buckets[0].yen).toBe(569835);
    expect(new Set(model.mix.buckets.map((bucket) => bucket.color)).size).toBe(4);
  });

  it("maps per-shop rows", () => {
    const model = buildPerformanceModel(snapshot);

    expect(model.shops).toHaveLength(1);
    expect(model.shops[0]).toMatchObject({
      name: "3911",
      status: "attention",
      sampleCount: 4,
      visit: 5122,
      expected: 6784.5,
      delta: -24.5,
      newSalesShare: 83.5,
      newOrderShare: 85.8,
    });
  });

  it("formats percentages with a sign and one decimal, and unknown as an em dash", () => {
    expect(pctLabel(-18.1)).toBe("-18.1%");
    expect(pctLabel(4)).toBe("+4.0%");
    expect(pctLabel(0)).toBe("0.0%");
    expect(pctLabel(null)).toBe("—");
  });

  it("formats month/day labels and japanese weekdays", () => {
    expect(mdLabel("2026-07-05")).toBe("7/5");
    expect(mdLabel("")).toBe("");
    expect(weekdayJp("2026-07-30")).toBe("木");
    expect(weekdayJp("")).toBe("");
    expect(weekdayJp("not-a-date")).toBe("");
  });

  it("builds an empty spark path for an empty series", () => {
    expect(spark([], 600, 124, 0, 1)).toEqual({ line: "", area: "" });
  });

  it("centers a single-point spark", () => {
    // 7px top padding + 7px bottom padding over a 124px box → the mid value lands at 62.
    expect(spark([5], 600, 124, 0, 10).line).toBe("M 300.00 62.00");
  });

  it("keeps the series inside the vertical padding and closes the area path", () => {
    const many = spark([0, 5, 10], 600, 124, 0, 10);

    expect(many.line.startsWith("M 0.00 117.00")).toBe(true);
    expect(many.line.endsWith("600.00 7.00")).toBe(true);
    expect(many.area.endsWith("L 600.00 124.00 L 0 124.00 Z")).toBe(true);
  });

  it("treats null and undefined as nil but keeps 0 as a real value", () => {
    expect(isNil(null)).toBe(true);
    expect(isNil(undefined)).toBe(true);
    expect(isNil(0)).toBe(false);
  });
});
