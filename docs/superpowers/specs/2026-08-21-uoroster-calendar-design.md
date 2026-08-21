# 排班月历入口设计

## 目标

在 Homepage 的“出勤”组件（`uoattendance`）表头增加两个入口按钮，分别打开生产部门和办公室部门的本月排班月历。月历页面由 HR（Frappe）生成，Homepage 服务端代理请求并注入 Frappe Token，浏览器全程接触不到凭据。

## 数据流

```
浏览器  ──GET /api/uoroster/calendar?department=Production──▶  Homepage 服务端
                                                                    │
                                              扫 config/services.yaml 取凭据
                                                                    │
                                    GET .../get_current_month_calendar?department_category=Production
                                          Authorization: token KEY:SECRET
                                                                    ▼
                                                                HR (Frappe)
                                                                    │
                                                        { "message": "<!DOCTYPE html>..." }
                                                                    │
浏览器  ◀──────── text/html; charset=utf-8 ────────────────────────┘
```

Token 只在服务端进程内存中存在，既不进前端 bundle，也不出现在响应体或日志中。

## 上游接口契约

- 地址：`{rosterCalendarUrl}/api/method/work_roster.api.published_calendar.get_current_month_calendar`
- 查询参数：`department_category=Production` 或 `department_category=Office`
- 请求头：
  - `Authorization: token {API_KEY}:{API_SECRET}`
  - `Accept: application/json`
- 响应：`{ "message": "<!DOCTYPE html>完整月历页面...</html>" }`
- Homepage 取出 `message` 字符串原样返回，不做二次加工。

## 配置

凭据写在 `config/services.yaml` 现有 `uoattendance` widget 之下，新增两个字段：

```yaml
widget:
  type: uoattendance
  url: <既有>
  scheduleUrl: <既有>
  rosterCalendarUrl: https://erphr.toiroworld.com
  rosterCalendarToken: "<API_KEY>:<API_SECRET>"
  refreshInterval: 3600000
```

真实凭据只写入 `config/services.yaml`。`/config` 已在 `.gitignore` 中，不会进版本库；本设计文档及任何进版本库的文件一律使用占位符。

HR 侧使用专用账号 `homepage-calendar@toiroworld.com`（System User，仅 `WR Manager` 角色），HR 接口保持需要鉴权，不设为匿名访问。

## 凭据不泄漏到前端

`cleanServiceGroups`（`src/utils/config/service-helpers.js`）用白名单解构决定哪些 widget 字段传给浏览器。`rosterCalendarUrl` 与 `rosterCalendarToken` 加入解构列表，但**不赋值到 `widget` 对象**；改为派生一个布尔值：

```js
if (type === "uoattendance") {
  if (scheduleUrl) widget.scheduleUrl = scheduleUrl;
  if (refreshInterval) widget.refreshInterval = refreshInterval;
  if (rosterCalendarUrl && rosterCalendarToken) widget.rosterCalendar = true;
}
```

前端只看到 `rosterCalendar: true`，据此决定是否渲染按钮。未配置时按钮不渲染，避免出现点击即报错的死按钮。

## 服务端模块

### `src/widgets/uoattendance/roster-calendar.mjs`（新建）

纯函数，无 I/O，便于单测：

- `findRosterCalendarConfig(groups)` — 遍历 `servicesFromConfig()` 返回的分组结构，返回第一个 `type: uoattendance` 且同时配置了 `rosterCalendarUrl` 和 `rosterCalendarToken` 的 widget，产出 `{ baseUrl, token }`；找不到返回 `null`。需同时处理 `service.widget` 与 `service.widgets[]` 两种形态。
- `normalizeDepartment(value)` — 仅接受 `Production` 与 `Office` 两个精确值，其余（含大小写变体、空值、路径穿越字符）一律返回 `null`。这道白名单防止 `department` 参数被用来污染发往 HR 的 query string。
- `buildCalendarUrl(baseUrl, department)` — 去除 `baseUrl` 尾部斜杠后拼接接口路径与 `department_category`。

### `src/pages/api/uoroster/calendar.js`（新建）

薄路由，只做编排与错误映射：

| 情况 | 状态码 | 响应 |
| --- | --- | --- |
| 非 GET 方法 | 405 | 设置 `Allow: GET` |
| `department` 不在白名单 | 400 | HTML 提示合法取值 |
| services.yaml 未配置凭据 | 503 | HTML 提示需补充的字段名 |
| HR 返回非 200 | 502 | HTML 提示上游异常，附上游状态码 |
| HR 响应缺少 `message` | 502 | HTML 提示响应格式异常 |
| 正常 | 200 | 月历 HTML |

- 配置来源：路由调用 `servicesFromConfig()` 取得分组结构，再交给 `findRosterCalendarConfig` 提取凭据。
- 成功与失败一律返回 `text/html; charset=utf-8`。入口是新标签页，用户看到的应是可读页面而非裸 JSON。
- 错误页为中文，面向维护者，说明如何修复；月历正文是 HR 生成的日文页面，不做改写。
- 错误页文案不包含 Token、完整上游 URL 等敏感信息。
- 响应头附加 `X-Content-Type-Options: nosniff` 与 `Cache-Control: private, max-age=300`；5 分钟缓存兼顾减少上游压力与排班改动后的可见性。
- 上游请求复用 `utils/proxy/http.js` 的 `httpProxy`，与项目既有出站请求方式保持一致。

## 组件表现

`src/widgets/uoattendance/component.jsx` 表头右侧区域，插入位置在「現在 HH:MM」之前：

```
[今日出勤中] [8/21(木)] [12名出勤中 ▓▓▒░] ...... [📅生産] [📅オフィス] [現在 14:23] [●LIVE] [⟳]
```

- 两个元素均为 `<a target="_blank" rel="noopener noreferrer">`，指向 `/api/uoroster/calendar?department=Production` 与 `?department=Office`。
- 文案为日文短标签「生産」「オフィス」，与组件既有日文文案一致；表头元素密集，短标签避免窄屏换行。
- 悬停提示（`title`）写完整名称「生産シフトカレンダー（今月）」「オフィスシフトカレンダー（今月）」，并作为 `aria-label`。
- 边框与图标颜色复用组件既有的 `DEPT_STYLES`：生産为橙色 `#E8A868`，オフィス为蓝色 `#5EB3E4`，与下方时间轴的部门配色一致，可直接对应。
- 按钮仅在 `widget.rosterCalendar` 为真时渲染。
- 复用组件既有的日历图标风格（`viewBox="0 0 24 24"`、`stroke="currentColor"`、`strokeWidth={1.8}`）。

## 测试

- `roster-calendar.test.mjs`：
  - 从 `widget` 与 `widgets[]` 两种配置形态中找到凭据。
  - 缺 URL、缺 Token、无 uoattendance widget 时返回 `null`。
  - `normalizeDepartment` 接受两个合法值，拒绝大小写变体、空值、`../` 等穿越字符。
  - `buildCalendarUrl` 正确处理 `baseUrl` 带与不带尾斜杠。
- `component.test.jsx` 追加：
  - `rosterCalendar` 为真时渲染两个按钮，`href` 与 `department` 对应正确。
  - 未配置时两个按钮均不渲染。
- 运行 uoattendance 相关测试与全量测试，确认既有出勤逻辑不受影响。

## 范围之外

- 不改动既有出勤数据获取、时间轴渲染与高田手动状态逻辑。
- 不实现组件内弹窗预览；月历统一在新标签页打开。
- 不支持除 Production / Office 之外的部门；如需扩展，在 `normalizeDepartment` 白名单中显式添加。
