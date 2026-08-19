'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, ChevronUp, Activity, Eye, Heart, MessageCircle, Share2, Video, TrendingUp } from 'lucide-react'
import type { Evaluation } from '@/types'
import { AccountHealthSection } from '@/components/sections/AccountHealthSection'
import { ContentCadenceSection } from '@/components/sections/ContentCadenceSection'
import { EngagementQualitySection } from '@/components/sections/EngagementQualitySection'
import { PeerBenchmarkSection } from '@/components/sections/PeerBenchmarkSection'
import { formatNumber } from '@/lib/format'
import { useI18n } from '@/lib/i18n/context'

interface DeepAnalysisSectionProps {
  result: Evaluation
}

export function DeepAnalysisSection({ result }: DeepAnalysisSectionProps) {
  const { dict } = useI18n()
  const [showDeepAnalysis, setShowDeepAnalysis] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState(0)

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(showDeepAnalysis ? contentRef.current.scrollHeight : 0)
    }
  }, [showDeepAnalysis, result])

  return (
    <div>
      <button
        onClick={() => setShowDeepAnalysis(!showDeepAnalysis)}
        className="w-full flex items-center justify-between rounded-2xl border border-neutral-800 bg-[#0f0f0f] p-4 hover:border-neutral-700 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
            {showDeepAnalysis ? dict.evaluation.deepAnalysis.collapseDeepAnalysis : dict.evaluation.deepAnalysis.expandDeepAnalysis}
          </span>
          {!showDeepAnalysis && (
            <span className="text-xs text-neutral-600 ml-2">{dict.evaluation.deepAnalysis.subtitle}</span>
          )}
        </div>
        {showDeepAnalysis ? (
          <ChevronUp className="h-5 w-5 text-neutral-500" />
        ) : (
          <ChevronDown className="h-5 w-5 text-neutral-500" />
        )}
      </button>

      <div
        className="overflow-hidden transition-all duration-500 ease-in-out"
        style={{
          maxHeight: contentHeight,
          opacity: showDeepAnalysis ? 1 : 0,
        }}
      >
        <div ref={contentRef} className="pt-6 space-y-6">
          {/* Key Metrics Grid（创作者友好：无工程术语，每卡带 ? 解释） */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-4">{dict.evaluation.deepAnalysis.keyMetrics}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <MetricCard icon={<Activity className="h-5 w-5" />} label={dict.evaluation.deepAnalysis.engagementRate} hint={dict.evaluation.deepAnalysis.hintEngagementRate} value={`${result.metrics.engagementRate.toFixed(2)}%`} />
              <MetricCard icon={<Eye className="h-5 w-5" />} label={dict.evaluation.deepAnalysis.avgPlays} hint={dict.evaluation.deepAnalysis.hintAvgPlays} value={formatNumber(result.metrics.avgPlays)} />
              <MetricCard icon={<Heart className="h-5 w-5" />} label={dict.evaluation.deepAnalysis.avgLikes} hint={dict.evaluation.deepAnalysis.hintAvgLikes} value={formatNumber(result.metrics.avgLikes)} />
              <MetricCard icon={<MessageCircle className="h-5 w-5" />} label={dict.evaluation.deepAnalysis.avgComments} hint={dict.evaluation.deepAnalysis.hintAvgComments} value={formatNumber(result.metrics.avgComments)} />
              <MetricCard icon={<Share2 className="h-5 w-5" />} label={dict.evaluation.deepAnalysis.avgShares} hint={dict.evaluation.deepAnalysis.hintAvgShares} value={formatNumber(result.metrics.avgShares)} />
              <MetricCard icon={<Video className="h-5 w-5" />} label={dict.evaluation.deepAnalysis.videosPublished} hint={dict.evaluation.deepAnalysis.hintVideosPublished} value={formatNumber(result.videoCount)} />
              <MetricCard icon={<TrendingUp className="h-5 w-5" />} label={dict.evaluation.deepAnalysis.playGrowth} hint={dict.evaluation.deepAnalysis.hintPlayGrowth} value={`${result.metrics.playGrowth > 0 ? '+' : ''}${result.metrics.playGrowth.toFixed(2)}%`} highlight={result.metrics.playGrowth > 0 ? 'positive' : result.metrics.playGrowth < -15 ? 'negative' : undefined} />
              <MetricCard icon={<Activity className="h-5 w-5" />} label={dict.evaluation.deepAnalysis.playStability} hint={dict.evaluation.deepAnalysis.hintPlayStability} value={
                result.metrics.cvPlays > 0.5 ? dict.evaluation.deepAnalysis.stabilityVolatile
                  : result.metrics.cvPlays > 0.3 ? dict.evaluation.deepAnalysis.stabilityModerate
                    : dict.evaluation.deepAnalysis.stabilitySteady
              } highlight={result.metrics.cvPlays > 0.5 ? 'negative' : 'positive'} />
            </div>
          </div>

          {/* Trend & Top Post */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-neutral-800 bg-[#0f0f0f] p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-4">{dict.evaluation.deepAnalysis.recentTrends}</h3>
              <div className="space-y-4">
                <TrendRow label={dict.evaluation.deepAnalysis.last15Days} value={formatNumber(result.metrics.recentMedianPlays)} />
                <TrendRow label={dict.evaluation.deepAnalysis.previous15Days} value={formatNumber(result.metrics.olderMedianPlays)} />
                <TrendRow label={dict.evaluation.deepAnalysis.daysSinceLastPost} value={`${result.metrics.daysSinceLastPost} days`} />
                <div className="pt-2 border-t border-neutral-800">
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-400">{dict.evaluation.deepAnalysis.trend}</span>
                    <span className={result.metrics.playGrowth > 0 ? 'text-green-400' : result.metrics.playGrowth < -15 ? 'text-red-400' : 'text-amber-400'}>
                      {result.metrics.playGrowth > 0 ? dict.evaluation.deepAnalysis.rising : result.metrics.playGrowth < -15 ? dict.evaluation.deepAnalysis.declining : dict.evaluation.deepAnalysis.stable}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-[#0f0f0f] p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-4">{dict.evaluation.deepAnalysis.bestPerformingVideo}</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-400">{dict.evaluation.deepAnalysis.topPostPlays}</span>
                  <span className="font-semibold">{formatNumber(result.metrics.topPostPlays)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-400">{dict.evaluation.deepAnalysis.topPostLikes}</span>
                  <span className="font-semibold">{formatNumber(result.metrics.topPostLikes)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-400">{dict.evaluation.deepAnalysis.topVideoVsFollowers}</span>
                  <span className="font-semibold">{result.followerCount ? (result.metrics.topPostPlays / result.followerCount).toFixed(2) : '0'}x</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-400">{dict.evaluation.deepAnalysis.avgLikesPerVideo}</span>
                  <span className="font-semibold">{formatNumber(result.metrics.likesPerVideo)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Analysis Sections */}
          <AccountHealthSection health={result.accountHealth} />
          <ContentCadenceSection cadence={result.contentCadence} />
          <EngagementQualitySection quality={result.engagementQuality} />
          <PeerBenchmarkSection benchmark={result.peerBenchmark} />
        </div>
      </div>
    </div>
  )
}

function MetricCard({ icon, label, value, highlight, hint }: { icon: React.ReactNode; label: string; value: string; highlight?: 'positive' | 'negative'; hint?: string }) {
  const colorClass = highlight === 'positive' ? 'text-green-400' : highlight === 'negative' ? 'text-red-400' : 'text-white'
  return (
    <div className="rounded-2xl border border-neutral-800 bg-[#0f0f0f] p-4">
      <div className="mb-2 flex items-start justify-between text-neutral-500">
        {icon}
        {hint && (
          <span className="group relative inline-flex">
            <span className="flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-neutral-600 text-[9px] font-bold text-neutral-400 group-hover:border-[#00F2EA] group-hover:text-[#00F2EA]">?</span>
            <span className="pointer-events-none absolute right-0 top-6 z-20 w-52 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-[11px] font-normal leading-relaxed text-neutral-300 opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
              {hint}
            </span>
          </span>
        )}
      </div>
      <div className={`text-xl font-bold tabular-nums ${colorClass}`}>{value}</div>
      <div className="text-xs text-neutral-500 mt-1">{label}</div>
    </div>
  )
}

function TrendRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-neutral-400">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  )
}
