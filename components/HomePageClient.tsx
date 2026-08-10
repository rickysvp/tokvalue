'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Search, Loader2, TrendingUp, Shield, Users, DollarSign, AlertTriangle, Lightbulb, Star, Briefcase, Film, Zap, Clock, BarChart3, Building2, BookOpen, ChevronDown, Activity, Play, Gift, ShoppingBag, CheckCircle2, User, Rocket, FileDown, Mail, Flame, ArrowRight, Eye, Globe, Layers, LineChart, MessageCircle, Radio, RefreshCw, Scale, Sparkles, Trophy, Wallet, CreditCard } from 'lucide-react'
import { SiteFooter } from '@/components/SiteFooter'
import { useToast, ToastContainer } from '@/components/Toast'
import type { CreditBalance } from '@/lib/credits'

import { useI18n, t } from '@/lib/i18n'
import { CREDIT_PACKAGES } from '@/lib/credits'
import { getActiveEmail, setActiveEmail, fetchBalance, getSessionToken, setSessionToken } from '@/lib/credits-client'
import { ParticleBackground } from '@/components/ParticleBackground'
import { VerifyEmailModal } from '@/components/VerifyEmailModal'
import { RecentEvaluations } from '@/components/RecentEvaluations'

export type TabId = 'overview' | 'growth' | 'revenue' | 'commerce'

// Client-side analytics tracking helper
function trackEvent(event_type: string, metadata?: Record<string, unknown>) {
  const body = JSON.stringify({
    event_type,
    path: typeof window !== 'undefined' ? window.location.pathname : '/',
    metadata,
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

export default function HomePage() {
  const { dict } = useI18n()
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const { toast, toasts, dismiss } = useToast()
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [paymentSuccess, setPaymentSuccess] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [showVerifyModal, setShowVerifyModal] = useState(false)
  const [verifyModalMode, setVerifyModalMode] = useState<'evaluate' | 'unlock'>('evaluate')
  const [stats, setStats] = useState({ accountsEvaluated: 0, totalValueAssessed: 0, uniqueVisitors: 0 })
  const mountedRef = useRef(true)

  // Load credit balance on mount
  useEffect(() => {
    const email = getActiveEmail()
    const token = getSessionToken()
    if (email && token) {
      setIsLoggedIn(true)
      setBalanceLoading(true)
      fetchBalance(email).then(b => { if (b) setCreditBalance(b) }).finally(() => setBalanceLoading(false))
    }
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
    setIsLoggedIn(true)
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
    try {
      const token = getSessionToken()
      if (!token) {
        setVerifyModalMode('evaluate')
        setShowVerifyModal(true)
        return
      }
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ packageId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok || !data.checkoutUrl) {
        toast('Payment service error. Please try again.')
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
              ...(isLoggedIn ? [
                { label: dict.nav.tracker, href: '/tracker', icon: BarChart3 },
                { label: dict.nav.history, href: '/history', icon: Clock },
              ] : []),
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

                <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-900/60 py-0.5 pl-0.5 pr-2.5 min-w-0">
                  <div className="h-6 w-6 rounded-full bg-gradient-to-br from-[#FF0050] to-[#00F2EA] flex items-center justify-center text-[10px] font-bold text-black shrink-0">
                    {(creditBalance.email[0] || '?').toUpperCase()}
                  </div>
                  <span className="text-[11px] text-neutral-400 truncate max-w-[120px]" title={creditBalance.email}>
                    {creditBalance.email}
                  </span>
                  <button
                    onClick={() => { setCreditBalance(null); setActiveEmail(null); setSessionToken(null); setIsLoggedIn(false) }}
                    className="ml-0.5 text-neutral-600 hover:text-neutral-300 transition-colors shrink-0"
                    aria-label={dict.common.switchAccount}
                  >
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18l6-6-6-6"/>
                    </svg>
                  </button>
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

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-neutral-800">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#FF0050]/10 via-transparent to-transparent" />
        <ParticleBackground />
        <div className="mx-auto max-w-3xl px-4 py-20 sm:py-24 relative">
          <div className="text-center mb-8">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight mb-4">
              {dict.home.hero.title}
            </h1>
            <p className="text-lg text-neutral-400 max-w-xl mx-auto">
              {dict.home.hero.subtitle}
            </p>
          </div>

          <form onSubmit={onSubmit} className="w-full">
            <div className="flex items-center rounded-2xl border border-neutral-700 bg-neutral-900/80 backdrop-blur px-4 py-3 glow-pink focus-within:border-[#FF0050] transition-colors">
              <span className="text-neutral-500 text-lg mr-3">@</span>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder={dict.home.hero.placeholder}
                aria-label={dict.home.hero.ariaLabel}
                autoComplete="off"
                className="flex-1 bg-transparent text-lg outline-none placeholder:text-neutral-600"
              />
              <button
                type="submit"
                disabled={loading}
                className="ml-3 inline-flex items-center gap-2 rounded-xl bg-[#FF0050] px-5 py-2.5 font-semibold text-white hover:bg-[#d60043] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {loading ? dict.common.analyzing : dict.common.evaluate}
              </button>
            </div>
          </form>

          <div className="mt-4 flex items-center justify-center">
            <Link
              href="/evaluate/@demo"
              className="inline-flex items-center gap-1.5 rounded-full border border-[#00F2EA]/40 bg-[#00F2EA]/10 px-4 py-1.5 text-sm font-medium text-[#00F2EA] hover:bg-[#00F2EA]/20 transition-colors"
            >
              <Play className="h-3.5 w-3.5" />
              @demo (sample data)
            </Link>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="border-b border-neutral-800 bg-[#0a0a0a] py-12">
        <div className="mx-auto max-w-5xl px-4">
          <div className="grid grid-cols-3 gap-8 text-center">
            {[
              { value: stats.accountsEvaluated > 0 ? `${stats.accountsEvaluated.toLocaleString()}+` : '--', label: dict.home.socialProof.accountsEvaluated },
              { value: stats.totalValueAssessed > 0 ? `$${stats.totalValueAssessed >= 1_000_000_000 ? (stats.totalValueAssessed / 1_000_000_000).toFixed(1) + 'B+' : stats.totalValueAssessed >= 1_000_000 ? (stats.totalValueAssessed / 1_000_000).toFixed(1) + 'M+' : stats.totalValueAssessed.toLocaleString() + '+'}` : '--', label: dict.home.socialProof.totalValueAssessed },
              { value: stats.uniqueVisitors > 0 ? `${stats.uniqueVisitors.toLocaleString()}+` : '--', label: dict.home.socialProof.uniqueVisitors },
            ].map((stat, i) => (
              <div key={i}>
                <div className="text-2xl sm:text-3xl font-black text-white tabular-nums">{stat.value}</div>
                <div className="mt-1 text-xs sm:text-sm text-neutral-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recently Evaluated Accounts */}
      <RecentEvaluations onSelect={(name) => router.push(`/evaluate/${encodeURIComponent(name)}`)} />

      {/* Use Cases */}
      <section className="border-b border-neutral-800 py-16">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="text-2xl font-bold text-center mb-10">{dict.home.useCases.title}</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                icon: Building2, title: dict.home.useCases.brands.title,
                desc: dict.home.useCases.brands.desc,
                cta: dict.home.useCases.brands.cta,
                action: () => document.querySelector('input')?.focus(),
                image: '/images/role-brands.jpg',
              },
              {
                icon: User, title: dict.home.useCases.creators.title,
                desc: dict.home.useCases.creators.desc,
                cta: dict.home.useCases.creators.cta,
                action: () => { setUsername(''); document.querySelector('input')?.focus() },
                image: '/images/role-creators.jpg',
              },
              {
                icon: Users, title: dict.home.useCases.agencies.title,
                desc: dict.home.useCases.agencies.desc,
                cta: dict.home.useCases.agencies.cta,
                action: () => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' }),
                image: '/images/role-agencies.jpg',
              },
            ].map((item, i) => {
              const Icon = item.icon
              return (
                <div key={i} className="group rounded-2xl border border-neutral-800 bg-[#141414] overflow-hidden hover:border-[#00F2EA]/30 transition-all hover:-translate-y-1">
                  <div className="relative h-40 overflow-hidden">
                    <Image
                      src={item.image}
                      alt={item.title}
                      width={400}
                      height={200}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/20 to-transparent" />
                  </div>
                  <div className="p-6 pt-0 -mt-8 relative z-10">
                    <div className="w-11 h-11 rounded-xl bg-[#00F2EA]/10 flex items-center justify-center mb-4">
                      <Icon className="h-5 w-5 text-[#00F2EA]" />
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-2">{item.title}</h3>
                    <p className="text-sm text-neutral-400 leading-relaxed mb-4">{item.desc}</p>
                    <button onClick={item.action} className="text-sm font-medium text-[#FF0050] hover:text-[#ff2d6a] transition-colors">
                      {item.cta} →
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-b border-neutral-800 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center mb-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#00F2EA]/20 bg-[#00F2EA]/5 px-4 py-1.5 text-xs font-medium text-[#00F2EA] mb-4">
              <Zap className="h-3.5 w-3.5" />
              Pricing
            </div>
            <h2 className="text-3xl font-bold sm:text-4xl">{dict.home.pricing.title}</h2>
            <p className="mt-4 max-w-xl mx-auto text-neutral-400">{dict.home.pricing.subtitle}</p>
          </div>

          {/* Trust Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-12 max-w-3xl mx-auto">
            {dict.home.pricing.trustBar.map((item: { icon: string; title: string; desc: string }) => {
              const Icon = item.icon === 'zap' ? Zap : item.icon === 'mail' ? Mail : CreditCard
              return (
                <div key={item.title} className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-[#0a0a0a] px-4 py-3">
                  <Icon className="h-5 w-5 text-[#00F2EA] shrink-0" />
                  <div>
                    <div className="text-sm font-semibold text-white">{item.title}</div>
                    <div className="text-xs text-neutral-500">{item.desc}</div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Plans */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {CREDIT_PACKAGES.map(pkg => {
              const plan = (dict.home.pricing.plans as unknown as Array<{
                id: string
                name: string
                desc: string
                highlight: boolean
                badge?: string
              }>).find(p => p.id === pkg.id)

              return (
                <div
                  key={pkg.id}
                  className={`relative rounded-2xl border-2 p-6 transition-all ${
                    pkg.highlight
                      ? 'border-[#FF0050] bg-gradient-to-b from-[#FF0050]/[0.06] to-transparent shadow-lg shadow-[#FF0050]/5'
                      : 'border-neutral-800 bg-[#0a0a0a] hover:border-neutral-700'
                  }`}
                >
                  {pkg.badge && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#FF0050] px-3 py-1 text-[11px] font-bold text-white shadow-lg shadow-[#FF0050]/25">
                        <Star className="h-3 w-3" fill="currentColor" />
                        {dict.creditPackages[pkg.id as keyof typeof dict.creditPackages]?.badge ?? pkg.badge}
                      </span>
                    </div>
                  )}

                  <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-1">
                    {dict.creditPackages[pkg.id as keyof typeof dict.creditPackages]?.label ?? pkg.label}
                  </p>
                  <p className="text-sm text-neutral-400 mb-4">{plan?.desc}</p>

                  <div className="flex items-baseline gap-0.5 mb-1">
                    <span className="text-neutral-500 text-lg">$</span>
                    <span className="text-5xl font-black text-white tracking-tight">{pkg.price}</span>
                  </div>
                  <p className="text-sm text-neutral-500">
                    <span className="text-white font-semibold">{pkg.credits}</span> evaluations
                  </p>
                  <p className="text-xs text-neutral-600 mt-0.5">{pkg.perUnit}</p>

                  <button
                    onClick={() => handlePricingCheckout(pkg.id)}
                    disabled={checkoutLoading}
                    className={`mt-5 w-full rounded-xl py-3 text-sm font-semibold transition-all ${
                      pkg.highlight
                        ? 'bg-[#FF0050] text-white hover:bg-[#e60049] shadow-lg shadow-[#FF0050]/20'
                        : 'border border-neutral-700 text-neutral-300 hover:border-[#FF0050] hover:text-[#FF0050]'
                    } ${checkoutLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    {checkoutLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Redirecting...
                      </span>
                    ) : dict.common.getStarted}
                  </button>
                </div>
              )
            })}
          </div>

          {/* All plans include */}
          <div className="mb-12">
            <div className="text-center mb-6">
              <h3 className="text-xl font-bold text-white mb-2">{dict.home.pricing.allPlansInclude.title}</h3>
              <p className="text-sm text-neutral-500 max-w-xl mx-auto">{dict.home.pricing.allPlansInclude.subtitle}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 max-w-3xl mx-auto">
              {dict.home.pricing.allPlansInclude.list.map((f: string) => (
                <div key={f} className="flex items-center gap-2.5 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-[#00F2EA] shrink-0" />
                  <span className="text-neutral-300">{dict.home.pricing.allPlansInclude.features[f as keyof typeof dict.home.pricing.allPlansInclude.features]}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-6 text-xs text-neutral-600">
            {dict.home.pricing.footer.map((text: string, i: number) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-[#00F2EA]/50" />
                {text}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Core Capabilities */}
      <section id="capabilities" className="border-b border-neutral-800 py-20">
        <div className="mx-auto max-w-5xl px-4">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#00F2EA]/20 bg-[#00F2EA]/5 px-4 py-1.5 text-xs font-medium text-[#00F2EA] mb-4">
              <Sparkles className="h-3.5 w-3.5" />
              {dict.home.capabilities.badge}
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">
              {dict.home.capabilities.title}
            </h2>
            <p className="text-neutral-500 text-sm max-w-2xl mx-auto leading-relaxed">
              {dict.home.capabilities.description}
            </p>
          </div>

          {/* 1. BUSINESS VALUATION */}
          <div className="rounded-2xl border border-neutral-800 bg-gradient-to-br from-[#0f0f0f] via-[#0f0f0f] to-[#FF0050]/[0.04] p-6 sm:p-8 mb-5 hover:border-[#FF0050]/30 transition-all group">
            <div className="flex flex-col lg:flex-row lg:items-start gap-6 lg:gap-10">
              <div className="lg:w-[340px] shrink-0">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FF0050]/10 border border-[#FF0050]/20 px-3 py-1 text-[10px] font-semibold text-[#FF0050] uppercase tracking-wider mb-4">
                  <DollarSign className="h-3 w-3" /> {dict.home.capabilities.valuation.badge}
                </span>
                <h3 className="text-xl font-bold mb-2">{dict.home.capabilities.valuation.title}</h3>
                <p className="text-sm text-neutral-400 leading-relaxed mb-5">
                  {dict.home.capabilities.valuation.desc}
                </p>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-[#FF0050]/5 border border-[#FF0050]/10">
                    <DollarSign className="h-5 w-5 text-[#FF0050] shrink-0" />
                    <div>
                      <div className="text-[10px] text-neutral-500 uppercase tracking-wider">{dict.home.capabilities.valuation.rangeLabel}</div>
                      <div className="text-base font-bold text-[#FF0050]">{dict.home.capabilities.valuation.rangeValue}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-[#FF0050]/5 border border-[#FF0050]/10">
                    <Globe className="h-5 w-5 text-[#FF0050] shrink-0" />
                    <div>
                      <div className="text-[10px] text-neutral-500 uppercase tracking-wider">{dict.home.capabilities.valuation.coverageLabel}</div>
                      <div className="text-sm font-semibold text-white">{dict.home.capabilities.valuation.coverageValue}</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex-1 grid gap-3 sm:grid-cols-2">
                <CapFeature icon={<DollarSign className="h-4 w-4" />} color="pink" title={dict.home.capabilities.valuation.features.incomeBreakdown.title} items={dict.home.capabilities.valuation.features.incomeBreakdown.items} />
                <CapFeature icon={<TrendingUp className="h-4 w-4" />} color="pink" title={dict.home.capabilities.valuation.features.revenueRoadmap.title} items={dict.home.capabilities.valuation.features.revenueRoadmap.items} />
                <CapFeature icon={<Layers className="h-4 w-4" />} color="pink" title={dict.home.capabilities.valuation.features.valueBreakdown.title} items={dict.home.capabilities.valuation.features.valueBreakdown.items} />
                <CapFeature icon={<Trophy className="h-4 w-4" />} color="pink" title={dict.home.capabilities.valuation.features.peerBenchmarking.title} items={dict.home.capabilities.valuation.features.peerBenchmarking.items} />
              </div>
            </div>
          </div>

          {/* 2. AUTHORITY & RISK */}
          <div className="rounded-2xl border border-neutral-800 bg-gradient-to-br from-[#0f0f0f] via-[#0f0f0f] to-[#00F2EA]/[0.04] p-6 sm:p-8 mb-5 hover:border-[#00F2EA]/30 transition-all group">
            <div className="flex flex-col lg:flex-row lg:items-start gap-6 lg:gap-10">
              <div className="lg:w-[340px] shrink-0">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#00F2EA]/10 border border-[#00F2EA]/20 px-3 py-1 text-[10px] font-semibold text-[#00F2EA] uppercase tracking-wider mb-4">
                  <Shield className="h-3 w-3" /> {dict.home.capabilities.authority.badge}
                </span>
                <h3 className="text-xl font-bold mb-2">{dict.home.capabilities.authority.title}</h3>
                <p className="text-sm text-neutral-400 leading-relaxed mb-5">
                  {dict.home.capabilities.authority.desc}
                </p>
                <div className="mb-4 space-y-2">
                  <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-2">{dict.home.capabilities.authority.valueLevels.title}</div>
                  <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-gradient-to-r from-amber-500/10 to-amber-500/5 border border-amber-500/15">
                    <div className="shrink-0 w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center mt-0.5">
                      <Trophy className="h-4 w-4 text-amber-400" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-amber-300">{dict.home.capabilities.authority.valueLevels.premium.label}</div>
                      <div className="text-[11px] text-neutral-400 leading-relaxed">{dict.home.capabilities.authority.valueLevels.premium.desc}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-gradient-to-r from-[#00F2EA]/10 to-[#00F2EA]/5 border border-[#00F2EA]/15">
                    <div className="shrink-0 w-8 h-8 rounded-lg bg-[#00F2EA]/20 flex items-center justify-center mt-0.5">
                      <TrendingUp className="h-4 w-4 text-[#00F2EA]" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-[#00F2EA]">{dict.home.capabilities.authority.valueLevels.growth.label}</div>
                      <div className="text-[11px] text-neutral-400 leading-relaxed">{dict.home.capabilities.authority.valueLevels.growth.desc}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-gradient-to-r from-purple-500/10 to-purple-500/5 border border-purple-500/15">
                    <div className="shrink-0 w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center mt-0.5">
                      <Sparkles className="h-4 w-4 text-purple-400" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-purple-300">{dict.home.capabilities.authority.valueLevels.developing.label}</div>
                      <div className="text-[11px] text-neutral-400 leading-relaxed">{dict.home.capabilities.authority.valueLevels.developing.desc}</div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 rounded-xl bg-[#00F2EA]/5 border border-[#00F2EA]/10">
                  <Eye className="h-5 w-5 text-[#00F2EA] shrink-0" />
                  <div className="text-xs text-neutral-400">
                    {t(dict.home.capabilities.authority.brandCheck, { pct: '85' })}
                  </div>
                </div>
              </div>
              <div className="flex-1 grid gap-3 sm:grid-cols-2">
                <CapFeature icon={<Scale className="h-4 w-4" />} color="cyan" title={dict.home.capabilities.authority.features.radarScoring.title} items={dict.home.capabilities.authority.features.radarScoring.items} />
                <CapFeature icon={<AlertTriangle className="h-4 w-4" />} color="cyan" title={dict.home.capabilities.authority.features.riskIntelligence.title} items={dict.home.capabilities.authority.features.riskIntelligence.items} />
                <CapFeature icon={<Building2 className="h-4 w-4" />} color="cyan" title={dict.home.capabilities.authority.features.brandSuitability.title} items={dict.home.capabilities.authority.features.brandSuitability.items} />
                <CapFeature icon={<Activity className="h-4 w-4" />} color="cyan" title={dict.home.capabilities.authority.features.accountHealth.title} items={dict.home.capabilities.authority.features.accountHealth.items} />
              </div>
            </div>
          </div>

          {/* 3. GROWTH & MONETIZATION */}
          <div className="rounded-2xl border border-neutral-800 bg-gradient-to-br from-[#0f0f0f] via-[#0f0f0f] to-[#FF0050]/[0.04] p-6 sm:p-8 mb-5 hover:border-[#FF0050]/30 transition-all group">
            <div className="flex flex-col lg:flex-row lg:items-start gap-6 lg:gap-10">
              <div className="lg:w-[340px] shrink-0">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FF0050]/10 border border-[#FF0050]/20 px-3 py-1 text-[10px] font-semibold text-[#FF0050] uppercase tracking-wider mb-4">
                  <Rocket className="h-3 w-3" /> {dict.home.capabilities.growth.badge}
                </span>
                <h3 className="text-xl font-bold mb-2">{dict.home.capabilities.growth.title}</h3>
                <p className="text-sm text-neutral-400 leading-relaxed mb-5">
                  {dict.home.capabilities.growth.desc}
                </p>
                <div className="space-y-2 text-xs">
                  {dict.home.capabilities.growth.guarantees.map((text, i) => (
                    <div key={i} className="flex items-center gap-2 text-neutral-400">
                      <CheckCircle2 className="h-3.5 w-3.5 text-[#00F2EA] shrink-0" />
                      <span>{text}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex-1 grid gap-3 sm:grid-cols-2">
                <CapFeature icon={<Lightbulb className="h-4 w-4" />} color="pink" title={dict.home.capabilities.growth.features.contentStrategy.title} items={dict.home.capabilities.growth.features.contentStrategy.items} />
                <CapFeature icon={<Rocket className="h-4 w-4" />} color="pink" title={dict.home.capabilities.growth.features.monetizationBlueprint.title} items={dict.home.capabilities.growth.features.monetizationBlueprint.items} />
                <CapFeature icon={<Flame className="h-4 w-4" />} color="pink" title={dict.home.capabilities.growth.features.trendForecasting.title} items={dict.home.capabilities.growth.features.trendForecasting.items} />
                <CapFeature icon={<MessageCircle className="h-4 w-4" />} color="pink" title={dict.home.capabilities.growth.features.engagementDeepDive.title} items={dict.home.capabilities.growth.features.engagementDeepDive.items} />
              </div>
            </div>
          </div>

          {/* Additional Capabilities Summary */}
          <div className="rounded-2xl border border-neutral-800 bg-gradient-to-br from-[#0f0f0f] to-[#141414] p-6 mb-5">
            <div className="flex items-center gap-2 mb-4">
              <Radio className="h-4 w-4 text-[#FF0050]" />
              <h4 className="text-sm font-semibold text-neutral-300">{dict.home.capabilities.alsoIncluded.title}</h4>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {dict.home.capabilities.alsoIncluded.items.map((item, i) => {
                const icons = [FileDown, RefreshCw, Globe, BarChart3, LineChart, Wallet]
                const Icon = icons[i] || Radio
                return (
                <div key={i} className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-neutral-900/50 border border-neutral-800 hover:border-[#FF0050]/30 transition-colors text-center">
                  <Icon className="h-4 w-4 text-[#00F2EA]" />
                  <span className="text-[11px] font-medium text-neutral-300">{item.label}</span>
                  <span className="text-[10px] text-neutral-500">{item.desc}</span>
                </div>
                )
              })}
            </div>
          </div>

          {/* CTA Banner */}
          <div className="text-center mt-8">
            <p className="text-sm text-neutral-500 mb-4">{dict.home.capabilities.ctaHint}</p>
            <button
              onClick={() => {
                const input = document.querySelector<HTMLInputElement>('input[placeholder*="username"]')
                if (input) { input.focus(); input.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#FF0050] to-[#e60049] px-6 py-3 text-sm font-semibold text-white hover:from-[#e60049] hover:to-[#cc0040] transition-all shadow-lg shadow-[#FF0050]/25"
            >
              {dict.home.capabilities.cta}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-b border-neutral-800 py-16">
        <div className="mx-auto max-w-2xl px-4">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#00F2EA]/20 bg-[#00F2EA]/5 px-4 py-1.5 text-xs font-medium text-[#00F2EA] mb-4">
              <MessageCircle className="h-3.5 w-3.5" />
              {dict.home.faq.badge}
            </div>
            <h2 className="text-2xl font-bold">{dict.home.faq.title}</h2>
          </div>

          {Object.entries(dict.home.faq.questions).map(([key, item]) => (
            <FAQItem key={key} question={item.q} answer={item.a} />
          ))}
        </div>
      </section>

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

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-neutral-800">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-4 text-left text-sm font-medium text-white hover:text-[#00F2EA] transition-colors"
      >
        {question}
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="pb-4 text-sm text-neutral-400 leading-relaxed">{answer}</div>
      )}
    </div>
  )
}

function valueIcon(name: string) {
  const icons: Record<string, React.ReactNode> = {
    Briefcase: <Briefcase className="h-3.5 w-3.5 text-neutral-500" />,
    Film: <Film className="h-3.5 w-3.5 text-neutral-500" />,
    Users: <Users className="h-3.5 w-3.5 text-neutral-500" />,
    Zap: <Zap className="h-3.5 w-3.5 text-neutral-500" />,
    Play: <Play className="h-3.5 w-3.5 text-neutral-500" />,
    Gift: <Gift className="h-3.5 w-3.5 text-neutral-500" />,
    ShoppingBag: <ShoppingBag className="h-3.5 w-3.5 text-neutral-500" />,
  }
  return icons[name] || <Activity className="h-3.5 w-3.5 text-neutral-500" />
}

function CapFeature({ icon, color, title, items }: {
  icon: React.ReactNode
  color: 'pink' | 'cyan'
  title: string
  items: readonly string[]
}) {
  const borderColor = color === 'pink' ? 'border-[#FF0050]/20 group-hover:border-[#FF0050]/40' : 'border-[#00F2EA]/20 group-hover:border-[#00F2EA]/40'
  const iconBg = color === 'pink' ? 'bg-[#FF0050]/10' : 'bg-[#00F2EA]/10'
  const iconColor = color === 'pink' ? 'text-[#FF0050]' : 'text-[#00F2EA]'
  const dotColor = color === 'pink' ? 'bg-[#FF0050]/60' : 'bg-[#00F2EA]/60'
  return (
    <div className={`rounded-xl border ${borderColor} bg-neutral-900/40 p-4 transition-all`}>
      <div className="flex items-center gap-2.5 mb-3">
        <div className={`flex items-center justify-center h-7 w-7 rounded-lg ${iconBg} ${iconColor}`}>
          {icon}
        </div>
        <h4 className="text-sm font-semibold text-white">{title}</h4>
      </div>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-[12px] text-neutral-400 leading-relaxed">
            <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
