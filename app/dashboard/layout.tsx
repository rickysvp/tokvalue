'use client'

// ── Dashboard 布局（B5b，Spec §6）──
// client component 鉴权门：无 getSessionToken()（客户端 session，lib/credits-client）
// → router.replace('/') 回首页（不暴露付费数据）。
// 结构：桌面侧边导航 + 全局 Topbar + 移动端横向导航 + 页面内容。
// 导航：Overview / Growth Plan（后续工作流填充路由）/ Reports / Tools / Settings。

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { TIER_COLORS } from '@/lib/tier'
import { getSessionToken } from '@/lib/credits-client'
import { DashboardDataProvider } from '@/components/dashboard/dashboard-data'
import { DashboardNavSidebar, DashboardNavMobile } from '@/components/dashboard/DashboardNav'
import { Topbar } from '@/components/dashboard/Topbar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    // 客户端 session 门：无 token → 回首页（鉴权期不渲染任何付费内容）
    if (!getSessionToken()) {
      router.replace('/')
      return
    }
    setAuthed(true)
  }, [router])

  if (!authed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: TIER_COLORS.S }} />
      </div>
    )
  }

  return (
    <DashboardDataProvider>
      <div className="min-h-screen bg-[#0a0a0a]">
        <div className="lg:flex">
          <DashboardNavSidebar />
          <div className="min-w-0 flex-1">
            <Topbar />
            <DashboardNavMobile />
            <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
            {/* B7 合规：dashboard 全路由数据来源声明（与 SiteFooter 底栏一致） */}
            <footer className="border-t border-neutral-900 px-4 py-4 text-center text-[11px] text-neutral-600 sm:px-6 lg:px-8">
              <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-center gap-2">
                <span>TikTok® is a registered trademark of ByteDance Ltd.</span>
                <span className="hidden text-neutral-800 sm:inline">·</span>
                <span>Data sourced from public third-party APIs — estimates are not financial advice.</span>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </DashboardDataProvider>
  )
}
