# 报告性能与免费转付费体验

**日期**: 2026-08-18  
**状态**: 已确认，待实现  
**范围**: 评估报告首屏性能、按 Tab 模块加载、免费预览与付费解锁的信息架构

---

## 背景

`/evaluate/[username]` 当前 First Load JS 约为 1.13 MB，其中页面自身约 899 kB。`EvaluatePage.tsx` 静态导入所有报告模块、图表、PNG/PDF 导出和分享能力，即使用户只查看 Overview 也会下载大量不会立即使用的代码。

免费用户进入 Growth、Revenue、Commerce Tab 后，会看到连续多个相似的锁定区块；每个区块都是抽象功能描述与相同 CTA。它既不能帮助用户理解单次 $9 的具体结果，也造成“报告很长但我不知道何时应购买”的体验。

现有后端已正确裁剪免费响应，锁定数据不会进入 DOM；本 SPEC 只改变客户端加载和展示顺序，不扩大免费数据范围。

## 目标

1. 首次打开免费报告时只加载 Overview 所需代码，避免加载所有付费 tab、导出库和重型图表。
2. 保持付费用户的完整 12+ 模块报告和导出能力。
3. 让免费用户在一个屏幕内理解：已获得什么、继续解锁能完成什么商业动作、价格是多少。
4. 使所有锁定 tab 使用一致的、面向结果的预览，不重复渲染多个几乎相同的付费墙。
5. 为后续转化优化建立可比较的性能和漏斗指标。

## 非目标

- 不更改评分算法、估值数值、套餐价格或积分模型。
- 不向免费 API 响应添加任何付费数据。
- 不重做整站视觉风格或首页。
- 不在本次实现报告分享、PDF 服务器端生成或多语言重构。

## 方案比较

| 方案 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| A. 仅代码分割，UI 不变 | 风险最低 | 免费 tab 的重复锁区仍影响转化 | 不足 |
| B. 动态加载 + 单个结果型锁定预览 | 减少首屏、清晰解释购买价值、改动集中 | 需要整理 tab 边界 | **采用** |
| C. 将所有报告压缩为单页长卷 | 叙事连续 | 移动端更重、导航与性能更差 | 不采用 |

## 设计

### 1. Tab 信息架构

保留四个一级 tab 和其现有语义：

| Tab | 免费用户可见 | 付费用户可见 |
|---|---|---|
| Overview | 账号头部、估值区间、单条合作报价、总评分、雷达图、风险、同级排名、1 个最佳行动建议 | 与免费一致，并可使用导出/保存/完整历史功能 |
| Growth | 一个“Growth Playbook”预览 | 内容策略、趋势、30/60/90 增长计划、深度分析 |
| Revenue | 一个“Revenue Plan”预览 | 收入渠道分解、12 个月变现路线 |
| Commerce | 一个“Commercial Readiness”预览 | 品牌匹配、商业化建议、电商准备度 |

免费用户点击后三个付费 tab 时，不渲染现有的多个 `LockedSection`。改为一个单一 `LockedTabPreview`，由明确的成果、输入依据和 CTA 组成。

### 2. 免费报告的价值递进

Overview 继续提供可验证的“诊断层”，但收敛重复内容：

1. **账户摘要与数据时间**：账号、粉丝、互动、地区、评估时间。
2. **商业快照**：估值区间和单条品牌合作报价，并持续展示“estimate / not a guarantee”说明。
3. **为什么得出这个结论**：总分、10 维雷达、风险清单、同级位置。
4. **一个立即可执行动作**：仅保留 `summary.bestAction`；Strengths、Weaknesses、Audience 以紧凑折叠样式保留，避免首屏过长。
5. **下一步 CTA**：明确写“Unlock the 30/60/90-day plan, revenue channels, and brand fit for $9 once.”

免费用户不会看到付费 tab 的实际数值、品牌名称、AI 推荐、完整收入拆分、内容主题或趋势数据。

### 3. LockedTabPreview

新增 `LockedTabPreview`，接受 `tab`、`account tier` 和 `onUnlock`，不接受完整 `Evaluation` 或付费模块数据。

每个 tab 固定展示：

| Tab | 标题 | 三项解锁成果 |
|---|---|---|
| Growth | Your 90-Day Growth Playbook | content pillars; posting cadence; trend opportunities |
| Revenue | Your Monetization Plan | revenue-channel estimate; priority sequence; 12-month targets |
| Commerce | Your Brand & Commerce Fit | brand-fit criteria; commercial readiness; highest-priority offers |

组件结构：

- 结果导向标题和一句解释；
- 3 个不含真实付费数据的成果项；
- 价格与“一次性购买”说明；
- 一个主 CTA；
- 小字声明：完整建议将在解锁后基于该账号数据生成。

在移动端，CTA 固定在预览卡片底部；已有的全局 mobile unlock bar 保留，但不额外叠加第二个固定条。

### 4. 动态加载与 bundle 拆分

`EvaluatePage` 保留为轻量的路由协调器、账户头部、Tab 状态和 Modal 容器。报告内容拆分为以下 client components：

| 新单元 | 职责 | 加载时机 |
|---|---|---|
| `components/report/OverviewReport.tsx` | 免费安全的 Overview 内容 | 初始加载 |
| `components/report/GrowthReport.tsx` | 四个 Growth 付费模块 | 付费用户首次进入 Growth |
| `components/report/RevenueReport.tsx` | 收入与路线图 | 付费用户首次进入 Revenue |
| `components/report/CommerceReport.tsx` | 品牌、商业化、电商 | 付费用户首次进入 Commerce |
| `components/report/LockedTabPreview.tsx` | 免费 tab 的单一预览 | 免费用户首次进入对应 tab |
| `components/report/ReportTabSkeleton.tsx` | 动态模块加载占位 | 动态 import 期间 |

实现方式：

- 使用 `next/dynamic`，Growth/Revenue/Commerce 报告为按需动态 import，不设 SSR。
- `RadarChart` 和 Recharts 只由 `OverviewReport` 动态导入；显示定尺寸 skeleton，避免 CLS。
- `html2canvas`、`jspdf`、`@react-pdf/renderer` 和 `export-pdf` 移出顶层 import，只在用户点击 Export 后 `import()`。
- 分享卡片和分享链接 modal 改为首次打开时动态 import。
- 所有动态模块提供最小布局稳定的 loading fallback；加载失败显示“Could not load this section. Retry”而不是白屏。

目标不是承诺固定绝对 bundle 数字，而是在同一 production build 下实现：

- `/evaluate/[username]` First Load JS 相对当前 1.13 MB 降低至少 35%。
- 免费用户初始加载不得包含 Growth、Revenue、Commerce 付费报告模块或导出库。
- Tab 首次点击加载时的可感知反馈在 100 ms 内出现。

### 5. 付费解锁后的行为

购买/消耗积分并成功 unlock 后：

1. 当前 Overview 保持可见，避免布局跳动。
2. 当前 active tab 若为锁定 tab，立即切换为对应完整报告并显示 section skeleton，直到动态模块加载。
3. 三个付费 tab 的已访问模块可保留在内存；不预加载未访问 tab。
4. Export 按钮只有已解锁时可用，点击后才加载导出依赖。
5. PDF 导出只包含当前可用的完整付费报告；导出前必须等待相关模块加载完成或明确提示用户等待。

### 6. 埋点与实验指标

复用现有 `/api/track`，增加或标准化以下事件：

| 事件 | 触发 | 最小 metadata |
|---|---|---|
| `report_overview_ready` | Overview 可交互 | `isFree`, `loadMs`, `username` |
| `locked_tab_view` | 免费用户进入 Growth/Revenue/Commerce | `tab`, `tier` |
| `locked_tab_unlock_click` | 预览卡 CTA | `tab`, `tier` |
| `report_tab_loaded` | 动态付费 tab 成功渲染 | `tab`, `loadMs` |
| `report_export_start` | 已解锁用户点击导出 | `format` |

用以下漏斗判断方案是否有效：

```text
report_overview_ready
  → locked_tab_view
  → locked_tab_unlock_click
  → checkout_start
  → checkout_success
  → paid_report_tab_loaded
```

主要指标：

- 初始报告可交互时间与 First Load JS；
- `locked_tab_view → unlock_click` 转化；
- `unlock_click → checkout_start` 转化；
- `checkout_success → paid_report_tab_loaded` 成功率；
- 付费用户至少打开一个深度 tab 的比例。

## 文件边界

| 文件 | 改动职责 |
|---|---|
| `components/EvaluatePage.tsx` | 删除重型静态导入；只管理结果、权限、tab、modal 和动态报告编排 |
| `components/report/OverviewReport.tsx`（新建） | 免费安全 Overview 与其紧凑摘要布局 |
| `components/report/GrowthReport.tsx`（新建） | Growth 付费模块组合 |
| `components/report/RevenueReport.tsx`（新建） | Revenue 付费模块组合 |
| `components/report/CommerceReport.tsx`（新建） | Commerce 付费模块组合 |
| `components/report/LockedTabPreview.tsx`（新建） | 三种锁定 tab 的单卡预览 |
| `components/report/ReportTabSkeleton.tsx`（新建） | 布局稳定的动态加载状态 |
| `components/RadarChart.tsx` | 由 Overview 延迟加载；保留无障碍标签 |
| `lib/export-pdf.tsx` | 改为点击导出后动态导入的依赖 |
| `components/ShareCardModal.tsx`、`components/ShareModal.tsx` | 在打开时动态加载 |
| `components/FreeBanner.tsx`、`components/UnlockFooter.tsx` | 文案改为具体解锁成果和一次性价格 |

## 测试策略

### 单元与组件测试

- 免费 Evaluation 只能让 `OverviewReport` 接收免费字段；`LockedTabPreview` 不接受付费数据 props。
- 免费用户进入每个锁定 tab 只显示一个预览卡和一个主 CTA。
- 付费用户进入每个 tab 显示对应完整模块，不显示锁定预览。
- 动态模块加载中显示固定尺寸 skeleton；加载错误可重试。
- Export 依赖不在页面初始 import graph 中。

### 浏览器验收

1. 免费报告初次打开可见 Overview，Growth/Revenue/Commerce 未下载或执行。
2. 免费用户进入任一锁定 tab，看到对应的单一成果预览；Network 响应与 DOM 中均没有付费报告数据。
3. 已解锁用户进入各 tab，模块按首次点击加载，并保持页面稳定。
4. 移动端不出现两个相互覆盖的底部 CTA。
5. 点击 PDF/PNG/分享前不下载导出或分享卡重型依赖；点击后功能正常。

### 性能验证

- 在同一 production build 上记录 `/evaluate/[username]` 构建输出，证明 First Load JS 相比实施前下降至少 35%。
- 用 Playwright 或浏览器 Performance panel 验证免费首次访问不会请求深度 tab chunk。
- 在模拟慢 4G 下确认 Overview skeleton、账户头部和 CTA 可见，动态 tab 有反馈。

## 验收标准

1. 免费用户获得清晰、有依据的诊断层，但无法从 API/DOM/动态 chunk 获得付费分析数据。
2. 每个锁定 tab 仅有一个结果型预览与一个明确 CTA。
3. 付费用户保持现有完整报告、保存、分享和导出能力。
4. `/evaluate/[username]` First Load JS 相对基线降低至少 35%，重型依赖按用户行为加载。
5. 所有加载、失败、移动端 CTA 和解锁后切换状态可理解且不覆盖内容。
6. `npm test`、新增组件/浏览器测试与 `npm run build` 均通过。
