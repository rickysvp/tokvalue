import React from 'react'
import { Sidebar } from './Sidebar'

export type DashboardPageKey = 'home' | 'growth' | 'reports' | 'profile'

export function DashboardShell({
  page, children, user
}: {
  page: DashboardPageKey
  children: React.ReactNode
  user?: { name: string; email: string }
}) {
  return (
    <div className="min-h-screen bg-[#f7f8fa] text-[#111827]">
      <div className="max-w-[1280px] mx-auto px-4 pt-6 pb-16 flex gap-6 lg:gap-8">
        <Sidebar current={page} user={user} />
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  )
}
