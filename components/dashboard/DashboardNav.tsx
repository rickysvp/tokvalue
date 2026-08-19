'use client'

// ── Dashboard 导航（B5b，Spec §6 IA）──
// Overview / Growth Plan / Reports / Tools / Settings
// 桌面：左侧固定侧边栏；移动：Topbar 下方横向标签。Growth Plan 路由由后续工作流填充。

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, TrendingUp, FileText, Wrench, Settings } from 'lucide-react'
import { TIER_COLORS } from '@/lib/tier'
import { withAlpha } from './shared'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/growth-plan', label: 'Growth Plan', icon: TrendingUp },
  { href: '/dashboard/reports', label: 'Reports', icon: FileText },
  { href: '/dashboard/tools', label: 'Tools', icon: Wrench },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

function useActiveHref(): (href: string, exact?: boolean) => boolean {
  const pathname = usePathname()
  return (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
}

/** 桌面侧边栏（lg+ 显示） */
export function DashboardNavSidebar() {
  const isActive = useActiveHref()
  const accent = TIER_COLORS.B

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-neutral-800 bg-[#0a0a0a] lg:flex">
      <div className="px-5 py-5">
        <Link href="/" className="block" aria-label="TokValue home">
          <Image src="/tokvalue.png" alt="TokValue" width={160} height={40} className="h-9 w-auto object-contain" />
        </Link>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
          const active = isActive(href, exact)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                active ? 'bg-neutral-900 text-white' : 'text-neutral-400 hover:bg-neutral-900/60 hover:text-white'
              }`}
              style={active ? { boxShadow: `inset 2px 0 0 0 ${accent}` } : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" style={active ? { color: accent } : undefined} />
              {label}
            </Link>
          )
        })}
      </nav>
      <p className="px-5 pb-5 text-[10px] text-neutral-600">
        Estimates are directional — not a guaranteed sale price.
      </p>
    </aside>
  )
}

/** 移动端横向导航（lg 以下显示，置于 Topbar 下方） */
export function DashboardNavMobile() {
  const isActive = useActiveHref()
  const accent = TIER_COLORS.B

  return (
    <nav className="flex gap-2 overflow-x-auto border-b border-neutral-800 bg-[#0a0a0a] px-4 py-2 lg:hidden" aria-label="Dashboard sections">
      {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
        const active = isActive(href, exact)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              active ? 'text-white' : 'border-neutral-800 text-neutral-400 hover:text-white'
            }`}
            style={active ? { borderColor: accent, backgroundColor: withAlpha(accent, 0.08) } : undefined}
          >
            <Icon className="h-3.5 w-3.5" style={active ? { color: accent } : undefined} />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
