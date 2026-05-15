# Announcement Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sticky top announcement banner to Homepage, configured by `config/announcements.yaml`, visually matching the Open Design "主页横幅设计" cream-orange marquee.

**Architecture:** Keep announcement content in YAML, normalize it through a pure config helper, expose it through a small Next.js API route, include it in the existing config hash refresh path, and render it with a dedicated React component plus CSS module. Closing the banner only hides it in the current page state.

**Tech Stack:** Next.js Pages Router, React, SWR, CSS Modules, `js-yaml`, existing Homepage config utilities, `node:test`.

---

## File Structure

- Create `src/utils/config/announcements.mjs`: pure normalizer for announcement YAML shape, defaults, filtering, link cleanup, and speed fallback.
- Create `src/utils/config/announcements.test.mjs`: node tests for disabled config, item filtering, link filtering, defaults, and speed fallback.
- Modify `src/utils/config/api-response.js`: add `announcementsResponse()` using `checkAndCopyConfig()`, `substituteEnvironmentVars()`, `yaml.load()`, and `normalizeAnnouncementConfig()`.
- Create `src/pages/api/announcements.js`: API route returning `announcementsResponse()`.
- Create `src/skeleton/announcements.yaml`: commented sample config copied into `config/` when missing.
- Create `src/pages/api/hash.test.mjs`: node test that verifies `/api/hash` watches `announcements.yaml`.
- Modify `src/pages/api/hash.js`: add `announcements.yaml` to the watched config list.
- Create `src/components/announcement-banner.jsx`: React banner component with current-page-only close state.
- Create `src/components/announcement-banner.module.css`: OD-derived cream-orange sticky marquee styling.
- Modify `src/pages/index.jsx`: include announcement fallback, SWR call, and render the banner above the main content container.

## Tasks

### Task 1: Red Tests For Announcement Config Normalization

**Files:**
- Create: `src/utils/config/announcements.test.mjs`
- Later create: `src/utils/config/announcements.mjs`

- [ ] **Step 1: Write the failing normalizer tests**

Create `src/utils/config/announcements.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_ANNOUNCEMENT_ICON,
  DEFAULT_ANNOUNCEMENT_LABEL,
  DEFAULT_ANNOUNCEMENT_SPEED_SECONDS,
  normalizeAnnouncementConfig,
} from "./announcements.mjs";

test("disabled config returns a hidden banner with defaults", () => {
  const result = normalizeAnnouncementConfig({
    enabled: false,
    label: "社内通知",
    speedSeconds: 18,
    items: [
      {
        id: "ignored",
        enabled: true,
        text: "この公告は表示しない",
      },
    ],
  });

  assert.deepEqual(result, {
    enabled: false,
    label: "社内通知",
    speedSeconds: 18,
    items: [],
  });
});

test("enabled config normalizes active items and complete links", () => {
  const result = normalizeAnnouncementConfig({
    enabled: true,
    label: "お知らせ",
    speedSeconds: "36",
    items: [
      {
        id: "uo-ec-manager-0.2.1",
        enabled: true,
        text: "  请大家更新 uo-ec-manager 到最新版本 0.2.1。  ",
        icon: "🔔",
        links: [
          {
            label: " Mac ",
            href: " http://192.168.1.26:3911/uo-ec-manager/uo-ec-manager-0.2.1-arm64.dmg ",
          },
          {
            label: "Win",
            href: "",
          },
        ],
      },
    ],
  });

  assert.equal(result.enabled, true);
  assert.equal(result.label, "お知らせ");
  assert.equal(result.speedSeconds, 36);
  assert.deepEqual(result.items, [
    {
      id: "uo-ec-manager-0.2.1",
      text: "请大家更新 uo-ec-manager 到最新版本 0.2.1。",
      icon: "🔔",
      links: [
        {
          label: "Mac",
          href: "http://192.168.1.26:3911/uo-ec-manager/uo-ec-manager-0.2.1-arm64.dmg",
        },
      ],
    },
  ]);
});

test("invalid items are filtered and no valid items disables the banner", () => {
  const result = normalizeAnnouncementConfig({
    enabled: true,
    items: [
      {
        id: "disabled",
        enabled: false,
        text: "disabled item",
      },
      {
        id: "empty",
        enabled: true,
        text: "   ",
      },
      null,
    ],
  });

  assert.deepEqual(result, {
    enabled: false,
    label: DEFAULT_ANNOUNCEMENT_LABEL,
    speedSeconds: DEFAULT_ANNOUNCEMENT_SPEED_SECONDS,
    items: [],
  });
});

test("missing optional fields fall back to stable defaults", () => {
  const result = normalizeAnnouncementConfig({
    enabled: true,
    label: "  ",
    speedSeconds: 4,
    items: [
      {
        enabled: true,
        text: "システムメンテナンスのお知らせ",
        links: "not an array",
      },
    ],
  });

  assert.deepEqual(result, {
    enabled: true,
    label: DEFAULT_ANNOUNCEMENT_LABEL,
    speedSeconds: DEFAULT_ANNOUNCEMENT_SPEED_SECONDS,
    items: [
      {
        id: "announcement-1",
        text: "システムメンテナンスのお知らせ",
        icon: DEFAULT_ANNOUNCEMENT_ICON,
        links: [],
      },
    ],
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run:

```bash
node --test src/utils/config/announcements.test.mjs
```

Expected: FAIL with a module-not-found error for `./announcements.mjs`.

- [ ] **Step 3: Commit the red tests**

```bash
git add src/utils/config/announcements.test.mjs
git commit -m "test: add announcement config normalization coverage"
```

### Task 2: Announcement Config Normalizer

**Files:**
- Create: `src/utils/config/announcements.mjs`
- Test: `src/utils/config/announcements.test.mjs`

- [ ] **Step 1: Implement the pure config normalizer**

Create `src/utils/config/announcements.mjs`:

```js
export const DEFAULT_ANNOUNCEMENT_LABEL = "公告";
export const DEFAULT_ANNOUNCEMENT_ICON = "📢";
export const DEFAULT_ANNOUNCEMENT_SPEED_SECONDS = 28;

const MIN_ANNOUNCEMENT_SPEED_SECONDS = 8;

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeSpeedSeconds(value) {
  const numericValue = Number(value);

  if (Number.isFinite(numericValue) && numericValue >= MIN_ANNOUNCEMENT_SPEED_SECONDS) {
    return numericValue;
  }

  return DEFAULT_ANNOUNCEMENT_SPEED_SECONDS;
}

function normalizeLink(link) {
  const label = normalizeText(link?.label);
  const href = normalizeText(link?.href);

  if (!label || !href) {
    return null;
  }

  return {
    label,
    href,
  };
}

function normalizeAnnouncementItem(item, index) {
  if (!item || item.enabled !== true) {
    return null;
  }

  const text = normalizeText(item.text);
  if (!text) {
    return null;
  }

  const links = Array.isArray(item.links) ? item.links.map(normalizeLink).filter(Boolean) : [];

  return {
    id: normalizeText(item.id) || `announcement-${index + 1}`,
    text,
    icon: normalizeText(item.icon) || DEFAULT_ANNOUNCEMENT_ICON,
    links,
  };
}

export function normalizeAnnouncementConfig(config = {}) {
  const label = normalizeText(config?.label) || DEFAULT_ANNOUNCEMENT_LABEL;
  const speedSeconds = normalizeSpeedSeconds(config?.speedSeconds);

  if (config?.enabled !== true) {
    return {
      enabled: false,
      label,
      speedSeconds,
      items: [],
    };
  }

  const items = Array.isArray(config.items)
    ? config.items.map((item, index) => normalizeAnnouncementItem(item, index)).filter(Boolean)
    : [];

  return {
    enabled: items.length > 0,
    label,
    speedSeconds,
    items,
  };
}
```

- [ ] **Step 2: Run the normalizer tests**

Run:

```bash
node --test src/utils/config/announcements.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Commit the normalizer**

```bash
git add src/utils/config/announcements.mjs src/utils/config/announcements.test.mjs
git commit -m "feat: normalize announcement config"
```

### Task 3: Announcement API And Skeleton Config

**Files:**
- Modify: `src/utils/config/api-response.js`
- Create: `src/pages/api/announcements.js`
- Create: `src/skeleton/announcements.yaml`
- Test: `src/utils/config/announcements.test.mjs`

- [ ] **Step 1: Import the normalizer in `api-response.js`**

Add this import near the existing config imports:

```js
import { normalizeAnnouncementConfig } from "utils/config/announcements.mjs";
```

- [ ] **Step 2: Add `announcementsResponse()` to `api-response.js`**

Add this function after `widgetsResponse()`:

```js
export async function announcementsResponse() {
  checkAndCopyConfig("announcements.yaml");

  const announcementsYaml = path.join(CONF_DIR, "announcements.yaml");

  try {
    const rawFileContents = await fs.readFile(announcementsYaml, "utf8");
    const fileContents = substituteEnvironmentVars(rawFileContents);
    const announcements = yaml.load(fileContents) ?? {};

    return normalizeAnnouncementConfig(announcements);
  } catch (e) {
    console.error("Failed to load announcements.yaml, please check for errors");
    if (e) console.error(e.toString());

    return normalizeAnnouncementConfig({ enabled: false });
  }
}
```

- [ ] **Step 3: Create the API route**

Create `src/pages/api/announcements.js`:

```js
import { announcementsResponse } from "utils/config/api-response";

export default async function handler(req, res) {
  res.send(await announcementsResponse());
}
```

- [ ] **Step 4: Create the commented skeleton YAML**

Create `src/skeleton/announcements.yaml`:

```yaml
---
# 公告功能总开关。
# false 时前端不显示公告横幅，items 可以保留备用。
enabled: false

# 左侧标签文字。
# 对应 OD 设计里的橘色“公告”标签。
label: 公告

# 跑马灯滚动一轮的时间，单位：秒。
# 数字越大滚动越慢；OD 设计稿是 28 秒。
speedSeconds: 28

# 公告列表。
# 可以写一条，也可以写多条；多条会用 ◆ 分隔并连续滚动。
items:
  - id: uo-ec-manager-0.2.1
    # 是否启用这一条公告。
    enabled: false

    # 公告正文。
    # 建议保持一句话内。太长也可以，但用户需要等待更久才能读完整。
    text: 请大家更新 uo-ec-manager 到最新版本 0.2.1，新版稳定性更好。下载地址 →

    # 可选：正文前的小图标或 emoji。
    # 不填时前端默认使用 📢。
    icon: 📢

    # 可选：内联链接。
    # 会显示在正文后面，例如 Mac / Win。
    links:
      - label: Mac
        href: http://192.168.1.26:3911/uo-ec-manager/uo-ec-manager-0.2.1-arm64.dmg
      - label: Win
        href: http://192.168.1.26:3911/uo-ec-manager/uo-ec-manager-0.2.1-win.zip

  - id: maintenance-2026-05-20
    enabled: false
    text: 5月20日 18:00-19:00 将进行系统维护，期间部分服务可能不可用。
    icon: 🔧
    links: []
```

- [ ] **Step 5: Run the existing normalizer tests**

Run:

```bash
node --test src/utils/config/announcements.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit the API and skeleton**

```bash
git add src/utils/config/api-response.js src/pages/api/announcements.js src/skeleton/announcements.yaml
git commit -m "feat: expose announcement config api"
```

### Task 4: Hash Refresh Coverage

**Files:**
- Create: `src/pages/api/hash.test.mjs`
- Modify: `src/pages/api/hash.js`

- [ ] **Step 1: Write the failing hash watcher test**

Create `src/pages/api/hash.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("hash route watches announcements config changes", () => {
  const hashRouteSource = readFileSync(new URL("./hash.js", import.meta.url), "utf8");

  assert.match(hashRouteSource, /"announcements\.yaml"/);
});
```

- [ ] **Step 2: Run the hash test and confirm it fails**

Run:

```bash
node --test src/pages/api/hash.test.mjs
```

Expected: FAIL because `src/pages/api/hash.js` does not yet include `announcements.yaml`.

- [ ] **Step 3: Add `announcements.yaml` to the hash config list**

Modify the `configs` array in `src/pages/api/hash.js`:

```js
const configs = [
  "docker.yaml",
  "settings.yaml",
  "services.yaml",
  "bookmarks.yaml",
  "widgets.yaml",
  "announcements.yaml",
  "custom.css",
  "custom.js",
];
```

- [ ] **Step 4: Run the hash and normalizer tests**

Run:

```bash
node --test src/pages/api/hash.test.mjs src/utils/config/announcements.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit hash refresh support**

```bash
git add src/pages/api/hash.js src/pages/api/hash.test.mjs
git commit -m "feat: refresh homepage when announcements change"
```

### Task 5: React Banner Component And Homepage Integration

**Files:**
- Create: `src/components/announcement-banner.jsx`
- Create: `src/components/announcement-banner.module.css`
- Modify: `src/pages/index.jsx`
- Test: `src/utils/config/announcements.test.mjs`, `src/pages/api/hash.test.mjs`

- [ ] **Step 1: Create the CSS module from the OD design**

Create `src/components/announcement-banner.module.css`:

```css
.announcement-banner {
  position: sticky;
  top: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  width: 100%;
  height: 40px;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  font-size: 14px;
  color: oklch(30% 0.025 50);
  background: linear-gradient(90deg, oklch(97% 0.012 85), oklch(96% 0.018 80), oklch(97% 0.012 85));
  border-bottom: 1px solid oklch(88% 0.02 75);
  box-shadow: 0 1px 0 oklch(100% 0 0 / 0.4) inset;
}

.announcement-banner__tag {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
  height: 100%;
  padding: 0 14px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: oklch(98% 0.01 85);
  white-space: nowrap;
  background: oklch(64% 0.13 45);
  border-right: 1px solid oklch(56% 0.12 45 / 0.4);
}

.announcement-banner__tag-dot {
  width: 6px;
  height: 6px;
  background: oklch(97% 0.02 85);
  border-radius: 50%;
  box-shadow: 0 0 6px oklch(97% 0.02 85 / 0.8);
  animation: announcement-banner-pulse-dot 2s ease-in-out infinite;
}

.announcement-banner__marquee {
  position: relative;
  display: flex;
  flex: 1;
  align-items: center;
  height: 100%;
  overflow: hidden;
  mask-image: linear-gradient(90deg, transparent 0%, black 4%, black 96%, transparent 100%);
  -webkit-mask-image: linear-gradient(90deg, transparent 0%, black 4%, black 96%, transparent 100%);
}

.announcement-banner__track {
  display: flex;
  align-items: center;
  gap: 80px;
  padding-left: 100%;
  white-space: nowrap;
  animation: announcement-banner-marquee-scroll var(--announcement-scroll-duration, 28s) linear infinite;
}

.announcement-banner__track:hover {
  animation-play-state: paused;
}

.announcement-banner__item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: oklch(30% 0.025 50);
}

.announcement-banner__item-icon {
  flex-shrink: 0;
}

.announcement-banner__item-text {
  white-space: nowrap;
}

.announcement-banner__link {
  font-weight: 600;
  color: oklch(56% 0.14 45);
  text-decoration: underline;
  text-decoration-color: oklch(56% 0.14 45 / 0.4);
  text-underline-offset: 3px;
  transition: color 0.15s, text-decoration-color 0.15s;
}

.announcement-banner__link:hover {
  color: oklch(48% 0.16 45);
  text-decoration-color: oklch(56% 0.14 45);
}

.announcement-banner__separator {
  flex-shrink: 0;
  font-size: 10px;
  color: oklch(70% 0.04 70);
}

.announcement-banner__close {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 100%;
  color: oklch(48% 0.04 55);
  cursor: pointer;
  background: transparent;
  border: none;
  transition: color 0.15s, background 0.15s;
}

.announcement-banner__close:hover {
  color: oklch(35% 0.06 50);
  background: oklch(90% 0.025 75 / 0.7);
}

.announcement-banner__close svg {
  width: 14px;
  height: 14px;
}

@keyframes announcement-banner-marquee-scroll {
  0% {
    transform: translateX(0);
  }

  100% {
    transform: translateX(-50%);
  }
}

@keyframes announcement-banner-pulse-dot {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }

  50% {
    opacity: 0.5;
    transform: scale(0.7);
  }
}

@media (max-width: 640px) {
  .announcement-banner {
    font-size: 13px;
  }

  .announcement-banner__tag {
    padding: 0 10px;
  }

  .announcement-banner__track {
    gap: 48px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .announcement-banner__tag-dot,
  .announcement-banner__track {
    animation: none;
  }

  .announcement-banner__track {
    padding-left: 12px;
  }
}
```

- [ ] **Step 2: Create the React component**

Create `src/components/announcement-banner.jsx`:

```jsx
import { Fragment, useState } from "react";

import styles from "./announcement-banner.module.css";

function AnnouncementItem({ item }) {
  return (
    <span className={styles["announcement-banner__item"]}>
      {item.icon && <span className={styles["announcement-banner__item-icon"]}>{item.icon}</span>}
      <span className={styles["announcement-banner__item-text"]}>{item.text}</span>
      {item.links?.map((link) => (
        <a key={`${item.id}-${link.href}`} className={styles["announcement-banner__link"]} href={link.href}>
          {link.label}
        </a>
      ))}
    </span>
  );
}

export default function AnnouncementBanner({ announcement }) {
  const [hidden, setHidden] = useState(false);
  const items = announcement?.items ?? [];

  if (hidden || !announcement?.enabled || items.length === 0) {
    return null;
  }

  const label = announcement.label || "公告";
  const speedSeconds = Number(announcement.speedSeconds) > 0 ? Number(announcement.speedSeconds) : 28;
  const loopItems = [...items, ...items];

  return (
    <div className={styles["announcement-banner"]} role="banner" aria-label={label}>
      <div className={styles["announcement-banner__tag"]}>
        <span className={styles["announcement-banner__tag-dot"]} />
        {label}
      </div>

      <div className={styles["announcement-banner__marquee"]}>
        <div
          className={styles["announcement-banner__track"]}
          style={{ "--announcement-scroll-duration": `${speedSeconds}s` }}
        >
          {loopItems.map((item, index) => (
            <Fragment key={`${item.id}-${index}`}>
              <AnnouncementItem item={item} />
              {index < loopItems.length - 1 && (
                <span className={styles["announcement-banner__separator"]}>◆</span>
              )}
            </Fragment>
          ))}
        </div>
      </div>

      <button
        aria-label="关闭公告"
        className={styles["announcement-banner__close"]}
        type="button"
        onClick={() => setHidden(true)}
      >
        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M1 1l12 12M13 1L1 13" />
        </svg>
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Import announcements in `index.jsx`**

Update the imports in `src/pages/index.jsx`:

```js
import AnnouncementBanner from "components/announcement-banner";
```

Change the config response import to include announcements:

```js
import { announcementsResponse, bookmarksResponse, servicesResponse, widgetsResponse } from "utils/config/api-response";
```

- [ ] **Step 4: Add announcement fallback in `getStaticProps()`**

Inside the success path of `getStaticProps()`, add:

```js
const announcements = await announcementsResponse();
```

Then add it to `fallback`:

```js
"/api/announcements": announcements,
```

Inside the catch fallback, add:

```js
"/api/announcements": { enabled: false, label: "公告", speedSeconds: 28, items: [] },
```

- [ ] **Step 5: Read and render announcements in `Home`**

Inside `Home`, next to the existing SWR calls, add:

```js
const { data: announcements } = useSWR("/api/announcements");
```

Render the banner immediately after the `<Script src="/api/config/custom.js" />` line and before the main content wrapper:

```jsx
<AnnouncementBanner announcement={announcements} />
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
node --test src/utils/config/announcements.test.mjs src/pages/api/hash.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit the frontend integration**

```bash
git add src/components/announcement-banner.jsx src/components/announcement-banner.module.css src/pages/index.jsx
git commit -m "feat: render announcement banner"
```

### Task 6: Full Verification

**Files:**
- Verify all files touched by Tasks 1-5.

- [ ] **Step 1: Run node tests**

Run:

```bash
node --test src/utils/config/announcements.test.mjs src/pages/api/hash.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run lint**

Run:

```bash
pnpm lint
```

Expected: PASS.

- [ ] **Step 3: Run production build**

Run:

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 4: Start the dev server**

Run:

```bash
pnpm dev
```

Expected: server starts on `http://localhost:39856`.

- [ ] **Step 5: Enable a local announcement for manual smoke testing**

Edit ignored local `config/announcements.yaml` to:

```yaml
---
enabled: true
label: 公告
speedSeconds: 28
items:
  - id: uo-ec-manager-0.2.1
    enabled: true
    text: 请大家更新 uo-ec-manager 到最新版本 0.2.1，新版稳定性更好。下载地址 →
    icon: 📢
    links:
      - label: Mac
        href: http://192.168.1.26:3911/uo-ec-manager/uo-ec-manager-0.2.1-arm64.dmg
      - label: Win
        href: http://192.168.1.26:3911/uo-ec-manager/uo-ec-manager-0.2.1-win.zip
```

- [ ] **Step 6: Smoke test the page**

Open `http://localhost:39856` and verify:

- The sticky cream-orange banner appears at the top.
- The left tag shows `公告`.
- The marquee scrolls and pauses on hover.
- The `Mac` and `Win` links render inline and are clickable.
- Clicking the right close button hides the banner for the current page.
- Refreshing the page shows the banner again.

- [ ] **Step 7: Verify hash refresh behavior**

With the dev server still running, change `config/announcements.yaml` text from:

```yaml
text: 请大家更新 uo-ec-manager 到最新版本 0.2.1，新版稳定性更好。下载地址 →
```

to:

```yaml
text: 请大家更新 uo-ec-manager 到最新版本 0.2.2，新版稳定性更好。下载地址 →
```

Then refocus the browser window or refresh the page.

Expected: the page reloads through the existing hash/revalidate path and shows `0.2.2`.

- [ ] **Step 8: Final status check**

Run:

```bash
git status --short
```

Expected: only intentional changes are present. The local `.superpowers/` brainstorming directory may remain untracked from the planning session and should not be committed with the feature.
