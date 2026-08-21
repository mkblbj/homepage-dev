# 排班月历入口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 uoattendance 组件表头加两个按钮，分别在新标签页打开生产 / 办公室的本月排班月历；月历由 Homepage 服务端代理 HR（Frappe）接口并注入 Token。

**Architecture:** 凭据存于 `config/services.yaml` 的 uoattendance widget，服务端递归扫描配置取出；新增 `/api/uoroster/calendar` 路由带 Token 请求 HR，取响应的 `message` 字段以 `text/html` 回吐给浏览器。前端只收到一个布尔标记决定是否渲染按钮，永不接触凭据。

**Tech Stack:** Next.js 16 Pages Router、React 19、Tailwind、vitest（`.test.js/.jsx`）、`node --test`（`.test.mjs`）、项目既有的 `httpProxy` 与 `createLogger`。

## Global Constraints

- 凭据字段名固定为 `rosterCalendarUrl` 与 `rosterCalendarToken`，写在 `config/services.yaml` 现有 uoattendance widget 之下。
- 真实 Key/Secret 只允许出现在 `config/services.yaml`（该目录已 gitignore）。任何进版本库的文件（计划、spec、测试、代码注释）一律使用占位符。
- `department` 仅接受 `Production` 与 `Office` 两个精确值，大小写变体一律拒绝。
- HR 接口路径：`/api/method/work_roster.api.published_calendar.get_current_month_calendar`，查询参数 `department_category`。
- 请求头：`Authorization: token {API_KEY}:{API_SECRET}` 与 `Accept: application/json`。
- 前端可见字段只有布尔 `rosterCalendar`；`rosterCalendarUrl` / `rosterCalendarToken` 绝不写入传给浏览器的 widget 对象。
- 按钮日文文案「生産」「オフィス」；`aria-label` 与 `title` 用完整名称「生産シフトカレンダー（今月）」「オフィスシフトカレンダー（今月）」。
- 部门配色复用组件既有 `DEPT_STYLES`：Production `#E8A868`，Office `#5EB3E4`。
- 代码风格：prettier，行宽 120，2 空格缩进。改动后跑 `pnpm lint`。

## File Structure

| 文件 | 责任 |
| --- | --- |
| `src/widgets/uoattendance/roster-calendar.mjs`（新建） | 纯函数：配置扫描、department 白名单、URL 拼接。无 I/O，好测。 |
| `src/widgets/uoattendance/roster-calendar.test.mjs`（新建） | 上述纯函数的 `node --test` 测试。 |
| `src/pages/api/uoroster/calendar.js`（新建） | 薄路由：读配置 → 请求 HR → 映射错误 → 回 HTML。 |
| `src/__tests__/pages/api/uoroster/calendar.test.js`（新建） | 路由的 vitest 测试，mock 配置与 httpProxy。 |
| `src/utils/config/service-helpers.js`（修改） | 白名单里派生布尔 `rosterCalendar`，拦住凭据不过桥。 |
| `src/utils/config/service-helpers.test.js`（修改） | 断言凭据不出现在前端 payload。 |
| `src/widgets/uoattendance/component.jsx`（修改） | 表头渲染两个月历链接。 |
| `src/widgets/uoattendance/component.test.jsx`（修改） | 按钮渲染与 href 断言。 |
| `config/services.yaml`（修改） | 真实凭据落地。不进版本库。 |

**踩坑预警（务必读）：**
1. `config/services.yaml` 用的是**嵌套分组**结构（`UO サービス > ダッシュボード > ダッシュボードその他 > 今日出勤中`）。`parseServicesToGroups` 产出的每个 group 同时有 `services` 和 `groups` 两个数组，配置扫描**必须递归**下钻 `groups`，只遍历顶层 `services` 会永远返回 null。
2. 组件里已存在「生産」「オフィス」文本（部门卡片标签 + 汇总图例）。组件测试**不能**用 `getByText("生産")` 定位按钮，必须用 `getByRole("link", { name: "生産シフトカレンダー（今月）" })`。
3. vitest 的 `include` 只覆盖 `src/**/*.test.{js,jsx}`，**不含 `.mjs`**。`.mjs` 测试用 `node --test` 单独跑。

---

### Task 1: 配置解析与参数校验纯函数

**Files:**
- Create: `src/widgets/uoattendance/roster-calendar.mjs`
- Test: `src/widgets/uoattendance/roster-calendar.test.mjs`

**Interfaces:**
- Consumes: 无（本任务是最底层）
- Produces:
  - `normalizeDepartment(value: string) => "Production" | "Office" | null`
  - `buildCalendarUrl(baseUrl: string, department: string) => string`
  - `findRosterCalendarConfig(groups: Array) => { baseUrl: string, token: string } | null`

- [ ] **Step 1: 写失败测试**

创建 `src/widgets/uoattendance/roster-calendar.test.mjs`：

```javascript
import assert from "node:assert/strict";
import test from "node:test";

import { buildCalendarUrl, findRosterCalendarConfig, normalizeDepartment } from "./roster-calendar.mjs";

test("normalizeDepartment accepts only the two published departments", () => {
  assert.equal(normalizeDepartment("Production"), "Production");
  assert.equal(normalizeDepartment("Office"), "Office");

  // department is interpolated into the HR query string, so anything outside
  // the whitelist is rejected rather than sanitized.
  assert.equal(normalizeDepartment("production"), null);
  assert.equal(normalizeDepartment("OFFICE"), null);
  assert.equal(normalizeDepartment("Production&foo=1"), null);
  assert.equal(normalizeDepartment("../../etc/passwd"), null);
  assert.equal(normalizeDepartment(""), null);
  assert.equal(normalizeDepartment(undefined), null);
  assert.equal(normalizeDepartment(null), null);
});

test("buildCalendarUrl joins the HR endpoint regardless of trailing slashes", () => {
  const expected =
    "https://hr.example.com/api/method/work_roster.api.published_calendar.get_current_month_calendar" +
    "?department_category=Production";

  assert.equal(buildCalendarUrl("https://hr.example.com", "Production"), expected);
  assert.equal(buildCalendarUrl("https://hr.example.com/", "Production"), expected);
  assert.equal(buildCalendarUrl("https://hr.example.com///", "Production"), expected);
});

test("findRosterCalendarConfig digs through nested service groups", () => {
  // services.yaml nests groups several levels deep; the widget we want sits at
  // the bottom of that tree, never in the top-level services array.
  const groups = [
    {
      name: "UO サービス",
      services: [],
      groups: [
        {
          name: "ダッシュボード",
          services: [],
          groups: [
            {
              name: "ダッシュボードその他",
              services: [
                {
                  name: "今日出勤中",
                  widget: {
                    type: "uoattendance",
                    rosterCalendarUrl: "https://hr.example.com",
                    rosterCalendarToken: "KEY:SECRET",
                  },
                },
              ],
              groups: [],
            },
          ],
        },
      ],
    },
  ];

  assert.deepEqual(findRosterCalendarConfig(groups), {
    baseUrl: "https://hr.example.com",
    token: "KEY:SECRET",
  });
});

test("findRosterCalendarConfig also reads the widgets[] form", () => {
  const groups = [
    {
      name: "Core",
      services: [
        {
          name: "Attendance",
          widgets: [
            { type: "uorakutensales" },
            {
              type: "uoattendance",
              rosterCalendarUrl: "https://hr.example.com",
              rosterCalendarToken: "KEY:SECRET",
            },
          ],
        },
      ],
      groups: [],
    },
  ];

  assert.deepEqual(findRosterCalendarConfig(groups), {
    baseUrl: "https://hr.example.com",
    token: "KEY:SECRET",
  });
});

test("findRosterCalendarConfig returns null when the calendar is not configured", () => {
  const withoutToken = [
    {
      name: "Core",
      services: [{ name: "A", widget: { type: "uoattendance", rosterCalendarUrl: "https://hr.example.com" } }],
      groups: [],
    },
  ];
  const withoutUrl = [
    {
      name: "Core",
      services: [{ name: "A", widget: { type: "uoattendance", rosterCalendarToken: "KEY:SECRET" } }],
      groups: [],
    },
  ];
  const otherWidget = [
    {
      name: "Core",
      services: [{ name: "A", widget: { type: "uorakutensales", rosterCalendarUrl: "x", rosterCalendarToken: "y" } }],
      groups: [],
    },
  ];

  assert.equal(findRosterCalendarConfig(withoutToken), null);
  assert.equal(findRosterCalendarConfig(withoutUrl), null);
  assert.equal(findRosterCalendarConfig(otherWidget), null);
  assert.equal(findRosterCalendarConfig([]), null);
  assert.equal(findRosterCalendarConfig(undefined), null);
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
node --test src/widgets/uoattendance/roster-calendar.test.mjs
```

Expected: FAIL —— `Cannot find module .../roster-calendar.mjs`

- [ ] **Step 3: 写最小实现**

创建 `src/widgets/uoattendance/roster-calendar.mjs`：

```javascript
/*
 * uoroster カレンダー — 配置解析とパラメータ検証
 *
 * ここは純粋関数のみ。設定の読み込みと HTTP は API ルート側の責務で、
 * このモジュールは「受け付けるか」「どう組み立てるか」だけを決める。
 */

const CALENDAR_PATH = "/api/method/work_roster.api.published_calendar.get_current_month_calendar";

// department は HR へのクエリ文字列にそのまま載る。サニタイズではなく
// ホワイトリストで弾き、呼び出し側から上流へ細工を注入できないようにする。
const ALLOWED_DEPARTMENTS = ["Production", "Office"];

export function normalizeDepartment(value) {
  return ALLOWED_DEPARTMENTS.includes(value) ? value : null;
}

export function buildCalendarUrl(baseUrl, department) {
  const trimmed = String(baseUrl).replace(/\/+$/, "");
  return `${trimmed}${CALENDAR_PATH}?department_category=${encodeURIComponent(department)}`;
}

export function findRosterCalendarConfig(groups) {
  for (const group of groups ?? []) {
    for (const service of group?.services ?? []) {
      const widgets = service?.widgets ?? (service?.widget ? [service.widget] : []);
      for (const widget of widgets) {
        const { type, rosterCalendarUrl: baseUrl, rosterCalendarToken: token } = widget ?? {};
        if (type === "uoattendance" && baseUrl && token) {
          return { baseUrl, token };
        }
      }
    }

    // services.yaml はグループを入れ子にする。目的の widget は必ず末端にいるので、
    // ここを降りないと設定は永遠に見つからない。
    const nested = findRosterCalendarConfig(group?.groups);
    if (nested) {
      return nested;
    }
  }

  return null;
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
node --test src/widgets/uoattendance/roster-calendar.test.mjs
```

Expected: PASS，5 tests / 0 fail

- [ ] **Step 5: 提交**

```bash
git add src/widgets/uoattendance/roster-calendar.mjs src/widgets/uoattendance/roster-calendar.test.mjs
git commit -m "feat(uoroster): add roster calendar config and department helpers"
```

---

### Task 2: 阻止凭据流向前端

**Files:**
- Modify: `src/utils/config/service-helpers.js`（白名单解构约 253 行起；uoattendance 分支约 643 行）
- Test: `src/utils/config/service-helpers.test.js`（追加一个 `it`）

**Interfaces:**
- Consumes: 无
- Produces: 前端 widget 对象上的布尔字段 `rosterCalendar`（Task 4 消费）

- [ ] **Step 1: 写失败测试**

在 `src/utils/config/service-helpers.test.js` 中，紧跟现有 `"cleanServiceGroups removes calendar integration urls from frontend widget payload"` 那个 `it` 之后追加：

```javascript
  it("cleanServiceGroups exposes only a boolean flag for the uoattendance roster calendar", async () => {
    const mod = await import("./service-helpers");
    const { cleanServiceGroups } = mod;

    const rawGroups = [
      {
        name: "Core",
        services: [
          {
            name: "Attendance",
            weight: 100,
            widgets: [
              {
                type: "uoattendance",
                scheduleUrl: "https://hr.example.com/schedule",
                rosterCalendarUrl: "https://hr.example.com",
                rosterCalendarToken: "KEY:SECRET",
              },
            ],
          },
        ],
        groups: [],
      },
    ];

    const widget = cleanServiceGroups(rawGroups)[0].services[0].widgets[0];

    expect(widget.rosterCalendar).toBe(true);
    // credentials must never reach the browser bundle
    expect(widget.rosterCalendarUrl).toBeUndefined();
    expect(widget.rosterCalendarToken).toBeUndefined();
    expect(JSON.stringify(widget)).not.toContain("SECRET");
  });

  it("cleanServiceGroups omits the roster calendar flag when credentials are incomplete", async () => {
    const mod = await import("./service-helpers");
    const { cleanServiceGroups } = mod;

    const rawGroups = [
      {
        name: "Core",
        services: [
          {
            name: "Attendance",
            weight: 100,
            widgets: [{ type: "uoattendance", rosterCalendarUrl: "https://hr.example.com" }],
          },
        ],
        groups: [],
      },
    ];

    expect(cleanServiceGroups(rawGroups)[0].services[0].widgets[0].rosterCalendar).toBeUndefined();
  });
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm vitest run src/utils/config/service-helpers.test.js -t "roster calendar"
```

Expected: FAIL —— `expected undefined to be true`

- [ ] **Step 3: 写最小实现**

改动 1 —— 在白名单解构中，紧跟 `// uoattendance, uorakutensales` 下的 `scheduleUrl,` 之后加两行：

```javascript
          // uoattendance, uorakutensales
          scheduleUrl,

          // uoattendance — server-only, deliberately never copied onto `widget`
          rosterCalendarUrl,
          rosterCalendarToken,
```

改动 2 —— 把 `type === "uoattendance"` 分支改成：

```javascript
        if (type === "uoattendance") {
          if (scheduleUrl) widget.scheduleUrl = scheduleUrl;
          if (refreshInterval) widget.refreshInterval = refreshInterval;
          // Destructured above but never assigned: the browser only learns
          // whether the calendar is configured, never the URL or token.
          if (rosterCalendarUrl && rosterCalendarToken) widget.rosterCalendar = true;
        }
```

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm vitest run src/utils/config/service-helpers.test.js
```

Expected: PASS，含新增两条，且既有用例全绿

- [ ] **Step 5: 提交**

```bash
git add src/utils/config/service-helpers.js src/utils/config/service-helpers.test.js
git commit -m "feat(uoroster): expose roster calendar availability without leaking credentials"
```

---

### Task 3: 月历代理路由

**Files:**
- Create: `src/pages/api/uoroster/calendar.js`
- Test: `src/__tests__/pages/api/uoroster/calendar.test.js`

**Interfaces:**
- Consumes: Task 1 的 `findRosterCalendarConfig` / `buildCalendarUrl` / `normalizeDepartment`
- Produces: HTTP 端点 `GET /api/uoroster/calendar?department=Production|Office`（Task 4 消费）

- [ ] **Step 1: 写失败测试**

创建 `src/__tests__/pages/api/uoroster/calendar.test.js`：

```javascript
import { beforeEach, describe, expect, it, vi } from "vitest";

import createMockRes from "test-utils/create-mock-res";

const { servicesFromConfig, httpProxy, logger } = vi.hoisted(() => ({
  servicesFromConfig: vi.fn(),
  httpProxy: vi.fn(),
  logger: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("utils/config/service-helpers", () => ({
  default: vi.fn(),
  servicesFromConfig,
}));

vi.mock("utils/proxy/http", () => ({ httpProxy }));

vi.mock("utils/logger", () => ({ default: () => logger }));

import handler from "pages/api/uoroster/calendar";

const CONFIGURED_GROUPS = [
  {
    name: "Core",
    services: [
      {
        name: "Attendance",
        widget: {
          type: "uoattendance",
          rosterCalendarUrl: "https://hr.example.com",
          rosterCalendarToken: "KEY:SECRET",
        },
      },
    ],
    groups: [],
  },
];

describe("pages/api/uoroster/calendar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    servicesFromConfig.mockResolvedValue(CONFIGURED_GROUPS);
  });

  it("returns the HR calendar HTML for a valid department", async () => {
    httpProxy.mockResolvedValue([
      200,
      "application/json",
      Buffer.from(JSON.stringify({ message: "<!DOCTYPE html><html><body>月历</body></html>" })),
    ]);

    const res = createMockRes();
    await handler({ method: "GET", query: { department: "Production" } }, res);

    expect(httpProxy).toHaveBeenCalledWith(
      "https://hr.example.com/api/method/work_roster.api.published_calendar.get_current_month_calendar" +
        "?department_category=Production",
      {
        headers: {
          Authorization: "token KEY:SECRET",
          Accept: "application/json",
        },
      },
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("text/html; charset=utf-8");
    expect(res.headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(res.headers["Cache-Control"]).toBe("private, max-age=300");
    expect(res.body).toBe("<!DOCTYPE html><html><body>月历</body></html>");
  });

  it("passes the Office department through to HR", async () => {
    httpProxy.mockResolvedValue([200, "application/json", Buffer.from(JSON.stringify({ message: "<html></html>" }))]);

    await handler({ method: "GET", query: { department: "Office" } }, createMockRes());

    expect(httpProxy.mock.calls[0][0]).toContain("department_category=Office");
  });

  it("rejects a department outside the whitelist", async () => {
    const res = createMockRes();
    await handler({ method: "GET", query: { department: "Warehouse" } }, res);

    expect(res.statusCode).toBe(400);
    expect(res.headers["Content-Type"]).toBe("text/html; charset=utf-8");
    expect(httpProxy).not.toHaveBeenCalled();
  });

  it("rejects non-GET methods", async () => {
    const res = createMockRes();
    await handler({ method: "POST", query: { department: "Production" } }, res);

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toEqual(["GET"]);
    expect(httpProxy).not.toHaveBeenCalled();
  });

  it("explains what to configure when credentials are missing", async () => {
    servicesFromConfig.mockResolvedValue([{ name: "Core", services: [], groups: [] }]);

    const res = createMockRes();
    await handler({ method: "GET", query: { department: "Production" } }, res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toContain("rosterCalendarUrl");
    expect(httpProxy).not.toHaveBeenCalled();
  });

  it("maps an upstream failure to 502 without leaking the token", async () => {
    httpProxy.mockResolvedValue([401, "application/json", Buffer.from("{}")]);

    const res = createMockRes();
    await handler({ method: "GET", query: { department: "Production" } }, res);

    expect(res.statusCode).toBe(502);
    expect(res.body).not.toContain("SECRET");
    expect(logger.error).toHaveBeenCalled();
  });

  it("maps a response without a message field to 502", async () => {
    httpProxy.mockResolvedValue([200, "application/json", Buffer.from(JSON.stringify({ data: "nope" }))]);

    const res = createMockRes();
    await handler({ method: "GET", query: { department: "Production" } }, res);

    expect(res.statusCode).toBe(502);
  });

  it("maps unparseable upstream payloads to 502", async () => {
    httpProxy.mockResolvedValue([200, "text/html", Buffer.from("<html>not json</html>")]);

    const res = createMockRes();
    await handler({ method: "GET", query: { department: "Production" } }, res);

    expect(res.statusCode).toBe(502);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm vitest run src/__tests__/pages/api/uoroster/calendar.test.js
```

Expected: FAIL —— 无法解析 `pages/api/uoroster/calendar`

- [ ] **Step 3: 写最小实现**

创建 `src/pages/api/uoroster/calendar.js`：

```javascript
import { servicesFromConfig } from "utils/config/service-helpers";
import createLogger from "utils/logger";
import { httpProxy } from "utils/proxy/http";
import {
  buildCalendarUrl,
  findRosterCalendarConfig,
  normalizeDepartment,
} from "widgets/uoattendance/roster-calendar.mjs";

const logger = createLogger("uorosterCalendar");

// 入口是新标签页，所以出错时也回 HTML —— 用户看到的应是可读提示，而不是裸 JSON。
function errorPage(title, detail) {
  return [
    "<!DOCTYPE html>",
    '<html lang="zh"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${title}</title></head>`,
    '<body style="font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1.5rem;line-height:1.7">',
    `<h1 style="font-size:1.25rem;margin:0 0 .75rem">${title}</h1>`,
    `<p style="color:#555;margin:0">${detail}</p>`,
    "</body></html>",
  ].join("");
}

function sendHtml(res, status, html) {
  res.status(status);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.send(html);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const department = normalizeDepartment(req.query?.department);
  if (!department) {
    return sendHtml(res, 400, errorPage("部门参数无效", "department 仅接受 Production 或 Office。"));
  }

  const config = findRosterCalendarConfig(await servicesFromConfig());
  if (!config) {
    return sendHtml(
      res,
      503,
      errorPage(
        "排班月历未配置",
        "请在 config/services.yaml 的 uoattendance widget 下补充 rosterCalendarUrl 与 rosterCalendarToken。",
      ),
    );
  }

  const [status, , data] = await httpProxy(buildCalendarUrl(config.baseUrl, department), {
    headers: {
      Authorization: `token ${config.token}`,
      Accept: "application/json",
    },
  });

  if (status !== 200) {
    logger.error("HR roster calendar returned %d for department %s", status, department);
    return sendHtml(
      res,
      502,
      errorPage("无法获取排班月历", `HR 接口返回 ${status}。请确认 HR 服务状态与 API 凭据是否有效。`),
    );
  }

  let html = null;
  try {
    html = JSON.parse(data.toString()).message;
  } catch (e) {
    html = null;
  }

  if (typeof html !== "string" || html.length === 0) {
    logger.error("HR roster calendar response carried no message field for department %s", department);
    return sendHtml(res, 502, errorPage("排班月历内容异常", "HR 接口未返回月历内容。"));
  }

  // 月历一个月才换一次，但排班改动后要看得见 —— 5 分钟是两者的折中。
  res.setHeader("Cache-Control", "private, max-age=300");
  return sendHtml(res, 200, html);
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm vitest run src/__tests__/pages/api/uoroster/calendar.test.js
```

Expected: PASS，8 tests

- [ ] **Step 5: 提交**

```bash
git add src/pages/api/uoroster/calendar.js src/__tests__/pages/api/uoroster/calendar.test.js
git commit -m "feat(uoroster): proxy HR month calendar with server-side token"
```

---

### Task 4: 组件表头的两个入口按钮

**Files:**
- Modify: `src/widgets/uoattendance/component.jsx`（表头右侧 `ml-auto` 区块，「現在 {fmtClock(nowH)}」之前）
- Test: `src/widgets/uoattendance/component.test.jsx`

**Interfaces:**
- Consumes: Task 2 的 `widget.rosterCalendar` 布尔值；Task 3 的 `/api/uoroster/calendar` 端点
- Produces: 无（终端 UI）

- [ ] **Step 1: 写失败测试**

在 `src/widgets/uoattendance/component.test.jsx` 里，`const service = {...}` 定义之后追加一个带月历标记的变体：

```javascript
const serviceWithCalendar = {
  widget: { ...service.widget, rosterCalendar: true },
};
```

然后在 `describe` 块末尾追加两条用例：

```javascript
  it("renders both roster calendar links when the calendar is configured", () => {
    mockApi({
      actual: { message: { employees: actualEmployees } },
      today: { message: { today: todaySnapshot } },
      tomorrow: { message: { tomorrow: tomorrowSnapshot } },
    });

    renderWithProviders(<Component service={serviceWithCalendar} />, { settings: { hideErrors: false } });

    // "生産" / "オフィス" also label the department cards and the summary legend,
    // so match on the accessible name instead of the visible short label.
    const production = screen.getByRole("link", { name: "生産シフトカレンダー（今月）" });
    const office = screen.getByRole("link", { name: "オフィスシフトカレンダー（今月）" });

    expect(production).toHaveAttribute("href", "/api/uoroster/calendar?department=Production");
    expect(office).toHaveAttribute("href", "/api/uoroster/calendar?department=Office");
    expect(production).toHaveAttribute("target", "_blank");
    expect(production).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("hides the roster calendar links when the calendar is not configured", () => {
    mockApi({
      actual: { message: { employees: actualEmployees } },
      today: { message: { today: todaySnapshot } },
      tomorrow: { message: { tomorrow: tomorrowSnapshot } },
    });

    renderWithProviders(<Component service={service} />, { settings: { hideErrors: false } });

    expect(screen.queryByRole("link", { name: "生産シフトカレンダー（今月）" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "オフィスシフトカレンダー（今月）" })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm vitest run src/widgets/uoattendance/component.test.jsx -t "roster calendar"
```

Expected: FAIL —— `Unable to find an accessible element with the role "link"`

- [ ] **Step 3: 写最小实现**

改动 1 —— 在 `component.jsx` 的 `function SummaryBar(...)` **之前**插入新组件：

```jsx
// ---- roster calendar: month-view entry points, one per department ----
// Border/icon colour reuses DEPT_STYLES so the buttons read as the same two
// departments drawn in the timelines below.
function RosterCalendarLink({ department, label, title }) {
  const { solid } = deptStyle(department);

  return (
    <a
      href={`/api/uoroster/calendar?department=${department}`}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      aria-label={title}
      className="inline-flex items-center gap-1 rounded-lg border px-1.5 py-1 text-[10.5px] font-bold transition-colors hover:bg-theme-200/40 dark:hover:bg-theme-700/40"
      style={{ borderColor: `${solid}66`, color: solid }}
    >
      <svg
        className="h-3 w-3"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </svg>
      {label}
    </a>
  );
}
```

改动 2 —— 在表头右侧区块中，把 `<span className="ml-auto flex shrink-0 items-center gap-2">` 之后、`現在 {fmtClock(nowH)}` 那个 `<span>` 之前，插入：

```jsx
            {widget.rosterCalendar ? (
              <>
                <RosterCalendarLink department="Production" label="生産" title="生産シフトカレンダー（今月）" />
                <RosterCalendarLink department="Office" label="オフィス" title="オフィスシフトカレンダー（今月）" />
              </>
            ) : null}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm vitest run src/widgets/uoattendance/component.test.jsx
```

Expected: PASS，含新增两条，且既有用例全绿

- [ ] **Step 5: 跑 lint 并提交**

```bash
pnpm lint
```

Expected: 无错误

```bash
git add src/widgets/uoattendance/component.jsx src/widgets/uoattendance/component.test.jsx
git commit -m "feat(uoattendance): add production and office roster calendar entries"
```

---

### Task 5: 落地真实配置并端到端验证

**Files:**
- Modify: `config/services.yaml`（`今日出勤中` 服务的 widget 块，约 33-38 行）

**Interfaces:**
- Consumes: Task 1-4 的全部产出
- Produces: 可用的线上入口

- [ ] **Step 1: 全量测试基线**

```bash
pnpm test
```

Expected: 全绿。记下用例总数，Step 5 用来比对。

```bash
node --test src/widgets/uoattendance/roster-calendar.test.mjs
```

Expected: PASS

- [ ] **Step 2: 写入凭据**

编辑 `config/services.yaml`，把 `今日出勤中` 的 widget 块改成（`refreshInterval` 保持原值）：

```yaml
                widget:
                  type: uoattendance
                  url: https://erphr.toiroworld.com/api/method/hrms.api.qr_attendance.get_employees_at_work
                  scheduleUrl: https://erphr.toiroworld.com/api/method/work_roster.api.schedule.get_scheduled_attendance_snapshot
                  rosterCalendarUrl: https://erphr.toiroworld.com
                  rosterCalendarToken: "<API_KEY>:<API_SECRET>"
                  refreshInterval: 3600000
```

`<API_KEY>:<API_SECRET>` 的真实值由派发者在 dispatch 时单独提供，**不写入任何进版本库的文件**。

注意缩进要与相邻行完全一致（`widget:` 下的字段比 `widget:` 多两个空格）。

- [ ] **Step 3: 确认凭据不会进版本库**

```bash
git status --short config/services.yaml
```

Expected: 无输出（`/config` 已被 gitignore）。**若有输出则立即停止**，不要提交。

- [ ] **Step 4: 起服务做端到端验证**

```bash
pnpm dev
```

另开终端，逐条验证：

```bash
curl -s -o /dev/null -w "生产月历 status=%{http_code} type=%{content_type}\n" "http://localhost:39856/api/uoroster/calendar?department=Production"
```

Expected: `status=200 type=text/html; charset=utf-8`

```bash
curl -s -o /dev/null -w "办公室月历 status=%{http_code} type=%{content_type}\n" "http://localhost:39856/api/uoroster/calendar?department=Office"
```

Expected: `status=200 type=text/html; charset=utf-8`

```bash
curl -s -o /dev/null -w "非法部门 status=%{http_code}\n" "http://localhost:39856/api/uoroster/calendar?department=Warehouse"
```

Expected: `status=400`

```bash
SECRET=$(grep rosterCalendarToken config/services.yaml | sed 's/.*://; s/["[:space:]]//g')
echo "secret 长度=${#SECRET}（应大于 0）"
curl -s "http://localhost:39856/api/uoroster/calendar?department=Production" | grep -c "$SECRET"
```

Expected: 长度大于 0，且 `grep -c` 输出 `0` —— 响应体里不含 Secret

```bash
SECRET=$(grep rosterCalendarToken config/services.yaml | sed 's/.*://; s/["[:space:]]//g')
curl -s "http://localhost:39856/api/services" | grep -c "$SECRET"
```

Expected: `0` —— 前端拿到的服务配置里不含 Secret

浏览器打开 `http://localhost:39856`，确认：
- 「今日出勤中」卡片表头出现橙色「生産」与蓝色「オフィス」两个按钮
- 点击后各自在新标签页打开对应部门的本月月历
- 月历页面没有自动打印脚本弹出打印框

- [ ] **Step 5: 全量测试与 lint 收尾**

```bash
pnpm test && pnpm lint
```

Expected: 用例数比 Step 1 多出本次新增的条数，全绿；lint 无错误

```bash
node --test src/widgets/uoattendance/roster-calendar.test.mjs
```

Expected: PASS

- [ ] **Step 6: 提交计划文档**

代码已在 Task 1-4 分别提交，`config/services.yaml` 不进版本库，此处只需确认工作区干净：

```bash
git status --short
```

Expected: 无输出
