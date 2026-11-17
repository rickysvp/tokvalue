'use client'
// 登记挂牌：先查 eligibility（无 token 视为不合格，弹 PaidWall 引导付费评估），
// 通过后展示估值快照卡 + 报价锚点滑杆 + 表单，提交 POST /api/marketplace/listings。
// 页面结构：Hero（价值主张 + 真实市场数字）→ 表单/流程两栏 → FAQ。
import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSessionToken } from '@/lib/credits-client'
import { TIER_COLORS } from '@/lib/tier'
import { PaidWallModal } from '@/components/PaidWallModal'
import type { EnDict } from '@/lib/i18n/dictionaries/en'

type Dict = EnDict['marketplace']

export interface SellStats {
  active: number
  sold: number
  medianDiscountPct: number | null
  medianDaysToSell: number | null
}

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

function money(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`
  return `$${Math.round(n)}`
}

function SellForm({ dict, stats }: { dict: Dict; stats: SellStats }) {
  const router = useRouter()
  const sp = useSearchParams()
  const username = (sp.get('username') || '').toLowerCase().trim()
  const [eligible, setEligible] = useState<boolean | null>(null)
  const [hasToken, setHasToken] = useState(false)
  const [evaluated, setEvaluated] = useState(false)
  const [snapshot, setSnapshot] = useState<HistoryEvaluation | null>(null)
  const [checkKey, setCheckKey] = useState(0)
  const [form, setForm] = useState({ askingPriceUsd: '', description: '', contactEmail: '', socialType: '', socialHandle: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [paidWallOpen, setPaidWallOpen] = useState(false)
  const [pct, setPct] = useState(70)

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
        // 本人历史评估记录：既用于快照卡，也用于区分“没评估”与“评估过但未付费”
        let row: HistoryEvaluation | undefined
        try {
          const hres = await fetch('/api/history', { headers: { Authorization: `Bearer ${token}` } })
          const h = await hres.json()
          row = (h.evaluations as HistoryEvaluation[] | undefined)?.find(e => e.username === username)
        } catch { /* 查询失败按未评估处理 */ }
        if (cancelled) return
        setEvaluated(!!row)
        if (ok && row) {
          setSnapshot(row)
          // 默认把滑杆落在这个号的中值位置，卖家可以直接改
          if (row.businessValueMid) {
            const suggested = Math.max(100, Math.round((row.businessValueMid * 0.7) / 100) * 100)
            setForm(f => ({ ...f, askingPriceUsd: String(suggested) }))
          }
        }
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

  if (!username) return (
    <Hero dict={dict} stats={stats}>
      <UsernameGate dict={dict} />
      <p className="text-xs text-neutral-500 mt-3 max-w-lg">{dict.sellFeeNote}</p>
      <div className="grid sm:grid-cols-2 gap-x-10 gap-y-8 mt-12">
        <FlowAndFaq dict={dict} part="flow" />
        <FlowAndFaq dict={dict} part="faq" />
      </div>
      <Link href="/marketplace" className="inline-block text-sm text-[#00F2EA] hover:underline mt-8">{dict.seeMarketplace} →</Link>
    </Hero>
  )

  if (eligible === null) return <Hero dict={dict} stats={stats}><p className="text-neutral-500">{dict.checkingEligibility}</p></Hero>

  if (!eligible) {
    // 未评估过该账号 → 引导先去评估；评估过但未付费 → 弹付费墙升级完整报告
    if (hasToken && evaluated) {
      return (
        <Hero dict={dict} stats={stats}>
          <p className="text-[#FF0050] mb-6">{dict.requiresPaidReport}</p>
          <button onClick={() => setPaidWallOpen(true)}
            className="bg-[#FF0050] hover:bg-[#e0004a] rounded-lg px-6 py-3 font-bold transition-colors">
            {dict.getPaidReport}
          </button>
          <PaidWallModal open={paidWallOpen} onClose={() => setPaidWallOpen(false)}
            onUnlock={() => { setPaidWallOpen(false); setCheckKey(k => k + 1) }}
            username={username} mode="evaluate" />
        </Hero>
      )
    }
    return (
      <Hero dict={dict} stats={stats}>
        <p className="text-neutral-300 mb-6">{dict.sellEvaluateFirst}</p>
        <Link href={`/evaluate/${encodeURIComponent(username)}`}
          className="inline-block bg-[#00F2EA] hover:bg-[#00d9d2] text-black rounded-lg px-6 py-3 font-bold transition-colors">
          {dict.evaluateThisAccount} → @{username}
        </Link>
        <div className="mt-4">
          <button onClick={() => router.replace('/sell')} className="text-sm text-neutral-500 hover:text-neutral-300 underline">← {dict.prevPage}</button>
        </div>
      </Hero>
    )
  }

  const color = snapshot?.tier ? TIER_COLORS[snapshot.tier] ?? '#fff' : '#fff'
  const mid = snapshot?.businessValueMid ?? null
  const sliderAsk = mid ? Math.max(100, Math.round((mid * pct) / 100 / 100) * 100) : null
  const deltaPct = mid && sliderAsk ? Math.round(((sliderAsk - mid) / mid) * 100) : null

  return (
    <Hero dict={dict} stats={stats} compact>
      <div className="text-neutral-400 text-sm mb-4">{dict.listingAccount} <span className="text-white font-semibold">@{username}</span></div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-8">
        {/* 左：估值快照 → 报价锚点 → 表单 */}
        <div>
          {snapshot && (
            <div className="border border-neutral-800 rounded-2xl p-5 mb-6 bg-neutral-950">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-neutral-400">{dict.snapshotTitle}</span>
                {snapshot.tier && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ color, border: `1px solid ${color}` }}>{snapshot.tier}</span>
                )}
              </div>
              <div className="flex items-baseline gap-4 flex-wrap">
                <span className="text-2xl font-bold">{money(snapshot.businessValueMid)} – {money(snapshot.businessValueHigh)}</span>
                <span className="text-sm text-neutral-500">{dict.followers}: {(snapshot.followerCount ?? 0).toLocaleString()}</span>
              </div>
              {snapshot.computedAt && (
                <div className="text-xs text-neutral-500 mt-2">{dict.valuedAsOf} {new Date(snapshot.computedAt).toLocaleDateString('en-US')}</div>
              )}
            </div>
          )}

          {mid && (
            <div className="border border-neutral-800 rounded-2xl p-5 mb-6 bg-neutral-950">
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <span className="text-sm font-semibold">{dict.priceAnchorTitle}</span>
                <span className="text-xs text-neutral-500">{pct}% {dict.priceAnchorPercent}</span>
              </div>
              <p className="text-xs text-neutral-500 mb-4">{dict.priceAnchorHint}</p>
              <input type="range" min={55} max={100} step={1} value={pct}
                onChange={e => {
                  const p = Number(e.target.value)
                  setPct(p)
                  setForm(f => ({ ...f, askingPriceUsd: String(Math.max(100, Math.round((mid * p) / 100 / 100) * 100)) }))
                }}
                className="w-full accent-[#FF0050] mb-3" aria-label={dict.priceAnchorTitle} />
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-neutral-500">{dict.priceAnchorAsk}</div>
                  <div className="text-xl font-bold text-[#FF0050]">{sliderAsk ? money(sliderAsk) : '—'}</div>
                </div>
                {deltaPct != null && (
                  <span className="text-xs text-neutral-400">{deltaPct > 0 ? '+' : '−'}{Math.abs(deltaPct)}% {dict.priceAnchorVsMid}</span>
                )}
              </div>
              <p className="text-[11px] text-neutral-500 mt-3">
                {stats.medianDiscountPct != null
                  ? dict.priceAnchorMarket.replace('{n}', String(stats.medianDiscountPct))
                  : dict.priceAnchorNoMarket}
              </p>
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <Field label={dict.askingPrice} type="number" value={form.askingPriceUsd} onChange={v => setForm({ ...form, askingPriceUsd: v })} min={1} max={10_000_000} />
            <div>
              <label className="block text-sm text-neutral-400 mb-1">{dict.description}</label>
              <textarea maxLength={500} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm h-28 focus:border-[#00F2EA] outline-none" />
              <div className="text-[11px] text-neutral-600 mt-1">{form.description.length}/500</div>
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
            <p className="text-[11px] text-neutral-500">{dict.sellFeeNote}</p>
          </form>
        </div>

        {/* 右：流程 + 常见问题 */}
        <aside className="space-y-6">
          <FlowAndFaq dict={dict} part="flow" />
          <FlowAndFaq dict={dict} part="faq" />
          <Link href="/marketplace" className="inline-block text-sm text-[#00F2EA] hover:underline">{dict.seeMarketplace} →</Link>
        </aside>
      </div>

      <PaidWallModal open={paidWallOpen} onClose={() => setPaidWallOpen(false)}
        onUnlock={() => { setPaidWallOpen(false); setCheckKey(k => k + 1) }}
        username={username} mode="evaluate" />
    </Hero>
  )
}

// 流程与 FAQ 复用在"未输入用户名"的首屏：首访用户也需要看到怎么卖、费用、常见顾虑
function FlowAndFaq({ dict, part }: { dict: Dict; part: 'flow' | 'faq' }) {
  if (part === 'flow') {
    const steps: Array<[string, string]> = [
      [dict.sellFlowStep1Title, dict.sellFlowStep1Desc],
      [dict.sellFlowStep2Title, dict.sellFlowStep2Desc],
      [dict.sellFlowStep3Title, dict.sellFlowStep3Desc],
      [dict.sellFlowStep4Title, dict.sellFlowStep4Desc],
    ]
    return (
      <section>
        <h2 className="text-sm font-semibold mb-3">{dict.sellFlowTitle}</h2>
        <ol className="space-y-3">
          {steps.map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full border border-neutral-700 text-xs flex items-center justify-center text-neutral-400">{i + 1}</span>
              <div>
                <div className="text-sm font-medium">{t}</div>
                <div className="text-xs text-neutral-500 leading-relaxed">{d}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    )
  }
  const faqs: Array<[string, string]> = [
    [dict.sellFaq1Q, dict.sellFaq1A],
    [dict.sellFaq2Q, dict.sellFaq2A],
    [dict.sellFaq3Q, dict.sellFaq3A],
    [dict.sellFaq4Q, dict.sellFaq4A],
    [dict.sellFaq5Q, dict.sellFaq5A],
    [dict.sellFaq6Q, dict.sellFaq6A],
  ]
  return (
    <section>
      <h2 className="text-sm font-semibold mb-2">{dict.sellFaqTitle}</h2>
      <div className="divide-y divide-neutral-800 border-y border-neutral-800">
        {faqs.map(([q, a]) => (
          <details key={q} className="group py-3">
            <summary className="text-sm cursor-pointer list-none flex justify-between gap-2">
              <span>{q}</span><span className="text-neutral-600 group-open:hidden">+</span>
            </summary>
            <p className="text-xs text-neutral-500 mt-2 leading-relaxed">{a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

// 第一步：录入要出售的 TikTok 账号，校验后进入登记/引导评估
function UsernameGate({ dict }: { dict: Dict }) {
  const router = useRouter()
  const [value, setValue] = useState('')
  const clean = value.toLowerCase().replace(/^@/, '').trim()
  return (
    <form className="flex gap-3 max-w-lg" onSubmit={e => { e.preventDefault(); if (clean) router.push(`/sell?username=${encodeURIComponent(clean)}`) }}>
      <input value={value} onChange={e => setValue(e.target.value)} placeholder={dict.sellUsernamePlaceholder} required
        className="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-3 text-sm focus:border-[#00F2EA] outline-none" />
      <button type="submit" disabled={!clean}
        className="bg-[#00F2EA] hover:bg-[#00d9d2] disabled:opacity-50 text-black rounded-lg px-6 py-3 font-bold text-sm transition-colors whitespace-nowrap">
        {dict.sellCheck}
      </button>
    </form>
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

// Hero：价值主张 + 三个来自真实成交的数字；compact 时收窄为一行标题
function Hero({ dict, stats, children, compact }: { dict: Dict; stats: SellStats; children: React.ReactNode; compact?: boolean }) {
  const tiles: Array<[string, string]> = []
  if (stats.active) tiles.push([String(stats.active), dict.sellStatActive])
  if (stats.medianDiscountPct != null) tiles.push([`${stats.medianDiscountPct}%`, dict.sellStatDiscount])
  if (stats.medianDaysToSell != null) tiles.push([`${stats.medianDaysToSell}d`, dict.sellStatDays])
  if (stats.sold) tiles.push([String(stats.sold), dict.sellStatDeals])

  return (
    <main className="px-6 py-12 max-w-5xl mx-auto">
      {compact ? (
        <h1 className="text-3xl font-bold mb-8">{dict.listForSale}</h1>
      ) : (
        <>
          <h1 className="text-4xl font-bold mb-3 max-w-3xl leading-tight">{dict.sellHeroTitle}</h1>
          <p className="text-neutral-400 mb-6 max-w-2xl leading-relaxed">{dict.sellHeroSubtitle}</p>
          {tiles.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              {tiles.map(([v, l]) => (
                <div key={l} className="border border-neutral-800 rounded-xl px-4 py-3 bg-neutral-950">
                  <div className="text-xl font-bold">{v}</div>
                  <div className="text-[11px] text-neutral-500 leading-snug mt-0.5">{l}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {children}
    </main>
  )
}

export default function SellClient({ dict, stats }: { dict: Dict; stats: SellStats }) {
  return (
    <Suspense fallback={<Hero dict={dict} stats={stats}><p className="text-neutral-500">{dict.loading}</p></Hero>}>
      <SellForm dict={dict} stats={stats} />
    </Suspense>
  )
}
