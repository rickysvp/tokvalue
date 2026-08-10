'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Clock, Loader2, LogIn } from 'lucide-react'
import { tierColor } from '@/lib/tier'
import { getSessionToken, getActiveEmail, setActiveEmail, setSessionToken } from '@/lib/credits-client'

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
  computedAt: string
}

export default function HistoryPage() {
  const router = useRouter()
  const [items, setItems] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [authError, setAuthError] = useState(false)

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

  // ── 未登录：引导注册/登录 ──
  if (authError) {
    return (
      <main className="min-h-screen mx-auto max-w-4xl px-4 py-12">
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
          <h2 className="text-xl font-semibold text-white mb-2">Sign in to View Your History</h2>
          <p className="text-neutral-400 mb-6 max-w-md mx-auto leading-relaxed">
            Your evaluation history is private. Verify your email to see all accounts you&apos;ve evaluated.
          </p>
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
          <Link href="/"
            className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-[#FF0050] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Evaluation
          </Link>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-[#141414] p-12 text-center">
          <Loader2 className="mx-auto h-10 w-10 text-neutral-600 mb-4 animate-spin" />
          <p className="text-neutral-400">Loading your history...</p>
        </div>
      </main>
    )
  }

  // ── 已登录：用户专属历史 ──
  return (
    <main className="min-h-screen mx-auto max-w-4xl px-4 py-12">
      <div className="mb-8">
        <Link href="/"
          className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-[#FF0050] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Evaluation
        </Link>
        <div className="flex items-center justify-between mt-4">
          <div>
            <h1 className="text-3xl font-bold">Your History</h1>
            <p className="mt-1 text-sm text-neutral-500">
              {email} · {items.length} evaluations
            </p>
          </div>
          <button
            onClick={() => {
              setActiveEmail(null)
              setSessionToken(null)
              router.push('/')
            }}
            className="text-xs text-neutral-500 hover:text-[#FF0050] transition-colors"
          >
            Switch account
          </button>
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
          {items.map(item => (
            <Link
              key={item.username}
              href={`/?u=${item.username}`}
              className="flex items-center justify-between rounded-2xl border border-neutral-800 bg-[#141414] p-5 hover:border-[#00F2EA]/20 transition-colors"
            >
              <div className="flex items-center gap-4">
                {item.avatar ? (
                  <Image src={item.avatar} alt={item.nickname} width={48} height={48} className="h-12 w-12 rounded-full border border-neutral-700 object-cover" />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-neutral-800 flex items-center justify-center font-bold">
                    {item.nickname.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="font-semibold">{item.nickname}</div>
                  <div className="text-sm text-neutral-500">@{item.username}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold tabular-nums">{item.score}</div>
                <div
                  className="text-sm font-semibold"
                  style={{ color: tierColor(item.tier) }}
                >
                  Tier {item.tier}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
