# 提现审核后台 Dashboard + 用户端提现闭环 — 任务留档

日期：2026-08-18
范围：P2 推荐佣金二期（USDC 提现）的管理端审核 UI + 用户端提现全链路验证

## 目标

在已有 referral 佣金体系上，补全 USDC 提现的「用户提交 → 管理端审核 → 状态流转」完整闭环，并把审核界面接入后台 dashboard。

## 已完成改动（未推送，本地验收）

### 1. 后台 dashboard 提现审核 Tab
- `app/tiktokmaster/dashboard/page.tsx`：
  - Tab 联合类型加 `'payouts'`；TAB_CONFIG 加「提现审核」项（CreditCard 图标，青色高亮）
  - 新增状态：`payouts` 列表、`payoutFilter`（requested/processing/paid/rejected/all）、`payoutTxHash`、`payoutRejectReason`、`payoutActionResult`
  - `fetchPayouts`（按 status 过滤请求 `/api/tiktokmaster/payouts`）
  - `handlePayoutAction(id, 'paid'|'rejected')`：paid 校验 tx hash（0x+64hex），rejected 校验 reason 非空
  - 审核表格：时间/用户/金额/USDC 地址/状态徽章/操作列（pending 态显示 tx hash 输入框 + reason 输入框 + 确认支付/拒绝按钮；已处理态显示 tx_hash 或 reject_reason）
  - `fmtTime` 复用（已确认存在）

### 2. 管理端 payout API（已在前轮创建，本轮验证）
- `app/api/tiktokmaster/payouts/route.ts`：GET 列表（可 status 过滤）+ POST 审核（paid 校验 tx hash、rejected 校验 reason，均 requireAdminAuth 鉴权）

### 3. 用户端提现页修复（本轮关键 bug）
- `app/referral/page.tsx`：
  - **Bug 修复**：`loadData` 原无 try/catch，`Promise.all` 里 fetch 遇网络抖动/首次编译连接重置会 reject，`setLoading(false)` 永不执行 → 永久卡 loading。已加 try/catch/finally + `!overview` 空态兜底（Retry 按钮）
  - 清理过程中产生过重复分支（loadError 分支 ×3、loadError 状态变量），已全部精简
- `lib/i18n/dictionaries/en.ts`：
  - 修复 `amount` 键重复（withdraw 域改 `amountLabel`）
  - 新增 `loadFailed` 键
  - `referral` 域完整含 USDC 提现相关键

### 4. 二期提现数据层（已在前轮创建，本轮验证）
- `lib/referral.ts`：`getWithdrawableBalance` / `requestWithdrawal` / `listPayouts` / `listPayoutsAdmin` / `markPayoutPaid` / `markPayoutRejected`
- `app/api/referral/withdraw/route.ts`：GET 余额 + POST 提现（地址正则 + 门槛校验）

## 验证结果（全链路 curl + 浏览器 + 截图）

- **tsc 零错误、59/59 测试通过、生产 build 成功**（dashboard 39.5 kB，referral 6.26 kB）
- **提现闭环**：
  - 非法地址 → `{"code":"INVALID_ADDRESS"}` ✓
  - 低于门槛（$10 < $50）→ `{"code":"BELOW_MIN"}` ✓
  - 正常提现 $50 → `requested` 状态，reserved $50 锁定，withdrawable $51.20→$1.20 ✓
  - 二次门槛 $50→$100（`hasPriorPayout:true`, `minWithdraw:100`）✓
  - 管理端列表 GET → 正确返回 payouts ✓
  - 非法 tx hash → 400 拦截 ✓
  - 拒绝审核 → `rejected` 状态 + reject_reason，reserved 释放回 withdrawable $51.20 ✓
- **浏览器 UI**：referral 页截图确认渲染正常（推荐链接卡片 + 三余额卡 + USDC 提现区）

## 关键经验

1. **Neon 抖动**：dev 下 `fetch failed`（ECONNRESET）频发，referral.ts 已加 `withRetry` + `initPromise.catch(() => initPromise = null)` 兜底；page.tsx 客户端 fetch 也必须 try/catch，否则 unhandled rejection 导致 UI 永久卡 loading
2. **`.next` 缓存与 build 冲突**：`npm run build` 会清 `.next`，与运行中的 dev server 冲突（`Cannot find module './1331.js'`）。dev 验收前需 `rm -rf .next` 重启 dev
3. **dev CSP 修复已生效**：`next.config.mjs` 的 `isDev ? [] : [CSP]` 逻辑正确，dev 下无 CSP 头，React Refresh 正常（早前 CSP 无 unsafe-eval 导致 hydration 崩溃的问题已根除）
4. **xbrowser 白名单**：`localhost:3001` 30 分钟有效；换 3000 端口需重新 shield-allow

## 待办

1. 用户最终确认 UI 后：bump 版本号（当前 1.9.2）+ 推送（P2 佣金 + 二期提现均未推送）
2. 遗留复核：webhook `refund.created` 分支 `refundCurrency !== 'USD'` 可能误拒欧元退款（Creem 官方示例 refund_currency 为 EUR），需核对生产支付币种
3. 二期提现「已支付」状态需人工线下打款后填 tx_hash（本设计为人工审核，无自动链上转账）
