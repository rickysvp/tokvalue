'use client'

// 估值方法透明化面板（审计发现：估值模型黑盒损害用户信任）
// 三层结构：① 估值公式概览 ② 关键因子表（该账号实际数据）③ 免责声明
// 数据来源：result.calculationMetadata（后端计算过程元数据）+ businessValue.components
//          锚点触发标记从 incomeEstimate 中 brand_deals 渠道的 detail 字符串检测
// 元数据缺失（旧缓存数据）时优雅降级为通用方法论说明，不渲染空表格

import { useState } from 'react'
import { Calculator, ChevronDown, Info } from 'lucide-react'
import type { Evaluation } from '@/types'
import { formatNumber, formatUsd } from '@/lib/format'
import {
  getFollowerTier,
  getBrandDealFollowerCap,
  calcPlayFanPenaltyMultiplier,
} from '@/lib/scoring/valuation'

// 粉丝层级展示标签（阈值与 lib/scoring/valuation.ts 的 getFollowerTier 保持一致）
const TIER_LABELS: Record<string, string> = {
  nano: 'Nano (<10K followers)',
  micro: 'Micro (10K–100K)',
  mid: 'Mid (100K–500K)',
  macro: 'Macro (500K–1M)',
  mega: 'Mega (1M+)',
}

// 因子表单行：左侧因子名，右侧该账号实际取值（+ 可选说明小字）
function FactorRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-neutral-800/60 py-2 last:border-b-0">
      <span className="shrink-0 pt-0.5 text-xs text-neutral-400">{label}</span>
      <span className="min-w-0 text-right">
        <span className="text-xs font-medium tabular-nums text-neutral-200">{value}</span>
        {note && <span className="mt-0.5 block text-[10px] leading-tight text-neutral-500">{note}</span>}
      </span>
    </div>
  )
}

export function ValuationMethodology({ result }: { result: Evaluation }) {
  // 折叠面板默认收起
  const [open, setOpen] = useState(false)

  // ---- 动态数据抽取（可选访问，缺失时走通用说明降级）----
  const meta = result.calculationMetadata
  const comps = result.businessValue?.components || []
  const metrics = result.metrics
  const followers = result.followerCount || 0
  const tier = getFollowerTier(followers)

  // 品牌渠道明细字符串携带锚点标记（后端拼接："(Market-Anchored)" / "(Follower-Cap Anchored)"）
  const brandDetail = result.incomeEstimate?.breakdown?.find(b => b.source === 'brand_deals')?.detail || ''
  const followerCapAnchored = brandDetail.includes('Follower-Cap Anchored')
  const marketAnchored = brandDetail.includes('Market-Anchored')

  // 播放粉比与折损乘数（复用后端同一纯函数，保证与估值口径一致）
  const effectivePlays = meta?.effectiveAvgPlays ?? metrics?.effectiveAvgPlays ?? 0
  const playFanRatio = followers > 0 ? effectivePlays / followers : 0
  const playFanPenalty = calcPlayFanPenaltyMultiplier(playFanRatio)
  // 分层单条报价上限锚点（macro/mega 返回 0，走市场锚点区间）
  const followerCap = getBrandDealFollowerCap(tier, followers)

  return (
    <div className="-mt-6 mb-10">
      {/* 收起态：单行按钮 + 旋转箭头 */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 py-3 text-left transition-colors hover:border-neutral-700"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-neutral-300">
          <Calculator className="h-4 w-4 shrink-0 text-[#00F2EA]" />
          How is this calculated?
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-neutral-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-2 rounded-xl border border-neutral-800 bg-neutral-900/30 p-4 sm:p-5">
          {/* ① 估值公式概览：totalValue = 各 component 加总 + 数据来源说明 */}
          <div className="mb-5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Valuation formula</div>
            {comps.length > 0 ? (
              <>
                <div className="rounded-xl border border-neutral-800 bg-[#0f0f0f] p-3">
                  <div className="mb-2 break-words font-mono text-[11px] leading-relaxed text-neutral-400">
                    Total Value = {comps.map(c => c.label).join(' + ')}
                  </div>
                  <div className="space-y-1">
                    {comps.map((c, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 text-xs">
                        <span className="min-w-0 truncate text-neutral-300">{c.icon} {c.label}</span>
                        <span className="shrink-0 tabular-nums text-neutral-400">{formatUsd(c.amount.mid)} · {c.percentage}%</span>
                      </div>
                    ))}
                  </div>
                  {meta && (
                    <div className="mt-2 break-words border-t border-neutral-800 pt-2 font-mono text-[11px] leading-relaxed text-neutral-500">
                      Brand Deal Annual = {formatUsd(meta.perVideoBrandDealMid)}/video × {meta.monthlyBrandPosts}/month × 12
                    </div>
                  )}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-neutral-500">
                  Inputs: public TikTok data only — follower count, per-video play counts, likes/comments/shares and posting cadence. No private or login-required data is used.
                </p>
              </>
            ) : (
              // 组件数据缺失时的降级文案
              <p className="text-xs leading-relaxed text-neutral-400">
                Total account value is the sum of five components: brand deal annual value, content asset value, follower asset value, monetization capability and IP/brand premium — each computed from public TikTok data (followers, plays, engagement).
              </p>
            )}
          </div>

          {/* ② 关键因子表：有真实计算元数据时动态渲染该账号实际因子，否则展示通用方法论 */}
          <div className="mb-5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Key factors used for this account</div>
            {meta ? (
              <div className="rounded-xl border border-neutral-800 bg-[#0f0f0f] px-3 py-1.5">
                <FactorRow
                  label="Follower tier"
                  value={TIER_LABELS[tier] || tier}
                  note={`${formatNumber(followers)} followers`}
                />
                <FactorRow
                  label="Niche CPM"
                  value={`$${meta.brandCpm} / 1K views`}
                  note={`${meta.categoryForCpm} niche benchmark`}
                />
                <FactorRow
                  label="Engagement multiplier"
                  value={`${meta.engagementMultiplier.toFixed(1)}×`}
                  note={`Engagement rate ${metrics?.engagementRate?.toFixed(1) ?? '--'}%`}
                />
                <FactorRow
                  label="Region multiplier"
                  value={`${meta.regionMultiplier.toFixed(2)}×`}
                  note={`${meta.regionLabel} audience market`}
                />
                <FactorRow
                  label="Effective avg plays"
                  value={formatNumber(effectivePlays)}
                  note={`${meta.matureVideoCount} mature videos analyzed · ${meta.playsSource.replace(/-/g, ' ')}`}
                />
                {followerCap > 0 ? (
                  // nano/micro/mid：分层报价上限锚点（$X/万粉 + 分层封顶）
                  <FactorRow
                    label="Anchor cap"
                    value={`≤ ${formatUsd(followerCap)} / video`}
                    note={followerCapAnchored
                      ? 'Applied — raw formula output exceeded the tier cap and was trimmed'
                      : 'Not triggered — estimated rate is within the cap'}
                  />
                ) : (
                  // macro/mega：品类市场锚点区间
                  <FactorRow
                    label="Market anchor"
                    value="Category rate band"
                    note={marketAnchored
                      ? 'Applied — rate clamped to the category market band'
                      : 'Not triggered — rate within the market band'}
                  />
                )}
                <FactorRow
                  label="Play/fan ratio"
                  value={`${playFanRatio.toFixed(2)}×`}
                  note={playFanPenalty < 1
                    ? `${playFanPenalty.toFixed(2)}× discount applied — followers exceed actual reach`
                    : 'Healthy — reach matches follower size (no discount)'}
                />
              </div>
            ) : (
              // 降级：无计算元数据时展示通用方法论，不渲染空表格
              <p className="text-xs leading-relaxed text-neutral-400">
                Valuation factors include: niche CPM benchmarks, engagement-rate multiplier, audience-region multiplier, follower-tier premium, and anchor caps that trim outlier estimates. High-fan/low-reach accounts receive an additional play-fan discount so value reflects real reach, not vanity follower counts.
              </p>
            )}
          </div>

          {/* ③ 免责声明：估算非报价承诺 */}
          <div className="flex items-start gap-2 rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />
            <p className="text-xs leading-relaxed text-neutral-500">
              Disclaimer: this is an independent estimate based on publicly available data — not a price quote or guarantee. Actual deal value depends on content vertical, brand fit, negotiation and campaign scope.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
