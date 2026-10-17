# Marketplace（账号交易撮合模块）设计 Spec

- 日期：2026-10-17
- 状态：已与用户逐节确认
- 范围：新增账号交易模块——用户完成付费评估后可登记挂牌自己的账号，留下联系方式；其他用户付费解锁联系方式，双方自行线下交易。

## 1. 核心决策（用户已确认）

| 决策点 | 结论 |
|---|---|
| 平台角色 | **纯信息撮合**：平台只展示估值报告摘要 + 联系方式，不经手货款与账号交割 |
| 登记门槛 | **必须有付费完整报告**才能登记（`evaluation_ownership` 中 `upgraded_at IS NOT NULL`） |
| 解锁定价 | **平台统一定价 $3.99/次**（与 pack1 首单评估价一致），按次直付，不建解锁余额 |
| 审核机制 | **自动上架 + 举报/下架兜底**（report_count ≥ 3 自动 removed） |
| 联系方式 | **Email + 一个社交渠道**（Discord / WhatsApp / Telegram 三选一，可只留 Email） |
| 估值数据 | **快照制**：登记时把估值数据快照进 listing，不随后续评估变化；预留 `refreshed_at` 二期做手动刷新 |

## 2. 计费模型

- 解锁**不走 credits 池**：credits 语义保持纯粹的"评估次数"（定价文案约束），解锁是独立商品。
- 新增 Creem 商品 `unlock1`（$3.99），环境变量 `CREEM_PRODUCT_ID_UNLOCK1`。
- `/api/marketplace/unlock` 创建 Checkout：metadata 携带 `listingId + email + type=unlock`，并写 `pending_purchases`（复用现有 guest 认领机制）。
- webhook `checkout.completed` 新增分支：Creem 反查 productId 命中 unlock1 且金额相符 → 写 `marketplace_unlocks`（`INSERT ... ON CONFLICT DO NOTHING` 幂等），**不发 credits**。
- 解锁永久有效：同一 email 再访问该 listing 直接显示联系方式。
- 价格由服务端常量决定，不信任客户端传价。

## 3. 数据模型（3 张新表，幂等迁移）

沿用项目惯例：`CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`，模块加载时惰性建表。

### 3.1 marketplace_listings

```sql
CREATE TABLE IF NOT EXISTS marketplace_listings (
  id TEXT PRIMARY KEY,                 -- nanoid
  username TEXT NOT NULL,              -- 小写 TikTok username
  seller_email TEXT NOT NULL,          -- 与 evaluation_ownership 对应
  asking_price_usd INTEGER NOT NULL,   -- 卖家自定要价（公开显示）
  description TEXT,                    -- ≤500 字符，公开显示
  contact_email TEXT NOT NULL,         -- 解锁后可见
  social_type TEXT,                    -- 'discord' | 'whatsapp' | 'telegram' | NULL
  social_handle TEXT,                  -- 解锁后可见
  -- 估值快照（登记时从 evaluations 行复制，不可变）
  snapshot_tier TEXT,
  snapshot_valuation_low INTEGER,
  snapshot_valuation_high INTEGER,
  snapshot_valuation_usd INTEGER,
  snapshot_followers INTEGER,
  snapshot_engagement_rate REAL,
  snapshot_evaluated_at TIMESTAMPTZ,
  refreshed_at TIMESTAMPTZ,            -- 预留：二期手动刷新快照
  status TEXT NOT NULL DEFAULT 'active',  -- active | sold | withdrawn | removed
  report_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- 同一账号只允许一个在售 listing
CREATE UNIQUE INDEX IF NOT EXISTS idx_listings_active_username
  ON marketplace_listings(username) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_listings_status_created
  ON marketplace_listings(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listings_seller
  ON marketplace_listings(seller_email);
```

### 3.2 marketplace_unlocks

```sql
CREATE TABLE IF NOT EXISTS marketplace_unlocks (
  listing_id TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (listing_id, buyer_email)
);
```

### 3.3 marketplace_reports

```sql
CREATE TABLE IF NOT EXISTS marketplace_reports (
  id SERIAL PRIMARY KEY,
  listing_id TEXT NOT NULL,
  reporter_email TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (listing_id, reporter_email)
);
```

### 3.4 登记资格校验（硬约束）

`evaluation_ownership` 中存在 `(seller_email, username)` 且 `upgraded_at IS NOT NULL`，否则 API 返回 403（错误码 `LISTING_REQUIRES_PAID_REPORT`），前端弹 PaidWall（`mode: 'evaluate'`）引导付费。

## 4. API 路由

全部 `export const dynamic = 'force-dynamic'`；鉴权沿用 JWT Bearer（`verifySessionToken` / `getBearerToken`），前端发送请求前 `getSessionToken()` 预检，无 token 直接弹付费/验证墙。

| 路由 | 方法 | 鉴权 | 说明 |
|---|---|---|---|
| `/api/marketplace/eligibility?username=` | GET | JWT | 当前 email 对该 username 是否可登记（ownership + upgraded） |
| `/api/marketplace/listings` | POST | JWT | 登记挂牌：资格校验 → 参数校验（要价 1–10,000,000、描述 ≤500、Email 格式、social 类型枚举）→ 从 evaluations 读快照 → 写入；限流：每 email ≤5 个 active、每 username 1 个 active（唯一索引兜底）、IP 限流复用 `ip_rate_limits` |
| `/api/marketplace/listings` | GET | 公开 | 分页列表（page/pageSize，默认 24），排序 latest / valuation_desc / valuation_asc / followers_desc；仅返回公开字段，**响应体不含任何 contact 字段** |
| `/api/marketplace/listings/[id]` | GET | 可选 JWT | 详情：公开字段 + `unlocked: boolean`；仅当请求者 email 在 `marketplace_unlocks` 中才附带联系方式 |
| `/api/marketplace/listings/[id]` | PATCH | JWT（仅卖家） | 改要价/描述；`action: withdraw`（→ withdrawn）；`action: mark_sold`（→ sold） |
| `/api/marketplace/unlock` | POST | JWT 或 guest email | 已解锁直接返回 `{alreadyUnlocked:true}`；否则创建 Creem Checkout（$3.99 服务端常量）+ 写 pending_purchases |
| `/api/marketplace/report` | POST | JWT | 举报；`(listing_id, reporter_email)` 唯一；`report_count ≥ 3` → `status='removed'` |
| `/api/stripe/webhook` | POST | 签名 | 新增 unlock1 分支：反查确认 → 幂等写 unlocks，不发 credits |

## 5. 页面与流程

### 5.1 卖家侧

- 完整报告页顶部新增 **"List This Account for Sale"** 按钮（仅 eligibility 通过的用户可见）。
- 落地页 `/sell?username=xxx`：展示估值快照卡（等级徽章 + 估值区间，颜色一律读 `TIER_COLORS`）→ 表单：要价 USD、描述、Email、社交渠道下拉 + ID → 提交即上架 → 跳转 My Listings。
- **My Listings**（用户菜单内）：管理在售 / 已售 / 已下架 listing。

### 5.2 买家侧

- `/marketplace` 列表页：卡片 = username、等级徽章、粉丝数、估值区间、要价、"Valued as of {date}"。
- `/marketplace/[id]` 详情页：完整公开信息 + 联系方式区域打码 → **"Unlock Contact — $3.99"** 按钮 → 复用现有支付流（email 验证 / guest checkout → Creem → 回跳 claim）→ 解锁成功后联系方式展开并自动平滑滚动到该区域。
- 已解锁用户再次访问直接显示；listing 下架后已购解锁仍可在 "My Unlocks" 查看联系方式（解锁是已购商品）。

### 5.3 导航

- 顶部 nav 增加 "Marketplace" 入口。
- 文案全部英文（目标用户为英文创作者），新增 i18n 字典条目。

### 5.4 免责声明

详情页固定展示："TokValue does not facilitate transactions. Verify ownership and transfer the account at your own risk."

## 6. 风控与边界情况

1. **联系方式泄露防护**：contact 字段只在服务端已解锁分支出现在响应中，不靠前端隐藏；SEO metadata 不含 contact。
2. **防跳单/防篡改**：解锁价格服务端常量；webhook 以 Creem 反查 productId + amount 为准，金额不符拒绝发放。
3. **举报兜底**：≥3 独立举报自动 removed；卖家可申诉，后台改回 active。
4. **快照不受重评影响**：账号后续被任何人重新评估，listing 展示不变。
5. **webhook 延迟**：回跳页轮询 claim（复用 pending_purchases 机制），认领时 Creem 反查确认。
6. **未付费点登记**：403 → PaidWall 引导，天然拉动一次付费转化。

## 7. 测试策略

- **单元**：资格三态（upgraded / 仅 free / 无记录）、快照字段提取、report_count 阈值、解锁幂等（重复 webhook）。
- **集成**：登记 → 列表 → 详情 → unlock → webhook → 联系方式可见全链路；guest claim 链路。
- **安全回归**：未登录/未解锁响应体不含 contact_email；篡改价格被拒；非卖家 PATCH 403。
- **手动**：`DEV_SKIP_PAYMENT=true` 本地全流程 + Creem test mode 真实 $3.99 一次。

## 8. 明确不做（YAGNI）

- 平台担保交易 / 资金托管（escrow）
- 解锁次数余额包（多买优惠）
- 站内 IM / 买卖家直接沟通
- 卖家自由定价解锁费
- listing 手动刷新估值（二期，字段已预留）
- 人工预审
