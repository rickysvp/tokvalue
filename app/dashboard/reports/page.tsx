'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Ban, CalendarClock, Check, Clock, Copy, Download,
  Loader2, LogIn, Plus, Share2,
} from 'lucide-react'
import { tierColor } from '@/lib/tier'
import { valueTierOf } from '@/lib/pillar'
import { downloadPdf } from '@/lib/export-pdf'
import { getSessionToken, getActiveEmail } from '@/lib/credits-client'
import type { Evaluation } from '@/types'

interface HistoryItem {
  username: string
  nickname: string
  avatar: string | null
  tier: string
  score: number
  followerCount: number
  totalLikes: number
  videoCount: number
  region: string | null
  verified: boolean
  categories: string[]
  personaType: string | null
  businessValueHigh: number
  businessValueMid: number
  isFree: boolean
  computedAt: string
}

interface ShareRow {
  id: string
  createdAt: string
  expiresAt: string
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${Math.round(n).toLocaleString()}`
}

export default function ReportsPage() {
  const router = useRouter()
  const [items, setItems] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [authError, setAuthError] = useState(false)

  // ── Share 面板状态（按 username 分组）──
  const [openShareFor, setOpenShareFor] = useState<string | null>(null)
  const [shareLists, setShareLists] = useState<Record<string, ShareRow[]>>({})
  const [shareBusy, setShareBusy] = useState<string | null>(null) // `${username}:create` 或 share id
  const [shareError, setShareError] = useState<Record<string, string>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // ── PDF 下载状态 ──
  const [pdfBusy, setPdfBusy] = useState<string | null>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const pdfRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const storedEmail = getActiveEmail()
    const token = getSessionToken()

    if (!storedEmail || !token) {
      setAuthError(true)
      setLoading(false)
      return
    }
    setEmail(storedEmail)

    fetch('/api/history', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
      .then(r => {
        if (r.status === 401) { setAuthError(true); return null }
        return r.json()
      })
      .then(data => {
        if (data?.evaluations?.length) setItems(data.evaluations)
      })
      .catch(() => setAuthError(true))
      .finally(() => setLoading(false))
  }, [])

  // ── 未登录：引导回首页（不暴露付费数据）──
  if (authError) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="mb-8">
          <Link href="/"
            className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-[#FF0050] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Evaluation
          </Link>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-[#141414] p-12 text-center">
          <LogIn className="mx-auto h-10 w-10 text-neutral-600 mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Sign in to View Your Reports</h2>
          <p className="text-neutral-400 mb-6 max-w-md mx-auto leading-relaxed">
            Your evaluation reports are private. Verify your email to see all accounts you&apos;ve evaluated.
          </p>
          <button
            onClick={() => router.push('/')}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#FF0050] to-[#e60049] px-5 py-2.5 text-sm font-semibold text-white hover:from-[#e60049] hover:to-[#cc0040] transition-all shadow-lg shadow-[#FF0050]/25"
          >
            Back to Home <ArrowLeft className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  // ── 加载中 ──
  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="rounded-2xl border border-neutral-800 bg-[#141414] p-12 text-center">
          <Loader2 className="mx-auto h-10 w-10 text-neutral-600 mb-4 animate-spin" />
          <p className="text-neutral-400">Loading your reports...</p>
        </div>
      </div>
    )
  }

  // ── 分享链接管理 ──
  async function fetchShares(username: string) {
    const token = getSessionToken()
    if (!token) return
    const res = await fetch(`/api/share?username=${encodeURIComponent(username)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (!res.ok) {
      setShareError(prev => ({ ...prev, [username]: 'Failed to load share links. Please try again.' }))
      return
    }
    const data = await res.json().catch(() => null)
    setShareLists(prev => ({ ...prev, [username]: Array.isArray(data?.shares) ? data.shares : [] }))
  }

  function toggleShare(username: string) {
    if (openShareFor === username) {
      setOpenShareFor(null)
      return
    }
    setOpenShareFor(username)
    setShareError(prev => ({ ...prev, [username]: '' }))
    if (!shareLists[username]) fetchShares(username)
  }

  async function createShareLink(username: string) {
    const token = getSessionToken()
    if (!token) return
    setShareBusy(`${username}:create`)
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ username }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setShareError(prev => ({ ...prev, [username]: data.error || 'Failed to create share link.' }))
        return
      }
      setShareError(prev => ({ ...prev, [username]: '' }))
      await fetchShares(username)
    } catch {
      setShareError(prev => ({ ...prev, [username]: 'Failed to create share link.' }))
    } finally {
      setShareBusy(null)
    }
  }

  async function extendShareLink(username: string, id: string) {
    const token = getSessionToken()
    if (!token) return
    setShareBusy(id)
    try {
      const res = await fetch(`/api/share?id=${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'extend' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setShareError(prev => ({ ...prev, [username]: data.error || 'Failed to extend share link.' }))
        return
      }
      setShareError(prev => ({ ...prev, [username]: '' }))
      await fetchShares(username)
    } catch {
      setShareError(prev => ({ ...prev, [username]: 'Failed to extend share link.' }))
    } finally {
      setShareBusy(null)
    }
  }

  async function revokeShareLink(username: string, id: string) {
    const token = getSessionToken()
    if (!token) return
    setShareBusy(id)
    try {
      const res = await fetch(`/api/share?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setShareError(prev => ({ ...prev, [username]: data.error || 'Failed to revoke share link.' }))
        return
      }
      setShareError(prev => ({ ...prev, [username]: '' }))
      await fetchShares(username)
    } catch {
      setShareError(prev => ({ ...prev, [username]: 'Failed to revoke share link.' }))
    } finally {
      setShareBusy(null)
    }
  }

  async function copyShareLink(id: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/share/${id}`)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {}
  }

  // ── PDF 下载：POST /api/evaluate 命中 30 天付费缓存返回完整报告 → 复用 export-pdf 导出 ──
  async function downloadReportPdf(item: HistoryItem) {
    const token = getSessionToken()
    if (!token || !pdfRef.current) return
    setPdfBusy(item.username)
    setPdfError(null)
    try {
      const res = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ username: item.username }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.isFree === true || data.access_level !== 'full') {
        setPdfError(item.username)
        return
      }
      await downloadPdf(data as Evaluation, pdfRef.current)
    } catch {
      setPdfError(item.username)
    } finally {
      setPdfBusy(null)
    }
  }

  // ── 已登录：报告列表 ──
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      {/* PDF 导出用的隐藏挂载点（captureChartImages 找不到图表元素时降级为文字版） */}
      <div ref={pdfRef} className="hidden" aria-hidden="true" />

      <div className="mb-8">
        <Link href="/"
          className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-[#FF0050] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Evaluation
        </Link>
        <div className="mt-4">
          <h1 className="text-3xl font-bold">Reports</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {email} · {items.length} {items.length === 1 ? 'evaluation' : 'evaluations'}
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-neutral-800 bg-[#141414] p-12 text-center">
          <Clock className="mx-auto h-10 w-10 text-neutral-600 mb-4" />
          <p className="text-neutral-400">No evaluations yet.</p>
          <Link href="/" className="mt-4 inline-block text-[#FF0050] hover:underline">
            Evaluate your first account →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => {
            const canManage = !item.isFree
            const shares = shareLists[item.username]
            const isShareOpen = openShareFor === item.username
            return (
              <div
                key={item.username}
                className="rounded-2xl border border-neutral-800 bg-[#141414] p-5 transition-colors hover:border-[#00F2EA]/20"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    {item.avatar ? (
                      <Image
                        src={item.avatar}
                        alt={item.nickname}
                        width={48}
                        height={48}
                        className="h-12 w-12 rounded-full border border-neutral-700 object-cover"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-full bg-neutral-800 flex items-center justify-center font-bold">
                        {item.nickname.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="font-semibold">{item.nickname}</div>
                      <div className="text-sm text-neutral-500">@{item.username}</div>
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-neutral-500">
                        <CalendarClock className="h-3.5 w-3.5" />
                        {formatDate(item.computedAt)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold tabular-nums">{item.score}</div>
                    <div className="text-sm font-semibold" style={{ color: tierColor(item.tier) }}>
                      {valueTierOf(item.tier)}
                    </div>
                    <div className="mt-1 text-sm text-neutral-300">
                      {fmtUsd(item.businessValueMid)}
                      <span className="ml-1 text-xs text-neutral-500">est. value</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-neutral-800/70 pt-4">
                  {/* access 标识：免费 = Teaser；付费 = Full access */}
                  <span
                    className={`rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                      canManage
                        ? 'bg-[#00F2EA]/10 text-[#00F2EA]'
                        : 'bg-neutral-800 text-neutral-400'
                    }`}
                  >
                    {canManage ? 'Full access' : 'Free preview'}
                  </span>

                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <Link
                      href={`/evaluate/${encodeURIComponent(item.username)}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800"
                    >
                      View
                    </Link>
                    <button
                      onClick={() => canManage && toggleShare(item.username)}
                      disabled={!canManage}
                      title={canManage ? undefined : 'Sharing requires a paid evaluation'}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        canManage
                          ? 'border-neutral-700 text-neutral-300 hover:bg-neutral-800'
                          : 'cursor-not-allowed border-neutral-800 text-neutral-600'
                      }`}
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      Share
                    </button>
                    <button
                      onClick={() => canManage && downloadReportPdf(item)}
                      disabled={!canManage || pdfBusy === item.username}
                      title={canManage ? undefined : 'PDF export requires a paid evaluation'}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        canManage
                          ? 'border-neutral-700 text-neutral-300 hover:bg-neutral-800'
                          : 'cursor-not-allowed border-neutral-800 text-neutral-600'
                      }`}
                    >
                      {pdfBusy === item.username ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      Download PDF
                    </button>
                  </div>
                </div>

                {pdfError === item.username && (
                  <p className="mt-2 text-xs text-[#FF0050]">
                    Failed to generate PDF. Please try again.
                  </p>
                )}

                {/* ── Share 面板：活跃分享列表 + 创建/复制/延期/撤销 ── */}
                {isShareOpen && (
                  <div className="mt-4 rounded-xl border border-neutral-800 bg-[#0f0f0f] p-4">
                    <div className="mb-3 text-sm font-semibold text-white">Share links</div>
                    {shareError[item.username] && (
                      <p className="mb-3 text-xs text-[#FF0050]">{shareError[item.username]}</p>
                    )}

                    {shares === undefined ? (
                      <div className="flex items-center gap-2 text-sm text-neutral-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading share links...
                      </div>
                    ) : shares.length === 0 ? (
                      <div>
                        <p className="mb-3 text-sm text-neutral-500">
                          No active share links. Links are valid for 30 days.
                        </p>
                        <button
                          onClick={() => createShareLink(item.username)}
                          disabled={shareBusy === `${item.username}:create`}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#FF0050] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#e60049] disabled:opacity-50"
                        >
                          {shareBusy === `${item.username}:create` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Plus className="h-3.5 w-3.5" />
                          )}
                          Create share link
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {shares.map(share => (
                          <div
                            key={share.id}
                            className="rounded-lg border border-neutral-800 bg-[#141414] p-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="truncate font-mono text-xs text-neutral-400">
                                /share/{share.id}
                              </span>
                              <span className="text-xs text-neutral-500">
                                Expires {formatDate(share.expiresAt)}
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <button
                                onClick={() => copyShareLink(share.id)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 px-2.5 py-1 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800"
                              >
                                {copiedId === share.id ? (
                                  <>
                                    <Check className="h-3 w-3 text-[#22c55e]" />
                                    Copied
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3 w-3" />
                                    Copy link
                                  </>
                                )}
                              </button>
                              <button
                                onClick={() => extendShareLink(item.username, share.id)}
                                disabled={shareBusy === share.id}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 px-2.5 py-1 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800 disabled:opacity-50"
                              >
                                {shareBusy === share.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <CalendarClock className="h-3 w-3" />
                                )}
                                Extend 30 days
                              </button>
                              <button
                                onClick={() => revokeShareLink(item.username, share.id)}
                                disabled={shareBusy === share.id}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-[#FF0050]/40 px-2.5 py-1 text-xs font-medium text-[#FF0050] transition-colors hover:bg-[#FF0050]/10 disabled:opacity-50"
                              >
                                <Ban className="h-3 w-3" />
                                Revoke
                              </button>
                            </div>
                          </div>
                        ))}
                        <button
                          onClick={() => createShareLink(item.username)}
                          disabled={shareBusy === `${item.username}:create`}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#00F2EA] transition-colors hover:underline disabled:opacity-50"
                        >
                          {shareBusy === `${item.username}:create` ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Plus className="h-3 w-3" />
                          )}
                          Create another link
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
