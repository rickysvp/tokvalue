'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import {
  X, Mail, KeyRound, CheckCircle2, Loader2, Sparkles,
  Zap, ArrowRight, Star, DollarSign, Shield, TrendingUp, Copy, CreditCard,
} from 'lucide-react'
import { useI18n, t } from '@/lib/i18n'
import { getUtm } from '@/lib/utm'
import { trackEvent } from '@/lib/track-client'
import type { CreditBalance, CreditPackage } from '@/lib/credits'
import { CREDIT_PACKAGES } from '@/lib/credits'
import {
  getActiveEmail, setActiveEmail, setPendingEmail, clearPendingEmail,
  fetchBalance, setSessionToken, getSessionToken,
} from '@/lib/credits-client'

type Step = 'choose' | 'email' | 'returning-choice' | 'code' | 'success'

interface VerifyEmailModalProps {
  isOpen: boolean
  onClose: () => void
  onUnlock: () => void
  existingBalance?: CreditBalance | null
  /** 'evaluate' = new account evaluation, 'unlock' = unlock previously saved evaluation, 'free' = 免费评估邮箱验证（跳过套餐选择） */
  mode?: 'evaluate' | 'unlock' | 'free'
}

const VALUE_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  DollarSign, Shield, TrendingUp,
}

export function VerifyEmailModal({ isOpen, onClose, onUnlock, existingBalance, mode = 'evaluate' }: VerifyEmailModalProps) {
  const { dict } = useI18n()
  const isUnlockMode = mode === 'unlock'
  const isFreeMode = mode === 'free'
  const [step, setStep] = useState<Step>('choose')
  const [selectedPkg, setSelectedPkg] = useState<CreditPackage>(CREDIT_PACKAGES[1])
  const [email, setEmail] = useState('')
  const [code, setCode] = useState<string[]>(['', '', '', '', '', ''])
  const [devCode, setDevCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [successBalance, setSuccessBalance] = useState<number | null>(null)
  const [balance, setBalance] = useState<CreditBalance | null>(existingBalance || null)
  const [showReturning, setShowReturning] = useState(false)
  const codeRefs = useRef<(HTMLInputElement | null)[]>([])
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const returnEmailRef = useRef<HTMLInputElement>(null)

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      // free 模式跳过套餐选择，直接进入邮箱验证步骤
      setStep(isFreeMode ? 'email' : 'choose')
      setError('')
      setCode(['', '', '', '', '', ''])
      setShowReturning(false)
      setBalance(existingBalance || null)
      if (!isFreeMode) {
        const activeEmail = getActiveEmail()
        if (activeEmail && !existingBalance) {
          fetchBalance(activeEmail).then(b => { if (b) setBalance(b) })
        }
      }
    }
  }, [isOpen, existingBalance, isFreeMode])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  // Focus first code input
  useEffect(() => {
    if (step === 'code') setTimeout(() => codeRefs.current[0]?.focus(), 100)
  }, [step])

  // Focus returning email input
  useEffect(() => {
    if (showReturning) setTimeout(() => returnEmailRef.current?.focus(), 100)
  }, [showReturning])

  useEffect(() => {
    return () => { if (cooldownTimer.current) clearInterval(cooldownTimer.current) }
  }, [])

  function startCooldown() {
    setCooldown(60)
    if (cooldownTimer.current) clearInterval(cooldownTimer.current)
    cooldownTimer.current = setInterval(() => {
      setCooldown(c => {
        if (c <= 1) { if (cooldownTimer.current) clearInterval(cooldownTimer.current); return 0 }
        return c - 1
      })
    }, 1000)
  }

  async function handleSendCode(e?: React.FormEvent) {
    e?.preventDefault()
    if (loading) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(dict.api.auth.INVALID_EMAIL)
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // returning 恢复 / free 免费验证走 '_returning' 通道（不产生购买记录）
        body: JSON.stringify({ email: email.trim(), packageId: showReturning || isFreeMode ? '_returning' : selectedPkg.id }),
      })
      const data = await res.json().catch(() => ({ error: dict.verifyEmail.sendFailed }))
      if (!res.ok) throw new Error(data.error || dict.verifyEmail.sendFailed)
      setDevCode(data.devCode || null)
      // 邮件投递失败时显示提示（即使返回 ok，用户仍可能没收到邮件）
      if (data.delivered === false) {
        setError(dict.verifyEmail.emailNotReceived ?? 'Check your inbox or spam folder.')
      }
      setPendingEmail(email.trim(), selectedPkg.id)
      setStep('code')
      startCooldown()
    } catch (err) {
      setError(err instanceof Error ? err.message : dict.api.auth.SEND_FAILED)
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (cooldown > 0 || loading) return
    await handleSendCode()
  }

  // ── 新用户直付：创建 Creem 支付会话并跳转（新邮箱 / 老用户复购共用）──
  // 支付即凭证，无需验证邮箱；支付成功回跳后由 guest claim 自动认领。
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
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) throw new Error(data.error || dict.verifyEmail.paymentStartFailed)

    // DEV_SKIP_PAYMENT：本地开发跳过支付直接解锁
    if (data.devMode) {
      setStep('success')
      setTimeout(() => { onClose(); onUnlock() }, 800)
      return
    }

    if (data.checkoutUrl) {
      // 记住邮箱：支付回跳后 guest claim 自动认领
      setActiveEmail(trimmed)
      window.location.href = data.checkoutUrl
      return
    }
    throw new Error(dict.verifyEmail.paymentStartFailed)
  }

  // ── 新用户主路径：输邮箱后先查状态再分流（无验证码直付）──
  // - free 模式：目的是验证邮箱所有权（免费额度），直接发码，不查余额、不发起购买
  // - 已有额度的邮箱（老用户）→ 转复购选择页：验证恢复 or 直接再买（购买与恢复是独立入口）
  // - 新邮箱 → 直接创建 Creem 支付会话并跳转，全程无验证码
  async function handleEmailSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (loading) return
    const trimmed = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError(dict.verifyEmail.invalidEmail)
      return
    }

    // free 模式：跳过 lookup 分流与购买，直接发验证码（handleSendCode 内部管理 loading）
    if (isFreeMode) {
      await handleSendCode()
      return
    }

    setLoading(true)
    setError('')
    try {
      // Step 1: 查询邮箱状态（限流防枚举，fail-open 按新用户处理）
      const lookupRes = await fetch('/api/credits/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      })
      const lookup = await lookupRes.json().catch(() => ({ hasCredits: false }))

      if (lookup.hasCredits) {
        // 老用户：给选择而非强制验证码——验证恢复用余额，或直接再买（囤货）
        setStep('returning-choice')
        return
      }

      // Step 2: 新用户 → Guest Checkout 直达支付
      await startGuestCheckout(trimmed)
    } catch (err) {
      setError(err instanceof Error ? err.message : dict.verifyEmail.paymentStartFailed)
    } finally {
      setLoading(false)
    }
  }

  // ── returning-choice：验证所有权恢复使用已有额度（青色通道，'_returning' 不产生购买记录）──
  async function handleReturningVerifyUse() {
    if (loading) return
    setShowReturning(true)
    await handleSendCode()
  }

  // ── returning-choice：直接复购（粉色通道，支付即凭证无需验证邮箱）──
  async function handleReturningBuyMore() {
    if (loading) return
    setLoading(true)
    setError('')
    try {
      await startGuestCheckout(email.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : dict.verifyEmail.paymentStartFailed)
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify(codeOverride?: string) {
    if (verifying) return
    const fullCode = codeOverride || code.join('')
    if (fullCode.length !== 6) {
      setError('Please enter the complete 6-digit code')
      return
    }
    setVerifying(true)
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: fullCode, ...(getUtm() ? { utm: getUtm() } : {}) }),
      })
      const data = await res.json().catch(() => ({ error: dict.verifyEmail.verifyFailed }))
      if (!res.ok) throw new Error(data.error || dict.verifyEmail.verifyFailed)

      // B7 Spec §15：验证码验证成功（拿到 session token 后，returning/新用户共用点）
      trackEvent('email_verified', { email: email.trim(), mode }, { email: email.trim() })

      clearPendingEmail()
      setActiveEmail(email.trim())

      // Returning user flow — no purchase, just verify email and get token
      if (data.returning) {
        if (data.token) setSessionToken(data.token)
        // Fetch their existing balance
        const bal = await fetchBalance(email.trim())
        if (bal) setBalance(bal)
        setStep('success')
        setTimeout(() => {
          onClose()
          onUnlock()
        }, 1500)
        return
      }

      // DEV 模式 / 直接发放额度：token 存到 localStorage（正式）
      if (data.token) setSessionToken(data.token)

      setBalance({
        email: email.trim(),
        credits: data.balance,
        totalPurchased: data.granted,
        verifiedAt: Date.now(),
        purchases: [],
      })
      setSuccessBalance(data.balance)
      setStep('success')
      setTimeout(() => {
        onClose()
        onUnlock()
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : dict.api.auth.VERIFY_FAILED)
      setCode(['', '', '', '', '', ''])
      setTimeout(() => codeRefs.current[0]?.focus(), 50)
    } finally {
      setLoading(false)
      setVerifying(false)
    }
  }

  function handleCodeChange(idx: number, value: string) {
    const v = value.replace(/\D/g, '').slice(-1)
    const newCode = [...code]
    newCode[idx] = v
    setCode(newCode)
    setError('')
    if (v && idx < 5) codeRefs.current[idx + 1]?.focus()
    if (newCode.every(c => c !== '')) setTimeout(() => handleVerify(newCode.join('')), 100)
  }

  function handleCodeKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !code[idx] && idx > 0) {
      codeRefs.current[idx - 1]?.focus()
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) {
      e.preventDefault()
      setCode(pasted.split(''))
      setTimeout(() => handleVerify(pasted), 100)
    }
  }

  function handleCopyCode() {
    if (!devCode) return
    navigator.clipboard.writeText(devCode).then(() => {
      setCopied(true)
      setCode(devCode.split(''))
      setTimeout(() => handleVerify(devCode), 200)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={handleOverlayClick}
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-[500px] max-h-[90vh] overflow-y-auto rounded-2xl border border-neutral-800 bg-[#0a0a0a] shadow-2xl shadow-black/50 animate-scale-in"
        role="dialog"
        aria-modal="true"
        aria-label={dict.verifyEmail.dialogAria}
      >
        {/* Top glow */}
        <div className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 w-[300px] h-32 bg-[#FF0050]/10 rounded-full blur-3xl" />

        <div className="relative p-6">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 rounded-lg p-1.5 text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors"
            aria-label={dict.common.close}
          >
            <X className="h-5 w-5" />
          </button>

          {/* ── Brand Header ── */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 mb-3">
              <Image src="/tokvalue.png" alt="TokValue" width={160} height={40} className="h-10 w-auto object-contain" />
            </div>
            <p className="text-xs text-neutral-400 max-w-sm mx-auto leading-relaxed">
              {dict.verifyEmail.brandSubtitle}
            </p>
          </div>

          {/* Step 1: Choose Package */}
          {step === 'choose' && (
            <>
              {/* ── Returning User Section ── */}
              {!showReturning ? (
                <div className="mb-5 rounded-xl border border-neutral-800 bg-[#111] p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white">{dict.verifyEmail.returnLabel}</div>
                      <div className="text-[11px] text-neutral-500 mt-0.5">{dict.verifyEmail.returnDesc}</div>
                    </div>
                    <button
                      onClick={() => setShowReturning(true)}
                      className="shrink-0 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:border-[#00F2EA]/40 hover:text-[#00F2EA] transition-colors"
                    >
                      {dict.verifyEmail.verifyExisting}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mb-5 rounded-xl border border-[#00F2EA]/20 bg-[#00F2EA]/5 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="h-4 w-4 text-[#00F2EA]" />
                    <span className="text-sm font-semibold text-[#00F2EA]">{dict.verifyEmail.verifyExisting}</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      ref={returnEmailRef}
                      type="email"
                      value={email}
                      onChange={e => { setEmail(e.target.value); setError('') }}
                      placeholder={dict.verifyEmail.emailPlaceholder}
                      className="flex-1 rounded-xl border border-neutral-700 bg-[#0a0a0a] px-3 py-2 text-sm text-white placeholder-neutral-600 outline-none focus:border-[#00F2EA] transition-colors"
                      onKeyDown={e => {
                        if (e.key === 'Enter' && email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                          handleSendCode(e)
                        }
                      }}
                    />
                    <button
                      onClick={(e) => handleSendCode(e as unknown as React.FormEvent)}
                      disabled={loading || !email}
                      className="shrink-0 rounded-xl bg-[#00F2EA] px-4 py-2 text-xs font-bold text-black hover:bg-[#00dccb] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : dict.verifyEmail.sendCode}
                    </button>
                  </div>
                  {error && <div className="mt-2 text-xs text-red-400">{error}</div>}
                  <button
                    onClick={() => { setShowReturning(false); setError('') }}
                    className="mt-2 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
                  >
                    {dict.verifyEmail.backToPackages}
                  </button>
                </div>
              )}

              {/* ── New User Section ── */}
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex-1 h-px bg-neutral-800" />
                  <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">{dict.verifyEmail.newUserLabel}</span>
                  <div className="flex-1 h-px bg-neutral-800" />
                </div>
                <div className="text-center mb-4">
                  <h2 className="text-lg font-bold text-white">
                    {isUnlockMode ? dict.verifyEmail.unlockChooseTitle : dict.verifyEmail.chooseTitle}
                  </h2>
                  <p className="mt-1 text-xs text-neutral-400">
                    {isUnlockMode ? dict.verifyEmail.unlockChooseSubtitle : dict.verifyEmail.chooseSubtitle}
                  </p>
                </div>

                {/* Value Proposition Cards */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {dict.verifyEmail.valueProps.map((prop, i) => {
                    const Icon = VALUE_ICON_MAP[prop.icon] || Sparkles
                    const colors = [
                      'border-[#FF0050]/20 bg-[#FF0050]/5 text-[#FF0050]',
                      'border-[#00F2EA]/20 bg-[#00F2EA]/5 text-[#00F2EA]',
                      'border-amber-500/20 bg-amber-500/5 text-amber-400',
                    ]
                    return (
                      <div key={i} className={`rounded-xl border ${colors[i]} p-3 text-center`}>
                        <Icon className="h-5 w-5 mx-auto mb-1.5" />
                        <div className="text-[11px] font-semibold text-white leading-tight">{prop.title}</div>
                        <div className="text-[10px] text-neutral-500 mt-0.5 leading-tight">{prop.desc}</div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Existing balance prompt */}
              {balance && balance.credits > 0 && (
                <div className="mb-4 rounded-xl border border-[#00F2EA]/30 bg-[#00F2EA]/5 p-4 text-center">
                  <div className="flex items-center justify-center gap-1.5 text-sm text-[#00F2EA]">
                    <Sparkles className="h-4 w-4" />
                    <span className="font-semibold">{t(isUnlockMode ? dict.verifyEmail.unlockCreditsAvailable : dict.verifyEmail.creditsAvailable, { count: balance.credits, email: balance.email })}</span>
                  </div>
                  <button
                    onClick={() => { onClose(); onUnlock() }}
                    className="mt-3 w-full rounded-xl bg-gradient-to-r from-[#00F2EA] to-[#66f7f3] py-2.5 text-sm font-bold text-black hover:shadow-lg hover:shadow-[#00F2EA]/30 transition-all"
                  >
                    <span className="flex items-center justify-center gap-2">
                      <Zap className="h-4 w-4" />
                      {isUnlockMode ? dict.verifyEmail.unlockUseCreditUnlock : dict.verifyEmail.useCreditUnlock}
                    </span>
                  </button>
                  <button
                    onClick={() => setBalance(null)}
                    className="mt-2 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
                  >
                    {dict.common.useDifferentEmail}
                  </button>
                </div>
              )}

              {/* Package cards */}
              {(!balance || balance.credits === 0) && (
                <>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {CREDIT_PACKAGES.map(pkg => {
                      const isSelected = selectedPkg.id === pkg.id
                      const pkgDict = dict.creditPackages[pkg.id as keyof typeof dict.creditPackages]
                      return (
                        <button
                          key={pkg.id}
                          onClick={() => setSelectedPkg(pkg)}
                          className={`relative rounded-xl border-2 p-3 text-left transition-all ${
                            isSelected
                              ? 'border-[#FF0050] bg-[#FF0050]/5 shadow-lg shadow-[#FF0050]/10'
                              : 'border-neutral-800 bg-[#111] hover:border-neutral-700'
                          }`}
                        >
                          {pkgDict?.badge && (
                            <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#FF0050] px-2 py-0.5 text-[9px] font-bold text-white">
                                <Star className="h-2 w-2" />
                                {pkgDict.badge}
                              </span>
                            </div>
                          )}
                          <div className="flex items-baseline gap-0.5">
                            <span className="text-[10px] text-neutral-400">$</span>
                            <span className={`text-2xl font-black ${isSelected ? 'text-white' : 'text-neutral-200'}`}>{pkg.price}</span>
                          </div>
                          <div className="mt-0.5 text-xs font-bold text-white">{pkgDict?.label ?? pkg.label}</div>
                          <div className="text-[10px] text-neutral-500">{pkg.credits} evaluations · {pkg.perUnit}</div>
                        </button>
                      )
                    })}
                  </div>

                  <button
                    onClick={() => setStep('email')}
                    className="w-full group relative overflow-hidden rounded-xl bg-gradient-to-r from-[#FF0050] to-[#ff2d6a] py-3 text-sm font-bold text-white shadow-lg shadow-[#FF0050]/20 hover:shadow-xl hover:shadow-[#FF0050]/30 transition-all"
                  >
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      {t(dict.paidWall.ctaButton, { price: selectedPkg.price, count: selectedPkg.credits })}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </span>
                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                  </button>

                  {/* Trust footer */}
                  <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[10px] text-neutral-600">
                    <span>{dict.common.noAutoRenewal}</span>
                    <span>{dict.common.emailLinked}</span>
                    <span>{dict.common.crossDevice}</span>
                  </div>
                </>
              )}
            </>
          )}

          {/* Step 2: Email（新用户 → 直付；老用户 → 复购选择；free 模式 → 直接发码验证） */}
          {step === 'email' && (
            <form onSubmit={handleEmailSubmit}>
              <div className="text-center mb-5">
                <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-3 ${isFreeMode ? 'bg-[#00F2EA]/10' : 'bg-[#FF0050]/10'}`}>
                  <Mail className={`h-6 w-6 ${isFreeMode ? 'text-[#00F2EA]' : 'text-[#FF0050]'}`} />
                </div>
                <h2 className="text-xl font-bold text-white">
                  {isFreeMode ? dict.verifyEmail.freeVerifyTitle : dict.verifyEmail.emailTitle}
                </h2>
                <p className="mt-1 text-sm text-neutral-400">
                  {isFreeMode ? dict.verifyEmail.freeVerifySubtitle : dict.verifyEmail.emailSubtitle}
                </p>
              </div>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError('') }}
                  placeholder={dict.verifyEmail.emailPlaceholder}
                  className={`w-full rounded-xl border border-neutral-700 bg-[#111] px-4 py-3 pr-12 text-sm text-white placeholder-neutral-600 outline-none transition-colors ${isFreeMode ? 'focus:border-[#00F2EA] focus:ring-2 focus:ring-[#00F2EA]/20' : 'focus:border-[#FF0050] focus:ring-2 focus:ring-[#FF0050]/20'}`}
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
                className={`mt-4 w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold disabled:opacity-60 disabled:cursor-not-allowed transition-colors ${isFreeMode ? 'bg-[#00F2EA] text-black hover:bg-[#00dccb]' : 'bg-[#FF0050] text-white hover:bg-[#e60049]'}`}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : isFreeMode
                  ? <><KeyRound className="h-4 w-4" />{dict.verifyEmail.sendCode}</>
                  : <><CreditCard className="h-4 w-4" />{dict.verifyEmail.continueToPayment}</>}
              </button>
              {!isFreeMode && (
                <p className="mt-3 text-center text-xs text-neutral-500">{dict.verifyEmail.noRegistration}</p>
              )}
              {!isFreeMode && (
                <button
                  type="button"
                  onClick={() => { setStep('choose'); setError('') }}
                  className="mt-2 w-full text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
                >
                  {dict.verifyEmail.backToPackages}
                </button>
              )}
            </form>
          )}

          {/* Step 2.5: returning-choice（老用户复购选择：验证恢复 = 青；直接再买 = 粉） */}
          {step === 'returning-choice' && (
            <div>
              <div className="text-center mb-5">
                <div className="mx-auto w-12 h-12 rounded-full bg-[#00F2EA]/10 flex items-center justify-center mb-3">
                  <Sparkles className="h-6 w-6 text-[#00F2EA]" />
                </div>
                <h2 className="text-xl font-bold text-white">{dict.verifyEmail.returningChoiceTitle}</h2>
                <p className="mt-1 text-sm text-neutral-400">{dict.verifyEmail.returningChoiceDesc}</p>
              </div>
              <div className="space-y-2.5">
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
              {error && <div className="mt-2 text-xs text-red-400 text-center">{error}</div>}
              <button
                onClick={() => { setStep('email'); setError('') }}
                className="mt-2 w-full text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                {dict.verifyEmail.changeEmail}
              </button>
            </div>
          )}

          {/* Step 3: Code */}
          {step === 'code' && (
            <div>
              <div className="text-center mb-5">
                <div className="mx-auto w-12 h-12 rounded-full bg-[#00F2EA]/10 flex items-center justify-center mb-3">
                  <KeyRound className="h-6 w-6 text-[#00F2EA]" />
                </div>
                <h2 className="text-xl font-bold text-white">{dict.verifyEmail.codeTitle}</h2>
                <p className="mt-1 text-sm text-neutral-400">
                  {t(dict.verifyEmail.codeSent, { email })}
                </p>
              </div>

              {devCode && (
                <div className="mb-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30 px-3 py-2 text-[11px] text-yellow-300 text-center">
                  <span className="font-semibold">{dict.verifyEmail.devCodeLabel}</span>
                  <button
                    onClick={handleCopyCode}
                    className="inline-flex items-center gap-1 ml-2 font-mono font-bold bg-yellow-500/20 px-2 py-1 rounded cursor-pointer hover:bg-yellow-500/30 transition-colors"
                  >
                    {devCode} {copied ? <CheckCircle2 className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              )}

              {showReturning && !isFreeMode && (
                <div className="mb-4 rounded-lg border border-[#00F2EA]/20 bg-[#00F2EA]/5 px-3 py-2 text-[11px] text-[#00F2EA] text-center leading-relaxed">
                  {dict.verifyEmail.existingAccountHint}
                </div>
              )}

              <div className="flex justify-center gap-2" onPaste={handlePaste}>
                {code.map((c, i) => (
                  <input
                    key={i}
                    ref={el => { codeRefs.current[i] = el }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={c}
                    aria-label={t(dict.verifyEmail.digitAria, { n: i + 1 })}
                    onChange={e => handleCodeChange(i, e.target.value)}
                    onKeyDown={e => handleCodeKeyDown(i, e)}
                    className="w-11 h-12 sm:w-12 sm:h-14 rounded-xl border border-neutral-700 bg-[#111] text-center text-xl font-black text-white outline-none focus:border-[#FF0050] focus:ring-2 focus:ring-[#FF0050]/20 transition-colors"
                  />
                ))}
              </div>

              {error && <div className="mt-3 text-center text-xs text-red-400">{error}</div>}

              <button
                onClick={() => handleVerify()}
                disabled={loading || verifying || code.some(c => !c)}
                className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl bg-[#FF0050] py-3 text-sm font-bold text-white hover:bg-[#e60049] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4" />{dict.verifyEmail.verifyAndUnlock}</>}
              </button>

              <div className="mt-3 flex items-center justify-between text-xs">
                <button
                  onClick={() => { setStep('email'); setCode(['', '', '', '', '', '']); setError('') }}
                  className="text-neutral-500 hover:text-neutral-300 transition-colors"
                >
                  {dict.verifyEmail.changeEmail}
                </button>
                <button
                  onClick={handleResend}
                  disabled={cooldown > 0 || loading}
                  className="text-[#00F2EA] hover:text-[#00dccb] disabled:text-neutral-600 disabled:cursor-not-allowed transition-colors"
                >
                  {cooldown > 0 ? t(dict.verifyEmail.resendIn, { s: cooldown }) : dict.verifyEmail.resendCode}
                </button>
              </div>

              {!showReturning && !isFreeMode && (
                <div className="mt-3 rounded-lg bg-neutral-900/50 px-3 py-2 text-center text-[11px] text-neutral-500">
                  {t(isUnlockMode ? dict.verifyEmail.unlockPackageSummary : dict.verifyEmail.packageSummary, { label: selectedPkg.label, price: selectedPkg.price, count: selectedPkg.credits })}
                </div>
              )}
            </div>
          )}

          {/* Step 4: Success */}
          {step === 'success' && (
            <div className="text-center py-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-[#00F2EA]/20 flex items-center justify-center mb-4">
                <CheckCircle2 className="h-9 w-9 text-[#00F2EA]" />
              </div>
              <h2 className="text-xl font-bold text-white">{dict.verifyEmail.successTitle}</h2>
              <p className="mt-2 text-sm text-neutral-400">
                {isFreeMode
                  ? dict.verifyEmail.freeVerifiedSuccess
                  : t(isUnlockMode ? dict.verifyEmail.unlockSuccessMessage : dict.verifyEmail.successMessage, { email, balance: successBalance ?? 0 })}
              </p>
              <p className="mt-3 text-xs text-neutral-500">{dict.verifyEmail.successClosing}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}