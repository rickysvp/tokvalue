'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Loader2, Share2, Copy, Check, Gift, Clock3,
  Wallet, TrendingUp, Users, Send, AlertCircle,
} from 'lucide-react'
import { getSessionToken, getActiveEmail } from '@/lib/credits-client'
import { useI18n } from '@/lib/i18n'

interface CommissionItem {
  id: number
  referrer_email: string
  buyer_email: string
  package_id: string
  amount: number
  commission: number
  status: 'pending' | 'settled' | 'voided'
  created_at: string
  settled_at: string | null
}

interface Overview {
  referralCode: string | null
  referralLink: string | null
  settled: number
  pending: number
  voided: number
  totalEarned: number
  commissions: CommissionItem[]
}

interface PayoutItem {
  id: number
  email: string
  amount: number
  usdc_address: string
  status: 'requested' | 'processing' | 'paid' | 'rejected'
  tx_hash: string | null
  reject_reason: string | null
  created_at: string
  processed_at: string | null
}

interface WithdrawData {
  settledTotal: number
  reserved: number
  withdrawable: number
  hasPriorPayout: boolean
  minWithdraw: number
  payouts: PayoutItem[]
}

const STATUS_META: Record<CommissionItem['status'], { label: string; cls: string }> = {
  settled: { label: 'Settled', cls: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' },
  pending: { label: 'Pending', cls: 'text-amber-400 bg-amber-400/10 border-amber-400/20' },
  voided: { label: 'Voided', cls: 'text-neutral-500 bg-neutral-500/10 border-neutral-500/20' },
}

const PAYOUT_STATUS_META: Record<PayoutItem['status'], { label: string; cls: string }> = {
  requested: { label: 'Requested', cls: 'text-amber-400 bg-amber-400/10 border-amber-400/20' },
  processing: { label: 'Processing', cls: 'text-sky-400 bg-sky-400/10 border-sky-400/20' },
  paid: { label: 'Paid', cls: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' },
  rejected: { label: 'Rejected', cls: 'text-neutral-500 bg-neutral-500/10 border-neutral-500/20' },
}

export default function ReferralPage() {
  const router = useRouter()
  const { dict } = useI18n()
  const [overview, setOverview] = useState<Overview | null>(null)
  const [withdraw, setWithdraw] = useState<WithdrawData | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(false)
  const [copied, setCopied] = useState(false)

  // 提现表单
  const [address, setAddress] = useState('')
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    const token = getSessionToken()
    if (!token || !getActiveEmail()) {
      setAuthError(true)
      setLoading(false)
      return
    }
    try {
      const [refRes, wdRes] = await Promise.all([
        fetch('/api/referral', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }),
        fetch('/api/referral/withdraw', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }),
      ])

      if (refRes.status === 401 || wdRes.status === 401) {
        setAuthError(true)
        setLoading(false)
        return
      }

      const refData = await refRes.json().catch(() => null)
      if (refData?.referralCode) setOverview(refData)

      const wdData = await wdRes.json().catch(() => null)
      if (wdData && typeof wdData.withdrawable === 'number') setWithdraw(wdData)
    } catch {
      // 网络抖动 / 首次编译连接重置：不卡 loading，交给下方 !overview 空态兜底
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const copyLink = useCallback(async () => {
    if (!overview?.referralLink) return
    try {
      await navigator.clipboard.writeText(overview.referralLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = overview.referralLink
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [overview])

  const submitWithdraw = useCallback(async () => {
    if (!withdraw) return
    setFormError(null)
    setFormSuccess(null)

    const token = getSessionToken()
    const amt = Number(amount)
    const addr = address.trim()

    if (!addr) {
      setFormError(dict.referral.invalidAddress)
      return
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setFormError(dict.referral.belowMin)
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/referral/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount: amt, address: addr }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        const code = data?.code
        setFormError(
          code === 'INVALID_ADDRESS' ? dict.referral.invalidAddress :
          code === 'BELOW_MIN' ? dict.referral.belowMin :
          code === 'INSUFFICIENT_BALANCE' ? dict.referral.insufficient :
          'Withdrawal failed'
        )
        return
      }
      setFormSuccess(dict.referral.withdrawSuccess)
      setAmount('')
      setAddress('')
      await loadData()
    } catch {
      setFormError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }, [withdraw, amount, address, dict, loadData])

  // ── 未登录 ──
  if (authError) {
    return (
      <main className="min-h-screen mx-auto max-w-4xl px-4 py-12">
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-[#FF0050] transition-colors">
            <ArrowLeft className="h-4 w-4" />
            {dict.referral.backToEvaluation}
          </Link>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-[#141414] p-12 text-center">
          <Gift className="mx-auto h-10 w-10 text-neutral-600 mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">{dict.referral.signInPrompt}</h2>
          <button
            onClick={() => router.push('/')}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#FF0050] to-[#e60049] px-5 py-2.5 text-sm font-semibold text-white hover:from-[#e60049] hover:to-[#cc0040] transition-all shadow-lg shadow-[#FF0050]/25"
          >
            Back to Home <ArrowLeft className="h-4 w-4" />
          </button>
        </div>
      </main>
    )
  }

  // ── 加载中 ──
  if (loading) {
    return (
      <main className="min-h-screen mx-auto max-w-4xl px-4 py-12">
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-[#FF0050] transition-colors">
            <ArrowLeft className="h-4 w-4" />
            {dict.referral.backToEvaluation}
          </Link>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-[#141414] p-12 text-center">
          <Loader2 className="mx-auto h-10 w-10 text-neutral-600 mb-4 animate-spin" />
          <p className="text-neutral-400">{dict.referral.loading}</p>
        </div>
      </main>
    )
  }

  if (!overview) {
    return (
      <main className="min-h-screen mx-auto max-w-4xl px-4 py-12">
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-[#FF0050] transition-colors">
            <ArrowLeft className="h-4 w-4" />
            {dict.referral.backToEvaluation}
          </Link>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-[#141414] p-12 text-center">
          <p className="text-neutral-400 mb-4">{dict.referral.loadFailed || 'Failed to load. Please try again.'}</p>
          <button
            onClick={loadData}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#FF0050] to-[#e60049] px-5 py-2.5 text-sm font-semibold text-white hover:from-[#e60049] hover:to-[#cc0040] transition-all"
          >
            Retry
          </button>
        </div>
      </main>
    )
  }

  const o = overview!

  return (
    <main className="min-h-screen mx-auto max-w-4xl px-4 py-12">
      <div className="mb-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-[#FF0050] transition-colors">
          <ArrowLeft className="h-4 w-4" />
          {dict.referral.backToEvaluation}
        </Link>
      </div>

      {/* 标题 */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight">{dict.referral.title}</h1>
        <p className="text-neutral-400 mt-2">{dict.referral.description}</p>
      </div>

      {/* 推荐链接卡片 */}
      <div className="rounded-2xl border border-neutral-800 bg-[#141414] p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Share2 className="h-5 w-5 text-[#FF0050]" />
          <h2 className="text-lg font-semibold text-white">{dict.referral.yourLink}</h2>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3 font-mono text-sm text-neutral-300 break-all">
            {o.referralLink}
          </div>
          <button
            onClick={copyLink}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#FF0050] to-[#e60049] px-5 py-3 text-sm font-semibold text-white hover:from-[#e60049] hover:to-[#cc0040] transition-all shadow-lg shadow-[#FF0050]/25 shrink-0"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? dict.referral.copied : dict.referral.copyLink}
          </button>
        </div>
        <div className="mt-4 flex items-center gap-2 text-sm text-neutral-500">
          <Gift className="h-4 w-4 text-[#FF0050]" />
          <span>
            <span className="text-white font-semibold">{dict.referral.commissionRate}</span>
            {' · '}
            {dict.referral.commissionRateDesc}
          </span>
        </div>
        <div className="mt-2 flex items-start gap-2 text-xs text-neutral-500">
          <Clock3 className="h-3.5 w-3.5 mt-0.5 text-amber-400 shrink-0" />
          <span>{dict.referral.protectionNote}</span>
        </div>
      </div>

      {/* 余额卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-5">
          <div className="flex items-center gap-2 text-emerald-400 mb-1">
            <Wallet className="h-4 w-4" />
            <span className="text-xs font-medium">{dict.referral.settled}</span>
          </div>
          <div className="text-3xl font-bold text-white">${o.settled.toFixed(2)}</div>
        </div>
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-5">
          <div className="flex items-center gap-2 text-amber-400 mb-1">
            <Clock3 className="h-4 w-4" />
            <span className="text-xs font-medium">{dict.referral.pending}</span>
          </div>
          <div className="text-3xl font-bold text-white">${o.pending.toFixed(2)}</div>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
          <div className="flex items-center gap-2 text-neutral-400 mb-1">
            <TrendingUp className="h-4 w-4" />
            <span className="text-xs font-medium">{dict.referral.totalEarned}</span>
          </div>
          <div className="text-3xl font-bold text-white">${o.totalEarned.toFixed(2)}</div>
        </div>
      </div>

      {/* ── USDC 提现 ── */}
      <div className="rounded-2xl border border-neutral-800 bg-[#141414] p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Wallet className="h-5 w-5 text-cyan-400" />
          <h2 className="text-lg font-semibold text-white">{dict.referral.withdrawTitle}</h2>
        </div>

        {withdraw && (
          <>
            {/* 可提现余额 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
              <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] p-4">
                <div className="text-xs text-cyan-400 mb-1">{dict.referral.withdrawable}</div>
                <div className="text-2xl font-bold text-white">${withdraw.withdrawable.toFixed(2)}</div>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
                <div className="text-xs text-neutral-500 mb-1">{dict.referral.settledTotal}</div>
                <div className="text-2xl font-bold text-neutral-300">${withdraw.settledTotal.toFixed(2)}</div>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
                <div className="text-xs text-neutral-500 mb-1">{dict.referral.reserved}</div>
                <div className="text-2xl font-bold text-neutral-300">${withdraw.reserved.toFixed(2)}</div>
              </div>
            </div>

            {/* 提现表单 */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1.5">
                  {dict.referral.usdcAddress}
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder={dict.referral.usdcAddressPlaceholder}
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3 text-sm text-white font-mono placeholder:text-neutral-600 focus:outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/30 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1.5">
                  {dict.referral.amountLabel}
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  min={withdraw.minWithdraw}
                  step="0.01"
                  placeholder={`Min $${withdraw.minWithdraw}`}
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/30 transition-colors"
                />
              </div>

              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span>
                  {withdraw.hasPriorPayout
                    ? dict.referral.minWithdrawSubsequent.replace('{{min}}', String(withdraw.minWithdraw))
                    : dict.referral.minWithdrawFirst.replace('{{min}}', String(withdraw.minWithdraw))}
                </span>
              </div>

              {formError && (
                <div className="flex items-center gap-2 text-sm text-red-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}
              {formSuccess && (
                <div className="flex items-center gap-2 text-sm text-emerald-400">
                  <Check className="h-4 w-4 shrink-0" />
                  <span>{formSuccess}</span>
                </div>
              )}

              <button
                onClick={submitWithdraw}
                disabled={submitting || withdraw.withdrawable < withdraw.minWithdraw}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-sky-500 px-5 py-3 text-sm font-semibold text-white hover:from-cyan-600 hover:to-sky-600 transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {dict.referral.requestWithdraw}
              </button>
            </div>

            {/* 提现历史 */}
            {withdraw.payouts.length > 0 && (
              <div className="mt-6 pt-5 border-t border-neutral-800/60">
                <h3 className="text-sm font-semibold text-white mb-3">{dict.referral.withdrawHistory}</h3>
                <div className="divide-y divide-neutral-800/60">
                  {withdraw.payouts.map(p => {
                    const meta = PAYOUT_STATUS_META[p.status]
                    return (
                      <div key={p.id} className="py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white">${p.amount.toFixed(2)}</div>
                          <div className="text-xs text-neutral-500 mt-0.5 font-mono truncate">
                            {p.usdc_address.slice(0, 10)}…{p.usdc_address.slice(-6)}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium border ${meta.cls}`}>
                            {meta.label}
                          </span>
                          <div className="text-xs text-neutral-500 mt-1">
                            {new Date(p.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 明细 */}
      <div className="rounded-2xl border border-neutral-800 bg-[#141414] p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-5 w-5 text-cyan-400" />
          <h2 className="text-lg font-semibold text-white">{dict.referral.recentCommissions}</h2>
        </div>

        {o.commissions.length === 0 ? (
          <div className="text-center py-10">
            <Gift className="mx-auto h-8 w-8 text-neutral-700 mb-3" />
            <p className="text-neutral-500">{dict.referral.noCommissions}</p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-800/60">
            {o.commissions.map(c => {
              const meta = STATUS_META[c.status]
              return (
                <div key={c.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-neutral-300 truncate">{c.buyer_email}</span>
                    </div>
                    <div className="text-xs text-neutral-500 mt-0.5">
                      {c.package_id} · {new Date(c.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold text-white">${c.commission.toFixed(2)}</div>
                    <div className="text-xs text-neutral-500">of ${c.amount.toFixed(2)}</div>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${meta.cls}`}>
                      {meta.label}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
