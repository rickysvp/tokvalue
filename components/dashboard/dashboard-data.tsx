'use client'

// ── Dashboard 数据 Provider（B5b）──
// 一次拉取 /api/history（Bearer，含 latest 增强字段）+ /api/credits/balance，
// 供 layout 的 Topbar 与各页面（Overview 等）共享，避免重复请求。
// 401 / 无 token → 引导回首页（不暴露付费数据）。

import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { CreditBalance } from '@/lib/credits'
import { fetchBalance, getSessionToken } from '@/lib/credits-client'
import type {
  CommercialSnapshot, DimensionScores, Evaluation, PillarBreakdown, ValuationV2,
} from '@/types'

/** /api/history 响应中的 latest：computed_at 最近一条评估的全量增强数据 */
export interface DashboardLatest {
  username: string
  nickname: string
  avatar: string | null
  computedAt: string
  score: number
  tier: string
  totalValue: { low: number; mid: number; high: number } | null
  valuationV2: ValuationV2 | null
  pillars: PillarBreakdown | null
  baselineReview: boolean | null
  previousReview: NonNullable<Evaluation['previousReview']> | null
  dimensions: DimensionScores | null
  primaryRateBlocker: CommercialSnapshot['primaryRateBlocker'] | null
}

export interface DashboardData {
  loading: boolean
  latest: DashboardLatest | null
  balance: CreditBalance | null
}

const DashboardDataContext = createContext<DashboardData>({
  loading: true,
  latest: null,
  balance: null,
})

export function DashboardDataProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [state, setState] = useState<DashboardData>({
    loading: true,
    latest: null,
    balance: null,
  })

  useEffect(() => {
    const token = getSessionToken()
    if (!token) {
      router.replace('/')
      return
    }
    let alive = true

    fetch('/api/history', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
      .then(res => {
        if (res.status === 401) {
          router.replace('/')
          return null
        }
        return res.json().catch(() => null)
      })
      .then(data => {
        if (!alive) return
        setState(s => ({ ...s, loading: false, latest: data?.latest ?? null }))
      })
      .catch(() => {
        if (alive) setState(s => ({ ...s, loading: false }))
      })

    fetchBalance()
      .then(balance => {
        if (alive) setState(s => ({ ...s, balance }))
      })
      .catch(() => {})

    return () => { alive = false }
  }, [router])

  return <DashboardDataContext.Provider value={state}>{children}</DashboardDataContext.Provider>
}

export function useDashboardData(): DashboardData {
  return useContext(DashboardDataContext)
}
