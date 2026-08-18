'use client'

// ── Commercial Snapshot（免费首屏决策页）──
// PMF 重构核心：替代旧 Business Valuation 主叙事。
// 顶部并排双大卡：Commercial Readiness（左）+ Account Value Estimate（右，强化展示）
// 免费可见：宽报价区间 + 最强杠杆 + primary rate blocker + next move。
// 付费追加：全部 blockers（过滤 primary 防重复）+ Evidence（雷达 + Market Position）。

import { Evaluation } from '@/types'
import { useI18n, t } from '@/lib/i18n'
import { formatNumber } from '@/lib/format'
import { SectionHeader } from '@/components/SectionHeader'
import { CtaButton } from '@/components/CtaButton'
import { RadarChart } from '@/components/RadarChart'
import { PeerRankingSection } from '@/components/sections/PeerRankingSection'
import {
  Star, Zap, TrendingUp, Target, Lightbulb, ShieldAlert, Clock,
  BarChart3, Lock, ChevronDown, ShieldCheck,
} from 'lucide-react'
import { useState } from 'react'

interface CommercialSnapshotTabProps {
  result: Evaluation
  isPremium: boolean
  onUnlock: () => void
}

const BAND_STYLES: Record<string, string> = {
  'Premium Value': 'text-[#00F2EA] border-[#00F2EA]/40 bg-[#00F2EA]/10',
  'Strong Value': 'text-[#FF0050] border-[#FF0050]/40 bg-[#FF0050]/10',
  'Growth Value': 'text-amber-400 border-amber-400/40 bg-amber-400/10',
  'Early Value': 'text-neutral-300 border-neutral-600 bg-neutral-800',
}

/** 各等级 blocker 对报价的影响 */
function impactOf(level: 'high' | 'medium' | 'low'): string {
  if (level === 'high') return 'Brands typically discount rates 30–50% until this is resolved.'
  if (level === 'medium') return 'Expect negotiations to open 10–20% lower until this improves.'
  return 'Minor impact — worth monitoring before big deals.'
}

export function CommercialSnapshotTab({ result, isPremium, onUnlock }: CommercialSnapshotTabProps) {
  const { dict } = useI18n()
  const c = dict.evaluation.commercial
  const snap = result.commercialSnapshot
  const [showConclusion, setShowConclusion] = useState(true)
  const bv = result.businessValue

  const readinessColor = (snap?.readinessScore ?? result.score) >= 70 ? '#00F2EA' : (snap?.readinessScore ?? result.score) >= 45 ? '#FF0050' : '#f59e0b'

  // a) All Rate Blockers：付费时，过滤掉与 primary blocker 同一条（避免 Snapshot 双列 + 列表重复）
  const primaryLabel = snap?.primaryRateBlocker.label
  const allOtherBlockers = (result.riskFlags || []).filter(r => r.label !== primaryLabel)

  return (
    <>
      <SectionHeader step="01" title={dict.evaluation.sections.commercialSnapshot} icon={<Star className="h-4 w-4" />} />

      {/* ═══ c) 顶部并排双大卡：Readiness + Account Value ═══ */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        {/* ── 左：Commercial Readiness ── */}
        <div className="rounded-2xl border border-neutral-800 bg-gradient-to-br from-[#0f0f0f] to-[#141414] p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
            <div className="flex items-center gap-5">
              <div className="relative flex h-28 w-28 shrink-0 items-center justify-center">
                <svg className="h-28 w-28 -rotate-90" viewBox="0 0 112 112">
                  <circle cx="56" cy="56" r="48" stroke="#262626" strokeWidth="10" fill="none" />
                  <circle
                    cx="56" cy="56" r="48" stroke={readinessColor} strokeWidth="10" fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 48}`}
                    strokeDashoffset={`${2 * Math.PI * 48 * (1 - (snap?.readinessScore ?? result.score) / 100)}`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-black tabular-nums text-white leading-none">{snap?.readinessScore ?? result.score}</span>
                  <span className="text-[10px] text-neutral-500 mt-1">/ 100</span>
                </div>
              </div>
              <div className="sm:hidden"><BandBadge band={snap?.readinessBand} /></div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{c.readinessLabel}</span>
                <span className="hidden sm:inline-flex"><BandBadge band={snap?.readinessBand} /></span>
              </div>
              <p className="text-lg sm:text-xl font-bold text-white leading-snug mb-2">
                {snap?.positioning || result.verdict}
              </p>
              <p className="text-xs text-neutral-500">{c.readinessHint}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
                <span className="inline-flex items-center gap-1.5"><BarChart3 className="h-3 w-3" />{c.confidenceLabel}: <span className="text-neutral-300 capitalize">{snap?.dataConfidence || 'medium'}</span></span>
                <span className="inline-flex items-center gap-1.5"><Clock className="h-3 w-3" />{c.dataAsOf} {new Date(result.computedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                <span>{c.dataScope}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── 右：Account Value Estimate（强化展示）── */}
        <div className="rounded-2xl border border-[#00F2EA]/25 bg-gradient-to-br from-[#00F2EA]/[0.07] via-[#0f0f0f] to-[#FF0050]/[0.05] p-6 sm:p-8 relative overflow-hidden">
          <div className="pointer-events-none absolute -top-20 -right-16 h-48 w-48 rounded-full bg-[#00F2EA]/10 blur-3xl" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="h-4 w-4 text-[#00F2EA]" />
              <span className="text-xs font-semibold uppercase tracking-wider text-[#00F2EA]">{c.accountValueEstimate}</span>
            </div>
            <div className="mb-4">
              <div className="flex items-baseline gap-3 flex-wrap mb-2">
                <span className="text-4xl sm:text-5xl font-black tracking-tight text-white tabular-nums">
                  ${formatNumber(bv?.totalValue.low || 0)} – ${formatNumber(bv?.totalValue.high || 0)}
                </span>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed max-w-sm">
                {c.accountValueHint}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {bv?.components?.slice(0, 4).map((comp, i) => (
                <div key={i} className="rounded-lg border border-neutral-800/70 bg-black/30 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-0.5">{comp.label}</div>
                  <div className="text-sm font-bold tabular-nums text-neutral-200">${formatNumber(comp.amount.low)}–${formatNumber(comp.amount.high)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Suggested rate（宽区间）── */}
      <div className="mb-6 rounded-2xl border border-[#FF0050]/25 bg-gradient-to-br from-[#FF0050]/[0.07] via-[#0f0f0f] to-[#0f0f0f] p-6 sm:p-8">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-[#FF0050]" />
          <span className="text-xs font-semibold uppercase tracking-wider text-[#FF0050]">{c.suggestedRate}</span>
        </div>
        {snap ? (
          <>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-4xl sm:text-5xl font-black tracking-tight text-white tabular-nums">
                ${formatNumber(snap.suggestedRateRange.low)} – ${formatNumber(snap.suggestedRateRange.high)}
              </span>
              <span className="text-sm text-neutral-400">mid ${formatNumber(snap.suggestedRateRange.mid)}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs text-neutral-400">{c.estimateDisclaimer}</span>
              {!isPremium && (
                <span className="rounded-full border border-[#00F2EA]/30 bg-[#00F2EA]/10 px-3 py-1 text-xs text-[#00F2EA]">{c.suggestedRateNote}</span>
              )}
            </div>
          </>
        ) : (
          result.brandDealPerVideo ? (
            <div className="text-3xl sm:text-4xl font-black text-white tabular-nums">
              ${formatNumber(result.brandDealPerVideo.low)} – ${formatNumber(result.brandDealPerVideo.high)}
            </div>
          ) : null
        )}
      </div>

      {/* ── Lever / Blocker 双列 ── */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-green-500/20 bg-green-500/[0.04] p-6">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-green-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-green-400">{c.strongestLever}</span>
          </div>
          <div className="text-base font-bold text-white mb-2">{snap?.strongestLever.label || '—'}</div>
          <p className="text-sm text-neutral-400 leading-relaxed">{snap?.strongestLever.detail || ''}</p>
        </div>
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-6">
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert className="h-4 w-4 text-amber-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">{c.primaryBlocker}</span>
          </div>
          <div className="text-base font-bold text-white mb-2">{snap?.primaryRateBlocker.label || '—'}</div>
          <p className="text-sm text-neutral-400 leading-relaxed mb-3">{snap?.primaryRateBlocker.detail || ''}</p>
          {snap?.primaryRateBlocker.impact && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              {snap.primaryRateBlocker.impact}
            </div>
          )}
          {!isPremium && result.riskFlags && result.riskFlags.length > 1 && (
            <div className="mt-3 flex items-center gap-1.5 text-xs text-neutral-500">
              <Lock className="h-3 w-3" />
              {c.allBlockersLocked} ({result.riskFlags.length - 1} more)
            </div>
          )}
        </div>
      </div>

      {/* ── 付费追加：All Rate Blockers（去掉 primary 防重复）── */}
      {isPremium && (
        <div className="mb-6">
          <SectionHeader step="02" title={dict.evaluation.sections.rateBlockers} icon={<ShieldAlert className="h-4 w-4" />} />
          {allOtherBlockers.length > 0 ? (
            <div className="space-y-3">
              {allOtherBlockers.map((risk, i) => (
                <div
                  key={i}
                  className={`rounded-2xl border p-5 ${
                    risk.level === 'high'
                      ? 'border-red-500/25 bg-red-500/[0.04]'
                      : risk.level === 'medium'
                        ? 'border-amber-500/25 bg-amber-500/[0.04]'
                        : 'border-neutral-800 bg-neutral-900/30'
                  }`}
                >
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        risk.level === 'high'
                          ? 'bg-red-500/15 text-red-400'
                          : risk.level === 'medium'
                            ? 'bg-amber-500/15 text-amber-400'
                            : 'bg-neutral-800 text-neutral-400'
                      }`}
                    >
                      {risk.level}
                    </span>
                    <span className="text-base font-bold text-white">{risk.label}</span>
                  </div>
                  <p className="mb-3 text-sm text-neutral-400 leading-relaxed">{risk.detail}</p>
                  <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-xs text-neutral-300">
                    <span className="font-semibold text-neutral-200">{c.rateImpactLabel}: </span>
                    {impactOf(risk.level)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl border border-green-500/25 bg-green-500/[0.05] p-6">
              <ShieldCheck className="h-8 w-8 shrink-0 text-green-400" />
              <div>
                <div className="text-base font-bold text-white mb-0.5">{c.noBlockersTitle}</div>
                <p className="text-sm text-neutral-400">{c.noBlockersDesc}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Next move ── */}
      <div className="mb-6 rounded-2xl border border-[#00F2EA]/20 bg-[#00F2EA]/[0.03] p-6">
        <div className="flex items-center gap-2 mb-3">
          <Target className="h-4 w-4 text-[#00F2EA]" />
          <span className="text-xs font-semibold uppercase tracking-wider text-[#00F2EA]">{c.nextMove}</span>
          {snap?.nextMove && (
            <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-400">
              {t(c.effortHours, { n: String(snap.nextMove.effortHours) })}
            </span>
          )}
        </div>
        <div className="text-base font-bold text-white mb-1">{snap?.nextMove.title || result.summary.bestAction}</div>
        <p className="text-sm text-neutral-400 leading-relaxed">{snap?.nextMove.detail || ''}</p>
      </div>

      {/* ── 付费追加：Evidence（雷达 + Market Position 并排支撑快照结论）── */}
      {isPremium && (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-neutral-800 bg-gradient-to-br from-[#0f0f0f] to-[#141414] p-6 flex items-center justify-center">
            <RadarChart dimensions={result.dimensions} />
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-[#0d0d0d] p-6">
            <PeerRankingSection ranking={result.peerRanking} />
          </div>
        </div>
      )}

      {/* ── 评估结论（紧凑折叠）── */}
      <button
        onClick={() => setShowConclusion(v => !v)}
        className="mb-3 flex w-full items-center justify-between rounded-xl border border-neutral-800 bg-[#0f0f0f] px-5 py-3 text-left transition-colors hover:bg-neutral-900"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-neutral-300">
          <Lightbulb className="h-4 w-4 text-[#FF0050]" />
          {dict.evaluation.sections.assessmentConclusion}
        </span>
        <ChevronDown className={`h-4 w-4 text-neutral-500 transition-transform ${showConclusion ? 'rotate-180' : ''}`} />
      </button>
      {showConclusion && (
        <div className="mb-6 space-y-4">
          <div className="rounded-2xl border border-[#FF0050]/30 bg-gradient-to-br from-[#FF0050]/10 via-[#0f0f0f] to-[#0f0f0f] p-6">
            <div className="text-lg font-bold text-white mb-2">{result.verdict}</div>
            <p className="text-sm text-neutral-300 leading-relaxed">{result.advice}</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-green-400 mb-3">{dict.evaluation.conclusion.strengths}</div>
              <ul className="space-y-2">
                {result.summary.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-neutral-300">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold text-green-400 ring-1 ring-green-500/30">+</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-3">{dict.evaluation.conclusion.weaknesses}</div>
              <ul className="space-y-2">
                {result.summary.weaknesses.map((w, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-neutral-300">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold text-amber-400 ring-1 ring-amber-500/30">−</span>
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ── 免费用户升级 CTA ── */}
      {!isPremium && (
        <div className="rounded-2xl border border-[#FF0050]/30 bg-gradient-to-br from-[#FF0050]/15 via-[#0f0f0f] to-[#0f0f0f] p-6 text-center">
          <p className="text-sm text-neutral-300 mb-1">{c.unlockSub}</p>
          <CtaButton variant="gradient" size="lg" onClick={onUnlock} className="mt-2">
            {c.unlockCta}
          </CtaButton>
        </div>
      )}
    </>
  )
}

function BandBadge({ band }: { band?: string }) {
  if (!band) return null
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${BAND_STYLES[band] || BAND_STYLES['Early Value']}`}>
      {band}
    </span>
  )
}
