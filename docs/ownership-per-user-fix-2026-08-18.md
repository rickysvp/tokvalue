# 按用户收费（ownership 单一事实源）改造完成 — 2026-08-18

## 目标
修复 PMF 三问题（归属链断裂 / 免费 AI 白嫖 / 付费缓存跨用户共享），落地「按用户收费、不共享」方案。

## 核心设计
新增 `evaluation_ownership` 表（email+username 联合主键）作为「谁付费解锁了哪个账号」的单一事实源。
`evaluations` 表退回「账号级报告快照」（username 主键不变），`evaluated_by` 列保留仅为向后兼容。

## 改动清单（5 文件，+163/-33）

### lib/db.ts
- 新增 ownership 表迁移（CREATE TABLE IF NOT EXISTS + username 索引）
- 新增函数：`upsertOwnership` / `hasOwnership(paidOnly)` / `listOwnedUsernames` / `isEvaluationPaid` / `normEmail` / `normUsername`
- `saveEvaluation` ON CONFLICT 补 `evaluated_by` 列（免费评估现在也传 evaluatedBy）
- `hasOwnership` 支持 `paidOnly` 查询（付费缓存命中只认付费所有权）

### app/api/evaluate/route.ts
- 免费评估：删 `enrichWithAI` 调用（估值/评分/维度/风险/收入全为算法产出，零 AI 依赖）
- 免费落库：传 `evaluatedBy` + `upsertOwnership`；且 `isEvaluationPaid` 为 true 时不覆盖已付费报告
- 付费缓存命中：加 `hasOwnership(userEmail, normalized, { paidOnly: true })` 校验（跨用户不共享）
- 付费评估落库后 `upsertOwnership(..., { isFree: false })`

### app/api/evaluate/upgrade/route.ts
- 补跑 `enrichWithAI`（付费解锁的真实价值）+ `upsertOwnership({ isFree: false })`
- import 去掉未用的 `upgradeEvaluation`

### app/api/history/route.ts
- 从 `WHERE evaluated_by = email` 改为 `listOwnedUsernames` + `WHERE username = ANY(...)`

### lib/share-store.ts
- `checkShareOwnership` 从查 `evaluations.evaluated_by` 改为查 `evaluation_ownership`（is_free=true → forbidden）

## 存量数据回填
新建 `tools/backfill_ownership.ts`（--dry-run 支持，凭证从 .env.local 读取）。
执行结果：27 条归属关系回填（rickysvp@gmail.com 26 条 + 652581@qq.com 1 条，全部 is_free=false）。
验证：ownership 表 27 行正确。

## 验证
- `tsc --noEmit` 零错误
- `npm run build` 成功（修复了 prefer-const 与 unused-import 两个 lint 错误）
- Vitest 59/59 通过

## 未推送状态
改动已提交到工作区但**未 commit / 未 push**。需用户确认后提交。
