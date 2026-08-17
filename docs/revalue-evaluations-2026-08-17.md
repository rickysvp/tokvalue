# 存量评估结果重算 + 凭证清理

## 日期
2026-08-17

## 背景
估值算法审计（docs/valuation-algorithm-audit-2026-08-17.md）发现 6 处框架性虚高问题，已在 commit f4a1165 落地修复。用户要求把数据库里已有的评估结果也用新公式重算，消除历史虚高数据。

## 完成事项

### 1. 存量评估重算（33 条记录）
- 新建 `tools/revalue_evaluations.ts`：遍历 evaluations 表，从 posts 快照重建 RawProfile，用新公式 `scoreProfile()` 重算，全量写回估值相关字段（score/tier/dimensions/metrics/incomeEstimate/businessValue 等），保留 computed_at/evaluated_by/is_free 等元数据不变。
- 支持 `--dry-run` 预览不写库。

### 2. 第二轮修复：播放量改用中位数抗爆款（本日二次重算）
用户报告 @w7ch.0（14.4万粉）估值虚高至 $108 万。诊断发现是**统计错误**——播放分布高度偏态（中位数 11.5万，但有 3 个千万级历史爆款把均值拉到 151万），模型对偏态分布用均值估「稳定触达」，被历史爆款污染。

三处修复：
1. **lib/scoring/metrics.ts — calcEffectivePlays**：核心播放量从「加权均值 + 历史隐含播放」改为以**成熟帖加权中位数**为主，历史隐含播放 clamp 到中位数 [0.5x, 2x] 区间，防止过气号靠千万级爆款撑估值。
2. **lib/scoring/config.ts — ENGAGEMENT_TIERS**：互动溢价乘数全线封顶（Viral 3.0→1.5、Very High 2.4→1.3、High 1.8→1.2、Good 1.3→1.1），消除「CPM 已含互动溢价、再乘互动乘数」的重复计价。
3. **lib/scoring/config.ts — BRAND_DEAL_LIMITS_BY_TIER**：月接单上限按 tier 下调（mid 5→2、micro 4→3、macro 4→2），对齐真实品牌成交率。

效果：@w7ch.0 $108万 → $15万（-86%）；@mr.xenoo $65万 → $2.5万（-96%）；@emmmheart $5.1万 → $1,207（-98%）。个别左偏分布账号（@power306787878）估值回升，是正确行为（中位数更接近真实水平）。

### 2. 关键决策：时间锚点用 computed_at
- 库中 posts 快照是评估当时的近期数据，用 `computed_at` 作为 `scoreProfile` 的 `now` 参数，能让帖子成熟度分类与原始评估一致。
- 效果：score/tier 几乎零漂移（仅 2 条历史残留被修正：victoriachmel 旧商业价值判定标 A → 现评分驱动标 B；putridewii617 2 分微调）。
- 若用当前时间重算，会因时间推移导致帖子滑入 archive、9 条 score 漂移，混入非公式因素。

### 3. 效果验证
- @airlandolists（210万粉）：$38.9M → $3.5M（-91%）
- @i.am_natsuki_（225万粉）：$6.06M → $1.2M
- 33 条估值 mid 合计 $8.03M，单个空气号不再撑起 9 成总估值

### 4. 凭证清理（防泄漏）
- `scripts/check_db.js`、`tools/revalue_evaluations.ts` 原硬编码 Neon DATABASE_URL（含密码），改为从 `process.env.DATABASE_URL` 读取，缺失时解析项目根 `.env.local`，都没有则报错。
- 两个脚本均在 `.gitignore` 的 `scripts/`、`tools/` 排除列表中（git ls-files 确认为空，未跟踪），双层保险。
