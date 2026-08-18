# 推荐入口 header 醒目 CTA — 任务留档

日期：2026-08-18
范围：P2 推荐佣金 — 用户端推荐入口 UI（header 醒目引导）

## 需求

推荐入口要特殊设计、明显一点，放在 header 上，引导用户参与推荐计划。

## 实现

### 新增 `components/ReferralCta.tsx`
- 独立金色渐变胶囊按钮（amber-400 → yellow-300 → amber-400），黑字高对比
- Gift 礼物图标 + 「Earn 40%」文案
- 右上角脉冲闪烁圆点（animate-ping + 白点），暗示「有新活动」
- 扫光动画（hover 时白色光带扫过）
- 金色发光阴影（shadow-amber-500）
- `aria-label` = referralCtaHint（无障碍）
- 对所有用户展示（未登录点击进 /referral 页会引导登录）

### i18n 新增键（lib/i18n/dictionaries/en.ts）
- `nav.referralCta: 'Earn 40%'`
- `nav.referralCtaHint: 'Share your link, earn 40% commission'`

### 接入三个 header
- `components/SiteHeader.tsx`（静态页）
- `components/HomePageClient.tsx`（首页）
- `components/EvaluatePage.tsx` 的 `EvaluateTopBar`（评估页）

三处均在 right-side 容器最左侧插入 `<ReferralCta />`，位置统一在积分 pill / Verify Email 按钮之前。

## 视觉定位

区别于现有两个 CTA：
- 粉色「Verify Email」= 主转化（购买/验证）
- 青色积分 pill = 状态展示
- **金色「Earn 40%」= 推荐赚佣金（新增长飞轮），用高对比金色 + 发光 + 闪烁点抢占视觉权重**

## 验证

- tsc 零错误
- 生产 build 成功（162 页静态生成，/referral 6.32 kB）
- 浏览器验收：首页 header 右侧正确显示「Earn 40%」金色按钮，视觉模型确认其为 header 最抢眼元素（金色高对比 + 发光 + 闪烁点，权重高于粉色 Verify Email）
- 登录态（有积分 pill + UserMenu）下同样正确渲染

## 待办

1. 用户最终确认视觉后：bump 版本号 + 推送（P2 佣金 + 二期提现 + 本次 header CTA 均未推送）
2. 遗留：webhook `refund.created` 分支 EUR 币种误拒风险复核
