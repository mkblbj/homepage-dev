# UO AI 经营总结简化设计（2026-08-02）

## 背景

`uoaisummary` 已按 [2026-08-01 设计](2026-08-01-uo-ai-executive-summary-design.md)实现并可运行。上线后暴露三个问题：

1. **同一批数据被重组了四遍**。`buildAnalysisInput` 产出的 `modelInput` 有 7 个顶层块，其中 `modules`、`metrics`、`shops` 三块是同一批源 JSON 的不同切法，`metricDisplay` 是第四份（给 UI 的预渲染）。`shops` 唯一的实际用途是给 `compactModules` 当店铺白名单——先跨源合并排名，再回头过滤各模块自己的店铺列表。
2. **出荷数据占比过高但价值很低**。shipping 源的 6 条指标里 4 条是出荷侧，另有 `topCouriers`、`todayShipping`、`yesterdayShipping`。业务上出荷是次要信息，真正关心的是出力。
3. **UI 没有重点**。`Cockpit` 一个组件塞了 9 个区块，展开后 6 层视觉层级，且把 `performance.traffic.delta_percent` 这类机器 ID 当标签显示给人看。

本设计在不改变功能定位（公司级双语经营总结、每小时生成、手动重分析）的前提下，收敛数据层、输出结构和 UI。

---

## 已确认的产品结论

### 定位

保持"经营驾驶舱"，但改为**一主一次**两层：

- 主区（永远可见）：一句结论 + 2–3 句态势 + 1–3 条待办。
- 折叠区（**默认关闭**）：7 条固定核心指标 + 一行数据源状态。

打开 widget 的第一秒回答"现在有什么要我处理"，需要数字时再展开。

### 语言

保持双语单次生成、`中文` / `日本語` 原位切换、不持久化语言选择。语言按钮保留在 header 右侧。

### 数据范围

模型只看**公司级汇总 + 异常店铺**：

- 全公司 15 条确定性指标。
- 最多 5 家有异常的店铺（跨源合并的单一视图）。
- 最多 10 条 1–3 星差评脱敏样本。

不再发送：商品排名、7 日日粒度趋势、配送公司分布、正常店铺列表、各模块的独立店铺列表。

---

## 一、数据层

### 1.1 modelInput 新结构

```
{
  capturedAtJST,
  severity,           // normal | attention | critical | unknown
  dataQuality,        // complete | partial | insufficient
  sourceCoverage,     // { valid, total: 4 }
  sourceFreshness,    // { shipping|attention|sales|performance: { state, updatedAtJST } }
  metrics: [],        // 15 条，唯一数值真源
  attentionShops: [], // ≤5 家
  reviewSamples: [],  // ≤10 条
  comparisonWindow,
  caveats: []
}
```

预估体积约 7–8KB（现状接近 50KB 上限）。上限从 50000 字节降到 16000。

### 1.2 删除的代码

`analysis-input.mjs` 中整体删除：

| 函数 | 行数 | 理由 |
|---|---|---|
| `compactModules` | ~150 | 全量重建 4 个源，数值与 `metrics` 重复，店铺明细由 `attentionShops` 取代 |
| `collectShops` + `otherShops` | ~40 | 白名单机制随 `compactModules` 一并消失 |
| `collectProducts` | ~30 | 商品排名不再进入模型输入 |
| `aggregateSalesDaily` | ~10 | 7 日日粒度趋势不再进入模型输入 |
| `compactSalesShops` / `topRows` / `keepAllowedShops` / `compactSourceStates` / `ratingCounts` / `enumOrNull` | ~60 | 仅被上述函数使用 |
| `displayMetric` / `formatValue` | ~30 | 标签与格式化移到浏览器侧 |

`collectShops` 的排序 bug 随之消失：现在的 `volume` 把日元、件数、访问数直接相加（`shop.salesYen || shop.total_quantity || shop.traffic?.visitCount`，且跨源累加），销售额一进来就压倒一切，所谓"白名单"实际等于"按日元排前 20"，其他源的店铺被一个与其无关的排序裁掉。

### 1.3 METRIC_DEFINITIONS：28 → 15 条

**保留**（键名不变，以便与已有 snapshot 的环比继续可用）：

| 源 | 键 |
|---|---|
| shipping | `shipping.today_output.total`、`shipping.active_shops`、`shipping.tomorrow.total` |
| attention | `attention.open_total`、`attention.pending_orders`、`attention.unanswered_inquiries`、`attention.overdue_inquiries`、`attention.unreplied_reviews` |
| sales | `sales.realtime_yen`、`sales.orders`、`sales.aov_yen`、`sales.realtime_vs_seven_day_avg_percent` |
| performance | `performance.traffic.visit`、`performance.traffic.delta_percent`、`performance.mix.new_sales_share` |

**删除**：

- 出荷 3 条：`shipping.shipping.total`、`shipping.shipping.yesterday_total`、`shipping.shipping.vs_yesterday_percent`
- 星级 3 条：`attention.rating_1/2/3` —— 信息已在 `reviewSamples` 里
- 7 日 4 条：`sales.seven_day_total_yen`、`sales.seven_day_avg_yen`、`sales.seven_day_orders`、`sales.seven_day_cvr` —— 对比已压缩进 `sales.realtime_vs_seven_day_avg_percent` 一个数
- 流量 3 条：`performance.traffic.unique_visitors`、`performance.traffic.expected_visit`、`performance.mix.repeat_sales_share`（复购比率 = 100 − 新客比率）

### 1.4 metrics 条目瘦身

模型不需要人类标签。每条 `metric` 从

```
{ key, source, value, unit, ja, zh, previousValue, delta, deltaPercent }
```

改为

```
{ key, source, value, unit, previousValue, delta, deltaPercent }
```

`ja` / `zh` 标签移到浏览器侧 i18n（`uoaisummary.metric.<key>`），数值格式化在客户端做。这同时消除了"metricKey 当标签显示"的 UI 问题。

`metricDisplay` 整块删除。`persisted.latest` 改为保存 15 条 `metrics`（`{ key, value, unit, previousValue, delta, deltaPercent }`），由 UI 渲染。

### 1.5 attentionShops

取 `attention.shops` 中 `status !== "normal"` 的行，与 `performance.shops` 中 `traffic.status !== "normal"` 的行按店铺名做并集，按 `critical` > `attention` 排序，取前 5 家：

```
{
  shopName,
  issues: [],             // "orders" | "inquiries" | "reviews" | "traffic"
  pendingOrderCount,
  unansweredInquiryCount,
  overdueInquiryCount,
  unrepliedReviewCount,
  visitDeltaPercent,      // sampleCount >= 3 时才有值，否则 null
  salesYen                // 从 sales.shops 按店铺名补，缺失为 null
}
```

一家异常都没有时，数组为空——这本身就是"全社平常"的信号。

### 1.6 出荷相关

- `tomorrowOutput` 原样保留（它只读 `tomorrow_output` / `yesterday_output`，本来就在出力侧），仅把它移到 `metrics.mjs`。
- `compactModules` 里的 `topCouriers`（配送公司分布）、`todayShipping`、`yesterdayShipping`，以及 `businessDateJST` 对 `today_shipping.date` 的回退，随该函数一并删除。
- `source-client.mjs` 的 `validatePayload("shipping", …)` 去掉 `requireRecord(data.today_shipping)`；`today_output` 仍必填。出荷字段缺失不再让整个 shipping 源判为不可用。

### 1.7 severity 拆维度

现在 `severity()` 里"任何一个源不是 `fresh` 就降到 `attention`"，把数据延迟和经营异常混成一个维度。改为：

- `severity` 只看 `attention.status` 与 `performance.traffic.status`：任一 `critical` → `critical`；任一 `attention` → `attention`；否则 `normal`。有效源 < 2 时 `unknown`。
- 数据新鲜度只体现在 `dataQuality` 与 `sourceFreshness`，不再影响 `severity`。

### 1.8 截断策略

现在超过上限时先扔商品、再扔差评，信息量最高的定性数据先被扔掉，而重复的 `modules` 一条不动。新顺序：

1. `metrics` 的 `previousValue` / `delta` / `deltaPercent`（先扔环比，保留当前值）
2. `attentionShops` 从 5 家降到 3 家
3. `reviewSamples` 从 10 条降到 5 条
4. 仍超限 → 抛 `source_unavailable`

### 1.9 文件拆分

`analysis-input.mjs`（716 行）拆成：

- `metrics.mjs`：`METRIC_DEFINITIONS`、`metric()`、`tomorrowOutput()` 及数值辅助
- `analysis-input.mjs`：`buildAnalysisInput()`、`attentionShops`、`reviewSamples`、severity/dataQuality、截断

各约 150 行。

---

## 二、输出结构

### 2.1 新 schema

```js
{
  headline:   { ja, zh },   // ja ≤ 80, zh ≤ 60
  assessment: { ja, zh },   // ja ≤ 300, zh ≤ 220
  actions: [                // 1–3 条
    {
      priority,   // "high" | "medium" | "low"
      module,     // "shipping" | "attention" | "sales" | "performance"
      shopName,   // string | null
      metricKey,  // string | null，必须是本次 metrics 里有值的键
      title:  { ja, zh },
      reason: { ja, zh },
    }
  ]
}
```

删除 `evidence` 与 `reviewThemes`。差评仍作为输入，模型认为重要就写进 action。`summary-schema.mjs` 从 141 行降到约 70 行。

`actions[].metricKey` 是新增的可选字段，让 action 能挂一个数字依据，替代原来独立的 evidence 块。校验规则与原 `evidence.metricKey` 一致：非 null 时必须存在于 `metricKeys` 集合。

### 2.2 提示词

`SYSTEM_INSTRUCTIONS` 现在只有 4 行，没有说明什么算"值得写成 action"，模型会凑满 3 条。补充：

- 优先级定义：`high` = 今天不处理会产生损失；`medium` = 本周内应确认；`low` = 记录性确认。
- **允许只写 1 条**。没有值得做的事时，写一条 `low` 的确认项，不要凑数。
- 差评样本的用法：只在能指向具体可行动的问题时写进 action，不做泛化的情绪总结。
- `metricKey` 只在该数字确实是这条 action 的依据时填，否则填 `null`。

`max_output_tokens` 保持 12000。

设计阶段原本打算把它降到 3000——理由是输出块从 5 减到 3，用不了那么多。这个推理是错的：Responses API 的这个额度同时覆盖**推理 token 和可见输出**，而按 schema 上限估算，双语的 headline + assessment + 最多 3 条 action 本身就要 2000–2300 token，配上文档示例里的 `reasoningEffort: high` 几乎没有余量。一旦触顶，`responses-client.mjs` 会把它归为不可重试的 `model_schema`，表现为每小时静默失败一次。

维持 12000 意味着上限与重构前一致，但可见输出占掉的更少，留给推理的余量反而比重构前更大。另外增加了一条判定：响应因输出上限被截断时（`status === "incomplete"` 且 `incomplete_details.reason === "max_output_tokens"`），公开错误码仍是 `model_schema`，但服务端消息会点明原因，便于诊断。

---

## 三、UI

### 3.1 结构

单卡片，自上而下：

1. **header 一行**：状态点（绿/黄/红/灰）+ `AI 経営サマリー` + 生成时刻 + 右侧 `中文` 与 `再分析` 两个按钮。
2. **headline**：19px / weight 500。
3. **assessment**：14px / `text-secondary` / line-height 1.7。
4. **action 列表**：纵向，每条 = 优先级标签 + 标题（14px/500）+ 理由（13px/secondary），理由**默认可见**。`metricKey` 有值时，把该指标的人话标签和数值作为灰色尾注挂在理由末尾。
5. **折叠条**：左侧 `指標` 按钮（**默认关闭**），右侧数据源摘要。
6. **折叠区**：7 条固定指标卡。

### 3.2 状态点与徽章

现在的 severity 徽章 + state 徽章两个胶囊合并为 header 左侧一个 8px 状态点：

| severity | 颜色 |
|---|---|
| `normal` | success |
| `attention` | warning |
| `critical` | danger |
| `unknown` | 中性 |

`running` / `stale` / `partial` 这类运行态不再占一个胶囊，改为 header 里生成时刻旁边的一小段说明文字，且只在非 `ready` 时出现。

### 3.3 固定指标条（7 条）

| 位置 | 指标键 | 标签 | 次要行 |
|---|---|---|---|
| 1 | `sales.realtime_yen` | 実時売上 | 环比 delta |
| 2 | `sales.orders` | 注文数 | 环比 delta |
| 3 | `sales.realtime_vs_seven_day_avg_percent` | 7日平均比 | 固定文案「基準100%」 |
| 4 | `performance.traffic.visit` | 訪問数 | `performance.traffic.delta_percent`（同曜日基准差） |
| 5 | `attention.open_total` | 未対応 | 环比 delta |
| 6 | `shipping.today_output.total` | 今日出力 | 环比 delta |
| 7 | `shipping.tomorrow.total` | 明日予定 | `tomorrowOutput().mode` 为 `predicted` 时标「予測値」 |

指标缺值时该卡显示 `—`，不隐藏——位置固定才不会每小时跳。

### 3.4 数据源状态

现在的 4 格 `dl` 网格换成折叠条右侧一行文字：

规则：按 `unavailable` > `stale` > `delayed` > `fresh` 取最差的源，只显示它一个。

- 全部 `fresh`：`4/4 最新`
- 恰好一个非 `fresh`：`4/4 · 楽天売上 遅延`
- 多于一个非 `fresh`：`4/4 · 楽天売上 遅延 +1`（`+N` 是其余非 `fresh` 源的个数）
- 有 `unavailable` 源：`3/4 · 経営指標 取得不可`

明细只在折叠区展开时、且存在非 `fresh` 源时才渲染。

### 3.5 组件拆分

`component.jsx`（407 行）拆成：

- `SummaryHeader`：状态点、标题、时刻、运行态文字、两个按钮
- `ActionList`：action 纵向列表
- `MetricStrip`：折叠条 + 7 条指标 + 数据源状态
- `Component`：数据获取、语言、冷却、折叠状态

主文件降到约 250 行。`NoSummary` 保持现有形态，只跟随新的状态点配色。

---

## 四、缓存迁移

`summary-store.mjs` 的 `METRIC_KEYS` 白名单要同步删掉 13 条已移除的键，`normalizeSummary` 要删掉 `evidence` / `reviewThemes` 分支并新增 `metricKey`，`normalizeMetricDisplay` 换成 `normalizeMetrics`。

旧缓存的处理：现在 `read()` 在 `parsed.latest` 存在但归一化后为 `null` 时会抛错，把文件重命名为 `.corrupt-<ts>` 再从空状态开始（[summary-store.mjs:292](../../../src/widgets/uoaisummary/summary-store.mjs)）。旧结构必然触发这条路径（`normalizeSummary` 要求 `evidence.length >= 2`），结果是能自动恢复，但会留下一个名字叫 "corrupt" 的文件，语义不对。

改为显式迁移：`emptySummaryState().version` 从 1 提到 2，`normalizeState` 在 `value.version !== 2` 时直接返回空状态，`read()` 在版本不匹配时跳过"损坏"判定，正常返回空状态并触发后台重新生成，不重命名文件。

---

## 五、影响面

### 代码

| 文件 | 变化 |
|---|---|
| `analysis-input.mjs` | 716 → 约 150，另拆出 `metrics.mjs` 约 150 |
| `summary-schema.mjs` | 141 → 约 70 |
| `summary-store.mjs` | 白名单与归一化同步，版本号 1 → 2 |
| `summary-service.mjs` | `persisted.latest` 由 `metricDisplay` 改为 `metrics` |
| `source-client.mjs` | shipping 校验放开 `today_shipping` |
| `responses-client.mjs` | 提示词补强；`max_output_tokens` 维持 12000，新增输出截断的诊断分支 |
| `component.jsx` | 407 → 约 250，另拆 3 个子组件 |

### 文案

三语 `common.json`：删除 `reviewThemes`、`coverage`、`showDetails` / `hideDetails`（改为 `指標` 折叠按钮的新键），新增 15 条 `uoaisummary.metric.*` 标签和数据源状态摘要文案。

### 测试

需要改写：`analysis-input.test.js`、`summary-schema.test.js`、`summary-store.test.js`、`component.test.jsx`、`summary-integration.test.js`、`summary-service.test.js`（`metricDisplay` 相关断言）、`locales.test.js`。

新增覆盖：

- shipping 源缺 `today_shipping` 时仍判为可用
- `severity` 不再被源延迟影响
- `attentionShops` 在无异常时为空数组
- 截断按新顺序降级
- version 1 缓存被静默重置为空状态且不产生 `.corrupt` 文件

### 文档

`docs/widgets/services/uoaisummary.md` 的"数据与隐私"、"失败状态"两节需要同步：不再发送商品排名与 7 日趋势，出荷数据不再纳入。

---

## 六、不做的事

- 不改变生成节奏、冷却、单进程调度、代理安全模型。
- 不改变配置字段与 `config/services.yaml` 的写法。
- 不改动四个上游数据源 widget 本身。
- 不引入新的模型能力（工具调用、多轮、流式）。

---

## 上线后的两处修正（2026-08-02）

首次实际运行暴露了两个本设计没有预见的问题。

### 出力被表述成出荷

模型把 `output` 侧的 892 件写成了「出荷892件」。原因是本设计把人类标签从模型输入里移除后，模型只剩键名可依据，而 `shipping.today_output.total` 的 `shipping.` 前缀命名的是**数据源看板**（uoshippingdashboard），不是指标含义——日语里 shipping 即出荷。恰恰因为本设计把出荷数据删干净了，这个前缀彻底名不副实。

修正：三个指标键改名为 `output.today.total` / `output.active_shops` / `output.tomorrow.total`，键名描述测量对象而非来源看板；`uoaisummary.source.shipping` 的三语标签从「出荷 / 发货 / Shipping」改为「出力 / 输出 / Output」；`SYSTEM_INSTRUCTIONS` 新增词汇约束，明确本部署不含任何出荷数据，禁止把任何数字表述为 出荷 / 発送 / 发货 / shipment。

代价：改名会让指标与已有 snapshot 对不上，升级后第一个周期这三条不显示环比。

### performance 被当作实时流判定新鲜度

`source-client.mjs` 用 10 分钟刷新间隔算 performance 的新鲜度，3.3 小时后判 stale。但该源由上游任务每天早上刷新一次、描述的是前一个营业日，17:19 判它过期是把日快照当实时流看。连锁后果：源判 stale → 三条 performance 指标被排除（UI 上「訪問数」显示 `—`）→ 有效源 3/4 → `dataQuality` 降为 partial → 结论里出现「データは部分的です」。

修正：performance 改用按 JST 日历日判定——当天生成为 fresh，前一天为 delayed，更早为 stale。其余三个源仍按经过时间判定。`SYSTEM_INSTRUCTIONS` 同时说明该源是前一营业日的日快照，不得当作当下数据表述。
