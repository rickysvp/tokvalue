# 普通用户会话安全

**日期**: 2026-08-18  
**状态**: 已确认，待实现  
**范围**: 普通用户认证会话、CSRF、防止 token 被 XSS 窃取、注销与客户端调用方式

---

## 背景

普通用户当前使用 7 天 HS256 JWT。它通过验证码验证或 Guest claim 的 JSON 响应下发，再由浏览器写入 localStorage，随后作为 `Authorization: Bearer` 发送到 API。

这使任意能够在页面执行 JavaScript 的 XSS 或第三方脚本都有机会读取并外传会话 token。该 token 可读取余额、消费积分、解锁报告、创建分享链接、访问历史和执行推荐提现相关操作。

管理后台已经使用 httpOnly Cookie，普通用户需要采用同一安全边界。此 SPEC 不改变邮箱验证、Guest Checkout 或积分归属规则。

## 目标

1. 普通用户的会话 token 永不进入 localStorage、sessionStorage、URL 或 JSON 响应体。
2. 所有需要普通用户身份的 API 从 httpOnly Cookie 读取会话。
3. 通过 Origin/Fetch Metadata 校验保护携带会话 Cookie 的写操作，降低 CSRF 风险。
4. 保持 7 天会话有效期、现有邮箱验证流程和后端授权语义。
5. 登出后浏览器和服务端都不再使用该会话。

## 非目标

- 不实现 refresh token、设备管理、token 撤销列表或多设备会话页面。
- 不改为第三方身份服务。
- 不变更 Admin token 及 `/api/tiktokmaster/*` 的已有 Cookie 实现。
- 不修复所有潜在 XSS 来源；本方案只确保发生 XSS 时不能直接读取普通用户会话凭证。
- 不变更 Guest Checkout 的“输入邮箱即积分归属邮箱”规则。

## 方案比较

| 方案 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| 保留 localStorage Bearer | 前端改动最小 | XSS 可直接窃取长期凭证 | 不采用 |
| httpOnly Cookie + Origin 校验 | token 对 JS 不可见；改动与 Admin 模式一致 | 需要调整所有 authenticated fetch | **采用** |
| 服务端数据库 session + opaque ID | 可即时撤销、设备管理更完整 | 需新增 session 表和生命周期管理 | 暂不需要 |

## 设计

### 1. Cookie 会话模型

新增普通用户 Cookie 名称：`tokvalue_session`。

Cookie 参数：

```ts
{
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: 7 * 24 * 60 * 60,
}
```

JWT 的现有内容、签名算法和 7 天过期时间保持不变。Cookie 只是传输与存储载体；`JWT_SECRET` 仍必须在生产环境配置。

`lib/auth.ts` 新增并统一导出：

- `USER_SESSION_COOKIE`
- `userSessionCookieOptions(maxAge)`
- `getSessionTokenFromRequest(req)`：只读取 Cookie
- `getAuthenticatedUser(req)`：读取并验证 Cookie，返回 `AuthPayload | null`
- `setUserSession(response, email)`：签发 JWT 并设定 Cookie
- `clearUserSession(response)`：覆盖过期 Cookie

所有业务路由不再自己解析 `Authorization` header，也不再向客户端返回 JWT 字符串。

### 2. 签发与注销

以下成功路径签发 Cookie，而不是在 JSON 中返回 `token`：

| 路径 | 现状 | 新行为 |
|---|---|---|
| `/api/auth/verify-code`，返回用户验证 | JSON `token` | `Set-Cookie` + `{ ok, email, returning }` |
| `/api/auth/verify-code`，购买前验证 | JSON `token` | `Set-Cookie` + 原业务字段，不带 token |
| `/api/credits/claim`，Guest 成功 | JSON `token` | `Set-Cookie` + 原 balance 数据，不带 token |

新增 `POST /api/auth/logout`：

- 运行 CSRF 校验。
- 通过 `Set-Cookie` 设置 `tokvalue_session` 为空且 `maxAge: 0`。
- 返回 `{ ok: true }`。

纯客户端登出不再仅删除 localStorage，而是调用该端点；无论请求成功或失败，客户端都清除本地 UI email、pending UI state 和旧 token 键。

### 3. 认证 API 的统一迁移

以下需要用户身份的路由改为 `getAuthenticatedUser(req)`：

- `/api/credits/balance`
- `/api/credits/consume`
- `/api/credits/claim` 的已登录分支
- `/api/history`
- `/api/evaluate` 的付费分支
- `/api/evaluate/upgrade`
- `/api/checkout` 的已登录分支
- `/api/share`
- `/api/referral`
- `/api/referral/withdraw`

Guest Checkout 和 Guest claim 保留无 Cookie 分支。路由只在 Cookie 存在且有效时将请求视为已登录；无效 Cookie 与无 Cookie 的行为必须按路由明确处理，不能静默把无效 Cookie 误当成已认证。

`middleware.ts` 不再充当 Bearer header 预检查。认证由 route handler 的统一 helper 完成；middleware 仅保留确有必要的通用安全 headers/重定向职责，或删除无效的保护列表。

### 4. CSRF 策略

Cookie 自动附带请求，因此所有“已认证且会修改服务端状态”的写操作必须在业务逻辑前执行 `assertSameOrigin(req)`。

规则：

1. 对 `POST`、`PUT`、`PATCH`、`DELETE` 的 authenticated 分支校验 `Origin`。
2. `Origin` 必须等于请求的 `req.nextUrl.origin`；生产环境只接受 HTTPS 的配置化正式域名与需要支持的 preview 域名。
3. 无 `Origin` 时仅在 `Sec-Fetch-Site` 为 `same-origin` 或 `same-site` 时允许；其余拒绝 403。
4. Webhook 不使用用户 Cookie，明确豁免 CSRF，继续用 Creem HMAC 校验。
5. 本来就允许匿名调用的接口（发送验证码、Guest Checkout、Guest claim、公开统计/搜索）不依赖 Cookie 身份，不使用本 CSRF guard；它们继续依赖输入校验与 IP 限流。

新增 `lib/csrf.ts`，仅负责该检查与标准 403 响应。不要将 CSRF 逻辑散落到各路由。

### 5. 客户端调用模型

`lib/credits-client.ts` 改为 UI state 与 API helper，不再包含：

- `getSessionToken`
- `setSessionToken`
- `setPendingToken`
- `promotePendingToken`
- `Authorization` header 生成逻辑

同源 `fetch` 默认会携带 Cookie；调用方不传 Bearer header。需要 JSON body 的调用统一增加 `credentials: 'same-origin'`，使意图显式。

本地可保留 `tokvalue_active_email` 仅作非敏感的 UI 显示和支付归属上下文，不得用它判断“已登录”。登录态的唯一来源为成功调用 `/api/credits/balance` 或需要身份的 API。

所有页面和组件（首页、评估页、历史、推荐、分享、付费墙、顶部导航）改为：

- 初始化时请求 `/api/credits/balance`；200 表示已登录，401 表示未登录。
- 认证成功后直接刷新余额，不读取 token。
- 收到 401 时清空 UI 状态并提示用户重新验证邮箱。

### 6. 迁移策略

采用安全优先的硬切换：上线时不接受旧 Bearer token，也不迁移 localStorage token。已有用户在首次访问后需重新完成邮箱验证码验证。

原因：保留 Bearer fallback 会继续为被 XSS 窃取的旧 token 保留可用窗口，削弱此次迁移的目的。用户验证成本低于保留 7 天可窃取凭证的风险。

客户端发布后启动时只删除旧键 `tokvalue_session_token` 和 `tokvalue_pending_token`，不读取、不上报其内容。该清理必须在所有页面共享入口或 helper 中只执行一次。

### 7. 错误处理与可观测性

- Cookie 签发失败：认证/claim 返回 500，绝不声称用户已登录。
- Cookie 无效或过期：受保护路由统一 401 `{ code: 'UNAUTHORIZED' }`，客户端提示重新验证邮箱。
- CSRF 失败：403 `{ code: 'CSRF_REJECTED' }`，不得泄露会话或用户信息。
- 不在日志中记录 JWT、Cookie 内容或 Authorization header。
- 登录/注销/CSRF 拒绝仅记录脱敏 email 或事件计数；保留现有 IP hash 规范。

## 文件边界

| 文件 | 改动职责 |
|---|---|
| `lib/auth.ts` | 用户 Cookie helper、统一认证读取、删除 Bearer 依赖 |
| `lib/csrf.ts`（新建） | 同源/Fetch Metadata 写请求校验 |
| `lib/credits-client.ts` | 删除 token 存储与 Bearer header；保留非敏感 UI/API helper |
| `app/api/auth/verify-code/route.ts` | Set-Cookie，不返回 token |
| `app/api/credits/claim/route.ts` | Guest 成功时 Set-Cookie，不返回 token |
| `app/api/auth/logout/route.ts`（新建） | 清除用户 session Cookie |
| `app/api/{credits,history,evaluate,checkout,share,referral}/...` | 使用统一认证 helper；对 authenticated 写请求加入 CSRF guard |
| `middleware.ts` | 移除 Bearer 伪保护 |
| `components/*`、`app/history/page.tsx`、`app/referral/page.tsx` | 删除 token 读取/传递；401 时更新 UI；登出调用 API |

## 测试策略

### 单元测试

- 生产环境 Cookie 参数包含 `httpOnly`、`secure`、`sameSite=lax`、7 天 max-age。
- `getAuthenticatedUser` 接受有效 Cookie，拒绝缺失、篡改和过期 JWT。
- CSRF guard 接受同源 Origin，拒绝不同 Origin，正确处理缺失 Origin + Fetch Metadata。
- 旧 Bearer header 即使内容有效也不能建立用户身份。

### 路由测试

- 验证码成功和 Guest claim 成功均返回 `Set-Cookie`，响应 JSON 不含 `token`。
- Cookie 身份可访问 balance/history/share 等受保护 API。
- 同源 authenticated POST 可成功；跨源 authenticated POST 返回 403 且不消费积分、不创建分享、不提现。
- `/api/auth/logout` 清除 Cookie；后续 balance 返回 401。
- Webhook 不被 CSRF guard 阻断，仍仅靠签名通过。

### 浏览器验收

1. 邮箱验证后，DevTools Application 的 Local Storage 中没有 session token；Cookie 为 HttpOnly，前端 JavaScript 不可读取。
2. 刷新页面仍保持登录态和余额。
3. 退出后刷新页面保持未登录。
4. 从另一个站点构造带 Cookie 的 POST 请求，服务端返回 403，积分/提现等状态不改变。
5. 现有 localStorage token 用户首次上线后会被要求重新验证邮箱，之后所有正常评估、购买、分享、历史和推荐流程可用。

## 验收标准

1. 任何用户 JWT 不出现在 localStorage、sessionStorage、URL、API JSON 或日志中。
2. 所有普通用户受保护 API 均从 httpOnly Cookie 认证，且不接受 Bearer fallback。
3. Cookie 认证的写操作具备统一 CSRF 检查，webhook 和匿名受限流接口不受影响。
4. 验证码登录、Guest claim、刷新、登出与 401 恢复流程完整可用。
5. 正常用户流程不会因 Cookie 迁移而降低支付、评估、分享、历史或推荐功能。
6. `npm test`、新增 API/组件测试与 `npm run build` 均通过。
