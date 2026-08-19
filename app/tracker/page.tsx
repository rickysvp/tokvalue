'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  loadTrackedEvaluations, removeFromTracker, clearTracker,
  formatTrackUsd, formatTrackNumber,
  TrackedEvaluation,
} from '@/lib/tracker'
import {
  ArrowLeft, TrendingUp, TrendingDown, Trash2, BarChart3,
  Users, Eye, DollarSign, Activity, Shield, Calendar,
  Star, Target, AlertTriangle, CheckCircle2,
} from 'lucide-react'
import { useI18n, t } from '@/lib/i18n'
import { valueTierOf } from '@/lib/pillar'

export default function TrackerPage() {
  const { dict } = useI18n()
  const [evaluations, setEvaluations] = useState<TrackedEvaluation[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  useEffect(() => {
    setEvaluations(loadTrackedEvaluations())
  }, [])

  function refresh() {
    setEvaluations(loadTrackedEvaluations())
  }

  function handleRemove(username: string) {
    removeFromTracker(username)
    refresh()
  }

  function handleClearAll() {
    clearTracker()
    refresh()
    setSelectedIds([])
    setShowClearConfirm(false)
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(i => i !== id)
      if (prev.length >= 2) return [prev[1], id]
      return [...prev, id]
    })
  }

  const selectedEvaluations = evaluations.filter(e => selectedIds.includes(e.id))
  const uniqueUsernames = Array.from(new Set(evaluations.map(e => e.username)))

  return (
    <main className="min-h-screen mx-auto max-w-5xl px-4 py-12">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-[#FF0050] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {dict.tracker.backToEvaluation}
        </Link>
        <div className="flex items-center justify-between mt-4">
          <div>
            <h1 className="text-3xl font-bold">{dict.tracker.title}</h1>
            <p className="mt-2 text-neutral-500">
              {t(dict.tracker.tracking, { count: uniqueUsernames.length, records: evaluations.length })}
            </p>
          </div>
          {evaluations.length > 0 && (
            showClearConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-400">{dict.tracker.confirmClear}</span>
                <button
                  onClick={handleClearAll}
                  className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition-colors"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {dict.common.confirm}
                </button>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="inline-flex items-center gap-1 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
                >
                  {dict.common.cancel}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-red-900/40 bg-red-950/20 px-4 py-2 text-sm text-red-400 hover:bg-red-950/40 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                {dict.tracker.clearAll}
              </button>
            )
          )}
        </div>
      </div>

      {/* Comparison Section */}
      {selectedIds.length > 0 && (
        <div className="mb-8 rounded-2xl border border-[#00F2EA]/20 bg-[#0f0f0f] p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-[#00F2EA]" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
                {selectedIds.length === 2 ? dict.tracker.comparison : dict.tracker.accountDetail}
              </h2>
            </div>
            <span className="text-xs text-neutral-500">
              {t(dict.tracker.selectHint, { current: selectedIds.length })}
            </span>
          </div>

          {selectedEvaluations.length === 2 ? (
            <ComparisonView a={selectedEvaluations[0]} b={selectedEvaluations[1]} />
          ) : selectedEvaluations.length === 1 ? (
            <SingleView evaluation={selectedEvaluations[0]} />
          ) : null}
        </div>
      )}

      {/* Empty State */}
      {evaluations.length === 0 ? (
        <div className="rounded-2xl border border-neutral-800 bg-[#141414] p-12 text-center">
          <Target className="mx-auto h-10 w-10 text-neutral-600 mb-4" />
          <p className="text-neutral-400 mb-2">{dict.tracker.emptyTitle}</p>
          <p className="text-sm text-neutral-600 mb-6">
            {dict.tracker.emptyDesc}
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-[#FF0050] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#d60043] transition-colors"
          >
            {dict.tracker.emptyCta}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {evaluations.map(evaluation => (
            <div
              key={evaluation.id}
              className={`rounded-xl border transition-colors cursor-pointer ${
                selectedIds.includes(evaluation.id)
                  ? 'border-[#00F2EA]/40 bg-[#00F2EA]/5'
                  : 'border-neutral-800 bg-[#141414] hover:border-[#00F2EA]/20'
              }`}
              onClick={() => toggleSelect(evaluation.id)}
            >
              <div className="flex items-center gap-4 p-4">
                {/* Avatar */}
                {evaluation.avatar ? (
                  <Image src={evaluation.avatar} alt={evaluation.nickname} width={48} height={48} className="h-12 w-12 rounded-full border border-neutral-700 shrink-0 object-cover" />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-neutral-800 flex items-center justify-center font-bold shrink-0">
                    {evaluation.nickname.charAt(0).toUpperCase()}
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{evaluation.nickname}</span>
                    <span className="text-sm text-neutral-500">@{evaluation.username}</span>
                    {evaluation.verified && <CheckCircle2 className="h-4 w-4 text-[#00F2EA]" />}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-neutral-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(evaluation.timestamp).toLocaleDateString('en-US')}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {formatTrackNumber(evaluation.followerCount)} {dict.tracker.followers}
                    </span>
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      {formatTrackNumber(evaluation.avgPlays)} {dict.tracker.avgPlays}
                    </span>
                  </div>
                </div>

                {/* Score + Value */}
                <div className="text-right shrink-0">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center justify-center rounded-md px-2 py-1 text-[10px] font-bold ${
                      evaluation.tier === 'S' || evaluation.tier === 'A' ? 'bg-green-500/20 text-green-400' :
                      evaluation.tier === 'B' ? 'bg-[#00F2EA]/20 text-[#00F2EA]' :
                      evaluation.tier === 'C' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {valueTierOf(evaluation.tier)}
                    </span>
                    <span className="text-2xl font-bold tabular-nums">{evaluation.score}</span>
                  </div>
                  <div className="text-xs text-[#00F2EA] font-semibold mt-0.5">
                    {formatTrackUsd(evaluation.businessValue.mid)}
                  </div>
                </div>

                {/* Delete */}
                <button
                  onClick={e => {
                    e.stopPropagation()
                    handleRemove(evaluation.username)
                  }}
                  className="p-2 rounded-lg text-neutral-600 hover:text-red-400 hover:bg-red-950/20 transition-colors"
                  title={dict.common.delete}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

// ========== Comparison View ==========

function ComparisonView({ a, b }: { a: TrackedEvaluation; b: TrackedEvaluation }) {
  const { dict } = useI18n()
  const newer = new Date(a.timestamp) > new Date(b.timestamp) ? a : b
  const older = new Date(a.timestamp) > new Date(b.timestamp) ? b : a

  const rows: { label: string; icon: React.ReactNode; valueA: string; valueB: string; change: number; isPositiveGood: boolean }[] = [
    {
      label: dict.tracker.businessValue, icon: <DollarSign className="h-4 w-4" />,
      valueA: formatTrackUsd(newer.businessValue.mid),
      valueB: formatTrackUsd(older.businessValue.mid),
      change: older.businessValue.mid > 0 ? ((newer.businessValue.mid - older.businessValue.mid) / older.businessValue.mid) * 100 : 0,
      isPositiveGood: true,
    },
    {
      label: dict.tracker.score, icon: <Star className="h-4 w-4" />,
      valueA: String(newer.score),
      valueB: String(older.score),
      change: older.score > 0 ? ((newer.score - older.score) / older.score) * 100 : 0,
      isPositiveGood: true,
    },
    {
      label: dict.tracker.followers, icon: <Users className="h-4 w-4" />,
      valueA: formatTrackNumber(newer.followerCount),
      valueB: formatTrackNumber(older.followerCount),
      change: older.followerCount > 0 ? ((newer.followerCount - older.followerCount) / older.followerCount) * 100 : 0,
      isPositiveGood: true,
    },
    {
      label: dict.tracker.engagementRate, icon: <Activity className="h-4 w-4" />,
      valueA: newer.engagementRate + '%',
      valueB: older.engagementRate + '%',
      change: newer.engagementRate - older.engagementRate,
      isPositiveGood: true,
    },
    {
      label: dict.tracker.avgPlays, icon: <Eye className="h-4 w-4" />,
      valueA: formatTrackNumber(newer.avgPlays),
      valueB: formatTrackNumber(older.avgPlays),
      change: older.avgPlays > 0 ? ((newer.avgPlays - older.avgPlays) / older.avgPlays) * 100 : 0,
      isPositiveGood: true,
    },
    {
      label: dict.tracker.monthlyIncome, icon: <TrendingUp className="h-4 w-4" />,
      valueA: formatTrackUsd(newer.incomeEstimate.mid),
      valueB: formatTrackUsd(older.incomeEstimate.mid),
      change: older.incomeEstimate.mid > 0 ? ((newer.incomeEstimate.mid - older.incomeEstimate.mid) / older.incomeEstimate.mid) * 100 : 0,
      isPositiveGood: true,
    },
    {
      label: dict.tracker.riskSignals, icon: <Shield className="h-4 w-4" />,
      valueA: String(newer.riskCount),
      valueB: String(older.riskCount),
      change: -(newer.riskCount - older.riskCount),
      isPositiveGood: false,
    },
  ]

  return (
    <div>
      {/* Header labels */}
      <div className="grid grid-cols-2 sm:grid-cols-[1fr_120px_40px_120px] gap-2 sm:gap-4 mb-3 px-2">
        <span className="text-xs text-neutral-500 uppercase tracking-wider">{dict.tracker.metricChange}</span>
        <span className="text-xs text-neutral-500 uppercase tracking-wider text-right">
          {new Date(newer.timestamp).toLocaleDateString('en-US')}
        </span>
        <span className="hidden sm:block" />
        <span className="hidden sm:block text-xs text-neutral-500 uppercase tracking-wider text-right">
          {new Date(older.timestamp).toLocaleDateString('en-US')}
        </span>
      </div>

      <div className="space-y-2">
        {rows.map((row, i) => {
          const isPositive = (row.isPositiveGood && row.change > 0) || (!row.isPositiveGood && row.change > 0)
          const isNegative = (row.isPositiveGood && row.change < 0) || (!row.isPositiveGood && row.change < 0)
          const changeText = row.label === dict.tracker.engagementRate || row.label === dict.tracker.riskSignals
            ? `${row.change > 0 ? '+' : ''}${row.change.toFixed(1)}`
            : `${row.change > 0 ? '+' : ''}${row.change.toFixed(0)}%`

          return (
            <div key={i} className="grid grid-cols-2 sm:grid-cols-[1fr_120px_40px_120px] gap-2 sm:gap-4 items-center rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 py-3">
              {/* Mobile: 指标+变化 / 新值 ; Desktop: 指标 / 新值 / 变化 / 旧值 */}
              <div className="flex items-center gap-2">
                <span className="text-neutral-500">{row.icon}</span>
                <span className="text-sm text-neutral-400">{row.label}</span>
                {/* Mobile: show change inline */}
                <span className="sm:hidden ml-auto">
                  {isPositive ? (
                    <span className="inline-flex items-center gap-0.5 text-green-400 text-xs font-semibold">
                      <TrendingUp className="h-3 w-3" />
                      {changeText}
                    </span>
                  ) : isNegative ? (
                    <span className="inline-flex items-center gap-0.5 text-red-400 text-xs font-semibold">
                      <TrendingDown className="h-3 w-3" />
                      {changeText}
                    </span>
                  ) : (
                    <span className="text-neutral-600 text-xs">-</span>
                  )}
                </span>
              </div>
              <span className="text-sm font-semibold tabular-nums text-right">{row.valueA}</span>
              {/* Desktop: change column */}
              <div className="hidden sm:flex justify-center">
                {isPositive ? (
                  <span className="inline-flex items-center gap-0.5 text-green-400 text-xs font-semibold">
                    <TrendingUp className="h-3 w-3" />
                    {changeText}
                  </span>
                ) : isNegative ? (
                  <span className="inline-flex items-center gap-0.5 text-red-400 text-xs font-semibold">
                    <TrendingDown className="h-3 w-3" />
                    {changeText}
                  </span>
                ) : (
                  <span className="text-neutral-600 text-xs">-</span>
                )}
              </div>
              {/* Desktop: older value */}
              <span className="hidden sm:block text-sm text-neutral-500 tabular-nums text-right">{row.valueB}</span>
              {/* Mobile: older value below */}
              <span className="sm:hidden col-span-2 text-xs text-neutral-500 tabular-nums text-right -mt-1">
                {dict.tracker.previousValue} {row.valueB}
              </span>
            </div>
          )
        })}
      </div>

      {/* Summary */}
      <div className="mt-4 pt-4 border-t border-neutral-800">
        <div className="flex items-start gap-2 rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
          <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
          <div className="text-xs text-neutral-400">
            <span className="text-neutral-300 font-medium">{dict.tracker.comparisonSummary}</span>
            {' '}{dict.tracker.from} {new Date(older.timestamp).toLocaleDateString('en-US')} {dict.tracker.to} {new Date(newer.timestamp).toLocaleDateString('en-US')}.
            {' '}{dict.tracker.businessValue} {newer.businessValue.mid >= older.businessValue.mid ? dict.tracker.increased : dict.tracker.decreased} {Math.abs(newer.businessValue.mid - older.businessValue.mid) > 0 ? formatTrackUsd(Math.abs(newer.businessValue.mid - older.businessValue.mid)) : '$0'}.
            {' '}{dict.tracker.score} {newer.score >= older.score ? '+' : ''}{newer.score - older.score}.
            {newer.riskCount > older.riskCount ? dict.tracker.riskIncreased : newer.riskCount < older.riskCount ? dict.tracker.riskDecreased : ''}
          </div>
        </div>
      </div>
    </div>
  )
}

// ========== Single View ==========

function SingleView({ evaluation }: { evaluation: TrackedEvaluation }) {
  const { dict } = useI18n()
  return (
    <div className="space-y-4">
      {/* Overview cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          <div className="text-xs text-neutral-500 mb-1">{dict.tracker.businessValue}</div>
          <div className="text-xl font-bold text-[#00F2EA] tabular-nums">{formatTrackUsd(evaluation.businessValue.mid)}</div>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          <div className="text-xs text-neutral-500 mb-1">{dict.tracker.score}</div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tabular-nums">{evaluation.score}</span>
            <span className={`inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-bold ${
              evaluation.tier === 'S' || evaluation.tier === 'A' ? 'bg-green-500/20 text-green-400' :
              evaluation.tier === 'B' ? 'bg-[#00F2EA]/20 text-[#00F2EA]' : 'bg-amber-500/20 text-amber-400'
            }`}>{valueTierOf(evaluation.tier).replace(' Value', '')}</span>
          </div>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          <div className="text-xs text-neutral-500 mb-1">{dict.tracker.monthlyIncome}</div>
          <div className="text-xl font-bold text-[#FF0050] tabular-nums">{formatTrackUsd(evaluation.incomeEstimate.mid)}</div>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          <div className="text-xs text-neutral-500 mb-1">{dict.tracker.brandValue}</div>
          <div className="text-xl font-bold text-[#00F2EA] tabular-nums">{formatTrackUsd(evaluation.brandMatchingValue.mid)}</div>
        </div>
      </div>

      {/* Detail rows */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="flex justify-between rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 py-3">
          <span className="text-sm text-neutral-500">{dict.tracker.followers}</span>
          <span className="text-sm font-semibold tabular-nums">{formatTrackNumber(evaluation.followerCount)}</span>
        </div>
        <div className="flex justify-between rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 py-3">
          <span className="text-sm text-neutral-500">{dict.tracker.videos}</span>
          <span className="text-sm font-semibold tabular-nums">{evaluation.videoCount}</span>
        </div>
        <div className="flex justify-between rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 py-3">
          <span className="text-sm text-neutral-500">{dict.tracker.engagementRate}</span>
          <span className="text-sm font-semibold tabular-nums">{evaluation.engagementRate}%</span>
        </div>
        <div className="flex justify-between rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 py-3">
          <span className="text-sm text-neutral-500">{dict.tracker.avgPlays}</span>
          <span className="text-sm font-semibold tabular-nums">{formatTrackNumber(evaluation.avgPlays)}</span>
        </div>
        <div className="flex justify-between rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 py-3">
          <span className="text-sm text-neutral-500">{dict.tracker.riskSignals}</span>
          <span className={`text-sm font-semibold tabular-nums ${evaluation.riskCount > 0 ? 'text-amber-400' : 'text-green-400'}`}>
            {evaluation.riskCount}
          </span>
        </div>
        <div className="flex justify-between rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 py-3">
          <span className="text-sm text-neutral-500">{dict.tracker.evaluationTime}</span>
          <span className="text-sm font-semibold tabular-nums">
            {new Date(evaluation.timestamp).toLocaleDateString('en-US')}
          </span>
        </div>
      </div>
    </div>
  )
}