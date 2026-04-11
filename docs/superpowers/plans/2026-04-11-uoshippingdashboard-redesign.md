# uoshippingdashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved `uoshippingdashboard` redesign with a content-level hero, reordered detail panels, and compact Japanese empty states for the usually-empty sections.

**Architecture:** The outer service card already renders icon, service name, and the ping/site-monitor badges in `src/components/services/item.jsx`, so this implementation must not duplicate title or icon inside the widget body. Extract a pure ESM dashboard model that owns metric order, section order, and empty-state policy so those decisions can be covered by `node:test`, then refactor `src/widgets/uoshippingdashboard/component.jsx` to consume that model and render the new hero + lighter detail panels.

**Tech Stack:** Next.js 15, React 18, next-i18next, Tailwind CSS 4, Node.js `node:test`

---

## File Map

- Create: `src/widgets/uoshippingdashboard/dashboard-model.mjs` — pure data shaping for summary order, section order, compact-empty metadata, and Japanese sort behavior.
- Create: `src/widgets/uoshippingdashboard/dashboard-model.test.mjs` — automated coverage for metric order, hero split, compact-empty policy, and shop/courier sorting.
- Create: `src/widgets/uoshippingdashboard/locales.test.mjs` — automated coverage for the new compact-empty translation keys in `ja`, `en`, and `zh-CN`.
- Modify: `src/widgets/uoshippingdashboard/component.jsx:1-467` — remove inline dashboard assembly, render the new content hero, compact empty cards, lighter panels, and updated skeleton.
- Modify: `public/locales/ja/common.json:1153-1164` — add the final Japanese compact-empty copy.
- Modify: `public/locales/en/common.json:1154-1165` — add English fallback copy for the new keys.
- Modify: `public/locales/zh-CN/common.json:766-777` — add Simplified Chinese fallback copy for the new keys.
- Reference only: `src/components/services/item.jsx:31-94` — proves the card title/icon/latency badge already live outside the widget body, so the in-widget hero starts below that header.

---

### Task 1: Extract a tested dashboard model for ordering and empty-state policy

**Files:**
- Create: `src/widgets/uoshippingdashboard/dashboard-model.mjs`
- Create: `src/widgets/uoshippingdashboard/dashboard-model.test.mjs`

- [ ] **Step 1: Write the failing model test first**

Create `src/widgets/uoshippingdashboard/dashboard-model.test.mjs` with this exact content:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { buildDashboardModel, normalizeCouriers, normalizeShops } from "./dashboard-model.mjs";

const labels = {
  activeShops: "稼働店舗",
  courierCount: "配送種別",
  todayOutput: "今日出力",
  yesterdayShipping: "昨日出荷",
  todayShipping: "今日出荷",
  tomorrowOutput: "明日予定",
};

const formatNumber = (value) => new Intl.NumberFormat("en-US").format(Number(value || 0));

const fixture = {
  updated_at: "2026-04-11 10:57:18",
  today_output: {
    date: "2026-04-11",
    total_quantity: 1190,
    active_shops_count: 8,
    shops_count: 19,
    shops: [
      { shop_id: 2, shop_name: "3911", category_name: "楽天", total_quantity: 363 },
      { shop_id: 1, shop_name: "十色生活", category_name: "楽天", total_quantity: 424 },
      { shop_id: 3, shop_name: "松武商店", category_name: "auShop", total_quantity: 273 },
      { shop_id: 4, shop_name: "在庫ゼロ", category_name: "auShop", total_quantity: 0 },
    ],
  },
  tomorrow_output: {
    date: "2026-04-12",
    total_quantity: 0,
    active_shops_count: 0,
    shops_count: 19,
    shops: [],
  },
  today_shipping: {
    date: "2026-04-11",
    total_quantity: 0,
    couriers_count: 0,
    couriers: [],
  },
  yesterday_shipping: {
    date: "2026-04-10",
    total_quantity: 898,
    couriers_count: 4,
    couriers: [
      { courier_id: 1, courier_name: "ゆうパケット (2CM)", total_quantity: 579 },
      { courier_id: 2, courier_name: "ゆうパケット (1CM)", total_quantity: 271 },
      { courier_id: 3, courier_name: "クリップポスト (3CM)", total_quantity: 42 },
    ],
  },
};

test("normalizeShops filters zero rows and sorts by quantity desc then name", () => {
  assert.deepEqual(
    normalizeShops(fixture.today_output).map((item) => item.shop_name),
    ["十色生活", "3911", "松武商店"],
  );
});

test("normalizeCouriers filters zero rows and sorts by quantity desc", () => {
  assert.deepEqual(
    normalizeCouriers(fixture.yesterday_shipping).map((item) => item.courier_name),
    ["ゆうパケット (2CM)", "ゆうパケット (1CM)", "クリップポスト (3CM)"],
  );
});

test("buildDashboardModel orders metrics and sections by the approved D/B layout", () => {
  const model = buildDashboardModel({ data: fixture, formatNumber, labels });

  assert.equal(model.updatedAt, "2026-04-11 10:57:18");
  assert.deepEqual(
    model.metrics.map((metric) => metric.id),
    ["today-output", "yesterday-shipping", "today-shipping", "tomorrow-output"],
  );
  assert.deepEqual(
    model.sections.map((section) => section.id),
    ["today-output", "yesterday-shipping", "today-shipping", "tomorrow-output"],
  );
  assert.equal(model.sections[0].statValue, "8/19");
  assert.equal(model.sections[1].statValue, "4");
});

test("buildDashboardModel marks the usually-empty panels as compact empty cards", () => {
  const model = buildDashboardModel({ data: fixture, formatNumber, labels });

  assert.equal(model.sections[2].id, "today-shipping");
  assert.equal(model.sections[2].emptyVariant, "compact");
  assert.equal(model.sections[2].emptyMessageKey, "noTodayShippingYet");
  assert.equal(model.sections[2].emptyHintKey, "waitingForUpdate");

  assert.equal(model.sections[3].id, "tomorrow-output");
  assert.equal(model.sections[3].emptyVariant, "compact");
  assert.equal(model.sections[3].emptyMessageKey, "noTomorrowScheduleYet");
  assert.equal(model.sections[3].emptyHintKey, "willAppearNextRefresh");

  assert.equal(model.sections[0].emptyVariant, "default");
  assert.equal(model.sections[1].emptyVariant, "default");
});
```

- [ ] **Step 2: Run the test to verify it fails because the model file does not exist yet**

Run:

```bash
node --test src/widgets/uoshippingdashboard/dashboard-model.test.mjs
```

Expected: FAIL with an `ERR_MODULE_NOT_FOUND` error pointing at `./dashboard-model.mjs`.

- [ ] **Step 3: Write the minimal model implementation**

Create `src/widgets/uoshippingdashboard/dashboard-model.mjs` with this exact content:

```js
const SECTION_ORDER = ["today-output", "yesterday-shipping", "today-shipping", "tomorrow-output"];
const COMPACT_EMPTY_SECTIONS = new Set(["today-shipping", "tomorrow-output"]);

export function normalizeCategoryName(categoryName) {
  return String(categoryName || "").trim();
}

export function sortByQuantityThenName(a, b, nameKey) {
  const quantityDiff = Number(b?.total_quantity || 0) - Number(a?.total_quantity || 0);
  if (quantityDiff !== 0) {
    return quantityDiff;
  }

  return String(a?.[nameKey] || "").localeCompare(String(b?.[nameKey] || ""), "ja");
}

export function normalizeShops(section) {
  if (!Array.isArray(section?.shops)) {
    return [];
  }

  return [...section.shops]
    .filter((shop) => Number(shop?.total_quantity || 0) > 0)
    .sort((a, b) => sortByQuantityThenName(a, b, "shop_name"));
}

export function normalizeCouriers(section) {
  if (!Array.isArray(section?.couriers)) {
    return [];
  }

  return [...section.couriers]
    .filter((courier) => Number(courier?.total_quantity || 0) > 0)
    .sort((a, b) => sortByQuantityThenName(a, b, "courier_name"));
}

function createMetric(id, label, value, formatNumber) {
  return {
    id,
    label,
    value: formatNumber(value),
  };
}

function createSection({ id, title, date, items, kind, statLabel, statValue, emptyMessageKey, emptyHintKey = null }) {
  return {
    id,
    title,
    date: date ?? null,
    items,
    kind,
    statLabel,
    statValue,
    emptyMessageKey,
    emptyHintKey,
    emptyVariant: COMPACT_EMPTY_SECTIONS.has(id) ? "compact" : "default",
  };
}

export function buildDashboardModel({ data, formatNumber, labels }) {
  const todayOutput = data?.today_output ?? null;
  const tomorrowOutput = data?.tomorrow_output ?? null;
  const todayShipping = data?.today_shipping ?? null;
  const yesterdayShipping = data?.yesterday_shipping ?? null;

  const sectionsById = {
    "today-output": createSection({
      id: "today-output",
      title: labels.todayOutput,
      date: todayOutput?.date,
      items: normalizeShops(todayOutput),
      kind: "shop",
      statLabel: labels.activeShops,
      statValue:
        todayOutput && Number(todayOutput?.shops_count || 0) > 0
          ? `${formatNumber(todayOutput?.active_shops_count)}/${formatNumber(todayOutput?.shops_count)}`
          : null,
      emptyMessageKey: "noOutputData",
    }),
    "yesterday-shipping": createSection({
      id: "yesterday-shipping",
      title: labels.yesterdayShipping,
      date: yesterdayShipping?.date,
      items: normalizeCouriers(yesterdayShipping),
      kind: "courier",
      statLabel: labels.courierCount,
      statValue:
        yesterdayShipping && Number(yesterdayShipping?.couriers_count || 0) > 0
          ? formatNumber(yesterdayShipping?.couriers_count)
          : null,
      emptyMessageKey: "noShippingData",
    }),
    "today-shipping": createSection({
      id: "today-shipping",
      title: labels.todayShipping,
      date: todayShipping?.date,
      items: normalizeCouriers(todayShipping),
      kind: "courier",
      statLabel: labels.courierCount,
      statValue:
        todayShipping && Number(todayShipping?.couriers_count || 0) > 0
          ? formatNumber(todayShipping?.couriers_count)
          : null,
      emptyMessageKey: "noTodayShippingYet",
      emptyHintKey: "waitingForUpdate",
    }),
    "tomorrow-output": createSection({
      id: "tomorrow-output",
      title: labels.tomorrowOutput,
      date: tomorrowOutput?.date,
      items: normalizeShops(tomorrowOutput),
      kind: "shop",
      statLabel: labels.activeShops,
      statValue:
        tomorrowOutput && Number(tomorrowOutput?.shops_count || 0) > 0
          ? `${formatNumber(tomorrowOutput?.active_shops_count)}/${formatNumber(tomorrowOutput?.shops_count)}`
          : null,
      emptyMessageKey: "noTomorrowScheduleYet",
      emptyHintKey: "willAppearNextRefresh",
    }),
  };

  const metricsById = {
    "today-output": createMetric("today-output", labels.todayOutput, todayOutput?.total_quantity, formatNumber),
    "yesterday-shipping": createMetric(
      "yesterday-shipping",
      labels.yesterdayShipping,
      yesterdayShipping?.total_quantity,
      formatNumber,
    ),
    "today-shipping": createMetric("today-shipping", labels.todayShipping, todayShipping?.total_quantity, formatNumber),
    "tomorrow-output": createMetric("tomorrow-output", labels.tomorrowOutput, tomorrowOutput?.total_quantity, formatNumber),
  };

  return {
    updatedAt: data?.updated_at ?? "",
    metrics: SECTION_ORDER.map((id) => metricsById[id]),
    sections: SECTION_ORDER.map((id) => sectionsById[id]),
  };
}
```

- [ ] **Step 4: Run the model test again and verify it passes**

Run:

```bash
node --test src/widgets/uoshippingdashboard/dashboard-model.test.mjs
```

Expected: PASS with 4 passing tests and no failures.

- [ ] **Step 5: Commit the tested model layer**

Run:

```bash
git add src/widgets/uoshippingdashboard/dashboard-model.mjs src/widgets/uoshippingdashboard/dashboard-model.test.mjs
git commit -m "test: add uoshippingdashboard dashboard model"
```

---

### Task 2: Add translation coverage and the final Japanese-first empty-state copy

**Files:**
- Create: `src/widgets/uoshippingdashboard/locales.test.mjs`
- Modify: `public/locales/ja/common.json:1153-1164`
- Modify: `public/locales/en/common.json:1154-1165`
- Modify: `public/locales/zh-CN/common.json:766-777`

- [ ] **Step 1: Write the failing locale coverage test**

Create `src/widgets/uoshippingdashboard/locales.test.mjs` with this exact content:

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const EXPECTED = {
  ja: {
    noTodayShippingYet: "本日の出荷はまだありません",
    noTomorrowScheduleYet: "明日の予定はまだありません",
    waitingForUpdate: "更新を待機中",
    willAppearNextRefresh: "次回更新で反映されます",
  },
  en: {
    noTodayShippingYet: "No shipments yet today",
    noTomorrowScheduleYet: "No schedule for tomorrow yet",
    waitingForUpdate: "Waiting for update",
    willAppearNextRefresh: "Will appear after the next refresh",
  },
  "zh-CN": {
    noTodayShippingYet: "今日暂时没有出荷",
    noTomorrowScheduleYet: "明日暂时没有预定",
    waitingForUpdate: "等待更新",
    willAppearNextRefresh: "将在下次刷新后显示",
  },
};

for (const [locale, expectedKeys] of Object.entries(EXPECTED)) {
  test(`${locale} exposes the compact empty-state copy`, () => {
    const filePath = path.join(process.cwd(), "public", "locales", locale, "common.json");
    const json = JSON.parse(fs.readFileSync(filePath, "utf8"));

    assert.ok(json.uoshippingdashboard, `${locale} is missing uoshippingdashboard`);

    for (const [key, value] of Object.entries(expectedKeys)) {
      assert.equal(json.uoshippingdashboard[key], value, `${locale}.${key} mismatch`);
    }
  });
}
```

- [ ] **Step 2: Run the locale test and verify it fails on the missing keys**

Run:

```bash
node --test src/widgets/uoshippingdashboard/locales.test.mjs
```

Expected: FAIL with assertions for missing `noTodayShippingYet`, `noTomorrowScheduleYet`, `waitingForUpdate`, and `willAppearNextRefresh`.

- [ ] **Step 3: Update the locale JSON blocks**

Apply these exact JSON additions.

In `public/locales/ja/common.json`, change the `uoshippingdashboard` block to:

```json
"uoshippingdashboard": {
  "allPlatforms": "全部",
  "loading": "読み込み中...",
  "refresh": "更新",
  "updatedAt": "更新時刻",
  "todayOutput": "今日出力",
  "tomorrowOutput": "明日予定",
  "todayShipping": "今日出荷",
  "yesterdayShipping": "昨日出荷",
  "activeShops": "稼働店舗",
  "courierCount": "配送種別",
  "noShippingData": "出荷データがありません",
  "noOutputData": "出力データがありません",
  "noTodayShippingYet": "本日の出荷はまだありません",
  "noTomorrowScheduleYet": "明日の予定はまだありません",
  "waitingForUpdate": "更新を待機中",
  "willAppearNextRefresh": "次回更新で反映されます"
}
```

In `public/locales/en/common.json`, change the `uoshippingdashboard` block to:

```json
"uoshippingdashboard": {
  "allPlatforms": "All",
  "loading": "Loading...",
  "refresh": "Refresh",
  "updatedAt": "Updated",
  "todayOutput": "Today's Output",
  "tomorrowOutput": "Tomorrow's Planned Output",
  "todayShipping": "Today's Shipping",
  "yesterdayShipping": "Yesterday's Shipping",
  "activeShops": "Active Shops",
  "courierCount": "Couriers",
  "noShippingData": "No shipping data",
  "noOutputData": "No output data",
  "noTodayShippingYet": "No shipments yet today",
  "noTomorrowScheduleYet": "No schedule for tomorrow yet",
  "waitingForUpdate": "Waiting for update",
  "willAppearNextRefresh": "Will appear after the next refresh"
}
```

In `public/locales/zh-CN/common.json`, change the `uoshippingdashboard` block to:

```json
"uoshippingdashboard": {
  "allPlatforms": "全部",
  "loading": "加载中...",
  "refresh": "更新",
  "updatedAt": "更新时间",
  "todayOutput": "今日出力",
  "tomorrowOutput": "明日预定",
  "todayShipping": "今日出荷",
  "yesterdayShipping": "昨日出荷",
  "activeShops": "活跃店铺",
  "courierCount": "快递数",
  "noShippingData": "暂无出荷数据",
  "noOutputData": "暂无出力数据",
  "noTodayShippingYet": "今日暂时没有出荷",
  "noTomorrowScheduleYet": "明日暂时没有预定",
  "waitingForUpdate": "等待更新",
  "willAppearNextRefresh": "将在下次刷新后显示"
}
```

- [ ] **Step 4: Run both automated tests and verify they pass together**

Run:

```bash
node --test src/widgets/uoshippingdashboard/dashboard-model.test.mjs src/widgets/uoshippingdashboard/locales.test.mjs
```

Expected: PASS with all locale assertions and model assertions green.

- [ ] **Step 5: Commit the locale coverage and copy updates**

Run:

```bash
git add public/locales/ja/common.json public/locales/en/common.json public/locales/zh-CN/common.json src/widgets/uoshippingdashboard/locales.test.mjs
git commit -m "feat: add uoshippingdashboard empty-state copy"
```

---

### Task 3: Refactor the widget UI to use a content hero, reordered panels, and compact empty cards

**Files:**
- Modify: `src/widgets/uoshippingdashboard/dashboard-model.mjs`
- Modify: `src/widgets/uoshippingdashboard/dashboard-model.test.mjs`
- Modify: `src/widgets/uoshippingdashboard/component.jsx:1-467`
- Reference: `src/components/services/item.jsx:31-94`

- [ ] **Step 1: Extend the model test to describe the final hero split used by the JSX layer**

Append this test to `src/widgets/uoshippingdashboard/dashboard-model.test.mjs`:

```js
test("buildDashboardModel exposes one primary hero metric and three secondary hero metrics", () => {
  const model = buildDashboardModel({ data: fixture, formatNumber, labels });

  assert.equal(model.hero.primaryMetric.id, "today-output");
  assert.deepEqual(
    model.hero.secondaryMetrics.map((metric) => metric.id),
    ["yesterday-shipping", "today-shipping", "tomorrow-output"],
  );
  assert.equal(model.hero.primaryMetric.value, "1,190");
  assert.equal(model.hero.secondaryMetrics[0].value, "898");
});
```

- [ ] **Step 2: Run the model test and verify it fails because `hero` is not returned yet**

Run:

```bash
node --test src/widgets/uoshippingdashboard/dashboard-model.test.mjs
```

Expected: FAIL with `Cannot read properties of undefined (reading 'primaryMetric')`.

- [ ] **Step 3: Update the model return shape and refactor `component.jsx` to consume it**

First, change the end of `src/widgets/uoshippingdashboard/dashboard-model.mjs` to return `hero` instead of the flat `metrics` array:

```js
  const metrics = SECTION_ORDER.map((id) => metricsById[id]);
  const [primaryMetric, ...secondaryMetrics] = metrics;

  return {
    updatedAt: data?.updated_at ?? "",
    hero: {
      primaryMetric,
      secondaryMetrics,
    },
    sections: SECTION_ORDER.map((id) => sectionsById[id]),
  };
}
```

Then update `src/widgets/uoshippingdashboard/component.jsx` as follows.

Replace the top-level helper section/imports with:

```jsx
import Container from "components/services/widget/container";
import { useTranslation } from "next-i18next";
import { useCallback, useMemo, useState } from "react";

import { buildDashboardModel, normalizeCategoryName } from "./dashboard-model.mjs";
import useWidgetAPI from "utils/proxy/use-widget-api";

const DEFAULT_REFRESH_INTERVAL = 30000;

function formatNumber(t, value) {
  return t("common.number", { value: Number(value) || 0 });
}
```

Keep `getCategoryTone`, `getSectionCategories`, `filterItemsByCategory`, `getCategoryTotals`, and `resolveActiveCategory`, but remove the old inline `normalizeCategoryName`, `normalizeShops`, `normalizeCouriers`, and `SummaryCard` definitions.

Add these three replacement UI components above `Panel`:

```jsx
function HeroMetric({ label, primary = false, value }) {
  return (
    <div
      className={primary
        ? "rounded-2xl border border-theme-200/35 bg-black/20 px-4 py-3 text-left shadow-sm dark:border-theme-700/40 dark:bg-black/20"
        : "rounded-2xl border border-theme-200/20 bg-white/5 px-3 py-3 text-left dark:border-theme-700/30 dark:bg-white/5"
      }
    >
      <div className={primary
        ? "text-[2rem] font-semibold leading-none tabular-nums text-theme-50"
        : "text-xl font-semibold leading-none tabular-nums text-theme-50"
      }>
        {value}
      </div>
      <div className="mt-1 text-[11px] font-medium text-theme-200/90">{label}</div>
    </div>
  );
}

function HeroHeader({ hero, onRefresh, t, updatedAt }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-theme-200/35 bg-gradient-to-br from-theme-200/20 via-theme-100/10 to-theme-300/10 p-3 shadow-sm dark:border-theme-700/40 dark:from-theme-900/35 dark:via-theme-900/10 dark:to-black/10">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-theme-600 dark:text-theme-300">
            {t("uoshippingdashboard.updatedAt")}
          </div>
          <div className="mt-1 truncate text-sm font-medium tabular-nums text-theme-900 dark:text-theme-50">
            {updatedAt || "-"}
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-xl border border-theme-200/30 p-2 text-theme-600 transition-colors hover:bg-theme-200/40 hover:text-theme-800 dark:border-theme-700/40 dark:text-theme-300 dark:hover:bg-theme-700/40 dark:hover:text-theme-50"
          title={t("uoshippingdashboard.refresh")}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-[1.35fr,1fr,1fr,1fr]">
        <HeroMetric label={hero.primaryMetric.label} value={hero.primaryMetric.value} primary />
        {hero.secondaryMetrics.map((metric) => (
          <HeroMetric key={metric.id} label={metric.label} value={metric.value} />
        ))}
      </div>
    </section>
  );
}

function CompactEmptyState({ hint, message }) {
  return (
    <div className="px-2.5 py-2.5">
      <div className="rounded-xl border border-dashed border-theme-300/35 bg-theme-200/10 px-3 py-3 text-left dark:border-theme-700/40 dark:bg-theme-900/10">
        <div className="text-xs font-medium text-theme-800 dark:text-theme-100">{message}</div>
        {hint ? <div className="mt-1 text-[10px] text-theme-500 dark:text-theme-400">{hint}</div> : null}
      </div>
    </div>
  );
}
```

Update `Panel` and `EmptyState` to the lighter styling below:

```jsx
function Panel({ bodyClassName = "", children, date, statLabel, statValue, title }) {
  return (
    <section className="min-w-0 self-start overflow-hidden rounded-2xl border border-theme-200/25 bg-theme-100/5 dark:border-theme-700/30 dark:bg-white/5">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-theme-200/20 px-3 py-2.5 dark:border-theme-700/30">
        <div className="min-w-0">
          <div className="text-base font-semibold text-theme-900 dark:text-theme-50">{title}</div>
          {date ? <div className="mt-1 text-[11px] tabular-nums text-theme-500 dark:text-theme-400">{date}</div> : null}
        </div>
        {statLabel && statValue ? (
          <div className="rounded-full bg-theme-200/40 px-2.5 py-1 text-[10px] font-medium text-theme-700 dark:bg-theme-800/50 dark:text-theme-200">
            {statLabel}: {statValue}
          </div>
        ) : null}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

function EmptyState({ compact = false, message }) {
  return (
    <div className={`${compact ? "px-2 py-2.5" : "px-2.5 py-3"} text-center text-xs text-theme-500 dark:text-theme-400`}>
      <div className={`rounded-xl border border-dashed border-theme-300/30 dark:border-theme-700/40 ${compact ? "px-3 py-4" : "px-3 py-5"}`}>
        {message}
      </div>
    </div>
  );
}
```

Replace `LoadingSkeleton()` with:

```jsx
function LoadingSkeleton() {
  return (
    <div className="flex w-full min-w-0 flex-col gap-3 p-1.5">
      <div className="overflow-hidden rounded-2xl border border-theme-200/35 bg-theme-200/15 p-3 dark:border-theme-700/40 dark:bg-theme-900/20">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="h-3 w-20 animate-pulse rounded bg-theme-300/40 dark:bg-theme-700/40" />
            <div className="mt-2 h-4 w-32 animate-pulse rounded bg-theme-300/30 dark:bg-theme-700/30" />
          </div>
          <div className="h-9 w-9 animate-pulse rounded-xl bg-theme-300/30 dark:bg-theme-700/30" />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-[1.35fr,1fr,1fr,1fr]">
          <div className="rounded-2xl border border-theme-200/30 bg-theme-200/20 p-4 dark:border-theme-700/30 dark:bg-theme-900/20">
            <div className="h-8 w-20 animate-pulse rounded bg-theme-300/40 dark:bg-theme-700/40" />
            <div className="mt-2 h-3 w-16 animate-pulse rounded bg-theme-300/30 dark:bg-theme-700/30" />
          </div>
          {[...Array(3)].map((_, index) => (
            <div key={index} className="rounded-2xl border border-theme-200/20 bg-theme-200/15 p-4 dark:border-theme-700/30 dark:bg-theme-900/15">
              <div className="h-6 w-12 animate-pulse rounded bg-theme-300/40 dark:bg-theme-700/40" />
              <div className="mt-2 h-3 w-14 animate-pulse rounded bg-theme-300/30 dark:bg-theme-700/30" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        {[...Array(4)].map((_, panelIndex) => (
          <div key={panelIndex} className="overflow-hidden rounded-2xl border border-theme-200/25 bg-theme-100/5 dark:border-theme-700/30 dark:bg-white/5">
            <div className="flex items-center justify-between border-b border-theme-200/20 px-3 py-2.5 dark:border-theme-700/30">
              <div>
                <div className="h-4 w-20 animate-pulse rounded bg-theme-300/40 dark:bg-theme-700/40" />
                <div className="mt-2 h-3 w-16 animate-pulse rounded bg-theme-300/30 dark:bg-theme-700/30" />
              </div>
              <div className="h-5 w-16 animate-pulse rounded-full bg-theme-300/30 dark:bg-theme-700/30" />
            </div>
            <div className="space-y-2 p-3">
              {[...Array(3)].map((__, itemIndex) => (
                <div key={itemIndex} className="rounded-xl border border-theme-200/20 bg-theme-200/15 px-3 py-2 dark:border-theme-700/30 dark:bg-theme-900/10">
                  <div className="h-3.5 w-2/3 animate-pulse rounded bg-theme-300/40 dark:bg-theme-700/40" />
                  <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-theme-300/30 dark:bg-theme-700/30" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

Finally, replace the `dashboard` memo + render block in `Component` with this exact structure:

```jsx
  const dashboard = useMemo(
    () =>
      buildDashboardModel({
        data,
        formatNumber: (value) => formatNumber(t, value),
        labels: {
          activeShops: t("uoshippingdashboard.activeShops"),
          courierCount: t("uoshippingdashboard.courierCount"),
          todayOutput: t("uoshippingdashboard.todayOutput"),
          yesterdayShipping: t("uoshippingdashboard.yesterdayShipping"),
          todayShipping: t("uoshippingdashboard.todayShipping"),
          tomorrowOutput: t("uoshippingdashboard.tomorrowOutput"),
        },
      }),
    [data, t],
  );
```

```jsx
      <div className="flex w-full min-w-0 flex-col gap-3 p-1.5">
        <HeroHeader hero={dashboard.hero} onRefresh={handleRefresh} t={t} updatedAt={dashboard.updatedAt} />

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          {dashboard.sections.map((section) => (
            <Panel
              key={section.id}
              date={section.date}
              statLabel={section.statLabel}
              statValue={section.statValue}
              title={section.title}
            >
              {section.kind === "shop" ? (() => {
                const categoryTotals = getCategoryTotals(section.items, getSectionCategories(section.items));
                const rawActiveCategory = section.id === "today-output" ? todayCategory : tomorrowCategory;
                const activeCategory = resolveActiveCategory(rawActiveCategory, categoryTotals);
                const visibleItems = filterItemsByCategory(section.items, activeCategory);
                const isCompactEmpty = section.emptyVariant === "compact" && visibleItems.length === 0;

                return (
                  <div className="p-2.5">
                    {visibleItems.length > 0 && categoryTotals.length > 1 ? (
                      <CategoryTabs
                        activeCategory={activeCategory}
                        categories={categoryTotals}
                        onChange={section.id === "today-output" ? setTodayCategory : setTomorrowCategory}
                        t={t}
                      />
                    ) : null}

                    {visibleItems.length === 0 ? (
                      isCompactEmpty ? (
                        <CompactEmptyState
                          message={t(`uoshippingdashboard.${section.emptyMessageKey}`)}
                          hint={section.emptyHintKey ? t(`uoshippingdashboard.${section.emptyHintKey}`) : null}
                        />
                      ) : (
                        <EmptyState compact message={t(`uoshippingdashboard.${section.emptyMessageKey}`)} />
                      )
                    ) : (
                      <div className="max-h-[232px] space-y-2 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-theme-300/50 scrollbar-track-transparent dark:scrollbar-thumb-theme-600/50">
                        {visibleItems.map((item) => (
                          <div
                            key={`${section.id}-${item.shop_id}`}
                            className="flex items-center justify-between gap-2 rounded-xl border border-theme-200/20 bg-theme-200/15 px-3 py-2 dark:border-theme-700/30 dark:bg-theme-900/10"
                          >
                            <div className="min-w-0 truncate text-sm font-medium text-theme-900 dark:text-theme-100">
                              {item.shop_name}
                            </div>
                            <div className="shrink-0 text-sm font-semibold tabular-nums text-theme-800 dark:text-theme-100">
                              {formatNumber(t, item.total_quantity)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })() : section.items.length === 0 ? (
                section.emptyVariant === "compact" ? (
                  <CompactEmptyState
                    message={t(`uoshippingdashboard.${section.emptyMessageKey}`)}
                    hint={section.emptyHintKey ? t(`uoshippingdashboard.${section.emptyHintKey}`) : null}
                  />
                ) : (
                  <div className="p-2">
                    <EmptyState compact message={t(`uoshippingdashboard.${section.emptyMessageKey}`)} />
                  </div>
                )
              ) : (
                <div className="max-h-[232px] space-y-2 overflow-y-auto p-2.5 pr-3 scrollbar-thin scrollbar-thumb-theme-300/50 scrollbar-track-transparent dark:scrollbar-thumb-theme-600/50">
                  {section.items.map((item) => (
                    <div
                      key={`${section.id}-${item.courier_id}`}
                      className="flex items-center justify-between gap-2 rounded-xl border border-theme-200/20 bg-theme-200/15 px-3 py-2 dark:border-theme-700/30 dark:bg-theme-900/10"
                    >
                      <div className="min-w-0 truncate text-sm font-medium text-theme-900 dark:text-theme-100">
                        {item.courier_name}
                      </div>
                      <div className="shrink-0 text-sm font-semibold tabular-nums text-theme-800 dark:text-theme-100">
                        {formatNumber(t, item.total_quantity)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ))}
        </div>
      </div>
```

- [ ] **Step 4: Run the automated checks and lint after the refactor**

Run:

```bash
node --test src/widgets/uoshippingdashboard/dashboard-model.test.mjs src/widgets/uoshippingdashboard/locales.test.mjs
npm run lint
```

Expected:
- `node --test ...` passes all model/locale tests.
- `npm run lint` exits 0 with no errors in `component.jsx` or the new model/test files.

- [ ] **Step 5: Manually verify the live widget in the browser**

Run the app locally:

```bash
npm run dev
```

Then open the homepage and verify these exact visual checks against the live `uoshippingdashboard` card:

1. The existing service card header still owns the cube icon, service title, and the `MS` badge — the widget body does **not** duplicate them.
2. The first content row is now the in-widget hero showing `更新時刻`, the refresh button, one large `今日出力` KPI, and three smaller KPIs.
3. The detail panels now appear in this order: `今日出力` → `昨日出荷` → `今日出荷` → `明日予定`.
4. When `今日出荷` and `明日予定` are empty, they render as lighter compact state cards using `本日の出荷はまだありません` and `明日の予定はまだありません` instead of large dashed empty boxes.
5. `今日出力` category tabs still work, but `明日予定` does not show a dead tab row when it is empty.
6. Scrollable lists still behave correctly for long `今日出力` / `昨日出荷` data.
7. The dark theme still keeps hero text readable and does not turn the compact empty cards into low-contrast blocks.

- [ ] **Step 6: Commit the final UI refactor**

Run:

```bash
git add src/widgets/uoshippingdashboard/component.jsx src/widgets/uoshippingdashboard/dashboard-model.mjs src/widgets/uoshippingdashboard/dashboard-model.test.mjs
git commit -m "feat: redesign uoshippingdashboard widget"
```

---

## Self-Review Checklist

Before executing, quickly re-check the finished implementation against the spec:

- Hero exists as a **content-level** header only; no duplicated icon/title inside the widget body.
- KPI order and section order are both `今日出力 → 昨日出荷 → 今日出荷 → 明日予定`.
- `今日出荷` and `明日予定` use compact empty cards when empty.
- All newly introduced UI strings still flow through `t("uoshippingdashboard.*")`.
- Automated tests cover ordering + compact-empty policy + locale keys.
- Manual verification covers the common live state and the visual hierarchy in browser.
