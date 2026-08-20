'use client'
import Link from 'next/link'
import React, { useEffect, useMemo, useState } from 'react'
import { DashboardShell } from '@/components/dashboard-v2/DashboardShell'
import { FilterChips, type Chip } from '@/components/dashboard-v2/reports/FilterChips'
import { ReportsTable, type ReportRow } from '@/components/dashboard-v2/reports/ReportsTable'
import { useDashboardData } from '@/components/dashboard/dashboard-data'
import { getSessionToken } from '@/lib/credits-client'
import { useRouter } from 'next/navigation'
import { trackEvent } from '@/lib/track-client'

const TIER_WORD: Record<string, string> = {
  S: 'Premium Value',
  A: 'Premium Value',
  B: 'Growth Value',
  C: 'Growth Value',
  D: 'Developing Value',
  E: 'Developing Value',
  F: 'Early Value',
}

const TIER_VARIANT: Record<string, ReportRow['tierVariant']> = {
  S: 'tier-premium',
  A: 'tier-premium',
  B: 'tier-growth',
  C: 'tier-growth',
  D: 'tier-developing',
  E: 'tier-developing',
  F: 'tier-early',
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

function fmtMoneyRange(low: number, high: number): string {
  const f = (v: number) => {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
    if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`
    return `$${v}`
  }
  return `${f(low)}–${f(high)}`
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return `Today · ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
    if (diffDays === 1) return 'Yesterday'
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

export default function DashboardReportsPage() {
  useEffect(() => {
    trackEvent('dashboard_viewed', { page: 'reports' })
  }, [])
  const router = useRouter()
  const data = useDashboardData()
  const balance = data.balance
  const latest = data.latest

  const email = balance?.email ?? ''
  const nickname = latest?.nickname ?? email.split('@')[0] ?? 'there'
  const user = { name: nickname, email }

  const [evaluations, setEvaluations] = useState<any[]>([])
  const [filter, setFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const token = getSessionToken()
    if (!token) return
    let alive = true
    fetch('/api/history', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
      .then(r => (r.status === 401 ? null : r.json().catch(() => null)))
      .then(d => {
        if (!alive) return
        const list = d?.evaluations ?? []
        setEvaluations(Array.isArray(list) ? list : [])
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const rows: ReportRow[] = useMemo(() => {
    return evaluations.map((e: any, idx: number) => {
      const isPaid = !(e.isFree ?? false)
      const teaserOnly = !isPaid
      const low = e.totalValue?.low ?? e.businessValueLow ?? 0
      const high = e.totalValue?.high ?? e.businessValueHigh ?? 0
      const mid = e.totalValue?.mid ?? e.businessValueMid ?? 0
      const t = e.tier ?? 'F'
      const followers = e.followerCount ?? 0
      const delta = e.previousReview?.businessValueMid
        ? {
            pct: Math.round(((mid - e.previousReview.businessValueMid) / Math.max(1, e.previousReview.businessValueMid)) * 1000) / 10,
            label: 'vs last',
          }
        : undefined
      return {
        id: e.id ?? `r-${idx}-${e.username}`,
        username: e.username ?? 'account',
        niche: e.personaType ?? e.categories?.[0] ?? undefined,
        followers,
        valueRange: fmtMoneyRange(low, high || mid || low || 100),
        tier: TIER_WORD[t] ?? t,
        tierVariant: TIER_VARIANT[t] ?? 'tier-early',
        dateLabel: e.computedAt ? fmtDate(e.computedAt) : 'Unknown',
        kindLabel: isPaid ? (e.creditUsed != null ? `Paid · ${e.creditUsed} credit used` : 'Paid') : 'Free · preview only',
        paid: isPaid,
        teaserOnly,
        delta,
        pdfAvailable: isPaid,
      }
    })
  }, [evaluations])

  const filteredRows = useMemo(() => {
    let list = rows
    if (filter === 'paid') list = list.filter(r => r.paid)
    else if (filter === 'free') list = list.filter(r => !r.paid)
    if (search.trim()) {
      const q = search.trim().toLowerCase().replace(/^@/, '')
      list = list.filter(r => r.username.toLowerCase().includes(q))
    }
    return list
  }, [rows, filter, search])

  const paidCount = rows.filter(r => r.paid).length
  const freeCount = rows.filter(r => !r.paid).length
  const uniqueAccounts = new Set(evaluations.map((e: any) => e.username)).size

  const chips: Chip[] = [
    { value: 'all', label: 'All', count: rows.length },
    { value: 'paid', label: 'Paid', count: paidCount },
    { value: 'free', label: 'Free', count: freeCount },
  ]

  function handleUnlock(id: string) {
    const row = rows.find(r => r.id === id)
    if (row) {
      router.push(`/evaluate/${encodeURIComponent(row.username)}`)
    }
  }

  return (
    <DashboardShell page="reports" user={user}>
      <div className="max-w-[860px] mx-auto">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <h2 className="text-[22px] font-semibold text-[#111827] leading-tight">Reports</h2>
            <p className="text-[13px] text-[#6b7280] mt-0.5">
              {evaluations.length} {evaluations.length === 1 ? 'evaluation' : 'evaluations'} · {uniqueAccounts} {uniqueAccounts === 1 ? 'account' : 'accounts'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="relative">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search username…"
                className="w-[180px] sm:w-[220px] px-3 py-[7px] text-[12px] border border-[#e5e7eb] bg-white text-[#111827] rounded-[7px] placeholder:text-[#9ca3af] focus:outline-none focus:border-[#1d4ed8]"
              />
            </div>
            <Link
              href="/"
              className="px-3.5 py-[7px] text-[12px] border border-[#1d4ed8] bg-[#1d4ed8] text-white rounded-[7px] font-medium hover:opacity-95"
            >
              Evaluate new
            </Link>
          </div>
        </div>

        <FilterChips chips={chips} value={filter} onChange={setFilter} />

        <ReportsTable rows={filteredRows} onUnlock={handleUnlock} />
      </div>
    </DashboardShell>
  )
}
