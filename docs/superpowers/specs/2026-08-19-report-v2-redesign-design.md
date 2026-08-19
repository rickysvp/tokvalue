# Report v2 重设计 — 浅色金融风单页叙事报告

日期：2026-08-19
状态：设计已获批（5 节全部通过用户确认）
范围：评估报告全链路（免费 Teaser + 付费完整报告 + 付费墙换皮），支付逻辑不动

## 1. 背景与问题

用户判定当前评估报告（深色 + 抖音霓虹粉/青风格）存在四项根源性问题，全部确认：

1. 视觉设计丑/廉价 — 配色刺眼、卡片像模板、无高级感
2. 内容组织不行 — 4 Tab 数据堆砌，像数据库导出，缺少叙事
3. 两者都差 — 需要整体重做
4. 缺少 wow 时刻 — 无惊艳感、无付费/分享冲动

浏览器实测（demo 账号）补充证据：信息密度过高且分区不清；关键数值缺少层级；图表缺轴标图例；免责声明位置尴尬；整体像内部原型。

## 2. 设计决策（用户已确认）

| 决策点 | 结论 |
|---|---|
| 视觉方向 | 浅色金融报告风（Credit Karma / CreditReport 式信任感） |
| 信息架构 | 单页叙事滚动（废弃 4 Tab） |
| wow 时刻 | 全选，落地优先级：估值数字动画 → 诊断式结论先行 → 评分动画 → 可分享卡片 |
| 范围边界 | 报告全链路重做；支付/解锁逻辑原样保留只换触发 UI |
| 实施方案 | 方案 B：全新 report-v2 组件树，数据层不动，一次成型替换 |
| 层级色板 | 翡翠金标（方案一，四色对比后选定） |

## 3. 色板：翡翠金标（新 TIER_COLORS）

| Tier | 价值层级 | 色值 | 语义 |
|---|---|---|---|
| S / A | Premium Value | `#047857` 翡翠绿 | 财富、增值 |
| B / C | Growth Value | `#1d4ed8` 藏蓝 | 信任、增长 |
| D / E | Developing Value | `#b45309` 金棕 | 潜力 |
| F | Early Value | `#64748b` 石墨灰 | 起步（中性，不贬低） |

- 全部满足 WCAG AA（≥4.5:1 于白底），文字/描边在浅色报告上直接可用
- 四色色相拉开最大（绿→蓝→金→灰），扫读即分层
- 实现：只改 `lib/tier.ts` 的 `TIER_COLORS` 常量值，保留「所有 UI 必须读常量」的硬约束架构；Recently Evaluated、ScoreGauge、历史记录页自动生效（需目检浅色适配）

## 4. 设计系统

表面与背景
- 页面底 `#F7F8FA`（冷灰白）；卡片纯白 + 1px `#E5E7EB` 边框 + `0 1px 3px rgba(0,0,0,0.04)` 阴影
- 卡片圆角 12px；section 间距 32px；卡片内边距 24px

字体与数字
- Inter；数字一律 `tabular-nums`（滚动动画不抖动）
- 字阶：报告大标题 32px / section 标题 20px / 卡片标题 16px / 正文 15px / 辅助 13px
- 估值主数字 56px semibold — 全页唯一视觉王者，其他数字不得超过

色彩三层
1. 层级色（§3）：仅用于层级徽章、评分环、支柱条
2. 功能色：主按钮/链接/进度 `#1d4ed8`；成功 `#15803d`；警示 `#b45309`；危险 `#dc2626`（浅底 AA 达标）
3. 中性色：正文 `#111827` / 次要 `#6B7280` / 边框 `#E5E7EB` / 底 `#F7F8FA`

图表语言：白底、细网格 `#F3F4F6`、轴文 12px 灰、数据色只用层级色与藏蓝，单图 ≤2 色。

## 5. 信息架构（单页叙事滚动）

叙事：先给答案 → 值多少钱 → 为什么值 → 怎么变现 → 怎么提升 → 传播。

```
① Verdict Hero        诊断结论先行：一句话判定 + 估值大数字滚动动画
                       + 置信度 + 价值层级徽章 + 核心指标带
② Account Value       估值区间条 + 四分项拆解 + 风险折扣显式化 + 「怎么算的」折叠
③ Six Pillars         六支柱评分条入场动画，可展开归因 + 提升建议
④ Deal Pricing        开价 / 合理区间 / 底价三卡 + 谈判要点（付费）
⑤ Peer Ranking        你 vs 同级中位数对比条形图（付费）
⑥ Risk & Health       风险信号卡 + 健康清单（付费）
⑦ 30-Day Plan         四周任务时间线，动作可勾选（付费）
⑧ Share Card          canvas 生成 1200×630 分享卡，下载 PNG
⑨ Methodology         折叠附录：数据来源与计算方法
```

## 6. Section 细节与交互

**① Verdict Hero（全页唯一 wow）**
- 头像 + 昵称 + 层级徽章（翡翠绿/藏蓝…）
- 一句话判定（复用 verdict.ts headline）
- 估值动画：56px 从 $0 ease-out 滚到区间中值，1.2s，tabular-nums；下方 low—high 区间细条；置信度 pill
- 核心指标带 4 格：粉丝 / 平均播放 / 互动率 / 排名百分位，悬停显 hint（复用现有文案）

**② Account Value**
- 横向区间条：low—mid—high 三刻度，「温度计」造型
- 四分项横条（品牌合作/内容资产/粉丝资产/变现能力）：名称 + 金额 + 占比条 + 一句话解释（复用 valuation.ts 已重写的 detail）
- 风险折扣 >0 时显式一行 "Risk adjustment: −18%"
- 「How this is estimated」默认折叠

**③ Six Pillars**
- 每支柱横卡：名称 + 0-100 分数条（色=状态）+ Strong/On track/Needs attention 标签
- 入场：滚动进视口时分数条 0→目标（IntersectionObserver + CSS transition 120-220ms）
- 点击展开：归因 + 一条提升建议

**④ Deal Pricing**：Opening/Fair Range/Floor 三卡并排，大数字 + 假设小字 + 谈判要点列表
**⑤ Peer Ranking**：5 项指标对比条，悬停显测量定义（复用 ? 帮助逻辑）
**⑥ Risk & Health**：风险卡（无风险则绿色确认态 "No risk signals detected"）+ 健康清单
**⑦ 30-Day Plan**：垂直 4 周时间线，每周目标 + 2-3 可勾选动作（localStorage 持久化）
**⑧ Share Card**：canvas 绘制 logo + @username + 估值区间 + 层级徽章 + 排名 + tokvalue.com 水印；下载 PNG；纯前端。免费与付费用户均可用（传播钩子）：卡片所见即所得 — 免费版与页面 Teaser 一致（区间可见、中值模糊样式），付费版含完整估值区间，不泄露付费数据
**⑨ Methodology**：默认收起的附录

## 7. Teaser（免费）与付费墙

Teaser = ① 降级版 + 付费墙：
- Verdict Hero 保留：头像、判定句、层级徽章、指标带（建立信任）
- 估值中值 CSS blur 6px + 锁图标 + "Unlock your exact value"
- ②–⑦ 各 section：标题 + 首行内容 + 向下 120px 白→透明渐变遮罩 + 锁定图标
- 滚过 ① 后出现 sticky 底部付费条（64px，白底上边框，不遮挡）："Unlock full report — $9" 主按钮 + "What's included" 次链接（浮层列 ②–⑦ 交付物，内容复用 LockedTabPreview 逻辑）
- 解锁成功：付费条消失，全 section 淡入，平滑滚动到 ② Account Value 顶部

支付链路零改动：沿用 `/api/evaluate/upgrade`、Creem、verify-code；仅替换触发 UI 挂载位置。

## 8. 技术实现

组件树（新建 `components/report-v2/`，客户端组件；EvaluatePage.tsx 改为渲染新树）：

```
components/report-v2/
├── ReportShell.tsx          # 单页滚动容器 + section 编排 + 解锁态
├── sections/
│   ├── VerdictHero.tsx      # ① CountUp（自实现 rAF，无三方库）
│   ├── AccountValue.tsx     # ②
│   ├── PillarCards.tsx      # ③ IntersectionObserver
│   ├── DealPricing.tsx      # ④
│   ├── PeerRanking.tsx      # ⑤
│   ├── RiskHealth.tsx       # ⑥
│   ├── ThirtyDayPlan.tsx    # ⑦ localStorage
│   ├── ShareCard.tsx        # ⑧ canvas 1200×630
│   └── Methodology.tsx      # ⑨
├── UnlockBar.tsx            # sticky 付费条 + What's included 浮层
├── TeaserMask.tsx           # 渐变遮罩 + 锁定包装器
└── ui/                      # CountUp、SectionHeader、MetricCell、HelpHint
```

关键决策
- 数据层零改动：pillar.ts / valuation.ts / verdict.ts / commercial.ts 及 160 个单测全复用；EvaluatePage 的评估触发、upgrade 调用、session 检查逻辑保留，只换 `result` 渲染
- 旧组件删除：`components/report/` 7 组件 + ReportTabs.tsx + DeepAnalysisSection.tsx 替换后删（git 可回溯）
- TIER_COLORS 更新后三处引用（Recently Evaluated、ScoreGauge、历史页）需目检浅色适配
- 动画无障碍：全部包 `prefers-reduced-motion` 降级直接显终值
- i18n：新文案进 en.ts，复用 dict 结构

迁移步骤（单分支一次成型，无中间共存态）
1. 设计 token：tailwind config + TIER_COLORS
2. ui/ 原子 + ReportShell + VerdictHero（浏览器目检）
3. ②–⑨ 逐个实现
4. Teaser 遮罩 + UnlockBar 接支付链路
5. EvaluatePage 切新树，删旧组件
6. 全站目检层级色泄漏（首页、Dashboard、历史页）

## 9. 测试策略

- 单测（新增）：CountUp 数字格式化、ShareCard canvas 文本布局纯函数、TeaserMask 锁定判定；现有 160 测试保持绿色
- 浏览器验收：demo 免费态（遮罩/付费条/浮层）→ 解锁态（动画/滚动定位）→ 分享卡下载
- 付费回归：DEV_SKIP_PAYMENT=false 走一次 unlock 全流程

## 10. 硬约束遵循确认

- 所有 UI 颜色读 `lib/tier.ts` 的 `TIER_COLORS`：遵循（更新常量值本身）
- 不改支付逻辑：遵循（只换触发 UI）
- 价值层级用 Premium/Growth/Developing/Early Value 命名：遵循
- 不出现 S/A/B/C/D/E/F 等级标签于用户可见文案：遵循（徽章只显价值层级名）
- 不虚构功能：遵循（九个 section 全部映射现有数据字段）
