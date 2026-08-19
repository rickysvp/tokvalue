'use client'

import { useState, useRef, useEffect, useCallback, Suspense } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { Evaluation } from '@/types'
import { getUtm } from '@/lib/utm'
import { ScoreGauge } from '@/components/ScoreGauge'
import { Search, Loader2, History, Download, TrendingUp, Shield, DollarSign, BadgeCheck, MapPin, Tag, Clock, UserCheck, BookmarkPlus, BookOpen, FileText, Image as ImageIcon, ChevronDown, CheckCircle2, Mail, Zap, Share2, BarChart3 } from 'lucide-react'
import html2canvas from 'html2canvas'
import { MonetizationChecklist } from '@/components/sections/MonetizationChecklist'
import { PaidWallModal } from '@/components/PaidWallModal'
import { EvaluatingModal, type EvaluatingStatus } from '@/components/EvaluatingModal'
import { CommercialSnapshotTab } from '@/components/report/CommercialSnapshotTab'
import { DealPricingTab } from '@/components/report/DealPricingTab'
import { ThirtyDayPlanTab } from '@/components/report/ThirtyDayPlanTab'
import { DetailedAnalysisTab } from '@/components/report/DetailedAnalysisTab'
import { LockedTabPreview } from '@/components/report/LockedTabPreview'
import { TeaserReport } from '@/components/report/TeaserReport'
import { SiteFooter } from '@/components/SiteFooter'
import { ReportTabs } from '@/components/ReportTabs'
import { FreeBanner } from '@/components/FreeBanner'
import { UnlockFooter } from '@/components/UnlockFooter'
import { DemoConversionBar } from '@/components/DemoConversionBar'
import { saveToTracker, getTrackedByUsername } from '@/lib/tracker'
import { downloadPdf } from '@/lib/export-pdf'
import { formatNumber } from '@/lib/format'
import { useToast, ToastContainer } from '@/components/Toast'
import type { CreditBalance } from '@/lib/credits'
import type { EnDict } from '@/lib/i18n/dictionaries/en'
import { useI18n, t } from '@/lib/i18n'
import { getActiveEmail, setActiveEmail, fetchBalance, getSessionToken, claimCreditsApi, setSessionToken, promotePendingToken } from '@/lib/credits-client'
import { VerifyEmailModal } from '@/components/VerifyEmailModal'
import { ShareModal } from '@/components/ShareModal'
import { UserMenu } from '@/components/UserMenu'
import { ReferralCta } from '@/components/ReferralCta'
import { ShareCardModal } from '@/components/ShareCardModal'
import { RatingPrompt } from '@/components/RatingPrompt'
import { DEMO_RESULT } from '@/lib/demo-data'
import type { TabId } from '@/components/ReportTabs'

function trackEvent(event_type: string, metadata?: Record<string, unknown>) {
  const utm = getUtm()
  const body = JSON.stringify({
    event_type,
    path: typeof window !== 'undefined' ? window.location.pathname : '/',
    metadata: { ...(metadata || {}), ...(utm ? { utm } : {}) },
    referrer: typeof window !== 'undefined' ? (document.referrer || '') : '',
  })
  fetch('/api/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(err => {
    console.warn(`[analytics] trackEvent ${event_type} failed:`, err)
    try { navigator.sendBeacon('/api/track', body) } catch {}
  })
}

export function EvaluatePage({ username }: { username: string }) {
  return (
    <Suspense fallback={<EvaluatePageLoading />}>
      <EvaluatePageContent initialUsername={username} />
    </Suspense>
  )
}

function EvaluatePageLoading() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-[#FF0050]" />
    </main>
  )
}

function EvaluatePageContent({ initialUsername }: { initialUsername: string }) {
  const { dict } = useI18n()
  const [username, setUsername] = useState(initialUsername)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Evaluation | null>(null)
  const [error, setError] = useState('')
  const reportRef = useRef<HTMLDivElement>(null)
  const [isSaved, setIsSaved] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  const { toast, toasts, dismiss } = useToast()
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [needPurchase, setNeedPurchase] = useState(false)
  const pendingUsername = useRef<string | null>(null)
  const [isPremium, setIsPremium] = useState(false)
  const [, setIsUnlocking] = useState(false)
  const [paymentSuccess, setPaymentSuccess] = useState(false)
  const [showVerifyModal, setShowVerifyModal] = useState(false)
  // 免费评估邮箱验证弹窗（401 NEED_VERIFY 触发，独立实例避免与购买流程互相干扰）
  const [freeVerifyOpen, setFreeVerifyOpen] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [showShareCardModal, setShowShareCardModal] = useState(false)
  const [showPaidWallModal, setShowPaidWallModal] = useState(false)
  const [paidWallMode, setPaidWallMode] = useState<'evaluate' | 'unlock'>('evaluate')
  const [evaluatingModal, setEvaluatingModal] = useState<{
    open: boolean; status: EvaluatingStatus; errorMessage?: string
  }>({ open: false, status: 'evaluating' })
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabId>('snapshot')

  const searchParams = useSearchParams()
  const router = useRouter()
  const paidHandled = useRef(false)
  const evaluatedRef = useRef(false)
  const evaluatingRef = useRef(false)

  // Load credit balance on mount
  useEffect(() => {
    const email = getActiveEmail()
    const token = getSessionToken()
    if (email && token) {
      setBalanceLoading(true)
      // 登录态仅在服务端验证 token 有效（= 邮箱已验证）后才置位
      fetchBalance(email).then(b => { if (b) { setCreditBalance(b); setIsLoggedIn(true); } }).finally(() => setBalanceLoading(false))
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    }
  }, [])

  // Auto-dismiss payment success banner
  useEffect(() => {
    if (paymentSuccess) {
      const t = setTimeout(() => setPaymentSuccess(false), 3000)
      return () => clearTimeout(t)
    }
  }, [paymentSuccess])

  // Close export menu on click-outside or Escape
  useEffect(() => {
    if (!showExportMenu) return
    function handleClick(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowExportMenu(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [showExportMenu])

  // Track paywall_view
  useEffect(() => {
    if (needPurchase) {
      trackEvent('paywall_view', { username: pendingUsername.current || username })
    }
  }, [needPurchase, username])

  // PMF 埋点：Brand Deal Toolkit 付费墙曝光（区分新定位转化）
  const paywallViewTrackedRef = useRef(false)
  useEffect(() => {
    if (showPaidWallModal && !paywallViewTrackedRef.current) {
      paywallViewTrackedRef.current = true
      trackEvent('paywall_viewed', {
        username: result?.username || pendingUsername.current || username,
        mode: paidWallMode,
      })
    }
    if (!showPaidWallModal) paywallViewTrackedRef.current = false
  }, [showPaidWallModal, paidWallMode, result, username])

  // PMF 埋点：免费 Commercial Snapshot 就绪（含宽报价区间曝光）
  const snapshotTrackedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!result?.commercialSnapshot || snapshotTrackedRef.current === result.username) return
    snapshotTrackedRef.current = result.username
    // Teaser 快照仅含 readinessBand/dataConfidence/primaryRateBlocker，其余字段可选
    const rateRange = result.commercialSnapshot.suggestedRateRange
    trackEvent('commercial_snapshot_ready', {
      username: result.username,
      readinessBand: result.commercialSnapshot.readinessBand,
      readinessScore: result.commercialSnapshot.readinessScore,
      tier: result.tier,
      isPremium,
      // suggested_rate_viewed：快照首屏即含宽报价区间，合并记录避免重复请求
      ...(rateRange ? { suggestedRate: [rateRange.low, rateRange.high] } : {}),
    })
  }, [result, isPremium])

  // B3 埋点：Teaser 报告曝光（免费态每个 username 一次）
  const teaserViewedRef = useRef<string | null>(null)
  useEffect(() => {
    if (isPremium || !result?.username) return
    if (teaserViewedRef.current === result.username) return
    teaserViewedRef.current = result.username
    trackEvent('teaser_viewed', { username: result.username, tier: result.tier })
  }, [result, isPremium])

  // Check if current result is already tracked
  useEffect(() => {
    if (result) {
      const tracked = getTrackedByUsername(result.username)
      setIsSaved(!!tracked)
    }
  }, [result])

  function handleSaveToTracker() {
    if (!result) return
    saveToTracker(result)
    setIsSaved(true)
  }

  async function handleExportPdf() {
    if (!result || !reportRef.current) return
    setShowExportMenu(false)
    try {
      await downloadPdf(result, reportRef.current)
    } catch (err) {
      console.error('[export-pdf] failed:', err)
      toast(dict.toast.pdfExportFailed + (err instanceof Error ? err.message : String(err)))
    }
  }

  function handleShareLink() {
    if (!result) return
    setShowExportMenu(false)
    setShowShareModal(true)
  }

  const handleEvaluate = useCallback(async (name?: string) => {
    // Re-entrancy guard: prevent concurrent evaluations (double-submit / double-deduct)
    if (evaluatingRef.current) return
    evaluatingRef.current = true

    try {
      const target = (name ?? username).trim()
      if (!target) return

      // @demo special case — show full report as product demo
      if (target === '@demo' || target === 'demo') {
        setResult(DEMO_RESULT)
        setIsPremium(true)
        setError('')
        setLoading(false)
        setIsLoading(false)
        return
      }

      const token = getSessionToken()
      if (!token) {
        // Free mode — call API directly (no auth required)
        pendingUsername.current = target
        setLoading(true)
        setError('')
        setResult(null)
        setNeedPurchase(false)
        setIsLoading(false)
        setEvaluatingModal({ open: true, status: 'evaluating' })

        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 45000)

          const res = await fetch('/api/evaluate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: target, ...(getUtm() ? { utm: getUtm() } : {}) }),
            signal: controller.signal,
          })
          clearTimeout(timeoutId)

          const data = await res.json()
          if (!res.ok) {
            if (res.status === 401) {
              // 后端要求邮箱验证（NEED_VERIFY）：关掉评估进度弹窗，转免费邮箱验证
              setEvaluatingModal(prev => ({ ...prev, open: false }))
              setFreeVerifyOpen(true)
            } else if (res.status === 402) {
              // 免费额度用完（FREE_LIMIT_EXHAUSTED）→ 与登录态 402 同待遇：转付费墙
              setEvaluatingModal(prev => ({ ...prev, status: 'completing' }))
              setPaidWallMode('evaluate')
              setNeedPurchase(true)
              setShowPaidWallModal(true)
            } else {
              setEvaluatingModal(prev => ({ ...prev, status: 'error', errorMessage: data.error || dict.errors.evaluationFailed }))
              setError(data.error || dict.errors.evaluationFailed)
            }
          } else {
            setEvaluatingModal(prev => ({ ...prev, status: 'completing' }))
            setResult(data)
            setIsPremium(!data.isFree)
          }
        } catch (err) {
          const errMsg = err instanceof DOMException && err.name === 'AbortError'
            ? dict.errors.requestTimeout : dict.errors.networkError
          setEvaluatingModal(prev => ({ ...prev, status: 'error', errorMessage: errMsg }))
          setError(errMsg)
        } finally {
          setLoading(false)
          setIsLoading(false)
        }
        return
      }

      setLoading(true)
      setError('')
      setResult(null)
      setNeedPurchase(false)
      pendingUsername.current = target
      setEvaluatingModal({ open: true, status: 'evaluating' })

      trackEvent('search', { username: target })

      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 45000)

        const res = await fetch('/api/evaluate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ username: target, ...(getUtm() ? { utm: getUtm() } : {}) }),
          signal: controller.signal,
        })
        clearTimeout(timeoutId)

        const data = await res.json()
        if (!res.ok) {
          if (res.status === 401) {
            // token 失效（NEED_VERIFY）：清理本地会话，转免费邮箱验证重新换取 token
            setSessionToken(null)
            setIsLoggedIn(false)
            setCreditBalance(null)
            setEvaluatingModal(prev => ({ ...prev, open: false }))
            setFreeVerifyOpen(true)
          } else if (res.status === 402) {
            // 额度不足（NO_CREDITS / 免费额度用完 FREE_LIMIT_EXHAUSTED）→ 转付费墙
            setEvaluatingModal(prev => ({ ...prev, status: 'completing' }))
            setPaidWallMode('evaluate')
            setNeedPurchase(true)
            setShowPaidWallModal(true)
          } else if (res.status === 429 && data.code === 'FREE_RATE_LIMIT') {
            setEvaluatingModal(prev => ({ ...prev, status: 'error', errorMessage: data.error || 'Daily free limit reached' }))
            setError(data.error || 'Daily free limit reached')
          } else {
            setEvaluatingModal(prev => ({
              ...prev,
              status: 'error',
              errorMessage: data.error || dict.errors.evaluationFailed,
            }))
            setError(data.error || dict.errors.evaluationFailed)
          }
        } else {
          setEvaluatingModal(prev => ({ ...prev, status: 'completing' }))
          setResult(data)
          // Detect freemium mode from API response
          setIsPremium(!data.isFree)
        }
      } catch (err) {
        const errMsg = err instanceof DOMException && err.name === 'AbortError'
          ? dict.errors.requestTimeout : dict.errors.networkError
        setEvaluatingModal(prev => ({ ...prev, status: 'error', errorMessage: errMsg }))
        setError(errMsg)
      } finally {
        setLoading(false)
        setIsLoading(false)
      }
    } finally {
      evaluatingRef.current = false
    }
  }, [username, dict.errors.networkError, dict.errors.requestTimeout, dict.errors.evaluationFailed])

  // 免费评估邮箱验证成功（VerifyEmailModal mode='free' 的 onUnlock 回调）：
  // 验证通过已换得会话 token，用 pendingUsername 自动重新触发评估（走正常带 token 流程）。
  // 此前那次评估早已结束（防重入 guard 已复位），重评不会被 guard 挡住。
  const handleFreeVerified = useCallback(() => {
    setFreeVerifyOpen(false)
    // 验证已通过，token 已由服务端签发 → 置登录态（tracker/history 可显示）
    setIsLoggedIn(true)
    const target = pendingUsername.current
    if (target) handleEvaluate(target)
  }, [handleEvaluate])

  // 解锁内容区锚点（解锁成功后平滑滚动至此，避免直接跳到底部）
  const tabsRef = useRef<HTMLDivElement | null>(null)

  // Handle unlock
  async function handleUnlock() {
    if (!result) return
    const token = getSessionToken()
    if (!token) {
      // Not logged in — redirect to auth flow via PaidWall
      setPaidWallMode('unlock')
      setShowPaidWallModal(true)
      return
    }
    setIsUnlocking(true)
    trackEvent('upgrade_click', { username: result.username })
    try {
      // Call upgrade endpoint to enrich free evaluation with AI
      const res = await fetch('/api/evaluate/upgrade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username: result.username }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 402) {
          setNeedPurchase(true)
          setPaidWallMode('unlock')
          setShowPaidWallModal(true)
        } else if (res.status === 404) {
          // 无 Teaser 报告可升级（快照过期/从未免费评估）→ 带 token 发起新完整付费 Review
          toast('Starting your full review…')
          handleEvaluate(result.username)
        } else {
          toast(data.error || dict.errors.evaluationFailed)
        }
        return
      }
      // Refresh with full result
      setResult(data)
      setIsPremium(true)
      setIsLoggedIn(true)
      toast('Report unlocked! 🎉')
      setCreditBalance(prev => prev ? { ...prev, credits: Math.max(0, prev.credits - 1) } : null)
      trackEvent('unlock_completed', { username: result.username })
      // 平滑滚动至解锁内容区顶部（报告 tabs），下一帧等 full 渲染挂载
      requestAnimationFrame(() => {
        tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    } catch {
      toast(dict.errors.networkError)
    } finally {
      setIsUnlocking(false)
    }
  }


  const handleEvaluatingComplete = useCallback(() => {
    setEvaluatingModal({ open: false, status: 'evaluating' })
  }, [])

  // Handle ?paid=success callback
  useEffect(() => {
    const paid = searchParams.get('paid')
    const paidEmail = searchParams.get('email')
    if (paid === 'success' && paidEmail && !paidHandled.current) {
      paidHandled.current = true
      setActiveEmail(paidEmail)
      promotePendingToken()
      setIsLoggedIn(true)
      setPaymentSuccess(true)

      const tryClaim = async () => {
        if (!mountedRef.current) return
        const result = await claimCreditsApi()
        if (!mountedRef.current) return
        if (result && result.claimed) {
          setCreditBalance({
            email: paidEmail,
            credits: result.credits,
            totalPurchased: result.credits,
            purchases: [],
            verifiedAt: Date.now(),
          })
          return
        }
        let attempts = 0
        const maxAttempts = 15
        const poll = async () => {
          if (!mountedRef.current) return
          const b = await fetchBalance(paidEmail)
          if (!mountedRef.current) return
          if (b && b.credits > 0) {
            setCreditBalance(b)
            return
          }
          attempts++
          if (attempts < maxAttempts) {
            pollTimerRef.current = setTimeout(poll, 2000)
          }
        }
        poll()
      }
      tryClaim()
      router.replace(`/evaluate/${username}`)
      return
    }
  }, [searchParams, router, username])

  // Auto-evaluate on mount
  useEffect(() => {
    if (evaluatedRef.current) return
    evaluatedRef.current = true
    handleEvaluate(initialUsername)
  }, [handleEvaluate, initialUsername])

  async function handleExportPng() {
    if (!reportRef.current || !result) return
    setShowExportMenu(false)
    try {
      const reportEl = reportRef.current
      const canvas = await html2canvas(reportEl, {
        backgroundColor: '#0a0a0a',
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        windowWidth: reportEl.scrollWidth,
        windowHeight: reportEl.scrollHeight,
        scrollX: 0,
        scrollY: 0,
        onclone: (clonedDoc) => {
          const stickyHeaders = clonedDoc.querySelectorAll('[class*="sticky"]')
          stickyHeaders.forEach((el) => {
            (el as HTMLElement).style.position = 'relative'
          })
        },
      })
      const link = document.createElement('a')
      link.download = `tokvalue-${result.username}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (err) {
      console.error('[export-png] failed:', err)
      toast(dict.toast.pngExportFailed + (err instanceof Error ? err.message : String(err)))
    }
  }

  // Loading state — use EvaluatingModal for consistent UX
  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#0a0a0a]">
        <EvaluateTopBar
          dict={dict}
          creditBalance={creditBalance}
          balanceLoading={balanceLoading}
          paymentSuccess={paymentSuccess}
          onVerifyClick={() => { /* no-op during loading */ }}
          onLogout={() => {}}
        />
        <EvaluatingModal
          open={true}
          username={initialUsername}
          status="evaluating"
          onComplete={() => {}}
          labels={{
            title: dict.evaluation.evaluating.title,
            subtitle: dict.evaluation.evaluating.subtitle,
            stages: [dict.evaluation.evaluating.stages.fetch, dict.evaluation.evaluating.stages.analyze, dict.evaluation.evaluating.stages.score, dict.evaluation.evaluating.stages.value, dict.evaluation.evaluating.stages.report] as [string, string, string, string, string],
            completing: dict.evaluation.evaluating.completing,
            error: dict.evaluation.evaluating.error,
          }}
        />
        <SiteFooter />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] pb-20">
      {/* TopBar */}
      <EvaluateTopBar
        dict={dict}
        creditBalance={creditBalance}
        balanceLoading={balanceLoading}
        paymentSuccess={paymentSuccess}
        onVerifyClick={() => { /* no-op */ }}
        onLogout={() => { setCreditBalance(null); setActiveEmail(null); setSessionToken(null); setIsLoggedIn(false) }}
      />

      {/* Search bar (re-evaluate) */}
      <section className="border-b border-neutral-800 bg-[#0a0a0a]">
        <div className="mx-auto max-w-3xl px-4 py-6">
          <form onSubmit={(e) => { e.preventDefault(); handleEvaluate() }} className="flex items-center gap-2">
            <div className="flex-1 flex items-center rounded-xl border border-neutral-700 bg-neutral-900/80 px-4 py-2.5 focus-within:border-[#FF0050] transition-colors">
              <span className="text-neutral-500 mr-2">@</span>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter tiktok handle"
                autoComplete="off"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-600"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-[#FF0050] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#d60043] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {loading ? dict.common.analyzing : dict.common.evaluate}
            </button>
          </form>
          {error && (
            <div className="mt-3 rounded-xl border border-red-900/40 bg-red-950/20 p-3 text-center text-sm text-red-100">
              {error}
            </div>
          )}
        </div>
      </section>

      {/* Report */}
      {result && (
        <section className="mx-auto max-w-5xl px-4 py-10">
          <div ref={reportRef} className="rounded-3xl border border-neutral-800 bg-[#141414] p-6 sm:p-10">
            {/* Account Header */}
            <div className="flex items-start gap-5 mb-8 pb-6 border-b border-neutral-800">
              {result.avatar ? (
                <Image src={result.avatar} alt={result.nickname} width={64} height={64} className="h-14 w-14 sm:h-16 sm:w-16 rounded-full border-2 border-neutral-700 shrink-0 object-cover" />
              ) : (
                <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-full bg-neutral-800 flex items-center justify-center text-xl font-bold shrink-0">
                  {result.nickname.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-xl sm:text-2xl font-bold">{result.nickname}</h2>
                  {result.verified && (
                    <BadgeCheck className="h-5 w-5 text-[#00F2EA] shrink-0" />
                  )}
                  {result.mock && (
                    <span className="inline-block rounded-full border border-red-700/60 bg-red-950/40 px-2.5 py-0.5 text-xs font-semibold text-red-400">
                      {dict.common.mockData} — sample only
                    </span>
                  )}
                </div>
                <p className="text-sm text-neutral-500">@{result.username}</p>
                {result.bio && (
                  <p className="text-sm text-neutral-400 mt-1 line-clamp-1">{result.bio}</p>
                )}
                <div className="flex items-center gap-4 mt-2 text-sm flex-wrap">
                  <span><span className="font-semibold tabular-nums">{formatNumber(result.followerCount)}</span> <span className="text-neutral-500">{dict.common.followers}</span></span>
                  <span><span className="font-semibold tabular-nums">{formatNumber(result.followingCount)}</span> <span className="text-neutral-500">{dict.common.following}</span></span>
                  <span><span className="font-semibold tabular-nums">{formatNumber(result.totalLikes)}</span> <span className="text-neutral-500">{dict.common.totalLikes}</span></span>
                  <span><span className="font-semibold tabular-nums">{result.videoCount}</span> <span className="text-neutral-500">{dict.common.videos}</span></span>
                  {result.region && (
                    <span className="inline-flex items-center gap-1 text-neutral-500">
                      <MapPin className="h-3 w-3" />
                      {result.region}
                    </span>
                  )}
                </div>
                {result.accountProfile && (
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {result.accountProfile.categories.map((cat, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-full border border-[#00F2EA]/30 bg-[#00F2EA]/10 px-2 py-0.5 text-xs text-[#00F2EA]">
                        <Tag className="h-3 w-3" />
                        {cat}
                      </span>
                    ))}
                    <span className="inline-flex items-center gap-1 rounded-full border border-neutral-700 bg-neutral-800/50 px-2 py-0.5 text-xs text-neutral-400">
                      <UserCheck className="h-3 w-3" />
                      {result.accountProfile.personaType}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-neutral-700 bg-neutral-800/50 px-2 py-0.5 text-xs text-neutral-400">
                      <Clock className="h-3 w-3" />
                      {result.accountProfile.postingRhythm}
                    </span>
                  </div>
                )}
              </div>
              <div data-pdf="score-gauge"><ScoreGauge score={result.score} tier={result.tier} size={100} showLabel /></div>
            </div>

            {/* Tab Navigation — PMF 决策页顺序 */}
            <div ref={tabsRef} className="scroll-mt-24">
              <ReportTabs active={activeTab} onChange={setActiveTab} isPremium={isPremium} />
            </div>

            {/* Free tier badge */}
            {!isPremium && result && (
              <FreeBanner tier={result.tier} onUnlock={() => { setPaidWallMode('unlock'); setShowPaidWallModal(true) }} />
            )}

            {/* ═══ SNAPSHOT TAB（免费 Teaser / 付费完整快照）═══ */}
            {activeTab === 'snapshot' && (<>
              {isPremium ? (
                <CommercialSnapshotTab
                  result={result}
                  isPremium={isPremium}
                  onUnlock={() => { setPaidWallMode('unlock'); setShowPaidWallModal(true) }}
                />
              ) : (
                <TeaserReport
                  result={result}
                  onUnlock={() => { setPaidWallMode('unlock'); setShowPaidWallModal(true) }}
                />
              )}
              {/* 变现门槛检查（平台资格事实，免费可见） */}
              <MonetizationChecklist
                followerCount={result.followerCount}
                videoCount={result.videoCount}
                region={result.region}
                isUnlocked={true}
                hasHighRisk={result.riskFlags?.some(r => r.level === 'high')}
              />
            </>)}

            {/* ═══ PRICE YOUR NEXT DEAL TAB（付费）═══ */}
            {activeTab === 'deal' && (
              isPremium
                ? <DealPricingTab result={result} />
                : <LockedTabPreview kind="pricing" icon={DollarSign} onUnlock={() => { setPaidWallMode('unlock'); setShowPaidWallModal(true) }} />
            )}

            {/* ═══ 30-DAY PLAN TAB（付费）═══ */}
            {activeTab === 'plan' && (
              isPremium
                ? <ThirtyDayPlanTab result={result} />
                : <LockedTabPreview kind="plan" icon={TrendingUp} onUnlock={() => { setPaidWallMode('unlock'); setShowPaidWallModal(true) }} />
            )}

            {/* ═══ DETAILED ANALYSIS TAB（付费二级内容）═══ */}
            {activeTab === 'analysis' && (
              isPremium
                ? <DetailedAnalysisTab result={result} />
                : <LockedTabPreview kind="analysis" icon={BarChart3} onUnlock={() => { setPaidWallMode('unlock'); setShowPaidWallModal(true) }} />
            )}

            {/* Footer */}
            <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-neutral-600 pt-4 border-t border-neutral-800">
              <span>{dict.common.evaluatedAt} {new Date(result.computedAt).toLocaleString('en-US')}</span>
              <span>{t('© {year} TokValue. {disclaimer}', { year: new Date().getFullYear(), disclaimer: dict.common.dataDisclaimer })}</span>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
            {/* Share Card — available to everyone (free-tier data, viral image) */}
            <button
              onClick={() => setShowShareCardModal(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-purple-500/40 bg-purple-950/20 px-5 py-2.5 text-sm font-medium text-purple-300 hover:border-purple-400 hover:text-purple-200 transition-colors"
            >
              <Share2 className="h-4 w-4" />
              {dict.evaluation.shareCard}
            </button>

            {/* Export Dropdown */}
            <div className="relative" ref={exportMenuRef}>
              <button
                onClick={() => { if (!isPremium) return; setShowExportMenu(!showExportMenu) }}
                aria-expanded={showExportMenu}
                aria-haspopup="menu"
                aria-controls="export-menu"
                title={!isPremium ? 'Unlock to export' : undefined}
                className={`inline-flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-medium transition-colors ${!isPremium ? 'border-neutral-800 bg-neutral-900/50 text-neutral-600 cursor-not-allowed' : 'border-neutral-700 bg-neutral-900 hover:border-[#00F2EA] hover:text-[#00F2EA]'}`}
              >
                <Download className="h-4 w-4" />
                {dict.evaluation.exportReport}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
              </button>
              {showExportMenu && (
                <div id="export-menu" role="menu" className="absolute bottom-full mb-2 left-0 rounded-xl border border-neutral-700 bg-[#141414] shadow-xl shadow-black/50 overflow-hidden min-w-[160px]">
                  <button onClick={handleExportPng} role="menuitem" className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-300 hover:bg-neutral-800 transition-colors">
                    <ImageIcon className="h-4 w-4 text-[#FF0050]" />
                    {dict.evaluation.exportPng}
                  </button>
                  <button onClick={handleExportPdf} role="menuitem" className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-300 hover:bg-neutral-800 transition-colors border-t border-neutral-800">
                    <FileText className="h-4 w-4 text-[#00F2EA]" />
                    {dict.evaluation.exportPdf}
                  </button>
                  <button onClick={handleShareLink} role="menuitem" className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-300 hover:bg-neutral-800 transition-colors border-t border-neutral-800">
                    <Share2 className="h-4 w-4 text-purple-400" />
                    {dict.evaluation.shareLink}
                  </button>
                </div>
              )}
            </div>
            {isLoggedIn && (
              <>
                <button onClick={handleSaveToTracker} disabled={isSaved} className={`inline-flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-medium transition-colors ${isSaved ? 'border-green-900/50 bg-green-950/20 text-green-400 cursor-default' : 'border-neutral-700 bg-neutral-900 hover:border-[#FF0050] hover:text-[#FF0050]'}`}>
                  <BookmarkPlus className="h-4 w-4" />
                  {isSaved ? dict.evaluation.savedToTracker : dict.evaluation.saveToTracker}
                </button>
                <Link href="/history" className="inline-flex items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900 px-5 py-2.5 text-sm font-medium hover:border-[#FF0050] hover:text-[#FF0050] transition-colors">
                  <History className="h-4 w-4" />
                  {dict.nav.history}
                </Link>
              </>
            )}
          </div>

          {/* Free tier upgrade footer */}
          {!isPremium && result && (
            <UnlockFooter onUnlock={() => { setPaidWallMode('unlock'); setShowPaidWallModal(true) }} />
          )}
        </section>
      )}

      {result && (
        <RatingPrompt username={result.username} />
      )}

      <SiteFooter />
      <ToastContainer toasts={toasts} dismiss={dismiss} />

      {/* Mobile sticky unlock bar */}
      {!isPremium && result && (
        <div className="block sm:hidden">
          <UnlockFooter sticky onUnlock={() => { setPaidWallMode('unlock'); setShowPaidWallModal(true) }} />
        </div>
      )}

      {/* Demo conversion bar — mock report can't be paid for, route to real evaluation */}
      {result && result.mock && (
        <>
          <DemoConversionBar />
          {/* spacer so the fixed bar doesn't cover the footer */}
          <div className="h-28 sm:h-24" />
        </>
      )}
      <VerifyEmailModal
        isOpen={showVerifyModal}
        onClose={() => setShowVerifyModal(false)}
        onUnlock={handleUnlock}
        existingBalance={creditBalance}
        mode="evaluate"
      />
      {/* 免费评估邮箱验证（401 NEED_VERIFY 触发）：验证成功后自动重评 */}
      <VerifyEmailModal
        isOpen={freeVerifyOpen}
        onClose={() => setFreeVerifyOpen(false)}
        onUnlock={handleFreeVerified}
        mode="free"
      />
      {result && (
        <ShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          username={result.username}
        />
      )}
      {result && (
        <ShareCardModal
          isOpen={showShareCardModal}
          onClose={() => setShowShareCardModal(false)}
          result={result}
        />
      )}
      <PaidWallModal
        open={showPaidWallModal}
        username={pendingUsername.current || username}
        mode={paidWallMode}
        onClose={() => { setShowPaidWallModal(false); setNeedPurchase(false) }}
        onUnlock={handleUnlock}
      />
      <EvaluatingModal
        open={evaluatingModal.open}
        username={pendingUsername.current || username}
        status={evaluatingModal.status}
        errorMessage={evaluatingModal.errorMessage}
        onComplete={handleEvaluatingComplete}
        labels={{
          title: dict.evaluation.evaluating.title,
          subtitle: dict.evaluation.evaluating.subtitle,
          stages: [dict.evaluation.evaluating.stages.fetch, dict.evaluation.evaluating.stages.analyze, dict.evaluation.evaluating.stages.score, dict.evaluation.evaluating.stages.value, dict.evaluation.evaluating.stages.report] as [string, string, string, string, string],
          completing: dict.evaluation.evaluating.completing,
          error: dict.evaluation.evaluating.error,
        }}
      />
    </main>
  )
}

function EvaluateTopBar({ dict, creditBalance, balanceLoading, paymentSuccess, onVerifyClick, onLogout }: {
  dict: EnDict
  creditBalance: CreditBalance | null
  balanceLoading: boolean
  paymentSuccess: boolean
  onVerifyClick: () => void
  onLogout: () => void
}) {
  return (
    <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-xl">
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#00F2EA]/40 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-b from-transparent to-[#00F2EA]/[0.03] pointer-events-none" />
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center gap-4">
        {/* Logo + Back */}
        <Link href="/" className="group shrink-0 flex items-center gap-2">
          <span className="text-neutral-500 group-hover:text-white transition-colors">←</span>
          <Image src="/tokvalue.png" alt="TokValue" width={140} height={36} className="h-9 w-auto object-contain" />
        </Link>

        {/* Navigation */}
        <nav className="hidden md:flex items-center justify-center gap-1 flex-1">
          {[
            { label: dict.nav.blog, href: '/blog', icon: BookOpen },
          ].map(item => (
            <Link
              key={item.label}
              href={item.href}
              className="group relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium text-neutral-400 hover:text-white transition-colors"
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
              <span className="absolute inset-x-2 -bottom-0.5 h-px bg-gradient-to-r from-transparent via-[#00F2EA]/60 to-transparent scale-x-0 group-hover:scale-x-100 transition-transform" />
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center justify-end gap-2 min-w-0 w-[160px] sm:w-auto">
          <ReferralCta />
          {paymentSuccess && (
            <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-[11px] font-medium text-green-300 animate-fade-in-up">
              <CheckCircle2 className="h-3 w-3" />
              {dict.nav.creditsAdded}
            </div>
          )}
          {balanceLoading && !creditBalance ? (
            <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="hidden sm:inline">{dict.nav.loadingCredits}</span>
            </div>
          ) : creditBalance ? (
            <>
              <div className="group relative">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-[#00F2EA]/40 to-[#FF0050]/30 rounded-full blur-sm opacity-60 group-hover:opacity-100 transition-opacity" />
                <div className="relative flex items-center gap-1.5 rounded-full border border-[#00F2EA]/40 bg-[#0a0a0a] px-3 py-1">
                  <Zap className="h-3 w-3 text-[#00F2EA]" fill="#00F2EA" />
                  <span className="text-xs font-bold text-[#00F2EA] tabular-nums">{creditBalance.credits}</span>
                  <span className="text-[10px] text-neutral-500">{dict.common.evaluations}</span>
                </div>
              </div>
              <div className="hidden sm:block">
                <UserMenu email={creditBalance.email} onSwitchAccount={onLogout} />
              </div>
            </>
          ) : (
            <button onClick={onVerifyClick} className="group relative overflow-hidden rounded-full bg-gradient-to-r from-[#FF0050] to-[#ff2d6a] px-4 py-1.5 text-xs font-semibold text-white shadow-lg shadow-[#FF0050]/20 hover:shadow-xl hover:shadow-[#FF0050]/30 transition-all">
              <span className="relative z-10 flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                {dict.nav.verifyEmail}
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
