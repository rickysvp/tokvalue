# 导航重构 + 漏斗/utm 归因完成记录

日期：2026-08-18

## 1. 导航重构（commit 359fb4c）

用户要求：把 history 和 tracker 从顶部常驻导航移到用户邮箱下拉菜单里，因为不是常用功能。

### 实现
- 新增 `components/UserMenu.tsx` 共享下拉组件：
  - 触发器 = 邮箱 pill（头像 + 邮箱 + 下拉箭头）
  - 下拉面板 = Tracker / History 两个入口 + 「切换账号」按钮
  - 点击外部自动关闭（mousedown 监听 + ref 判断）
  - 登录态展示（`hidden sm:block`，移动端不显示下拉，沿用原逻辑）
- 三处 header 统一接入：
  - `components/SiteHeader.tsx`（静态页 contact/privacy/terms/blog 等）
  - `components/HomePageClient.tsx`（首页）
  - `components/EvaluatePage.tsx` 的 `EvaluateTopBar`（评估页）
- 从 nav 中移除 tracker/history 常驻入口，导航栏只保留 Pricing / How It Works / Blog
- 清理随之失效的 `isLoggedIn` 状态（SiteHeader、HomePageClient 中该状态仅用于控制 tracker/history 显示，移除后无读取点，彻底删除；EvaluatePage 主组件的 `isLoggedIn` 仍用于「保存到 tracker + history」按钮，保留）

### 注意
- HomePageClient 的 trust signals 区仍用 BarChart3 图标，保留 import
- EvaluatePage 的 `isLoggedIn` 仍传给 EvaluateTopBar 吗？→ 否，EvaluateTopBar 的 `isLoggedIn` prop 已移除（因为只用于 nav 里的 tracker/history）

## 2. 漏斗事件 + utm 归因（commit 359fb4c 前一个 commit）

P0（漏斗埋点）+ P1（utm 归因）已完成并推送，详见：
- docs/funnel-p0-implementation-2026-08-18.md
- docs/utm-attribution-implementation-2026-08-18.md

## 验证
- tsc 零错误
- Vitest 59/59 通过
- next build 生产构建成功

## 待办
- P2 分享飞轮（完成态主动引导 + K 因子 + share_create 埋点消费）未开始
