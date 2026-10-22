'use client'

import { useEffect, useState } from 'react'
import {
  Gauge, DollarSign, Radar as RadarIcon, Layers, Wallet, Tag,
  Map, Users, TrendingUp, Briefcase, ShieldAlert, CalendarCheck,
  type LucideIcon,
} from 'lucide-react'
import { getSessionToken } from '@/lib/credits-client'

const NAV_ICONS: Record<string, LucideIcon> = {
  'verdict-hero': Gauge,
  'account-value': DollarSign,
  'dimension-radar': RadarIcon,
  'pillars': Layers,
  'income': Wallet,
  'deal-pricing': Tag,
  'revenue-roadmap': Map,
  'peer-ranking': Users,
  'growth-content': TrendingUp,
  'brand-commerce': Briefcase,
  'risk-health': ShieldAlert,
  'thirty-day-plan': CalendarCheck,
}

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

  // 桌面：小实心玫红按钮
  const sellButtonCard = sellEligible && username && sellLabel ? (
    <a href={`/sell?username=${encodeURIComponent(username)}`}
      className="flex items-center justify-center text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#FF0050] text-white hover:bg-[#e60049] transition-colors whitespace-nowrap shadow-sm shadow-[#FF0050]/25">
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
      {/* 桌面：左侧悬浮导航卡片 */}
      <nav aria-label="Report sections" className="hidden xl:block fixed left-6 top-24 z-30 w-56">
        <div className="rounded-2xl bg-white border border-[#ececf0] p-2.5 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.15)]">
          <p className="px-2.5 pt-1.5 pb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-[#9ca3af]">Report</p>
          <div className="flex flex-col gap-0.5">
            {items.map(item => {
              const isActive = active === item.id
              const Icon = NAV_ICONS[item.id]
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className={`relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all duration-150 ${
                    isActive
                      ? 'bg-[#1d4ed8]/[0.08] text-[#1d4ed8] font-medium'
                      : 'text-[#5b6470] hover:bg-[#f5f6f8] hover:text-[#111827]'
                  }`}
                >
                  <span className={`absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full transition-all ${
                    isActive ? 'bg-[#1d4ed8] opacity-100' : 'opacity-0'
                  }`} />
                  {Icon && <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-[#1d4ed8]' : 'text-[#9ca3af]'}`} strokeWidth={2} />}
                  <span className="truncate">{item.label}</span>
                </a>
              )
            })}
          </div>
          {sellButtonCard && (
            <div className="mt-2.5 pt-2.5 border-t border-[#f0f1f3]">
              {sellButtonCard}
            </div>
          )}
        </div>
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
