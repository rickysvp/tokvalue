'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, Loader2, Lightbulb, Zap, BookOpen, Play, CheckCircle2, Mail, Shield, ArrowRight, BarChart3 } from 'lucide-react'
import { SiteFooter } from '@/components/SiteFooter'
import { useToast, ToastContainer } from '@/components/Toast'
import type { CreditBalance } from '@/lib/credits'

import { useI18n } from '@/lib/i18n'
import { getActiveEmail, setActiveEmail, fetchBalance, getSessionToken, setSessionToken, claimCreditsApi, promotePendingToken } from '@/lib/credits-client'
import { getUtm } from '@/lib/utm'
import { UserMenu } from '@/components/UserMenu'
import { ReferralCta } from '@/components/ReferralCta'
import { VerifyEmailModal } from '@/components/VerifyEmailModal'
import { AvatarWall } from '@/components/AvatarWall'
import { CtaButton } from '@/components/CtaButton'
import { PricingSection, FAQSection, CoreCapabilitiesSection } from '@/components/LandingSections'
import { HowItWorks } from '@/components/HowItWorks'
import { SocialProofBar } from '@/components/SocialProofBar'
import { Testimonials } from '@/components/Testimonials'


export default function HomePage() {
  const { dict } = useI18n()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const { toast, toasts, dismiss } = useToast()
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [paymentSuccess, setPaymentSuccess] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [showVerifyModal, setShowVerifyModal] = useState(false)
  const [verifyModalMode, setVerifyModalMode] = useState<'evaluate' | 'unlock'>('evaluate')
  const [stats, setStats] = useState({ accountsEvaluated: 0, totalValueAssessed: 0, uniqueVisitors: 0, totalFollowers: 0, countriesReached: 0 })
  const inputRef = useRef<HTMLInputElement>(null)
  const mountedRef = useRef(true)

  // Load credit balance on mount
  useEffect(() => {
    const email = getActiveEmail()
    const token = getSessionToken()
    if (email && token) {
      setBalanceLoading(true)
      // 登录态仅在服务端验证 token 有效（= 邮箱已验证）后才置位
      fetchBalance(email).then(b => { if (b) { setCreditBalance(b) } }).finally(() => setBalanceLoading(false))
    }
  }, [])

  // Legacy redirect: ?u=<username> → /evaluate/<username>（兼容旧链接/分享页/历史记录旧卡片）
  // 依赖 searchParams 保证首次挂载 + 客户端路由变化都能捕获；用原生 location.replace 保证特殊字符可靠跳转
  useEffect(() => {
    const u = searchParams.get('u')
    if (!u) return
    const clean = u.trim().replace(/^@/, '')
    if (!clean) return
    window.location.replace(`/evaluate/${encodeURIComponent(clean)}`)
  }, [searchParams])

  // Handle ?paid=success callback（guest checkout 回跳：认领积分并建立登录态）
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('paid') !== 'success') return
    const paidEmail = params.get('email')
    if (!paidEmail) return
    // 清理 URL 参数，避免刷新/分享时重复触发
    params.delete('paid')
    params.delete('email')
    const qs = params.toString()
    window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''))
    setActiveEmail(paidEmail)
    promotePendingToken()
    setPaymentSuccess(true)
    setBalanceLoading(true)
    ;(async () => {
      // claimCreditsApi 无 token 时自动走 guest 通道(body 带 email)，成功响应含 token 并已存储
      const result = await claimCreditsApi()
      if (result && result.claimed) {
        setCreditBalance({ email: paidEmail, credits: result.credits, totalPurchased: result.credits, purchases: [], verifiedAt: Date.now() })
      } else {
        // webhook 已发放但 pending 过期等场景：回退查余额
        const b = await fetchBalance(paidEmail)
        if (b) setCreditBalance(b)
      }
      setBalanceLoading(false)
    })()
  }, [])

  // Fetch real stats
  const refreshStats = useCallback(() => {
    fetch('/api/stats', { cache: 'no-store' }).then(r => r.json()).then(data => {
      if (data) setStats(data)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    refreshStats()
  }, [refreshStats])

  // Cleanup on unmount
  useEffect(() => {
    return () => { mountedRef.current = false }
  }, [])

  // Auto-dismiss payment success banner
  useEffect(() => {
    if (paymentSuccess) {
      const t = setTimeout(() => setPaymentSuccess(false), 3000)
      return () => clearTimeout(t)
    }
  }, [paymentSuccess])

  async function handleUnlock() {
    const email = getActiveEmail()
    if (email) {
      setBalanceLoading(true)
      const fresh = await fetchBalance(email)
      if (fresh) setCreditBalance(fresh)
      setBalanceLoading(false)
    }
  }

  async function handlePricingCheckout(packageId: string) {
    if (checkoutLoading) return
    setCheckoutLoading(true)
    const doFetch = (useToken: boolean, email: string) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      const token = getSessionToken()
      if (useToken && token) headers['Authorization'] = `Bearer ${token}`
      const utm = getUtm()
      return fetch('/api/checkout', {
        method: 'POST',
        headers,
        body: JSON.stringify(useToken ? { packageId, ...(utm ? { utm } : {}) } : { packageId, email, ...(utm ? { utm } : {}) }),
      })
    }
    try {
      const token = getSessionToken()
      const activeEmail = getActiveEmail()
      let res: Response
      if (token) {
        res = await doFetch(true, '')
        // token 过期/无效 → 清掉 stale token，有邮箱时降级 guest 通道重试
        if (res.status === 401) {
          setSessionToken(null)
          if (activeEmail) {
            res = await doFetch(false, activeEmail)
          } else {
            setVerifyModalMode('evaluate')
            setShowVerifyModal(true)
            return
          }
        }
      } else if (activeEmail) {
        // guest 通道：有活跃邮箱直接下单（Creem 支付页已预填 email）
        res = await doFetch(false, activeEmail)
      } else {
        // 完全新用户：旧验证码弹窗兜底
        setVerifyModalMode('evaluate')
        setShowVerifyModal(true)
        return
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok || !data.checkoutUrl) {
        toast(data.error || 'Payment service error. Please try again.')
        return
      }
      window.location.href = data.checkoutUrl
    } catch (err) {
      console.error('[pricing-checkout] failed:', err)
      toast('Failed to start checkout. Please try again.')
    } finally {
      setCheckoutLoading(false)
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const target = username.trim()
    if (!target) return
    setLoading(true)
    router.push(`/evaluate/${encodeURIComponent(target)}`)
  }

  const handleFocusInput = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setTimeout(() => inputRef.current?.focus(), 400)
  }, [])

  return (
    <main className="min-h-screen pb-20">
      {/* TopBar */}
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-xl">
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#00F2EA]/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-b from-transparent to-[#00F2EA]/[0.03] pointer-events-none" />
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center gap-4">
          {/* Logo */}
          <Link href="/" className="group shrink-0">
            <Image src="/tokvalue.png" alt="TokValue" width={160} height={40} className="h-10 w-auto object-contain" />
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center justify-center gap-1 flex-1">
            {[
              { label: dict.nav.pricing, href: '#pricing', icon: Zap },
              { label: dict.nav.howItWorks, href: '#capabilities', icon: Lightbulb },
            ].map(item => (
              <a
                key={item.label}
                href={item.href}
                className="group relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium text-neutral-400 hover:text-white transition-colors"
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
                <span className="absolute inset-x-2 -bottom-0.5 h-px bg-gradient-to-r from-transparent via-[#00F2EA]/60 to-transparent scale-x-0 group-hover:scale-x-100 transition-transform" />
              </a>
            ))}
            <Link
              href="/blog"
              className="group relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium text-neutral-400 hover:text-white transition-colors"
            >
              <BookOpen className="h-3.5 w-3.5" />
              {dict.nav.blog}
              <span className="absolute inset-x-2 -bottom-0.5 h-px bg-gradient-to-r from-transparent via-[#00F2EA]/60 to-transparent scale-x-0 group-hover:scale-x-100 transition-transform" />
            </Link>
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
                  <UserMenu email={creditBalance.email} onSwitchAccount={() => { setCreditBalance(null); setActiveEmail(null); setSessionToken(null) }} />
                </div>
              </>
            ) : (
              <button
                onClick={() => { setVerifyModalMode('evaluate'); setShowVerifyModal(true) }}
                className="group relative overflow-hidden rounded-full bg-gradient-to-r from-[#FF0050] to-[#ff2d6a] px-4 py-1.5 text-xs font-semibold text-white shadow-lg shadow-[#FF0050]/20 hover:shadow-xl hover:shadow-[#FF0050]/30 transition-all"
              >
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

      {/* Hero — simplified */}
      <section id="hero" className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#FF0050]/10 via-transparent to-transparent" />
        <div className="mx-auto max-w-3xl px-4 py-20 sm:py-24 relative">
          <div className="text-center mb-8">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight mb-4">
              {dict.home.hero.title}
            </h1>
            <p className="text-lg text-neutral-400 max-w-xl mx-auto">
              {dict.home.hero.subtitle}
            </p>
            <p className="text-sm text-neutral-500 mt-3">{dict.home.hero.forWhom}</p>
          </div>

          <form onSubmit={onSubmit} className="w-full">
            <div className="flex items-center rounded-2xl border border-neutral-700 bg-neutral-900/80 backdrop-blur px-4 py-3 glow-pink focus-within:border-[#FF0050] transition-colors">
              <span className="text-neutral-500 text-lg mr-3">@</span>
              <input
                ref={inputRef}
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder={dict.home.hero.placeholder}
                aria-label={dict.home.hero.ariaLabel}
                autoComplete="off"
                className="flex-1 bg-transparent text-lg outline-none placeholder:text-neutral-600"
              />
              <CtaButton
                type="submit"
                disabled={loading}
                icon={loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                className="ml-3"
              >
                {loading ? dict.common.analyzing : dict.home.hero.cta}
              </CtaButton>
            </div>
          </form>

          <div className="mt-4 flex items-center justify-center">
            <Link
              href="/evaluate/@demo"
              className="group inline-flex items-center gap-2.5 rounded-2xl border border-[#00F2EA]/30 bg-gradient-to-r from-[#00F2EA]/[0.08] to-[#FF0050]/[0.06] px-5 py-3 text-sm font-semibold text-[#00F2EA] hover:border-[#00F2EA]/60 hover:from-[#00F2EA]/[0.14] hover:to-[#FF0050]/[0.10] transition-all"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#00F2EA]/15 group-hover:bg-[#00F2EA]/25 transition-colors">
                <Play className="h-3.5 w-3.5" fill="currentColor" />
              </span>
              <span className="text-left leading-tight">
                <span className="block">{dict.home.hero.demoLink}</span>
                <span className="block text-[11px] font-normal text-neutral-400">{dict.home.hero.demoLinkHint}</span>
              </span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          {/* Trust signals — no emoji, no fake stars */}
          <div className="mt-6 flex items-center justify-center gap-8">
            {[
              { icon: Zap, label: 'Instant' },
              { icon: BarChart3, label: 'AI-Powered' },
              { icon: Shield, label: 'Private & Secure' },
            ].map((item, i) => {
              const Icon = item.icon
              return (
                <div key={i} className="flex items-center gap-2 text-xs text-neutral-500">
                  <Icon className="h-3.5 w-3.5 text-[#00F2EA]" />
                  {item.label}
                </div>
              )
            })}
          </div>
        </div>

        {/* Avatar wall — live social proof inside Hero */}
        <AvatarWall />
      </section>

      {/* Social Proof — moved to first viewport for instant trust */}
      <SocialProofBar stats={stats} />

      {/* How It Works */}
      <HowItWorks dict={dict.home.howItWorks} />

      {/* Core Value Proposition — what the product actually does */}
      <CoreCapabilitiesSection dict={dict} interactive={true} onFocusInput={handleFocusInput} />

      {/* Pricing */}
      <PricingSection
        dict={dict}
        interactive={true}
        checkoutLoading={checkoutLoading}
        onCheckout={handlePricingCheckout}
      />

      {/* FAQ */}
      <Testimonials dict={dict} />
      <FAQSection dict={dict} interactive={true} />

      {/* Footer */}
      <SiteFooter />
      <ToastContainer toasts={toasts} dismiss={dismiss} />
      <VerifyEmailModal
        isOpen={showVerifyModal}
        onClose={() => setShowVerifyModal(false)}
        onUnlock={handleUnlock}
        existingBalance={creditBalance}
        mode={verifyModalMode}
      />
    </main>
  )
}
