'use client'

import { useState, useEffect } from 'react'
import {
  Lock, DollarSign, TrendingUp, Target, Shield, BarChart3,
  Building2, Lightbulb, Flame, Rocket, FileDown, Check, Mail,
  ArrowRight, Loader2, Sparkles, Users, CheckCircle2,
  Zap, Star, RefreshCw, CreditCard, KeyRound,
} from 'lucide-react'
import type { Evaluation } from '@/types'
import type { CreditBalance, CreditPackage } from '@/lib/credits'
import { CREDIT_PACKAGES, savePct } from '@/lib/credits'
import {
  getActiveEmail, setActiveEmail, fetchBalance, getSessionToken, setSessionToken,
} from '@/lib/credits-client'
import { useI18n, t } from '@/lib/i18n'
import { getUtm } from '@/lib/utm'

interface PaidWallProps {
  onUnlock: () => void
  result?: Evaluation | null
  /** If user already has credits, show direct unlock button */
  existingBalance?: CreditBalance | null
  /** Loading state for unlock action */
  isUnlocking?: boolean
  /** Loading state for initial balance fetch */
  balanceLoading?: boolean
  /** 'evaluate' = new account evaluation, 'unlock' = unlock previously saved evaluation */
  mode?: 'evaluate' | 'unlock'
}

// Guest Checkout 主流程：选套餐 → 输邮箱 →（新用户）直达 Creem 支付（无验证码往返），
// 支付成功回跳后由回跳逻辑（claimCreditsApi）完成认领并换取会话 token。
// 已有额度的老用户（换设备/清存储）→ 复购选择页：验证码验证所有权恢复使用（青），
// 或直接再买（粉）——购买与恢复是独立入口，不强制验证码堵死复购。
type Step = 'choose' | 'email' | 'returning-choice' | 'returning-code' | 'success'

const UNLOCK_MODULES = [
  { icon: DollarSign,   color: 'text-[#FF0050]', bg: 'bg-[#FF0050]/10' },
  { icon: TrendingUp,   color: 'text-[#00F2EA]', bg: 'bg-[#00F2EA]/10' },
  { icon: Target,       color: 'text-[#FF0050]', bg: 'bg-[#FF0050]/10' },
  { icon: Shield,       color: 'text-[#00F2EA]', bg: 'bg-[#00F2EA]/10' },
  { icon: BarChart3,    color: 'text-[#FF0050]', bg: 'bg-[#FF0050]/10' },
  { icon: Building2,    color: 'text-[#00F2EA]', bg: 'bg-[#00F2EA]/10' },
  { icon: Lightbulb,    color: 'text-[#FF0050]', bg: 'bg-[#FF0050]/10' },
  { icon: Flame,        color: 'text-[#00F2EA]', bg: 'bg-[#00F2EA]/10' },
  { icon: Rocket,       color: 'text-[#FF0050]', bg: 'bg-[#FF0050]/10' },
  { icon: FileDown,     color: 'text-[#00F2EA]', bg: 'bg-[#00F2EA]/10' },
]

export function PaidWall({ onUnlock, result, existingBalance, isUnlocking, balanceLoading, mode = 'evaluate' }: PaidWallProps) {
  const { dict } = useI18n()
  const isUnlockMode = mode === 'unlock'
  const [step, setStep] = useState<Step>('choose')
  const [selectedPkg, setSelectedPkg] = useState<CreditPackage>(CREDIT_PACKAGES[1])
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [returningCode, setReturningCode] = useState('')
  const [balance, setBalance] = useState<CreditBalance | null>(existingBalance || null)

  const username = result?.username || ''

  // Init: if no existingBalance passed, try to fetch from API
  useEffect(() => {
    if (existingBalance) {
      setBalance(existingBalance)
      return
    }
    const activeEmail = getActiveEmail()
    if (activeEmail) {
      fetchBalance(activeEmail).then(b => { if (b) setBalance(b) })
    }
  }, [existingBalance])

  // 直达支付：创建 Creem 支付会话并跳转（新用户 / 老用户复购共用）。
  // 有本地 token 时带 Authorization 走 JWT 通道；否则 body 携带 email 走 guest 通道，
  // 邮箱同步传给 Creem（customer.email），支付页自动预填。
  async function startGuestCheckout(trimmed: string) {
    const token = getSessionToken()
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ packageId: selectedPkg.id, email: trimmed, ...(getUtm() ? { utm: getUtm() } : {}) }),
    })
    const data = await res.json().catch(() => ({ error: dict.paidWall.sendFailed }))
    if (!res.ok) throw new Error(data.error || dict.paidWall.sendFailed)

    // DEV_SKIP_PAYMENT：本地开发跳过 Creem，直接进入解锁态
    if (data.devMode) {
      setStep('success')
      setTimeout(() => onUnlock(), 800)
      return
    }

    if (data.checkoutUrl) {
      // 跳转前记住邮箱：支付成功回跳（?paid=success&email=...）后，
      // 回跳逻辑调 claimCreditsApi()（无 token 时自动带此邮箱走 guest 认领）
      setActiveEmail(trimmed)
      window.location.href = data.checkoutUrl
      return
    }

    throw new Error(dict.paidWall.sendFailed)
  }

  // Guest Checkout 主路径：输入邮箱 → 查状态分流。
  async function handleCheckout(e?: React.FormEvent) {
    e?.preventDefault()
    if (loading) return
    const trimmed = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError(dict.paidWall.invalidEmail)
      return
    }
    setLoading(true)
    setError('')
    try {
      // 先查邮箱状态：已有额度的老用户 → 转复购选择（验证恢复 / 直接再买）
      const lookupRes = await fetch('/api/credits/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      })
      const lookup = await lookupRes.json().catch(() => ({ hasCredits: false }))

      if (lookup.hasCredits) {
        setStep('returning-choice')
        return
      }

      // 新用户：直达支付
      await startGuestCheckout(trimmed)
    } catch (err) {
      setError(err instanceof Error ? err.message : dict.paidWall.sendFailed)
    } finally {
      setLoading(false)
    }
  }

  // returning-choice：验证邮箱所有权恢复已有额度（青色通道，'_returning' 不产生购买记录）
  async function handleReturningVerifyUse() {
    if (loading) return
    setLoading(true)
    setError('')
    try {
      const sendRes = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), packageId: '_returning' }),
      })
      const sendData = await sendRes.json().catch(() => ({}))
      if (!sendRes.ok) throw new Error(sendData.error || dict.paidWall.sendFailed)
      setActiveEmail(email.trim())
      setReturningCode('')
      setStep('returning-code')
    } catch (err) {
      setError(err instanceof Error ? err.message : dict.paidWall.sendFailed)
    } finally {
      setLoading(false)
    }
  }

  // returning-choice：直接复购（粉色通道，支付即凭证无需验证邮箱）
  async function handleReturningBuyMore() {
    if (loading) return
    setLoading(true)
    setError('')
    try {
      await startGuestCheckout(email.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : dict.paidWall.sendFailed)
    } finally {
      setLoading(false)
    }
  }

  function handleDirectUnlock() {
    // User has credits, directly proceed to unlock (parent will call consume API)
    onUnlock()
  }

  // 老用户所有权验证：输码 → verify-code(returning) → 换 token → 解锁
  async function handleReturningVerify(e?: React.FormEvent) {
    e?.preventDefault()
    if (loading) return
    const code = returningCode.replace(/\D/g, '')
    if (code.length !== 6) {
      setError('Please enter the complete 6-digit code')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || dict.paidWall.sendFailed)

      if (data.token) setSessionToken(data.token)
      const bal = await fetchBalance(email.trim())
      if (bal) setBalance(bal)
      setStep('success')
      setTimeout(() => onUnlock(), 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : dict.paidWall.sendFailed)
      setReturningCode('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative rounded-3xl border border-neutral-800 bg-[#0a0a0a] overflow-hidden bg-mesh-gradient-strong isolate animate-fade-in-up flex flex-col flex-1 min-h-0">
      {/* 顶部光斑装饰 */}
      <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[500px] h-48 bg-[#FF0050]/15 rounded-full blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 -right-24 w-72 h-72 bg-[#00F2EA]/10 rounded-full blur-3xl" />

      <div className="relative px-6 sm:px-10 pt-8 pb-6 overflow-y-auto flex-1">
        {/* ── 标题区 ── */}
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 mb-3">
            <Lock className="h-3.5 w-3.5 text-[#FF0050]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">{dict.paidWall.badge}</span>
            <Lock className="h-3.5 w-3.5 text-[#FF0050]" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
            {t(isUnlockMode ? dict.paidWall.unlockTitle : dict.paidWall.title, { username: username || 'this account' })}
          </h2>
          <p className="mt-2 text-sm text-neutral-400">
            {isUnlockMode ? dict.paidWall.unlockSubtitle : dict.paidWall.subtitle}
          </p>
          {balanceLoading && !balance && step === 'choose' && (
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-900/50 px-3 py-1 text-xs">
              <Loader2 className="h-3 w-3 animate-spin text-neutral-400" />
              <span className="text-neutral-400">{dict.paidWall.loadingCredits}</span>
            </div>
          )}
          {balance && balance.credits > 0 && step === 'choose' && (
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#00F2EA]/30 bg-[#00F2EA]/5 px-3 py-1 text-xs">
              <Sparkles className="h-3 w-3 text-[#00F2EA]" />
              <span className="text-[#00F2EA] font-semibold">
                {t(dict.paidWall.creditsRemaining, { count: balance.credits, email: balance.email })}
              </span>
            </div>
          )}
        </div>

        {/* ── 10 大模块网格 ── */}
        <div className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {UNLOCK_MODULES.map((m, i) => {
            const Icon = m.icon
            const mod = dict.paidWall.unlockModules[i] || { title: '', desc: '' }
            return (
              <div key={i} className="group relative flex items-start gap-3 rounded-xl border border-neutral-800 bg-[#111] p-4 transition-all hover:border-neutral-700 hover:bg-[#151515]">
                <div className={`inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0 ${m.bg}`}>
                  <Icon className={`h-5 w-5 ${m.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-white leading-tight">{mod.title}</div>
                  <div className="mt-1 text-xs text-neutral-400 leading-relaxed">{mod.desc}</div>
                </div>
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Lock className="h-3.5 w-3.5 text-neutral-600" />
                </div>
              </div>
            )
          })}
        </div>

        {/* ── 信任背书 ── */}
        <div className="mt-6 flex flex-wrap justify-center items-center gap-x-5 gap-y-2 text-[11px] text-neutral-500">
          <div className="flex items-center gap-1.5">
            <Users className="h-3 w-3 text-[#00F2EA]" />
            <span>{dict.paidWall.trustCreators}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3 text-[#FF0050]" />
            <span>{dict.paidWall.trustInstant}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <RefreshCw className="h-3 w-3 text-[#00F2EA]" />
            <span>{dict.paidWall.trustCredits}</span>
          </div>
        </div>

        {/* ── 步骤分隔符 ── */}
        {step !== 'choose' && (
          <div className="mt-6 flex items-center gap-3 text-[11px] text-neutral-500">
            <div className="flex-1 h-px bg-neutral-800" />
            <div className="flex items-center gap-1.5">
              {step === 'email' && <Mail className="h-3.5 w-3.5 text-[#FF0050]" />}
              {step === 'success' && <CheckCircle2 className="h-3.5 w-3.5 text-[#00F2EA]" />}
              <span>
                {step === 'email' && dict.paidWall.stepEmail}
                {step === 'success' && dict.paidWall.stepSuccess}
              </span>
            </div>
            <div className="flex-1 h-px bg-neutral-800" />
          </div>
        )}

        {/* ── 选择套餐 / 直接解锁 ── */}
        {step === 'choose' && (
          <>
            {/* 如果已有积分，显示直接解锁按钮 */}
            {balance && balance.credits > 0 ? (
              <div className="mt-6">
                <div className="rounded-2xl border border-[#00F2EA]/30 bg-[#00F2EA]/5 p-5 text-center">
                  <div className="text-sm text-neutral-400 mb-2">{dict.paidWall.hasCreditsHint}</div>
                  <button
                    onClick={handleDirectUnlock}
                    disabled={isUnlocking}
                    className="w-full group relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#00F2EA] to-[#66f7f3] py-4 text-base font-bold text-black shadow-lg shadow-[#00F2EA]/30 transition-all hover:shadow-xl hover:shadow-[#00F2EA]/40 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      {isUnlocking ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {dict.paidWall.unlocking}
                        </>
                      ) : (
                        <>
                          <Zap className="h-4 w-4" />
                          {t(dict.paidWall.useCreditUnlock, { remaining: balance.credits })}
                          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </>
                      )}
                    </span>
                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/30 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                  </button>
                  <button
                    onClick={() => { setBalance(null); setActiveEmail(null) }}
                    className="mt-3 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
                  >
                    {dict.common.useDifferentEmail}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="mt-6">
                  <div className="text-center mb-4">
                    <div className="text-xs font-semibold text-white">{dict.paidWall.choosePlan}</div>
                    <div className="text-[10px] text-neutral-500 mt-1">{dict.paidWall.planSubtitle}</div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {CREDIT_PACKAGES.map(pkg => {
                      const isSelected = selectedPkg.id === pkg.id
                      const saving = savePct(pkg)
                      return (
                        <button
                          key={pkg.id}
                          onClick={() => setSelectedPkg(pkg)}
                          className={`relative rounded-2xl p-4 text-left transition-all ${
                            isSelected
                              ? 'border-2 border-[#FF0050] bg-[#FF0050]/[0.08] shadow-lg shadow-[#FF0050]/15 ring-1 ring-[#FF0050]/30'
                              : 'border border-neutral-800 bg-[#111] hover:border-neutral-600'
                          }`}
                        >
                          {pkg.badge && (
                            <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-10">
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#FF0050] px-2.5 py-0.5 text-[10px] font-bold text-white shadow-lg shadow-[#FF0050]/30 whitespace-nowrap">
                                <Star className="h-2.5 w-2.5" />
                                {pkg.badge}
                              </span>
                            </div>
                          )}
                          {/* 节省徽章：右上角实心高对比 */}
                          {saving !== null && saving > 0 && (
                            <div className="absolute top-2.5 right-2.5">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black ${isSelected ? 'bg-[#00F2EA] text-black' : 'bg-[#00F2EA]/15 text-[#00F2EA]'}`}>
                                {t(dict.home.pricing.saveBadge, { pct: saving })}
                              </span>
                            </div>
                          )}
                          <div className="flex items-baseline gap-1">
                            <span className="text-xs text-neutral-400 align-top">$</span>
                            <span className={`text-3xl font-black ${isSelected ? 'text-white' : 'text-neutral-200'}`}>{pkg.price}</span>
                          </div>
                          <div className="mt-1 text-sm font-bold text-white">{pkg.label}</div>
                          <div className="mt-0.5 text-[11px] text-neutral-500">{pkg.credits} evaluations</div>
                          <div className={`mt-0.5 text-[11px] ${isSelected ? 'text-[#00F2EA] font-semibold' : 'text-neutral-500'}`}>{pkg.perUnit}</div>
                          <div className="mt-3 space-y-1">
                            {(dict.paidWall.packageFeatures[pkg.id as keyof typeof dict.paidWall.packageFeatures] || []).map((f, i) => (
                              <div key={i} className="flex items-start gap-1.5 text-[11px] text-neutral-400">
                                <Check className={`h-3 w-3 mt-0.5 flex-shrink-0 ${isSelected ? 'text-[#00F2EA]' : 'text-neutral-600'}`} />
                                <span>{f}</span>
                              </div>
                            ))}
                          </div>
                          {isSelected && (
                            <div className="mt-3 flex items-center justify-center gap-1 rounded-lg bg-[#FF0050] py-2 text-xs font-bold text-white">
                              <span>{dict.common.selected}</span>
                              <Check className="h-3 w-3" />
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <button
                  onClick={() => setStep('email')}
                  className="mt-5 w-full group relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#FF0050] to-[#ff2d6a] py-4 text-base font-bold text-white shadow-lg shadow-[#FF0050]/30 transition-all hover:shadow-xl hover:shadow-[#FF0050]/40 active:scale-[0.99]"
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    <Zap className="h-4 w-4" />
                    {t(dict.paidWall.ctaButton, { price: selectedPkg.price, count: selectedPkg.credits })}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                </button>
              </>
            )}
          </>
        )}

        {/* ── 输入邮箱（Guest Checkout：直接发起支付，无验证码往返）── */}
        {step === 'email' && (
          <form onSubmit={handleCheckout} className="mt-6 max-w-md mx-auto">
            <div className="rounded-2xl border border-neutral-800 bg-[#111] p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-[#FF0050]/10 flex items-center justify-center flex-shrink-0">
                  <Mail className="h-5 w-5 text-[#FF0050]" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">{dict.paidWall.emailTitle}</div>
                  <div className="text-[11px] text-neutral-500">{dict.paidWall.emailDesc}</div>
                </div>
              </div>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError('') }}
                  placeholder={dict.paidWall.emailPlaceholder}
                  className="w-full rounded-xl border border-neutral-700 bg-[#0a0a0a] px-4 py-3 pr-12 text-sm text-white placeholder-neutral-600 outline-none focus:border-[#FF0050] focus:ring-2 focus:ring-[#FF0050]/20 transition-colors"
                  autoFocus
                />
                {email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && (
                  <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[#00F2EA]" />
                )}
              </div>
              {error && <div className="mt-2 text-xs text-red-400">{error}</div>}
              <button
                type="submit"
                disabled={loading}
                className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl bg-[#FF0050] py-3 text-sm font-bold text-white hover:bg-[#e60049] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Zap className="h-4 w-4" />{t(dict.paidWall.ctaButton, { price: selectedPkg.price, count: selectedPkg.credits })}</>}
              </button>
              <button
                type="button"
                onClick={() => { setStep('choose'); setError(''); }}
                className="mt-2 w-full text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                {dict.paidWall.backToPackages}
              </button>
            </div>
            <div className="mt-3 rounded-xl bg-neutral-900/50 px-4 py-2.5 text-[11px] text-neutral-500 text-center">
              {t(dict.paidWall.purchaseSummary, { label: selectedPkg.label, price: selectedPkg.price, count: selectedPkg.credits })}
            </div>
          </form>
        )}

        {/* ── 老用户复购选择（检测到已有额度：验证恢复 = 青；直接再买 = 粉）── */}
        {step === 'returning-choice' && (
          <div className="mt-6 max-w-md mx-auto">
            <div className="rounded-2xl border border-neutral-800 bg-[#111] p-5 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-[#00F2EA]/10 flex items-center justify-center mb-3">
                <Sparkles className="h-6 w-6 text-[#00F2EA]" />
              </div>
              <div className="text-base font-bold text-white">{dict.verifyEmail.returningChoiceTitle}</div>
              <div className="mt-1 text-xs text-neutral-400">{dict.verifyEmail.returningChoiceDesc}</div>
              <div className="mt-4 space-y-2.5">
                <button
                  onClick={handleReturningVerifyUse}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#00F2EA] py-3 text-sm font-bold text-black hover:bg-[#00dccb] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><KeyRound className="h-4 w-4" />{dict.verifyEmail.verifyToUseCredits}</>}
                </button>
                <button
                  onClick={handleReturningBuyMore}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#FF0050] py-3 text-sm font-bold text-white hover:bg-[#e60049] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CreditCard className="h-4 w-4" />{dict.verifyEmail.buyMore}</>}
                </button>
              </div>
              {error && <div className="mt-2 text-xs text-red-400">{error}</div>}
              <button
                onClick={() => { setStep('email'); setError('') }}
                className="mt-2 w-full text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                {dict.verifyEmail.changeEmail}
              </button>
            </div>
          </div>
        )}

        {/* ── 老用户所有权验证（选择"验证恢复"后输码，无需重复购买）── */}
        {step === 'returning-code' && (
          <form onSubmit={handleReturningVerify} className="mt-6 max-w-md mx-auto">
            <div className="rounded-2xl border border-[#00F2EA]/30 bg-[#00F2EA]/5 p-5">
              <div className="text-center mb-4">
                <div className="mx-auto w-12 h-12 rounded-full bg-[#00F2EA]/10 flex items-center justify-center mb-3">
                  <Sparkles className="h-6 w-6 text-[#00F2EA]" />
                </div>
                <div className="text-base font-bold text-white">{dict.verifyEmail.codeTitle}</div>
                <div className="mt-1 text-xs text-neutral-400">{t(dict.verifyEmail.codeSent, { email })}</div>
              </div>
              <div className="rounded-lg border border-[#00F2EA]/20 bg-[#0a0a0a]/60 px-3 py-2 text-[11px] text-[#00F2EA] text-center leading-relaxed mb-4">
                {dict.verifyEmail.existingAccountHint}
              </div>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={returningCode}
                onChange={e => { setReturningCode(e.target.value); setError('') }}
                placeholder="——————"
                className="w-full rounded-xl border border-neutral-700 bg-[#0a0a0a] px-4 py-3 text-center text-xl font-black tracking-[0.5em] text-white placeholder-neutral-700 outline-none focus:border-[#00F2EA] focus:ring-2 focus:ring-[#00F2EA]/20 transition-colors"
                autoFocus
              />
              {error && <div className="mt-2 text-xs text-red-400 text-center">{error}</div>}
              <button
                type="submit"
                disabled={loading || returningCode.length !== 6}
                className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl bg-[#00F2EA] py-3 text-sm font-bold text-black hover:bg-[#00dccb] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4" />{dict.verifyEmail.verifyAndUnlock}</>}
              </button>
              <button
                type="button"
                onClick={() => { setStep('email'); setError(''); setReturningCode('') }}
                className="mt-2 w-full text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                {dict.verifyEmail.changeEmail}
              </button>
            </div>
          </form>
        )}

        {/* ── 成功态 ── */}
        {step === 'success' && (
          <div className="mt-6 max-w-md mx-auto">
            <div className="rounded-2xl border border-[#00F2EA]/40 bg-[#00F2EA]/5 p-6 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-[#00F2EA]/20 flex items-center justify-center mb-3">
                <CheckCircle2 className="h-8 w-8 text-[#00F2EA]" />
              </div>
              <div className="text-lg font-bold text-white">{dict.paidWall.successTitle}</div>
              {email && (
                <div className="mt-1 text-sm text-neutral-400">
                  {t(dict.paidWall.successMessage, { email, balance: balance?.credits ?? 0 })}
                </div>
              )}
              <div className="mt-3 text-xs text-neutral-500">{dict.paidWall.successLoading}</div>
            </div>
          </div>
        )}

        {/* ── 底部保障 ── */}
        {step === 'choose' && !(balance && balance.credits > 0) && (
          <div className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[10px] text-neutral-600">
            {dict.paidWall.footerGuarantees.map((text, i) => (
              <span key={i}>{text}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
