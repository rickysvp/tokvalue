'use client'

// ── B6：Growth Plan 页（Spec §9）──
// 读 URL ?username=（无参回 /dashboard）；Bearer 拉 /api/growth-plan。
// 402 → 付费墙引导（解锁报告，链到 /evaluate/{username}）；
// limitedData → 顶部 Spec §9 原文提示；任务卡见 GrowthTaskCard。

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight, Lock, Loader2, Target } from 'lucide-react'
import { TIER_COLORS } from '@/lib/tier'
import { getSessionToken } from '@/lib/credits-client'
import { trackEvent } from '@/lib/track-client'
import { GrowthTaskCard } from '@/components/dashboard/GrowthTaskCard'
import { useDashboardData } from '@/components/dashboard/dashboard-data'
import type { GrowthTask } from '@/types'

interface GrowthPlanData {
  tasks: GrowthTask[]
  completedKeys: string[]
  limitedData: boolean
}

type PageState =
  | { kind: 'loading' }
  | { kind: 'paywall' }
  | { kind: 'error' }
  | { kind: 'ready'; data: GrowthPlanData }

function GrowthPlanContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // 集成修复：无 ?username= 参数时回退到最近评估账号（导航直链可达）；两者皆无才回 Overview
  const { latest, loading: ctxLoading } = useDashboardData()
  const username = searchParams.get('username')?.trim().replace(/^@/, '') || latest?.username || ''
  const [state, setState] = useState<PageState>({ kind: 'loading' })
  const [completedKeys, setCompletedKeys] = useState<string[]>([])

  useEffect(() => {
    // 无 username 且 context 仍在加载 → 等待（可能是 latest 回填）；确认无账号才回 Overview
    if (!username) {
      if (!ctxLoading) router.replace('/dashboard')
      return
    }

    const token = getSessionToken()
    if (!token) {
      router.replace('/')
      return
    }

    let alive = true
    fetch(`/api/growth-plan?username=${encodeURIComponent(username)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
      .then(res => {
        if (res.status === 401) {
          router.replace('/')
          return null
        }
        if (res.status === 402) {
          if (alive) setState({ kind: 'paywall' })
          return null
        }
        if (!res.ok) {
          if (alive) setState({ kind: 'error' })
          return null
        }
        return res.json().catch(() => null)
      })
      .then((data: GrowthPlanData | null) => {
        if (!alive || !data || !Array.isArray(data.tasks)) return
        setCompletedKeys(Array.isArray(data.completedKeys) ? data.completedKeys : [])
        setState({ kind: 'ready', data })
        // B7 Spec §15：growth plan 拉取成功曝光
        trackEvent('growth_plan_viewed', { username })
      })
      .catch(() => {
        if (alive) setState({ kind: 'error' })
      })

    return () => { alive = false }
  }, [username, ctxLoading, router])

  // ── 完成任务：POST /api/growth-tasks/{key}/complete（幂等）；成功后本地置完成态 ──
  const handleComplete = useCallback(
    async (task: GrowthTask) => {
      const token = getSessionToken()
      if (!token) throw new Error('no session')
      const res = await fetch(
        `/api/growth-tasks/${encodeURIComponent(task.key)}/complete?username=${encodeURIComponent(username)}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        },
      )
      if (!res.ok) throw new Error('complete failed')
      // B7 Spec §15：任务完成成功（complete API 200 后）
      trackEvent('growth_task_completed', { task_key: task.key, username })
      setCompletedKeys(prev => (prev.includes(task.key) ? prev : [...prev, task.key]))
    },
    [username],
  )

  if (state.kind === 'loading') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: TIER_COLORS.B }} />
      </div>
    )
  }

  // ── 402 付费墙：引导解锁完整报告 ──
  if (state.kind === 'paywall') {
    return (
      <div className="mx-auto max-w-2xl py-8">
        <div className="rounded-2xl border border-neutral-800 bg-[#141414] p-10 text-center">
          <div
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
            style={{ backgroundColor: 'rgba(255, 0, 80, 0.1)' }}
          >
            <Lock className="h-6 w-6" style={{ color: TIER_COLORS.S }} />
          </div>
          <h1 className="text-xl font-bold text-white">Your Growth Plan is part of the full report</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-neutral-400">
            You are viewing a free preview for <span className="font-semibold text-neutral-200">@{username}</span>.
            Unlock the full report to get your personalized, data-backed growth tasks — each with evidence from
            your own videos and a pillar it will move.
          </p>
          <Link
            href={`/evaluate/${encodeURIComponent(username)}`}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#FF0050] to-[#e60049] px-5 py-2.5 text-sm font-semibold text-white transition-all shadow-lg shadow-[#FF0050]/25 hover:from-[#e60049] hover:to-[#cc0040]"
          >
            Unlock the full report
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="mx-auto max-w-2xl py-8">
        <div className="rounded-2xl border border-neutral-800 bg-[#141414] p-10 text-center">
          <p className="text-neutral-400">Failed to load your growth plan. Please try again.</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg border border-neutral-700 px-4 py-2 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const { tasks, limitedData } = state.data
  const done = tasks.filter(t => completedKeys.includes(t.key)).length

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Growth Plan</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Personalized tasks for <span className="text-neutral-300">@{username}</span>
          {tasks.length > 0 && (
            <>
              {' '}· {done}/{tasks.length} completed
            </>
          )}
        </p>
      </div>

      {/* Spec §9 数据不足提示（原文） */}
      {limitedData && (
        <p
          className="mb-4 rounded-xl border px-4 py-3 text-sm leading-relaxed"
          style={{
            borderColor: 'rgba(249, 115, 22, 0.35)',
            backgroundColor: 'rgba(249, 115, 22, 0.08)',
            color: TIER_COLORS.D,
          }}
        >
          Suggestions are based on your public content. Limited data may reduce recommendation quality.
        </p>
      )}

      {tasks.length === 0 ? (
        <div className="rounded-2xl border border-neutral-800 bg-[#141414] p-10 text-center">
          <Target className="mx-auto h-10 w-10 text-neutral-600 mb-4" style={{ color: TIER_COLORS.B }} />
          <p className="font-semibold text-white">No growth tasks right now</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-neutral-400">
            All your pillars are in good shape — keep it up. Update your account after your next videos to get
            fresh, data-backed tasks.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {tasks.map(task => (
            <GrowthTaskCard
              key={task.key}
              task={task}
              completed={completedKeys.includes(task.key)}
              onComplete={handleComplete}
              username={username}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function GrowthPlanPage() {
  // useSearchParams 需要 Suspense 边界（Next.js 15 预渲染要求）
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: TIER_COLORS.B }} />
        </div>
      }
    >
      <GrowthPlanContent />
    </Suspense>
  )
}
