# 支付回跳隐私与到账确认

**日期**: 2026-08-18  
**状态**: 已确认，待实现  
**范围**: Checkout、支付成功回跳、积分认领与到账状态反馈

---

## 背景

当前 Guest Checkout 允许付款人输入任意有效邮箱，并把积分归属到该邮箱。这是有意保留的产品能力：用户可以替任何邮箱购买积分，不要求付款人和积分使用者相同。

产品规则已确认：

1. 积分永久归属支付发起时输入的邮箱。
2. 允许任意人替该邮箱付款。
3. 用户输错邮箱由用户自行承担，平台不提供邮箱迁移、订单改绑或人工纠错流程。
4. 不新增“赠送”商品或付款人与收件人两套身份模型。

当前实现的主要问题不是代付，而是成功回跳 URL 暴露邮箱：

```text
/?paid=success&email=user@example.com
```

该参数会进入浏览器历史、访问日志，以及后续站内外跳转时可能携带的 Referer。首页与评估页分别解析该 URL 参数，导致两套相近但独立的到账逻辑。

## 目标

1. 保持“输入邮箱即积分归属邮箱”的现有购买规则。
2. 从所有支付成功 URL 移除明文邮箱。
3. 支付回跳后让用户明确看到支付确认和积分到账状态。
4. 保持 webhook 与客户端 claim 的幂等性，避免重复发放。
5. sessionStorage 丢失时不承诺恢复或改绑，但给出准确、可理解的说明。

## 非目标

- 不引入赠送模式、收件人确认或双邮箱模型。
- 不提供订单查找、邮箱纠错、积分迁移或人工恢复流程。
- 不改变套餐、价格、积分有效期或 Creem 商品配置。
- 不在本次迁移普通用户 JWT 到 httpOnly cookie；该工作属于独立的会话安全 SPEC。

## 方案比较

| 方案 | 描述 | 结论 |
|---|---|---|
| A. 继续 URL 传 email | 回跳即能无状态 claim，但泄露 PII | 不采用 |
| B. `sessionStorage` 保存归属邮箱 | 回跳 URL 无 PII；同一浏览器同一会话可自动到账 | **采用** |
| C. 回跳 URL 传短期 claim token | 跨会话能力更好，但要新增 token 表、过期/撤销模型和泄露防护 | 当前不需要 |

方案 B 符合已确认的“无需恢复输入错误/丢失会话”规则，改动最小，也不降低代付能力。

## 设计

### 1. 归属规则与文案

所有 Checkout 入口在提交前必须显示以下语义等价文案：

> Credits will be permanently linked to the email entered above. Please check it carefully before paying.

不提及“赠送”，不暗示用户可以在付款后修改归属邮箱。付款使用的 card/billing email 不改变平台积分归属；唯一归属依据是 TokValue Checkout 请求中的 `email`。

### 2. 创建 Checkout

以下两个服务端入口统一将 Creem `success_url` 改为：

```text
${APP_URL}/?paid=success
```

入口：

- `POST /api/checkout`（Guest Checkout）
- `POST /api/auth/verify-code`（旧验证码购买路径）

Creem customer 与 metadata 仍保留 email，供支付平台、webhook、pending purchase 和积分发放使用；它们不暴露在浏览器 URL 中。

### 3. 客户端临时购买上下文

新增单一用途的 sessionStorage 项，例如 `tokvalue_pending_checkout_v1`：

```ts
type PendingCheckout = {
  email: string
  createdAt: number
}
```

写入规则：

- 所有导致 `window.location.href = checkoutUrl` 的分支，在跳转前调用 `setPendingCheckout(email)`。
- email 进行 lower-case + trim 标准化。
- 仅在用户发起 Checkout 后写入，不从 URL、支付页面或其它来源恢复。

读取和清理规则：

- 支付回跳仅通过 `getPendingCheckout()` 取得 email。
- claim 成功后清理该项。
- 用户主动退出账户时清理该项。
- 过期项（建议 24 小时）读取时删除并视为不存在。

现有 `tokvalue_active_email` 可继续用于已登录/已认领用户 UI，但不得作为支付回跳的兜底来源。这样可避免旧浏览器中的其它账户邮箱被误用于 claim。

### 4. 成功回跳状态机

首页 `HomePageClient` 与评估页 `EvaluatePage` 复用同一个客户端 hook/函数，避免两个页面的处理分叉。

状态如下：

| 状态 | 条件 | UI | 动作 |
|---|---|---|---|
| `idle` | 无 `paid=success` | 无 | 无 |
| `confirming` | 有 `paid=success` 且 pending email 有效 | “Confirming your payment…” | 调用 claim，短暂重试 |
| `credited` | claim 返回 `claimed: true` | “Credits added to m•••@example.com” | 更新余额、清理 pending 和 URL 参数 |
| `pending` | 订单暂未显示 paid | “Payment received; credits are still being confirmed.” | 每 3 秒重试，最多 30 秒 |
| `unavailable` | 无 pending email 或超过重试时间 | “Credits are linked to the email entered at checkout. Return using that email after confirmation.” | 不泄露或猜测邮箱；提供刷新按钮 |
| `failed` | 网络/服务异常 | “We could not confirm credits yet. Refresh to try again.” | 保留 pending，允许用户刷新重试 |

具体约束：

- `PAYMENT_NOT_COMPLETED` 在 30 秒窗口内视为 `pending`，不是最终错误。
- `claimed: false` 且无支付完成证据时不显示“付款成功”。
- 每次尝试都用同一个 pending email 调用现有 `/api/credits/claim`；服务端已有 IP 限流，客户端最多进行 10 次尝试，避免触发限流。
- 前端一检测到 `paid=success` 就用 `history.replaceState` 删除该参数，避免刷新和分享重复触发；处理状态存在 React state 中。
- webhook 与 claim 任一方先完成都应使客户端最终读取到正确余额；不得依赖哪一方先到达。

### 5. 无会话/丢失 sessionStorage

用户在支付页关闭浏览器、换设备，或 sessionStorage 被清理后回跳时，前端没有可信 email 可以 claim。

该场景按产品规则处理：

- 不要求用户填写新邮箱，不尝试猜测、枚举或迁移归属。
- 不显示“已到账”或“支付失败”这类未经验证的结论。
- 显示固定说明：积分按付款时输入的邮箱归属；请使用该邮箱重新访问 TokValue 并完成邮箱验证后查看余额。
- 不增加支持入口或恢复承诺。

注意：此说明仅描述产品行为，不改变 webhook 正常发放积分的逻辑。

### 6. 代码边界

| 单元 | 责任 |
|---|---|
| `lib/credits-client.ts` | Pending checkout sessionStorage 的读、写、过期清理；现有 claim 请求保持单一实现 |
| `components/usePaymentReturn.ts`（新建） | `paid=success` 检测、确认状态机、有限重试、URL 清理、余额结果回调 |
| `components/HomePageClient.tsx` | 使用 hook 展示首页支付确认/到账反馈 |
| `components/EvaluatePage.tsx` | 使用同一 hook 展示评估页支付确认/到账反馈 |
| `components/PaidWall.tsx` | Checkout 前写入 pending context；展示邮箱归属提示 |
| `components/VerifyEmailModal.tsx` | 旧验证码购买路径跳转前写入 pending context |
| `app/api/checkout/route.ts` | 移除 success URL 的 email 参数 |
| `app/api/auth/verify-code/route.ts` | 移除 success URL 的 email 参数 |

## 测试策略

### 单元测试

- `setPendingCheckout` 标准化 email，并只存最小字段。
- 过期 pending context 被读取时清除。
- claim 成功清除 pending context；失败和 pending 状态保留。
- `usePaymentReturn` 对 `claimed`、`PAYMENT_NOT_COMPLETED`、无 pending、网络异常和重试上限分别进入预期状态。

### API/集成测试

- `/api/checkout` 返回给 Creem 的 `success_url` 不含 `email=`。
- `/api/auth/verify-code` 返回给 Creem 的 `success_url` 不含 `email=`。
- 相同 checkout 的 webhook 与 claim 并发执行，只产生一笔 `credit_grants` 记录。
- 重复执行 claim 不会增加积分。
- 未支付订单不会发放积分。

### 手工验收

1. 输入 `recipient@example.com` 发起 Guest Checkout，确认支付 URL 与回跳 URL 不包含邮箱。
2. 支付成功回跳首页，显示确认中，最终显示已归属至脱敏邮箱和正确余额。
3. 支付成功回跳评估页，得到相同行为。
4. 在 webhook 延迟时，页面显示确认中并在额度到账后更新。
5. 清除 sessionStorage 后模拟回跳，显示固定说明，不请求 claim、不显示其它邮箱。
6. 用付款人 A 为邮箱 B 购买，确认额度只进入 B；该行为正常，无改绑入口。

## 验收标准

1. 所有 Creem success URL 都不含邮箱或其它 PII query 参数。
2. 正常同浏览器支付回跳能自动完成 claim，并在 30 秒内给出明确状态。
3. 付款人与邮箱归属用户不同仍可正常购买。
4. checkout email 输错时系统不会把积分转移到其它邮箱，也不提供迁移流程。
5. webhook、claim 重试和双路径并发不造成重复积分。
6. 首页与评估页使用同一支付回跳逻辑，文案和状态含义一致。
7. `npm test`、新增测试与 `npm run build` 均通过。
