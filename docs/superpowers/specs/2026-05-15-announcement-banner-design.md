# 公告横幅功能设计（2026-05-15）

## 背景

当前 Homepage 已经通过 `config/*.yaml` 维护服务、书签、组件和全局设置，但没有一个适合“临时通知所有访问者”的醒目公告入口。

本次功能目标是让管理员直接维护配置文件，就能在首页顶部发出公告。公告需要适合网站维护、软件下载更新、内部提醒等场景，并且视觉上遵循 Open Design 项目“主页横幅设计”中的顶部公告横幅，而不是弹窗方案。

---

## 已确认的设计结论

### 1. 展示形态采用 OD 顶部横幅

公告显示为页面顶部的 sticky 横幅：

- 高度固定为 40px。
- 固定在页面顶部，滚动时仍可见。
- 左侧为橘色“公告”标签和脉冲点。
- 中间为跑马灯公告内容。
- 右侧为关闭按钮。

视觉方向使用 OD 设计稿中的“Claude 奶油橘”方案：温暖、柔和、日系、醒目但不紧张。

### 2. 不做弹窗

本次不做自动弹窗、详情弹窗或强制阅读机制。

原因：

- 用户已指定按 OD 的主页横幅设计实现。
- 当前主要场景是维护通知、软件更新、内部提醒，顶部横幅足够醒目。
- 弹窗会打断 Homepage 的快速扫读和跳转体验。

### 3. 内容维护使用 YAML

公告内容由 `config/announcements.yaml` 管理，不提供 GUI。

使用 YAML 的原因：

- 项目已有 `settings.yaml`、`services.yaml`、`bookmarks.yaml`、`widgets.yaml` 等配置习惯。
- 多条公告、链接、启停状态都比 JSON 更适合人工维护。
- 可以写较多注释，方便以后直接改配置。

### 4. 关闭状态仅当次有效

用户点击右侧关闭按钮后，只隐藏当前页面中的横幅。

不写入 `localStorage`，不记住关闭状态。刷新页面、重新打开页面、配置变更触发刷新后，当前启用公告会再次显示。

### 5. 公告更新沿用现有配置刷新机制

`config/announcements.yaml` 纳入 `/api/hash` 的配置 hash 计算。

管理员改公告配置后，访问者在刷新页面或窗口重新聚焦时，会通过现有 `/api/hash` 检测到配置变化，并触发现有 revalidate/reload 流程，看到新公告。

---

## 目标

- 在 Homepage 顶部显示醒目的公告横幅。
- 让管理员只维护 YAML 文件即可发布、关闭或修改公告。
- 支持一条或多条公告连续跑马灯展示。
- 支持每条公告携带图标、正文和内联链接。
- 样式贴合 OD 的“主页横幅设计”。
- 不引入后台 GUI、数据库或权限系统。
- 不破坏现有 services/bookmarks/widgets/settings 配置流程。

## 非目标

- 不做 Markdown 渲染。
- 不做公告图片正文或富文本详情页。
- 不做弹窗、强制确认、已读追踪。
- 不做用户分组、权限、定向通知。
- 不做公告编辑后台。
- 不改变 Homepage 的认证策略。

说明：用户最初提到“图文”，在本次 OD 横幅方案中按“图标/emoji + 文本 + 链接”处理。40px 跑马灯横幅不适合承载大图、标题层级或 Markdown 列表；如后续需要图文详情，可单独设计“点击公告查看详情”的第二阶段功能。

---

## YAML 配置设计

配置文件路径：

```text
config/announcements.yaml
```

骨架文件路径：

```text
src/skeleton/announcements.yaml
```

推荐示例：

```yaml
---
# 公告功能总开关。
# false 时前端不显示公告横幅，items 可以保留备用。
enabled: true

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
    enabled: true

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

字段规则：

- `enabled`：顶层总开关，必须是布尔值；缺省按 `false` 处理。
- `label`：左侧标签文字；缺省为 `公告`。
- `speedSeconds`：跑马灯速度；缺省为 `28`，小于 `8` 或非数字时回退到 `28`。
- `items`：公告数组；缺省为空数组。
- `items[].id`：公告标识，主要用于 React key 和排查配置；缺失时可由数组下标兜底。
- `items[].enabled`：单条开关；只有 `true` 才显示。
- `items[].text`：公告正文；空字符串不显示。
- `items[].icon`：可选图标；缺省为 `📢`。
- `items[].links`：可选链接数组；缺省为空数组。
- `items[].links[].label` 和 `href`：两者都存在才显示链接。

---

## 后端读取与 API

新增 API：

```text
GET /api/announcements
```

返回结构：

```json
{
  "enabled": true,
  "label": "公告",
  "speedSeconds": 28,
  "items": [
    {
      "id": "uo-ec-manager-0.2.1",
      "text": "请大家更新 uo-ec-manager 到最新版本 0.2.1，新版稳定性更好。下载地址 →",
      "icon": "📢",
      "links": [
        {
          "label": "Mac",
          "href": "http://192.168.1.26:3911/uo-ec-manager/uo-ec-manager-0.2.1-arm64.dmg"
        }
      ]
    }
  ]
}
```

处理规则：

- 使用现有 `CONF_DIR` 定位配置目录。
- 使用现有 `checkAndCopyConfig()` 初始化 `announcements.yaml`。
- 使用现有 `substituteEnvironmentVars()` 支持环境变量替换。
- 使用 `js-yaml` 解析 YAML。
- 过滤未启用、正文为空、链接不完整的项目。
- 顶层 `enabled: false` 或有效公告为空时，返回 `enabled: false` 与空 `items`。
- YAML 解析失败时，API 返回禁用状态，并在服务端日志中输出错误。首页不应因为公告配置错误而整体报错。

配置变更检测：

- 在 `src/pages/api/hash.js` 的配置列表中加入 `announcements.yaml`。
- 修改公告配置后，现有 hash 检测会触发页面 revalidate/reload。

---

## 前端组件设计

新增组件：

```text
src/components/announcement-banner.jsx
```

组件职责：

- 通过 props 接收公告数据。
- 当 `enabled` 为 false 或 `items` 为空时不渲染。
- 渲染 OD 设计中的顶部 sticky 横幅。
- 将多条公告渲染为跑马灯条目，并用 `◆` 分隔。
- 为了连续滚动，将公告条目重复一份。
- 鼠标悬停跑马灯时暂停动画。
- 点击右侧关闭按钮后，只在当前组件状态中隐藏。

首页接入点：

```text
src/pages/index.jsx
```

接入位置：

- 在主页面容器 `QuickLaunch` 之前或其上方渲染 `AnnouncementBanner`。
- 横幅需要成为页面第一视觉元素，符合 sticky top bar 的定位。
- API 数据加入 `getStaticProps()` 的 `fallback`，并在 `Home` 中通过 `useSWR("/api/announcements")` 读取。

推荐数据流：

```text
config/announcements.yaml
  -> /api/announcements
  -> getStaticProps fallback
  -> Home useSWR
  -> AnnouncementBanner
```

---

## 样式设计

样式应尽量贴近 OD 原型中的 BEM 命名与视觉参数。

核心类名：

- `.announcement-banner`
- `.announcement-banner__tag`
- `.announcement-banner__tag-dot`
- `.announcement-banner__marquee`
- `.announcement-banner__track`
- `.announcement-banner__item`
- `.announcement-banner__separator`
- `.announcement-banner__close`

核心视觉参数：

- `position: sticky`
- `top: 0`
- `z-index: 9999`
- `height: 40px`
- 奶油色暖调渐变背景。
- 暖橘色左侧标签。
- 跑马灯边缘 mask。
- 链接使用暖橘色、下划线和 hover 状态。
- 关闭按钮 hover 时使用浅暖色背景。

动效：

- 跑马灯：`28s linear infinite`，速度可由 `speedSeconds` 控制。
- 标签脉冲点：`2s ease-in-out infinite`。
- 链接和关闭按钮 hover：`0.15s` 过渡。

可访问性：

- 横幅使用 `role="banner"`。
- 横幅使用 `aria-label="公告"` 或配置中的 `label`。
- 关闭按钮使用 `aria-label="关闭公告"`。
- 链接保持原生 `<a>`，不阻止默认行为。

---

## 错误处理

公告功能不能影响 Homepage 主体使用。

处理策略：

- YAML 文件不存在时复制 skeleton。
- 顶层未启用或没有有效公告时不显示横幅。
- 单条公告配置不完整时跳过该条。
- 链接缺少 `label` 或 `href` 时跳过该链接。
- YAML 解析失败时记录日志并返回禁用公告。
- API 请求失败时前端不显示横幅，不弹错误。

---

## 测试范围

建议覆盖：

- `announcements.yaml` 不存在时能从 skeleton 初始化。
- `enabled: false` 时 API 返回禁用状态。
- 多条公告只返回 `enabled: true` 且 `text` 非空的条目。
- 不完整链接会被过滤。
- `/api/hash` 会包含 `announcements.yaml`，公告变更能改变 hash。
- 前端无公告时不渲染横幅。
- 前端有公告时渲染标签、正文、链接和关闭按钮。
- 点击关闭按钮后当前页面隐藏横幅，刷新后不依赖本地持久状态。

---

## 实施文件映射

预计新增：

- `src/components/announcement-banner.jsx`
- `src/pages/api/announcements.js`
- `src/skeleton/announcements.yaml`

预计修改：

- `src/pages/index.jsx`
- `src/pages/api/hash.js`

可选修改：

- `docs/configs/settings.md` 或新增配置说明文档，用于记录 `announcements.yaml` 用法。

---

## 验收标准

- 管理员修改 `config/announcements.yaml` 后，首页顶部能显示公告横幅。
- 横幅视觉与 OD 的“主页横幅设计”保持一致。
- 多条公告可连续跑马灯展示。
- 公告链接可点击。
- 鼠标悬停跑马灯会暂停。
- 点击关闭按钮后，本次页面隐藏横幅。
- 刷新页面后，当前启用公告重新显示。
- 公告配置变更能通过现有 hash/revalidate 机制传播。
- 公告配置错误不会导致 Homepage 主页面崩溃。
