'use client'
import Link from 'next/link'
import React from 'react'

type Key = 'home' | 'growth' | 'reports' | 'profile'
const NAV: { key: Key; label: string; href: string }[] = [
  { key: 'home', label: 'Home', href: '/dashboard' },
  { key: 'growth', label: 'Growth', href: '/dashboard/growth' },
  { key: 'reports', label: 'Reports', href: '/dashboard/reports' },
  { key: 'profile', label: 'Profile', href: '/dashboard/profile' },
]

export function Sidebar({ current, user }: { current: Key; user?: { name: string; email: string; avatarInitial?: string } }) {
  return (
    <>
      <aside data-testid="sidebar-desktop" className="hidden lg:flex w-[200px] flex-shrink-0 flex-col pr-4 border-r border-[#e5e7eb] min-h-[calc(100vh-64px)]">
        <div className="text-[13px] font-semibold text-[#111827] mb-4">TokValue</div>
        <nav className="flex flex-col gap-0.5 text-[13px]">
          {NAV.map(n => {
            const active = n.key === current
            return (
              <Link key={n.key} href={n.href}
                className={`px-2.5 py-1.5 rounded-md ${active ? 'bg-[#1d4ed810] text-[#1d4ed8] font-medium' : 'text-[#6b7280] hover:text-[#111827]'}`}
              >
                {n.label}
              </Link>
            )
          })}
        </nav>
        {user && (
          <div className="mt-auto pt-4 border-t border-[#e5e7eb]">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-[#1d4ed8] text-white text-[11px] font-semibold flex items-center justify-center">
                {user.avatarInitial || user.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-[12px] font-medium text-[#111827] truncate">{user.name}</div>
                <div className="text-[11px] text-[#6b7280] truncate">{user.email}</div>
              </div>
            </div>
          </div>
        )}
      </aside>

      <nav data-testid="sidebar-mobile" className="lg:hidden -mx-4 mb-4 px-4 overflow-x-auto">
        <div className="flex gap-2 pb-1">
          {NAV.map(n => {
            const active = n.key === current
            return (
              <Link key={n.key} href={n.href}
                className={`whitespace-nowrap text-[12px] px-3 py-1.5 rounded-full border ${active ? 'border-[#1d4ed8] bg-[#1d4ed8] text-white font-medium' : 'border-[#e5e7eb] bg-white text-[#6b7280]'}`}
              >
                {n.label}
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
