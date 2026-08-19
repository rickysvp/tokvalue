'use client'

// ── Update my account 按钮（B5b）──
// 常态：跳 /evaluate/{username} 发起重评；最近评估在 24h 内（Spec D5 同一用户-账号冷却）
// → 禁用态显示 "Next review available in {x}h" + "Weekly reviews keep your value current."
// Topbar 与额度卡共用。

import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import { TIER_COLORS } from '@/lib/tier'
import { withAlpha, reviewCooldown } from './shared'
import type { DashboardLatest } from './dashboard-data'

export function UpdateAccountButton({ latest, size = 'md' }: { latest: DashboardLatest | null; size?: 'md' | 'sm' }) {
  const { inCooldown, hoursLeft } = reviewCooldown(latest?.computedAt)
  const pink = TIER_COLORS.S
  const href = latest ? `/evaluate/${encodeURIComponent(latest.username)}` : '/'
  const label = latest ? 'Update my account' : 'Evaluate an account'

  if (inCooldown) {
    return (
      <div className="flex flex-col items-start sm:items-end">
        <button
          type="button"
          disabled
          aria-disabled="true"
          className={`inline-flex cursor-not-allowed items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900 font-semibold text-neutral-400 ${
            size === 'sm' ? 'px-3.5 py-2 text-xs' : 'px-4 py-2 text-sm'
          }`}
        >
          <RefreshCw className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
          Next review available in {hoursLeft}h
        </button>
        <p className="mt-1 text-[10px] text-neutral-500">Weekly reviews keep your value current.</p>
      </div>
    )
  }

  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 rounded-xl font-semibold text-white shadow-lg transition-all hover:brightness-110 ${
        size === 'sm' ? 'px-3.5 py-2 text-xs' : 'px-4 py-2 text-sm'
      }`}
      style={{ backgroundColor: pink, boxShadow: `0 10px 15px -3px ${withAlpha(pink, 0.25)}` }}
    >
      <RefreshCw className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      {label}
    </Link>
  )
}
