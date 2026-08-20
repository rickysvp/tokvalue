'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Evaluation } from '@/types'
import { ScoreGauge } from '@/components/ScoreGauge'
import {
  Radar,
  RadarChart as ReRadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts'
import {
  Loader2, TrendingUp, DollarSign, ExternalLink, Share2, Check, Copy,
  Target, Zap, Award, Users, Heart, Video, BarChart3, ArrowRight,
  Sparkles, Trophy, Flame, ShoppingBag, Gift, Info, X,
  MapPin, UserCheck, BadgeCheck, Tag, Clock, Globe, Film,
  Lock, Shield,
} from 'lucide-react'

// ── Helpers ──

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(Math.round(n))
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${Math.round(n).toLocaleString()}`
}

function fmtUsdRange(low: number, high: number): string {
  return `${fmtUsd(low)} – ${fmtUsd(high)}`
}

// ── Tier mapping (Spec §7.2): S/A → Premium, B/C → Growth, D/E → Developing, F → Early ──

function getValueTier(tier: string) {
  if (tier === 'S' || tier === 'A') {
    return {
      label: 'Premium Value',
      desc: 'Exceptional commercial potential',
      color: '#FF0050',
      bgColor: 'rgba(255, 0, 80, 0.1)',
      borderColor: 'rgba(255, 0, 80, 0.3)',
      icon: Trophy,
    }
  }
  if (tier === 'B' || tier === 'C') {
    return {
      label: 'Growth Value',
      desc: 'Strong monetization trajectory',
      color: '#00F2EA',
      bgColor: 'rgba(0, 242, 234, 0.1)',
      borderColor: 'rgba(0, 242, 234, 0.3)',
      icon: TrendingUp,
    }
  }
  if (tier === 'D' || tier === 'E') {
    return {
      label: 'Developing Value',
      desc: 'Solid foundation with upside',
      color: '#f97316',
      bgColor: 'rgba(249, 115, 22, 0.1)',
      borderColor: 'rgba(249, 115, 22, 0.3)',
      icon: Sparkles,
    }
  }
  return {
    label: 'Early Value',
    desc: 'Early-stage account building its foundation',
    color: '#ffffff',
    bgColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.3)',
    icon: Sparkles,
  }
}

const DIMENSION_LABELS: { key: string; label: string; desc: string }[] = [
  { key: 'reach', label: 'Reach', desc: 'How many people your content can touch. Driven by follower count, average plays, and algorithmic distribution reach.' },
  { key: 'engagement', label: 'Engagement', desc: 'How actively your audience interacts. Measures like-to-comment ratios, share rates, and save behavior relative to peers.' },
  { key: 'content', label: 'Content Virality', desc: 'How often your posts break out beyond your follower base. Weighted by the share of high-play videos in your recent catalog.' },
  { key: 'authenticity', label: 'Authenticity', desc: 'How genuine your audience looks. Evaluates follower growth velocity, engagement consistency, and signals of fake followers or bots.' },
  { key: 'momentum', label: 'Momentum', desc: 'Are you trending up or cooling down? Compares recent-period growth against your historical baseline.' },
  { key: 'stability', label: 'Stability', desc: 'How predictable your performance is. Low variance in plays and engagement over time scores higher — brands love consistency.' },
  { key: 'commerce', label: 'Commerce Fit', desc: 'How well your niche matches buyer-ready audiences. Considers category, audience demographics, and purchase-intent signals.' },
  { key: 'monetization', label: 'Monetization', desc: 'Current earning power across brand deals, creator rewards, TikTok Shop, live gifts, and subscriptions — benchmarked to your tier.' },
  { key: 'health', label: 'Health', desc: 'Overall account standing. Factors in posting cadence, community guideline risk, shadowban signals, and content freshness.' },
  { key: 'influence', label: 'Influence', desc: 'Your authority within your niche. Weighted by verified status, follower-to-engagement ratio, and cross-platform recognition.' },
]

const INCOME_ICONS: Record<string, typeof DollarSign> = {
  brand_deals: ShoppingBag,
  creator_program: Award,
  subscriptions: Users,
  tiktok_shop: ShoppingBag,
  live_gifts: Gift,
}

// ── Component ──

export default function SharePage() {
  const params = useParams()
  const id = params.id as string
  const [result, setResult] = useState<Evaluation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [showStickyCta, setShowStickyCta] = useState(false)
  const [showDimensionInfo, setShowDimensionInfo] = useState(false)
  const [showSummaryBanner, setShowSummaryBanner] = useState(false)

  useEffect(() => {
    fetch(`/api/share?id=${id}`)
      .then(res => {
        if (!res.ok) throw new Error('Share not found')
        return res.json()
      })
      .then((data: Evaluation) => setResult(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    function handleScroll() {
      setShowStickyCta(window.scrollY > 400)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Show summary banner unless dismissed (localStorage)
  useEffect(() => {
    try {
      const dismissed = localStorage.getItem('share-summary-banner-dismissed')
      if (!dismissed) setShowSummaryBanner(true)
    } catch {
      setShowSummaryBanner(true)
    }
  }, [])

  const dismissBanner = () => {
    setShowSummaryBanner(false)
    try { localStorage.setItem('share-summary-banner-dismissed', '1') } catch {}
  }

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-[#00F2EA] animate-spin" />
      </div>
    )
  }

  if (error || !result) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center gap-4 px-4">
        <div className="text-6xl">🔍</div>
        <h1 className="text-2xl font-bold text-white">Share Not Found</h1>
        <p className="text-neutral-400 text-center max-w-md">
          This share link may have expired or is invalid. Share links are valid for 30 days.
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#00F2EA] px-6 py-3 text-sm font-semibold text-black hover:bg-[#00d4cc] transition-colors"
        >
          Evaluate Your Account
          <ExternalLink className="h-4 w-4" />
        </Link>
      </div>
    )
  }

  // Defensive check: ensure critical fields exist to prevent render crashes
  if (!result.dimensions || !result.summary || !result.businessValue || !result.incomeEstimate) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center gap-4 px-4">
        <div className="text-6xl">⚠️</div>
        <h1 className="text-2xl font-bold text-white">Report Data Incomplete</h1>
        <p className="text-neutral-400 text-center max-w-md">
          This share link&apos;s data is incomplete. Please evaluate the account again to generate a full report.
        </p>
        <Link
          href={`/evaluate/${encodeURIComponent(result.username || '')}`}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#00F2EA] px-6 py-3 text-sm font-semibold text-black hover:bg-[#00d4cc] transition-colors"
        >
          Evaluate This Account
          <ExternalLink className="h-4 w-4" />
        </Link>
      </div>
    )
  }

  const valueTier = getValueTier(result.tier)
  const TierIcon = valueTier.icon
  const { businessValue } = result

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* ── Top Bar ── */}
      <header className="border-b border-neutral-800 bg-[#0a0a0a]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/tokvalue.png"
              alt="TokValue"
              width={100}
              height={22}
              className="h-7 w-auto object-contain"
              priority
            />
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:border-[#00F2EA] hover:text-[#00F2EA] transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy Link'}
            </button>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#00F2EA] px-4 py-1.5 text-xs font-semibold text-black hover:bg-[#00d4cc] transition-colors"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Evaluate Yours
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 sm:py-8">
        {/* ═══════════════════════════════════════
            HERO — Shareable Card
        ═══════════════════════════════════════ */}
        <div className="relative rounded-3xl overflow-hidden mb-6">
          {/* Glow background */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#00F2EA]/10 via-[#0a0a0a] to-[#FF0050]/10" />
          <div className="absolute top-0 left-1/4 w-72 h-72 bg-[#00F2EA]/5 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-72 h-72 bg-[#FF0050]/5 rounded-full blur-3xl" />

          <div className="relative p-6 sm:p-8">
            {/* Top badge: Shared Report */}
            <div className="flex items-center justify-between mb-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#00F2EA]/20 bg-[#00F2EA]/5 text-[#00F2EA] text-xs font-medium">
                <Share2 className="h-3 w-3" />
                Shared Report
              </div>
              <div
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"
                style={{ backgroundColor: valueTier.bgColor, color: valueTier.color, border: `1px solid ${valueTier.borderColor}` }}
              >
                <TierIcon className="h-3.5 w-3.5" />
                {valueTier.label}
              </div>
            </div>

            {/* Account info + ScoreGauge (与首页评估报告样式保持一致) */}
            <div className="flex items-start gap-4 mb-5">
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-4">
                  {result.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={result.avatar} alt={result.nickname} className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-neutral-700 shrink-0" />
                  ) : (
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-neutral-800 flex items-center justify-center text-2xl font-bold text-neutral-400 shrink-0">
                      {result.nickname.charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h1 className="text-xl sm:text-2xl font-bold text-white">{result.nickname}</h1>
                      {result.verified && <span className="text-[#00F2EA] text-base">✓</span>}
                      {result.region && (
                        <span className="inline-flex items-center gap-1 text-xs text-neutral-400">
                          <MapPin className="h-3 w-3" /> {result.region}
                        </span>
                      )}
                    </div>
                    <p className="text-neutral-400 text-sm">@{result.username}</p>
                    {result.bio && (
                      <p className="text-neutral-300 text-sm mt-1.5 line-clamp-2">{result.bio}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-sm text-neutral-300 flex-wrap">
                      <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5 text-neutral-500" /> {fmt(result.followerCount)} followers</span>
                      <span className="flex items-center gap-1"><UserCheck className="h-3.5 w-3.5 text-neutral-500" /> {fmt(result.followingCount)} following</span>
                      <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5 text-neutral-500" /> {fmt(result.totalLikes)} likes</span>
                      <span className="flex items-center gap-1"><Video className="h-3.5 w-3.5 text-neutral-500" /> {result.videoCount} videos</span>
                    </div>
                  </div>
                </div>
              </div>
              {/* Right: ScoreGauge 大圆圈 (与首页评估报告一致) */}
              <div className="shrink-0 hidden sm:block">
                <ScoreGauge score={result.score} tier={result.tier} size={120} showLabel />
              </div>
            </div>

            {/* Mobile: ScoreGauge 居中显示 */}
            <div className="sm:hidden flex justify-center mb-5">
              <ScoreGauge score={result.score} tier={result.tier} size={100} showLabel />
            </div>

            {/* Account Profile tags — personaType / categories / postingRhythm / contentStyle / audienceRegion */}
            {result.accountProfile && (
              <div className="flex flex-wrap gap-1.5 mb-5">
                {result.accountProfile.personaType && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-[#00F2EA]/10 text-[#00F2EA] border border-[#00F2EA]/20 font-medium">
                    <BadgeCheck className="h-3 w-3" /> {result.accountProfile.personaType}
                  </span>
                )}
                {result.accountProfile.categories?.map((cat, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-neutral-800 text-neutral-300 border border-neutral-700">
                    <Tag className="h-3 w-3" /> {cat}
                  </span>
                ))}
                {result.accountProfile.contentStyle && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-[#FF0050]/10 text-[#FF0050] border border-[#FF0050]/20 font-medium">
                    <Film className="h-3 w-3" /> {result.accountProfile.contentStyle}
                  </span>
                )}
                {result.accountProfile.postingRhythm && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-neutral-800 text-neutral-300 border border-neutral-700">
                    <Clock className="h-3 w-3" /> {result.accountProfile.postingRhythm}
                  </span>
                )}
                {result.accountProfile.audienceRegion && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-neutral-800 text-neutral-300 border border-neutral-700">
                    <Globe className="h-3 w-3" /> {result.accountProfile.audienceRegion}
                  </span>
                )}
              </div>
            )}

            {/* Value display */}
            <div className="rounded-2xl border border-neutral-800 bg-[#0a0a0a]/60 backdrop-blur-sm p-6 mb-4">
              <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Estimated Account Value</p>
              <div className="text-4xl sm:text-5xl font-extrabold bg-gradient-to-r from-[#00F2EA] to-[#FF0050] bg-clip-text text-transparent mb-4">
                {fmtUsdRange(businessValue.totalValue.low, businessValue.totalValue.high)}
              </div>
              {result.peerRanking && (
                <div className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold bg-[#FF0050]/10 text-[#FF0050] border border-[#FF0050]/30">
                  <Flame className="h-3.5 w-3.5" />
                  Top {100 - result.peerRanking.overallPercentile}% in {result.peerRanking.tierLabel || 'category'}
                </div>
              )}
            </div>

            {/* Watermark */}
            <p className="text-xs text-neutral-600 text-right">
              Powered by{' '}
              <Link href="/" className="text-[#00F2EA] hover:underline font-medium">TokValue.com</Link>
            </p>
          </div>
        </div>

        {/* ═══ Summary Banner (top notice) ═══ */}
        {showSummaryBanner && result && (
          <div className="mb-6 rounded-xl border border-[#00F2EA]/30 bg-[#00F2EA]/5 p-3 sm:p-4 flex items-center gap-3">
            <Info className="h-5 w-5 text-[#00F2EA] shrink-0" />
            <p className="flex-1 text-sm text-neutral-300">
              This is a <span className="text-[#00F2EA] font-semibold">shared summary</span>. The full report contains{' '}
              <span className="text-white font-semibold">10 modules</span> — you&apos;re viewing{' '}
              <span className="text-white font-semibold">4</span>.
            </p>
            <Link
              href={`/evaluate/${encodeURIComponent(result.username)}`}
              className="hidden sm:inline-flex items-center gap-1 text-sm font-semibold text-[#00F2EA] hover:underline whitespace-nowrap"
            >
              View full report <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <button
              onClick={dismissBanner}
              className="shrink-0 p-1 rounded hover:bg-[#00F2EA]/10 text-neutral-500 hover:text-neutral-300"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ═══ What's in the full report? — Module Checklist ═══ */}
        {result && (
          <div className="mb-6 rounded-2xl border border-neutral-800 bg-[#0f0f0f] p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base sm:text-lg font-bold text-white">What&apos;s in the full report?</h2>
              <span className="text-xs text-neutral-500">4 visible · 6 locked</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5 mb-5">
              {/* 1. Income Breakdown — visible */}
              <div className="flex items-center gap-2.5">
                <span className="shrink-0 w-5 h-5 rounded-full bg-[#22c55e]/20 flex items-center justify-center">
                  <Check className="h-3 w-3 text-[#22c55e]" />
                </span>
                <DollarSign className="h-3.5 w-3.5 text-neutral-500 shrink-0" />
                <span className="text-sm text-neutral-300">5-Channel Income Breakdown</span>
              </div>
              {/* 2. Revenue Roadmap — locked */}
              <div className="flex items-center gap-2.5">
                <span className="shrink-0 w-5 h-5 rounded-full bg-neutral-800 flex items-center justify-center">
                  <Lock className="h-2.5 w-2.5 text-neutral-500" />
                </span>
                <TrendingUp className="h-3.5 w-3.5 text-neutral-600 shrink-0" />
                <span className="text-sm text-neutral-500">12-Month Revenue Roadmap</span>
              </div>
              {/* 3. Growth Plan — partial */}
              <div className="flex items-center gap-2.5">
                <span className="shrink-0 w-5 h-5 rounded-full bg-[#f59e0b]/20 flex items-center justify-center">
                  <span className="text-[10px] text-[#f59e0b] font-bold">½</span>
                </span>
                <Zap className="h-3.5 w-3.5 text-neutral-500 shrink-0" />
                <span className="text-sm text-neutral-300">Growth Action Plan <span className="text-xs text-neutral-500">(partial)</span></span>
              </div>
              {/* 4. Risk Scan — locked */}
              <div className="flex items-center gap-2.5">
                <span className="shrink-0 w-5 h-5 rounded-full bg-neutral-800 flex items-center justify-center">
                  <Lock className="h-2.5 w-2.5 text-neutral-500" />
                </span>
                <Shield className="h-3.5 w-3.5 text-neutral-600 shrink-0" />
                <span className="text-sm text-neutral-500">10-Dimension Risk Scan</span>
              </div>
              {/* 5. Peer Ranking — partial */}
              <div className="flex items-center gap-2.5">
                <span className="shrink-0 w-5 h-5 rounded-full bg-[#f59e0b]/20 flex items-center justify-center">
                  <span className="text-[10px] text-[#f59e0b] font-bold">½</span>
                </span>
                <BarChart3 className="h-3.5 w-3.5 text-neutral-500 shrink-0" />
                <span className="text-sm text-neutral-300">Peer Percentile Ranking <span className="text-xs text-neutral-500">(partial)</span></span>
              </div>
              {/* 6. Brand Matching — partial */}
              <div className="flex items-center gap-2.5">
                <span className="shrink-0 w-5 h-5 rounded-full bg-[#f59e0b]/20 flex items-center justify-center">
                  <span className="text-[10px] text-[#f59e0b] font-bold">½</span>
                </span>
                <Award className="h-3.5 w-3.5 text-neutral-500 shrink-0" />
                <span className="text-sm text-neutral-300">Brand Matching <span className="text-xs text-neutral-500">(partial)</span></span>
              </div>
              {/* 7. Content Strategy — locked */}
              <div className="flex items-center gap-2.5">
                <span className="shrink-0 w-5 h-5 rounded-full bg-neutral-800 flex items-center justify-center">
                  <Lock className="h-2.5 w-2.5 text-neutral-500" />
                </span>
                <Target className="h-3.5 w-3.5 text-neutral-600 shrink-0" />
                <span className="text-sm text-neutral-500">Content Strategy Guide</span>
              </div>
              {/* 8. Trend Analysis — locked */}
              <div className="flex items-center gap-2.5">
                <span className="shrink-0 w-5 h-5 rounded-full bg-neutral-800 flex items-center justify-center">
                  <Lock className="h-2.5 w-2.5 text-neutral-500" />
                </span>
                <Flame className="h-3.5 w-3.5 text-neutral-600 shrink-0" />
                <span className="text-sm text-neutral-500">Trend Analysis</span>
              </div>
              {/* 9. Monetization Paths — locked */}
              <div className="flex items-center gap-2.5">
                <span className="shrink-0 w-5 h-5 rounded-full bg-neutral-800 flex items-center justify-center">
                  <Lock className="h-2.5 w-2.5 text-neutral-500" />
                </span>
                <ShoppingBag className="h-3.5 w-3.5 text-neutral-600 shrink-0" />
                <span className="text-sm text-neutral-500">Monetization Paths</span>
              </div>
              {/* 10. Deep Analysis — locked */}
              <div className="flex items-center gap-2.5">
                <span className="shrink-0 w-5 h-5 rounded-full bg-neutral-800 flex items-center justify-center">
                  <Lock className="h-2.5 w-2.5 text-neutral-500" />
                </span>
                <Sparkles className="h-3.5 w-3.5 text-neutral-600 shrink-0" />
                <span className="text-sm text-neutral-500">Deep Analysis</span>
              </div>
            </div>
            {/* Dual CTA */}
            <div className="flex flex-col sm:flex-row gap-2.5">
              <Link
                href="/"
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-[#00F2EA]/30 bg-[#00F2EA]/10 text-[#00F2EA] text-sm font-semibold hover:bg-[#00F2EA]/15 transition-colors"
              >
                Evaluate Your Account <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href={`/evaluate/${encodeURIComponent(result.username)}`}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#FF0050] to-[#00F2EA] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                View This Account&apos;s Full Report <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════
            Business Value Breakdown
        ═══════════════════════════════════════ */}
        <section className="mb-6">
          <SectionHeader icon={DollarSign} title="Value Breakdown" color="#00F2EA" />
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {businessValue.components.map((comp, i) => {
              const colors = ['#FF0050', '#00F2EA', '#f59e0b', '#22c55e', '#a855f7']
              return (
                <div key={i} className="rounded-xl border border-neutral-800 bg-[#0f0f0f] p-4 hover:border-[#00F2EA]/20 transition-colors">
                  <div className="text-xs text-neutral-500 mb-2 leading-tight">{comp.label}</div>
                  <div className="text-sm font-bold text-white mb-2">
                    {fmtUsd(comp.amount.low)}–{fmtUsd(comp.amount.high)}
                  </div>
                  <div className="h-1.5 rounded-full bg-neutral-800 overflow-hidden mb-1">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${comp.percentage}%`, backgroundColor: colors[i] || colors[0] }}
                    />
                  </div>
                  <div className="text-[10px] text-neutral-600">{Math.round(comp.percentage)}%</div>
                </div>
              )
            })}
          </div>
        </section>

        {/* ═══════════════════════════════════════
            10-Dimension Scores — Radar Shape
        ═══════════════════════════════════════ */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg"
                style={{ backgroundColor: '#FF005015', border: '1px solid #FF005030' }}
              >
                <Target className="h-4 w-4" style={{ color: '#FF0050' }} />
              </div>
              <h2 className="text-base font-bold text-white">10-Dimension Assessment</h2>
            </div>
            <button
              onClick={() => setShowDimensionInfo(true)}
              className="inline-flex items-center gap-1 text-xs font-medium text-neutral-400 hover:text-[#00F2EA] transition-colors"
              aria-label="What do these dimensions mean?"
            >
              <Info className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">What does this mean?</span>
            </button>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-[#0f0f0f] p-5 sm:p-6">
            {/* Radar Chart */}
            <div className="relative w-full h-[360px] sm:h-[420px]" role="img" aria-label="10-dimension radar chart">
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 bg-[#FF0050]/5 rounded-full blur-3xl" />
              </div>
              <ResponsiveContainer width="100%" height="100%">
                <ReRadarChart
                  data={DIMENSION_LABELS.map(({ key, label }) => ({
                    dimension: label,
                    score: Math.round(result.dimensions[key as keyof typeof result.dimensions] ?? 0),
                    fullMark: 100,
                  }))}
                  outerRadius="62%"
                >
                  <PolarGrid stroke="#27272a" strokeWidth={0.5} />
                  <PolarAngleAxis
                    dataKey="dimension"
                    tick={(props: unknown) => {
                      const p = props as { x: number; y: number; cx: number; cy: number; payload: { value?: string }; index: number }
                      const x = Number(p.x)
                      const y = Number(p.y)
                      const cx = Number(p.cx)
                      const cy = Number(p.cy)
                      const idx = p.index
                      const score = Math.round(result.dimensions[DIMENSION_LABELS[idx].key as keyof typeof result.dimensions] ?? 0)
                      const color = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444'
                      const nearCenterX = x >= cx - 2 && x <= cx + 2
                      const nearCenterY = y >= cy - 2 && y <= cy + 2
                      return (
                        <g>
                          <text
                            x={x}
                            y={y}
                            textAnchor={nearCenterX ? 'middle' : x > cx ? 'start' : 'end'}
                            dominantBaseline={nearCenterY ? 'middle' : y > cy ? 'hanging' : 'auto'}
                            fill="#a3a3a3"
                            fontSize={11}
                            fontWeight={600}
                          >
                            {p.payload?.value}
                          </text>
                          <text
                            x={x}
                            y={y + (y > cy ? 14 : -14)}
                            textAnchor={nearCenterX ? 'middle' : x > cx ? 'start' : 'end'}
                            dominantBaseline={y > cy ? 'hanging' : 'auto'}
                            fill={color}
                            fontSize={12}
                            fontWeight={700}
                          >
                            {score}
                          </text>
                        </g>
                      )
                    }}
                  />
                  <PolarRadiusAxis
                    angle={90}
                    domain={[0, 100]}
                    tick={false}
                    axisLine={false}
                  />
                  <Radar
                    name="Score"
                    dataKey="score"
                    stroke="#FF0050"
                    fill="#FF0050"
                    fillOpacity={0.2}
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#00F2EA', stroke: '#FF0050', strokeWidth: 1.5 }}
                    activeDot={{ r: 5, fill: '#00F2EA', stroke: '#0a0a0a', strokeWidth: 2 }}
                  />
                </ReRadarChart>
              </ResponsiveContainer>
            </div>

            {/* 形状解读：强项 vs 短板 */}
            <div className="grid grid-cols-2 gap-3 mt-5 pt-5 border-t border-neutral-800">
              {(() => {
                const entries = DIMENSION_LABELS.map(({ key, label }) => ({
                  label,
                  score: result.dimensions[key as keyof typeof result.dimensions] ?? 0,
                })).sort((a, b) => b.score - a.score)
                const top = entries.slice(0, 3)
                const bottom = entries.slice(-3).reverse()
                return (
                  <>
                    <div>
                      <p className="text-xs font-semibold text-green-400 mb-2 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> Core Strengths
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {top.map((e, i) => (
                          <span key={i} className="text-xs px-2 py-1 rounded-md bg-green-500/10 text-green-400 border border-green-500/20">
                            {e.label}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-amber-400 mb-2 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Growth Areas
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {bottom.map((e, i) => (
                          <span key={i} className="text-xs px-2 py-1 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            {e.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </>
                )
              })()}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════
            Assessment Conclusion
        ═══════════════════════════════════════ */}
        <section className="mb-6">
          <SectionHeader icon={TrendingUp} title="Assessment Conclusion" color="#00F2EA" />
          <div className="rounded-2xl border border-neutral-800 bg-[#0f0f0f] p-5 sm:p-6">
            <h3 className="text-lg font-bold text-white mb-5">{result.summary.headline}</h3>

            <div className="grid sm:grid-cols-2 gap-6 mb-5">
              <div>
                <h4 className="text-sm font-semibold text-green-400 mb-3 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> Strengths
                </h4>
                <ul className="space-y-2">
                  {result.summary.strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-neutral-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 mt-1.5 shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-amber-400 mb-3 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Weaknesses
                </h4>
                <ul className="space-y-2">
                  {result.summary.weaknesses.map((w, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-neutral-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-gradient-to-r from-[#00F2EA]/10 to-[#FF0050]/10 border border-[#00F2EA]/20">
              <p className="text-sm font-semibold text-white">{result.verdict}</p>
              <p className="text-sm text-neutral-300 mt-1">{result.advice}</p>
            </div>
          </div>
        </section>

        {/* ═══ Soft CTA #2 ═══ */}
        <div className="flex items-center justify-center gap-2 py-3 mb-6">
          <p className="text-sm text-neutral-500">How does <span className="text-[#FF0050] font-medium">your account</span> compare?</p>
          <Link href="/" className="inline-flex items-center gap-1 text-sm font-semibold text-[#00F2EA] hover:underline whitespace-nowrap">
            Get your report <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* ═══════════════════════════════════════
            Income & Growth
        ═══════════════════════════════════════ */}
        <section className="mb-6">
          <SectionHeader icon={DollarSign} title="Income Estimate" color="#22c55e" />
          <div className="rounded-2xl border border-neutral-800 bg-[#0f0f0f] p-5 sm:p-6">
            <div className="flex items-baseline gap-2 mb-5">
              <span className="text-3xl sm:text-4xl font-bold text-white">
                {fmtUsdRange(result.incomeEstimate.monthlyTotal.low, result.incomeEstimate.monthlyTotal.high)}
              </span>
              <span className="text-sm text-neutral-500">/ month</span>
            </div>

            <div className="space-y-4">
              {result.incomeEstimate.breakdown.map((src, i) => {
                const Icon = INCOME_ICONS[src.source] || DollarSign
                const barColor = src.confidence === 'high' ? '#22c55e' : src.confidence === 'medium' ? '#f59e0b' : '#525252'
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <span className="flex items-center gap-2 text-neutral-300">
                        <Icon className="h-3.5 w-3.5 text-neutral-500" />
                        {src.label}
                      </span>
                      <span className="text-white font-semibold">{fmtUsdRange(src.monthlyAmount.low, src.monthlyAmount.high)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-neutral-800 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${src.percentage}%`, backgroundColor: barColor }} />
                    </div>
                  </div>
                )
              })}
            </div>

            <p className="text-xs text-neutral-600 mt-4 leading-relaxed">
              Based on {result.incomeEstimate.categoryLabel} category CPM of ${result.incomeEstimate.categoryCpm.toFixed(2)} and {result.incomeEstimate.regionLabel} market multiplier.
            </p>
          </div>
        </section>

        {/* ═══════════════════════════════════════
            Growth Plan
        ═══════════════════════════════════════ */}
        {result.growthPlan?.items?.length > 0 && (
          <section className="mb-6">
            <SectionHeader icon={Zap} title="Growth Action Plan" color="#f59e0b" />
            <div className="space-y-3">
              {result.growthPlan.items.slice(0, 4).map((item, i) => (
                <div key={i} className="rounded-xl border border-neutral-800 bg-[#0f0f0f] p-4 flex items-start gap-3">
                  <div className={`shrink-0 mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    item.priority === 'high' ? 'bg-red-500/20 text-red-400' :
                    item.priority === 'medium' ? 'bg-amber-500/20 text-amber-400' :
                    'bg-neutral-700 text-neutral-400'
                  }`}>
                    {item.priority}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{item.area}</p>
                    <p className="text-sm text-neutral-400 mt-0.5">{item.action}</p>
                    <p className="text-xs text-[#00F2EA] mt-1">{item.expectedImpact}</p>
                  </div>
                </div>
              ))}
              {result.growthPlan.items.length > 4 && (
                <Link
                  href={`/evaluate/${encodeURIComponent(result.username)}`}
                  className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-neutral-700 text-xs text-neutral-500 hover:text-[#00F2EA] hover:border-[#00F2EA]/30 transition-colors"
                >
                  +{result.growthPlan.items.length - 4} more actions in full report <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </div>
          </section>
        )}

        {/* ═══════════════════════════════════════
            Brand Matching
        ═══════════════════════════════════════ */}
        {result.brandMatching?.matches?.length > 0 && (
          <section className="mb-6">
            <SectionHeader icon={Award} title="Brand Match" color="#a855f7" />
            <div className="grid sm:grid-cols-2 gap-3">
              {result.brandMatching.matches.slice(0, 4).map((match, i) => (
                <div key={i} className="rounded-xl border border-neutral-800 bg-[#0f0f0f] p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-white">{match.category}</span>
                    <span className="text-xs font-bold text-[#a855f7]">{match.fitScore}%</span>
                  </div>
                  <p className="text-xs text-neutral-500 mb-2">{match.collaborationType}</p>
                  <div className="flex flex-wrap gap-1">
                    {match.exampleBrands.slice(0, 3).map((brand, j) => (
                      <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">{brand}</span>
                    ))}
                  </div>
                  <div className="text-xs text-neutral-400 mt-2">
                    Est. {fmtUsdRange(match.estimatedDealRange.low, match.estimatedDealRange.high)} per deal
                  </div>
                </div>
              ))}
              {result.brandMatching.matches.length > 4 && (
                <Link
                  href={`/evaluate/${encodeURIComponent(result.username)}`}
                  className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-neutral-700 text-xs text-neutral-500 hover:text-[#00F2EA] hover:border-[#00F2EA]/30 transition-colors sm:col-span-2"
                >
                  +{result.brandMatching.matches.length - 4} more matches in full report <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </div>
          </section>
        )}

        {/* ═══════════════════════════════════════
            Peer Ranking
        ═══════════════════════════════════════ */}
        {result.peerRanking && (
          <section className="mb-6">
            <SectionHeader icon={BarChart3} title="Peer Ranking" color="#00F2EA" />
            <div className="rounded-2xl border border-neutral-800 bg-[#0f0f0f] p-5 sm:p-6">
              <div className="flex items-center gap-4 mb-5">
                <div className="shrink-0 w-20 h-20 rounded-full border-4 border-[#00F2EA]/30 flex items-center justify-center">
                  <span className="text-2xl font-bold text-[#00F2EA]">{result.peerRanking.overallPercentile}%</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{result.peerRanking.tierLabel}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">{result.peerRanking.peerGroupDescription}</p>
                </div>
              </div>

              {result.peerRanking.rankingBreakdown?.length > 0 && (
                <div className="space-y-2.5">
                  {result.peerRanking.rankingBreakdown.slice(0, 5).map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs text-neutral-400 w-24 shrink-0">{item.metric}</span>
                      <div className="flex-1 h-2 rounded-full bg-neutral-800 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${item.percentile}%`, backgroundColor: item.barColor || '#00F2EA' }}
                        />
                      </div>
                      <span className="text-xs text-white font-medium w-16 text-right">{item.value}</span>
                    </div>
                  ))}
                  {result.peerRanking.rankingBreakdown.length > 5 && (
                    <Link
                      href={`/evaluate/${encodeURIComponent(result.username)}`}
                      className="flex items-center justify-center gap-1.5 mt-2 py-2 rounded-lg border border-dashed border-neutral-700 text-xs text-neutral-500 hover:text-[#00F2EA] hover:border-[#00F2EA]/30 transition-colors"
                    >
                      +{result.peerRanking.rankingBreakdown.length - 5} more metrics in full report <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              )}

              {result.peerRanking.insight && (
                <p className="text-xs text-neutral-500 mt-4 leading-relaxed border-t border-neutral-800 pt-3">
                  {result.peerRanking.insight}
                </p>
              )}
            </div>
          </section>
        )}

        {/* ═══ Soft CTA #3 ═══ */}
        <div className="flex items-center justify-center gap-2 py-3 mb-6">
          <p className="text-sm text-neutral-500">Ready to monetize your account?</p>
          <Link href="/" className="inline-flex items-center gap-1 text-sm font-semibold text-[#00F2EA] hover:underline whitespace-nowrap">
            Get your full report <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* ═══════════════════════════════════════
            Locked Modules — 6 premium sections not shown in share view
        ═══════════════════════════════════════ */}
        {result && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Lock className="h-4 w-4 text-neutral-500" />
              <h2 className="text-base sm:text-lg font-bold text-white">Available in the full report</h2>
              <span className="text-xs text-neutral-500">6 more modules</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { icon: Shield, title: 'Risk Scan', desc: '10-dimension risk assessment — shadowban, fake followers, growth anomalies' },
                { icon: TrendingUp, title: '12-Month Revenue Forecast', desc: 'Month-by-month revenue projection with milestones' },
                { icon: Target, title: 'Content Strategy', desc: 'Content pillars, hashtags, optimal posting schedule' },
                { icon: Flame, title: 'Trend Analysis', desc: 'Trending topics, sounds, content predictions' },
                { icon: ShoppingBag, title: 'Monetization Paths', desc: 'Eligible programs, nearest thresholds, action steps' },
                { icon: Sparkles, title: 'Deep Analysis', desc: 'AI-powered in-depth account diagnosis' },
              ].map((mod, i) => {
                const ModIcon = mod.icon
                return (
                  <Link
                    key={i}
                    href={`/evaluate/${encodeURIComponent(result.username)}`}
                    className="group relative rounded-xl border border-dashed border-neutral-700 bg-[#0f0f0f]/50 p-4 hover:border-[#00F2EA]/40 hover:bg-[#0f0f0f] transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 w-9 h-9 rounded-lg bg-neutral-800/50 border border-neutral-700 flex items-center justify-center group-hover:bg-[#00F2EA]/10 group-hover:border-[#00F2EA]/30 transition-colors">
                        <ModIcon className="h-4 w-4 text-neutral-500 group-hover:text-[#00F2EA] transition-colors" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Lock className="h-3 w-3 text-neutral-600" />
                          <h3 className="text-sm font-semibold text-neutral-300 group-hover:text-white transition-colors">{mod.title}</h3>
                        </div>
                        <p className="text-xs text-neutral-500 leading-relaxed">{mod.desc}</p>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-neutral-600 group-hover:text-[#00F2EA] transition-colors shrink-0 mt-1" />
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════
            Final CTA
        ═══════════════════════════════════════ */}
        <div className="relative rounded-3xl overflow-hidden mb-8">
          <div className="absolute inset-0 bg-gradient-to-br from-[#00F2EA]/15 via-[#0f0f0f] to-[#FF0050]/15" />
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#00F2EA]/5 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#FF0050]/5 rounded-full blur-3xl" />

          <div className="relative p-8 sm:p-10 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
              What&apos;s YOUR TikTok Account Worth?
            </h2>
            <p className="text-neutral-400 mb-6 max-w-lg mx-auto">
              Get a full 10-dimension analysis, brand matching, revenue forecast, and growth strategy — in seconds.
            </p>

            {/* Value points */}
            <div className="grid grid-cols-3 gap-4 mb-7 max-w-md mx-auto">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#00F2EA]/10 border border-[#00F2EA]/20 mb-2">
                  <Target className="h-4 w-4 text-[#00F2EA]" />
                </div>
                <p className="text-xs text-neutral-400">10-Dimension<br />Analysis</p>
              </div>
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#FF0050]/10 border border-[#FF0050]/20 mb-2">
                  <DollarSign className="h-4 w-4 text-[#FF0050]" />
                </div>
                <p className="text-xs text-neutral-400">Revenue<br />Forecast</p>
              </div>
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#a855f7]/10 border border-[#a855f7]/20 mb-2">
                  <Zap className="h-4 w-4 text-[#a855f7]" />
                </div>
                <p className="text-xs text-neutral-400">Growth<br />Strategy</p>
              </div>
            </div>

            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#00F2EA] to-[#00d4cc] px-8 py-3.5 text-sm font-bold text-black hover:shadow-lg hover:shadow-[#00F2EA]/20 transition-all"
            >
              <BarChart3 className="h-4 w-4" />
              Evaluate Your Account Now
            </Link>
            <p className="text-xs text-neutral-600 mt-4">
              Powered by <Link href="/" className="text-[#00F2EA] hover:underline font-medium">TokValue.com</Link>
            </p>
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-neutral-800 py-6">
        <div className="max-w-4xl mx-auto px-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/tokvalue.png"
              alt="TokValue"
              width={80}
              height={18}
              className="h-5 w-auto object-contain opacity-60"
            />
          </Link>
          <p className="text-xs text-neutral-600">
            TokValue.com · TikTok Account Value Calculator
          </p>
        </div>
      </footer>

      {/* ── Sticky Side CTA (Desktop) ── */}
      {showStickyCta && (
        <div className="hidden sm:flex fixed bottom-6 right-6 z-40 animate-fade-in">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#00F2EA] to-[#00d4cc] px-5 py-3 text-sm font-bold text-black shadow-lg shadow-[#00F2EA]/20 hover:shadow-xl hover:shadow-[#00F2EA]/30 transition-all"
          >
            <BarChart3 className="h-4 w-4" />
            Evaluate Yours
          </Link>
        </div>
      )}

      {/* ── Dimension Info Modal ── */}
      {showDimensionInfo && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowDimensionInfo(false)}
        >
          <div
            className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-neutral-800 bg-[#0f0f0f] shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between p-5 border-b border-neutral-800 bg-[#0f0f0f]">
              <div className="flex items-center gap-2">
                <div
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg"
                  style={{ backgroundColor: '#FF005015', border: '1px solid #FF005030' }}
                >
                  <Target className="h-4 w-4" style={{ color: '#FF0050' }} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">The 10-Dimension Model</h3>
                  <p className="text-xs text-neutral-500">What each dimension measures</p>
                </div>
              </div>
              <button
                onClick={() => setShowDimensionInfo(false)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-3">
              {DIMENSION_LABELS.map(({ key, label, desc }) => (
                <div
                  key={key}
                  className="flex items-start gap-3 p-3 rounded-xl border border-neutral-800 bg-[#0a0a0a]/50 hover:border-[#00F2EA]/20 transition-colors"
                >
                  <div className="shrink-0 mt-0.5 w-7 h-7 rounded-lg bg-[#FF0050]/10 border border-[#FF0050]/20 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-[#FF0050]">{DIMENSION_LABELS.findIndex(d => d.key === key) + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{label}</p>
                    <p className="text-xs text-neutral-400 mt-1 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 p-4 border-t border-neutral-800 bg-[#0f0f0f]">
              <p className="text-xs text-neutral-500 text-center">
                Each dimension is scored 0–100 and weighted by account tier. The radar shape reveals your account&apos;s true profile — not a single number.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Section Header Component ──

function SectionHeader({ icon: Icon, title, color }: { icon: typeof DollarSign; title: string; color: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div
        className="inline-flex items-center justify-center w-8 h-8 rounded-lg"
        style={{ backgroundColor: `${color}15`, border: `1px solid ${color}30` }}
      >
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <h2 className="text-base font-bold text-white">{title}</h2>
    </div>
  )
}
