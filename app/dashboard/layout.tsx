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
          </div>
        </div>
      </div>
    </DashboardDataProvider>
  )
}
