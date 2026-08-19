'use client'

// ── Overview 空态（B5b，Spec §6）──
// 无历史评估 → 引导输入框发起首次评估。
// 复用首页承接路径：router.push(`/evaluate/${handle}`)（首页表单同款跳转）。

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { TIER_COLORS } from '@/lib/tier'
import { withAlpha } from './shared'

export function EmptyOverview() {
  const router = useRouter()
  const [handle, setHandle] = useState('')
  const pink = TIER_COLORS.S
  const cyan = TIER_COLORS.B

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const target = handle.trim().replace(/^@/, '')
    if (!target) return
    router.push(`/evaluate/${encodeURIComponent(target)}`)
  }

  return (
    <section className="rounded-2xl border border-neutral-800 bg-[#141414] p-10 text-center sm:p-14">
      <div
        className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ backgroundColor: withAlpha(cyan, 0.1), color: cyan }}
      >
        <Search className="h-7 w-7" />
      </div>
      <h2 className="text-xl font-semibold text-white">Run your first evaluation</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-neutral-400">
        Enter a TikTok handle to see your commercial value range, six-pillar scorecard, and this
        week&apos;s focus — all in one dashboard.
      </p>
      <form onSubmit={onSubmit} className="mx-auto mt-6 flex max-w-md items-center rounded-2xl border border-neutral-700 bg-neutral-900/80 px-4 py-3 transition-colors focus-within:border-neutral-500">
        <span className="mr-3 text-lg text-neutral-500">@</span>
        <input
          type="text"
          value={handle}
          onChange={e => setHandle(e.target.value)}
          placeholder="your TikTok handle"
          aria-label="TikTok handle"
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-neutral-600"
        />
        <button
          type="submit"
          className="ml-3 shrink-0 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110"
          style={{ backgroundColor: pink, boxShadow: `0 10px 15px -3px ${withAlpha(pink, 0.25)}` }}
        >
          Evaluate
        </button>
      </form>
    </section>
  )
}
