# 推荐佣金方案（Referral Commission）设计

日期：2026-08-18
状态：决策已拍板（C/60天/禁自购/随机码/USDC）

## 目标

用户 A 通过专属链接推荐用户 B 购买积分套餐，A 获得 B 每笔成交金额的 40% 佣金，
**前提是 B 不退款**（退款保护期内发生退款则佣金不发放/撤回）。

佣金形式：**现金记账，仅支持 USDC 提现**。

---

## 决策定案（已拍板）

| 决策 | 结论 |
|---|---|
| 1. 佣金形式 | **C：现金记账，仅支持 USDC 提现**（提现系统二期做，先记账积累） |
| 2. 退款保护期 | **60 天**（Creem 官方退款窗口；可后续提到 90 天覆盖 chargeback） |
| 3. 自购 | **禁止**（referrer email === buyer email 时跳过佣金） |
| 4. 推荐码形态 | **系统随机生成**（email 绑定） |
| 5. USDC 提现 | 起提门槛 **$50 首次**，之后每次 **≥$100** |

## 一、现状梳理（已核实）

### 支付链路（两通道）
1. `POST /api/checkout`（app/api/checkout/route.ts）：创建 Creem checkout，`success_url = /?paid=success&email=`，`storePendingPurchase` 存 pending（30 分钟过期），埋 `checkout_start`
2. **到账双路径**：
   - `POST /api/stripe/webhook`（实为 Creem webhook）：`checkout.completed` 事件 → 反查 Creem 确认 `order.status==='paid'` → `grantCredits`（幂等键 checkoutId）→ 埋 `checkout_success`
   - `POST /api/credits/claim`：guest 回跳认领，`claimPendingPurchase` 内部走 `grantCredits` 同一幂等键

### 退款链路（已实现）
- `refund.created` 事件 → `recordRefund`（幂等，refund_id 唯一索引）→ `adminDeductCredits` 扣回积分
- 退款金额→积分折算：全额退款精确匹配包价，部分退款按最高单价包保守折算

### 已有可复用设施
- **utm 采集链路**（lib/utm.ts + sessionStorage `tokvalue_utm` + 全链路透传到 Creem metadata + webhook 回读）：ref 参数可直接复用同一套采集/透传/回读机制
- **积分幂等发放**（credit_grants 表，payment_id 主键抢锁）
- **积分余额**（credit_balances 表，email 主键，purchases JSONB）

### 无残留
全库 grep 无 referral/invite/commission/affiliate 相关业务代码（仅博客文章里的营销文案）。

---

## 二、核心决策点（已拍板）

### 决策 1：佣金结算形式（已定：C 现金记账 + USDC 提现）
- 佣金以**美元现金记账**（不折算积分），存 referral_commissions 表
- 达到提现门槛后，用户发起 **USDC（BSC/BEP-20）** 提现
- 提现系统二期做，一期先完成记账闭环 + 余额展示

### 决策 2：退款保护期（已确认 60 天）
Creem 官方文档（docs.creem.io/merchant-of-record/finance/refunds-and-chargebacks）明确：
- Creem 保留在**购买后 60 天内**退款的权利（即使你设 no-refund 政策）
- 客户可**随时**发起 chargeback（卡组织争议窗口通常 120 天内）

**结论：保护期定为 60 天**（覆盖 Creem 退款窗口）。若要覆盖大部分 chargeback 争议期可提到 90 天。
- 60 天：覆盖 Creem 官方退款窗口（推荐）
- 90 天：更保守，覆盖大部分 chargeback 争议期

结算：佣金记录写入时 status=pending，60 天后（或 90 天）无退款/拒付自动 settled，才可提现。

### 决策 3：自购（已定：禁止）
referrer email === buyer email 时跳过佣金（不写 commission 记录或标记 voided）。

### 决策 4：推荐码形态（已定：系统随机生成）
短随机串（如 `A8F3KQ`），email 绑定，唯一。

### 决策 5：USDC 提现门槛（已定）
- 首次提现门槛：**$50**
- 之后每次最低：**$100**
- 链：BSC/BEP-20（`0x` + 40 hex 地址校验，拒绝 Solana/其他链）

---

## 三、方案架构

### 追踪机制
复用 utm 采集链路，新增 `ref` 参数：
- 推荐链接：`https://tokvalue.ai/?ref=<A的推荐码>`
- 前端首次加载采集 `ref` → sessionStorage（同 `tokvalue_utm`，7 天 TTL）
- 结账 `POST /api/checkout` body 带 `refCode` → `storePendingPurchase` 存 ref → Creem metadata 加 ref → webhook/claim 回读

### 数据模型（新表）
```sql
CREATE TABLE referral_codes (
  code TEXT PRIMARY KEY,          -- 推荐码（短随机串，如 A8F3KQ）
  email TEXT NOT NULL,            -- 推荐人 email
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE referral_commissions (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL,             -- 推荐码
  referrer_email TEXT NOT NULL,   -- 推荐人
  buyer_email TEXT NOT NULL,      -- 买家
  payment_id TEXT UNIQUE NOT NULL,-- Creem checkout_id（幂等键）
  package_id TEXT NOT NULL,
  amount NUMERIC NOT NULL,        -- 成交金额 USD
  commission NUMERIC NOT NULL,    -- 佣金 = amount * 0.4
  status TEXT NOT NULL DEFAULT 'pending',  -- pending / settled / voided
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 佣金生命周期
1. **pending**：B 支付成功（webhook/claim 确认 `order.status==='paid'`）时写入，status=pending，等 60 天保护期
2. **settled**：保护期届满无退款，结算为可提现余额（现金记账，USD）
3. **voided**：保护期内 B 退款/拒付，佣金作废

### 佣金发放位置（关键）
在 **webhook `checkout.completed`** 的 `grantCredits` 成功后写入 pending 佣金（有 checkoutId 幂等）。理由：
- webhook 是唯一能拿到「退款事件」的入口（`refund.created` 也走 webhook）
- 幂等键 = checkout_id，与积分发放一致，天然防重
- **自购拦截**：写入前校验 `referrer_email === buyer_email`，相等则跳过（不写记录）

### 退款撤销位置
在 **webhook `refund.created`** 处理中，根据 refund 关联的 checkout 找到对应 commission，置 voided。

---

## 四、实施批次（建议）

**P0（核心闭环，先做）**：
1. `ref` 参数采集（复用 utm 机制）
2. 推荐码生成 + 归属（referral_codes 表，随机短码绑定 email）
3. checkout 透传 refCode → pending → Creem metadata → webhook 回读
4. 支付成功写 referral_commissions（pending 状态，佣金 = amount × 0.4，禁自购）
5. 退款保护期（60 天）到期结算 settled（cron 惰性结算）

**P1（激励闭环）**：
6. 用户端展示推荐链接 + 佣金余额（settled 部分）
7. USDC 提现（首次 $50 / 后续 $100 门槛，BSC 地址校验）——二期

**P2（防刷）**：
8. 自购拦截（已定）、异常刷量风控、佣金上限、chargeback 风险账号标记

---

## 五、USDC 提现设计（二期）

- 提现表：`referral_payouts`（email / amount / usdc_address / status / tx_hash / created_at）
- 状态机：`requested` → `processing` → `paid`（附 tx_hash）/ `rejected`
- 地址校验：`/^0x[a-fA-F0-9]{40}$/`（BSC/BEP-20），拒绝 Solana/其他链
- 门槛：首次 $50，之后每次 ≥$100
- 佣金来源：仅 settled 状态可提现；pending 中的佣金不可提
- 风控：退款/拒付回溯时已 settled 佣金需从后续佣金扣回或人工追索（记录负余额）

## 六、实施结论

5 项决策已全部拍板：C（现金记账+USDC 提现）、60 天保护期、禁自购、随机码、USDC（首次 $50 / 后续 $100）。
P0 核心闭环先行，USDC 提现走二期。
