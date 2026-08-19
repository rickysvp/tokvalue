'use client'

// ── Teaser 免费报告（B3，Spec §3.3）──
// 三层钩子结构：L1 免费钩子（已可见清单）→ L2 半遮罩预览（模糊暗示）→ L3 锁定价值栈（图标+关键词+一句话）。
// 可见：价值区间 + 置信度 + 层级 / 最大瓶颈 / Top3 视频；锁定栈承载全部付费承诺 + 单一 CTA。

import { Evaluation } from '@/types'
import { useI18n } from '@/lib/i18n'
import { formatNumber, formatUsd } from '@/lib/format'
import { SectionHeader } from '@/components/SectionHeader'
import { TIER_COLORS } from '@/lib/tier'
import { valueTierOf } from '@/lib/pillar'
import {
  Star, ShieldAlert, Play, ThumbsUp, Lock, Check, ChevronRight,
  DollarSign, BarChart3, TrendingDown, TrendingUp, Sparkles, FileDown, Target,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface TeaserReportProps {
  result: Evaluation
  onUnlock: () => void
}

const BAND_STYLES: Record<string, string> = {
  'Premium Value': 'text-[#00F2EA] border-[#00F2EA]/40 bg-[#00F2EA]/10',
  'Strong Value': 'text-[#FF0050] border-[#FF0050]/40 bg-[#FF0050]/10',
  'Growth Value': 'text-amber-400 border-amber-400/40 bg-amber-400/10',
  'Early Value': 'text-neutral-300 border-neutral-600 bg-neutral-800',
}

const CONFIDENCE_LABEL: Record<string, string> = {
  high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence',
}

/** L3 锁定价值栈条目（图标 + 关键词 + 一句话） */
const LOCKED_MODULES: { icon: LucideIcon; accent: string; title: string; desc: string }[] = [
  { icon: DollarSign,   accent: '#FF0050', title: 'Valuation Breakdown',  desc: 'See exactly how your $ range splits across Brand Deals, Content, Audience & Growth.' },
  { icon: BarChart3,    accent: '#00F2EA', title: 'Full Score Analysis',  desc: 'Every scoring dimension with per-item attribution — what helps, what hurts.' },
  { icon: TrendingDown, accent: '#FF0050', title: 'Bottom 3 Videos',      desc: 'Your 3 weakest posts and the specific reason each one underperformed.' },
  { icon: Target,       accent: '#00F2EA', title: 'Deal Rate Card',       desc: 'Opening rate, acceptable range and walk-away floor for your next brand deal.' },
  { icon: TrendingUp,   accent: '#FF0050', title: 'Growth Plan',          desc: 'Prioritized 30-day actions tied to your real videos and scores.' },
  { icon: Sparkles,     accent: '#00F2EA', title: 'Deep AI Analysis',     desc: 'Trend, monetization and content-strategy insights generated for your account.' },
  { icon: FileDown,     accent: '#FF0050', title: 'PDF & Share',          desc: 'Export a polished report or share a link — take your value anywhere.' },
]

export function TeaserReport({ result, onUnlock }: TeaserReportProps) {
  const { dict } = useI18n()
  const snap = result.commercialSnapshot
  const bv = result.businessValue
  const blocker = snap?.primaryRateBlocker ?? (result.riskFlags?.[0]
    ? { label: result.riskFlags[0].label, detail: result.riskFlags[0].detail, impact: '' }
    : undefined)
  const topPosts = [...(result.posts || [])].sort((a, b) => b.playCount - a.playCount).slice(0, 3)
  const band = snap?.readinessBand
  const bandStyle = band ? (BAND_STYLES[band] || BAND_STYLES['Early Value']) : ''
  const tierColor = TIER_COLORS[result.tier] || '#ffffff'
  const freeHooks = [
    { label: 'Estimated value range', value: bv ? `${formatUsd(bv.totalValue.low)} – ${formatUsd(bv.totalValue.high)}` : '—' },
    { label: 'Value tier', value: band || valueTierOf(result.tier) },
    { label: 'Biggest growth blocker', value: blocker?.label || '—' },
  ]

  return (
    <>
      <SectionHeader step="01" title="Your Free Snapshot" icon={<Star className="h-4 w-4" />} />

      {/* ═══ ① 价值区间 + 置信度 + 层级（Teaser 首屏主卡）═══ */}
      <div className="mb-6 rounded-2xl border border-neutral-800 bg-gradient-to-br from-[#0f0f0f] to-[#141414] p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-widest text-neutral-500">Estimated Business Value</span>
          {snap?.dataConfidence && (
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${snap.dataConfidence === 'high' ? 'border-[#00F2EA]/40 bg-[#00F2EA]/10 text-[#00F2EA]' : snap.dataConfidence === 'medium' ? 'border-amber-400/40 bg-amber-400/10 text-amber-400' : 'border-neutral-600 bg-neutral-800 text-neutral-400'}`}>
              <ShieldAlert className="h-3 w-3" /> {CONFIDENCE_LABEL[snap.dataConfidence] || 'Medium confidence'}
            </span>
          )}
        </div>
        {bv ? (
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3">
            <span className="text-3xl font-black tabular-nums text-white sm:text-4xl" style={{ textShadow: `0 0 24px ${tierColor}33` }}>
              {formatUsd(bv.totalValue.low)}
            </span>
            <span className="text-xl font-bold text-neutral-500">–</span>
            <span className="text-3xl font-black tabular-nums text-white sm:text-4xl" style={{ textShadow: `0 0 24px ${tierColor}33` }}>
              {formatUsd(bv.totalValue.high)}
            </span>
            <span className="text-sm text-neutral-500">/ year</span>
          </div>
        ) : (
          <p className="mt-3 text-sm text-neutral-500">Value estimate unavailable for this account.</p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {band && <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${bandStyle}`}><Star className="h-3.5 w-3.5" /> {band}</span>}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-800/50 px-3 py-1 text-xs text-neutral-400">Score {result.score}/100</span>
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-neutral-600">{dict.common.dataDisclaimer}</p>
      </div>

      {/* ═══ ② 最大瓶颈 + 一句话原因 ═══ */}
      {blocker && (
        <div className="mb-6 rounded-2xl border border-[#FF0050]/25 bg-[#FF0050]/5 p-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#FF0050]">
            <ShieldAlert className="h-4 w-4" /> Your #1 growth blocker
          </div>
          <p className="mt-2 text-lg font-bold text-white">{blocker.label}</p>
          {blocker.detail && <p className="mt-1 text-sm leading-relaxed text-neutral-400">{blocker.detail}</p>}
          {blocker.impact && <p className="mt-2 text-xs text-neutral-500">{blocker.impact}</p>}
        </div>
      )}

      {/* ═══ ③ Top 3 表现最好视频 ═══ */}
      {topPosts.length > 0 && (
        <div className="mb-6 rounded-2xl border border-neutral-800 bg-[#0f0f0f] p-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Play className="h-4 w-4 text-[#00F2EA]" /> Your Top {topPosts.length} videos
          </div>
          <div className="mt-4 space-y-3">
            {topPosts.map((p, i) => (
              <div key={p.id} className="flex items-center gap-4 rounded-xl border border-neutral-800/80 bg-neutral-900/50 p-3.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#00F2EA]/10 text-sm font-black text-[#00F2EA]">#{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-neutral-200">{p.desc || '(no caption)'}</p>
                  <div className="mt-1 flex items-center gap-3 text-xs text-neutral-500">
                    <span className="inline-flex items-center gap-1"><Play className="h-3 w-3" /> {formatNumber(p.playCount)}</span>
                    <span className="inline-flex items-center gap-1"><ThumbsUp className="h-3 w-3" /> {formatNumber(p.likeCount)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ ④ 锁定价值栈：三层钩子 ═══ */}
      <div className="relative overflow-hidden rounded-2xl border border-[#FF0050]/30 bg-gradient-to-b from-[#16070c] to-[#0d0d0d] p-6 sm:p-8">
        {/* L1 免费钩子：已可见清单 */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-widest text-neutral-500">Free in your snapshot</span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {freeHooks.map(h => (
            <div key={h.label} className="rounded-xl border border-[#00F2EA]/20 bg-[#00F2EA]/5 p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-neutral-500"><Check className="h-3 w-3 text-[#00F2EA]" /> {h.label}</div>
              <p className="mt-1 truncate text-sm font-semibold text-white">{h.value}</p>
            </div>
          ))}
        </div>

        {/* L2 半遮罩预览：模糊化暗示更多内容 */}
        <div className="pointer-events-none mt-6 select-none" aria-hidden>
          <div className="space-y-2.5 opacity-70 blur-[2px]">
            <div className="h-6 w-3/4 rounded-md bg-gradient-to-r from-[#FF0050]/50 to-transparent" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="h-16 rounded-lg bg-neutral-800/80" />
              <div className="h-16 rounded-lg bg-[#FF0050]/25" />
              <div className="h-16 rounded-lg bg-[#00F2EA]/20" />
              <div className="h-16 rounded-lg bg-neutral-800/80" />
            </div>
            <div className="h-4 w-1/2 rounded bg-neutral-800/80" />
          </div>
          <div className="absolute inset-x-0 bottom-40 h-24 bg-gradient-to-t from-[#0d0d0d] to-transparent" />
        </div>

        {/* L3 锁定价值栈：图标 + 关键词 + 一句话 */}
        <div className="relative mt-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Lock className="h-4 w-4 text-[#FF0050]" /> Unlock your full report
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {LOCKED_MODULES.map(m => (
              <div key={m.title} className="flex items-start gap-3 rounded-xl border border-neutral-800 bg-neutral-900/40 p-3.5">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${m.accent}1a`, color: m.accent }}>
                  <m.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{m.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">{m.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={onUnlock}
            className="group mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#FF0050] px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#FF0050]/25 transition-all hover:bg-[#ff1a64] hover:shadow-[#FF0050]/40 sm:w-auto"
          >
            <Lock className="h-4 w-4" /> Unlock Full Report
            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
    </>
  )
}
