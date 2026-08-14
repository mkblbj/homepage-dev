# 经营表现趋势状态 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让经营表现组件使用后端 `trendStatus` 显示公司和店铺的访问趋势，同时保留原有 `status` 告警语义。

**Architecture:** 数据模型只验证并映射后端趋势枚举，不在前端重复计算阈值。组件新增独立趋势文案和色彩映射，顶部公司徽标与店铺状态列使用趋势，来源健康状态和 AI 严重度继续使用原有 `status`。

**Tech Stack:** React、Next.js、Vitest、Testing Library、next-i18next、Tailwind CSS

## Global Constraints

- 允许的趋势值仅为 `surge`、`increase`、`stable`、`decrease`、`sharp_decrease`、`unknown`。
- 缺失或非法趋势值归一为 `unknown`。
- 样本数少于 3 时，店铺徽标优先显示“样本不足”。
- 不增加请求、轮询、RMS 抓取或前端阈值计算。
- 原有 `traffic.status` 继续用于告警严重度，AI 汇总逻辑不得改变。

---

### Task 1: 映射后端趋势字段

**Files:**

- Modify: `src/widgets/uoperformance/performance-model.mjs:1-172`
- Test: `src/widgets/uoperformance/performance-model.test.js:1-230`

**Interfaces:**

- Consumes: `/api/performance` 的 `traffic.trendStatus` 与 `shops[].traffic.trendStatus`
- Produces: `model.trendStatus` 与 `model.shops[].trendStatus`

- [x] **Step 1: 写入失败模型测试**

在测试快照的公司交通块加入 `trendStatus: "stable"`，店铺交通块加入 `trendStatus: "decrease"`，并断言：

```js
expect(model.trendStatus).toBe("stable");
expect(model.shops[0].trendStatus).toBe("decrease");
expect(
  buildPerformanceModel({
    ...snapshot,
    traffic: { ...snapshot.traffic, trendStatus: "unexpected" },
  }).trendStatus,
).toBe("unknown");
```

- [x] **Step 2: 运行模型测试并确认失败原因**

Run: `npm test -- src/widgets/uoperformance/performance-model.test.js`

Expected: FAIL，因为模型尚未输出 `trendStatus`。

- [x] **Step 3: 实现最小枚举归一化**

在 `performance-model.mjs` 中加入允许集合与私有归一化函数：

```js
const TREND_STATUSES = new Set(["surge", "increase", "stable", "decrease", "sharp_decrease", "unknown"]);

function trendStatus(value) {
  return TREND_STATUSES.has(value) ? value : "unknown";
}
```

公司与店铺映射均调用该函数，原有 `trafficStatus` 和 `status` 字段保持不变。

- [x] **Step 4: 运行模型测试确认通过**

Run: `npm test -- src/widgets/uoperformance/performance-model.test.js`

Expected: PASS。

### Task 2: 用趋势徽标替换可见健康徽标

**Files:**

- Modify: `src/widgets/uoperformance/component.jsx:41-80,451-525,726-785`
- Test: `src/widgets/uoperformance/component.test.jsx:20-450`

**Interfaces:**

- Consumes: Task 1 产出的 `model.trendStatus` 与 `model.shops[].trendStatus`
- Produces: 公司顶部趋势徽标、店铺趋势徽标、趋势颜色和样本不足降级

- [x] **Step 1: 写入失败组件测试**

更新组件测试快照以包含公司 `trendStatus: "stable"` 和店铺 `trendStatus: "decrease"`，再增加一个测试，把公司改为 `surge`、店铺改为 `increase`，断言真实组件渲染：

```js
expect(screen.getByText("uoperformance.trend.surge")).toBeInTheDocument();
expect(screen.getByText("uoperformance.trend.increase")).toBeInTheDocument();
expect(screen.queryByText("uoperformance.traffic.normal")).not.toBeInTheDocument();
```

再增加店铺 `sampleCount: 2` 的用例，断言其徽标为 `uoperformance.sampleShortShort`，而不是趋势文案。

- [x] **Step 2: 运行组件测试并确认失败原因**

Run: `npm test -- src/widgets/uoperformance/component.test.jsx`

Expected: FAIL，因为组件仍读取原有 `status` 文案。

- [x] **Step 3: 实现趋势色彩与文案映射**

在组件中新增 `TREND_TONE`、`trendToneOf()` 和 `trendLabelOf()`。公司 `tone` 与顶部徽标改用 `model.trendStatus`；店铺徽标改用 `sh.trendStatus`，但 `sampleCount < 3` 或涨跌值为空时仍使用未知色和样本不足文案。`SourceChip` 继续使用原有 `TONE`。

- [x] **Step 4: 运行组件测试确认通过**

Run: `npm test -- src/widgets/uoperformance/component.test.jsx`

Expected: PASS。

### Task 3: 补齐三语文案并验证兼容性

**Files:**

- Modify: `public/locales/en/common.json:1342-1400`
- Modify: `public/locales/ja/common.json:1342-1400`
- Modify: `public/locales/zh-Hans/common.json:1355-1412`
- Test: `src/widgets/uoperformance/locales.test.js:1-70`

**Interfaces:**

- Consumes: `uoperformance.trend.<value>` 翻译键
- Produces: 英文、日文、简体中文的趋势文案、趋势列标题和双向阈值说明

- [x] **Step 1: 写入失败多语言测试**

增加断言，确认每个语言都包含六个趋势键，并确认阈值说明同时包含 `+20`、`+35`、`−20`、`−35`。

```js
for (const locale of LOCALES) {
  const namespace = loadNamespace(locale);
  expect(Object.keys(namespace.trend).sort()).toEqual([
    "decrease",
    "increase",
    "sharp_decrease",
    "stable",
    "surge",
    "unknown",
  ]);
  for (const threshold of ["+20", "+35", "−20", "−35"]) {
    expect(namespace.thresholds).toContain(threshold);
  }
}
```

- [x] **Step 2: 运行多语言测试并确认失败原因**

Run: `npm test -- src/widgets/uoperformance/locales.test.js`

Expected: FAIL，因为 `trend` 翻译尚不存在且阈值只描述下降。

- [x] **Step 3: 增加文案**

三种语言加入 `trend` 对象；将 `statusCol` 改为 Trend/傾向/趋势；将阈值说明改为同时描述正向与负向阈值。保留旧 `traffic` 翻译键，避免破坏兼容性。

- [x] **Step 4: 运行经营表现测试**

Run: `npm test -- src/widgets/uoperformance`

Expected: 经营表现模型、组件和多语言测试全部 PASS。

- [x] **Step 5: 验证 AI 严重度逻辑未受影响**

Run: `npm test -- src/widgets/uoaisummary/analysis-input.test.js src/widgets/uoaisummary/source-client.test.js`

Expected: PASS，证明原有 `status` 仍控制严重度和异常店铺筛选。

- [x] **Step 6: 运行格式、差异和全量测试**

Run: `node_modules/.bin/prettier --check src/widgets/uoperformance public/locales/en/common.json public/locales/ja/common.json public/locales/zh-Hans/common.json docs/superpowers/plans/2026-08-14-uoperformance-trend-status.md && git diff --check && npm test`

Expected: 格式检查通过、无空白错误、全量测试 0 失败。

- [x] **Step 7: 提交实现**

```bash
git add src/widgets/uoperformance public/locales/en/common.json public/locales/ja/common.json public/locales/zh-Hans/common.json
git add -f docs/superpowers/plans/2026-08-14-uoperformance-trend-status.md
git commit -m "feat(uoperformance): display traffic trend status"
```
