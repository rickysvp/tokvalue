'use client'
import { useEffect, useState } from 'react'
import { getSessionToken, setSessionToken } from '@/lib/credits-client'
import { TIER_COLORS } from '@/lib/tier'
import type { EnDict } from '@/lib/i18n/dictionaries/en'
import { Lock, Clock, Flag, CheckCircle2 } from 'lucide-react'

interface PublicListing {
  id: string
  username: string
  askingPriceUsd: number
  description: string | null
  status: string
  snapshot: {
    tier: string | null
    valuationUsd: number | null
    valuationLow: number | null
    valuationHigh: number | null
    followers: number | null
    engagementRate: number | null
    evaluatedAt: string | null
  }
}
interface Contact { email: string; socialType: string | null; socialHandle: string | null }
type Dict = EnDict['marketplace']

export default function ListingDetailClient({ listing, paidReturn, dict }: { listing: PublicListing; paidReturn?: { email: string }; dict: Dict }) {
  const [contact, setContact] = useState<Contact | null>(null)
  const [fullName, setFullName] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [emailInput, setEmailInput] = useState(paidReturn?.email || '')

  // 已登录：拉详情看是否已解锁
  useEffect(() => {
    const token = getSessionToken()
    fetch(`/api/marketplace/listings/${listing.id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.unlocked && d.contact) { setContact(d.contact); if (d.listing?.username) setFullName(d.listing.username) } })
      .catch(() => {})
  }, [listing.id])

  // 支付回跳：轮询 claim（最多 6 次 × 3s），成功后刷新解锁状态
  useEffect(() => {
    if (!paidReturn) return
    let tries = 0
    const timer = setInterval(async () => {
      tries++
      try {
        const token = getSessionToken()
        const res = await fetch('/api/credits/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ email: paidReturn.email }),
        })
        const d = await res.json()
        if (d?.unlocked || tries >= 6) {
          clearInterval(timer)
          if (d?.token) setSessionToken(d.token)
          await refreshContact()
        }
      } catch { if (tries >= 6) clearInterval(timer) }
    }, 3000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paidReturn, listing.id])

  async function handleUnlock() {
    setLoading(true); setError('')
    try {
      const token = getSessionToken()
      const res = await fetch('/api/marketplace/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ listingId: listing.id, email: emailInput }),
      })
      const d = await res.json()
      if (d.alreadyUnlocked || d.unlocked) { await refreshContact(); return }
      if (d.checkoutUrl) { window.location.href = d.checkoutUrl; return }
      setError(d.code === 'UNAUTHORIZED' || d.code === 'INVALID_EMAIL' ? dict.enterEmailToPay : (d.error || dict.unlockFailed))
    } catch { setError(dict.networkError) } finally { setLoading(false) }
  }

  async function refreshContact() {
    const token = getSessionToken()
    const res = await fetch(`/api/marketplace/listings/${listing.id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    const d = await res.json()
    if (d?.contact) {
      setContact(d.contact)
      if (d.listing?.username) setFullName(d.listing.username)
      requestAnimationFrame(() => document.getElementById('contact-box')?.scrollIntoView({ behavior: 'smooth' }))
    }
  }

  async function handleReport() {
    const token = getSessionToken()
    if (!token) { setError(dict.signInToReport); return }
    await fetch('/api/marketplace/report', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ listingId: listing.id }) })
    alert(dict.reportSubmitted)
  }

  const s = listing.snapshot
  const color = s.tier ? TIER_COLORS[s.tier] ?? '#fff' : '#fff'

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white px-6 py-16 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-bold">@{fullName ?? listing.username}</h1>
        {s.tier && <span className="text-sm font-bold px-3 py-1 rounded-lg" style={{ color, border: `1px solid ${color}` }}>{s.tier}</span>}
      </div>
      <div className="grid grid-cols-3 gap-4 my-8">
        {[
          { label: dict.followers, value: (s.followers ?? 0).toLocaleString() },
          { label: dict.engagement, value: s.engagementRate != null ? `${s.engagementRate.toFixed(1)}%` : '—' },
          { label: dict.valuation, value: s.valuationLow != null && s.valuationHigh != null ? `$${s.valuationLow.toLocaleString()}–$${s.valuationHigh.toLocaleString()}` : s.valuationUsd != null ? `$${s.valuationUsd.toLocaleString()}` : '—' },
        ].map(k => (
          <div key={k.label} className="border border-neutral-800 rounded-xl p-4 bg-neutral-950">
            <div className="text-xs text-neutral-500 mb-1">{k.label}</div>
            <div className="text-xl font-bold">{k.value}</div>
          </div>
        ))}
      </div>
      {listing.description && <p className="text-neutral-300 mb-8 whitespace-pre-wrap">{listing.description}</p>}
      <div className="flex items-baseline gap-3 mb-8">
        <span className="text-sm text-neutral-500">{dict.dealPrice}</span>
        <span className="text-4xl font-extrabold text-[#FF0050]">${listing.askingPriceUsd.toLocaleString()}</span>
        <span className="text-sm text-neutral-500 flex items-center gap-1"><Clock size={14} />{dict.valuedAsOf} {s.evaluatedAt ? new Date(s.evaluatedAt).toLocaleDateString('en-US') : '—'}</span>
      </div>

      <div id="contact-box" className="border border-neutral-800 rounded-2xl p-6 mb-8 bg-neutral-950">
        {contact ? (
          <div>
            <div className="flex items-center gap-2 text-[#00F2EA] font-semibold mb-4"><CheckCircle2 size={18} />{dict.unlocked}</div>
            <p className="mb-2">{dict.emailLabel}: <a className="text-[#00F2EA] underline" href={`mailto:${contact.email}`}>{contact.email}</a></p>
            {contact.socialType && <p>{contact.socialType}: {contact.socialHandle}</p>}
          </div>
        ) : (
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-neutral-400 mb-4"><Lock size={18} />{dict.contactHidden}</div>
            <input type="email" value={emailInput} onChange={e => setEmailInput(e.target.value)} placeholder={dict.emailPlaceholder}
              className="w-full max-w-xs bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-2.5 mb-3 text-sm focus:border-[#00F2EA] outline-none" />
            <button onClick={handleUnlock} disabled={loading}
              className="w-full max-w-xs bg-[#FF0050] hover:bg-[#e0004a] disabled:opacity-50 rounded-lg py-3 font-bold transition-colors">
              {loading ? dict.loading : dict.unlockContact}
            </button>
            {error && <p className="text-sm text-[#FF0050] mt-2">{error}</p>}
          </div>
        )}
      </div>

      <button onClick={handleReport} className="text-xs text-neutral-600 hover:text-neutral-400 flex items-center gap-1"><Flag size={12} />{dict.reportListing}</button>
      <p className="text-xs text-neutral-600 mt-8 border-t border-neutral-800 pt-4">{dict.disclaimer}</p>
    </main>
  )
}
