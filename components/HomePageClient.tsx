'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Search, Loader2, Lightbulb, Zap, Clock, BarChart3, BookOpen, Play, CheckCircle2, Mail } from 'lucide-react'
import { SiteFooter } from '@/components/SiteFooter'
import { useToast, ToastContainer } from '@/components/Toast'
import type { CreditBalance } from '@/lib/credits'

import { useI18n } from '@/lib/i18n'
import { getActiveEmail, setActiveEmail, fetchBalance, getSessionToken, setSessionToken } from '@/lib/credits-client'
import { ParticleBackground } from '@/components/ParticleBackground'
import { VerifyEmailModal } from '@/components/VerifyEmailModal'
import { RecentEvaluations } from '@/components/RecentEvaluations'
import { CtaButton } from '@/components/CtaButton'
import { SocialProofSection, UseCasesSection, PricingSection, CoreCapabilitiesSection, FAQSection } from '@/components/LandingSections'

export type TabId = 'overview' | 'growth' | 'revenue' | 'commerce'


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
              <CtaButton
                type="submit"
                disabled={loading}
                icon={loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                className="ml-3"
              >
                {loading ? dict.common.analyzing : dict.common.evaluate}
              </CtaButton>
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
      <SocialProofSection
        dict={dict}
        stats={{ accountsEvaluated: stats.accountsEvaluated, totalValueAssessed: stats.totalValueAssessed, uniqueVisitors: stats.uniqueVisitors }}
      />

      {/* Recently Evaluated Accounts */}
      <RecentEvaluations onSelect={(name) => router.push(`/evaluate/${encodeURIComponent(name)}`)} />

      {/* Use Cases */}
      <UseCasesSection
        dict={dict}
        interactive={true}
        onFocusInput={() => document.querySelector('input')?.focus()}
        onScrollToPricing={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
      />

      {/* Pricing */}
      <PricingSection
        dict={dict}
        interactive={true}
        checkoutLoading={checkoutLoading}
        onCheckout={handlePricingCheckout}
      />

      {/* Core Capabilities */}
      <CoreCapabilitiesSection
        dict={dict}
        interactive={true}
        onFocusInput={() => {
          const input = document.querySelector<HTMLInputElement>('input[placeholder*="username"]')
          if (input) { input.focus(); input.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
        }}
      />

      {/* FAQ */}
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
