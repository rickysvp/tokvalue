'use client'

import { useEffect, useState } from 'react'
import { getSessionToken } from '@/lib/credits-client'

/**
 * 报告锚点导航：桌面左侧竖排固定，移动端顶部 sticky 横滚 pill 条。
 * IntersectionObserver 高亮当前 section；点击原生锚点平滑滚动
 * （globals.css scroll-behavior: smooth + 各 section scroll-mt 偏移）。
 * 传入 username 时，eligibility 通过（已付费完整报告）才显示 "List for Sale" 入口。
 */
export function ReportNav({ items, username, sellLabel }: { items: { id: string; label: string }[]; username?: string; sellLabel?: string }) {
  const [active, setActive] = useState<string | null>(null)
  const [sellEligible, setSellEligible] = useState(false)

  useEffect(() => {
    if (!username || !sellLabel) return
    const token = getSessionToken()
    if (!token) return
    let cancelled = false
    fetch(`/api/marketplace/eligibility?username=${encodeURIComponent(username)}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (!cancelled) setSellEligible(!!d.eligible) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [username, sellLabel])

  // 桌面：小 outline 按钮，对齐 Sidebar 极简风
  const sellButtonCard = sellEligible && username && sellLabel ? (
    <a href={`/sell?username=${encodeURIComponent(username)}`}
      className="inline-flex items-center text-xs font-medium px-2.5 py-1.5 rounded-md border border-[#FF0050]/30 text-[#FF0050] hover:bg-[#FF0050]/5 transition-colors whitespace-nowrap">
      {sellLabel}
    </a>
  ) : null

  // 移动端横滚条内：outline 小胶囊
  const sellButtonPill = sellEligible && username && sellLabel ? (
    <a href={`/sell?username=${encodeURIComponent(username)}`}
      className="shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold border border-[#FF0050] text-[#FF0050] bg-white">
      {sellLabel}
    </a>
  ) : null

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id)
        }
      },
      { rootMargin: '-40% 0px -55% 0px' },
    )
    for (const { id } of items) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [items])

  return (
    <>
      {/* 桌面：左侧竖排固定，对齐 dashboard-v2 Sidebar 风格（无卡片/无阴影） */}
      <nav aria-label="Report sections" className="hidden xl:block fixed left-6 top-24 z-30 w-44">
        <p className="px-2.5 mb-2 text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">Report</p>
        <div className="flex flex-col gap-0.5 text-[13px]">
          {items.map(item => {
            const isActive = active === item.id
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={`px-2.5 py-1.5 rounded-md transition-colors ${
                  isActive
                    ? 'bg-[#1d4ed810] text-[#1d4ed8] font-medium'
                    : 'text-[#6b7280] hover:bg-[#f0f1f3] hover:text-[#111827]'
                }`}
              >
                {item.label}
              </a>
            )
          })}
        </div>
        {sellButtonCard && (
          <div className="mt-3 pt-3 border-t border-[#e5e7eb]">
            {sellButtonCard}
          </div>
        )}
      </nav>

      {/* 移动：顶部 sticky 横滚 pill 条 */}
      <nav
        aria-label="Report sections"
        className="sticky top-14 z-30 -mx-4 flex gap-2 overflow-x-auto bg-[#F7F8FA]/95 px-4 py-2 backdrop-blur xl:hidden"
      >
        {items.map(item => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              active === item.id
                ? 'bg-[#1d4ed8] text-white'
                : 'border border-[#E5E7EB] bg-white text-[#6B7280] hover:text-[#111827]'
            }`}
          >
            {item.label}
          </a>
        ))}
        {sellButtonPill}
      </nav>
    </>
  )
}
