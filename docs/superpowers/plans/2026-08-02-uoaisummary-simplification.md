# UO AI 经营总结简化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `uoaisummary` 的模型输入从四份重复切法收敛为一份、输出从 5 块收敛为 3 块、UI 从 9 区块收敛为两层，并让出荷数据完全退出分析链路。

**Architecture:** 服务端保留现有的「采集 → 归一化 → 调模型 → 持久化」四段结构，只替换归一化层的产物：`metrics`（15 条确定性指标，唯一数值真源）、`attentionShops`（≤5 家跨源合并的异常店铺）、`reviewSamples`（≤10 条脱敏差评）。人类可读标签从服务端移到浏览器 i18n，`metricDisplay` 整块退场。UI 改为「结论 + 待办」常驻、「指标 + 数据源」默认折叠。

**Tech Stack:** Next.js 14 pages router、React 18、Tailwind（`theme-*` CSS 变量色板）、next-i18next、Vitest（node 环境，组件测试用 `/** @vitest-environment jsdom */` + `@testing-library/react`）、OpenAI Node SDK 的 Responses API。

## Global Constraints

- 设计依据：`docs/superpowers/specs/2026-08-02-uoaisummary-simplification-design.md`。与该 spec 冲突时以 spec 为准。
- 全部工作在当前分支 `feat/uo-ai-executive-summary` 上完成，不合并到 `dev`。
- 测试命令：`pnpm vitest run <path>` 跑单文件，`pnpm test` 跑全量。**禁止**使用 `npm` 或 `yarn`（仓库有 `only-allow pnpm`）。
- Lint：`pnpm lint`。提交前至少对改动文件跑过一次。
- 保留的 15 个指标键，键名一字不改（保证与已有 snapshot 的环比继续可用）：
  `shipping.today_output.total`、`shipping.active_shops`、`shipping.tomorrow.total`、
  `attention.open_total`、`attention.pending_orders`、`attention.unanswered_inquiries`、`attention.overdue_inquiries`、`attention.unreplied_reviews`、
  `sales.realtime_yen`、`sales.orders`、`sales.aov_yen`、`sales.realtime_vs_seven_day_avg_percent`、
  `performance.traffic.visit`、`performance.traffic.delta_percent`、`performance.mix.new_sales_share`
- 删除的 13 个指标键：`shipping.shipping.total`、`shipping.shipping.yesterday_total`、`shipping.shipping.vs_yesterday_percent`、`attention.rating_1`、`attention.rating_2`、`attention.rating_3`、`sales.seven_day_total_yen`、`sales.seven_day_avg_yen`、`sales.seven_day_orders`、`sales.seven_day_cvr`、`performance.traffic.unique_visitors`、`performance.traffic.expected_visit`、`performance.mix.repeat_sales_share`
- `unit` 取值域固定为 `"count" | "yen" | "percent"`。
- `note` 取值域固定为 `"actual" | "predicted" | "yesterday" | null`，只有 `shipping.tomorrow.total` 会有非 `null` 值。
- 模型输入体积上限 16000 字节（原 50000）。
- 不改动生成节奏、冷却、单进程调度、代理安全模型、配置字段、四个上游 widget。
- 所有面向浏览器的文案必须三语齐全（`public/locales/{ja,zh-Hans,en}/common.json`），`locales.test.js` 会强制键对齐。
- i18n 键 `uoaisummary.metric.<metricKey>` 里的 `metricKey` **保留原始的点号**（如 `uoaisummary.metric.sales.realtime_yen`）。项目未覆写 `keySeparator`，但 i18next 的 `deepFind` 会逐段回退拼接剩余路径，这种写法已实测可正确解析。**不要**把点号改成下划线。

---

## File Structure

| 文件 | 责任 | 变化 |
|---|---|---|
| `src/widgets/uoaisummary/metrics.mjs` | 指标定义、指标条目构造、出力数值辅助 | **新建**，约 150 行 |
| `src/widgets/uoaisummary/metrics.test.js` | 指标层测试 | **新建** |
| `src/widgets/uoaisummary/analysis-input.mjs` | 组装 modelInput：severity/dataQuality、attentionShops、reviewSamples、截断、snapshot | 716 → 约 200 行 |
| `src/widgets/uoaisummary/analysis-input.test.js` | 组装层测试 | 改写 |
| `src/widgets/uoaisummary/summary-schema.mjs` | 模型输出 JSON Schema 与校验 | 141 → 约 80 行 |
| `src/widgets/uoaisummary/summary-schema.test.js` | 输出校验测试 | 改写 |
| `src/widgets/uoaisummary/summary-store.mjs` | 缓存归一化与原子读写 | 白名单、`normalizeMetrics`、version 2 |
| `src/widgets/uoaisummary/summary-store.test.js` | 缓存测试 | 改写 |
| `src/widgets/uoaisummary/summary-service.mjs` | 调度、单飞、持久化 | `latest.metricDisplay` → `latest.metrics` |
| `src/widgets/uoaisummary/summary-service.test.js` | 服务测试 | 局部改写 |
| `src/widgets/uoaisummary/source-client.mjs` | 四个源的读取与新鲜度 | 放开 `today_shipping` 校验 |
| `src/widgets/uoaisummary/source-client.test.js` | 源读取测试 | 新增一例 |
| `src/widgets/uoaisummary/responses-client.mjs` | 模型请求与响应解析 | 提示词、`max_output_tokens` |
| `src/widgets/uoaisummary/responses-client.test.js` | 模型客户端测试 | 局部改写 |
| `src/widgets/uoaisummary/component.jsx` | 组件容器：取数、语言、冷却、折叠状态 | 407 → 约 160 行 |
| `src/widgets/uoaisummary/summary-header.jsx` | 状态点、标题、时刻、运行态、两个按钮 | **新建**，约 60 行 |
| `src/widgets/uoaisummary/action-list.jsx` | 待办纵向列表 | **新建**，约 50 行 |
| `src/widgets/uoaisummary/metric-strip.jsx` | 折叠条、7 条指标、数据源摘要 | **新建**，约 100 行 |
| `src/widgets/uoaisummary/component.test.jsx` | 组件测试 | 改写 |
| `src/widgets/uoaisummary/summary-integration.test.js` | 端到端 | 改写 |
| `public/locales/{ja,zh-Hans,en}/common.json` | 三语文案 | 增删键 |
| `docs/widgets/services/uoaisummary.md` | 用户文档 | 同步 |

---

## Task 1: 指标层独立成文件并收敛到 15 条

**Files:**
- Create: `src/widgets/uoaisummary/metrics.mjs`
- Create: `src/widgets/uoaisummary/metrics.test.js`
- Modify: `src/widgets/uoaisummary/analysis-input.mjs`
- Modify: `src/widgets/uoaisummary/source-client.mjs:28-31`
- Modify: `src/widgets/uoaisummary/summary-store.mjs:5-34`
- Test: `src/widgets/uoaisummary/metrics.test.js`、`src/widgets/uoaisummary/source-client.test.js`

**Interfaces:**
- Produces:
  - `METRIC_DEFINITIONS: Array<[key: string, source: string, read: (data) => unknown, unit: "count"|"yen"|"percent", noteRead?: (data) => string]>` — 15 条
  - `METRIC_LABELS: Record<string, { ja: string, zh: string }>` — 15 条（临时，Task 3 删除）
  - `metric(key, source, value, unit, previousMetrics, note = null) => { key, source, value, unit, previousValue, delta, deltaPercent, note }`
  - `tomorrowOutput(data) => { mode: "actual"|"predicted"|"yesterday", total: number|null }`
  - `numberOrNull(value) => number|null`
  - `sumNullable(values: unknown[]) => number|null`

- [ ] **Step 1: 写失败测试**

创建 `src/widgets/uoaisummary/metrics.test.js`：

```js
import { describe, expect, it } from "vitest";

import { METRIC_DEFINITIONS, METRIC_LABELS, metric, numberOrNull, sumNullable, tomorrowOutput } from "./metrics.mjs";

const KEYS = METRIC_DEFINITIONS.map(([key]) => key);

describe("METRIC_DEFINITIONS", () => {
  it("keeps exactly the fifteen approved metric keys", () => {
    expect(KEYS).toEqual([
      "shipping.today_output.total",
      "shipping.active_shops",
      "shipping.tomorrow.total",
      "attention.open_total",
      "attention.pending_orders",
      "attention.unanswered_inquiries",
      "attention.overdue_inquiries",
      "attention.unreplied_reviews",
      "sales.realtime_yen",
      "sales.orders",
      "sales.aov_yen",
      "sales.realtime_vs_seven_day_avg_percent",
      "performance.traffic.visit",
      "performance.traffic.delta_percent",
      "performance.mix.new_sales_share",
    ]);
  });

  it("drops every shipping metric that describes 出荷", () => {
    expect(KEYS.filter((key) => key.startsWith("shipping.shipping."))).toEqual([]);
  });

  it("uses only the three approved units", () => {
    expect([...new Set(METRIC_DEFINITIONS.map(([, , , unit]) => unit))].sort()).toEqual(["count", "percent", "yen"]);
  });

  it("labels every metric in both languages", () => {
    expect(Object.keys(METRIC_LABELS).sort()).toEqual([...KEYS].sort());
    KEYS.forEach((key) => {
      expect(METRIC_LABELS[key].ja.length).toBeGreaterThan(0);
      expect(METRIC_LABELS[key].zh.length).toBeGreaterThan(0);
    });
  });

  it("attaches a note reader only to tomorrow output", () => {
    expect(METRIC_DEFINITIONS.filter(([, , , , noteRead]) => noteRead).map(([key]) => key)).toEqual([
      "shipping.tomorrow.total",
    ]);
  });
});

describe("tomorrowOutput", () => {
  it("prefers the confirmed quantity", () => {
    expect(tomorrowOutput({ tomorrow_output: { total_quantity: 90, total_predicted_quantity: 40 } })).toEqual({
      mode: "actual",
      total: 90,
    });
  });

  it("falls back to the predicted quantity", () => {
    expect(tomorrowOutput({ tomorrow_output: { total_quantity: 0, total_predicted_quantity: 40 } })).toEqual({
      mode: "predicted",
      total: 40,
    });
  });

  it("falls back to yesterday output when tomorrow is empty", () => {
    expect(tomorrowOutput({ tomorrow_output: {}, yesterday_output: { total_quantity: 55 } })).toEqual({
      mode: "yesterday",
      total: 55,
    });
  });
});

describe("metric", () => {
  it("computes the delta against the previous snapshot", () => {
    expect(metric("sales.orders", "sales", 12, "count", { "sales.orders": 10 })).toEqual({
      key: "sales.orders",
      source: "sales",
      value: 12,
      unit: "count",
      previousValue: 10,
      delta: 2,
      deltaPercent: 20,
      note: null,
    });
  });

  it("keeps null values null instead of treating them as zero", () => {
    const result = metric("sales.orders", "sales", null, "count", { "sales.orders": 10 });
    expect(result.value).toBeNull();
    expect(result.delta).toBeNull();
    expect(result.deltaPercent).toBeNull();
  });

  it("carries the note through", () => {
    expect(metric("shipping.tomorrow.total", "shipping", 5, "count", {}, "predicted").note).toBe("predicted");
  });
});

describe("helpers", () => {
  it("treats empty strings as null", () => {
    expect(numberOrNull("")).toBeNull();
    expect(numberOrNull("7")).toBe(7);
  });

  it("returns null when every summand is unknown", () => {
    expect(sumNullable([null, undefined])).toBeNull();
    expect(sumNullable([null, 3, 4])).toBe(7);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm vitest run src/widgets/uoaisummary/metrics.test.js
```

Expected: FAIL，`Failed to resolve import "./metrics.mjs"`。

- [ ] **Step 3: 创建 metrics.mjs**

```js
export function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function sumNullable(values) {
  const known = values.map(numberOrNull).filter((value) => value !== null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
}

export function tomorrowOutput(data) {
  const actual = numberOrNull(data?.tomorrow_output?.total_quantity) || 0;
  const predicted = numberOrNull(data?.tomorrow_output?.total_predicted_quantity) || 0;
  if (actual > 0) return { mode: "actual", total: actual };
  if (predicted > 0) return { mode: "predicted", total: predicted };
  return { mode: "yesterday", total: numberOrNull(data?.yesterday_output?.total_quantity) };
}

export function metric(key, source, value, unit, previousMetrics, note = null) {
  const candidate = value === null || value === undefined ? null : Number(value);
  const normalized = Number.isFinite(candidate) ? candidate : null;
  const previousCandidate = previousMetrics?.[key];
  const previousValue =
    previousCandidate !== null && previousCandidate !== undefined && Number.isFinite(Number(previousCandidate))
      ? Number(previousCandidate)
      : null;
  const delta = normalized === null || previousValue === null ? null : normalized - previousValue;
  const deltaPercent = delta === null || previousValue === 0 ? null : (delta / Math.abs(previousValue)) * 100;
  return { key, source, value: normalized, unit, previousValue, delta, deltaPercent, note };
}

export const METRIC_DEFINITIONS = [
  ["shipping.today_output.total", "shipping", (d) => d.today_output?.total_quantity, "count"],
  ["shipping.active_shops", "shipping", (d) => d.today_output?.active_shops_count, "count"],
  ["shipping.tomorrow.total", "shipping", (d) => tomorrowOutput(d).total, "count", (d) => tomorrowOutput(d).mode],
  [
    "attention.open_total",
    "attention",
    (d) =>
      sumNullable([d.summary?.pendingOrderCount, d.summary?.unansweredInquiryCount, d.summary?.unrepliedReviewCount]),
    "count",
  ],
  ["attention.pending_orders", "attention", (d) => d.summary?.pendingOrderCount, "count"],
  ["attention.unanswered_inquiries", "attention", (d) => d.summary?.unansweredInquiryCount, "count"],
  ["attention.overdue_inquiries", "attention", (d) => d.summary?.overdueInquiryCount, "count"],
  ["attention.unreplied_reviews", "attention", (d) => d.summary?.unrepliedReviewCount, "count"],
  ["sales.realtime_yen", "sales", (d) => d.sales?.totals?.salesYen, "yen"],
  ["sales.orders", "sales", (d) => d.sales?.totals?.orderCount, "count"],
  [
    "sales.aov_yen",
    "sales",
    (d) => {
      const sales = numberOrNull(d.sales?.totals?.salesYen);
      const orders = numberOrNull(d.sales?.totals?.orderCount);
      return orders > 0 && sales !== null ? sales / orders : null;
    },
    "yen",
  ],
  [
    "sales.realtime_vs_seven_day_avg_percent",
    "sales",
    (d) => {
      const realtime = numberOrNull(d.sales?.totals?.salesYen);
      const total = numberOrNull(d.history?.totals?.salesYen);
      const days = d.history?.range?.dates?.length || 0;
      const average = total !== null && days > 0 ? total / days : null;
      return realtime !== null && average > 0 ? (realtime / average) * 100 : null;
    },
    "percent",
  ],
  ["performance.traffic.visit", "performance", (d) => d.traffic?.visitCount, "count"],
  [
    "performance.traffic.delta_percent",
    "performance",
    (d) => (Number(d.traffic?.sampleCount) >= 3 ? d.traffic?.visitDeltaPercent : null),
    "percent",
  ],
  ["performance.mix.new_sales_share", "performance", (d) => d.customerMix?.new?.salesSharePercent, "percent"],
];

export const METRIC_LABELS = {
  "shipping.today_output.total": { ja: "今日出力", zh: "今日输出" },
  "shipping.active_shops": { ja: "稼働店舗", zh: "活跃店铺" },
  "shipping.tomorrow.total": { ja: "明日予定", zh: "明日计划" },
  "attention.open_total": { ja: "未対応合計", zh: "未处理合计" },
  "attention.pending_orders": { ja: "未確認注文", zh: "待确认订单" },
  "attention.unanswered_inquiries": { ja: "未回答問い合わせ", zh: "未回复咨询" },
  "attention.overdue_inquiries": { ja: "期限超過問い合わせ", zh: "逾期咨询" },
  "attention.unreplied_reviews": { ja: "未返信レビュー", zh: "未回复评价" },
  "sales.realtime_yen": { ja: "リアルタイム売上", zh: "实时销售额" },
  "sales.orders": { ja: "注文数", zh: "订单数" },
  "sales.aov_yen": { ja: "平均注文額", zh: "平均订单金额" },
  "sales.realtime_vs_seven_day_avg_percent": { ja: "7日完全日平均への到達率", zh: "相对7日完整日均达成率" },
  "performance.traffic.visit": { ja: "訪問数", zh: "访问数" },
  "performance.traffic.delta_percent": { ja: "基準差", zh: "基准差异" },
  "performance.mix.new_sales_share": { ja: "新規売上比率", zh: "新客销售占比" },
};
```

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm vitest run src/widgets/uoaisummary/metrics.test.js
```

Expected: PASS，21 个断言全绿。

- [ ] **Step 5: 让 analysis-input.mjs 改用 metrics.mjs**

在 `analysis-input.mjs` 顶部加导入：

```js
import { METRIC_DEFINITIONS, METRIC_LABELS, metric, numberOrNull, sumNullable, tomorrowOutput } from "./metrics.mjs";
```

删除 `analysis-input.mjs` 中这些本地定义：`metric`（第 44-55 行）、`numberOrNull`（第 80-84 行）、`sumNullable`（第 108-111 行）、`tomorrowOutput`（第 113-123 行）、整个 `METRIC_DEFINITIONS` 数组（第 125-271 行）。

把 `buildAnalysisInput` 里的 metrics 构造改成：

```js
  const metrics = Object.fromEntries(
    METRIC_DEFINITIONS.filter(([, source]) => VALID_STATES.has(collected[source]?.state)).map(
      ([key, source, read, unit, noteRead]) => [
        key,
        metric(
          key,
          source,
          read(collected[source].data),
          unit,
          previousMetrics,
          noteRead ? noteRead(collected[source].data) : null,
        ),
      ],
    ),
  );
```

把 `displayMetric` 改成从 `METRIC_LABELS` 取标签：

```js
function displayMetric(entry, comparisonWindow) {
  const labels = METRIC_LABELS[entry.key];
  const delta = entry.delta === null ? null : (entry.delta > 0 ? "+" : "") + formatValue(entry.delta, entry.unit);
  const minutes = comparisonWindow?.elapsedMinutes;
  const jaPeriod = Number.isFinite(minutes) ? "前" + minutes + "分" : "前回";
  const zhPeriod = Number.isFinite(minutes) ? "较" + minutes + "分钟前" : "较上次";
  const jaDelta = delta ? " (" + jaPeriod + " " + delta + ")" : "";
  const zhDelta = delta ? "（" + zhPeriod + " " + delta + "）" : "";
  return {
    rawValue: entry.value,
    ja: labels.ja + " " + formatValue(entry.value, entry.unit) + jaDelta,
    zh: labels.zh + " " + formatValue(entry.value, entry.unit) + zhDelta,
  };
}
```

`compactModules` 里 `tomorrow` 那段现在只需要 `mode` 和 `total`（`tomorrowOutput` 不再返回 `source`），保持：

```js
          tomorrow: {
            mode: tomorrowOutput(shipping).mode,
            total: tomorrowOutput(shipping).total,
          },
```

`formatValue` 本任务不动（它连同 `displayMetric` 会在 Task 3 一起删除，现在改它只会制造要丢弃的测试改动）。

- [ ] **Step 6: 放开 source-client 的出荷校验**

`src/widgets/uoaisummary/source-client.mjs` 第 28-31 行改为：

```js
  if (endpointName === "shipping") {
    requireString(data.updated_at);
    requireRecord(data.today_output);
  } else if (endpointName === "attention") {
```

- [ ] **Step 7: 为出荷校验补测试**

在 `src/widgets/uoaisummary/source-client.test.js` 末尾追加：

```js
it("keeps the shipping source usable when 出荷 data is absent", async () => {
  const fetcher = vi.fn(async () =>
    new Response(
      JSON.stringify({
        updated_at: "2026-08-01T09:59:00+09:00",
        today_output: { total_quantity: 749, active_shops_count: 6, shops: [] },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  );

  const collected = await collectBusinessSources(
    { shipping: { widget: { url: "http://shipping.invalid", refreshInterval: 30000 } } },
    { fetcher, nowTs: Date.parse("2026-08-01T09:59:30+09:00") },
  );

  expect(collected.shipping.state).toBe("fresh");
  expect(collected.shipping.error).toBeNull();
  expect(collected.shipping.data.today_output.total_quantity).toBe(749);
});
```

若该文件顶部尚未导入 `vi`，把 `import { describe, expect, it } from "vitest";` 改为 `import { describe, expect, it, vi } from "vitest";`。

- [ ] **Step 8: 同步 summary-store 的指标白名单**

`src/widgets/uoaisummary/summary-store.mjs` 第 5-34 行的 `METRIC_KEYS` 换成 15 条：

```js
const METRIC_KEYS = new Set([
  "shipping.today_output.total",
  "shipping.active_shops",
  "shipping.tomorrow.total",
  "attention.open_total",
  "attention.pending_orders",
  "attention.unanswered_inquiries",
  "attention.overdue_inquiries",
  "attention.unreplied_reviews",
  "sales.realtime_yen",
  "sales.orders",
  "sales.aov_yen",
  "sales.realtime_vs_seven_day_avg_percent",
  "performance.traffic.visit",
  "performance.traffic.delta_percent",
  "performance.mix.new_sales_share",
]);
```

- [ ] **Step 9: 修既有测试里对已删指标的引用**

```bash
pnpm vitest run src/widgets/uoaisummary/
```

按下表把测试里对已删指标的引用逐一替换（左列出现处一律换成右列）：

| 已删除的键 | 替换为 |
|---|---|
| `shipping.shipping.total`、`shipping.shipping.yesterday_total`、`shipping.shipping.vs_yesterday_percent` | `shipping.today_output.total` |
| `attention.rating_1`、`attention.rating_2`、`attention.rating_3` | `attention.unreplied_reviews` |
| `sales.seven_day_total_yen`、`sales.seven_day_avg_yen`、`sales.seven_day_orders`、`sales.seven_day_cvr` | `sales.realtime_vs_seven_day_avg_percent` |
| `performance.traffic.unique_visitors`、`performance.traffic.expected_visit` | `performance.traffic.visit` |
| `performance.mix.repeat_sales_share` | `performance.mix.new_sales_share` |

若替换后同一个用例里出现重复键，删掉重复的那条断言而不是保留两份。`analysis-input.test.js` 里断言指标总条数的地方改为 15。

- [ ] **Step 10: 跑全量测试与 lint**

```bash
pnpm vitest run src/widgets/uoaisummary/ && pnpm lint
```

Expected: 全部 PASS，lint 无 error。

- [ ] **Step 11: 提交**

```bash
git add src/widgets/uoaisummary/ && git commit -m "refactor(uoaisummary): reduce the metric set and retire 出荷 inputs"
```

---

## Task 2: severity 与数据新鲜度解耦

**Files:**
- Modify: `src/widgets/uoaisummary/analysis-input.mjs:63-78`
- Test: `src/widgets/uoaisummary/analysis-input.test.js`

**Interfaces:**
- Consumes: Task 1 的 `metrics.mjs`
- Produces: `buildAnalysisInput(...).severity` 语义变为「只反映业务异常」

- [ ] **Step 1: 写失败测试**

在 `src/widgets/uoaisummary/analysis-input.test.js` 中追加：

```js
describe("severity", () => {
  it("stays normal when a source is merely delayed", () => {
    const collected = fourSourceFixture();
    collected.sales.state = "delayed";
    collected.attention.data.status = "normal";
    collected.performance.data.traffic.status = "normal";

    const analysis = buildAnalysisInput(collected, { previousSnapshot: null, nowTs: Date.now() });

    expect(analysis.severity).toBe("normal");
    expect(analysis.sourceFreshness.sales.state).toBe("delayed");
  });

  it("reports critical when a business status is critical", () => {
    const collected = fourSourceFixture();
    collected.attention.data.status = "critical";

    expect(buildAnalysisInput(collected, { previousSnapshot: null, nowTs: Date.now() }).severity).toBe("critical");
  });

  it("reports attention when only traffic is degraded", () => {
    const collected = fourSourceFixture();
    collected.attention.data.status = "normal";
    collected.performance.data.traffic.status = "attention";

    expect(buildAnalysisInput(collected, { previousSnapshot: null, nowTs: Date.now() }).severity).toBe("attention");
  });

  it("reports unknown when fewer than two sources are usable", () => {
    const collected = fourSourceFixture();
    ["attention", "sales", "performance"].forEach((key) => {
      collected[key].state = "unavailable";
    });

    expect(buildAnalysisInput(collected, { previousSnapshot: null, nowTs: Date.now() }).severity).toBe("unknown");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm vitest run src/widgets/uoaisummary/analysis-input.test.js -t severity
```

Expected: 第一例 FAIL，`expected 'attention' to be 'normal'`（当前实现里 `sales.state !== "fresh"` 会把 severity 拉到 `attention`）。

- [ ] **Step 3: 改写 severity**

`analysis-input.mjs` 第 63-78 行整体替换为：

```js
function severity(collected, validCount) {
  if (validCount < 2) return "unknown";
  const statuses = [
    VALID_STATES.has(collected.attention?.state) ? collected.attention?.data?.status : null,
    VALID_STATES.has(collected.performance?.state) ? collected.performance?.data?.traffic?.status : null,
  ];
  if (statuses.includes("critical")) return "critical";
  if (statuses.includes("attention")) return "attention";
  return "normal";
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm vitest run src/widgets/uoaisummary/analysis-input.test.js
```

Expected: PASS。若其他既有用例依赖旧语义（源延迟 → attention），把那些用例的期望改成 `normal` 并在用例名里点明「延迟不再影响 severity」。

- [ ] **Step 5: 提交**

```bash
git add src/widgets/uoaisummary/ && git commit -m "fix(uoaisummary): keep source freshness out of the severity signal"
```

---

## Task 3: modelInput 收敛，metricDisplay 退场

**Files:**
- Modify: `src/widgets/uoaisummary/analysis-input.mjs`
- Modify: `src/widgets/uoaisummary/metrics.mjs`（删除 `METRIC_LABELS`）
- Modify: `src/widgets/uoaisummary/metrics.test.js`（删除 `METRIC_LABELS` 相关用例）
- Modify: `src/widgets/uoaisummary/summary-service.mjs:127-137`、`:202-218`
- Modify: `src/widgets/uoaisummary/summary-store.mjs:156-205`
- Test: `src/widgets/uoaisummary/analysis-input.test.js`、`src/widgets/uoaisummary/summary-store.test.js`、`src/widgets/uoaisummary/summary-service.test.js`

**Interfaces:**
- Consumes: Task 1 的 `METRIC_DEFINITIONS` / `metric()`；Task 2 的 `severity()`
- Produces:
  - `buildAnalysisInput(collected, { previousSnapshot, nowTs })` 返回 `{ severity, dataQuality, sourceCoverage, sourceFreshness, comparisonWindow, metrics, modelInput, snapshot }`（**不再有 `metricDisplay`**）
  - `modelInput = { capturedAtJST, severity, dataQuality, sourceCoverage, sourceFreshness, metrics, attentionShops, reviewSamples, comparisonWindow, caveats }`
  - `attentionShops: Array<{ shopName, issues: string[], pendingOrderCount, unansweredInquiryCount, overdueInquiryCount, unrepliedReviewCount, visitDeltaPercent, salesYen }>`，`issues` 取值 `"orders" | "inquiries" | "reviews" | "traffic"`
  - `persisted.latest.metrics: Array<{ key, unit, value, previousValue, delta, deltaPercent, note }>`
  - `getPublicState().metrics` 取代 `getPublicState().metricDisplay`

- [ ] **Step 1: 写失败测试**

把 `src/widgets/uoaisummary/analysis-input.test.js` 里所有针对 `modelInput.modules` / `modelInput.shops` / `modelInput.otherShops` / `modelInput.rankedProducts` / `metricDisplay` 的用例整体删除。

同时**删除**那条断言 `toBeLessThanOrEqual(50000)` 的旧体积用例——上限已降到 16000，该断言现在恒真，且它构造的压力字段 `performance.traffic.sevenDayTrend` 从来没有任何函数读取。它的职责由下面新增的 `shrinkToBudget` 用例组接手。

把导入行改为 `import { buildAnalysisInput, sanitizeReview, shrinkToBudget } from "./analysis-input.mjs";`，然后追加：

```js
describe("modelInput shape", () => {
  it("exposes exactly the four fact blocks and no restructured modules", () => {
    const analysis = buildAnalysisInput(fourSourceFixture(), { previousSnapshot: null, nowTs: Date.now() });

    expect(Object.keys(analysis.modelInput).sort()).toEqual([
      "attentionShops",
      "capturedAtJST",
      "caveats",
      "comparisonWindow",
      "dataQuality",
      "metrics",
      "reviewSamples",
      "severity",
      "sourceCoverage",
      "sourceFreshness",
    ]);
  });

  it("no longer produces display strings", () => {
    const analysis = buildAnalysisInput(fourSourceFixture(), { previousSnapshot: null, nowTs: Date.now() });
    expect(analysis.metricDisplay).toBeUndefined();
  });

  it("omits human labels from the metric entries", () => {
    const analysis = buildAnalysisInput(fourSourceFixture(), { previousSnapshot: null, nowTs: Date.now() });
    expect(Object.keys(analysis.modelInput.metrics[0]).sort()).toEqual([
      "delta",
      "deltaPercent",
      "key",
      "note",
      "previousValue",
      "source",
      "unit",
      "value",
    ]);
  });

  it("stays far below the sixteen kilobyte budget on a full four-source payload", () => {
    const analysis = buildAnalysisInput(fourSourceFixture(), { previousSnapshot: null, nowTs: Date.now() });
    expect(Buffer.byteLength(JSON.stringify(analysis.modelInput), "utf8")).toBeLessThan(16000);
  });
});

describe("attentionShops", () => {
  it("is empty when every shop is normal", () => {
    const collected = fourSourceFixture();
    collected.attention.data.shops = [{ shopName: "3911", status: "normal", unrepliedReviewCount: 30 }];
    collected.performance.data.shops = [];

    expect(buildAnalysisInput(collected, { previousSnapshot: null, nowTs: Date.now() }).modelInput.attentionShops).toEqual(
      [],
    );
  });

  it("merges the attention and traffic views of one shop", () => {
    const collected = fourSourceFixture();
    collected.attention.data.shops = [
      {
        shopName: "3911",
        status: "critical",
        pendingOrderCount: 4,
        unansweredInquiryCount: 0,
        overdueInquiryCount: 0,
        unrepliedReviewCount: 30,
      },
    ];
    collected.performance.data.shops = [
      { shopName: "3911", traffic: { status: "attention", visitDeltaPercent: -18, sampleCount: 5 } },
    ];

    const [shop] = buildAnalysisInput(collected, { previousSnapshot: null, nowTs: Date.now() }).modelInput
      .attentionShops;

    expect(shop.shopName).toBe("3911");
    expect(shop.issues.sort()).toEqual(["orders", "reviews", "traffic"]);
    expect(shop.pendingOrderCount).toBe(4);
    expect(shop.visitDeltaPercent).toBe(-18);
    expect(shop.salesYen).toBe(70000);
  });

  it("keeps critical shops ahead of attention shops and caps the list at five", () => {
    const collected = fourSourceFixture();
    collected.attention.data.shops = [
      { shopName: "a", status: "attention", pendingOrderCount: 1 },
      { shopName: "b", status: "attention", pendingOrderCount: 1 },
      { shopName: "c", status: "attention", pendingOrderCount: 1 },
      { shopName: "d", status: "attention", pendingOrderCount: 1 },
      { shopName: "e", status: "attention", pendingOrderCount: 1 },
      { shopName: "z", status: "critical", pendingOrderCount: 1 },
    ];
    collected.performance.data.shops = [];

    const shops = buildAnalysisInput(collected, { previousSnapshot: null, nowTs: Date.now() }).modelInput
      .attentionShops;

    expect(shops).toHaveLength(5);
    expect(shops[0].shopName).toBe("z");
  });

  it("hides the traffic delta when the baseline sample is too small", () => {
    const collected = fourSourceFixture();
    collected.attention.data.shops = [];
    collected.performance.data.shops = [
      { shopName: "3911", traffic: { status: "critical", visitDeltaPercent: -40, sampleCount: 2 } },
    ];

    const [shop] = buildAnalysisInput(collected, { previousSnapshot: null, nowTs: Date.now() }).modelInput
      .attentionShops;

    expect(shop.visitDeltaPercent).toBeNull();
  });
});

describe("attentionShops sales join", () => {
  it("matches shops whose names differ only by full-width characters", () => {
    const collected = fourSourceFixture();
    collected.attention.data.shops = [{ shopName: "３９１１", status: "critical", pendingOrderCount: 4 }];
    collected.performance.data.shops = [];
    collected.sales.data.sales.shops = [{ shopName: "３９１１", salesYen: 70000, orderCount: 14 }];

    const [shop] = buildAnalysisInput(collected, { previousSnapshot: null, nowTs: Date.now() }).modelInput
      .attentionShops;

    expect(shop.shopName).toBe("3911");
    expect(shop.salesYen).toBe(70000);
  });
});

describe("shrinkToBudget", () => {
  function oversized({ excerptChars, reviewCount = 10, shopCount = 5 }) {
    return {
      capturedAtJST: "2026-08-01 10:00:00 JST",
      severity: "attention",
      dataQuality: "complete",
      sourceCoverage: { valid: 4, total: 4 },
      sourceFreshness: {},
      metrics: Array.from({ length: 15 }, (_, index) => ({
        key: "metric.number." + index,
        source: "sales",
        value: index,
        unit: "count",
        previousValue: index,
        delta: 0,
        deltaPercent: 0,
        note: null,
      })),
      attentionShops: Array.from({ length: shopCount }, (_, index) => ({
        shopName: "店".repeat(40) + index,
        issues: ["orders"],
        pendingOrderCount: 1,
      })),
      reviewSamples: Array.from({ length: reviewCount }, () => ({
        shopName: "店舗",
        rating: 1,
        postedAtJST: "2026-08-01 09:00:00 JST",
        itemManagementNumber: "item",
        excerpt: "あ".repeat(excerptChars),
      })),
      comparisonWindow: { previousCapturedAtJST: "2026-08-01 09:00:00 JST", elapsedMinutes: 60, isHourly: true },
      caveats: ["NO_INTRADAY_SALES_BASELINE"],
    };
  }

  it("leaves a payload that already fits completely untouched", () => {
    const modelInput = oversized({ excerptChars: 20 });
    shrinkToBudget(modelInput);

    expect(modelInput.metrics[0]).toHaveProperty("delta");
    expect(modelInput.attentionShops).toHaveLength(5);
    expect(modelInput.reviewSamples).toHaveLength(10);
  });

  it("drops comparison fields first, then shops, and sacrifices reviews last", () => {
    const modelInput = oversized({ excerptChars: 600 });
    expect(Buffer.byteLength(JSON.stringify(modelInput), "utf8")).toBeGreaterThan(16000);

    shrinkToBudget(modelInput);

    expect(modelInput.metrics[0]).not.toHaveProperty("delta");
    expect(modelInput.metrics[0]).not.toHaveProperty("previousValue");
    expect(modelInput.metrics[0]).not.toHaveProperty("deltaPercent");
    expect(modelInput.metrics[0].value).toBe(0);
    expect(modelInput.attentionShops).toHaveLength(3);
    expect(modelInput.reviewSamples).toHaveLength(5);
    expect(Buffer.byteLength(JSON.stringify(modelInput), "utf8")).toBeLessThanOrEqual(16000);
  });

  it("stops before touching reviews when dropping comparison fields is already enough", () => {
    const modelInput = oversized({ excerptChars: 380 });
    expect(Buffer.byteLength(JSON.stringify(modelInput), "utf8")).toBeGreaterThan(16000);

    shrinkToBudget(modelInput);

    expect(modelInput.metrics[0]).not.toHaveProperty("delta");
    expect(modelInput.reviewSamples).toHaveLength(10);
  });

  it("refuses to send a payload it cannot shrink below the budget", () => {
    expect(() => shrinkToBudget(oversized({ excerptChars: 1200 }))).toThrow(/exceeds safe size/);
  });
});
```

`excerptChars` 的四个数值（20 / 380 / 600 / 1200）是按 UTF-8 下每个日文字符 3 字节估算的，用来把载荷分别落在「已达标」「只需第一级」「需要三级」「无法压到达标」四个区间。每个用例里的 `toBeGreaterThan(16000)` 前置断言就是这个估算的守卫：**如果任何一条前置断言或长度断言不成立，调整 `excerptChars`，不要调整被断言的行为**。断言表达的顺序契约（比较字段先丢、店铺其次、评论最后、压不下去必抛）是本组用例的意图，不可改动。

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm vitest run src/widgets/uoaisummary/analysis-input.test.js
```

Expected: FAIL，`modelInput` 的键集合仍包含 `modules` / `shops` / `otherShops` / `rankedProducts`。

- [ ] **Step 3: 删除重组层**

从 `analysis-input.mjs` 中整体删除这些函数：`dataQuality` 之外的 `collectShops`、`collectProducts`、`topRows`、`keepAllowedShops`、`compactSourceStates`、`aggregateSalesDaily`、`compactSalesShops`、`compactModules`、`displayMetric`、`formatValue`、`safeDate`、`enumOrNull`、`ratingCounts`，以及常量 `MAX_PRODUCT_COUNT`。

同时删除 `metrics.mjs` 里的 `METRIC_LABELS` 导出，以及 `metrics.test.js` 里 `labels every metric in both languages` 这一用例和它的 `METRIC_LABELS` 导入。

- [ ] **Step 4: 新增 attentionShops 构造**

在 `analysis-input.mjs` 中加入：

```js
const SEVERITY_RANK = { critical: 2, attention: 1 };
const MAX_ATTENTION_SHOPS = 5;

function abnormal(status) {
  return status === "critical" || status === "attention";
}

function buildAttentionShops(collected) {
  const attentionRows = VALID_STATES.has(collected.attention?.state) ? collected.attention.data?.shops || [] : [];
  const performanceRows = VALID_STATES.has(collected.performance?.state)
    ? collected.performance.data?.shops || []
    : [];
  const salesByName = new Map(
    (VALID_STATES.has(collected.sales?.state) ? collected.sales.data?.sales?.shops || [] : [])
      .map((shop) => [safeText(shop.shopName, 80), shop])
      .filter(([name]) => name),
  );

  const merged = new Map();
  const upsert = (name, rank) => {
    const existing = merged.get(name) || {
      shopName: name,
      rank: 0,
      issues: [],
      pendingOrderCount: null,
      unansweredInquiryCount: null,
      overdueInquiryCount: null,
      unrepliedReviewCount: null,
      visitDeltaPercent: null,
    };
    existing.rank = Math.max(existing.rank, rank);
    merged.set(name, existing);
    return existing;
  };

  for (const shop of attentionRows) {
    const name = safeText(shop.shopName, 80);
    if (!name || !abnormal(shop.status)) continue;
    const entry = upsert(name, SEVERITY_RANK[shop.status]);
    entry.pendingOrderCount = numberOrNull(shop.pendingOrderCount);
    entry.unansweredInquiryCount = numberOrNull(shop.unansweredInquiryCount);
    entry.overdueInquiryCount = numberOrNull(shop.overdueInquiryCount);
    entry.unrepliedReviewCount = numberOrNull(shop.unrepliedReviewCount);
    if (entry.pendingOrderCount > 0) entry.issues.push("orders");
    if (entry.unansweredInquiryCount > 0 || entry.overdueInquiryCount > 0) entry.issues.push("inquiries");
    if (entry.unrepliedReviewCount > 0) entry.issues.push("reviews");
  }

  for (const shop of performanceRows) {
    const name = safeText(shop.shopName, 80);
    if (!name || !abnormal(shop.traffic?.status)) continue;
    const entry = upsert(name, SEVERITY_RANK[shop.traffic.status]);
    entry.visitDeltaPercent =
      Number(shop.traffic?.sampleCount) >= 3 ? numberOrNull(shop.traffic?.visitDeltaPercent) : null;
    entry.issues.push("traffic");
  }

  return [...merged.values()]
    .sort((left, right) => right.rank - left.rank || left.shopName.localeCompare(right.shopName))
    .slice(0, MAX_ATTENTION_SHOPS)
    .map(({ rank, ...entry }) => ({
      ...entry,
      salesYen: numberOrNull(salesByName.get(entry.shopName)?.salesYen),
    }));
}
```

- [ ] **Step 5: 新增截断策略**

在 `analysis-input.mjs` 中把常量与截断循环替换为：

```js
const MAX_MODEL_INPUT_BYTES = 16000;

export function shrinkToBudget(modelInput) {
  if (byteLength(modelInput) <= MAX_MODEL_INPUT_BYTES) return;
  modelInput.metrics = modelInput.metrics.map(({ key, source, value, unit, note }) => ({
    key,
    source,
    value,
    unit,
    note,
  }));
  if (byteLength(modelInput) <= MAX_MODEL_INPUT_BYTES) return;
  modelInput.attentionShops = modelInput.attentionShops.slice(0, 3);
  if (byteLength(modelInput) <= MAX_MODEL_INPUT_BYTES) return;
  modelInput.reviewSamples = modelInput.reviewSamples.slice(0, 5);
  if (byteLength(modelInput) > MAX_MODEL_INPUT_BYTES) {
    throw new AISummaryError("source_unavailable", "Normalized AI input exceeds safe size");
  }
}
```

- [ ] **Step 6: 改写 buildAnalysisInput 的返回**

把 `buildAnalysisInput` 尾部（原第 652-716 行）替换为：

```js
  const reviewSamples = (
    VALID_STATES.has(collected.attention?.state) ? collected.attention?.data?.recentReviews || [] : []
  )
    .filter((review) => {
      const rating = Number(review.rating);
      return Number.isInteger(rating) && rating >= 1 && rating <= 3;
    })
    .sort(
      (left, right) =>
        Number(left.rating) - Number(right.rating) || String(right.postedAtJST).localeCompare(String(left.postedAtJST)),
    )
    .slice(0, MAX_REVIEW_COUNT)
    .map(sanitizeReview);
  const sourceCoverage = { valid: validCount, total: 4 };
  const quality = dataQuality(collected, validCount);
  const level = severity(collected, validCount);
  const modelInput = {
    capturedAtJST: formatJST(nowTs),
    severity: level,
    dataQuality: quality,
    sourceCoverage,
    sourceFreshness,
    metrics: Object.values(metrics),
    attentionShops: buildAttentionShops(collected),
    reviewSamples,
    comparisonWindow,
    caveats: ["NO_INTRADAY_SALES_BASELINE"],
  };
  if (comparisonWindow && !comparisonWindow.isHourly) {
    modelInput.caveats.push("PREVIOUS_SNAPSHOT_INTERVAL_IS_NOT_ONE_HOUR");
  }

  shrinkToBudget(modelInput);

  const snapshot = {
    capturedAtJST: modelInput.capturedAtJST,
    metrics: Object.fromEntries(Object.entries(metrics).map(([key, entry]) => [key, entry.value])),
  };
  return {
    severity: level,
    dataQuality: quality,
    sourceCoverage,
    sourceFreshness,
    comparisonWindow,
    metrics,
    modelInput,
    snapshot,
  };
```

- [ ] **Step 7: 跑测试确认通过**

```bash
pnpm vitest run src/widgets/uoaisummary/analysis-input.test.js src/widgets/uoaisummary/metrics.test.js
```

Expected: PASS。

- [ ] **Step 8: 把 metricDisplay 从服务层换成 metrics**

`summary-service.mjs` 第 127-137 行的 `persisted.latest` 赋值改为：

```js
    persisted.latest = {
      severity: analysis.severity,
      dataQuality: analysis.dataQuality,
      generatedAtJST,
      sourceCoverage: analysis.sourceCoverage,
      sourceFreshness: analysis.sourceFreshness,
      summary: generated.summary,
      metrics: Object.values(analysis.metrics),
    };
```

第 202-218 行 `getPublicState` 里的 `metricDisplay: persisted.latest?.metricDisplay || {},` 改为：

```js
      metrics: persisted.latest?.metrics || [],
```

- [ ] **Step 9: 把 metricDisplay 从缓存层换成 metrics**

`summary-store.mjs` 第 156-171 行的 `normalizeMetricDisplay` 整体替换为：

```js
const METRIC_UNITS = new Set(["count", "yen", "percent"]);
const METRIC_NOTES = new Set(["actual", "predicted", "yesterday"]);

function normalizeMetrics(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) =>
      isRecord(entry) && METRIC_KEYS.has(entry.key) && METRIC_UNITS.has(entry.unit)
        ? {
            key: entry.key,
            unit: entry.unit,
            value: numberOrNull(entry.value),
            previousValue: numberOrNull(entry.previousValue),
            delta: numberOrNull(entry.delta),
            deltaPercent: numberOrNull(entry.deltaPercent),
            note: METRIC_NOTES.has(entry.note) ? entry.note : null,
          }
        : null,
    )
    .filter(Boolean);
}
```

第 203 行 `metricDisplay: normalizeMetricDisplay(value.metricDisplay),` 改为：

```js
    metrics: normalizeMetrics(value.metrics),
```

- [ ] **Step 10: 更新缓存与服务测试**

`summary-store.test.js`、`summary-service.test.js`、`summary-integration.test.js` 里所有 `metricDisplay` 的构造与断言换成 `metrics` 数组形态。示例断言：

```js
it("keeps only whitelisted metric entries", () => {
  const state = normalizeStateForTest({
    version: 1,
    latest: {
      ...validLatest,
      metrics: [
        { key: "sales.orders", unit: "count", value: 20, previousValue: 18, delta: 2, deltaPercent: 11.1, note: null },
        { key: "sales.seven_day_cvr", unit: "percent", value: 3.2, previousValue: null, delta: null, deltaPercent: null, note: null },
        { key: "sales.orders", unit: "furlong", value: 1, previousValue: null, delta: null, deltaPercent: null, note: null },
      ],
    },
  });

  expect(state.latest.metrics).toEqual([
    { key: "sales.orders", unit: "count", value: 20, previousValue: 18, delta: 2, deltaPercent: 11.1, note: null },
  ]);
});
```

（`normalizeStateForTest` 用该文件已有的读取入口替代——若文件走的是 `createSummaryStore({ configDir }).read()`，就写入临时文件后读回。）

- [ ] **Step 11: 跑全量测试与 lint**

```bash
pnpm vitest run src/widgets/uoaisummary/ && pnpm lint
```

Expected: 除 `component.test.jsx`（Task 8 处理）外全部 PASS。若 `component.test.jsx` 因 `metricDisplay` 缺失而失败，在本任务里把它的 fixture 改成 `metrics` 数组、断言暂时保留旧 UI 结构；Task 8 会整体重写。

- [ ] **Step 12: 提交**

```bash
git add src/widgets/uoaisummary/ && git commit -m "refactor(uoaisummary): collapse the model input into one fact set"
```

---

## Task 4: 模型输出收敛到三块

**Files:**
- Modify: `src/widgets/uoaisummary/summary-schema.mjs`
- Modify: `src/widgets/uoaisummary/summary-store.mjs:75-122`
- Test: `src/widgets/uoaisummary/summary-schema.test.js`、`src/widgets/uoaisummary/summary-store.test.js`

**Interfaces:**
- Consumes: Task 3 的 `metricKeys` 集合语义不变（来自 `summary-service.mjs` 中有值的指标键）
- Produces:
  - `SUMMARY_JSON_SCHEMA` 顶层 `required: ["headline", "assessment", "actions"]`
  - `validateModelSummary(value, { metricKeys }) => { headline, assessment, actions }`
  - `actions[].metricKey: string | null`

- [ ] **Step 1: 写失败测试**

把 `src/widgets/uoaisummary/summary-schema.test.js` 中所有 `evidence` / `reviewThemes` 用例删除，改写为：

```js
import { describe, expect, it } from "vitest";

import { SUMMARY_JSON_SCHEMA, validateModelSummary } from "./summary-schema.mjs";

const metricKeys = new Set(["sales.orders", "attention.open_total"]);

function validSummary(overrides = {}) {
  return {
    headline: { ja: "全社は平常運転です。", zh: "全社正常运转。" },
    assessment: { ja: "売上と流量は基準内です。", zh: "销售与流量在基准内。" },
    actions: [
      {
        priority: "high",
        module: "attention",
        shopName: "3911",
        metricKey: "attention.open_total",
        title: { ja: "未対応を処理", zh: "处理待办" },
        reason: { ja: "締切に間に合いません。", zh: "赶不上截止时间。" },
      },
    ],
    ...overrides,
  };
}

describe("SUMMARY_JSON_SCHEMA", () => {
  it("requires exactly three top-level blocks", () => {
    expect(SUMMARY_JSON_SCHEMA.required).toEqual(["headline", "assessment", "actions"]);
    expect(Object.keys(SUMMARY_JSON_SCHEMA.properties).sort()).toEqual(["actions", "assessment", "headline"]);
  });

  it("requires every action property so strict mode accepts it", () => {
    expect(SUMMARY_JSON_SCHEMA.properties.actions.items.required).toEqual([
      "priority",
      "module",
      "shopName",
      "metricKey",
      "title",
      "reason",
    ]);
  });
});

describe("validateModelSummary", () => {
  it("accepts a single action", () => {
    expect(validateModelSummary(validSummary(), { metricKeys })).toEqual(validSummary());
  });

  it("accepts a null metric key", () => {
    const summary = validSummary();
    summary.actions[0].metricKey = null;
    expect(validateModelSummary(summary, { metricKeys }).actions[0].metricKey).toBeNull();
  });

  it("rejects a metric key that was not collected", () => {
    const summary = validSummary();
    summary.actions[0].metricKey = "sales.seven_day_cvr";
    expect(() => validateModelSummary(summary, { metricKeys })).toThrow(/action metric is unknown/);
  });

  it("rejects leftover evidence or reviewThemes fields", () => {
    expect(() => validateModelSummary(validSummary({ evidence: [] }), { metricKeys })).toThrow(
      /summary contains unexpected fields/,
    );
    expect(() => validateModelSummary(validSummary({ reviewThemes: [] }), { metricKeys })).toThrow(
      /summary contains unexpected fields/,
    );
  });

  it("rejects an empty action list", () => {
    expect(() => validateModelSummary(validSummary({ actions: [] }), { metricKeys })).toThrow(
      /actions length is invalid/,
    );
  });

  it("rejects a headline longer than the budget", () => {
    const summary = validSummary();
    summary.headline.ja = "あ".repeat(81);
    expect(() => validateModelSummary(summary, { metricKeys })).toThrow(/headline\.ja is invalid/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm vitest run src/widgets/uoaisummary/summary-schema.test.js
```

Expected: FAIL，`SUMMARY_JSON_SCHEMA.required` 仍是五项。

- [ ] **Step 3: 改写 summary-schema.mjs**

整个文件替换为：

```js
import { AISummaryError } from "./errors.mjs";

function localized(maxJa, maxZh) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["ja", "zh"],
    properties: {
      ja: { type: "string", minLength: 1, maxLength: maxJa },
      zh: { type: "string", minLength: 1, maxLength: maxZh },
    },
  };
}

export const SUMMARY_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "assessment", "actions"],
  properties: {
    headline: localized(80, 60),
    assessment: localized(300, 220),
    actions: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["priority", "module", "shopName", "metricKey", "title", "reason"],
        properties: {
          priority: { type: "string", enum: ["high", "medium", "low"] },
          module: { type: "string", enum: ["shipping", "attention", "sales", "performance"] },
          shopName: { type: ["string", "null"] },
          metricKey: { type: ["string", "null"] },
          title: localized(80, 60),
          reason: localized(200, 150),
        },
      },
    },
  },
};

function schemaFailure(message) {
  throw new AISummaryError("model_schema", message);
}

function assertKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    schemaFailure(label + " must be an object");
  }
  const actual = Object.keys(value).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) {
    schemaFailure(label + " contains unexpected fields");
  }
}

function assertLocalized(value, label, maxJa, maxZh) {
  assertKeys(value, ["ja", "zh"], label);
  if (typeof value.ja !== "string" || value.ja.length < 1 || value.ja.length > maxJa) {
    schemaFailure(label + ".ja is invalid");
  }
  if (typeof value.zh !== "string" || value.zh.length < 1 || value.zh.length > maxZh) {
    schemaFailure(label + ".zh is invalid");
  }
}

export function validateModelSummary(value, { metricKeys }) {
  assertKeys(value, ["headline", "assessment", "actions"], "summary");
  assertLocalized(value.headline, "headline", 80, 60);
  assertLocalized(value.assessment, "assessment", 300, 220);

  if (!Array.isArray(value.actions) || value.actions.length < 1 || value.actions.length > 3) {
    schemaFailure("actions length is invalid");
  }
  value.actions.forEach((action, index) => {
    const label = "actions[" + index + "]";
    assertKeys(action, ["priority", "module", "shopName", "metricKey", "title", "reason"], label);
    if (!["high", "medium", "low"].includes(action.priority)) {
      schemaFailure("action priority is invalid");
    }
    if (!["shipping", "attention", "sales", "performance"].includes(action.module)) {
      schemaFailure("action module is invalid");
    }
    if (action.shopName !== null && typeof action.shopName !== "string") {
      schemaFailure("action shop is invalid");
    }
    if (action.metricKey !== null && (typeof action.metricKey !== "string" || !metricKeys.has(action.metricKey))) {
      schemaFailure("action metric is unknown");
    }
    assertLocalized(action.title, label + ".title", 80, 60);
    assertLocalized(action.reason, label + ".reason", 200, 150);
  });

  return structuredClone(value);
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm vitest run src/widgets/uoaisummary/summary-schema.test.js
```

Expected: PASS。

- [ ] **Step 5: 同步缓存归一化**

`summary-store.mjs` 第 75-122 行的 `normalizeSummary` 替换为：

```js
function normalizeSummary(value) {
  if (!isRecord(value)) return null;

  const headline = localized(value.headline);
  const assessment = localized(value.assessment);
  const actions = Array.isArray(value.actions)
    ? value.actions
        .map((entry) => {
          const title = localized(entry?.title);
          const reason = localized(entry?.reason);
          return isRecord(entry) &&
            ["high", "medium", "low"].includes(entry.priority) &&
            SOURCE_KEYS.includes(entry.module) &&
            (entry.shopName === null || typeof entry.shopName === "string") &&
            (entry.metricKey === null || METRIC_KEYS.has(entry.metricKey)) &&
            title &&
            reason
            ? {
                priority: entry.priority,
                module: entry.module,
                shopName: entry.shopName,
                metricKey: entry.metricKey,
                title,
                reason,
              }
            : null;
        })
        .filter(Boolean)
        .slice(0, 3)
    : [];

  if (!headline || !assessment || actions.length < 1) return null;
  return { headline, assessment, actions };
}
```

- [ ] **Step 6: 更新缓存测试**

`summary-store.test.js` 里所有 summary fixture 去掉 `evidence` 与 `reviewThemes`、给每条 action 加 `metricKey`。新增一例：

```js
it("drops an action whose metric key is not whitelisted", () => {
  const summary = {
    headline: { ja: "a", zh: "b" },
    assessment: { ja: "c", zh: "d" },
    actions: [
      {
        priority: "high",
        module: "sales",
        shopName: null,
        metricKey: "sales.seven_day_cvr",
        title: { ja: "e", zh: "f" },
        reason: { ja: "g", zh: "h" },
      },
    ],
  };

  expect(normalizeSummaryForTest(summary)).toBeNull();
});
```

（`normalizeSummaryForTest` 用该文件已有的读写入口实现：把 `latest.summary` 设为上面的对象写入临时缓存再读回，断言 `state.latest` 为 `null`。）

- [ ] **Step 7: 跑测试与 lint**

```bash
pnpm vitest run src/widgets/uoaisummary/ && pnpm lint
```

Expected: 除 `component.test.jsx` 外全部 PASS。

- [ ] **Step 8: 提交**

```bash
git add src/widgets/uoaisummary/ && git commit -m "refactor(uoaisummary): reduce the model output to headline, assessment, actions"
```

---

## Task 5: 提示词补强与输出上限收紧

**Files:**
- Modify: `src/widgets/uoaisummary/responses-client.mjs:6-11`、`:41-59`
- Test: `src/widgets/uoaisummary/responses-client.test.js`

**Interfaces:**
- Consumes: Task 4 的 `SUMMARY_JSON_SCHEMA`
- Produces: `buildResponsesBody({ config, modelInput })` 的 `max_output_tokens` 为 `3000`

- [ ] **Step 1: 写失败测试**

在 `src/widgets/uoaisummary/responses-client.test.js` 中追加：

```js
describe("buildResponsesBody", () => {
  const config = {
    model: "gpt-5.6-terra",
    reasoningEffort: "high",
    apiUrl: "https://ai.invalid/v1/responses",
    apiKey: "k",
    requestTimeout: 1000,
  };

  it("caps the output budget at three thousand tokens", () => {
    expect(buildResponsesBody({ config, modelInput: {} }).max_output_tokens).toBe(3000);
  });

  it("tells the model that one action is enough", () => {
    const { instructions } = buildResponsesBody({ config, modelInput: {} });
    expect(instructions).toMatch(/return exactly one low action instead of padding/i);
  });

  it("states the rule for each field the model has to decide about", () => {
    const { instructions } = buildResponsesBody({ config, modelInput: {} });
    expect(instructions).toMatch(/Set metricKey only when that metric is the evidence/i);
    expect(instructions).toMatch(/reviewSamples only when they point to a concrete fixable problem/i);
    expect(instructions).toMatch(/empty attentionShops list means every shop is normal/i);
  });

  it("defines all three priorities", () => {
    const { instructions } = buildResponsesBody({ config, modelInput: {} });
    expect(instructions).toMatch(/- high:/);
    expect(instructions).toMatch(/- medium:/);
    expect(instructions).toMatch(/- low:/);
  });
});
```

若文件顶部未导入 `buildResponsesBody`，把导入行改为
`import { buildResponsesBody, deriveOpenAIEndpoint, requestSummaryOnce } from "./responses-client.mjs";`（保留原有已导入的名字）。

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm vitest run src/widgets/uoaisummary/responses-client.test.js -t buildResponsesBody
```

Expected: FAIL，`expected 12000 to be 3000`。

- [ ] **Step 3: 改写提示词与上限**

`responses-client.mjs` 第 6-11 行替换为：

```js
const SYSTEM_INSTRUCTIONS = [
  "You produce an executive operating summary from JSON business data.",
  "Return Japanese and Simplified Chinese in the exact schema.",
  "Use only supplied facts and metric keys; do not invent values or treat null as zero.",
  "Recommend actions only; never claim an action was executed.",
  "",
  "Action priorities:",
  "- high: leaving it until tomorrow causes a measurable loss today.",
  "- medium: it should be confirmed within this week.",
  "- low: a record-keeping confirmation with no immediate impact.",
  "",
  "Action rules:",
  "- Write only actions that are worth doing. When nothing needs attention, return exactly one low action instead of padding the list.",
  "- Set metricKey only when that metric is the evidence for the action; otherwise set it to null.",
  "- Use reviewSamples only when they point to a concrete fixable problem; never summarise sentiment.",
  "- attentionShops is already filtered to abnormal shops. An empty attentionShops list means every shop is normal.",
].join("\n");
```

第 48 行 `max_output_tokens: 12000,` 改为：

```js
    max_output_tokens: 3000,
```

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm vitest run src/widgets/uoaisummary/responses-client.test.js
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/widgets/uoaisummary/responses-client.mjs src/widgets/uoaisummary/responses-client.test.js && git commit -m "feat(uoaisummary): teach the model when a single action is enough"
```

---

## Task 6: 缓存版本迁移

**Files:**
- Modify: `src/widgets/uoaisummary/summary-store.mjs:237-268`、`:286-300`
- Test: `src/widgets/uoaisummary/summary-store.test.js`

**Interfaces:**
- Produces: `emptySummaryState().version === 2`；`createSummaryStore(...).read()` 在读到 `version !== 2` 的文件时返回空状态且**不**重命名文件

- [ ] **Step 1: 写失败测试**

在 `src/widgets/uoaisummary/summary-store.test.js` 中追加（沿用该文件已有的临时目录 helper；若没有，用 `mkdtempSync(join(tmpdir(), "uoai-"))` 现场建一个）：

```js
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("cache version migration", () => {
  it("stamps new state with version 2", () => {
    expect(emptySummaryState().version).toBe(2);
  });

  it("resets a version 1 cache without marking it corrupt", () => {
    const configDir = mkdtempSync(join(tmpdir(), "uoai-v1-"));
    writeFileSync(
      join(configDir, "uo-ai-summary.json"),
      JSON.stringify({
        version: 1,
        latest: {
          severity: "attention",
          dataQuality: "complete",
          generatedAtJST: "2026-08-01 10:00:00 JST",
          sourceCoverage: { valid: 4, total: 4 },
          sourceFreshness: {
            shipping: { state: "fresh", updatedAtJST: null },
            attention: { state: "fresh", updatedAtJST: null },
            sales: { state: "fresh", updatedAtJST: null },
            performance: { state: "fresh", updatedAtJST: null },
          },
          summary: { headline: { ja: "a", zh: "b" }, assessment: { ja: "c", zh: "d" }, evidence: [], actions: [] },
          metricDisplay: {},
        },
        snapshots: [],
      }),
      "utf8",
    );

    const state = createSummaryStore({ configDir, now: () => 1 }).read();

    expect(state).toEqual(emptySummaryState());
    expect(readdirSync(configDir).filter((name) => name.includes("corrupt"))).toEqual([]);
  });

  it("still quarantines a version 2 file that cannot be parsed", () => {
    const configDir = mkdtempSync(join(tmpdir(), "uoai-bad-"));
    writeFileSync(join(configDir, "uo-ai-summary.json"), "{ not json", "utf8");

    expect(createSummaryStore({ configDir, now: () => 1 }).read()).toEqual(emptySummaryState());
    expect(readdirSync(configDir).filter((name) => name.includes("corrupt"))).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm vitest run src/widgets/uoaisummary/summary-store.test.js -t "cache version migration"
```

Expected: FAIL，`expected 1 to be 2`。

- [ ] **Step 3: 加版本常量与迁移分支**

在 `summary-store.mjs` 顶部常量区加入：

```js
const STATE_VERSION = 2;
```

`emptySummaryState`（第 237-248 行）的 `version: 1,` 改为 `version: STATE_VERSION,`。

`normalizeState`（第 254-256 行）的 `if (!value || value.version !== 1) return empty;` 改为：

```js
  if (!value || value.version !== STATE_VERSION) return empty;
```

`read()`（第 286-300 行）替换为：

```js
    read() {
      if (!existsSync(filePath)) return emptySummaryState();

      try {
        const parsed = JSON.parse(readFileSync(filePath, "utf8"));
        if (!parsed || parsed.version !== STATE_VERSION) return emptySummaryState();
        const state = normalizeState(parsed);
        if (parsed.latest !== null && parsed.latest !== undefined && state.latest === null) {
          throw new Error("Invalid cached summary");
        }
        return state;
      } catch {
        renameSync(filePath, `${filePath}.corrupt-${now()}`);
        return emptySummaryState();
      }
    },
```

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm vitest run src/widgets/uoaisummary/summary-store.test.js
```

Expected: PASS。既有用例里写死 `version: 1` 的 fixture 全部改成 `version: 2`。

- [ ] **Step 5: 提交**

```bash
git add src/widgets/uoaisummary/ && git commit -m "fix(uoaisummary): reset a stale cache version without quarantining it"
```

---

## Task 7: 三语文案

**Files:**
- Modify: `public/locales/ja/common.json`
- Modify: `public/locales/zh-Hans/common.json`
- Modify: `public/locales/en/common.json`
- Test: `src/widgets/uoaisummary/locales.test.js`

**Interfaces:**
- Produces: `uoaisummary.metric.<key>`（15 条）、`uoaisummary.metrics`、`uoaisummary.metricNote.predicted`、`uoaisummary.baseline`、`uoaisummary.sourceAllFresh`、`uoaisummary.sourceWorst`、`uoaisummary.sourceWorstMore`

- [ ] **Step 1: 写失败测试**

在 `src/widgets/uoaisummary/locales.test.js` 末尾追加：

```js
const METRIC_KEYS = [
  "shipping.today_output.total",
  "shipping.active_shops",
  "shipping.tomorrow.total",
  "attention.open_total",
  "attention.pending_orders",
  "attention.unanswered_inquiries",
  "attention.overdue_inquiries",
  "attention.unreplied_reviews",
  "sales.realtime_yen",
  "sales.orders",
  "sales.aov_yen",
  "sales.realtime_vs_seven_day_avg_percent",
  "performance.traffic.visit",
  "performance.traffic.delta_percent",
  "performance.mix.new_sales_share",
];

it("labels every metric key in every locale", () => {
  ["ja", "zh-Hans", "en"].forEach((locale) => {
    const uoaisummary = JSON.parse(readFileSync(resolve("public/locales", locale, "common.json"), "utf8")).uoaisummary;
    METRIC_KEYS.forEach((key) => {
      expect(uoaisummary.metric[key], `${locale} is missing ${key}`).toBeTruthy();
    });
  });
});

it("drops the copy for the removed blocks", () => {
  ["ja", "zh-Hans", "en"].forEach((locale) => {
    const uoaisummary = JSON.parse(readFileSync(resolve("public/locales", locale, "common.json"), "utf8")).uoaisummary;
    expect(uoaisummary.reviewThemes).toBeUndefined();
    expect(uoaisummary.coverage).toBeUndefined();
    expect(uoaisummary.showDetails).toBeUndefined();
    expect(uoaisummary.hideDetails).toBeUndefined();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm vitest run src/widgets/uoaisummary/locales.test.js
```

Expected: FAIL，`ja is missing shipping.today_output.total`。

- [ ] **Step 3: 改 ja**

`public/locales/ja/common.json` 的 `uoaisummary` 块：删除 `reviewThemes`、`coverage`、`showDetails`、`hideDetails` 四个键，追加：

```json
    "metrics": "指標",
    "baseline": "基準100%",
    "metricNote": {
      "predicted": "予測値"
    },
    "sourceAllFresh": "{{valid}}/{{total}} 最新",
    "sourceWorst": "{{valid}}/{{total}} · {{source}} {{state}}",
    "sourceWorstMore": "{{valid}}/{{total}} · {{source}} {{state}} +{{count}}",
    "metric": {
      "shipping.today_output.total": "今日出力",
      "shipping.active_shops": "稼働店舗",
      "shipping.tomorrow.total": "明日予定",
      "attention.open_total": "未対応",
      "attention.pending_orders": "未確認注文",
      "attention.unanswered_inquiries": "未回答問い合わせ",
      "attention.overdue_inquiries": "期限超過問い合わせ",
      "attention.unreplied_reviews": "未返信レビュー",
      "sales.realtime_yen": "リアルタイム売上",
      "sales.orders": "注文数",
      "sales.aov_yen": "平均注文額",
      "sales.realtime_vs_seven_day_avg_percent": "7日平均比",
      "performance.traffic.visit": "訪問数",
      "performance.traffic.delta_percent": "基準差",
      "performance.mix.new_sales_share": "新規売上比率"
    }
```

- [ ] **Step 4: 改 zh-Hans**

同样删除四个键，追加：

```json
    "metrics": "指标",
    "baseline": "基准100%",
    "metricNote": {
      "predicted": "预测值"
    },
    "sourceAllFresh": "{{valid}}/{{total}} 最新",
    "sourceWorst": "{{valid}}/{{total}} · {{source}} {{state}}",
    "sourceWorstMore": "{{valid}}/{{total}} · {{source}} {{state}} +{{count}}",
    "metric": {
      "shipping.today_output.total": "今日输出",
      "shipping.active_shops": "活跃店铺",
      "shipping.tomorrow.total": "明日计划",
      "attention.open_total": "未处理",
      "attention.pending_orders": "待确认订单",
      "attention.unanswered_inquiries": "未回复咨询",
      "attention.overdue_inquiries": "逾期咨询",
      "attention.unreplied_reviews": "未回复评价",
      "sales.realtime_yen": "实时销售额",
      "sales.orders": "订单数",
      "sales.aov_yen": "平均订单金额",
      "sales.realtime_vs_seven_day_avg_percent": "7日均值比",
      "performance.traffic.visit": "访问数",
      "performance.traffic.delta_percent": "基准差",
      "performance.mix.new_sales_share": "新客销售占比"
    }
```

- [ ] **Step 5: 改 en**

同样删除四个键，追加：

```json
    "metrics": "Metrics",
    "baseline": "Baseline 100%",
    "metricNote": {
      "predicted": "Predicted"
    },
    "sourceAllFresh": "{{valid}}/{{total}} fresh",
    "sourceWorst": "{{valid}}/{{total}} · {{source}} {{state}}",
    "sourceWorstMore": "{{valid}}/{{total}} · {{source}} {{state}} +{{count}}",
    "metric": {
      "shipping.today_output.total": "Output today",
      "shipping.active_shops": "Active shops",
      "shipping.tomorrow.total": "Planned tomorrow",
      "attention.open_total": "Open items",
      "attention.pending_orders": "Unconfirmed orders",
      "attention.unanswered_inquiries": "Unanswered inquiries",
      "attention.overdue_inquiries": "Overdue inquiries",
      "attention.unreplied_reviews": "Unreplied reviews",
      "sales.realtime_yen": "Live sales",
      "sales.orders": "Orders",
      "sales.aov_yen": "Average order value",
      "sales.realtime_vs_seven_day_avg_percent": "vs 7-day average",
      "performance.traffic.visit": "Visits",
      "performance.traffic.delta_percent": "vs baseline",
      "performance.mix.new_sales_share": "New-customer share"
    }
```

- [ ] **Step 6: 跑测试确认通过**

```bash
pnpm vitest run src/widgets/uoaisummary/locales.test.js
```

Expected: PASS，三语键完全对齐。

- [ ] **Step 7: 提交**

```bash
git add public/locales src/widgets/uoaisummary/locales.test.js && git commit -m "feat(uoaisummary): move metric labels into the locale files"
```

---

## Task 8: UI 重做

**Files:**
- Create: `src/widgets/uoaisummary/summary-header.jsx`
- Create: `src/widgets/uoaisummary/action-list.jsx`
- Create: `src/widgets/uoaisummary/metric-strip.jsx`
- Modify: `src/widgets/uoaisummary/component.jsx`
- Test: `src/widgets/uoaisummary/component.test.jsx`

**Interfaces:**
- Consumes: Task 3 的 `getPublicState().metrics`、Task 4 的 `summary.actions[].metricKey`、Task 7 的 locale 键
- Produces:
  - `<SummaryHeader generatedAtJST language onRefresh onSwitchLanguage refreshDisabled refreshPending runState severity t />`
  - `<ActionList actions language metricsByKey t />`
  - `<MetricStrip open onToggle metricsByKey sourceCoverage sourceFreshness t />`

- [ ] **Step 1: 写失败测试**

`src/widgets/uoaisummary/component.test.jsx` 的 `ready` fixture 改为新结构（去掉 `evidence` / `reviewThemes` / `metricDisplay`，加 `metrics`）：

```js
const ready = {
  state: "ready",
  severity: "attention",
  dataQuality: "complete",
  generatedAtJST: "2026-08-01 10:00:00 JST",
  nextScheduledAtJST: "2026-08-01 11:00:00 JST",
  sourceCoverage: { valid: 4, total: 4 },
  sourceFreshness: {
    shipping: { state: "fresh", updatedAtJST: "2026-08-01 09:59:00 JST" },
    attention: { state: "fresh", updatedAtJST: "2026-08-01 09:50:00 JST" },
    sales: { state: "delayed", updatedAtJST: "2026-08-01 09:45:00 JST" },
    performance: { state: "fresh", updatedAtJST: "2026-08-01 07:00:00 JST" },
  },
  cooldownUntilJST: null,
  lastError: null,
  summary: {
    headline: { ja: "対応待ち案件を優先してください。", zh: "请优先处理待办事项。" },
    assessment: { ja: "全体は安定しています。", zh: "整体稳定。" },
    actions: [
      {
        priority: "high",
        module: "attention",
        shopName: "3911",
        metricKey: "attention.open_total",
        title: { ja: "未対応案件を整理", zh: "梳理待办事项" },
        reason: { ja: "優先順を確認してください。", zh: "请确认处理优先级。" },
      },
    ],
  },
  metrics: [
    { key: "sales.realtime_yen", unit: "yen", value: 1240000, previousValue: 1420000, delta: -180000, deltaPercent: -12.7, note: null },
    { key: "sales.orders", unit: "count", value: 248, previousValue: 240, delta: 8, deltaPercent: 3.3, note: null },
    { key: "sales.realtime_vs_seven_day_avg_percent", unit: "percent", value: 88, previousValue: null, delta: null, deltaPercent: null, note: null },
    { key: "performance.traffic.visit", unit: "count", value: 8420, previousValue: null, delta: null, deltaPercent: null, note: null },
    { key: "performance.traffic.delta_percent", unit: "percent", value: -9, previousValue: null, delta: null, deltaPercent: null, note: null },
    { key: "attention.open_total", unit: "count", value: 58, previousValue: 46, delta: 12, deltaPercent: 26.1, note: null },
    { key: "shipping.today_output.total", unit: "count", value: 1860, previousValue: null, delta: null, deltaPercent: null, note: null },
    { key: "shipping.tomorrow.total", unit: "count", value: 2010, previousValue: null, delta: null, deltaPercent: null, note: "predicted" },
  ],
};
```

删除所有断言 `evidence` 卡片、`reviewThemes` 区、`データカバレッジ` 网格、`詳細を見る` / `詳細を閉じる` 的用例，追加：

```js
describe("cockpit layout", () => {
  beforeEach(() => {
    useWidgetAPI.mockReturnValue({ data: ready, error: null, mutate: vi.fn() });
  });

  it("shows the headline, assessment and action reason without expanding anything", () => {
    renderWithProviders(<Component service={{ widget: { type: "uoaisummary" } }} />);

    expect(screen.getByText("対応待ち案件を優先してください。")).toBeInTheDocument();
    expect(screen.getByText("全体は安定しています。")).toBeInTheDocument();
    expect(screen.getByText("未対応案件を整理")).toBeInTheDocument();
    expect(screen.getByText(/優先順を確認してください。/)).toBeInTheDocument();
  });

  it("keeps the metric strip closed by default", () => {
    renderWithProviders(<Component service={{ widget: { type: "uoaisummary" } }} />);

    expect(screen.queryByText("リアルタイム売上")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /指標/ })).toHaveAttribute("aria-expanded", "false");
  });

  it("reveals seven fixed metrics when the strip is opened", () => {
    renderWithProviders(<Component service={{ widget: { type: "uoaisummary" } }} />);
    fireEvent.click(screen.getByRole("button", { name: /指標/ }));

    ["リアルタイム売上", "注文数", "7日平均比", "訪問数", "未対応", "今日出力", "明日予定"].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
    expect(screen.getByText("¥1,240,000")).toBeInTheDocument();
    expect(screen.getByText("予測値")).toBeInTheDocument();
    expect(screen.getByText("基準100%")).toBeInTheDocument();
  });

  it("uses the traffic baseline delta as the visit secondary line", () => {
    renderWithProviders(<Component service={{ widget: { type: "uoaisummary" } }} />);
    fireEvent.click(screen.getByRole("button", { name: /指標/ }));

    expect(screen.getByText("-9.0%")).toBeInTheDocument();
  });

  it("never renders a raw metric key", () => {
    const { container } = renderWithProviders(<Component service={{ widget: { type: "uoaisummary" } }} />);
    fireEvent.click(screen.getByRole("button", { name: /指標/ }));

    expect(container.textContent).not.toMatch(/attention\.open_total/);
    expect(container.textContent).not.toMatch(/performance\.traffic/);
  });

  it("names the worst source in the freshness summary", () => {
    renderWithProviders(<Component service={{ widget: { type: "uoaisummary" } }} />);

    expect(screen.getByText("4/4 · 楽天売上 遅延")).toBeInTheDocument();
  });

  it("appends the referenced metric to the action reason", () => {
    renderWithProviders(<Component service={{ widget: { type: "uoaisummary" } }} />);

    expect(screen.getByText(/未対応 58/)).toBeInTheDocument();
  });

  it("marks the severity with a status dot instead of badges", () => {
    renderWithProviders(<Component service={{ widget: { type: "uoaisummary" } }} />);

    expect(screen.getByTestId("uoaisummary-status-dot")).toHaveAttribute("data-severity", "attention");
    expect(screen.queryByText("注意")).not.toBeInTheDocument();
  });
});
```

保留原文件中关于 loading skeleton、`NoSummary`、手动刷新、冷却、语言切换的用例，只把其中依赖旧结构的选择器改到新结构。

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm vitest run src/widgets/uoaisummary/component.test.jsx
```

Expected: FAIL，`Unable to find an element with the text: 指標`。

- [ ] **Step 3: 创建 summary-header.jsx**

```jsx
const STATUS_DOT = {
  normal: "bg-emerald-500",
  attention: "bg-amber-500",
  critical: "bg-rose-500",
  unknown: "bg-theme-400",
};

const CONTROL_CLASS =
  "rounded-lg border border-theme-300/60 px-2.5 py-1 text-xs font-bold text-theme-700 transition-colors hover:bg-theme-200/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-theme-600/60 dark:text-theme-200 dark:hover:bg-theme-700/50";

export default function SummaryHeader({
  generatedAtJST,
  language,
  onRefresh,
  onSwitchLanguage,
  refreshDisabled,
  refreshPending,
  runState,
  severity,
  t,
}) {
  return (
    <header className="flex flex-wrap items-center gap-2">
      <span
        aria-hidden="true"
        data-testid="uoaisummary-status-dot"
        data-severity={severity || "unknown"}
        className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[severity] || STATUS_DOT.unknown}`}
      />
      <span className="sr-only">{t(`uoaisummary.severity.${severity || "unknown"}`)}</span>
      <span className="truncate text-sm font-bold text-theme-900 dark:text-theme-50">{t("uoaisummary.title")}</span>
      <span className="text-xs text-theme-500 dark:text-theme-400">{generatedAtJST || "—"}</span>
      {runState ? (
        <span role="status" className="text-xs text-theme-500 dark:text-theme-400">
          · {t(`uoaisummary.${runState}`)}
        </span>
      ) : null}
      <span className="ml-auto flex items-center gap-2">
        <button type="button" onClick={onSwitchLanguage} className={CONTROL_CLASS}>
          {t(language === "ja" ? "uoaisummary.switchToChinese" : "uoaisummary.switchToJapanese")}
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshDisabled}
          aria-busy={refreshPending}
          className={CONTROL_CLASS}
        >
          {t("uoaisummary.reanalyze")}
        </button>
      </span>
    </header>
  );
}
```

- [ ] **Step 4: 创建 action-list.jsx**

```jsx
import { formatMetricValue } from "./metric-strip";

const PRIORITY_CLASS = {
  high: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  medium: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  low: "bg-theme-500/10 text-theme-700 dark:text-theme-200",
};

export default function ActionList({ actions, language, metricsByKey, t }) {
  return (
    <ul className="mt-4 flex flex-col">
      {actions.map((action, index) => {
        const referenced = action.metricKey ? metricsByKey[action.metricKey] : null;

        return (
          <li
            key={`${action.module}-${index}`}
            className="flex gap-2.5 border-t border-theme-300/30 py-3 dark:border-white/[0.06]"
          >
            <span
              className={`h-fit shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-bold ${
                PRIORITY_CLASS[action.priority] || PRIORITY_CLASS.low
              }`}
            >
              {t(`uoaisummary.priority.${action.priority}`)}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-theme-900 dark:text-theme-50">{action.title[language]}</p>
              <p className="mt-1 text-xs leading-5 text-theme-700 dark:text-theme-200">
                {action.reason[language]}
                {referenced ? (
                  <span className="ml-1.5 text-theme-500 dark:text-theme-400">
                    {t(`uoaisummary.metric.${referenced.key}`)} {formatMetricValue(referenced.value, referenced.unit)}
                  </span>
                ) : null}
                {action.shopName ? (
                  <span className="ml-1.5 text-theme-500 dark:text-theme-400">{action.shopName}</span>
                ) : null}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 5: 创建 metric-strip.jsx**

```jsx
const STRIP_KEYS = [
  "sales.realtime_yen",
  "sales.orders",
  "sales.realtime_vs_seven_day_avg_percent",
  "performance.traffic.visit",
  "attention.open_total",
  "shipping.today_output.total",
  "shipping.tomorrow.total",
];

const SOURCE_ORDER = ["shipping", "attention", "sales", "performance"];
const STATE_WEIGHT = { fresh: 0, delayed: 1, stale: 2, unavailable: 3 };

export function formatMetricValue(value, unit) {
  if (value === null || value === undefined) return "—";
  if (unit === "yen") return `¥${Math.round(value).toLocaleString("ja-JP")}`;
  if (unit === "percent") return `${Number(value).toFixed(1)}%`;
  return Math.round(value).toLocaleString("ja-JP");
}

function deltaText(entry) {
  if (!entry || entry.delta === null || entry.delta === undefined) return null;
  return `${entry.delta > 0 ? "+" : ""}${formatMetricValue(entry.delta, entry.unit)}`;
}

function secondaryLine(key, entry, metricsByKey, t) {
  if (key === "sales.realtime_vs_seven_day_avg_percent") return t("uoaisummary.baseline");
  if (key === "performance.traffic.visit") {
    const baseline = metricsByKey["performance.traffic.delta_percent"];
    return baseline && baseline.value !== null ? formatMetricValue(baseline.value, baseline.unit) : null;
  }
  if (key === "shipping.tomorrow.total" && entry?.note === "predicted") return t("uoaisummary.metricNote.predicted");
  return deltaText(entry);
}

export function sourceSummary({ sourceCoverage, sourceFreshness, t }) {
  const valid = sourceCoverage?.valid ?? 0;
  const total = sourceCoverage?.total ?? 4;
  const abnormal = SOURCE_ORDER.map((key) => [key, sourceFreshness?.[key]?.state || "unavailable"]).filter(
    ([, state]) => state !== "fresh",
  );
  if (!abnormal.length) return t("uoaisummary.sourceAllFresh", { valid, total });

  const worst = abnormal.reduce((left, right) => (STATE_WEIGHT[right[1]] > STATE_WEIGHT[left[1]] ? right : left));
  const params = {
    valid,
    total,
    source: t(`uoaisummary.source.${worst[0]}`),
    state: t(`uoaisummary.sourceState.${worst[1]}`),
    count: abnormal.length - 1,
  };
  return abnormal.length > 1 ? t("uoaisummary.sourceWorstMore", params) : t("uoaisummary.sourceWorst", params);
}

export default function MetricStrip({ metricsByKey, onToggle, open, sourceCoverage, sourceFreshness, t }) {
  return (
    <>
      <div className="flex items-center justify-between border-t border-theme-300/30 pt-3 dark:border-white/[0.06]">
        <button
          type="button"
          aria-controls="uoaisummary-metrics"
          aria-expanded={open}
          onClick={onToggle}
          className="rounded-lg border border-theme-300/60 px-2.5 py-1 text-xs font-bold text-theme-700 transition-colors hover:bg-theme-200/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-theme-600/60 dark:text-theme-200 dark:hover:bg-theme-700/50"
        >
          {t("uoaisummary.metrics")} {open ? "▲" : "▼"}
        </button>
        <span className="text-xs text-theme-500 dark:text-theme-400">
          {sourceSummary({ sourceCoverage, sourceFreshness, t })}
        </span>
      </div>
      {open ? (
        <dl
          id="uoaisummary-metrics"
          className="mt-3 grid grid-cols-2 gap-2.5 @2xl:grid-cols-4 @5xl:grid-cols-7"
        >
          {STRIP_KEYS.map((key) => {
            const entry = metricsByKey[key];
            const secondary = secondaryLine(key, entry, metricsByKey, t);

            return (
              <div key={key} className="rounded-lg bg-theme-200/30 p-2.5 dark:bg-white/[0.04]">
                <dt className="text-[11px] text-theme-500 dark:text-theme-400">{t(`uoaisummary.metric.${key}`)}</dt>
                <dd className="mt-0.5 text-base font-bold tabular-nums text-theme-900 dark:text-theme-50">
                  {formatMetricValue(entry?.value ?? null, entry?.unit)}
                </dd>
                {secondary ? (
                  <dd className="mt-0.5 text-[11px] text-theme-500 dark:text-theme-400">{secondary}</dd>
                ) : null}
              </div>
            );
          })}
        </dl>
      ) : null}
    </>
  );
}
```

- [ ] **Step 6: 改写 component.jsx 的 Cockpit**

把 `component.jsx` 中整个 `Cockpit` 函数（第 65-244 行）替换为：

```jsx
function Cockpit({
  cooldownActive,
  cooldownUntilJST,
  data,
  detailsOpen,
  language,
  onRefresh,
  onSwitchLanguage,
  onToggleDetails,
  refreshError,
  refreshPending,
  service,
  t,
}) {
  const runState =
    data.state === "running"
      ? "analyzing"
      : data.state === "stale" || data.state === "error"
        ? "stale"
        : data.state === "partial" || data.dataQuality === "partial"
          ? "partial"
          : null;
  const metricsByKey = Object.fromEntries((data.metrics || []).map((entry) => [entry.key, entry]));

  return (
    <Container service={service}>
      <div className="@container flex w-full min-w-0 flex-col gap-3 p-1.5">
        <SummaryHeader
          generatedAtJST={data.generatedAtJST}
          language={language}
          onRefresh={onRefresh}
          onSwitchLanguage={onSwitchLanguage}
          refreshDisabled={data.state === "running" || refreshPending || cooldownActive}
          refreshPending={data.state === "running" || refreshPending}
          runState={runState}
          severity={data.severity}
          t={t}
        />

        <RefreshFeedback cooldownUntilJST={cooldownUntilJST} refreshError={refreshError} t={t} />
        <ErrorFeedback lastError={data.lastError} role="alert" t={t} />

        <div>
          <p className="text-lg font-bold leading-relaxed text-theme-900 dark:text-theme-50">
            {data.summary.headline[language]}
          </p>
          <p className="mt-2 text-sm leading-6 text-theme-700 dark:text-theme-200">
            {data.summary.assessment[language]}
          </p>
          <ActionList actions={data.summary.actions} language={language} metricsByKey={metricsByKey} t={t} />
        </div>

        <MetricStrip
          metricsByKey={metricsByKey}
          onToggle={onToggleDetails}
          open={detailsOpen}
          sourceCoverage={data.sourceCoverage}
          sourceFreshness={data.sourceFreshness}
          t={t}
        />
      </div>
    </Container>
  );
}
```

在文件顶部加导入，并删除已不再使用的 `TONES` 与 `CONTROL_CLASS` 常量（`NoSummary` 里的按钮改用 `SummaryHeader` 同款类名字符串，直接内联即可）：

```jsx
import ActionList from "./action-list";
import MetricStrip from "./metric-strip";
import SummaryHeader from "./summary-header";
```

`Component` 里 `useState("ja")` 与 `useState(false)` 保持不变——`detailsOpen` 初值 `false` 即「折叠区默认关闭」。

`NoSummary` 的结构保持现状（它没有 severity 可显示），只把它内部那句 `tone` 的紫色分支换成中性色，与新的状态点语义一致：

```jsx
  const tone = isError
    ? "border-amber-400/40 bg-amber-500/10 text-amber-800 dark:text-amber-200"
    : "border-theme-300/50 bg-theme-200/30 text-theme-800 dark:border-theme-600/50 dark:bg-white/[0.04] dark:text-theme-100";
```

- [ ] **Step 7: 跑测试确认通过**

```bash
pnpm vitest run src/widgets/uoaisummary/component.test.jsx
```

Expected: PASS。

- [ ] **Step 8: 跑全量测试与 lint**

```bash
pnpm test && pnpm lint
```

Expected: 全绿。

- [ ] **Step 9: 提交**

```bash
git add src/widgets/uoaisummary/ && git commit -m "feat(uoaisummary): rebuild the cockpit around conclusion and actions"
```

---

## Task 9: 端到端验证与文档同步

**Files:**
- Modify: `src/widgets/uoaisummary/summary-integration.test.js`
- Modify: `docs/widgets/services/uoaisummary.md`

**Interfaces:**
- Consumes: 前八个任务的全部产物

- [ ] **Step 1: 更新端到端测试**

`summary-integration.test.js` 里模型响应的 fixture 改为三块结构、去掉 `evidence` / `reviewThemes`，并追加一例断言模型输入不含重组块：

```js
it("sends one fact set and never the restructured modules", async () => {
  const { modelRequests } = await runFullSummaryFlow();
  const modelInput = JSON.parse(modelRequests[0].body.input);

  expect(Object.keys(modelInput).sort()).toEqual([
    "attentionShops",
    "capturedAtJST",
    "caveats",
    "comparisonWindow",
    "dataQuality",
    "metrics",
    "reviewSamples",
    "severity",
    "sourceCoverage",
    "sourceFreshness",
  ]);
  expect(Buffer.byteLength(modelRequests[0].body.input, "utf8")).toBeLessThan(16000);
});

it("never exposes 出荷 quantities to the model", async () => {
  const { modelRequests } = await runFullSummaryFlow();
  const modelInput = JSON.parse(modelRequests[0].body.input);

  expect(modelInput.metrics.map((entry) => entry.key).filter((key) => key.startsWith("shipping.shipping."))).toEqual([]);
  expect(modelRequests[0].body.input).not.toContain("courier");
});
```

（`runFullSummaryFlow` 用该文件已有的端到端 helper 名替换；若它当前是内联的 `beforeEach`，把它抽成一个返回 `{ modelRequests }` 的函数。）

- [ ] **Step 2: 跑端到端测试**

```bash
pnpm vitest run src/widgets/uoaisummary/summary-integration.test.js
```

Expected: PASS。

- [ ] **Step 3: 同步用户文档**

`docs/widgets/services/uoaisummary.md` 第 48-56 行「Data and privacy」一节替换为：

```markdown
## Data and privacy

The server reads shipping output, operating attention, Rakuten sales, and company performance through their existing read-only endpoints. It normalizes them into one fact set: fifteen company-level metrics, at most five shops that are currently flagged as attention or critical, and at most ten low-rating review samples. Shipment counts, courier distribution, product rankings, and per-day sales trends are not sent to the model.

Displayed numbers come from server-owned metric keys; model prose is not the source of any figure. Metric labels are rendered from the locale files in the browser, so the model never receives or produces them.

Low-rating review samples are capped at ten, normalized, and truncated to 300 characters each before model submission. Their business content is otherwise preserved, so the operator controls which review data the configured model endpoint may receive.

The API credential and private model URL remain server-only. The browser and summary cache receive only the generated bilingual summary, the fifteen metrics, safe status fields, and usage counts; they do not receive the raw model request or response.

Model output is checked only for the required bilingual JSON structure and, when an action references one, a `metricKey` that exists in the collected metrics. The operator is responsible for any additional content policy applied through source selection, prompts, or the configured model endpoint.
```

第 68-72 行「Cache recovery」一节的第一段替换为：

```markdown
The local cache is `config/uo-ai-summary.json`, which is also Git-ignored. Writes use a temporary file and atomic rename. Only validated bilingual summaries, the fifteen metrics, usage counts, and up to 24 compact snapshots are retained; raw reviews and model bodies are not stored. The cache carries a schema version: a file written by an older release is silently discarded and regenerated, without being renamed.
```

- [ ] **Step 4: 跑全量测试与 lint**

```bash
pnpm test && pnpm lint
```

Expected: 全绿。

- [ ] **Step 5: 提交**

```bash
git add src/widgets/uoaisummary/ docs/widgets/services/uoaisummary.md && git commit -m "docs(uoaisummary): describe the reduced fact set and cache versioning"
```

---

## 验收清单

实现完成后逐条确认：

- [ ] `pnpm test` 全绿，`pnpm lint` 无 error
- [ ] `rg 'shipping\.shipping\.' src/` 无结果
- [ ] `rg 'metricDisplay' src/` 无结果
- [ ] `rg 'reviewThemes|compactModules|collectShops|rankedProducts' src/` 无结果
- [ ] `src/widgets/uoaisummary/analysis-input.mjs` 行数 < 250
- [ ] `src/widgets/uoaisummary/component.jsx` 行数 < 200
- [ ] 端到端测试断言的 `modelInput` 体积 < 16000 字节
- [ ] 浏览器里首屏不出现任何形如 `sales.realtime_yen` 的原始键
