'use client'
// 登记挂牌：先查 eligibility（无 token 视为不合格，弹 PaidWall 引导付费评估），
// 通过后展示估值快照卡（徽章颜色读 TIER_COLORS）+ 表单，提交 POST /api/marketplace/listings，
// 成功跳转 listing 详情（My Listings 页由 Task 12 提供）。
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { getSessionToken } from '@/lib/credits-client'
import { TIER_COLORS } from '@/lib/tier'
import { PaidWallModal } from '@/components/PaidWallModal'
import type { EnDict } from '@/lib/i18n/dictionaries/en'

type Dict = EnDict['marketplace']

// /api/history 行（仅取快照卡需要的字段）
interface HistoryEvaluation {
  username: string
  tier: string
  followerCount: number
  businessValueMid: number
  businessValueHigh: number
  computedAt: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function SellForm({ dict }: { dict: Dict }) {
  const sp = useSearchParams()
  const username = (sp.get('username') || '').toLowerCase().trim()
  const [eligible, setEligible] = useState<boolean | null>(null)
  const [hasToken, setHasToken] = useState(false)
  const [snapshot, setSnapshot] = useState<HistoryEvaluation | null>(null)
  const [checkKey, setCheckKey] = useState(0)
  const [form, setForm] = useState({ askingPriceUsd: '', description: '', contactEmail: '', socialType: '', socialHandle: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [paidWallOpen, setPaidWallOpen] = useState(false)

  useEffect(() => {
    const token = getSessionToken()
    setHasToken(!!token)
    if (!token || !username) { setEligible(false); return }
    let cancelled = false
    fetch(`/api/marketplace/eligibility?username=${encodeURIComponent(username)}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(async d => {
        if (cancelled) return
        const ok = !!d.eligible
        setEligible(ok)
        if (!ok) return
        // 估值快照：eligibility 已保证 ownership+paid，从本人 history 记录取该账号估值数据
        try {
          const hres = await fetch('/api/history', { headers: { Authorization: `Bearer ${token}` } })
          const h = await hres.json()
          const row = (h.evaluations as HistoryEvaluation[] | undefined)?.find(e => e.username === username)
          if (row && !cancelled) setSnapshot(row)
        } catch { /* 快照缺失不阻塞登记 */ }
      })
      .catch(() => { if (!cancelled) setEligible(false) })
    return () => { cancelled = true }
  }, [username, checkKey])

  function mapError(code: string | undefined, fallback: string): string {
    switch (code) {
      case 'LISTING_REQUIRES_PAID_REPORT': return dict.requiresPaidReport
      case 'MAX_LISTINGS': return dict.maxListings
      case 'LISTING_EXISTS': return dict.alreadyListed
      case 'NO_EVALUATION': return dict.noEvaluation
      case 'INVALID_PRICE': return dict.priceRangeError
      case 'INVALID_CONTACT_EMAIL': return dict.emailError
      case 'SOCIAL_HANDLE_REQUIRED': return dict.handleRequired
      case 'UNAUTHORIZED': return dict.signInRequired
      default: return fallback
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError('')
    // 与服务端 validateListingInput 一致的预检
    const price = Number(form.askingPriceUsd)
    if (!Number.isFinite(price) || price < 1 || price > 10_000_000) { setError(dict.priceRangeError); return }
    if (!EMAIL_RE.test(form.contactEmail)) { setError(dict.emailError); return }
    if (form.socialType && !form.socialHandle.trim()) { setError(dict.handleRequired); return }

    setSubmitting(true)
    try {
      const token = getSessionToken()
      const res = await fetch('/api/marketplace/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          username,
          askingPriceUsd: price,
          description: form.description.trim() || null,
          contactEmail: form.contactEmail,
          socialType: form.socialType || null,
          socialHandle: form.socialHandle.trim() || null,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (d.ok && d.listing?.id) {
        window.location.href = `/marketplace/${d.listing.id}`
        return
      }
      if (d.code === 'LISTING_REQUIRES_PAID_REPORT' || d.code === 'UNAUTHORIZED') setPaidWallOpen(true)
      setError(mapError(d.code, d.error || dict.submitFailed))
    } catch {
      setError(dict.networkError)
    } finally {
      setSubmitting(false)
    }
  }

  if (!username) return <Shell dict={dict}><p className="text-neutral-400">{dict.missingUsername}</p></Shell>

  if (eligible === null) return <Shell dict={dict}><p className="text-neutral-500">{dict.checkingEligibility}</p></Shell>

  if (!eligible) {
    return (
      <Shell dict={dict}>
        <p className="text-[#FF0050] mb-6">{hasToken ? dict.requiresPaidReport : dict.signInRequired}</p>
        <button onClick={() => setPaidWallOpen(true)}
          className="bg-[#FF0050] hover:bg-[#e0004a] rounded-lg px-6 py-3 font-bold transition-colors">
          {dict.getPaidReport}
        </button>
        <PaidWallModal open={paidWallOpen} onClose={() => setPaidWallOpen(false)}
          onUnlock={() => { setPaidWallOpen(false); setCheckKey(k => k + 1) }}
          username={username} mode="evaluate" />
      </Shell>
    )
  }

  const color = snapshot?.tier ? TIER_COLORS[snapshot.tier] ?? '#fff' : '#fff'
  const fmt = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${Math.round(n / 1_000)}K` : `$${n}`

  return (
    <Shell dict={dict}>
      <div className="text-neutral-400 text-sm mb-4">{dict.listingAccount} <span className="text-white font-semibold">@{username}</span></div>

      {snapshot && (
        <div className="border border-neutral-800 rounded-2xl p-5 mb-6 bg-neutral-950">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-neutral-400">{dict.snapshotTitle}</span>
            {snapshot.tier && (
              <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ color, border: `1px solid ${color}` }}>{snapshot.tier}</span>
            )}
          </div>
          <div className="flex items-baseline gap-4 flex-wrap">
            <span className="text-2xl font-bold">{fmt(snapshot.businessValueMid)} – {fmt(snapshot.businessValueHigh)}</span>
            <span className="text-sm text-neutral-500">{dict.followers}: {(snapshot.followerCount ?? 0).toLocaleString()}</span>
          </div>
          {snapshot.computedAt && (
            <div className="text-xs text-neutral-500 mt-2">{dict.valuedAsOf} {new Date(snapshot.computedAt).toLocaleDateString('en-US')}</div>
          )}
        </div>
      )}

      <form onSubmit={submit} className="space-y-4 max-w-md">
        <Field label={dict.askingPrice} type="number" value={form.askingPriceUsd} onChange={v => setForm({ ...form, askingPriceUsd: v })} min={1} max={10_000_000} />
        <div>
          <label className="block text-sm text-neutral-400 mb-1">{dict.description}</label>
          <textarea maxLength={500} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm h-24 focus:border-[#00F2EA] outline-none" />
        </div>
        <Field label={dict.contactEmail} type="email" value={form.contactEmail} onChange={v => setForm({ ...form, contactEmail: v })} />
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm text-neutral-400 mb-1">{dict.socialChannel}</label>
            <select value={form.socialType} onChange={e => setForm({ ...form, socialType: e.target.value })}
              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm">
              <option value="">{dict.socialNone}</option>
              <option value="discord">Discord</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="telegram">Telegram</option>
            </select>
          </div>
          {form.socialType && (
            <div className="flex-1">
              <Field label={dict.socialHandle} type="text" value={form.socialHandle} onChange={v => setForm({ ...form, socialHandle: v })} />
            </div>
          )}
        </div>
        {error && <p className="text-sm text-[#FF0050]">{error}</p>}
        <button type="submit" disabled={submitting}
          className="w-full bg-[#FF0050] hover:bg-[#e0004a] disabled:opacity-50 rounded-lg py-3 font-bold transition-colors">
          {submitting ? dict.publishing : dict.publish}
        </button>
      </form>

      <PaidWallModal open={paidWallOpen} onClose={() => setPaidWallOpen(false)}
        onUnlock={() => { setPaidWallOpen(false); setCheckKey(k => k + 1) }}
        username={username} mode="evaluate" />
    </Shell>
  )
}

function Field({ label, type, value, onChange, min, max }: { label: string; type: string; value: string; onChange: (v: string) => void; min?: number; max?: number }) {
  return (
    <div>
      <label className="block text-sm text-neutral-400 mb-1">{label}</label>
      <input type={type} required value={value} min={min} max={max} onChange={e => onChange(e.target.value)}
        className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:border-[#00F2EA] outline-none" />
    </div>
  )
}

function Shell({ dict, children }: { dict: Dict; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white px-6 py-16 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">{dict.listForSale}</h1>
      {children}
    </main>
  )
}

export default function SellClient({ dict }: { dict: Dict }) {
  return (
    <Suspense fallback={<Shell dict={dict}><p className="text-neutral-500">{dict.loading}</p></Shell>}>
      <SellForm dict={dict} />
    </Suspense>
  )
}
